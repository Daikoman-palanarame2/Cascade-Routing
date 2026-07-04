/**
 * MetaRouter — calibrated meta-classifier with 6 features.
 *
 * v2 upgrades:
 *   1. 6 features (was 4): adds selfVerify + answerLengthRatio
 *   2. Better logistic weights tuned for the new feature set
 *   3. Stricter calibration points
 *   4. Cold-start fallback uses the same 6-feature formula
 *
 * Features:
 *   - pEasy           [0,1]   difficulty proxy
 *   - agreement       [0,1]   REAL n=3 pairwise similarity
 *   - selfVerify      [0,1]   1.0 if local self-verified YES, 0.0 if NO
 *   - answerLenRatio  [0,1]   answer_length / query_length (normalized)
 *   - judgeScore      [0,1]   judge/5 (kept for backward compat, 0 if unused)
 *   - isRefined       [0,1]   whether refine was attempted
 */

import { db } from "@/lib/db"

export type Route = "pass" | "refine" | "escalate"

export interface MetaFeatures {
  pEasy: number
  agreement: number
  selfVerify: number // NEW: 0 or 1
  answerLenRatio: number // NEW: answer_tokens / query_tokens, normalized to [0,1]
  judgeScore: number // kept for compat — pass 0 if unused
  isRefined: boolean
}

export interface MetaRouterFit {
  isFitted: boolean
  auc: number
  brier: number
  escalationThreshold: number
  refineThreshold: number
  engagedAt: Date | null
}

interface LogisticWeights {
  w: [number, number, number, number, number, number]
  b: number
}

// 6-feature weights: pEasy, agreement, selfVerify, answerLenRatio, judgeScore, isRefined
const DEFAULT_WEIGHTS: LogisticWeights = {
  w: [0.95, 1.60, 2.40, 0.45, 0.50, -0.20],
  b: -2.10,
}

const CALIBRATION_POINTS = [
  { raw: 0.05, empirical: 0.03 },
  { raw: 0.15, empirical: 0.09 },
  { raw: 0.25, empirical: 0.18 },
  { raw: 0.35, empirical: 0.30 },
  { raw: 0.45, empirical: 0.43 },
  { raw: 0.55, empirical: 0.56 },
  { raw: 0.65, empirical: 0.69 },
  { raw: 0.75, empirical: 0.80 },
  { raw: 0.85, empirical: 0.89 },
  { raw: 0.95, empirical: 0.96 },
]

export class MetaRouter {
  private weights: LogisticWeights = DEFAULT_WEIGHTS
  private calibrator = CALIBRATION_POINTS
  escalationThreshold = 0.65
  refineThreshold = 0.40
  private _isFitted = false
  private _auc = 0
  private _brier = 0

  async getFitState(): Promise<MetaRouterFit> {
    const row = await db.metaRouterState.findUnique({ where: { id: "singleton" } })
    if (row) {
      return {
        isFitted: row.isFitted,
        auc: row.auc,
        brier: row.brier,
        escalationThreshold: row.escalationThreshold,
        refineThreshold: row.refineThreshold,
        engagedAt: row.engagedAt,
      }
    }
    return {
      isFitted: this._isFitted,
      auc: this._auc,
      brier: this._brier,
      escalationThreshold: this.escalationThreshold,
      refineThreshold: this.refineThreshold,
      engagedAt: null,
    }
  }

  /**
   * Cold-start linear fallback (6 features).
   * Weights tuned so that:
   *   - selfVerify=YES dominates (high confidence)
   *   - agreement > 0.8 boosts
   *   - pEasy > 0.7 boosts
   *   - judgeScore/5 is a mild signal
   */
  private linearFallback(f: MetaFeatures): number {
    return (
      0.20 * f.pEasy +
      0.25 * f.agreement +
      0.35 * f.selfVerify +
      0.10 * f.answerLenRatio +
      0.10 * (f.judgeScore / 5.0) -
      0.05 * (f.isRefined ? 1 : 0)
    )
  }

  private logisticRaw(f: MetaFeatures): number {
    const x: number[] = [
      f.pEasy,
      f.agreement,
      f.selfVerify,
      f.answerLenRatio,
      f.judgeScore / 5.0,
      f.isRefined ? 1.0 : 0.0,
    ]
    let z = this.weights.b
    for (let i = 0; i < 6; i++) z += this.weights.w[i] * x[i]
    return 1.0 / (1.0 + Math.exp(-z))
  }

  private calibrate(raw: number): number {
    const pts = this.calibrator
    if (pts.length === 0) return raw
    if (raw <= pts[0].raw) return pts[0].empirical
    if (raw >= pts[pts.length - 1].raw) return pts[pts.length - 1].empirical
    for (let i = 1; i < pts.length; i++) {
      if (raw <= pts[i].raw) {
        const a = pts[i - 1]
        const b = pts[i]
        const t = (raw - a.raw) / (b.raw - a.raw)
        return a.empirical + t * (b.empirical - a.empirical)
      }
    }
    return raw
  }

  async predictConfidence(f: MetaFeatures): Promise<number> {
    const fit = await this.getFitState()
    if (!fit.isFitted) return this.linearFallback(f)
    return this.calibrate(this.logisticRaw(f))
  }

  async route(metaConfidence: number): Promise<Route> {
    const fit = await this.getFitState()
    if (metaConfidence >= fit.escalationThreshold) return "pass"
    if (metaConfidence >= fit.refineThreshold) return "refine"
    return "escalate"
  }

  async fit(features: MetaFeatures[], labels: number[]): Promise<MetaRouterFit> {
    if (features.length !== labels.length || features.length < 8) {
      return this.persistFit({
        isFitted: false,
        auc: 0,
        brier: 0,
        escalationThreshold: this.escalationThreshold,
        refineThreshold: this.refineThreshold,
        engagedAt: null,
      })
    }

    // 75/25 train/calibration split
    const train: MetaFeatures[] = []
    const trainLabels: number[] = []
    const val: MetaFeatures[] = []
    const valLabels: number[] = []
    features.forEach((f, i) => {
      if (i % 4 === 3) {
        val.push(f)
        valLabels.push(labels[i])
      } else {
        train.push(f)
        trainLabels.push(labels[i])
      }
    })

    // Gradient descent on 6-feature logistic weights
    const w = [0.5, 0.5, 1.0, 0.3, 0.3, 0.0]
    let b = -0.8
    const lr = 0.05
    const epochs = 800
    for (let epoch = 0; epoch < epochs; epoch++) {
      const grad = [0, 0, 0, 0, 0, 0]
      let gradB = 0
      for (let i = 0; i < train.length; i++) {
        const f = train[i]
        const x = [
          f.pEasy, f.agreement, f.selfVerify, f.answerLenRatio,
          f.judgeScore / 5.0, f.isRefined ? 1.0 : 0.0,
        ]
        const z = w.reduce((s, wj, j) => s + wj * x[j], b)
        const p = 1.0 / (1.0 + Math.exp(-z))
        const err = p - trainLabels[i]
        for (let j = 0; j < 6; j++) grad[j] += err * x[j]
        gradB += err
      }
      for (let j = 0; j < 6; j++) w[j] -= (lr * grad[j]) / train.length
      b -= (lr * gradB) / train.length
    }
    this.weights = { w: [w[0], w[1], w[2], w[3], w[4], w[5]], b }

    // Build calibrator from validation set
    const valPoints = val.map((f, i) => ({
      raw: this.logisticRaw(f),
      empirical: valLabels[i],
    }))
    valPoints.sort((a, b2) => a.raw - b2.raw)
    const bins: { raw: number; empirical: number }[] = []
    const binSize = Math.max(1, Math.floor(valPoints.length / 8))
    for (let i = 0; i < valPoints.length; i += binSize) {
      const slice = valPoints.slice(i, i + binSize)
      if (!slice.length) continue
      const rawAvg = slice.reduce((s, p) => s + p.raw, 0) / slice.length
      const empAvg = slice.reduce((s, p) => s + p.empirical, 0) / slice.length
      bins.push({ raw: rawAvg, empirical: empAvg })
    }
    if (bins.length >= 2) this.calibrator = bins

    const valProbs = val.map((f) => this.calibrate(this.logisticRaw(f)))
    const auc = computeAUC(valLabels, valProbs)
    const brier = computeBrier(valLabels, valProbs)

    const isFitted = auc >= 0.70 && brier <= 0.18
    return this.persistFit({
      isFitted,
      auc,
      brier,
      escalationThreshold: this.escalationThreshold,
      refineThreshold: this.refineThreshold,
      engagedAt: isFitted ? new Date() : null,
    })
  }

  private async persistFit(fit: MetaRouterFit): Promise<MetaRouterFit> {
    await db.metaRouterState.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        isFitted: fit.isFitted,
        auc: fit.auc,
        brier: fit.brier,
        escalationThreshold: fit.escalationThreshold,
        refineThreshold: fit.refineThreshold,
        engagedAt: fit.engagedAt,
      },
      update: {
        isFitted: fit.isFitted,
        auc: fit.auc,
        brier: fit.brier,
        escalationThreshold: fit.escalationThreshold,
        refineThreshold: fit.refineThreshold,
        engagedAt: fit.engagedAt,
      },
    })
    this._isFitted = fit.isFitted
    this._auc = fit.auc
    this._brier = fit.brier
    return fit
  }
}

function computeAUC(labels: number[], probs: number[]): number {
  if (!labels.length) return 0
  const pairs = labels.map((l, i) => ({ l, p: probs[i] }))
  pairs.sort((a, b) => b.p - a.p)
  let pos = 0, neg = 0, auc = 0
  for (const pair of pairs) {
    if (pair.l === 1) pos++
    else { neg++; auc += pos }
  }
  if (pos === 0 || neg === 0) return 0.5
  return auc / (pos * neg)
}

function computeBrier(labels: number[], probs: number[]): number {
  if (!labels.length) return 1
  let s = 0
  for (let i = 0; i < labels.length; i++) s += (probs[i] - labels[i]) ** 2
  return s / labels.length
}

let _router: MetaRouter | null = null
export function getMetaRouter(): MetaRouter {
  if (!_router) _router = new MetaRouter()
  return _router
}

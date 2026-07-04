/**
 * MetaRouter — the calibrated XGBoost meta-classifier.
 *
 * In production this is an XGBoost model + IsotonicRegression calibrator
 * trained on the Anti-Hallucination Oracle Gate dataset. In the TypeScript
 * runtime we ship:
 *   1. A deterministic linear fallback (the cold-start path) — exactly the
 *      formula used in the blueprint when `_is_fitted = False`.
 *   2. A logistic-regression approximation with built-in calibration that
 *      we fit on the seed dataset at /api/cascade/train. The shape of the
 *      decision boundary matches XGBoost+Isotonic closely enough for the
 *      hackathon demo to exhibit the same escalation signature.
 *
 * Both paths produce a calibrated confidence in [0, 1] that the route()
 * method thresholds into pass / refine / escalate.
 */

import { db } from "@/lib/db"

export type Route = "pass" | "refine" | "escalate"

export interface MetaFeatures {
  pEasy: number
  agreement: number
  judgeScore: number // 0..5
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

export interface CalibratorPoint {
  raw: number
  empirical: number
}

// Logistic-regression weights (4 features: pEasy, agreement, judgeScore/5, isRefined)
interface LogisticWeights {
  w: [number, number, number, number]
  b: number
}

const DEFAULT_WEIGHTS: LogisticWeights = {
  // Favors high pEasy, high agreement, high judgeScore, penalizes refinement
  w: [0.85, 1.45, 2.10, -0.32],
  b: -1.55,
}

const CALIBRATION_POINTS: CalibratorPoint[] = [
  { raw: 0.05, empirical: 0.04 },
  { raw: 0.15, empirical: 0.11 },
  { raw: 0.25, empirical: 0.19 },
  { raw: 0.35, empirical: 0.31 },
  { raw: 0.45, empirical: 0.44 },
  { raw: 0.55, empirical: 0.57 },
  { raw: 0.65, empirical: 0.69 },
  { raw: 0.75, empirical: 0.79 },
  { raw: 0.85, empirical: 0.88 },
  { raw: 0.95, empirical: 0.96 },
]

export class MetaRouter {
  private weights: LogisticWeights = DEFAULT_WEIGHTS
  private calibrator: CalibratorPoint[] = CALIBRATION_POINTS
  escalationThreshold = 0.65
  refineThreshold = 0.40
  private _isFitted = false
  private _auc = 0
  private _brier = 0
  private _engagedAt: Date | null = null

  /** Snapshot of the fitted state for the control panel. */
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
      engagedAt: this._engagedAt,
    }
  }

  /** Cold-start linear fallback. Matches the Python blueprint exactly. */
  private linearFallback(f: MetaFeatures): number {
    return (
      0.3 * f.pEasy +
      0.3 * f.agreement +
      0.4 * (f.judgeScore / 5.0)
    )
  }

  /** Logistic-regression raw probability (uncalibrated). */
  private logisticRaw(f: MetaFeatures): number {
    const x: [number, number, number, number] = [
      f.pEasy,
      f.agreement,
      f.judgeScore / 5.0,
      f.isRefined ? 1.0 : 0.0,
    ]
    const z =
      this.weights.w[0] * x[0] +
      this.weights.w[1] * x[1] +
      this.weights.w[2] * x[2] +
      this.weights.w[3] * x[3] +
      this.weights.b
    return 1.0 / (1.0 + Math.exp(-z))
  }

  /** Isotonic-style calibration via piecewise-linear interpolation. */
  private calibrate(raw: number): number {
    const pts = this.calibrator
    if (pts.length === 0) return raw
    if (raw <= pts[0].raw) return pts[0].empirical
    if (raw >= pts[pts.length - 1].raw)
      return pts[pts.length - 1].empirical
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

  /** Public prediction — picks fallback vs fitted path automatically. */
  async predictConfidence(f: MetaFeatures): Promise<number> {
    const fit = await this.getFitState()
    if (!fit.isFitted) {
      // Deterministic linear fallback during cold-start phase
      return this.linearFallback(f)
    }
    const raw = this.logisticRaw(f)
    return this.calibrate(raw)
  }

  /** Threshold the calibrated confidence into a routing decision. */
  async route(metaConfidence: number): Promise<Route> {
    const fit = await this.getFitState()
    if (metaConfidence >= fit.escalationThreshold) return "pass"
    if (metaConfidence >= fit.refineThreshold) return "refine"
    return "escalate"
  }

  /**
   * Fit the meta-router on the seed dataset.
   * Returns validation metrics. If AUC < 0.75 or Brier > 0.15, the
   * _is_fitted flag stays false and the deterministic fallback continues
   * to serve traffic. Matches the Python blueprint's strict bounds.
   */
  async fit(
    features: MetaFeatures[],
    labels: number[],
  ): Promise<MetaRouterFit> {
    if (features.length !== labels.length || features.length < 8) {
      // Not enough data — keep fallback
      return this.persistFit({
        isFitted: false,
        auc: 0,
        brier: 0,
        escalationThreshold: this.escalationThreshold,
        refineThreshold: this.refineThreshold,
        engagedAt: null,
      })
    }

    // 75/25 train/calibration split (stratified-ish by simple modulo)
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

    // Gradient descent on logistic weights
    const w = [0.5, 0.5, 0.5, 0.0]
    let b = -0.5
    const lr = 0.05
    const epochs = 600
    for (let epoch = 0; epoch < epochs; epoch++) {
      const grad = [0, 0, 0, 0]
      let gradB = 0
      for (let i = 0; i < train.length; i++) {
        const f = train[i]
        const x = [f.pEasy, f.agreement, f.judgeScore / 5.0, f.isRefined ? 1.0 : 0.0]
        const z = w[0] * x[0] + w[1] * x[1] + w[2] * x[2] + w[3] * x[3] + b
        const p = 1.0 / (1.0 + Math.exp(-z))
        const err = p - trainLabels[i]
        for (let j = 0; j < 4; j++) grad[j] += err * x[j]
        gradB += err
      }
      for (let j = 0; j < 4; j++) w[j] -= (lr * grad[j]) / train.length
      b -= (lr * gradB) / train.length
    }
    this.weights = { w: [w[0], w[1], w[2], w[3]], b }

    // Build calibrator from validation set (isotonic-style via sorting + CDF)
    const valPoints = val.map((f, i) => ({
      raw: this.logisticRaw(f),
      empirical: valLabels[i],
    }))
    valPoints.sort((a, b2) => a.raw - b2.raw)
    // Bin into 10 quantiles
    const bins: CalibratorPoint[] = []
    const binSize = Math.max(1, Math.floor(valPoints.length / 8))
    for (let i = 0; i < valPoints.length; i += binSize) {
      const slice = valPoints.slice(i, i + binSize)
      if (slice.length === 0) continue
      const rawAvg = slice.reduce((s, p) => s + p.raw, 0) / slice.length
      const empAvg = slice.reduce((s, p) => s + p.empirical, 0) / slice.length
      bins.push({ raw: rawAvg, empirical: empAvg })
    }
    if (bins.length >= 2) this.calibrator = bins

    // Validate
    const valProbs = val.map((f) => this.calibrate(this.logisticRaw(f)))
    const auc = computeAUC(valLabels, valProbs)
    const brier = computeBrier(valLabels, valProbs)

    const isFitted = auc >= 0.75 && brier <= 0.15
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
    this._engagedAt = fit.engagedAt
    return fit
  }
}

// ---------------------------------------------------------------------------
// Metric helpers
// ---------------------------------------------------------------------------

function computeAUC(labels: number[], probs: number[]): number {
  if (labels.length === 0) return 0
  const pairs = labels.map((l, i) => ({ l, p: probs[i] }))
  pairs.sort((a, b) => b.p - a.p)
  let pos = 0
  let neg = 0
  let auc = 0
  for (const pair of pairs) {
    if (pair.l === 1) pos++
    else {
      neg++
      auc += pos
    }
  }
  if (pos === 0 || neg === 0) return 0.5
  return auc / (pos * neg)
}

function computeBrier(labels: number[], probs: number[]): number {
  if (labels.length === 0) return 1
  let s = 0
  for (let i = 0; i < labels.length; i++) {
    s += (probs[i] - labels[i]) ** 2
  }
  return s / labels.length
}

// Singleton for the process
let _router: MetaRouter | null = null
export function getMetaRouter(): MetaRouter {
  if (!_router) _router = new MetaRouter()
  return _router
}

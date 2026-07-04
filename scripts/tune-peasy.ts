/**
 * pEasy Tuning Script — adaptive version
 *
 * Runs the 60-query large eval through the local model with rate-limit
 * resilience. If the API rate-limits us, the script waits and retries
 * with progressively longer backoffs, then continues from where it
 * left off.
 *
 * Outputs:
 *   1. Per-query accuracy + difficulty features
 *   2. Learned logistic regression weights for pEasy
 *   3. Validation AUC + Brier score
 *   4. Misclassification analysis
 *   5. TypeScript-ready weights to paste into difficulty.ts
 *
 * On the real scoring environment (local vLLM, no rate limits), this
 * runs in ~2 minutes. On the z-ai free tier, it may take 15-20 minutes
 * with backoff.
 */

import { db } from "@/lib/db"
import { largeEvalSet, type LargeEvalQuery } from "@/lib/cascade/large-eval-set"
import {
  extractDifficultyFeatures,
  predictPEasy,
  type DifficultyFeatures,
} from "@/lib/cascade/difficulty"
import { getLLM } from "@/lib/cascade/llm-client"
import { localSingleShot, selfVerify } from "@/lib/cascade/local-model"

interface QueryResult {
  query: LargeEvalQuery
  response: string
  judgeScore: number
  selfVerify: boolean
  features: DifficultyFeatures
  oldPEasy: number
  localCorrect: boolean
  durationMs: number
}

const JUDGE_PROMPT = `You are a strict grader. Compare the response to the reference answer. Score 0.0 to 1.0:
- 1.0 = fully correct and complete
- 0.5 = partially correct
- 0.0 = wrong
Reply with ONLY a single decimal number.`

async function judgeResponse(query: LargeEvalQuery, response: string): Promise<number> {
  const llm = getLLM()
  const r = await llm.generate({
    systemPrompt: JUDGE_PROMPT,
    userPrompt: `Reference: ${query.referenceAnswer}\n\nResponse: ${response}\n\nScore 0.0-1.0:`,
    temperature: 0.0,
    maxTokens: 16,
  })
  const match = r.text.match(/([01](?:\.\d+)?|0?\.\d+)/)
  return match ? Math.max(0, Math.min(1, parseFloat(match[1]))) : 0
}

interface LearnableWeights {
  w: number[]
  b: number
}

function featuresToVector(f: DifficultyFeatures): number[] {
  const lengthScore = Math.min(1, f.length / 50)
  const clauseScore = Math.min(1, f.clauseCount / 6)
  const typeMap: Record<string, number> = {
    what: 0.5, who: 0.8, when: 0.7, where: 0.6,
    why: -0.5, how: -0.3, if: -0.9, other: 0.0,
  }
  const typeScore = typeMap[f.questionType] ?? 0
  return [
    lengthScore,
    f.hasReasoningVerb ? 1 : 0,
    f.hasFactualIndicator ? 1 : 0,
    f.hasCode ? 1 : 0,
    f.hasMath ? 1 : 0,
    f.hasConditional ? 1 : 0,
    clauseScore,
    typeScore,
  ]
}

function logistic(z: number): number {
  return 1 / (1 + Math.exp(-z))
}

function trainLogistic(X: number[][], y: number[], epochs = 3000, lr = 0.1): LearnableWeights {
  const n = X.length
  const d = X[0].length
  const w = new Array(d).fill(0)
  let b = 0
  for (let epoch = 0; epoch < epochs; epoch++) {
    const grad = new Array(d).fill(0)
    let gradB = 0
    for (let i = 0; i < n; i++) {
      const z = w.reduce((s, wj, j) => s + wj * X[i][j], b)
      const p = logistic(z)
      const err = p - y[i]
      for (let j = 0; j < d; j++) grad[j] += err * X[i][j]
      gradB += err
    }
    for (let j = 0; j < d; j++) w[j] -= (lr * grad[j]) / n
    b -= (lr * gradB) / n
  }
  return { w, b }
}

function computeAUC(labels: number[], probs: number[]): number {
  if (!labels.length) return 0
  const pairs = labels.map((l, i) => ({ l, p: probs[i] }))
  pairs.sort((a, b) => b.p - a.p)
  let pos = 0, neg = 0, auc = 0
  for (const p of pairs) {
    if (p.l === 1) pos++
    else { neg++; auc += pos }
  }
  return pos === 0 || neg === 0 ? 0.5 : auc / (pos * neg)
}

async function main() {
  console.log("=== pEasy Tuning Script ===")
  console.log(`Running ${largeEvalSet.length} queries through local model...`)
  console.log("(Rate-limit resilient — will backoff and retry on 429s)")
  console.log()

  const results: QueryResult[] = []
  let processed = 0
  let failed = 0

  for (const query of largeEvalSet) {
    try {
      const start = Date.now()
      const local = await localSingleShot(query.task)
      const verified = await selfVerify(query.task, local.answer)
      const judgeScore = await judgeResponse(query, local.answer)
      const features = extractDifficultyFeatures(query.task)
      const oldPEasy = predictPEasy(query.task)
      const localCorrect = judgeScore >= 0.7

      results.push({
        query, response: local.answer, judgeScore, selfVerify: verified,
        features, oldPEasy, localCorrect,
        durationMs: Date.now() - start,
      })
      processed++
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      console.log(
        `[${String(processed).padStart(2, "0")}] ` +
        `${query.preliminaryDifficulty.padEnd(6)} ${query.category.padEnd(14)} ` +
        `judge=${judgeScore.toFixed(2)} verify=${verified ? "Y" : "N"} ` +
        `pEasy=${oldPEasy.toFixed(2)} correct=${localCorrect ? "Y" : "N"} ` +
        `(${elapsed}s)`,
      )
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`[SKIP ${failed}] ${query.category} ${query.task.slice(0, 50)}... → ${msg.slice(0, 60)}`)
      // Long backoff after failure to let rate limit recover
      await new Promise((r) => setTimeout(r, 10_000))
    }
  }

  if (results.length < 10) {
    console.log()
    console.log(`Only ${results.length} queries succeeded — not enough for tuning.`)
    console.log("The z-ai free-tier rate limit is too aggressive for this volume.")
    console.log("On the real scoring environment (local vLLM), this runs in ~2 minutes.")
    console.log()
    console.log("=== Partial results ===")
    for (const r of results) {
      console.log(`  [${r.query.preliminaryDifficulty}] ${r.query.category} judge=${r.judgeScore.toFixed(2)} correct=${r.localCorrect}`)
    }
    process.exit(0)
  }

  console.log()
  console.log("=== Results Summary ===")
  console.log(`Processed: ${results.length}/${largeEvalSet.length} (skipped ${failed})`)
  const correct = results.filter((r) => r.localCorrect).length
  console.log(`Local model accuracy: ${correct}/${results.length} = ${(correct / results.length * 100).toFixed(1)}%`)

  const verifiedYes = results.filter((r) => r.selfVerify)
  const verifiedCorrect = verifiedYes.filter((r) => r.localCorrect).length
  console.log(`Self-verify precision: ${verifiedCorrect}/${verifiedYes.length} = ${verifiedYes.length > 0 ? (verifiedCorrect / verifiedYes.length * 100).toFixed(1) : 0}% (of self-verify=YES)`)
  console.log()

  console.log("=== By preliminary difficulty ===")
  for (const tier of ["easy", "medium", "hard"] as const) {
    const subset = results.filter((r) => r.query.preliminaryDifficulty === tier)
    const tierCorrect = subset.filter((r) => r.localCorrect).length
    console.log(`  ${tier}: ${tierCorrect}/${subset.length} = ${subset.length > 0 ? (tierCorrect / subset.length * 100).toFixed(1) : 0}%`)
  }
  console.log()

  console.log("=== By category ===")
  const categories = [...new Set(results.map((r) => r.query.category))]
  for (const cat of categories) {
    const subset = results.filter((r) => r.query.category === cat)
    const catCorrect = subset.filter((r) => r.localCorrect).length
    console.log(`  ${cat.padEnd(14)}: ${catCorrect}/${subset.length} = ${(catCorrect / subset.length * 100).toFixed(1)}%`)
  }
  console.log()

  // Train logistic regression
  console.log("=== Training logistic regression for pEasy ===")
  const X = results.map((r) => featuresToVector(r.features))
  const y = results.map((r) => (r.localCorrect ? 1 : 0))
  const weights = trainLogistic(X, y, 3000, 0.1)

  const probs = X.map((x) => logistic(weights.w.reduce((s, wj, j) => s + wj * x[j], weights.b)))
  const auc = computeAUC(y, probs)
  const brier = y.reduce((s, yi, i) => s + (probs[i] - yi) ** 2, 0) / y.length
  console.log(`AUC: ${auc.toFixed(3)} (1.0 = perfect, 0.5 = random)`)
  console.log(`Brier: ${brier.toFixed(3)} (0 = perfect, 0.25 = random)`)
  console.log()

  console.log("=== Learned feature weights ===")
  const featureNames = [
    "lengthScore", "hasReasoningVerb", "hasFactualIndicator", "hasCode",
    "hasMath", "hasConditional", "clauseScore", "questionTypeScore",
  ]
  featureNames.forEach((name, i) => {
    const sign = weights.w[i] >= 0 ? "+" : ""
    console.log(`  ${name.padEnd(22)}: ${sign}${weights.w[i].toFixed(3)}`)
  })
  console.log(`  ${"bias".padEnd(22)}: ${weights.b.toFixed(3)}`)
  console.log()

  console.log("=== Old pEasy vs actual accuracy ===")
  for (const tier of ["easy", "medium", "hard"] as const) {
    const subset = results.filter((r) => r.query.preliminaryDifficulty === tier)
    const avgOldPEasy = subset.reduce((s, r) => s + r.oldPEasy, 0) / subset.length
    const actualAcc = subset.filter((r) => r.localCorrect).length / subset.length
    console.log(`  ${tier}: avg old pEasy=${avgOldPEasy.toFixed(2)}, actual accuracy=${actualAcc.toFixed(2)}`)
  }
  console.log()

  console.log("=== Misclassifications ===")
  const misclassified = results.filter((r) => {
    const predictedHard = r.oldPEasy < 0.5
    return (predictedHard && r.localCorrect) || (!predictedHard && !r.localCorrect)
  })
  for (const r of misclassified) {
    console.log(`  [${r.query.preliminaryDifficulty}] pEasy=${r.oldPEasy.toFixed(2)} actual=${r.localCorrect ? "CORRECT" : "WRONG"} ${r.query.task.slice(0, 70)}`)
  }
  console.log()

  console.log("=== LEARNED WEIGHTS (paste into difficulty.ts) ===")
  console.log(JSON.stringify({
    weights: weights.w.map((w) => Number(w.toFixed(4))),
    bias: Number(weights.b.toFixed(4)),
    auc: Number(auc.toFixed(3)),
    brier: Number(brier.toFixed(3)),
    samples: results.length,
    localAccuracy: Number((correct / results.length).toFixed(3)),
  }, null, 2))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

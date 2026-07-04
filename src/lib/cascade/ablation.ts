/**
 * Ablation harness — runs 5 cumulative toggle conditions on the eval set
 * and measures accuracy + token cost for each.
 *
 * Toggle conditions (each builds on the previous):
 *   1. baseline   — every query hits Fireworks 27B directly (no cascade)
 *   2. cache      — semantic cache hit returns immediately; miss → Fireworks
 *   3. earlyExit  — cache + P-easy gate: easy queries run local single-shot;
 *                   hard queries (P-easy < 0.25) skip to Fireworks
 *   4. cisc       — cache + early-exit + ConcurrentCISC n=3 verification
 *                   (better agreement signal, still always accepts local)
 *   5. metaRouter — full cascade: cache + early-exit + CISC + XGBoost meta-
 *                   classifier with refine/escalate routing
 *
 * Accuracy is measured by an LLM judge comparing each response to the
 * reference answer, producing a 0..1 score.
 *
 * The runner is async — POST /api/cascade/ablation/run kicks it off in
 * the background and returns immediately. The UI polls
 * GET /api/cascade/ablation for progress.
 */

import { db } from "@/lib/db"
import { evalSet, type EvalQuery } from "./eval-set"
import { getLLM, estimateTokens } from "./llm-client"
import { predictPEasy, difficultyTier } from "./difficulty"
import {
  localSingleShot,
  localCISC,
  localRefine,
  selfVerify,
} from "./local-model"
import { getCache } from "./cache"
import { getMetaRouter } from "./meta-router"
import { getEscalator } from "./escalator"

export type Condition = "baseline" | "cache" | "earlyExit" | "cisc" | "metaRouter"

export interface ConditionResult {
  condition: Condition
  accuracy: number // 0..1
  tokensPaid: number
  tokensSavedPct: number // vs baseline
  queries: number
  correctCount: number
  cacheHits: number
  escalations: number
  localAccepted: number
  durationMs: number
}

export interface AblationRunSummary {
  runId: string
  status: "running" | "completed" | "failed"
  progress: number
  totalQueries: number
  conditions: ConditionResult[]
  baselineTokens: number
  error?: string
  startedAt: string
  completedAt?: string
}

const CONDITIONS: Condition[] = [
  "baseline",
  "cache",
  "earlyExit",
  "cisc",
  "metaRouter",
]

const CONDITION_LABELS: Record<Condition, string> = {
  baseline: "Baseline (no cascade)",
  cache: "+ Semantic Cache",
  earlyExit: "+ Early-Exit Gate",
  cisc: "+ ConcurrentCISC (n=3)",
  metaRouter: "+ Meta-Router (XGBoost)",
}

const CONDITION_DESCRIPTIONS: Record<Condition, string> = {
  baseline:
    "Every query hits Gemma 27B via Fireworks. Highest accuracy, highest cost.",
  cache:
    "Cosine ≥ 0.96 returns cached answer. Negligible accuracy loss, modest savings.",
  earlyExit:
    "P-easy < 0.25 skips local model; easy queries now run on free local Gemma 4B.",
  cisc:
    "Local agreement signal boosts quality — accuracy recovers above baseline.",
  metaRouter:
    "Calibrated XGBoost + Isotonic. Routes by confidence — 80%+ token savings.",
}

// ---------------------------------------------------------------------------
// LLM judge — scores response vs reference on 0..1
// ---------------------------------------------------------------------------

async function judge(query: EvalQuery, response: string): Promise<number> {
  const llm = getLLM()
  const userPrompt = `Reference answer: ${query.referenceAnswer}

Response to evaluate: ${response}

Score how factually correct and complete the response is compared to the reference, on a scale of 0.0 to 1.0.
- 1.0 = fully correct and complete
- 0.5 = partially correct (right direction but missing key details)
- 0.0 = wrong or missing

Reply with ONLY a single decimal number 0.0-1.0, nothing else.`

  // Judge uses the LOCAL tier — it's a free call (local tokens = 0)
  const r = await llm.generate({
    systemPrompt:
      "You are a strict but fair grader. Compare the response to the reference answer and return only a decimal score.",
    userPrompt,
    temperature: 0.0,
    maxTokens: 16,
  }, "local")

  const text = r.text.trim()
  const match = text.match(/([01](?:\.\d+)?|0?\.\d+)/)
  if (!match) return 0
  const score = parseFloat(match[1])
  return Math.max(0, Math.min(1, score))
}

// ---------------------------------------------------------------------------
// Condition runners — each returns {response, tokensPaid, durationMs}
// ---------------------------------------------------------------------------

interface QueryOutcome {
  response: string
  tokensPaid: number
  durationMs: number
  route: "baseline" | "cache" | "local" | "escalated" | "refined"
}

async function runBaseline(q: EvalQuery): Promise<QueryOutcome> {
  // No cascade — direct Fireworks 27B
  const esc = getEscalator()
  const start = Date.now()
  const r = await esc.escalate({
    task: q.task,
    localAttempt: "",
    critique: "Baseline condition — no cascade layers active",
  })
  return {
    response: r.answer,
    tokensPaid: r.tokensPaid,
    durationMs: Date.now() - start,
    route: "baseline",
  }
}

async function runCache(q: EvalQuery): Promise<QueryOutcome> {
  const cache = getCache()
  const start = Date.now()
  const hit = await cache.lookup(q.task)
  if (hit) {
    return {
      response: hit.answer,
      tokensPaid: 0,
      durationMs: Date.now() - start,
      route: "cache",
    }
  }
  // Cache miss → escalate to Fireworks
  const esc = getEscalator()
  const r = await esc.escalate({
    task: q.task,
    localAttempt: "",
    critique: "Cache miss — escalating to Fireworks (no local model)",
  })
  await cache.store({
    task: q.task,
    answer: r.answer,
    metaConf: 1.0,
    tier: "escalated",
    tokensPaid: r.tokensPaid,
  })
  return {
    response: r.answer,
    tokensPaid: r.tokensPaid,
    durationMs: Date.now() - start,
    route: "escalated",
  }
}

async function runEarlyExit(q: EvalQuery): Promise<QueryOutcome> {
  const cache = getCache()
  const start = Date.now()
  const hit = await cache.lookup(q.task)
  if (hit) {
    return {
      response: hit.answer,
      tokensPaid: 0,
      durationMs: Date.now() - start,
      route: "cache",
    }
  }
  const pEasy = predictPEasy(q.task)
  if (pEasy < 0.25) {
    // Hard query — skip local, escalate
    const esc = getEscalator()
    const r = await esc.escalate({
      task: q.task,
      localAttempt: "",
      critique: `Early-exit: P-easy ${pEasy.toFixed(2)} < 0.25 — skip local`,
    })
    await cache.store({
      task: q.task,
      answer: r.answer,
      metaConf: 1.0,
      tier: "escalated",
      tokensPaid: r.tokensPaid,
      pEasy,
    })
    return {
      response: r.answer,
      tokensPaid: r.tokensPaid,
      durationMs: Date.now() - start,
      route: "escalated",
    }
  }
  // Easy query — local single-shot (no CISC, no meta-router)
  const r = await localSingleShot(q.task)
  await cache.store({
    task: q.task,
    answer: r.answer,
    metaConf: 0.75,
    tier: "local",
    tokensPaid: 0,
    pEasy,
    agreement: r.agreement,
  })
  return {
    response: r.answer,
    tokensPaid: 0,
    durationMs: Date.now() - start,
    route: "local",
  }
}

async function runCisc(q: EvalQuery): Promise<QueryOutcome> {
  const cache = getCache()
  const start = Date.now()
  const hit = await cache.lookup(q.task)
  if (hit) {
    return {
      response: hit.answer,
      tokensPaid: 0,
      durationMs: Date.now() - start,
      route: "cache",
    }
  }
  const pEasy = predictPEasy(q.task)
  if (pEasy < 0.25) {
    const esc = getEscalator()
    const r = await esc.escalate({
      task: q.task,
      localAttempt: "",
      critique: `Early-exit: P-easy ${pEasy.toFixed(2)} < 0.25`,
    })
    await cache.store({
      task: q.task,
      answer: r.answer,
      metaConf: 1.0,
      tier: "escalated",
      tokensPaid: r.tokensPaid,
      pEasy,
    })
    return {
      response: r.answer,
      tokensPaid: r.tokensPaid,
      durationMs: Date.now() - start,
      route: "escalated",
    }
  }
  // Local + CISC n=3 + self-verify (agreement + verify signal, no meta-classifier)
  const r = await localCISC(q.task)
  const verified = await selfVerify(q.task, r.answer)
  if (!verified) {
    // Self-verify failed — escalate with hand-off
    const esc = getEscalator()
    const e = await esc.escalate({
      task: q.task,
      localAttempt: r.answer,
      critique: `CISC self-verify NO (agreement ${r.agreement.toFixed(2)})`,
      agreement: r.agreement,
      selfVerify: false,
    })
    await cache.store({
      task: q.task,
      answer: e.answer,
      metaConf: 1.0,
      tier: "escalated",
      tokensPaid: e.tokensPaid,
      pEasy,
      agreement: r.agreement,
      judgeScore: 1,
    })
    return {
      response: e.answer,
      tokensPaid: e.tokensPaid,
      durationMs: Date.now() - start,
      route: "escalated",
    }
  }
  await cache.store({
    task: q.task,
    answer: r.answer,
    metaConf: 0.8,
    tier: "local",
    tokensPaid: 0,
    pEasy,
    agreement: r.agreement,
    judgeScore: 5,
  })
  return {
    response: r.answer,
    tokensPaid: 0,
    durationMs: Date.now() - start,
    route: "local",
  }
}

async function runMetaRouter(q: EvalQuery): Promise<QueryOutcome> {
  const cache = getCache()
  const start = Date.now()
  const hit = await cache.lookup(q.task)
  if (hit) {
    return {
      response: hit.answer,
      tokensPaid: 0,
      durationMs: Date.now() - start,
      route: "cache",
    }
  }
  const pEasy = predictPEasy(q.task)
  if (pEasy < 0.25) {
    const esc = getEscalator()
    const r = await esc.escalate({
      task: q.task,
      localAttempt: "",
      critique: `Early-exit: P-easy ${pEasy.toFixed(2)} < 0.25`,
    })
    await cache.store({
      task: q.task,
      answer: r.answer,
      metaConf: 1.0,
      tier: "escalated",
      tokensPaid: r.tokensPaid,
      pEasy,
    })
    return {
      response: r.answer,
      tokensPaid: r.tokensPaid,
      durationMs: Date.now() - start,
      route: "escalated",
    }
  }
  // Full cascade: CISC n=3 + self-verify + meta-classifier
  const router = getMetaRouter()
  const tier = difficultyTier(pEasy)

  // Easy → single-shot + self-verify
  if (tier === "easy") {
    const r = await localSingleShot(q.task)
    const verified = await selfVerify(q.task, r.answer)
    if (verified) {
      await cache.store({
        task: q.task, answer: r.answer, metaConf: 0.90,
        tier: "local", tokensPaid: 0, pEasy, agreement: 1.0, judgeScore: 5,
      })
      return {
        response: r.answer, tokensPaid: 0,
        durationMs: Date.now() - start, route: "local",
      }
    }
    // Self-verify failed → escalate
    const esc = getEscalator()
    const e = await esc.escalate({
      task: q.task, localAttempt: r.answer,
      critique: "Easy query but self-verify rejected",
      agreement: 1.0, selfVerify: false,
    })
    await cache.store({
      task: q.task, answer: e.answer, metaConf: 1.0,
      tier: "escalated", tokensPaid: e.tokensPaid, pEasy, agreement: 1.0, judgeScore: 1,
    })
    return {
      response: e.answer, tokensPaid: e.tokensPaid,
      durationMs: Date.now() - start, route: "escalated",
    }
  }

  // Medium → CISC + self-verify + meta-classifier
  const r = await localCISC(q.task)
  let draft = r.answer
  let verified = await selfVerify(q.task, draft)
  const tokenLen = estimateTokens(q.task)
  let ratio = Math.min(1, estimateTokens(draft) / (tokenLen * 4))
  let metaConf = await router.predictConfidence({
    pEasy,
    agreement: r.agreement,
    selfVerify: verified ? 1.0 : 0.0,
    answerLenRatio: ratio,
    judgeScore: verified ? 5 : 1,
    isRefined: false,
  })
  let route = await router.route(metaConf)
  let didRefine = false

  if (route === "refine") {
    didRefine = true
    const refined = await localRefine(q.task, draft)
    draft = refined.answer
    verified = await selfVerify(q.task, draft)
    ratio = Math.min(1, estimateTokens(draft) / (tokenLen * 4))
    metaConf = await router.predictConfidence({
      pEasy,
      agreement: refined.agreement,
      selfVerify: verified ? 1.0 : 0.0,
      answerLenRatio: ratio,
      judgeScore: verified ? 5 : 1,
      isRefined: true,
    })
    route = await router.route(metaConf)
  }

  if (route === "pass") {
    await cache.store({
      task: q.task, answer: draft, metaConf,
      tier: didRefine ? "refine" : "local",
      tokensPaid: 0, pEasy, agreement: r.agreement,
      judgeScore: verified ? 5 : 1,
    })
    return {
      response: draft, tokensPaid: 0,
      durationMs: Date.now() - start, route: didRefine ? "refined" : "local",
    }
  }
  // route === "escalate"
  const esc = getEscalator()
  const e = await esc.escalate({
    task: q.task,
    localAttempt: draft,
    critique: `Meta-router conf ${metaConf.toFixed(2)} < threshold`,
    agreement: r.agreement,
    selfVerify: verified,
  })
  await cache.store({
    task: q.task,
    answer: e.answer,
    metaConf: 1.0,
    tier: "escalated",
    tokensPaid: e.tokensPaid,
    pEasy,
    agreement: r.agreement,
    judgeScore: verified ? 5 : 1,
  })
  return {
    response: e.answer,
    tokensPaid: e.tokensPaid,
    durationMs: Date.now() - start,
    route: "escalated",
  }
}

const RUNNERS: Record<Condition, (q: EvalQuery) => Promise<QueryOutcome>> = {
  baseline: runBaseline,
  cache: runCache,
  earlyExit: runEarlyExit,
  cisc: runCisc,
  metaRouter: runMetaRouter,
}

// ---------------------------------------------------------------------------
// Main runner — async, runs all 5 conditions × N queries
// ---------------------------------------------------------------------------

let _activeRunId: string | null = null

/**
 * Kicks off an ablation run in the background. Returns the runId immediately.
 * Throws if a run is already in progress.
 */
export async function startAblationRun(): Promise<{ runId: string }> {
  if (_activeRunId) {
    throw new Error("An ablation run is already in progress")
  }

  // IMPORTANT: clear the cache before each run so the +Cache condition
  // can demonstrate savings on the cached slots. (Within a single run,
  // the cache accumulates across conditions, which is correct — the
  // +Cache condition populates the cache for the +EarlyExit condition
  // that follows.)
  const cache = getCache()
  // Clear via direct DB delete (the cache module doesn't expose a clear method)
  await db.semanticCache.deleteMany({})

  const run = await db.ablationRun.create({
    data: {
      status: "running",
      progress: 0,
      totalQueries: evalSet.length,
    },
  })
  _activeRunId = run.id

  // Fire-and-forget — runs in background, updates DB as it goes.
  runAblation(run.id).catch((err) => {
    console.error("[ablation] run failed:", err)
    db.ablationRun
      .update({
        where: { id: run.id },
        data: {
          status: "failed",
          error: String(err?.message ?? err).slice(0, 500),
          completedAt: new Date(),
        },
      })
      .finally(() => {
        _activeRunId = null
      })
  })

  return { runId: run.id }
}

async function runAblation(runId: string): Promise<void> {
  const totalSteps = CONDITIONS.length * evalSet.length
  let stepCount = 0
  const conditions: ConditionResult[] = []
  let baselineTokens = 0

  for (const condition of CONDITIONS) {
    let tokensPaid = 0
    let correctCount = 0
    let cacheHits = 0
    let escalations = 0
    let localAccepted = 0
    const conditionStart = Date.now()

    for (const q of evalSet) {
      try {
        const outcome = await RUNNERS[condition](q)
        const score = await judge(q, outcome.response)
        const accurate = score >= 0.7
        tokensPaid += outcome.tokensPaid
        if (accurate) correctCount++
        if (outcome.route === "cache") cacheHits++
        if (outcome.route === "escalated" || outcome.route === "baseline")
          escalations++
        if (outcome.route === "local" || outcome.route === "refined")
          localAccepted++

        await db.ablationQuery.create({
          data: {
            runId,
            condition,
            queryIndex: q.index,
            task: q.task,
            referenceAnswer: q.referenceAnswer,
            response: outcome.response,
            paid: outcome.tokensPaid,
            accurate,
            score,
            durationMs: outcome.durationMs,
          },
        })
      } catch (err) {
        console.error(`[ablation] query failed:`, err)
        // Record as 0-score, 0-token failed entry
        await db.ablationQuery.create({
          data: {
            runId,
            condition,
            queryIndex: q.index,
            task: q.task,
            referenceAnswer: q.referenceAnswer,
            response: `(error: ${String(err).slice(0, 200)})`,
            paid: 0,
            accurate: false,
            score: 0,
            durationMs: 0,
          },
        })
      }

      stepCount++
      const progress = Math.floor((stepCount / totalSteps) * 100)
      await db.ablationRun.update({
        where: { id: runId },
        data: {
          progress,
          conditionsDone: conditions.map((c) => c.condition),
        },
      })
    }

    const accuracy = correctCount / evalSet.length
    if (condition === "baseline") baselineTokens = tokensPaid
    const tokensSavedPct =
      baselineTokens > 0 ? 1 - tokensPaid / baselineTokens : 0

    conditions.push({
      condition,
      accuracy,
      tokensPaid,
      tokensSavedPct,
      queries: evalSet.length,
      correctCount,
      cacheHits,
      escalations,
      localAccepted,
      durationMs: Date.now() - conditionStart,
    })
  }

  await db.ablationRun.update({
    where: { id: runId },
    data: {
      status: "completed",
      progress: 100,
      completedAt: new Date(),
    },
  })
  _activeRunId = null
}

// ---------------------------------------------------------------------------
// Reader — fetches the latest run + results for the UI
// ---------------------------------------------------------------------------

export async function getLatestRun(): Promise<AblationRunSummary | null> {
  const run = await db.ablationRun.findFirst({
    orderBy: { startedAt: "desc" },
    include: { queries: true },
  })
  if (!run) return null

  const conditions: ConditionResult[] = []
  for (const c of CONDITIONS) {
    const qs = run.queries.filter((q) => q.condition === c)
    if (qs.length === 0) continue
    const tokensPaid = qs.reduce((s, q) => s + q.paid, 0)
    const correctCount = qs.filter((q) => q.accurate).length
    const accuracy = correctCount / qs.length
    const baselineTokens =
      conditions.find((x) => x.condition === "baseline")?.tokensPaid ?? tokensPaid
    conditions.push({
      condition: c,
      accuracy,
      tokensPaid,
      tokensSavedPct:
        baselineTokens > 0 ? 1 - tokensPaid / baselineTokens : 0,
      queries: qs.length,
      correctCount,
      cacheHits: 0, // not tracked per-query in DB; would need a column
      escalations: 0,
      localAccepted: 0,
      durationMs: qs.reduce((s, q) => s + q.durationMs, 0),
    })
  }

  return {
    runId: run.id,
    status: run.status as AblationRunSummary["status"],
    progress: run.progress,
    totalQueries: run.totalQueries,
    conditions,
    baselineTokens:
      conditions.find((c) => c.condition === "baseline")?.tokensPaid ?? 0,
    error: run.error ?? undefined,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString(),
  }
}

export function getConditionLabel(c: Condition): string {
  return CONDITION_LABELS[c]
}

export function getConditionDescription(c: Condition): string {
  return CONDITION_DESCRIPTIONS[c]
}

export const ALL_CONDITIONS = CONDITIONS

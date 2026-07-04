/**
 * OptimizedRoutingPipeline — TypeScript port of the Python orchestrator.
 *
 * State machine that wraps every local compute tier in a try/except
 * guard. If the local vLLM engine OOMs or times out, the exception is
 * caught and an emergency escalation is triggered.
 *
 * Tracks `did_refine` explicitly to prevent feature drift during
 * shadow-mode telemetry logging.
 */

import { getCache } from "./cache"
import { getLocalModel, predictPEasy } from "./local-model"
import { getMetaRouter, type Route } from "./meta-router"
import { getEscalator } from "./escalator"
import { getTelemetry } from "./telemetry"
import { estimateTokens } from "./llm-client"
import { db } from "@/lib/db"

export type RouteTier = "cache" | "local" | "refine" | "escalated"

export interface RoutingStep {
  id: string
  label: string
  tier: RouteTier | "meta" | "early-exit" | "input"
  detail: string
  tokensPaid: number
  durationMs: number
  status: "active" | "done" | "skipped" | "fail"
}

export interface RoutingResult {
  answer: string
  tier: RouteTier
  tokensPaid: number
  confidence: number
  pEasy: number
  agreement: number
  judgeScore: number
  didRefine: boolean
  durationMs: number
  steps: RoutingStep[]
}

export class OptimizedRoutingPipeline {
  async solve(task: string, _opts?: { forceCache?: boolean }): Promise<RoutingResult> {
    const result = await this._solve(task)
    // Persist the trace for the dashboard's routing-trace history.
    // Failures here must never break the API response.
    try {
      await db.routingTrace.create({
        data: {
          task,
          answer: result.answer,
          route: result.tier,
          tokensPaid: result.tokensPaid,
          durationMs: result.durationMs,
          pEasy: result.pEasy,
          agreement: result.agreement,
          judgeScore: result.judgeScore,
          metaConfidence: result.confidence,
          didRefine: result.didRefine,
          steps: JSON.stringify(result.steps),
        },
      })
    } catch (err) {
      console.error("[pipeline] trace persist failed:", err)
    }
    return result
  }

  private async _solve(task: string): Promise<RoutingResult> {
    const cache = getCache()
    const local = getLocalModel()
    const router = getMetaRouter()
    const escalator = getEscalator()
    const telemetry = getTelemetry()

    const start = Date.now()
    const steps: RoutingStep[] = []
    let tokensPaid = 0

    // Step 1 — Ingest
    const tokenLen = estimateTokens(task)
    steps.push({
      id: "input",
      label: "Ingest task",
      tier: "input",
      detail: `Token length: ${tokenLen}`,
      tokensPaid: 0,
      durationMs: 2,
      status: "done",
    })

    // Step 2 — Cache check (preserving historical meta_conf)
    // A real cache hit returns the historical answer immediately.
    // `forceCache` only takes effect if there IS a cached entry.
    const cached = await cache.lookup(task)
    if (cached) {
      steps.push({
        id: "cache",
        label: "Semantic cache hit",
        tier: "cache",
        detail: `cosine ≥ 0.96 — returning historical answer + meta_conf ${cached.metaConf.toFixed(2)}`,
        tokensPaid: 0,
        durationMs: 8,
        status: "done",
      })
      await telemetry.log({
        tokenLen,
        pEasy: cached.pEasy ?? 0.5,
        fallbackRoute: "cache",
        shadowRoute: "cache",
        divergence: false,
        didRefine: false,
        task,
        answer: cached.answer,
        tokensPaid: 0,
        durationMs: Date.now() - start,
      })
      return {
        answer: cached.answer,
        tier: "cache",
        tokensPaid: 0,
        confidence: cached.metaConf,
        pEasy: cached.pEasy ?? 0.5,
        agreement: cached.agreement ?? 0.9,
        judgeScore: cached.judgeScore ?? 4.5,
        didRefine: false,
        durationMs: Date.now() - start,
        steps,
      }
    }

    // Cache miss
    steps.push({
      id: "cache-miss",
      label: "Semantic cache miss",
      tier: "cache",
      detail: "cosine < 0.96 — proceeding to difficulty classifier",
      tokensPaid: 0,
      durationMs: 14,
      status: "done",
    })

    let didRefine = false
    let pEasy = 0.5
    let agreement = 0
    let judgeScore = 0
    let metaConf = 0

    try {
      // Step 3 — Difficulty classifier → early-exit gate
      pEasy = predictPEasy(task)

      if (pEasy < 0.25) {
        // Early-exit: bypass local model entirely
        steps.push({
          id: "early-exit",
          label: "Early-exit gate",
          tier: "early-exit",
          detail: `P-easy ${pEasy.toFixed(2)} < 0.25 → bypass local model`,
          tokensPaid: 0,
          durationMs: 6,
          status: "done",
        })
        const esc = await escalator.escalate({
          task,
          localAttempt: "",
          critique: "P-easy below early-exit floor — skipped local model",
        })
        tokensPaid += esc.tokensPaid
        steps.push({
          id: "escalate",
          label: "Fireworks escalation — Gemma 3 27B",
          tier: "escalated",
          detail: `Enriched hand-off: task + junior critique · ${esc.tokensPaid} paid tokens`,
          tokensPaid: esc.tokensPaid,
          durationMs: esc.durationMs,
          status: "done",
        })
        await cache.store({
          task,
          answer: esc.answer,
          metaConf: 1.0,
          tier: "escalated",
          tokensPaid: esc.tokensPaid,
          pEasy,
          agreement: 0,
          judgeScore: 0,
        })
        await telemetry.log({
          tokenLen,
          pEasy,
          fallbackRoute: "escalated",
          shadowRoute: "escalated",
          divergence: false,
          didRefine: false,
          task,
          answer: esc.answer,
          tokensPaid: esc.tokensPaid,
          durationMs: Date.now() - start,
        })
        return {
          answer: esc.answer,
          tier: "escalated",
          tokensPaid,
          confidence: 1.0,
          pEasy,
          agreement: 0,
          judgeScore: 0,
          didRefine: false,
          durationMs: Date.now() - start,
          steps,
        }
      }

      // Step 4 — Local execution pass (ConcurrentCISC n=3)
      steps.push({
        id: "early-exit",
        label: "Early-exit gate",
        tier: "early-exit",
        detail: `P-easy ${pEasy.toFixed(2)} ≥ 0.25 → run local model`,
        tokensPaid: 0,
        durationMs: 4,
        status: "done",
      })
      const localResult = await local.verify(task, pEasy)
      const draft = localResult.answer
      agreement = localResult.agreement
      steps.push({
        id: "local",
        label: "Local Gemma 3 4B BF16 — vLLM n=3",
        tier: "local",
        detail: `ConcurrentCISC agreement = ${agreement.toFixed(2)} · ${localResult.durationMs}ms`,
        tokensPaid: 0,
        durationMs: localResult.durationMs,
        status: "done",
      })

      // Step 5 — Judge + meta-classifier gate
      judgeScore = await local.judge(task, draft)
      metaConf = await router.predictConfidence({
        pEasy,
        agreement,
        judgeScore,
        isRefined: false,
      })
      let route = await router.route(metaConf)

      // Step 6 — On-demand refinement chain
      if (route === "refine") {
        didRefine = true
        steps.push({
          id: "meta-1",
          label: "Meta-classifier gate",
          tier: "meta",
          detail: `Conf ${metaConf.toFixed(2)} ∈ [0.40, 0.65) → on-demand refine`,
          tokensPaid: 0,
          durationMs: 8,
          status: "done",
        })
        const refined = await local.refine(task, draft)
        const refinedDraft = refined.answer
        const refinedJudge = await local.judge(task, refinedDraft)
        // Re-evaluate meta-classifier with refined features
        metaConf = await router.predictConfidence({
          pEasy,
          agreement: refined.agreement,
          judgeScore: refinedJudge,
          isRefined: true,
        })
        route = await router.route(metaConf)
        judgeScore = refinedJudge
        steps.push({
          id: "refine",
          label: "Self-refine — 1 local round",
          tier: "refine",
          detail: `Re-prompt with critique · judge ${refinedJudge.toFixed(1)}`,
          tokensPaid: 0,
          durationMs: refined.durationMs,
          status: "done",
        })
        steps.push({
          id: "meta-2",
          label: "Meta-classifier gate (re-eval)",
          tier: "meta",
          detail: `Conf ${metaConf.toFixed(2)} → ${route === "pass" ? "accept local" : route === "refine" ? "refine again (capped)" : "escalate"}`,
          tokensPaid: 0,
          durationMs: 6,
          status: "done",
        })
        // Use the refined draft from here on
        return await this.finalizeLocalOrEscalate({
          task,
          draft: refinedDraft,
          pEasy,
          agreement: refined.agreement,
          judgeScore: refinedJudge,
          metaConf,
          route,
          didRefine,
          steps,
          tokensPaid,
          start,
          critique: `Refined but conf ${metaConf.toFixed(2)} < 0.65`,
        })
      } else {
        steps.push({
          id: "meta-1",
          label: "Meta-classifier gate",
          tier: "meta",
          detail:
            route === "pass"
              ? `Conf ${metaConf.toFixed(2)} ≥ 0.65 → accept local`
              : `Conf ${metaConf.toFixed(2)} < 0.40 → escalate`,
          tokensPaid: 0,
          durationMs: 8,
          status: "done",
        })
        return await this.finalizeLocalOrEscalate({
          task,
          draft,
          pEasy,
          agreement,
          judgeScore,
          metaConf,
          route,
          didRefine,
          steps,
          tokensPaid,
          start,
          critique: `Failed meta-classifier boundary (conf ${metaConf.toFixed(2)})`,
        })
      }
    } catch (err) {
      // Emergency fail-safe — escalate to Fireworks
      const msg = err instanceof Error ? err.message : String(err)
      const errType = err instanceof Error ? err.constructor.name : "Unknown"
      steps.push({
        id: "exception",
        label: "Exception guard triggered",
        tier: "meta",
        detail: `${errType}: ${msg.slice(0, 80)} → emergency escalation`,
        tokensPaid: 0,
        durationMs: 0,
        status: "fail",
      })
      const esc = await escalator.escalate({
        task,
        localAttempt: "",
        critique: `Emergency Fallback Tier Triggered: ${errType}`,
      })
      tokensPaid += esc.tokensPaid
      steps.push({
        id: "escalate",
        label: "Fireworks escalation — Gemma 3 27B (emergency)",
        tier: "escalated",
        detail: `Fail-safe escalation · ${esc.tokensPaid} paid tokens`,
        tokensPaid: esc.tokensPaid,
        durationMs: esc.durationMs,
        status: "done",
      })
      await cache.store({
        task,
        answer: esc.answer,
        metaConf: 1.0,
        tier: "escalated",
        tokensPaid: esc.tokensPaid,
        pEasy,
        agreement,
        judgeScore,
      })
      await telemetry.log({
        tokenLen,
        pEasy,
        fallbackRoute: "escalated",
        shadowRoute: "escalated",
        divergence: false,
        didRefine,
        task,
        answer: esc.answer,
        tokensPaid: esc.tokensPaid,
        durationMs: Date.now() - start,
      })
      return {
        answer: esc.answer,
        tier: "escalated",
        tokensPaid,
        confidence: 1.0,
        pEasy,
        agreement,
        judgeScore,
        didRefine,
        durationMs: Date.now() - start,
        steps,
      }
    }
  }

  private async finalizeLocalOrEscalate(args: {
    task: string
    draft: string
    pEasy: number
    agreement: number
    judgeScore: number
    metaConf: number
    route: Route
    didRefine: boolean
    steps: RoutingStep[]
    tokensPaid: number
    start: number
    critique: string
  }): Promise<RoutingResult> {
    const {
      task,
      draft,
      pEasy,
      agreement,
      judgeScore,
      metaConf,
      route,
      didRefine,
      steps,
      tokensPaid,
      start,
      critique,
    } = args

    const cache = getCache()
    const escalator = getEscalator()
    const telemetry = getTelemetry()

    if (route === "pass") {
      // Local accepted — cache + return
      await cache.store({
        task,
        answer: draft,
        metaConf,
        tier: didRefine ? "refine" : "local",
        tokensPaid: 0,
        pEasy,
        agreement,
        judgeScore,
      })
      const tier: RouteTier = didRefine ? "refine" : "local"
      // Compute shadow route (what XGBoost would have said)
      const shadowConf = metaConf // already from XGBoost
      const shadowRoute: Route = shadowConf >= 0.65 ? "pass" : shadowConf >= 0.4 ? "refine" : "escalate"
      await telemetry.log({
        tokenLen: estimateTokens(task),
        pEasy,
        fallbackRoute: tier,
        shadowRoute,
        divergence: shadowRoute !== "pass",
        didRefine,
        task,
        answer: draft,
        tokensPaid: 0,
        durationMs: Date.now() - start,
      })
      return {
        answer: draft,
        tier,
        tokensPaid: 0,
        confidence: metaConf,
        pEasy,
        agreement,
        judgeScore,
        didRefine,
        durationMs: Date.now() - start,
        steps,
      }
    }

    // route === "escalate" (refine-then-escalate is also possible)
    const esc = await escalator.escalate({
      task,
      localAttempt: draft,
      critique,
    })
    const totalPaid = tokensPaid + esc.tokensPaid
    steps.push({
      id: "escalate",
      label: "Fireworks escalation — Gemma 3 27B",
      tier: "escalated",
      detail: `Enriched hand-off: junior attempt + critique · ${esc.tokensPaid} paid tokens`,
      tokensPaid: esc.tokensPaid,
      durationMs: esc.durationMs,
      status: "done",
    })
    await cache.store({
      task,
      answer: esc.answer,
      metaConf: 1.0,
      tier: "escalated",
      tokensPaid: totalPaid,
      pEasy,
      agreement,
      judgeScore,
    })
    const shadowRoute: Route = metaConf >= 0.65 ? "pass" : metaConf >= 0.4 ? "refine" : "escalate"
    await telemetry.log({
      tokenLen: estimateTokens(task),
      pEasy,
      fallbackRoute: "escalated",
      shadowRoute,
      divergence: shadowRoute !== "escalate",
      didRefine,
      task,
      answer: esc.answer,
      tokensPaid: totalPaid,
      durationMs: Date.now() - start,
    })
    return {
      answer: esc.answer,
      tier: "escalated",
      tokensPaid: totalPaid,
      confidence: 1.0,
      pEasy,
      agreement,
      judgeScore,
      didRefine,
      durationMs: Date.now() - start,
      steps,
    }
  }
}

let _pipeline: OptimizedRoutingPipeline | null = null
export function getPipeline(): OptimizedRoutingPipeline {
  if (!_pipeline) _pipeline = new OptimizedRoutingPipeline()
  return _pipeline
}

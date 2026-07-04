/**
 * OptimizedRoutingPipeline — v2 with 3-tier difficulty routing.
 *
 * NEW FLOW:
 *   1. Cache check (cosine ≥ 0.96 → return, 0 tokens)
 *   2. Difficulty classifier (multi-signal pEasy)
 *      - HARD (pEasy < 0.25)  → skip local, escalate immediately
 *      - EASY (pEasy > 0.80)  → local single-shot + self-verify
 *      - MEDIUM (0.25-0.80)   → local CISC n=3 + self-verify + meta-classifier
 *   3. For EASY: local single-shot → self-verify
 *      - If self-verify YES → accept local (0 tokens)
 *      - If self-verify NO  → escalate with hand-off
 *   4. For MEDIUM: local CISC n=3 → self-verify → meta-classifier
 *      - conf ≥ 0.65 → accept local (0 tokens)
 *      - conf ∈ [0.40, 0.65) → refine (1 local round) → re-eval
 *      - conf < 0.40 → escalate with hand-off
 *   5. Exception guard wraps all local compute → emergency escalation
 *
 * Token budget:
 *   - Local single-shot: 200 tokens (free)
 *   - Local CISC n=3:     600 tokens (free, 3 × 200)
 *   - Self-verify:        8 tokens (free)
 *   - Refine:             200 tokens (free)
 *   - Remote escalation: 400 tokens (paid, tight cap)
 *
 * Worst case paid per query: ~800 tokens (escalation + hand-off)
 * Best case paid per query: 0 tokens (cache hit or local accepted)
 */

import { getCache } from "./cache"
import {
  localSingleShot,
  localCISC,
  localRefine,
  selfVerify,
  type LocalResult,
} from "./local-model"
import { predictPEasy, difficultyTier } from "./difficulty"
import { getMetaRouter, type Route, type MetaFeatures } from "./meta-router"
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
  selfVerified: boolean | null
  durationMs: number
  steps: RoutingStep[]
}

export class OptimizedRoutingPipeline {
  async solve(task: string): Promise<RoutingResult> {
    const result = await this._solve(task)
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
    const router = getMetaRouter()
    const escalator = getEscalator()
    const telemetry = getTelemetry()

    const start = Date.now()
    const steps: RoutingStep[] = []
    let tokensPaid = 0

    const tokenLen = estimateTokens(task)
    steps.push({
      id: "input",
      label: "Ingest task",
      tier: "input",
      detail: `Token length: ${tokenLen} · difficulty classifier engaged`,
      tokensPaid: 0,
      durationMs: 2,
      status: "done",
    })

    // 1. Cache check
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
        selfVerified: null,
        durationMs: Date.now() - start,
        steps,
      }
    }

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
    let selfVerified: boolean | null = null

    try {
      // 2. Difficulty classifier
      pEasy = predictPEasy(task)
      const tier = difficultyTier(pEasy)

      // HARD — skip local, escalate immediately
      if (tier === "hard") {
        steps.push({
          id: "early-exit",
          label: "Early-exit gate (hard)",
          tier: "early-exit",
          detail: `P-easy ${pEasy.toFixed(2)} < 0.25 → bypass local model`,
          tokensPaid: 0,
          durationMs: 6,
          status: "done",
        })
        const esc = await escalator.escalate({
          task,
          localAttempt: "",
          critique: "Early-exit: hard query, local model skipped",
        })
        tokensPaid += esc.tokensPaid
        steps.push({
          id: "escalate",
          label: "Fireworks escalation — Gemma 3 27B",
          tier: "escalated",
          detail: `Hard query hand-off · ${esc.tokensPaid} paid tokens`,
          tokensPaid: esc.tokensPaid,
          durationMs: esc.durationMs,
          status: "done",
        })
        await cache.store({
          task, answer: esc.answer, metaConf: 1.0,
          tier: "escalated", tokensPaid: esc.tokensPaid, pEasy,
        })
        await telemetry.log({
          tokenLen, pEasy,
          fallbackRoute: "escalated", shadowRoute: "escalated",
          divergence: false, didRefine: false,
          task, answer: esc.answer, tokensPaid: esc.tokensPaid,
          durationMs: Date.now() - start,
        })
        return {
          answer: esc.answer, tier: "escalated", tokensPaid,
          confidence: 1.0, pEasy, agreement: 0, judgeScore: 0,
          didRefine: false, selfVerified: null,
          durationMs: Date.now() - start, steps,
        }
      }

      // EASY — local single-shot + self-verify
      if (tier === "easy") {
        steps.push({
          id: "early-exit",
          label: "Early-exit gate (easy)",
          tier: "early-exit",
          detail: `P-easy ${pEasy.toFixed(2)} > 0.80 → local single-shot`,
          tokensPaid: 0,
          durationMs: 4,
          status: "done",
        })
        const local = await localSingleShot(task)
        agreement = 1.0
        steps.push({
          id: "local",
          label: "Local Gemma 4B — single-shot",
          tier: "local",
          detail: `Temp 0.0 · ${local.durationMs}ms · ${local.tokensUsed} free tokens`,
          tokensPaid: 0,
          durationMs: local.durationMs,
          status: "done",
        })

        // Self-verify
        selfVerified = await selfVerify(task, local.answer)
        steps.push({
          id: "verify",
          label: "Self-verification",
          tier: "meta",
          detail: `Local self-check: ${selfVerified ? "YES" : "NO"}`,
          tokensPaid: 0,
          durationMs: 8,
          status: "done",
        })

        if (selfVerified) {
          // Accept local
          judgeScore = 5
          metaConf = 0.90
          await cache.store({
            task, answer: local.answer, metaConf,
            tier: "local", tokensPaid: 0, pEasy, agreement, judgeScore,
          })
          await telemetry.log({
            tokenLen, pEasy,
            fallbackRoute: "local", shadowRoute: "local",
            divergence: false, didRefine: false,
            task, answer: local.answer, tokensPaid: 0,
            durationMs: Date.now() - start,
          })
          return {
            answer: local.answer, tier: "local", tokensPaid: 0,
            confidence: metaConf, pEasy, agreement, judgeScore,
            didRefine: false, selfVerified,
            durationMs: Date.now() - start, steps,
          }
        }

        // Self-verify failed → escalate with hand-off
        const esc = await escalator.escalate({
          task, localAttempt: local.answer,
          critique: "Self-verify rejected local answer",
          agreement: 1.0, selfVerify: false,
        })
        tokensPaid += esc.tokensPaid
        steps.push({
          id: "escalate",
          label: "Fireworks escalation — Gemma 3 27B",
          tier: "escalated",
          detail: `Self-verify failed → hand-off · ${esc.tokensPaid} paid tokens`,
          tokensPaid: esc.tokensPaid,
          durationMs: esc.durationMs,
          status: "done",
        })
        await cache.store({
          task, answer: esc.answer, metaConf: 1.0,
          tier: "escalated", tokensPaid: esc.tokensPaid, pEasy, agreement, judgeScore,
        })
        await telemetry.log({
          tokenLen, pEasy,
          fallbackRoute: "escalated", shadowRoute: "escalated",
          divergence: false, didRefine: false,
          task, answer: esc.answer, tokensPaid: esc.tokensPaid,
          durationMs: Date.now() - start,
        })
        return {
          answer: esc.answer, tier: "escalated", tokensPaid,
          confidence: 1.0, pEasy, agreement, judgeScore,
          didRefine: false, selfVerified,
          durationMs: Date.now() - start, steps,
        }
      }

      // MEDIUM — full cascade: CISC n=3 + self-verify + meta-classifier
      steps.push({
        id: "early-exit",
        label: "Early-exit gate (medium)",
        tier: "early-exit",
        detail: `P-easy ${pEasy.toFixed(2)} ∈ [0.25, 0.80] → CISC n=3 + meta-classifier`,
        tokensPaid: 0,
        durationMs: 4,
        status: "done",
      })

      const local = await localCISC(task)
      agreement = local.agreement
      steps.push({
        id: "local",
        label: "Local Gemma 4B — ConcurrentCISC n=3",
        tier: "local",
        detail: `n=3 agreement ${agreement.toFixed(2)} · ${local.durationMs}ms · ${local.tokensUsed} free tokens`,
        tokensPaid: 0,
        durationMs: local.durationMs,
        status: "done",
      })

      // Self-verify the consensus answer
      selfVerified = await selfVerify(task, local.answer)
      steps.push({
        id: "verify",
        label: "Self-verification",
        tier: "meta",
        detail: `Local self-check: ${selfVerified ? "YES" : "NO"}`,
        tokensPaid: 0,
        durationMs: 8,
        status: "done",
      })

      // Compute answer-length ratio (normalized to [0,1])
      const ansTokens = estimateTokens(local.answer)
      const ratio = tokenLen > 0 ? Math.min(1, ansTokens / (tokenLen * 4)) : 0.5

      const features: MetaFeatures = {
        pEasy,
        agreement,
        selfVerify: selfVerified ? 1.0 : 0.0,
        answerLenRatio: ratio,
        judgeScore: selfVerified ? 5 : 1,
        isRefined: false,
      }
      metaConf = await router.predictConfidence(features)
      let route = await router.route(metaConf)

      // Refinement chain
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
        const refined = await localRefine(task, local.answer)
        const refinedVerify = await selfVerify(task, refined.answer)
        const refinedRatio = Math.min(1, estimateTokens(refined.answer) / (tokenLen * 4))
        metaConf = await router.predictConfidence({
          pEasy,
          agreement: refined.agreement,
          selfVerify: refinedVerify ? 1.0 : 0.0,
          answerLenRatio: refinedRatio,
          judgeScore: refinedVerify ? 5 : 1,
          isRefined: true,
        })
        route = await router.route(metaConf)
        judgeScore = refinedVerify ? 5 : 1
        selfVerified = refinedVerify
        steps.push({
          id: "refine",
          label: "Self-refine — 1 local round",
          tier: "refine",
          detail: `Re-prompt + re-verify: ${refinedVerify ? "YES" : "NO"} · conf ${metaConf.toFixed(2)}`,
          tokensPaid: 0,
          durationMs: refined.durationMs,
          status: "done",
        })
        steps.push({
          id: "meta-2",
          label: "Meta-classifier gate (re-eval)",
          tier: "meta",
          detail: `Conf ${metaConf.toFixed(2)} → ${route === "pass" ? "accept local" : "escalate"}`,
          tokensPaid: 0,
          durationMs: 6,
          status: "done",
        })
        return this.finalizeLocalOrEscalate({
          task, draft: refined.answer, pEasy, agreement: refined.agreement,
          judgeScore, metaConf, route, didRefine, steps, tokensPaid, start,
          selfVerified, tokenLen,
        })
      }

      steps.push({
        id: "meta-1",
        label: "Meta-classifier gate",
        tier: "meta",
        detail: route === "pass"
          ? `Conf ${metaConf.toFixed(2)} ≥ 0.65 → accept local`
          : `Conf ${metaConf.toFixed(2)} < 0.40 → escalate`,
        tokensPaid: 0,
        durationMs: 8,
        status: "done",
      })
      return this.finalizeLocalOrEscalate({
        task, draft: local.answer, pEasy, agreement, judgeScore,
        metaConf, route, didRefine, steps, tokensPaid, start,
        selfVerified, tokenLen,
      })
    } catch (err) {
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
        task, localAttempt: "",
        critique: `Emergency Fallback Tier Triggered: ${errType}`,
      })
      tokensPaid += esc.tokensPaid
      steps.push({
        id: "escalate",
        label: "Fireworks escalation — emergency",
        tier: "escalated",
        detail: `Fail-safe · ${esc.tokensPaid} paid tokens`,
        tokensPaid: esc.tokensPaid,
        durationMs: esc.durationMs,
        status: "done",
      })
      await cache.store({
        task, answer: esc.answer, metaConf: 1.0,
        tier: "escalated", tokensPaid: esc.tokensPaid, pEasy, agreement, judgeScore,
      })
      await telemetry.log({
        tokenLen, pEasy,
        fallbackRoute: "escalated", shadowRoute: "escalated",
        divergence: false, didRefine,
        task, answer: esc.answer, tokensPaid: esc.tokensPaid,
        durationMs: Date.now() - start,
      })
      return {
        answer: esc.answer, tier: "escalated", tokensPaid,
        confidence: 1.0, pEasy, agreement, judgeScore,
        didRefine, selfVerified,
        durationMs: Date.now() - start, steps,
      }
    }
  }

  private async finalizeLocalOrEscalate(args: {
    task: string; draft: string; pEasy: number; agreement: number;
    judgeScore: number; metaConf: number; route: Route; didRefine: boolean;
    steps: RoutingStep[]; tokensPaid: number; start: number;
    selfVerified: boolean | null; tokenLen: number;
  }): Promise<RoutingResult> {
    const {
      task, draft, pEasy, agreement, judgeScore, metaConf, route,
      didRefine, steps, tokensPaid, start, selfVerified, tokenLen,
    } = args
    const cache = getCache()
    const escalator = getEscalator()
    const telemetry = getTelemetry()

    if (route === "pass") {
      await cache.store({
        task, answer: draft, metaConf,
        tier: didRefine ? "refine" : "local",
        tokensPaid: 0, pEasy, agreement, judgeScore,
      })
      const tier: RouteTier = didRefine ? "refine" : "local"
      const shadowRoute: Route = metaConf >= 0.65 ? "pass" : metaConf >= 0.4 ? "refine" : "escalate"
      await telemetry.log({
        tokenLen, pEasy,
        fallbackRoute: tier, shadowRoute,
        divergence: shadowRoute !== "pass",
        didRefine, task, answer: draft, tokensPaid: 0,
        durationMs: Date.now() - start,
      })
      return {
        answer: draft, tier, tokensPaid: 0,
        confidence: metaConf, pEasy, agreement, judgeScore,
        didRefine, selfVerified,
        durationMs: Date.now() - start, steps,
      }
    }

    // Escalate with hand-off
    const esc = await escalator.escalate({
      task, localAttempt: draft,
      critique: `Meta-router conf ${metaConf.toFixed(2)} < 0.65`,
      agreement, selfVerify: selfVerified,
    })
    const totalPaid = tokensPaid + esc.tokensPaid
    steps.push({
      id: "escalate",
      label: "Fireworks escalation — Gemma 3 27B",
      tier: "escalated",
      detail: `Enriched hand-off · ${esc.tokensPaid} paid tokens`,
      tokensPaid: esc.tokensPaid,
      durationMs: esc.durationMs,
      status: "done",
    })
    await cache.store({
      task, answer: esc.answer, metaConf: 1.0,
      tier: "escalated", tokensPaid: totalPaid, pEasy, agreement, judgeScore,
    })
    const shadowRoute: Route = metaConf >= 0.65 ? "pass" : metaConf >= 0.4 ? "refine" : "escalate"
    await telemetry.log({
      tokenLen, pEasy,
      fallbackRoute: "escalated", shadowRoute,
      divergence: shadowRoute !== "escalate",
      didRefine, task, answer: esc.answer, tokensPaid: totalPaid,
      durationMs: Date.now() - start,
    })
    return {
      answer: esc.answer, tier: "escalated", tokensPaid: totalPaid,
      confidence: 1.0, pEasy, agreement, judgeScore,
      didRefine, selfVerified,
      durationMs: Date.now() - start, steps,
    }
  }
}

let _pipeline: OptimizedRoutingPipeline | null = null
export function getPipeline(): OptimizedRoutingPipeline {
  if (!_pipeline) _pipeline = new OptimizedRoutingPipeline()
  return _pipeline
}

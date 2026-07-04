/**
 * Free-Verify Cascade — Mock telemetry & system state.
 *
 * This module is the single source of truth for the control panel's data layer.
 * In production these values come from the FastAPI backend (SQLite + vLLM +
 * Fireworks). For the demo we ship a deterministic, animated mock so the
 * control panel feels alive without external services.
 */

export type RouteTier = "cache" | "local" | "refine" | "escalated"
export type SystemHealth = "healthy" | "degraded" | "offline" | "warming"

export interface KpiSnapshot {
  tokensSaved: number
  tokensPaid: number
  tokensTotalBaseline: number
  accuracy: number
  accuracyThreshold: number
  localRoutePct: number
  escalatedRoutePct: number
  cacheRoutePct: number
  refineRoutePct: number
  totalQueries: number
  cacheHitRate: number
  costUsd: number
  costUsdBaseline: number
}

export interface RoutingStep {
  id: string
  label: string
  tier: RouteTier | "meta" | "early-exit" | "input"
  detail: string
  tokensPaid: number
  durationMs: number
  status: "active" | "done" | "skipped" | "fail"
}

export interface RoutingTrace {
  task: string
  answer: string
  tier: RouteTier
  tokensPaid: number
  confidence: number
  pEasy: number
  agreement: number
  judgeScore: number
  metaConfidence: number
  didRefine: boolean
  durationMs: number
  steps: RoutingStep[]
}

/** Shape returned by POST /api/cascade/solve */
export interface SolveApiResponse {
  ok: boolean
  result: RoutingTrace
  error?: string
}

export interface TelemetryRow {
  id: number
  timestamp: string
  tokenLen: number
  pEasy: number
  fallbackRoute: RouteTier
  shadowRoute: RouteTier
  divergence: boolean
  didRefine: boolean
}

export interface AblationRow {
  toggle: string
  accuracy: number
  tokensPaid: number
  tokensSavedPct: number
  description: string
}

export interface ServiceHealth {
  id: "vllm" | "fireworks" | "meta" | "cache" | "telemetry" | "fastapi"
  name: string
  status: SystemHealth
  latencyMs: number
  detail: string
  uptimePct: number
}

export interface TimeSeriesPoint {
  t: string
  queries: number
  tokensSaved: number
  tokensPaid: number
  escalationRate: number
}

/* -------------------------------------------------------------------------- */
/* KPI snapshot                                                               */
/* -------------------------------------------------------------------------- */

export const kpiSnapshot: KpiSnapshot = {
  tokensSaved: 1_284_560,
  tokensPaid: 184_220,
  tokensTotalBaseline: 1_468_780,
  accuracy: 0.927,
  accuracyThreshold: 0.9,
  localRoutePct: 0.728,
  escalatedRoutePct: 0.142,
  cacheRoutePct: 0.089,
  refineRoutePct: 0.041,
  totalQueries: 8_412,
  cacheHitRate: 0.089,
  costUsd: 12.84,
  costUsdBaseline: 102.61,
}

/* -------------------------------------------------------------------------- */
/* Routing sandbox — sample prompts + simulated trace                         */
/* -------------------------------------------------------------------------- */

export interface SamplePrompt {
  id: string
  label: string
  task: string
  expectedRoute: RouteTier
  pEasy: number
}

export const samplePrompts: SamplePrompt[] = [
  {
    id: "easy",
    label: "Easy — Capital lookup",
    task: "What is the capital of Australia?",
    expectedRoute: "local",
    pEasy: 0.92,
  },
  {
    id: "medium",
    label: "Medium — Multi-step math",
    task: "Solve: a train travels 60km in 45min. What is its speed in km/h?",
    expectedRoute: "refine",
    pEasy: 0.61,
  },
  {
    id: "hard",
    label: "Hard — Counterfactual reasoning",
    task: "If the Treaty of Westphalia had been signed in 1700 instead of 1648, how would the balance of power in 18th-century Europe have differed?",
    expectedRoute: "escalated",
    pEasy: 0.18,
  },
  {
    id: "cached",
    label: "Cached — Repeat query",
    task: "Summarize the plot of Shakespeare's Hamlet in three sentences.",
    expectedRoute: "cache",
    pEasy: 0.74,
  },
]

export function buildTrace(prompt: SamplePrompt, cached: boolean): RoutingTrace {
  const steps: RoutingStep[] = []
  let tokensPaid = 0
  const start = Date.now()

  steps.push({
    id: "input",
    label: "Ingest task",
    tier: "input",
    detail: `Token length: ${48 + Math.floor(prompt.pEasy * 30)}`,
    tokensPaid: 0,
    durationMs: 2,
    status: "done",
  })

  if (cached) {
    steps.push({
      id: "cache",
      label: "Semantic cache hit",
      tier: "cache",
      detail: "cosine ≥ 0.96 — returning historical answer + meta_conf",
      tokensPaid: 0,
      durationMs: 8,
      status: "done",
    })
    return {
      task: prompt.task,
      pEasy: prompt.pEasy,
      agreement: 0.94,
      judgeScore: 4.6,
      metaConfidence: 0.94,
      didRefine: false,
      route: "cache",
      steps,
      answer:
        "Hamlet, Prince of Denmark, mourns his father's death and is visited by his ghost, who reveals he was murdered by Hamlet's uncle Claudius — now king and married to Hamlet's mother. Hamlet feigns madness to investigate, accidentally kills Polonius, and is sent to England, but returns to confront Claudius. In the final duel, Hamlet, his mother, Claudius, and Laertes all die by poison, leaving the throne to Fortinbras of Norway.",
      tokensPaid: 0,
      durationMs: 10,
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

  // Early-exit gate
  if (prompt.pEasy < 0.25) {
    steps.push({
      id: "early-exit",
      label: "Early-exit gate",
      tier: "early-exit",
      detail: `P-easy = ${prompt.pEasy.toFixed(2)} < 0.25 → bypass local model`,
      tokensPaid: 0,
      durationMs: 6,
      status: "done",
    })
    steps.push({
      id: "escalate",
      label: "Fireworks escalation — Gemma 3 27B",
      tier: "escalated",
      detail: "Enriched hand-off: task + junior critique",
      tokensPaid: 642,
      durationMs: 1_840,
      status: "done",
    })
    return {
      task: prompt.task,
      pEasy: prompt.pEasy,
      agreement: 0,
      judgeScore: 0,
      metaConfidence: 0,
      didRefine: false,
      route: "escalated",
      steps,
      answer:
        "A delayed Treaty of Westphalia would have left the Holy Roman Empire's confessional settlement unresolved for another half-century, likely strengthening Habsburg absolutism and delaying the rise of the Westphalian state system. The French-Dutch alliance against Spain might have collapsed, and the maritime powers would have faced a more centralized, Catholic-imperial Habsburg bloc — potentially forestalling the War of the Spanish Succession but intensifying religious conflicts across Central Europe.",
      tokensPaid: 642,
      durationMs: 1_862,
    }
  }

  // Local model — ConcurrentCISC
  const agreement = prompt.expectedRoute === "refine" ? 0.52 : 0.91
  steps.push({
    id: "early-exit",
    label: "Early-exit gate",
    tier: "early-exit",
    detail: `P-easy = ${prompt.pEasy.toFixed(2)} ≥ 0.25 → run local model`,
    tokensPaid: 0,
    durationMs: 4,
    status: "done",
  })
  steps.push({
    id: "local",
    label: "Local Gemma 3 4B BF16 — vLLM n=3",
    tier: "local",
    detail: `ConcurrentCISC agreement = ${agreement.toFixed(2)}`,
    tokensPaid: 0,
    durationMs: 320,
    status: "done",
  })

  const judgeScore = prompt.expectedRoute === "refine" ? 2.8 : 4.3
  let metaConf = 0.3 * prompt.pEasy + 0.3 * agreement + 0.4 * (judgeScore / 5.0)
  let didRefine = false
  let route: RouteTier = "local"

  if (metaConf >= 0.65) {
    route = "local"
  } else if (metaConf >= 0.4) {
    // Refinement path
    didRefine = true
    route = "local"
    metaConf = 0.3 * prompt.pEasy + 0.3 * agreement + 0.4 * (4.0 / 5.0)
    steps.push({
      id: "meta-1",
      label: "Meta-classifier gate",
      tier: "meta",
      detail: `Conf ${metaConf.toFixed(2)} ∈ [0.40, 0.65) → on-demand refine`,
      tokensPaid: 0,
      durationMs: 8,
      status: "done",
    })
    steps.push({
      id: "refine",
      label: "Self-refine — 1 local round",
      tier: "refine",
      detail: "Re-prompt with critique, re-score with judge",
      tokensPaid: 0,
      durationMs: 280,
      status: "done",
    })
    steps.push({
      id: "meta-2",
      label: "Meta-classifier gate (re-eval)",
      tier: "meta",
      detail: `Conf ${(metaConf + 0.04).toFixed(2)} ≥ 0.65 → accept local`,
      tokensPaid: 0,
      durationMs: 6,
      status: "done",
    })
  } else {
    route = "escalated"
    steps.push({
      id: "meta-1",
      label: "Meta-classifier gate",
      tier: "meta",
      detail: `Conf ${metaConf.toFixed(2)} < 0.40 → escalate`,
      tokensPaid: 0,
      durationMs: 8,
      status: "done",
    })
    steps.push({
      id: "escalate",
      label: "Fireworks escalation — Gemma 3 27B",
      tier: "escalated",
      detail: "Enriched hand-off: task + local attempt + critique",
      tokensPaid: 412,
      durationMs: 1_460,
      status: "done",
    })
    return {
      task: prompt.task,
      pEasy: prompt.pEasy,
      agreement,
      judgeScore,
      metaConfidence: metaConf,
      didRefine,
      route,
      steps,
      answer:
        "Train speed = 60 km / 0.75 h = 80 km/h. The unit conversion (45 min = 0.75 h) is the key step.",
      tokensPaid: 412,
      durationMs: 1_978,
    }
  }

  const answers: Record<string, string> = {
    easy: "The capital of Australia is Canberra, located in the Australian Capital Territory between Sydney and Melbourne.",
    medium:
      "Train speed = 60 km / 0.75 h = 80 km/h. The unit conversion (45 min = 0.75 h) is the key step.",
  }

  return {
    task: prompt.task,
    pEasy: prompt.pEasy,
    agreement,
    judgeScore,
    metaConfidence: metaConf,
    didRefine,
    route,
    steps,
    answer: answers[prompt.id] ?? "Local model response accepted by meta-classifier.",
    tokensPaid,
    durationMs: Date.now() - start,
  }
}

/* -------------------------------------------------------------------------- */
/* Telemetry — last 24 rows of shadow_telemetry                               */
/* -------------------------------------------------------------------------- */

const ROUTES: RouteTier[] = ["local", "local", "local", "cache", "refine", "escalated"]
const SHADOW_ROUTES: RouteTier[] = ["local", "local", "local", "cache", "refine", "escalated"]

/**
 * Generates telemetry rows at call time (not module-load time) so SSR and
 * client-render stay consistent. The rows are deterministic — same shape on
 * both sides — but the timestamps are computed lazily when the component
 * mounts on the client.
 */
export function buildTelemetryRows(): TelemetryRow[] {
  return Array.from({ length: 24 }).map((_, i) => {
    const fallback = ROUTES[i % ROUTES.length]
    const divergent = i % 9 === 0
    const shadow = divergent ? "escalated" : SHADOW_ROUTES[i % SHADOW_ROUTES.length]
    const date = new Date(Date.now() - i * 4 * 60_000)
    return {
      id: 10_000 - i,
      timestamp: date.toISOString().slice(11, 19),
      tokenLen: 42 + ((i * 17) % 380),
      pEasy: Math.max(0.05, Math.min(0.99, 0.3 + Math.sin(i / 3) * 0.35 + (i % 5) * 0.04)),
      fallbackRoute: fallback,
      shadowRoute: shadow,
      divergence: divergent,
      didRefine: fallback === "refine",
    }
  })
}

/**
 * Pre-built snapshot for SSR — uses static timestamps so the initial render
 * is hydration-safe. The client swaps to live timestamps via useEffect.
 */
export const telemetryRows: TelemetryRow[] = Array.from({ length: 24 }).map((_, i) => {
  const fallback = ROUTES[i % ROUTES.length]
  const divergent = i % 9 === 0
  const shadow = divergent ? "escalated" : SHADOW_ROUTES[i % SHADOW_ROUTES.length]
  // Deterministic static timestamp (no Date.now()) so SSR === client.
  const minutesAgo = i * 4
  const hh = String((24 - Math.floor(minutesAgo / 60) + 24) % 24).padStart(2, "0")
  const mm = String((60 - (minutesAgo % 60)) % 60).padStart(2, "0")
  const ss = "00"
  return {
    id: 10_000 - i,
    timestamp: `${hh}:${mm}:${ss}`,
    tokenLen: 42 + ((i * 17) % 380),
    pEasy: Math.max(0.05, Math.min(0.99, 0.3 + Math.sin(i / 3) * 0.35 + (i % 5) * 0.04)),
    fallbackRoute: fallback,
    shadowRoute: shadow,
    divergence: divergent,
    didRefine: fallback === "refine",
  }
})

export const shadowModeStats = {
  queriesProcessed: 67,
  divergenceCount: 11,
  divergencePct: 0.164,
  threshold: 0.20,
  requiredQueries: 50,
  engaged: true,
}

/* -------------------------------------------------------------------------- */
/* Ablation — toggle conditions                                               */
/* -------------------------------------------------------------------------- */

export const ablationRows: AblationRow[] = [
  {
    toggle: "Baseline (no cascade)",
    accuracy: 0.952,
    tokensPaid: 1_468_780,
    tokensSavedPct: 0,
    description: "Every query hits Gemma 27B via Fireworks. Highest accuracy, highest cost.",
  },
  {
    toggle: "+ Semantic Cache",
    accuracy: 0.951,
    tokensPaid: 1_338_189,
    tokensSavedPct: 8.9,
    description: "Cosine ≥ 0.96 returns cached answer. Negligible accuracy loss, 8.9% savings.",
  },
  {
    toggle: "+ Early-Exit Gate",
    accuracy: 0.948,
    tokensPaid: 1_069_432,
    tokensSavedPct: 27.2,
    description: "Hard queries (P-easy < 0.25) skip local model. Saves local inference time on hard tasks.",
  },
  {
    toggle: "+ ConcurrentCISC (n=3)",
    accuracy: 0.954,
    tokensPaid: 1_069_432,
    tokensSavedPct: 27.2,
    description: "Local agreement signal boosts meta-classifier quality — accuracy recovers above baseline.",
  },
  {
    toggle: "+ Meta-Router (XGBoost)",
    accuracy: 0.927,
    tokensPaid: 184_220,
    tokensSavedPct: 87.5,
    description: "Calibrated XGBoost + Isotonic. 87.5% token savings while staying ≥ 0.90 accuracy floor.",
  },
]

/* -------------------------------------------------------------------------- */
/* System health                                                              */
/* -------------------------------------------------------------------------- */

export const serviceHealth: ServiceHealth[] = [
  {
    id: "vllm",
    name: "vLLM — Gemma 3 4B BF16",
    status: "healthy",
    latencyMs: 318,
    detail: "MI300X · --max-num-seqs 16 · gpu-mem 0.85",
    uptimePct: 99.97,
  },
  {
    id: "fireworks",
    name: "Fireworks AI — Gemma 3 27B",
    status: "healthy",
    latencyMs: 1_612,
    detail: "Prefix-cache enabled · 50% input discount active",
    uptimePct: 99.91,
  },
  {
    id: "meta",
    name: "Meta-Router (XGBoost + Isotonic)",
    status: "healthy",
    latencyMs: 4,
    detail: "AUC 0.81 · Brier 0.13 · _is_fitted = True",
    uptimePct: 100,
  },
  {
    id: "cache",
    name: "Semantic Cache (SQLite + FAISS)",
    status: "healthy",
    latencyMs: 9,
    detail: "8,412 entries · hit rate 8.9% · cosine 0.96",
    uptimePct: 100,
  },
  {
    id: "telemetry",
    name: "AsyncTelemetryLogger (aiosqlite)",
    status: "healthy",
    latencyMs: 2,
    detail: "shadow_telemetry table · 67 rows · divergent 11",
    uptimePct: 100,
  },
  {
    id: "fastapi",
    name: "Cascade FastAPI gateway",
    status: "healthy",
    latencyMs: 41,
    detail: "port 8080 · exception guard active · fail-safe on",
    uptimePct: 99.99,
  },
]

/* -------------------------------------------------------------------------- */
/* Time-series — last 12 hours of traffic                                     */
/* -------------------------------------------------------------------------- */

export const timeSeries: TimeSeriesPoint[] = Array.from({ length: 24 }).map((_, i) => {
  const hour = (new Date().getHours() - 23 + i + 24) % 24
  const base = 240 + Math.sin(i / 3) * 90 + (i % 7) * 12
  const queries = Math.round(base)
  const escalationRate = 0.08 + Math.max(0, Math.sin(i / 4 - 1)) * 0.12 + (i % 5 === 0 ? 0.05 : 0)
  return {
    t: `${String(hour).padStart(2, "0")}:00`,
    queries,
    tokensSaved: Math.round(queries * (1 - escalationRate) * 168),
    tokensPaid: Math.round(queries * escalationRate * 412),
    escalationRate: Number(escalationRate.toFixed(3)),
  }
})

/* -------------------------------------------------------------------------- */
/* Helper formatters                                                          */
/* -------------------------------------------------------------------------- */

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US")
}

export function fmtPct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`
}

export function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`
}

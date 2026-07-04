"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Play,
  RotateCcw,
  Database,
  GitBranch,
  Cpu,
  ShieldCheck,
  RefreshCw,
  Server,
  CheckCircle2,
  Zap,
  AlertTriangle,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  samplePrompts,
  buildTrace,
  type RoutingTrace,
  type RoutingStep,
  type RouteTier,
  type SamplePrompt,
  fmtInt,
  fmtPct,
} from "@/lib/cascade-data"

const tierStyles: Record<
  string,
  { label: string; bg: string; text: string; ring: string; icon: typeof Database }
> = {
  input: {
    label: "Input",
    bg: "bg-muted/40",
    text: "text-muted-foreground",
    ring: "ring-border",
    icon: Zap,
  },
  cache: {
    label: "Cache",
    bg: "bg-[oklch(0.65_0.2_200)]/15",
    text: "text-[oklch(0.65_0.2_200)]",
    ring: "ring-[oklch(0.65_0.2_200)]/40",
    icon: Database,
  },
  "early-exit": {
    label: "Early-Exit",
    bg: "bg-[oklch(0.78_0.18_85)]/15",
    text: "text-[oklch(0.78_0.18_85)]",
    ring: "ring-[oklch(0.78_0.18_85)]/40",
    icon: GitBranch,
  },
  local: {
    label: "Local",
    bg: "bg-[oklch(0.72_0.18_162)]/15",
    text: "text-[oklch(0.72_0.18_162)]",
    ring: "ring-[oklch(0.72_0.18_162)]/40",
    icon: Cpu,
  },
  refine: {
    label: "Refine",
    bg: "bg-[oklch(0.7_0.18_295)]/15",
    text: "text-[oklch(0.7_0.18_295)]",
    ring: "ring-[oklch(0.7_0.18_295)]/40",
    icon: RefreshCw,
  },
  meta: {
    label: "Meta-Router",
    bg: "bg-[oklch(0.7_0.18_295)]/15",
    text: "text-[oklch(0.7_0.18_295)]",
    ring: "ring-[oklch(0.7_0.18_295)]/40",
    icon: ShieldCheck,
  },
  escalated: {
    label: "Fireworks",
    bg: "bg-[oklch(0.7_0.22_35)]/15",
    text: "text-[oklch(0.7_0.22_35)]",
    ring: "ring-[oklch(0.7_0.22_35)]/40",
    icon: Server,
  },
}

export function SandboxSection() {
  const [prompt, setPrompt] = useState<SamplePrompt>(samplePrompts[0])
  const [customTask, setCustomTask] = useState(samplePrompts[0].task)
  const [cached, setCached] = useState(false)
  const [trace, setTrace] = useState<RoutingTrace | null>(null)
  const [visibleSteps, setVisibleSteps] = useState<RoutingStep[]>([])
  const [running, setRunning] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const run = useCallback(() => {
    // Cancel any in-flight animation from a previous run.
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setRunning(true)
    setVisibleSteps([])
    setTrace(null)
    const full = buildTrace(prompt, cached)
    // Reveal steps one by one for the cascade feel.
    let i = 0
    const tick = () => {
      if (i >= full.steps.length) {
        setTrace(full)
        setRunning(false)
        return
      }
      const nextStep = full.steps[i]
      if (!nextStep) {
        // Defensive — should never happen, but guard against undefined slots.
        i += 1
        timerRef.current = setTimeout(tick, 480)
        return
      }
      setVisibleSteps((prev) => [...prev, nextStep])
      i += 1
      timerRef.current = setTimeout(tick, 480)
    }
    tick()
  }, [prompt, cached])

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisibleSteps([])
    setTrace(null)
    setRunning(false)
  }, [])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const selectPrompt = (p: SamplePrompt) => {
    setPrompt(p)
    setCustomTask(p.task)
    setCached(p.id === "cached")
    reset()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Live routing sandbox
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Submit a query and watch the cascade execute step-by-step through the
            early-exit gate, ConcurrentCISC verifier, and meta-classifier boundary.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.72_0.18_162)] animate-pulse" />
            vLLM online
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Fireworks ready
          </span>
        </div>
      </div>

      {/* Sample prompt selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {samplePrompts.map((p) => {
          const isActive = prompt.id === p.id
          const Icon = tierStyles[
            p.expectedRoute === "cache"
              ? "cache"
              : p.expectedRoute === "escalated"
                ? "escalated"
                : p.expectedRoute === "refine"
                  ? "refine"
                  : "local"
          ].icon
          return (
            <button
              key={p.id}
              onClick={() => selectPrompt(p)}
              className={cn(
                "group text-left rounded-xl border p-3 transition-all",
                isActive
                  ? "border-primary/50 bg-primary/10 shadow-lg glow-crimson"
                  : "border-border bg-card/40 hover:bg-card/80 hover:border-border"
              )}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-md",
                    tierStyles[
                      p.expectedRoute === "cache"
                        ? "cache"
                        : p.expectedRoute === "escalated"
                          ? "escalated"
                          : p.expectedRoute === "refine"
                            ? "refine"
                            : "local"
                    ].bg
                  )}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                  p-easy {p.pEasy.toFixed(2)}
                </span>
              </div>
              <div className="text-xs font-medium leading-tight">{p.label}</div>
              <div className="text-[10px] text-muted-foreground mt-1 leading-tight line-clamp-2">
                {p.task}
              </div>
            </button>
          )
        })}
      </div>

      {/* Main grid: prompt | trace */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
        {/* Prompt input panel */}
        <div className="glass-card rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Query</h3>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cached}
                onChange={(e) => setCached(e.target.checked)}
                className="accent-primary"
              />
              Force cache hit
            </label>
          </div>
          <Textarea
            value={customTask}
            onChange={(e) => setCustomTask(e.target.value)}
            rows={6}
            className="resize-none font-mono text-xs bg-background/60"
            placeholder="Enter a query for the cascade…"
          />
          <div className="mt-3 flex items-center gap-2">
            <Button
              onClick={run}
              disabled={running}
              className="gap-1.5 bg-primary hover:bg-primary/90"
            >
              <Play className="h-3.5 w-3.5" />
              {running ? "Routing…" : "Route query"}
            </Button>
            <Button variant="outline" onClick={reset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
          </div>

          {/* Telemetry readout */}
          {trace && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 grid grid-cols-2 gap-2"
            >
              <Readout label="P-easy" value={trace.pEasy.toFixed(2)} tone="warn" />
              <Readout
                label="Agreement"
                value={trace.agreement > 0 ? trace.agreement.toFixed(2) : "—"}
                tone="free"
              />
              <Readout
                label="Judge score"
                value={trace.judgeScore > 0 ? trace.judgeScore.toFixed(1) : "—"}
                tone="meta"
              />
              <Readout
                label="Meta-conf"
                value={trace.metaConfidence > 0 ? trace.metaConfidence.toFixed(2) : "—"}
                tone="meta"
              />
            </motion.div>
          )}
        </div>

        {/* Trace timeline */}
        <div className="glass-card rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Execution trace</h3>
            {trace && (
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-muted-foreground">
                  Duration{" "}
                  <span className="font-mono text-foreground">
                    {trace.durationMs}ms
                  </span>
                </span>
                <span className="text-muted-foreground">
                  Paid tokens{" "}
                  <span className="font-mono text-[oklch(0.7_0.22_35)] font-semibold">
                    {fmtInt(trace.tokensPaid)}
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-[280px]">
            {visibleSteps.length === 0 && !running ? (
              <EmptyState />
            ) : (
              <ol className="relative space-y-2">
                {visibleSteps.map((step, idx) => {
                  if (!step) return null
                  return (
                    <TraceStep
                      key={`${step.id}-${idx}-${step.label}`}
                      step={step}
                      isLast={idx === visibleSteps.length - 1 && running}
                    />
                  )
                })}
              </ol>
            )}
          </div>

          {/* Final answer */}
          <AnimatePresence>
            {trace && !running && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 border-t border-border pt-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={cn(
                        "h-4 w-4",
                        trace.route === "escalated"
                          ? "text-[oklch(0.7_0.22_35)]"
                          : "text-[oklch(0.72_0.18_162)]"
                      )}
                    />
                    <span className="text-xs font-semibold uppercase tracking-wider">
                      Final answer · routed via{" "}
                      <span className={routeTextColor(trace.route)}>
                        {routeLabel(trace.route)}
                      </span>
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-mono px-2 py-0.5 rounded-full",
                      trace.tokensPaid === 0
                        ? "bg-[oklch(0.72_0.18_162)]/15 text-[oklch(0.72_0.18_162)]"
                        : "bg-[oklch(0.7_0.22_35)]/15 text-[oklch(0.7_0.22_35)]"
                    )}
                  >
                    {trace.tokensPaid === 0
                      ? "0 paid tokens"
                      : `${fmtInt(trace.tokensPaid)} paid tokens`}
                  </span>
                </div>
                <div className="rounded-lg border border-border bg-background/60 p-3 text-xs leading-relaxed">
                  {trace.answer}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Step reference legend */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Step reference</h3>
          <span className="text-[11px] text-muted-foreground">
            Hover tiers to inspect defensive fail-safes
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {Object.entries(tierStyles).map(([key, ts]) => {
            const Icon = ts.icon
            return (
              <div
                key={key}
                className={cn(
                  "rounded-lg border border-border bg-card/40 p-2.5 ring-1",
                  ts.ring
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-md",
                      ts.bg
                    )}
                  >
                    <Icon className={cn("h-3 w-3", ts.text)} />
                  </span>
                  <span className="text-xs font-medium">{ts.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
                  {stepDescription(key)}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function TraceStep({
  step,
  isLast,
}: {
  step: RoutingStep
  isLast: boolean
}) {
  if (!step) return null
  const ts = tierStyles[step.tier]
  if (!ts) return null
  const Icon = ts.icon
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="relative flex items-start gap-3"
    >
      {/* Icon */}
      <div className="relative flex flex-col items-center">
        <span
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-lg ring-1 z-10",
            ts.bg,
            ts.ring
          )}
        >
          <Icon className={cn("h-4 w-4", ts.text)} />
        </span>
        {isLast && (
          <span className="absolute inset-0 rounded-lg ring-2 ring-primary/40 animate-ping" />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0 pb-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-semibold truncate">{step.label}</span>
            <span
              className={cn(
                "text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded",
                ts.bg,
                ts.text
              )}
            >
              {ts.label}
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
            {step.durationMs}ms
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
          {step.detail}
        </p>
        {step.tokensPaid > 0 && (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[oklch(0.7_0.22_35)]">
            <AlertTriangle className="h-3 w-3" />
            <span className="font-mono">
              {fmtInt(step.tokensPaid)} paid tokens billed
            </span>
          </div>
        )}
      </div>
    </motion.li>
  )
}

function EmptyState() {
  return (
    <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center">
      <div className="h-12 w-12 rounded-xl bg-muted/40 flex items-center justify-center mb-3">
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">
        Select a sample prompt and hit{" "}
        <span className="text-foreground font-medium">Route query</span> to
        execute the cascade.
      </p>
    </div>
  )
}

function Readout({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "free" | "paid" | "meta" | "warn" | "cache"
}) {
  const tones: Record<string, string> = {
    free: "text-[oklch(0.72_0.18_162)]",
    paid: "text-[oklch(0.7_0.22_35)]",
    meta: "text-[oklch(0.7_0.18_295)]",
    warn: "text-[oklch(0.78_0.18_85)]",
    cache: "text-[oklch(0.65_0.2_200)]",
  }
  return (
    <div className="rounded-lg border border-border bg-background/60 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-base font-mono font-semibold tabular-nums", tones[tone])}>
        {value}
      </div>
    </div>
  )
}

function routeLabel(r: RouteTier): string {
  return (
    {
      cache: "Semantic Cache",
      local: "Local Gemma 4B",
      refine: "Local Refine",
      escalated: "Fireworks 27B",
    }[r] ?? r
  )
}

function routeTextColor(r: RouteTier): string {
  return (
    {
      cache: "text-[oklch(0.65_0.2_200)]",
      local: "text-[oklch(0.72_0.18_162)]",
      refine: "text-[oklch(0.7_0.18_295)]",
      escalated: "text-[oklch(0.7_0.22_35)]",
    }[r] ?? "text-foreground"
  )
}

function stepDescription(tier: string): string {
  return (
    {
      input: "Task ingested, tokenized via cl100k_base",
      cache: "SQLite + FAISS lookup at cosine ≥ 0.96",
      "early-exit":
        "Logistic head on embeddings → P-easy gate at 0.25",
      local: "vLLM n=3 batch on Gemma 3 4B BF16",
      refine: "1-round local self-refinement with critique",
      meta: "XGBoost + Isotonic → route by calibrated conf",
      escalated:
        "Fireworks Gemma 3 27B with prefix-cached hand-off",
    } as Record<string, string>
  )[tier] ?? ""
}

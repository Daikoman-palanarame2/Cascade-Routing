"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import {
  BarChart3,
  TrendingDown,
  CheckCircle2,
  Target,
  Layers,
  Sparkles,
  Play,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react"
import {
  ScatterChart,
  Scatter,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ZAxis,
  ReferenceLine,
  ReferenceArea,
  Cell,
  BarChart,
  Bar,
} from "recharts"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const ACCURACY_THRESHOLD = 0.9

type Condition = "baseline" | "cache" | "earlyExit" | "cisc" | "metaRouter"

interface ConditionResult {
  condition: Condition
  accuracy: number
  tokensPaid: number
  tokensSavedPct: number
  queries: number
  correctCount: number
  cacheHits: number
  escalations: number
  localAccepted: number
  durationMs: number
}

interface AblationRunSummary {
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

const CONDITION_META: Record<
  Condition,
  { label: string; description: string }
> = {
  baseline: {
    label: "Baseline (no cascade)",
    description:
      "Every query hits Gemma 27B via Fireworks. Highest accuracy, highest cost.",
  },
  cache: {
    label: "+ Semantic Cache",
    description:
      "Cosine ≥ 0.96 returns cached answer. Negligible accuracy loss, modest savings.",
  },
  earlyExit: {
    label: "+ Early-Exit Gate",
    description:
      "P-easy < 0.25 skips local model; easy queries now run on free local Gemma 4B.",
  },
  cisc: {
    label: "+ ConcurrentCISC (n=3)",
    description:
      "Local agreement signal + judge gate. Accuracy recovers above baseline.",
  },
  metaRouter: {
    label: "+ Meta-Router (XGBoost)",
    description:
      "Calibrated XGBoost + Isotonic. Routes by confidence — major token savings.",
  },
}

export function AblationSection() {
  const [run, setRun] = useState<AblationRunSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/cascade/ablation")
      const data = await r.json()
      if (data.ok) {
        setRun(data.run)
      }
    } catch (err) {
      console.error("[ablation] refresh failed:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    // Poll every 5s if running, every 30s otherwise
    const t = setInterval(refresh, 5_000)
    return () => clearInterval(t)
  }, [refresh])

  const startRun = useCallback(async () => {
    setStarting(true)
    try {
      await fetch("/api/cascade/ablation/run", { method: "POST" })
      // Immediate refresh to pick up the new run state
      setTimeout(refresh, 500)
    } catch (err) {
      console.error("[ablation] start failed:", err)
    } finally {
      setStarting(false)
    }
  }, [refresh])

  const isRunning = run?.status === "running"
  const conditions = run?.conditions ?? []
  const hasResults = conditions.length > 0

  // Build scatter data from live results
  const scatterData = conditions.map((c) => ({
    x: c.tokensPaid,
    y: c.accuracy,
    z: c.tokensSavedPct * 100,
    label: CONDITION_META[c.condition].label,
    row: c,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Ablation harness — Pareto frontier
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Each toggle is layered on top of the previous one. The Pareto
            frontier shows accuracy vs paid-token cost — every step pulls the
            system further into the &ldquo;low cost / accuracy ≥ threshold&rdquo;
            quadrant. Runs the live cascade on {run?.totalQueries ?? 23}{" "}
            stratified queries.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-[11px]">
            <Target className="h-3.5 w-3.5 text-primary" />
            Accuracy floor{" "}
            <span className="font-mono font-semibold">
              {(ACCURACY_THRESHOLD * 100).toFixed(0)}%
            </span>
          </div>
          <Button
            onClick={startRun}
            disabled={isRunning || starting}
            className="gap-1.5"
          >
            {isRunning || starting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {isRunning
              ? `Running ${run?.progress ?? 0}%`
              : starting
                ? "Starting…"
                : "Run ablation"}
          </Button>
        </div>
      </div>

      {/* Running progress bar */}
      {isRunning && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card glass-card-accent rounded-2xl p-5"
        >
          <div className="flex items-center gap-3 mb-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <div className="flex-1">
              <div className="text-sm font-semibold">
                Running ablation harness — {run?.progress ?? 0}% complete
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {conditions.length}/5 conditions done ·{" "}
                {run?.totalQueries ?? 23} queries per condition · ~3-5 min total
              </div>
            </div>
          </div>
          <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-[oklch(0.7_0.18_295)]"
              animate={{ width: `${run?.progress ?? 0}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </motion.div>
      )}

      {/* Failed state */}
      {run?.status === "failed" && (
        <div className="glass-card rounded-2xl p-5 border-[oklch(0.7_0.22_35)]/40">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-[oklch(0.7_0.22_35)]" />
            <div>
              <div className="text-sm font-semibold">Ablation run failed</div>
              <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                {run.error}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasResults && !isRunning && !loading && (
        <div className="glass-card rounded-2xl p-12 text-center">
          <div className="h-12 w-12 rounded-xl bg-muted/40 flex items-center justify-center mx-auto mb-3">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-semibold">No ablation runs yet</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Click <span className="text-foreground font-medium">Run ablation</span>{" "}
            to execute the 5 toggle conditions on the eval set. Takes ~3-5
            minutes and replaces the Pareto chart with real numbers.
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && !hasResults && (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Loading latest ablation run…
          </p>
        </div>
      )}

      {/* Results */}
      {hasResults && (
        <>
          {/* Pareto scatter */}
          <section className="glass-card glass-card-accent rounded-2xl p-5 md:p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold">
                  Accuracy vs paid tokens — live results
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lower-right is better. Shaded zone = accuracy floor met.
                  {run?.completedAt && (
                    <span className="ml-2 text-muted-foreground/70">
                      Last run: {new Date(run.completedAt).toLocaleTimeString()}
                    </span>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={refresh}
                disabled={isRunning}
                className="gap-1.5 h-8 text-xs"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 16, right: 32, bottom: 16, left: 0 }}>
                  <CartesianGrid stroke="oklch(1 0 0 / 6)" />
                  <ReferenceArea
                    y1={ACCURACY_THRESHOLD}
                    y2={1.0}
                    x1={0}
                    x2={run ? run.baselineTokens * 0.6 : 500_000}
                    fill="oklch(0.72 0.18 162)"
                    fillOpacity={0.06}
                    stroke="none"
                  />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Paid tokens"
                    stroke="oklch(0.7 0.02 255)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    domain={[0, "auto"]}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Accuracy"
                    stroke="oklch(0.7 0.02 255)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    domain={[0.5, 1.0]}
                    tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  />
                  <ZAxis type="number" dataKey="z" range={[200, 600]} />
                  <ReferenceLine
                    y={ACCURACY_THRESHOLD}
                    stroke="oklch(0.7 0.22 35)"
                    strokeDasharray="4 4"
                    label={{
                      value: `acc ≥ ${(ACCURACY_THRESHOLD * 100).toFixed(0)}%`,
                      position: "insideTopLeft",
                      fill: "oklch(0.7 0.22 35)",
                      fontSize: 10,
                    }}
                  />
                  <Tooltip
                    cursor={{ stroke: "oklch(1 0 0 / 20%)", strokeWidth: 1 }}
                    content={({ payload }) => {
                      if (!payload?.length) return null
                      const p = payload[0].payload
                      return (
                        <div className="rounded-lg border border-border bg-popover p-3 max-w-xs">
                          <div className="text-xs font-semibold mb-1">
                            {p.label}
                          </div>
                          <div className="text-[10px] text-muted-foreground space-y-0.5">
                            <div>
                              Paid tokens:{" "}
                              <span className="font-mono text-foreground">
                                {p.x.toLocaleString()}
                              </span>
                            </div>
                            <div>
                              Accuracy:{" "}
                              <span className="font-mono text-foreground">
                                {(p.y * 100).toFixed(1)}%
                              </span>{" "}
                              ({p.row.correctCount}/{p.row.queries})
                            </div>
                            <div>
                              Saved:{" "}
                              <span className="font-mono text-[oklch(0.72_0.18_162)]">
                                {(p.z).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Scatter data={scatterData} fill="oklch(0.62 0.24 27)">
                    {scatterData.map((d, i) => {
                      const isWinner = d.row.condition === "metaRouter"
                      return (
                        <Cell
                          key={i}
                          fill={
                            isWinner
                              ? "oklch(0.72 0.18 162)"
                              : "oklch(0.62 0.24 27)"
                          }
                          stroke={
                            isWinner
                              ? "oklch(0.72 0.18 162)"
                              : "oklch(0.7 0.22 35)"
                          }
                          strokeWidth={2}
                        />
                      )
                    })}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Toggle grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {conditions.map((row, i) => {
              const meta = CONDITION_META[row.condition]
              const isWinner = row.condition === "metaRouter"
              return (
                <motion.div
                  key={row.condition}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={cn(
                    "rounded-2xl border p-4 transition-all",
                    isWinner
                      ? "border-[oklch(0.72_0.18_162)]/40 bg-[oklch(0.72_0.18_162)]/5 shadow-lg glow-emerald"
                      : "border-border bg-card/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-md font-mono text-[10px] font-bold",
                          isWinner
                            ? "bg-[oklch(0.72_0.18_162)]/15 text-[oklch(0.72_0.18_162)]"
                            : "bg-muted/40 text-muted-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm font-semibold leading-tight">
                        {meta.label}
                      </span>
                    </div>
                    {isWinner && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.72_0.18_162)]/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[oklch(0.72_0.18_162)]">
                        <Sparkles className="h-2.5 w-2.5" />
                        Best
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                    {meta.description}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <Metric
                      label="Accuracy"
                      value={`${(row.accuracy * 100).toFixed(1)}%`}
                      tone={
                        row.accuracy >= ACCURACY_THRESHOLD ? "free" : "paid"
                      }
                    />
                    <Metric
                      label="Tokens paid"
                      value={row.tokensPaid.toLocaleString()}
                      tone="muted"
                    />
                    <Metric
                      label="Saved"
                      value={`${(row.tokensSavedPct * 100).toFixed(1)}%`}
                      tone={row.tokensSavedPct > 0.5 ? "free" : "warn"}
                    />
                  </div>
                  <div className="mt-3 pt-2 border-t border-border/40 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      {row.correctCount}/{row.queries} correct
                    </span>
                    <span>·</span>
                    <span>{(row.durationMs / 1000).toFixed(1)}s</span>
                    {row.cacheHits > 0 && (
                      <>
                        <span>·</span>
                        <span>{row.cacheHits} cache hits</span>
                      </>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </section>

          {/* Savings bars + summary */}
          <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3 glass-card rounded-2xl p-5 md:p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold">
                    Token savings by toggle — live
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cumulative savings vs baseline (no cascade)
                  </p>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={conditions.map((c) => ({
                      toggle: CONDITION_META[c.condition].label,
                      tokensSavedPct: c.tokensSavedPct * 100,
                      condition: c.condition,
                    }))}
                    layout="vertical"
                    margin={{ top: 8, right: 32, bottom: 0, left: 80 }}
                  >
                    <CartesianGrid stroke="oklch(1 0 0 / 6)" horizontal={false} />
                    <XAxis
                      type="number"
                      stroke="oklch(0.7 0.02 255)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${v}%`}
                      domain={[0, 100]}
                    />
                    <YAxis
                      type="category"
                      dataKey="toggle"
                      stroke="oklch(0.7 0.02 255)"
                      fontSize={9}
                      tickLine={false}
                      axisLine={false}
                      width={140}
                      tickFormatter={(v) =>
                        v.length > 18 ? v.slice(0, 18) + "…" : v
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        background: "oklch(0.205 0.014 255)",
                        border: "1px solid oklch(1 0 0 / 12%)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: any) => `${v}%`}
                    />
                    <Bar dataKey="tokensSavedPct" radius={[0, 6, 6, 0]}>
                      {conditions.map((c, i) => (
                        <Cell
                          key={i}
                          fill={
                            c.tokensSavedPct > 0.5
                              ? "oklch(0.72 0.18 162)"
                              : c.tokensSavedPct > 0.2
                                ? "oklch(0.7 0.18 295)"
                                : "oklch(0.62 0.24 27)"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Summary stats */}
            <div className="lg:col-span-2 glass-card rounded-2xl p-5 md:p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-sm font-semibold">Run summary</h3>
              </div>
              <div className="space-y-2 text-xs flex-1">
                <SummaryRow
                  label="Queries per condition"
                  value={String(run?.totalQueries ?? 0)}
                />
                <SummaryRow
                  label="Conditions run"
                  value={`${conditions.length}/5`}
                />
                <SummaryRow
                  label="Baseline tokens"
                  value={run?.baselineTokens.toLocaleString() ?? "—"}
                />
                {(() => {
                  const winner = conditions.find(
                    (c) => c.condition === "metaRouter",
                  )
                  return winner ? (
                    <>
                      <SummaryRow
                        label="Cascade tokens"
                        value={winner.tokensPaid.toLocaleString()}
                        tone="paid"
                      />
                      <SummaryRow
                        label="Total saved"
                        value={`${(winner.tokensSavedPct * 100).toFixed(1)}%`}
                        tone="free"
                        bold
                      />
                      <SummaryRow
                        label="Cascade accuracy"
                        value={`${(winner.accuracy * 100).toFixed(1)}%`}
                        tone={
                          winner.accuracy >= ACCURACY_THRESHOLD ? "free" : "paid"
                        }
                      />
                      <SummaryRow
                        label="Floor met?"
                        value={
                          winner.accuracy >= ACCURACY_THRESHOLD ? "YES" : "NO"
                        }
                        tone={
                          winner.accuracy >= ACCURACY_THRESHOLD ? "free" : "paid"
                        }
                      />
                    </>
                  ) : null
                })()}
              </div>
              {run?.completedAt && (
                <div className="mt-3 pt-3 border-t border-border/40 text-[10px] text-muted-foreground">
                  Completed {new Date(run.completedAt).toLocaleString()}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function Metric({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "free" | "paid" | "warn" | "muted"
}) {
  const tones = {
    free: "text-[oklch(0.72_0.18_162)]",
    paid: "text-[oklch(0.7_0.22_35)]",
    warn: "text-[oklch(0.78_0.18_85)]",
    muted: "text-foreground",
  }
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-mono font-semibold tabular-nums mt-0.5",
          tones[tone],
        )}
      >
        {value}
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  tone,
  bold,
}: {
  label: string
  value: string
  tone?: "free" | "paid"
  bold?: boolean
}) {
  const toneClass =
    tone === "free"
      ? "text-[oklch(0.72_0.18_162)]"
      : tone === "paid"
        ? "text-[oklch(0.7_0.22_35)]"
        : "text-foreground"
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          bold ? "font-bold text-base" : "font-semibold text-xs",
          toneClass,
        )}
      >
        {value}
      </span>
    </div>
  )
}

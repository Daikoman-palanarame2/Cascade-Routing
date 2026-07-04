"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  Database,
  Search,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Activity,
  RefreshCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import {
  telemetryRows,
  shadowModeStats,
  fmtInt,
  fmtPct,
  type RouteTier,
} from "@/lib/cascade-data"

const routeColor: Record<RouteTier, string> = {
  cache: "text-[oklch(0.65_0.2_200)] bg-[oklch(0.65_0.2_200)]/15",
  local: "text-[oklch(0.72_0.18_162)] bg-[oklch(0.72_0.18_162)]/15",
  refine: "text-[oklch(0.7_0.18_295)] bg-[oklch(0.7_0.18_295)]/15",
  escalated: "text-[oklch(0.7_0.22_35)] bg-[oklch(0.7_0.22_35)]/15",
}

export function TelemetrySection() {
  const [filter, setFilter] = useState("")
  const [showDivergentOnly, setShowDivergentOnly] = useState(false)

  const filtered = telemetryRows.filter((r) => {
    if (showDivergentOnly && !r.divergence) return false
    if (filter) {
      const q = filter.toLowerCase()
      return (
        r.fallbackRoute.includes(q) ||
        r.shadowRoute.includes(q) ||
        String(r.id).includes(q) ||
        r.timestamp.includes(q)
      )
    }
    return true
  })

  const divergencePct = shadowModeStats.divergencePct
  const gatePassed = divergencePct <= shadowModeStats.threshold

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Shadow-mode telemetry
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            XGBoost runs in parallel with the deterministic fallback on every
            live query. Both routes are persisted to SQLite; engage_meta_router.py
            promotes the model only when divergence stays under 20%.
          </p>
        </div>
      </div>

      {/* Divergence gate banner */}
      <section
        className={cn(
          "glass-card rounded-2xl p-5 md:p-6 relative overflow-hidden",
          gatePassed ? "glow-emerald" : "glow-crimson"
        )}
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1 flex items-start gap-3">
            <span
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-xl",
                gatePassed
                  ? "bg-[oklch(0.72_0.18_162)]/15"
                  : "bg-[oklch(0.7_0.22_35)]/15"
              )}
            >
              {gatePassed ? (
                <CheckCircle2 className="h-5 w-5 text-[oklch(0.72_0.18_162)]" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-[oklch(0.7_0.22_35)]" />
              )}
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Divergence gate
              </div>
              <div
                className={cn(
                  "text-lg font-bold",
                  gatePassed
                    ? "text-[oklch(0.72_0.18_162)]"
                    : "text-[oklch(0.7_0.22_35)]"
                )}
              >
                {gatePassed ? "PASSED" : "BLOCKED"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                XGBoost engaged live
              </div>
            </div>
          </div>

          <Stat
            label="Queries processed"
            value={fmtInt(shadowModeStats.queriesProcessed)}
            sub={`of ${shadowModeStats.requiredQueries} required`}
            progress={shadowModeStats.queriesProcessed / shadowModeStats.requiredQueries}
          />
          <Stat
            label="Divergence rate"
            value={fmtPct(divergencePct, 1)}
            sub={`gate ≤ ${fmtPct(shadowModeStats.threshold, 0)}`}
            progress={divergencePct / shadowModeStats.threshold}
            invert
          />
          <Stat
            label="Divergent rows"
            value={fmtInt(shadowModeStats.divergenceCount)}
            sub="manual spot-check required"
          />
        </div>

        {/* SQL preview */}
        <div className="mt-4 rounded-lg border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed overflow-x-auto">
          <span className="text-muted-foreground">-- engage_meta_router.py</span>
          <br />
          <span className="text-primary">SELECT</span>{" "}
          <span className="text-foreground">AVG(CAST(divergence AS FLOAT))</span>{" "}
          <span className="text-primary">FROM</span>{" "}
          <span className="text-foreground">shadow_telemetry</span>
          <br />
          <span className="text-primary">WHERE</span>{" "}
          <span className="text-foreground">id &gt; </span>
          <span className="text-[oklch(0.78_0.18_85)]">(SELECT MAX(id) - 50 FROM shadow_telemetry)</span>
          <span className="text-muted-foreground">;</span>
          <span className="ml-3 text-[oklch(0.72_0.18_162)]">-- 0.164 ✓</span>
        </div>
      </section>

      {/* Filter bar */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by route, ID, or timestamp…"
              className="pl-9 bg-background/60 h-9 text-xs"
            />
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDivergentOnly}
              onChange={(e) => setShowDivergentOnly(e.target.checked)}
              className="accent-primary"
            />
            Show divergent rows only
          </label>
          <div className="text-[11px] text-muted-foreground">
            {filtered.length} of {telemetryRows.length} rows · live tail
          </div>
        </div>
      </div>

      {/* Telemetry table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-sm font-semibold">shadow_telemetry table</h3>
            <span className="text-[10px] text-muted-foreground font-mono">
              eval/cache.db
            </span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.72_0.18_162)] animate-pulse" />
            aiosqlite · streaming
          </span>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium px-4 py-2.5">id</th>
                <th className="text-left font-medium px-4 py-2.5">timestamp</th>
                <th className="text-right font-medium px-4 py-2.5">tokens</th>
                <th className="text-right font-medium px-4 py-2.5">p-easy</th>
                <th className="text-left font-medium px-4 py-2.5">fallback</th>
                <th className="text-left font-medium px-4 py-2.5">shadow</th>
                <th className="text-center font-medium px-4 py-2.5">divergent</th>
                <th className="text-center font-medium px-4 py-2.5">refined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <motion.tr
                  key={row.id}
                  initial={i < 3 ? { opacity: 0, y: -4 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "border-b border-border/60 hover:bg-muted/20 transition-colors",
                    row.divergence && "bg-[oklch(0.7_0.22_35)]/5"
                  )}
                >
                  <td className="px-4 py-2.5 font-mono text-muted-foreground">
                    {row.id}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-muted-foreground">
                    {row.timestamp}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {row.tokenLen}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    <span
                      className={cn(
                        row.pEasy < 0.25
                          ? "text-[oklch(0.7_0.22_35)]"
                          : row.pEasy < 0.5
                            ? "text-[oklch(0.78_0.18_85)]"
                            : "text-foreground"
                      )}
                    >
                      {row.pEasy.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-[10px] font-mono uppercase",
                        routeColor[row.fallbackRoute]
                      )}
                    >
                      {row.fallbackRoute}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-[10px] font-mono uppercase",
                        routeColor[row.shadowRoute]
                      )}
                    >
                      {row.shadowRoute}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {row.divergence ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-[oklch(0.7_0.22_35)] mx-auto" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[oklch(0.72_0.18_162)] mx-auto opacity-50" />
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {row.didRefine ? (
                      <RefreshCw className="h-3 w-3 text-[oklch(0.7_0.18_295)] mx-auto" />
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            No rows match the current filter.
          </div>
        )}
      </div>

      {/* Calibration bounds callout */}
      <section className="glass-card glass-card-accent rounded-2xl p-5 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[oklch(0.7_0.18_295)]/15 text-[oklch(0.7_0.18_295)]">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">Validation bounds (locked)</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Before XGBoost can go live, it must clear three gates on the
              held-out validation set. Any miss keeps{" "}
              <code className="text-foreground">_is_fitted = False</code> and
              the deterministic linear fallback continues to serve traffic.
            </p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              <BoundChip
                label="AUC"
                actual="0.81"
                target="≥ 0.75"
                pass
              />
              <BoundChip
                label="Brier score"
                actual="0.13"
                target="≤ 0.15"
                pass
              />
              <BoundChip
                label="Divergence (50q window)"
                actual={fmtPct(divergencePct, 1)}
                target={`≤ ${fmtPct(shadowModeStats.threshold, 0)}`}
                pass={gatePassed}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function Stat({
  label,
  value,
  sub,
  progress,
  invert,
}: {
  label: string
  value: string
  sub: string
  progress?: number
  invert?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
      {progress !== undefined && (
        <div className="mt-2 h-1 rounded-full bg-muted/40 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              invert
                ? progress >= 1
                  ? "bg-[oklch(0.7_0.22_35)]"
                  : "bg-[oklch(0.78_0.18_85)]"
                : "bg-[oklch(0.72_0.18_162)]"
            )}
            style={{ width: `${Math.min(progress * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  )
}

function BoundChip({
  label,
  actual,
  target,
  pass,
}: {
  label: string
  actual: string
  target: string
  pass: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        pass
          ? "border-[oklch(0.72_0.18_162)]/30 bg-[oklch(0.72_0.18_162)]/5"
          : "border-[oklch(0.7_0.22_35)]/30 bg-[oklch(0.7_0.22_35)]/5"
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        {pass ? (
          <CheckCircle2 className="h-3 w-3 text-[oklch(0.72_0.18_162)]" />
        ) : (
          <AlertTriangle className="h-3 w-3 text-[oklch(0.7_0.22_35)]" />
        )}
      </div>
      <div className="font-mono text-sm font-semibold">{actual}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        target {target}
      </div>
    </div>
  )
}

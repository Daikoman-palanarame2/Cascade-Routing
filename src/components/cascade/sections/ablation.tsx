"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  BarChart3,
  TrendingDown,
  CheckCircle2,
  Target,
  Layers,
  Sparkles,
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
  LabelList,
  BarChart,
  Bar,
  Cell,
} from "recharts"
import { cn } from "@/lib/utils"
import { ablationRows, fmtInt, fmtPct, type AblationRow } from "@/lib/cascade-data"

const ACCURACY_THRESHOLD = 0.9

export function AblationSection() {
  const [selected, setSelected] = useState<AblationRow>(ablationRows[ablationRows.length - 1])

  const scatterData = ablationRows.map((r) => ({
    x: r.tokensPaid,
    y: r.accuracy,
    z: r.tokensSavedPct,
    label: r.toggle,
    row: r,
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
            quadrant.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-[11px]">
          <Target className="h-3.5 w-3.5 text-primary" />
          Accuracy floor{" "}
          <span className="font-mono font-semibold">{fmtPct(ACCURACY_THRESHOLD, 0)}</span>
        </div>
      </div>

      {/* Pareto scatter */}
      <section className="glass-card glass-card-accent rounded-2xl p-5 md:p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">Accuracy vs paid tokens</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Lower-right is better. Shaded zone = accuracy floor met.
            </p>
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 16, right: 32, bottom: 16, left: 0 }}>
              <CartesianGrid stroke="oklch(1 0 0 / 6)" />
              {/* Shaded success zone: accuracy ≥ threshold, low tokens */}
              <ReferenceArea
                y1={ACCURACY_THRESHOLD}
                y2={1.0}
                x1={0}
                x2={500_000}
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
                domain={[0, 1_600_000]}
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
                domain={[0.9, 0.96]}
                tickFormatter={(v) => fmtPct(v, 0)}
              />
              <ZAxis type="number" dataKey="z" range={[200, 600]} />
              <ReferenceLine
                y={ACCURACY_THRESHOLD}
                stroke="oklch(0.7 0.22 35)"
                strokeDasharray="4 4"
                label={{
                  value: `acc ≥ ${fmtPct(ACCURACY_THRESHOLD, 0)}`,
                  position: "insideTopLeft",
                  fill: "oklch(0.7 0.22 35)",
                  fontSize: 10,
                }}
              />
              <Tooltip
                cursor={{ stroke: "oklch(1 0 0 / 20%)", strokeWidth: 1 }}
                contentStyle={{
                  background: "oklch(0.205 0.014 255)",
                  border: "1px solid oklch(1 0 0 / 12%)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                content={({ payload }) => {
                  if (!payload?.length) return null
                  const p = payload[0].payload
                  return (
                    <div className="rounded-lg border border-border bg-popover p-3 max-w-xs">
                      <div className="text-xs font-semibold mb-1">{p.label}</div>
                      <div className="text-[10px] text-muted-foreground space-y-0.5">
                        <div>
                          Paid tokens:{" "}
                          <span className="font-mono text-foreground">
                            {fmtInt(p.x)}
                          </span>
                        </div>
                        <div>
                          Accuracy:{" "}
                          <span className="font-mono text-foreground">
                            {fmtPct(p.y, 1)}
                          </span>
                        </div>
                        <div>
                          Saved:{" "}
                          <span className="font-mono text-[oklch(0.72_0.18_162)]">
                            {fmtPct(p.z / 100, 1)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                }}
              />
              <Scatter data={scatterData} fill="oklch(0.62 0.24 27)">
                {scatterData.map((d, i) => {
                  const isWinner =
                    d.row.toggle.includes("Meta-Router")
                  return (
                    <Cell
                      key={i}
                      fill={isWinner ? "oklch(0.72 0.18 162)" : "oklch(0.62 0.24 27)"}
                      stroke={isWinner ? "oklch(0.72 0.18 162)" : "oklch(0.7 0.22 35)"}
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
        {ablationRows.map((row, i) => {
          const isWinner = row.toggle.includes("Meta-Router")
          const isActive = selected.toggle === row.toggle
          return (
            <motion.button
              key={row.toggle}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => setSelected(row)}
              className={cn(
                "text-left rounded-2xl border p-4 transition-all",
                isActive
                  ? "border-primary/50 bg-primary/5 shadow-lg glow-crimson"
                  : "border-border bg-card/40 hover:bg-card/80",
                isWinner && !isActive && "border-[oklch(0.72_0.18_162)]/40"
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-md font-mono text-[10px] font-bold",
                      isWinner
                        ? "bg-[oklch(0.72_0.18_162)]/15 text-[oklch(0.72_0.18_162)]"
                        : "bg-muted/40 text-muted-foreground"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold leading-tight">
                    {row.toggle}
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
                {row.description}
              </p>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <Metric
                  label="Accuracy"
                  value={fmtPct(row.accuracy, 1)}
                  tone={row.accuracy >= ACCURACY_THRESHOLD ? "free" : "paid"}
                />
                <Metric
                  label="Tokens paid"
                  value={fmtInt(row.tokensPaid)}
                  tone="muted"
                />
                <Metric
                  label="Saved"
                  value={fmtPct(row.tokensSavedPct / 100, 1)}
                  tone={row.tokensSavedPct > 50 ? "free" : "warn"}
                />
              </div>
            </motion.button>
          )
        })}
      </section>

      {/* Savings bars + selection detail */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Bar chart of token savings */}
        <div className="lg:col-span-3 glass-card rounded-2xl p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Token savings by toggle</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Cumulative savings vs baseline (no cascade)
              </p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ablationRows}
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
                  {ablationRows.map((r, i) => (
                    <Cell
                      key={i}
                      fill={
                        r.tokensSavedPct > 50
                          ? "oklch(0.72 0.18 162)"
                          : r.tokensSavedPct > 20
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

        {/* Selected toggle detail */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 md:p-6 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-sm font-semibold">Toggle detail</h3>
          </div>
          <div className="text-sm font-semibold leading-tight">
            {selected.toggle}
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed flex-1">
            {selected.description}
          </p>
          <div className="mt-4 space-y-2 text-xs">
            <DetailRow
              icon={Target}
              label="Accuracy"
              value={fmtPct(selected.accuracy, 1)}
              ok={selected.accuracy >= ACCURACY_THRESHOLD}
            />
            <DetailRow
              icon={TrendingDown}
              label="Paid tokens"
              value={fmtInt(selected.tokensPaid)}
            />
            <DetailRow
              icon={BarChart3}
              label="Savings vs baseline"
              value={fmtPct(selected.tokensSavedPct / 100, 1)}
              ok={selected.tokensSavedPct > 50}
            />
          </div>
        </div>
      </section>
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
      <div className={cn("font-mono font-semibold tabular-nums mt-0.5", tones[tone])}>
        {value}
      </div>
    </div>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value,
  ok,
}: {
  icon: typeof Target
  label: string
  value: string
  ok?: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 p-2.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {ok !== undefined &&
          (ok ? (
            <CheckCircle2 className="h-3 w-3 text-[oklch(0.72_0.18_162)]" />
          ) : (
            <CheckCircle2 className="h-3 w-3 text-muted-foreground/40" />
          ))}
        <span className="font-mono text-xs font-semibold tabular-nums">
          {value}
        </span>
      </div>
    </div>
  )
}

"use client"

import { motion } from "framer-motion"
import {
  Coins,
  TrendingDown,
  DollarSign,
  Zap,
  ArrowDownRight,
  ArrowUpRight,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Area,
} from "recharts"
import {
  type KpiSnapshot,
  fmtInt,
  fmtPct,
  fmtUsd,
  timeSeries,
} from "@/lib/cascade-data"

interface TokensProps {
  kpi: KpiSnapshot
}

export function TokensSection({ kpi }: TokensProps) {
  const savingsPct = kpi.tokensSaved / kpi.tokensTotalBaseline
  const costSavingsPct = 1 - kpi.costUsd / kpi.costUsdBaseline

  const baselineComparison = [
    { name: "Baseline", paid: kpi.tokensTotalBaseline, free: 0 },
    { name: "Cascade", paid: kpi.tokensPaid, free: kpi.tokensSaved },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Token tally & cost math
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Local tokens count as zero. Every escalation to Fireworks pays for
            itself in accuracy we could not have achieved locally.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(0.72_0.18_162)]/30 bg-[oklch(0.72_0.18_162)]/10 px-3 py-1.5 text-xs font-semibold text-[oklch(0.72_0.18_162)]">
            <TrendingDown className="h-3.5 w-3.5" />
            {fmtPct(costSavingsPct, 1)} cost reduction
          </span>
        </div>
      </div>

      {/* Big number row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <BigNumber
          label="Total tokens saved"
          value={fmtInt(kpi.tokensSaved)}
          sub={`of ${fmtInt(kpi.tokensTotalBaseline)} baseline`}
          icon={Coins}
          tone="free"
          trend={`+${fmtPct(savingsPct, 1)}`}
        />
        <BigNumber
          label="Fireworks tokens paid"
          value={fmtInt(kpi.tokensPaid)}
          sub={`across ${fmtInt(kpi.totalQueries * kpi.escalatedRoutePct)} escalations`}
          icon={Zap}
          tone="paid"
          trend={`-${fmtPct(1 - kpi.tokensPaid / kpi.tokensTotalBaseline, 1)}`}
          invertTrend
        />
        <BigNumber
          label="Estimated cost saved"
          value={fmtUsd(kpi.costUsdBaseline - kpi.costUsd)}
          sub={`${fmtUsd(kpi.costUsd)} burned · ${fmtUsd(kpi.costUsdBaseline)} baseline`}
          icon={DollarSign}
          tone="meta"
          trend={`-${fmtPct(costSavingsPct, 1)}`}
          invertTrend
        />
      </section>

      {/* Main chart row */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Baseline vs cascade stacked bars */}
        <div className="lg:col-span-3 glass-card rounded-2xl p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">
                Baseline vs Cascade — token breakdown
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Free tokens (local + cache) vs paid tokens (Fireworks)
              </p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={baselineComparison}
                margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
                barCategoryGap="32%"
              >
                <CartesianGrid stroke="oklch(1 0 0 / 6)" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="oklch(0.7 0.02 255)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="oklch(0.7 0.02 255)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.205 0.014 255)",
                    border: "1px solid oklch(1 0 0 / 12%)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: any) => fmtInt(Number(v))}
                />
                <Bar
                  dataKey="paid"
                  stackId="a"
                  fill="oklch(0.7 0.22 35)"
                  radius={[0, 0, 0, 0]}
                  name="Paid (Fireworks)"
                />
                <Bar
                  dataKey="free"
                  stackId="a"
                  fill="oklch(0.72 0.18 162)"
                  radius={[6, 6, 0, 0]}
                  name="Free (local + cache)"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="h-2 w-2 rounded-sm bg-[oklch(0.72_0.18_162)]" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Free tier
                </span>
              </div>
              <div className="text-lg font-bold text-[oklch(0.72_0.18_162)] tabular-nums">
                {fmtInt(kpi.tokensSaved)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {fmtPct(savingsPct, 1)} of baseline
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/60 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="h-2 w-2 rounded-sm bg-[oklch(0.7_0.22_35)]" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Paid tier
                </span>
              </div>
              <div className="text-lg font-bold text-[oklch(0.7_0.22_35)] tabular-nums">
                {fmtInt(kpi.tokensPaid)}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {fmtPct(kpi.tokensPaid / kpi.tokensTotalBaseline, 1)} of baseline
              </div>
            </div>
          </div>
        </div>

        {/* Cost donut */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 md:p-6">
          <h3 className="text-sm font-semibold">Cost breakdown</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">
            USD burn over 24h window
          </p>

          <div className="relative h-48">
            <CostRadial baseline={kpi.costUsdBaseline} actual={kpi.costUsd} />
          </div>

          <div className="mt-4 space-y-2 text-xs">
            <CostRow
              label="Baseline cost (all-remote)"
              value={fmtUsd(kpi.costUsdBaseline)}
              tone="muted"
            />
            <CostRow
              label="Actual cost (Cascade)"
              value={fmtUsd(kpi.costUsd)}
              tone="paid"
            />
            <CostRow
              label="Savings"
              value={`− ${fmtUsd(kpi.costUsdBaseline - kpi.costUsd)}`}
              tone="free"
              bold
            />
          </div>
        </div>
      </section>

      {/* Time-series */}
      <section className="glass-card rounded-2xl p-5 md:p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">
              Token savings trajectory — last 24h
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Per-hour tokens saved vs paid, with cumulative escalation rate
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-sm bg-[oklch(0.72_0.18_162)]" />
              Saved
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-sm bg-[oklch(0.7_0.22_35)]" />
              Paid
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-sm bg-[oklch(0.7_0.18_295)]" />
              Escalation %
            </span>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={timeSeries} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="oklch(1 0 0 / 6)" vertical={false} />
              <XAxis
                dataKey="t"
                stroke="oklch(0.7 0.02 255)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                interval={3}
              />
              <YAxis
                yAxisId="left"
                stroke="oklch(0.7 0.02 255)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="oklch(0.7 0.18 295)"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.205 0.014 255)",
                  border: "1px solid oklch(1 0 0 / 12%)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <defs>
                <linearGradient id="area-saved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.72 0.18 162)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="oklch(0.72 0.18 162)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="tokensSaved"
                stroke="oklch(0.72 0.18 162)"
                strokeWidth={2}
                fill="url(#area-saved)"
                name="Tokens saved"
              />
              <Bar
                yAxisId="left"
                dataKey="tokensPaid"
                fill="oklch(0.7 0.22 35)"
                radius={[3, 3, 0, 0]}
                name="Tokens paid"
                barSize={10}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="escalationRate"
                stroke="oklch(0.7 0.18 295)"
                strokeWidth={2}
                dot={false}
                name="Escalation rate"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Cost-equation explainer */}
      <section className="glass-card glass-card-accent rounded-2xl p-5 md:p-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">The cost equation</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              The hackathon scores on{" "}
              <span className="text-foreground font-medium">
                Fireworks token count
              </span>{" "}
              while accuracy ≥ threshold. Local tokens count as zero, so the
              cascade wins by maximizing the share of queries resolved entirely
              on the MI300X.
            </p>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <EquationTile
                label="Cost paid"
                formula={`tokens_paid = ${fmtInt(kpi.tokensPaid)}`}
                tone="paid"
              />
              <EquationTile
                label="Cost avoided"
                formula={`tokens_saved = ${fmtInt(kpi.tokensSaved)}`}
                tone="free"
              />
              <EquationTile
                label="Score delta"
                formula={`Δ = ${fmtPct(savingsPct, 1)} saved · acc ${fmtPct(kpi.accuracy, 1)}`}
                tone="meta"
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

function BigNumber({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  trend,
  invertTrend,
}: {
  label: string
  value: string
  sub: string
  icon: typeof Coins
  tone: "free" | "paid" | "meta"
  trend: string
  invertTrend?: boolean
}) {
  const tones = {
    free: {
      glow: "glow-emerald",
      text: "text-[oklch(0.72_0.18_162)]",
      bg: "bg-[oklch(0.72_0.18_162)]/15",
    },
    paid: {
      glow: "glow-crimson",
      text: "text-[oklch(0.7_0.22_35)]",
      bg: "bg-[oklch(0.7_0.22_35)]/15",
    },
    meta: {
      glow: "glow-violet",
      text: "text-[oklch(0.7_0.18_295)]",
      bg: "bg-[oklch(0.7_0.18_295)]/15",
    },
  }[tone]

  const positive = invertTrend ? trend.startsWith("-") : !trend.startsWith("-")
  const TrendIcon = trend.startsWith("-") ? ArrowDownRight : ArrowUpRight

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "glass-card rounded-2xl p-5 relative overflow-hidden",
        tones.glow
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md",
            tones.bg
          )}
        >
          <Icon className={cn("h-4 w-4", tones.text)} />
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold",
            positive ? "text-[oklch(0.72_0.18_162)]" : "text-[oklch(0.7_0.22_35)]"
          )}
        >
          <TrendIcon className="h-3 w-3" />
          {trend}
        </span>
      </div>
      <div className="text-2xl md:text-3xl font-bold tabular-nums leading-tight">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">
        {label}
      </div>
      <div className="text-[11px] text-muted-foreground/80 mt-0.5">{sub}</div>
    </motion.div>
  )
}

function CostRadial({
  baseline,
  actual,
}: {
  baseline: number
  actual: number
}) {
  const pct = actual / baseline
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={[
          { name: "Cost", baseline, actual, saved: baseline - actual },
        ]}
        layout="vertical"
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        barCategoryGap={0}
      >
        <XAxis type="number" hide domain={[0, baseline]} />
        <YAxis type="category" dataKey="name" hide />
        <Bar dataKey="actual" stackId="a" fill="oklch(0.7 0.22 35)" radius={[6, 0, 0, 6]} />
        <Bar dataKey="saved" stackId="a" fill="oklch(0.72 0.18 162)" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function CostRow({
  label,
  value,
  tone,
  bold,
}: {
  label: string
  value: string
  tone: "muted" | "paid" | "free"
  bold?: boolean
}) {
  const tones = {
    muted: "text-muted-foreground",
    paid: "text-[oklch(0.7_0.22_35)]",
    free: "text-[oklch(0.72_0.18_162)]",
  }
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono tabular-nums",
          bold ? "font-bold" : "font-semibold",
          tones[tone]
        )}
      >
        {value}
      </span>
    </div>
  )
}

function EquationTile({
  label,
  formula,
  tone,
}: {
  label: string
  formula: string
  tone: "free" | "paid" | "meta"
}) {
  const tones = {
    free: "border-[oklch(0.72_0.18_162)]/30 bg-[oklch(0.72_0.18_162)]/5",
    paid: "border-[oklch(0.7_0.22_35)]/30 bg-[oklch(0.7_0.22_35)]/5",
    meta: "border-[oklch(0.7_0.18_295)]/30 bg-[oklch(0.7_0.18_295)]/5",
  }[tone]
  return (
    <div className={cn("rounded-lg border p-3", tones)}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </div>
      <div className="font-mono text-xs font-semibold">{formula}</div>
    </div>
  )
}



"use client"

import { motion } from "framer-motion"
import {
  ArrowUpRight,
  Coins,
  CheckCircle2,
  Zap,
  Database,
  Server,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  Cpu,
  ShieldCheck,
} from "lucide-react"
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { cn } from "@/lib/utils"
import {
  type KpiSnapshot,
  fmtInt,
  fmtPct,
  fmtUsd,
  timeSeries,
  serviceHealth,
} from "@/lib/cascade-data"

interface OverviewProps {
  kpi: KpiSnapshot
  onNavigate: (id: any) => void
}

export function OverviewSection({ kpi, onNavigate }: OverviewProps) {
  const routeDistribution = [
    { name: "Local Gemma 4B", value: kpi.localRoutePct, color: "oklch(0.72 0.18 162)" },
    { name: "Escalated 27B", value: kpi.escalatedRoutePct, color: "oklch(0.7 0.22 35)" },
    { name: "Cache hit", value: kpi.cacheRoutePct, color: "oklch(0.65 0.2 200)" },
    { name: "Refine + pass", value: kpi.refineRoutePct, color: "oklch(0.7 0.18 295)" },
  ]

  const savingsPct = kpi.tokensSaved / kpi.tokensTotalBaseline
  const costSavingsPct = 1 - kpi.costUsd / kpi.costUsdBaseline

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      {/* Hero band                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden rounded-2xl glass-card glass-card-accent p-6 md:p-10">
        <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
        <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-[oklch(0.7_0.18_295)]/15 blur-3xl pointer-events-none" />

        <div className="relative grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 items-center">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                Live · AMD Developer Hackathon Act II
              </span>
              <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Day 4 of 5 · Submission T-22h
              </span>
            </div>

            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-balance leading-[1.05]">
              An <span className="text-primary">early-exit meta-routing graph</span>{" "}
              that pays for itself in tokens.
            </h2>

            <p className="mt-4 text-sm md:text-base text-muted-foreground max-w-xl leading-relaxed">
              Free-Verify Cascade pushes {fmtPct(kpi.localRoutePct + kpi.cacheRoutePct, 0)} of
              traffic through a free, locally-hosted Gemma 4B on AMD ROCm. A calibrated
              XGBoost meta-classifier gates every escalation, so Fireworks tokens are spent
              only where accuracy actually demands them.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onNavigate("sandbox")}
                className="group inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all shadow-lg glow-crimson"
              >
                Try the routing sandbox
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
              <button
                onClick={() => onNavigate("ablation")}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/40 px-4 py-2.5 text-sm font-medium hover:bg-card/80 transition-all"
              >
                <ChevronRight className="h-4 w-4" />
                View ablation results
              </button>
            </div>
          </div>

          {/* Hero KPI tiles */}
          <div className="grid grid-cols-2 gap-3">
            <HeroTile
              icon={Coins}
              label="Tokens saved"
              value={fmtInt(kpi.tokensSaved)}
              sub={`of ${fmtInt(kpi.tokensTotalBaseline)} baseline`}
              accent="free"
              trend={savingsPct}
            />
            <HeroTile
              icon={CheckCircle2}
              label="Accuracy"
              value={fmtPct(kpi.accuracy, 1)}
              sub={`≥ ${fmtPct(kpi.accuracyThreshold, 0)} threshold`}
              accent="meta"
              trend={kpi.accuracy - kpi.accuracyThreshold}
            />
            <HeroTile
              icon={TrendingDown}
              label="Cost burn"
              value={fmtUsd(kpi.costUsd)}
              sub={`of ${fmtUsd(kpi.costUsdBaseline)} baseline`}
              accent="paid"
              trend={-costSavingsPct}
              invertTrend
            />
            <HeroTile
              icon={Zap}
              label="Throughput"
              value={fmtInt(kpi.totalQueries)}
              sub="queries processed"
              accent="accent"
              trend={0.04}
            />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* KPI strip                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={Cpu}
          label="Local route share"
          value={fmtPct(kpi.localRoutePct, 1)}
          sub="Gemma 3 4B BF16 · 0 paid tokens"
          tone="free"
        />
        <StatTile
          icon={Server}
          label="Escalation rate"
          value={fmtPct(kpi.escalatedRoutePct, 1)}
          sub="to Fireworks Gemma 3 27B"
          tone="paid"
        />
        <StatTile
          icon={Database}
          label="Cache hit rate"
          value={fmtPct(kpi.cacheHitRate, 1)}
          sub="SQLite + FAISS · cos ≥ 0.96"
          tone="cache"
        />
        <StatTile
          icon={ShieldCheck}
          label="Shadow divergence"
          value="16.4%"
          sub="gate ≤ 20% · engaged"
          tone="meta"
        />
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Charts row                                                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Traffic + tokens time-series */}
        <div className="lg:col-span-2 glass-card rounded-2xl p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Traffic & token savings</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Last 24 hours · live roll-up
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <Legend color="oklch(0.72 0.18 162)" label="Tokens saved" />
              <Legend color="oklch(0.7 0.22 35)" label="Tokens paid" />
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeries} margin={{ top: 6, right: 6, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="g-saved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.18 162)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.72 0.18 162)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-paid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.7 0.22 35)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.7 0.22 35)" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  stroke="oklch(0.7 0.02 255)"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.205 0.014 255)",
                    border: "1px solid oklch(1 0 0 / 12%)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "oklch(0.7 0.02 255)" }}
                />
                <Area
                  type="monotone"
                  dataKey="tokensSaved"
                  stroke="oklch(0.72 0.18 162)"
                  strokeWidth={2}
                  fill="url(#g-saved)"
                  name="Tokens saved"
                />
                <Area
                  type="monotone"
                  dataKey="tokensPaid"
                  stroke="oklch(0.7 0.22 35)"
                  strokeWidth={2}
                  fill="url(#g-paid)"
                  name="Tokens paid"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Route distribution donut */}
        <div className="glass-card rounded-2xl p-5 md:p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Route distribution</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {fmtInt(kpi.totalQueries)} queries · last 24h
              </p>
            </div>
          </div>
          <div className="h-48 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={routeDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={68}
                  paddingAngle={3}
                  stroke="none"
                >
                  {routeDistribution.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.205 0.014 255)",
                    border: "1px solid oklch(1 0 0 / 12%)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: any) => fmtPct(Number(v), 1)}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Free
              </div>
              <div className="text-2xl font-bold tabular-nums">
                {fmtPct(kpi.localRoutePct + kpi.cacheRoutePct, 0)}
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            {routeDistribution.map((r) => (
              <div
                key={r.name}
                className="flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-sm"
                    style={{ background: r.color }}
                  />
                  <span className="text-muted-foreground">{r.name}</span>
                </div>
                <span className="font-mono font-semibold tabular-nums">
                  {fmtPct(r.value, 1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Service health row                                               */}
      {/* ---------------------------------------------------------------- */}
      <section className="glass-card rounded-2xl p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold">Service health</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              All systems operational · fail-safe escalation engaged
            </p>
          </div>
          <button
            onClick={() => onNavigate("status")}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            All services
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {serviceHealth.slice(0, 6).map((s) => (
            <div
              key={s.name}
              className="rounded-lg border border-border bg-card/40 p-3.5"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.72_0.18_162)] animate-pulse" />
                  <span className="text-xs font-medium leading-tight">
                    {s.name}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                  {s.latencyMs}ms
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground leading-tight">
                {s.detail}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

const accentMap: Record<string, { glow: string; text: string; bg: string }> = {
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
  cache: {
    glow: "glow-violet",
    text: "text-[oklch(0.65_0.2_200)]",
    bg: "bg-[oklch(0.65_0.2_200)]/15",
  },
  accent: {
    glow: "glow-crimson",
    text: "text-primary",
    bg: "bg-primary/15",
  },
}

function HeroTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  trend,
  invertTrend,
}: {
  icon: typeof Coins
  label: string
  value: string
  sub: string
  accent: keyof typeof accentMap
  trend: number
  invertTrend?: boolean
}) {
  const a = accentMap[accent]
  const positive = invertTrend ? trend < 0 : trend > 0
  const TrendIcon = trend >= 0 ? TrendingUp : TrendingDown

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative rounded-xl border border-border bg-card/60 backdrop-blur p-4 overflow-hidden",
        a.glow
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md",
            a.bg
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", a.text)} />
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold",
            positive ? "text-[oklch(0.72_0.18_162)]" : "text-[oklch(0.7_0.22_35)]"
          )}
        >
          <TrendIcon className="h-3 w-3" />
          {fmtPct(Math.abs(trend), 1)}
        </span>
      </div>
      <div className="text-xl md:text-2xl font-bold tabular-nums leading-tight">
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
        {label}
      </div>
      <div className="text-[11px] text-muted-foreground/80 mt-0.5">{sub}</div>
    </motion.div>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Coins
  label: string
  value: string
  sub: string
  tone: keyof typeof accentMap
}) {
  const a = accentMap[tone]
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md",
            a.bg
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", a.text)} />
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span
        className="h-2 w-2 rounded-sm"
        style={{ background: color }}
      />
      {label}
    </span>
  )
}

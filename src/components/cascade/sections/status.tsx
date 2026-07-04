"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import {
  Cpu,
  Server,
  Database,
  ShieldCheck,
  Activity,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Zap,
  HardDrive,
  Clock,
  Gauge,
  RefreshCw,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  type ServiceHealth,
  fmtInt,
  fmtPct,
} from "@/lib/cascade-data"

const healthIcon: Record<string, typeof CheckCircle2> = {
  healthy: CheckCircle2,
  degraded: AlertTriangle,
  offline: AlertTriangle,
  warming: Zap,
}

const serviceIconById: Record<string, typeof Cpu> = {
  vllm: Cpu,
  fireworks: Cloud,
  meta: ShieldCheck,
  cache: Database,
  telemetry: Activity,
  fastapi: Server,
}

export function StatusSection() {
  const [services, setServices] = useState<ServiceHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [training, setTraining] = useState(false)
  const [metaRouter, setMetaRouter] = useState<{ isFitted: boolean; auc: number; brier: number } | null>(null)
  const [cacheStats, setCacheStats] = useState<{ entries: number; hitRate: number } | null>(null)
  const [telemetryStats, setTelemetryStats] = useState<{ queriesProcessed: number; divergenceCount: number } | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/cascade/health")
      const data = await r.json()
      if (data.ok) {
        setServices(data.services)
        setMetaRouter(data.metaRouter)
        setCacheStats(data.cacheStats)
        setTelemetryStats(data.telemetryStats)
      }
    } catch (err) {
      console.error("[status] refresh failed:", err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [refresh])

  const train = useCallback(async () => {
    setTraining(true)
    try {
      const r = await fetch("/api/cascade/train", { method: "POST" })
      const data = await r.json()
      if (data.ok) {
        await refresh()
      }
    } catch (err) {
      console.error("[status] train failed:", err)
    } finally {
      setTraining(false)
    }
  }, [refresh])

  const allHealthy = services.length > 0 && services.every((s) => s.status === "healthy")

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            System status
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Every service in the Free-Verify Cascade stack. The exception guard
            wraps the local compute tier; any vLLM OOM or timeout auto-escalates
            to Fireworks rather than dropping the request.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={train}
            disabled={training}
            className="gap-1.5"
          >
            {training ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            {training ? "Training…" : "Re-train meta-router"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
            className="gap-1.5"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
              allHealthy
                ? "border-[oklch(0.72_0.18_162)]/30 bg-[oklch(0.72_0.18_162)]/10 text-[oklch(0.72_0.18_162)]"
                : "border-[oklch(0.78_0.18_85)]/30 bg-[oklch(0.78_0.18_85)]/10 text-[oklch(0.78_0.18_85)]"
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
            {allHealthy ? "All systems operational" : "Degraded — review below"}
          </div>
        </div>
      </div>

      {/* Health strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <HealthTile
          icon={Gauge}
          label="vLLM p50 latency"
          value={services.find((s) => s.id === "vllm") ? `${services.find((s) => s.id === "vllm")!.latencyMs}ms` : "—"}
          sub="n=3 batch on MI300X"
          tone="free"
        />
        <HealthTile
          icon={Clock}
          label="Fireworks p95"
          value={services.find((s) => s.id === "fireworks") ? `${(services.find((s) => s.id === "fireworks")!.latencyMs / 1000).toFixed(2)}s` : "—"}
          sub="prefix-cache hit rate 67%"
          tone="paid"
        />
        <HealthTile
          icon={ShieldCheck}
          label="Meta-Router fit"
          value={metaRouter ? `AUC ${metaRouter.auc.toFixed(2)}` : "—"}
          sub={metaRouter ? `Brier ${metaRouter.brier.toFixed(2)} · ${metaRouter.isFitted ? "calibrated" : "warming"}` : ""}
          tone="meta"
        />
        <HealthTile
          icon={HardDrive}
          label="Cache entries"
          value={cacheStats ? fmtInt(cacheStats.entries) : "—"}
          sub={cacheStats ? `hit rate ${fmtPct(cacheStats.hitRate, 1)}` : ""}
          tone="cache"
        />
      </section>

      {/* Service cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {services.length === 0 && loading && (
          <div className="col-span-full glass-card rounded-2xl p-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
            Loading live service health…
          </div>
        )}
        {services.map((s, i) => (
          <ServiceCard key={s.name} service={s} index={i} />
        ))}
      </section>

      {/* Defensive fail-safe diagram */}
      <section className="glass-card glass-card-accent rounded-2xl p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Exception-guard escalation</h3>
          <span className="text-[10px] text-muted-foreground font-mono">
            try/except · OptimizedRoutingPipeline.solve()
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
          <FailSafeNode
            step="1"
            title="Local compute"
            detail="vLLM n=3 · ConcurrentCISC · meta-classifier"
            tone="free"
          />
          <FailSafeArrow />
          <FailSafeNode
            step="2"
            title="Catch exception"
            detail="OOM, timeout, or schema mismatch"
            tone="meta"
            alert
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center mt-2">
          <FailSafeNode
            step="3"
            title="Emergency escalate"
            detail="EnrichedRemoteEscalator.escalate()"
            tone="paid"
          />
          <FailSafeArrow />
          <FailSafeNode
            step="4"
            title="Cache + telemetry"
            detail="Persist answer, log fallback tier"
            tone="cache"
          />
        </div>

        <div className="mt-4 rounded-lg border border-border bg-background/60 p-3 font-mono text-[11px] leading-relaxed overflow-x-auto">
          <span className="text-muted-foreground"># pipeline.py — emergency fallback</span>
          <br />
          <span className="text-primary">except</span>{" "}
          <span className="text-foreground">Exception</span>{" "}
          <span className="text-primary">as</span> <span className="text-foreground">e:</span>
          <br />
          {"  "}
          <span className="text-muted-foreground">logger.error(f"Local tier failed: {`{e}`}")</span>
          <br />
          {"  "}
          <span className="text-primary">return</span>{" "}
          <span className="text-primary">await</span>{" "}
          <span className="text-foreground">self._escalate(</span>
          <span className="text-[oklch(0.78_0.18_85)]">task, "", "Emergency Fallback Tier Triggered"</span>
          <span className="text-foreground">)</span>
        </div>
      </section>

      {/* Deployment manifest */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ManifestCard
          title="Local container"
          rows={[
            ["image", "rocm/vllm:latest"],
            ["model", "google/gemma-3-4b-it"],
            ["dtype", "bfloat16"],
            ["--max-num-seqs", "16"],
            ["--gpu-mem-util", "0.85"],
            ["--max-model-len", "8192"],
            ["device", "/dev/kfd · /dev/dri"],
          ]}
        />
        <ManifestCard
          title="Cascade API"
          rows={[
            ["framework", "FastAPI + uvicorn"],
            ["port", "8080"],
            ["FIREWORKS_BASE_URL", "api.fireworks.ai/inference/v1"],
            ["REMOTE_MODEL", "gemma-3-27b-it"],
            ["ESCALATION_THRESHOLD", "0.65"],
            ["LOCAL_DB_PATH", "/app/eval/cache.db"],
            ["volume", "./eval:/app/eval"],
          ]}
        />
      </section>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function ServiceCard({ service, index }: { service: ServiceHealth; index: number }) {
  const Icon = serviceIconById[service.id]
  const HealthIcon = healthIcon[service.status]
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="glass-card rounded-2xl p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0">
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight truncate">
              {service.name}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
              {service.detail}
            </div>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest",
            service.status === "healthy"
              ? "bg-[oklch(0.72_0.18_162)]/15 text-[oklch(0.72_0.18_162)]"
              : "bg-[oklch(0.78_0.18_85)]/15 text-[oklch(0.78_0.18_85)]"
          )}
        >
          <HealthIcon className="h-2.5 w-2.5" />
          {service.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Mini label="Latency" value={`${service.latencyMs}ms`} />
        <Mini label="Uptime" value={fmtPct(service.uptimePct / 100, 2)} />
        <Mini
          label="Status"
          value={service.status === "healthy" ? "OK" : "WARN"}
          tone={service.status === "healthy" ? "free" : "warn"}
        />
      </div>
    </motion.div>
  )
}

function HealthTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Gauge
  label: string
  value: string
  sub: string
  tone: "free" | "paid" | "meta" | "cache"
}) {
  const tones = {
    free: "text-[oklch(0.72_0.18_162)] bg-[oklch(0.72_0.18_162)]/15",
    paid: "text-[oklch(0.7_0.22_35)] bg-[oklch(0.7_0.22_35)]/15",
    meta: "text-[oklch(0.7_0.18_295)] bg-[oklch(0.7_0.18_295)]/15",
    cache: "text-[oklch(0.65_0.2_200)] bg-[oklch(0.65_0.2_200)]/15",
  }
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md",
            tones[tone]
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  )
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "free" | "warn"
}) {
  const toneClass =
    tone === "free"
      ? "text-[oklch(0.72_0.18_162)]"
      : tone === "warn"
        ? "text-[oklch(0.78_0.18_85)]"
        : "text-foreground"
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2 text-center">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-xs font-mono font-semibold tabular-nums mt-0.5", toneClass)}>
        {value}
      </div>
    </div>
  )
}

function FailSafeNode({
  step,
  title,
  detail,
  tone,
  alert,
}: {
  step: string
  title: string
  detail: string
  tone: "free" | "paid" | "meta" | "cache"
  alert?: boolean
}) {
  const tones = {
    free: "border-[oklch(0.72_0.18_162)]/30 bg-[oklch(0.72_0.18_162)]/5",
    paid: "border-[oklch(0.7_0.22_35)]/30 bg-[oklch(0.7_0.22_35)]/5",
    meta: "border-[oklch(0.7_0.18_295)]/30 bg-[oklch(0.7_0.18_295)]/5",
    cache: "border-[oklch(0.65_0.2_200)]/30 bg-[oklch(0.65_0.2_200)]/5",
  }
  return (
    <div className={cn("rounded-lg border p-3", tones[tone])}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono text-muted-foreground">
          step {step}
        </span>
        {alert && (
          <AlertTriangle className="h-3 w-3 text-[oklch(0.78_0.18_85)]" />
        )}
      </div>
      <div className="text-xs font-semibold leading-tight">{title}</div>
      <div className="text-[10px] text-muted-foreground mt-1 leading-tight">
        {detail}
      </div>
    </div>
  )
}

function FailSafeArrow() {
  return (
    <div className="flex items-center justify-center text-muted-foreground">
      <svg
        width="40"
        height="20"
        viewBox="0 0 40 20"
        fill="none"
        className="hidden md:block"
      >
        <path
          d="M2 10 L36 10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        <path d="M30 4 L36 10 L30 16" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
      <span className="md:hidden text-xs">↓</span>
    </div>
  )
}

function ManifestCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="space-y-1 font-mono text-[11px]">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-start justify-between gap-2 py-1 border-b border-border/40 last:border-0"
          >
            <span className="text-muted-foreground">{k}</span>
            <span className="text-foreground text-right break-all">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

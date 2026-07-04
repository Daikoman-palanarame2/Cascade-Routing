"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard,
  Play,
  Coins,
  Workflow,
  Database,
  BarChart3,
  Activity,
  Cpu,
  Zap,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Topbar } from "@/components/cascade/topbar"
import { OverviewSection } from "@/components/cascade/sections/overview"
import { SandboxSection } from "@/components/cascade/sections/sandbox"
import { TokensSection } from "@/components/cascade/sections/tokens"
import { ArchitectureSection } from "@/components/cascade/sections/architecture"
import { TelemetrySection } from "@/components/cascade/sections/telemetry"
import { AblationSection } from "@/components/cascade/sections/ablation"
import { StatusSection } from "@/components/cascade/sections/status"
import { kpiSnapshot, type KpiSnapshot } from "@/lib/cascade-data"

type SectionId =
  | "overview"
  | "sandbox"
  | "tokens"
  | "architecture"
  | "telemetry"
  | "ablation"
  | "status"

interface NavItem {
  id: SectionId
  label: string
  description: string
  icon: typeof LayoutDashboard
  badge?: string
}

const NAV: NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    description: "System at a glance",
    icon: LayoutDashboard,
  },
  {
    id: "sandbox",
    label: "Routing Sandbox",
    description: "Live query → routing trace",
    icon: Play,
    badge: "LIVE",
  },
  {
    id: "tokens",
    label: "Token Tally",
    description: "Spend & savings",
    icon: Coins,
  },
  {
    id: "architecture",
    label: "Architecture",
    description: "Early-exit meta-routing graph",
    icon: Workflow,
  },
  {
    id: "telemetry",
    label: "Shadow Telemetry",
    description: "Divergence gate & SQLite logs",
    icon: Database,
  },
  {
    id: "ablation",
    label: "Ablation",
    description: "Toggle Pareto frontier",
    icon: BarChart3,
  },
  {
    id: "status",
    label: "System Status",
    description: "Service health",
    icon: Activity,
  },
]

export default function Home() {
  const [active, setActive] = useState<SectionId>("overview")
  // Animated KPI ticker — increments tokensSaved every 4s for a live feel.
  const [kpiTick, setKpiTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setKpiTick((t) => t + 1), 4_000)
    return () => clearInterval(interval)
  }, [])

  const animatedKpi: KpiSnapshot = useMemo(() => {
    const drift = kpiTick * 73
    return {
      ...kpiSnapshot,
      tokensSaved: kpiSnapshot.tokensSaved + drift,
      totalQueries: kpiSnapshot.totalQueries + Math.floor(kpiTick / 2),
    }
  }, [kpiTick])

  const onNavigate = useCallback((id: SectionId) => setActive(id), [])

  return (
    <div className="min-h-screen flex bg-background grid-bg">
      {/* ---------------------------------------------------------------- */}
      {/* Sidebar                                                          */}
      {/* ---------------------------------------------------------------- */}
      <aside className="hidden lg:flex w-72 shrink-0 flex-col border-r border-border bg-sidebar/60 backdrop-blur-xl">
        {/* Brand */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-[oklch(0.62_0.24_27)] to-[oklch(0.5_0.22_295)] flex items-center justify-center shadow-lg glow-crimson">
              <Zap className="h-5 w-5 text-white" fill="white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold tracking-tight leading-tight">
                Free-Verify
                <br />
                <span className="text-primary">Cascade</span>
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                Control Panel v1.0
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto scroll-thin">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Operations
          </div>
          {NAV.map((item) => {
            const Icon = item.icon
            const isActive = active === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActive(item.id)}
                className={cn(
                  "group w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all",
                  isActive
                    ? "bg-gradient-to-r from-primary/20 to-primary/5 text-foreground"
                    : "hover:bg-sidebar-accent/60 text-muted-foreground hover:text-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-md transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "bg-muted/40 group-hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium leading-tight">
                    {item.label}
                  </span>
                  <span className="block text-[11px] text-muted-foreground leading-tight">
                    {item.description}
                  </span>
                </span>
                {item.badge && (
                  <span className="flex items-center gap-1 rounded-full bg-[oklch(0.72_0.18_162)]/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[oklch(0.72_0.18_162)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.72_0.18_162)] animate-pulse" />
                    {item.badge}
                  </span>
                )}
                {isActive && (
                  <ChevronRight className="h-4 w-4 text-primary" />
                )}
              </button>
            )
          })}
        </nav>

        {/* Hackathon badge */}
        <div className="p-4 border-t border-border">
          <div className="glass-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Deployed on
              </span>
            </div>
            <div className="text-sm font-semibold">AMD MI300X · ROCm</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[oklch(0.72_0.18_162)] animate-pulse" />
              <span className="text-[11px] text-muted-foreground">
                lablab.ai · AMD Act II
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* Main column                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar active={active} nav={NAV} onNavigate={onNavigate} />

        <main className="flex-1 overflow-y-auto scroll-thin">
          <div className="mx-auto max-w-[1400px] px-4 md:px-8 py-6 md:py-10">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {active === "overview" && (
                  <OverviewSection kpi={animatedKpi} onNavigate={onNavigate} />
                )}
                {active === "sandbox" && <SandboxSection />}
                {active === "tokens" && <TokensSection kpi={animatedKpi} />}
                {active === "architecture" && <ArchitectureSection />}
                {active === "telemetry" && <TelemetrySection />}
                {active === "ablation" && <AblationSection />}
                {active === "status" && <StatusSection />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  )
}

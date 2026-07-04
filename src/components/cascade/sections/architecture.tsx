"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import {
  Database,
  GitBranch,
  Cpu,
  RefreshCw,
  ShieldCheck,
  Server,
  CheckCircle2,
  X,
  Info,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"

type NodeType =
  | "input"
  | "cache"
  | "early-exit"
  | "local"
  | "refine"
  | "meta"
  | "escalate"
  | "output"

interface GraphNode {
  id: string
  type: NodeType
  title: string
  subtitle: string
  detail: string
  tier: "free" | "paid" | "meta" | "infra"
}

const NODES: Record<string, GraphNode> = {
  input: {
    id: "input",
    type: "input",
    title: "Incoming Task",
    subtitle: "Async query",
    detail: "Task ingested by FastAPI gateway and tokenized via cl100k_base.",
    tier: "infra",
  },
  cache: {
    id: "cache",
    type: "cache",
    title: "Semantic Cache",
    subtitle: "SQLite + FAISS · cos ≥ 0.96",
    detail:
      "Returns historical answer and the cached meta_conf value (never hardcoded 1.0).",
    tier: "free",
  },
  classifier: {
    id: "classifier",
    type: "early-exit",
    title: "Difficulty Classifier",
    subtitle: "Embed + Logistic head",
    detail: "Estimates P-easy from query embedding. Hard queries short-circuit.",
    tier: "free",
  },
  earlyExit: {
    id: "earlyExit",
    type: "early-exit",
    title: "Early-Exit Gate",
    subtitle: "P-easy < 0.25?",
    detail: "Skips local model entirely when query is judged too hard.",
    tier: "meta",
  },
  local: {
    id: "local",
    type: "local",
    title: "Local Gemma 3 4B",
    subtitle: "vLLM ConcurrentCISC n=3 · BF16",
    detail: "Three samples in a single forward pass; cluster-mapped to winning answer.",
    tier: "free",
  },
  cisc: {
    id: "cisc",
    type: "local",
    title: "Dynamic CISC",
    subtitle: "Agreement evaluation",
    detail: "Compute pairwise agreement across the 3 local samples.",
    tier: "free",
  },
  meta: {
    id: "meta",
    type: "meta",
    title: "Meta-Classifier Gate",
    subtitle: "XGBoost + Isotonic",
    detail:
      "Routes by calibrated confidence: ≥ 0.65 pass, ≥ 0.40 refine, < 0.40 escalate.",
    tier: "meta",
  },
  refine: {
    id: "refine",
    type: "refine",
    title: "Self-Refine",
    subtitle: "1 local round",
    detail: "Re-prompt with critique, re-score with judge, re-eval meta-classifier.",
    tier: "free",
  },
  escalate: {
    id: "escalate",
    type: "escalate",
    title: "Fireworks Remote",
    subtitle: "Gemma 3 27B · prefix-cache",
    detail: "Enriched hand-off: junior attempt + critique pushed to bottom of prompt.",
    tier: "paid",
  },
  writeback: {
    id: "writeback",
    type: "cache",
    title: "Cache + Telemetry",
    subtitle: "Async write",
    detail: "Persist answer to cache, log shadow telemetry to SQLite via aiosqlite.",
    tier: "free",
  },
  output: {
    id: "output",
    type: "output",
    title: "Final Answer",
    subtitle: "Returned to caller",
    detail: "Routed through one of four tiers: cache, local, refine, escalated.",
    tier: "infra",
  },
}

const tierColor: Record<string, { bg: string; text: string; border: string; glow?: string }> = {
  infra: {
    bg: "bg-muted/40",
    text: "text-foreground",
    border: "border-border",
  },
  free: {
    bg: "bg-[oklch(0.72_0.18_162)]/10",
    text: "text-[oklch(0.72_0.18_162)]",
    border: "border-[oklch(0.72_0.18_162)]/40",
    glow: "glow-emerald",
  },
  paid: {
    bg: "bg-[oklch(0.7_0.22_35)]/10",
    text: "text-[oklch(0.7_0.22_35)]",
    border: "border-[oklch(0.7_0.22_35)]/40",
    glow: "glow-crimson",
  },
  meta: {
    bg: "bg-[oklch(0.7_0.18_295)]/10",
    text: "text-[oklch(0.7_0.18_295)]",
    border: "border-[oklch(0.7_0.18_295)]/40",
    glow: "glow-violet",
  },
}

const nodeIcon: Record<NodeType, typeof Database> = {
  input: Zap,
  cache: Database,
  "early-exit": GitBranch,
  local: Cpu,
  refine: RefreshCw,
  meta: ShieldCheck,
  escalate: Server,
  output: CheckCircle2,
}

export function ArchitectureSection() {
  const [selected, setSelected] = useState<string | null>(null)
  const selectedNode = selected ? NODES[selected] : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">
            Early-exit meta-routing graph
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Not a fragile linear pipeline. The cascade is a state machine where
            the calibrated XGBoost meta-classifier gates every escalation to
            paid Fireworks tokens.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <Legend color="oklch(0.72 0.18 162)" label="Free / local" />
          <Legend color="oklch(0.7 0.18 295)" label="Meta / AI" />
          <Legend color="oklch(0.7 0.22 35)" label="Paid / remote" />
          <Legend color="oklch(0.7 0.02 255)" label="Infra" />
        </div>
      </div>

      {/* Graph canvas */}
      <div className="glass-card glass-card-accent rounded-2xl p-5 md:p-8 overflow-hidden relative">
        <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />

        <div className="relative grid grid-cols-1 md:grid-cols-5 gap-4 md:gap-3 items-stretch">
          {/* Column 1: input → cache → classifier */}
          <div className="flex flex-col gap-4">
            <NodeCard id="input" onSelect={setSelected} />
            <NodeCard id="cache" onSelect={setSelected} />
            <NodeCard id="classifier" onSelect={setSelected} />
          </div>

          {/* Column 2: early-exit gate */}
          <div className="flex flex-col gap-4 justify-center">
            <NodeCard id="earlyExit" onSelect={setSelected} />
          </div>

          {/* Column 3: local model + CISC */}
          <div className="flex flex-col gap-4">
            <NodeCard id="local" onSelect={setSelected} />
            <NodeCard id="cisc" onSelect={setSelected} />
          </div>

          {/* Column 4: meta gate + refine + escalate */}
          <div className="flex flex-col gap-4">
            <NodeCard id="meta" onSelect={setSelected} />
            <NodeCard id="refine" onSelect={setSelected} />
            <NodeCard id="escalate" onSelect={setSelected} />
          </div>

          {/* Column 5: writeback + output */}
          <div className="flex flex-col gap-4 justify-center">
            <NodeCard id="writeback" onSelect={setSelected} />
            <NodeCard id="output" onSelect={setSelected} />
          </div>
        </div>

        {/* Connector legend */}
        <div className="relative mt-6 pt-4 border-t border-border">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            <PathLegend
              label="Easy path"
              detail="Cache hit OR local pass"
              color="oklch(0.72 0.18 162)"
            />
            <PathLegend
              label="Refine path"
              detail="Borderline conf → 1 local round"
              color="oklch(0.7 0.18 295)"
            />
            <PathLegend
              label="Escalation path"
              detail="Hard query → Fireworks 27B"
              color="oklch(0.7 0.22 35)"
            />
            <PathLegend
              label="Fail-safe"
              detail="Local exception → escalate"
              color="oklch(0.78 0.18 85)"
            />
          </div>
        </div>
      </div>

      {/* Defensive design callouts */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Callout
          icon={ShieldCheck}
          title="Exception guard"
          body="All local compute is wrapped in try/except. vLLM OOMs or timeouts trigger immediate Fireworks escalation — zero dropped requests."
          tone="meta"
        />
        <Callout
          icon={Database}
          title="Telemetry persistence"
          body="AsyncTelemetryLogger uses aiosqlite so shadow logs survive container restarts. engage_meta_router.py reads divergence via a single SQL query."
          tone="free"
        />
        <Callout
          icon={GitBranch}
          title="Prefix-stable escalation"
          body="Static system prompt at top, dynamic runtime data at bottom — keeps Fireworks prefix-cache hash stable for the 50% input discount."
          tone="paid"
        />
      </section>

      {/* Selection detail modal */}
      {selectedNode && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-4 right-4 z-50 max-w-sm"
        >
          <div
            className={cn(
              "glass-card rounded-2xl p-4 shadow-2xl",
              tierColor[selectedNode.tier].glow
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = nodeIcon[selectedNode.type]
                  return (
                    <span
                      className={cn(
                        "inline-flex h-7 w-7 items-center justify-center rounded-md",
                        tierColor[selectedNode.tier].bg
                      )}
                    >
                      <Icon
                        className={cn("h-3.5 w-3.5", tierColor[selectedNode.tier].text)}
                      />
                    </span>
                  )
                })()}
                <div>
                  <div className="text-sm font-semibold leading-tight">
                    {selectedNode.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
                    {selectedNode.subtitle}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {selectedNode.detail}
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function NodeCard({
  id,
  onSelect,
}: {
  id: string
  onSelect: (id: string) => void
}) {
  const node = NODES[id]
  const tc = tierColor[node.tier]
  const Icon = nodeIcon[node.type]
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(id)}
      className={cn(
        "text-left rounded-xl border bg-card/60 backdrop-blur p-3.5 transition-all w-full",
        tc.border,
        tc.glow
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md",
            tc.bg
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", tc.text)} />
        </span>
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
          {node.tier}
        </span>
      </div>
      <div className="text-xs font-semibold leading-tight">{node.title}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
        {node.subtitle}
      </div>
    </motion.button>
  )
}

function Callout({
  icon: Icon,
  title,
  body,
  tone,
}: {
  icon: typeof ShieldCheck
  title: string
  body: string
  tone: "meta" | "free" | "paid"
}) {
  const tc = tierColor[tone]
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md",
            tc.bg
          )}
        >
          <Icon className={cn("h-3.5 w-3.5", tc.text)} />
        </span>
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{body}</p>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  )
}

function PathLegend({
  label,
  detail,
  color,
}: {
  label: string
  detail: string
  color: string
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-card/40 p-2.5">
      <span
        className="mt-1 h-2 w-2 rounded-sm shrink-0"
        style={{ background: color }}
      />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold leading-tight">{label}</div>
        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
          {detail}
        </div>
      </div>
    </div>
  )
}

/**
 * AsyncTelemetryLogger — TypeScript port of the Python aiosqlite logger.
 *
 * Persists shadow-mode telemetry to SQLite via Prisma. Every cascade
 * solve writes one row containing the fallback route, the XGBoost
 * shadow route, and whether they diverged. This is what the
 * engage_meta_router.py script queries to compute the 20% divergence
 * gate.
 *
 * Failures are logged but never bubble up — telemetry must not crash
 * the API.
 */

import { db } from "@/lib/db"
import type { Route } from "./meta-router"

export interface TelemetryRow {
  id: number
  timestamp: string
  tokenLen: number
  pEasy: number
  fallbackRoute: string
  shadowRoute: string
  divergence: boolean
  didRefine: boolean
  task?: string
  answer?: string
  tokensPaid: number
  durationMs: number
}

export interface ShadowStats {
  queriesProcessed: number
  divergenceCount: number
  divergencePct: number
  threshold: number
  requiredQueries: number
  engaged: boolean
}

const ENGAGE_REQUIRED_QUERIES = 50
const ENGAGE_DIVERGENCE_THRESHOLD = 0.20

export class AsyncTelemetryLogger {
  async log(entry: {
    tokenLen: number
    pEasy: number
    fallbackRoute: Route | string
    shadowRoute: Route | string
    divergence: boolean
    didRefine: boolean
    task?: string
    answer?: string
    tokensPaid?: number
    durationMs?: number
  }): Promise<void> {
    try {
      const fallbackStr = normalizeRoute(entry.fallbackRoute)
      const shadowStr = normalizeRoute(entry.shadowRoute)
      await db.shadowTelemetry.create({
        data: {
          tokenLen: entry.tokenLen,
          pEasy: entry.pEasy,
          fallbackRoute: fallbackStr,
          shadowRoute: shadowStr,
          divergence: entry.divergence ? 1 : 0,
          didRefine: entry.didRefine ? 1 : 0,
          task: entry.task ?? null,
          answer: entry.answer ?? null,
          tokensPaid: entry.tokensPaid ?? 0,
          durationMs: entry.durationMs ?? 0,
        },
      })
    } catch (err) {
      // Fail silently — telemetry must never crash the API
      console.error("[telemetry] persist failed:", err)
    }
  }

  async recent(limit = 24): Promise<TelemetryRow[]> {
    const rows = await db.shadowTelemetry.findMany({
      take: limit,
      orderBy: { id: "desc" },
    })
    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp.toISOString().slice(11, 19),
      tokenLen: r.tokenLen,
      pEasy: r.pEasy,
      fallbackRoute: r.fallbackRoute,
      shadowRoute: r.shadowRoute,
      divergence: r.divergence === 1,
      didRefine: r.didRefine === 1,
      task: r.task ?? undefined,
      answer: r.answer ?? undefined,
      tokensPaid: r.tokensPaid,
      durationMs: r.durationMs,
    }))
  }

  async stats(): Promise<ShadowStats> {
    const total = await db.shadowTelemetry.count()
    const divergent = await db.shadowTelemetry.count({
      where: { divergence: 1 },
    })
    const divergencePct = total > 0 ? divergent / total : 0
    return {
      queriesProcessed: total,
      divergenceCount: divergent,
      divergencePct,
      threshold: ENGAGE_DIVERGENCE_THRESHOLD,
      requiredQueries: ENGAGE_REQUIRED_QUERIES,
      engaged:
        total >= ENGAGE_REQUIRED_QUERIES &&
        divergencePct <= ENGAGE_DIVERGENCE_THRESHOLD,
    }
  }
}

function normalizeRoute(r: Route | string): string {
  // `Route` from meta-router is "pass"|"refine"|"escalate"
  // The telemetry table expects "cache"|"local"|"refine"|"escalated"
  if (r === "pass") return "local"
  if (r === "escalate") return "escalated"
  if (r === "refine") return "refine"
  return r // already normalized
}

let _logger: AsyncTelemetryLogger | null = null
export function getTelemetry(): AsyncTelemetryLogger {
  if (!_logger) _logger = new AsyncTelemetryLogger()
  return _logger
}

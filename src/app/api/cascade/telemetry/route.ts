import { NextRequest, NextResponse } from "next/server"
import { getTelemetry } from "@/lib/cascade/telemetry"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/cascade/telemetry?limit=24
 * Returns recent shadow_telemetry rows + divergence stats.
 */
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "24", 10)),
    )
    const telemetry = getTelemetry()
    const [rows, stats] = await Promise.all([
      telemetry.recent(limit),
      telemetry.stats(),
    ])
    return NextResponse.json({ ok: true, rows, stats })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

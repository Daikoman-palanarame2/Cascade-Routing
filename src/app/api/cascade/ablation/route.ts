import { NextResponse } from "next/server"
import { getLatestRun } from "@/lib/cascade/ablation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/cascade/ablation
 * Returns the latest ablation run + per-condition results.
 * Used by the control panel's Ablation section.
 */
export async function GET() {
  try {
    const run = await getLatestRun()
    return NextResponse.json({ ok: true, run })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

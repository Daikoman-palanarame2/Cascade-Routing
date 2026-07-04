import { NextResponse } from "next/server"
import { startAblationRun } from "@/lib/cascade/ablation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * POST /api/cascade/ablation/run
 * Kicks off an ablation run in the background. Returns the runId immediately.
 * The UI polls GET /api/cascade/ablation for progress.
 *
 * The full run takes ~3-5 minutes (5 conditions × 23 queries × ~2 LLM calls).
 */
export async function POST() {
  try {
    const { runId } = await startAblationRun()
    return NextResponse.json({
      ok: true,
      runId,
      message:
        "Ablation run started. Poll GET /api/cascade/ablation for progress.",
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 409 })
  }
}

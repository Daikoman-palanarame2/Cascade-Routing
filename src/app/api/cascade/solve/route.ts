import { NextRequest, NextResponse } from "next/server"
import { getPipeline } from "@/lib/cascade/pipeline"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/cascade/solve
 * Body: { task: string, forceCache?: boolean }
 *
 * Runs a query through the full Free-Verify Cascade pipeline:
 *   cache → early-exit → local vLLM n=3 → meta-classifier → refine/escalate
 * Returns the full execution trace for the control panel.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const task: string | undefined = body?.task
    const forceCache: boolean = Boolean(body?.forceCache)

    if (!task || typeof task !== "string" || task.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid 'task' field" },
        { status: 400 },
      )
    }

    const pipeline = getPipeline()
    const result = await pipeline.solve(task.trim(), { forceCache })

    return NextResponse.json({
      ok: true,
      result,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[/api/cascade/solve] error:", msg)
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 },
    )
  }
}

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/cascade/cache
 * Lists recent cache entries for the control panel.
 */
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(
      100,
      Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10)),
    )
    const entries = await db.semanticCache.findMany({
      take: limit,
      orderBy: { updatedAt: "desc" },
    })
    return NextResponse.json({
      ok: true,
      entries: entries.map((e) => ({
        id: e.id,
        task: e.task,
        tier: e.tier,
        metaConf: e.metaConf,
        tokensPaid: e.tokensPaid,
        hitCount: e.hitCount,
        pEasy: e.pEasy,
        agreement: e.agreement,
        judgeScore: e.judgeScore,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

/**
 * DELETE /api/cascade/cache
 * Clears all cache entries (for the demo reset button).
 */
export async function DELETE() {
  try {
    await db.semanticCache.deleteMany({})
    return NextResponse.json({ ok: true, cleared: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

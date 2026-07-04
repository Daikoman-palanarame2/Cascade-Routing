import { NextResponse } from "next/server"
import { getMetaRouter } from "@/lib/cascade/meta-router"
import { buildTrainingSet, seedTasks } from "@/lib/cascade/seed-data"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/cascade/train
 * Trains the meta-router on the seed dataset (Anti-Hallucination Oracle
 * Gate labels). Returns the fit state — AUC, Brier, isFitted.
 *
 * If AUC < 0.75 or Brier > 0.15, _is_fitted stays false and the
 * deterministic linear fallback continues to serve traffic.
 */
export async function POST() {
  try {
    const router = getMetaRouter()
    const { features, labels } = buildTrainingSet()
    const fit = await router.fit(features, labels)

    return NextResponse.json({
      ok: true,
      fit,
      samples: features.length,
      seedTasks: seedTasks.length,
      bounds: {
        aucMin: 0.75,
        brierMax: 0.15,
      },
      passed: fit.isFitted,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

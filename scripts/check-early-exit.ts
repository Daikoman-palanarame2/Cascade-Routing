import { db } from "@/lib/db"

async function main() {
  const run = await db.ablationRun.findFirst({
    orderBy: { startedAt: "desc" },
  })
  if (!run) {
    console.log("No runs found")
    return
  }
  console.log("Latest run:", run.id, "status:", run.status, "progress:", run.progress)
  const queries = await db.ablationQuery.findMany({
    where: { runId: run.id, condition: "earlyExit" },
    orderBy: { queryIndex: "asc" },
  })
  for (const q of queries) {
    console.log(`[earlyExit#${q.queryIndex}] acc=${q.accurate} score=${q.score} paid=${q.paid} resp="${q.response.slice(0, 120)}..."`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

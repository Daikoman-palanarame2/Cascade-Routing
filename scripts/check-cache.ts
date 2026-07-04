import { db } from "@/lib/db"
async function main() {
  const run = await db.ablationRun.findFirst({ orderBy: { startedAt: "desc" } })
  if (!run) { console.log("No runs"); return }
  const queries = await db.ablationQuery.findMany({
    where: { runId: run.id, condition: "cache" },
    orderBy: { queryIndex: "asc" },
  })
  for (const q of queries) {
    console.log(`[cache#${q.queryIndex}] acc=${q.accurate} score=${q.score} paid=${q.paid} resp="${q.response.slice(0, 100)}..."`)
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

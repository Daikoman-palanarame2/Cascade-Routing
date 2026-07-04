import { db } from "@/lib/db"

async function main() {
  const queries = await db.ablationQuery.findMany({
    where: { runId: "cmr6ebn890000relvntmz606m" },
    orderBy: [{ condition: "asc" }, { queryIndex: "asc" }],
  })
  for (const q of queries) {
    console.log(`[${q.condition}#${q.queryIndex}] acc=${q.accurate} score=${q.score} paid=${q.paid} resp="${q.response.slice(0, 100)}..."`)
  }
  console.log(`Total: ${queries.length}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

import { db } from "@/lib/db"

async function main() {
  const result = await db.ablationQuery.deleteMany({})
  console.log(`Deleted ${result.count} ablation queries`)
  const result2 = await db.ablationRun.deleteMany({})
  console.log(`Deleted ${result2.count} ablation runs`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })

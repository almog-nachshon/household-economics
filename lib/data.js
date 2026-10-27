import { db } from "@/lib/db";

export async function loadData() {
  const [snapshots, settings] = await Promise.all([
    db.snapshot.findMany({ orderBy: { month: "asc" } }),
    db.settings.findUnique({ where: { id: 1 } }),
  ]);
  return { snapshots, settings, last: snapshots[snapshots.length - 1] };
}

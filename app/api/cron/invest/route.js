import { db } from "@/lib/db";
import { generatePlan, depositMonth } from "@/lib/invest-run";
import { advisorEnabled } from "@/lib/advisor";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

// Called daily by the server's cron (see CLAUDE.md): refreshes the coming deposit's plan once a day,
// and the run on the deposit day (the 10th) is the final one, which later runs leave alone.
export async function POST(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("forbidden", { status: 403 });
  if (!advisorEnabled()) return new Response("ANTHROPIC_API_KEY is not set", { status: 503 });
  const now = new Date();
  const existing = await db.aiPlan.findUnique({ where: { month: depositMonth(now) } });
  if (existing && (existing.final || existing.createdAt.toDateString() === now.toDateString())) {
    return Response.json({ status: "up to date", createdAt: existing.createdAt });
  }
  const plan = await generatePlan(now);
  return Response.json({ status: "created", final: plan.final, createdAt: plan.createdAt });
}

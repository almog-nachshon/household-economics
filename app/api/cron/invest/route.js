import { db } from "@/lib/db";
import { startOfMonth } from "@/lib/budget";
import { generatePlan } from "@/lib/invest-run";
import { advisorEnabled } from "@/lib/advisor";

export const dynamic = "force-dynamic";

// Called by the server's cron on the 10th (see CLAUDE.md). Runs the review once per month.
export async function POST(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("forbidden", { status: 403 });
  if (!advisorEnabled()) return new Response("ANTHROPIC_API_KEY is not set", { status: 503 });
  const existing = await db.aiPlan.findUnique({ where: { month: startOfMonth(new Date()) } });
  if (existing) return Response.json({ status: "exists", createdAt: existing.createdAt });
  const plan = await generatePlan();
  return Response.json({ status: "created", createdAt: plan.createdAt });
}

import { db } from "@/lib/db";
import { startOfMonth } from "@/lib/budget";
import { generatePlan, depositMonth } from "@/lib/invest-run";
import { generateFundReview } from "@/lib/fund-advisor";
import { advisorEnabled } from "@/lib/advisor";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

// Called by the server's cron on the 10th (see CLAUDE.md): the deposit's final investment plan, and the monthly
// review of the pension / keren tracks. Each runs only when this month's result is missing (or not final).
export async function POST(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("forbidden", { status: 403 });
  if (!advisorEnabled()) return new Response("ANTHROPIC_API_KEY is not set", { status: 503 });
  const now = new Date();
  const result = {};

  const plan = await db.aiPlan.findUnique({ where: { month: depositMonth(now) } });
  if (plan && (plan.final || plan.createdAt.toDateString() === now.toDateString())) result.invest = "up to date";
  else result.invest = (await generatePlan(now)).final ? "created (final)" : "created";

  const review = await db.fundReview.findUnique({ where: { month: startOfMonth(now) } });
  if (review) result.funds = "up to date";
  else {
    try {
      await generateFundReview(now);
      result.funds = "created";
    } catch (e) {
      result.funds = `failed: ${e.message}`;
    }
  }
  return Response.json(result);
}

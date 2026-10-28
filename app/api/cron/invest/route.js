import { db } from "@/lib/db";
import { generatePlan, depositMonth } from "@/lib/invest-run";
import { generateFundReview } from "@/lib/fund-advisor";
import { advisorEnabled } from "@/lib/advisor";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

// Called by the server's cron on the 10th (see CLAUDE.md): the deposit's final investment plan every month, and the
// review of the pension / keren tracks once every 3 months (the button on the funds page runs it any time).
export async function POST(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("forbidden", { status: 403 });
  if (!advisorEnabled()) return new Response("ANTHROPIC_API_KEY is not set", { status: 503 });
  const now = new Date();
  const result = {};

  const plan = await db.aiPlan.findUnique({ where: { month: depositMonth(now) } });
  if (plan && (plan.final || plan.createdAt.toDateString() === now.toDateString())) result.invest = "up to date";
  else result.invest = (await generatePlan(now)).final ? "created (final)" : "created";

  const review = await db.fundReview.findFirst({ orderBy: { createdAt: "desc" } });
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate() + 1); // a day of slack so the 10th-to-10th run is not skipped
  if (review && review.createdAt > threeMonthsAgo) result.funds = `up to date (${review.createdAt.toISOString().slice(0, 10)})`;
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

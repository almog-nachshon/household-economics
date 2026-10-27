import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { startOfMonth } from "@/lib/budget";
import { loadMarket } from "@/lib/portfolio";
import { runAdvisor } from "@/lib/advisor";

// Last month's confirmed purchase: what the advisor should keep or stop adding to.
export async function lastHeld(month) {
  const prev = await db.investPick.findFirst({ where: { month: { lt: month } }, orderBy: { month: "desc" } });
  return prev ? db.investPick.findMany({ where: { month: prev.month } }) : [];
}

// Runs the Claude review for the current month and stores it (replacing an earlier run this month).
export async function generatePlan(today = new Date()) {
  const month = startOfMonth(today);
  const [settings, market, held] = await Promise.all([getSettings(), loadMarket(), lastHeld(month)]);
  const plan = await runAdvisor({ ...market, monthlyInvest: settings.monthlyInvest, profile: settings.riskProfile, held, today });
  const data = {
    summary: plan.summary,
    picks: JSON.stringify(plan.picks),
    stopped: JSON.stringify(plan.stopped),
    risks: JSON.stringify(plan.risks),
    research: plan.research,
    model: plan.model,
    createdAt: new Date(),
  };
  return db.aiPlan.upsert({ where: { month }, update: data, create: { month, ...data } });
}

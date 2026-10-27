import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { loadMarket, REVIEW_DAY } from "@/lib/portfolio";
import { runAdvisor } from "@/lib/advisor";

// The deposit the plan is for: this month's 10th until (and including) the 10th, then next month's.
export function depositMonth(today = new Date()) {
  return new Date(today.getFullYear(), today.getMonth() + (today.getDate() <= REVIEW_DAY ? 0 : 1), 1);
}
export const depositDate = (month) => new Date(month.getFullYear(), month.getMonth(), REVIEW_DAY);

// Everything bought so far, per symbol: total ILS and the last month it was bought.
export async function holdings() {
  const rows = await db.investPick.groupBy({ by: ["symbol"], _sum: { amount: true }, _max: { month: true } });
  return rows.map((r) => ({ symbol: r.symbol, amount: r._sum.amount, last: r._max.month.toISOString().slice(0, 7) }));
}

// Runs the Claude review for the coming deposit and stores it; on the deposit day it is the final one.
export async function generatePlan(today = new Date()) {
  const month = depositMonth(today);
  const [settings, market, held] = await Promise.all([getSettings(), loadMarket(), holdings()]);
  const plan = await runAdvisor({ ...market, monthlyInvest: settings.monthlyInvest, holdings: held, depositDate: depositDate(month), today });
  const data = {
    final: today.getDate() === REVIEW_DAY,
    summary: plan.summary,
    picks: JSON.stringify(plan.picks),
    changes: JSON.stringify(plan.changes),
    risks: JSON.stringify(plan.risks),
    research: plan.research,
    model: plan.model,
    createdAt: new Date(),
  };
  return db.aiPlan.upsert({ where: { month }, update: data, create: { month, ...data } });
}

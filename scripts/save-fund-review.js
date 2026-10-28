// Saves a pension / keren review researched in Claude Code (no API cost) as this month's FundReview.
// Same piping as scripts/save-plan.js, with the review JSON on stdin:
// { summary, funds: [{fund (exact Fund name), verdict: stay|switch|check, best, reason, alternatives: [{name, return3y, return5y, return1y, feeBalance, feeDeposit}]}], research }
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", async () => {
  const review = JSON.parse(input);
  const today = new Date();
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  const data = { summary: review.summary, funds: JSON.stringify(review.funds), research: review.research, createdAt: today };
  await db.fundReview.upsert({ where: { month }, update: data, create: { month, ...data } });
  console.log("saved fund review for", month.toISOString().slice(0, 10));
});

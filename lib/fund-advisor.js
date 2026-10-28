import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { startOfMonth } from "@/lib/budget";
import { research, structure } from "@/lib/advisor";
import { monthlyDeposit } from "@/lib/funds";

// Monthly (or on-demand) review: are the user's pension and keren hishtalmut tracks still among the best in
// their category? Claude looks up public comparisons (Gemelnet / Pensyanet / Mygemel) and answers per fund.

function brief(funds, today) {
  const rows = funds.map((f) =>
    `- ${f.name} (${f.kind === "pension" ? "pension fund" : "keren hishtalmut"}): track "${f.track || "unknown"}", balance ${Math.round(f.balance)} ILS, ` +
    `fees ${f.feeBalancePct}% of balance / ${f.feeDepositPct}% of deposits, monthly deposit ${Math.round(monthlyDeposit(f))} ILS` +
    (f.liquidDate ? `, liquid ${f.liquidDate.toISOString().slice(0, 10)}` : ""),
  );
  return `Today is ${today.toISOString().slice(0, 10)}. An Israeli employee (born 1991, saving for a home in mid-2030) holds these accounts:

${rows.join("\n")}

For each account, research the current public data on Israeli ${"equity (מניות / מניות סחיר / S&P-style)"} tracks in the same category (pension funds for the pension accounts, keren hishtalmut for the kerens), from Gemelnet, Pensyanet, Mygemel or similar: net returns over 12 months, 3 years and 5 years, management fees and risk (standard deviation / Sharpe).

Then for each account:
- How does the current track rank against the top equity tracks in its category?
- The best 3-4 alternatives with their returns and fees.
- Verdict: stay, or switch (and to which track). Switch only for a clear, persistent gap after fees, not a one-year lead. Moving between funds keeps the keren's seniority and is tax-free; note anything to check first (insurance cover in pension funds, fee negotiation with the current fund).
- For the keren that is liquid before the home purchase, whether its risk level still fits money needed in 2030.`;
}

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "3-4 sentences in Hebrew" },
    funds: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fund: { type: "string", description: "the account name exactly as given" },
          verdict: { type: "string", enum: ["stay", "switch", "check"] },
          best: { type: "string", description: "recommended track and manager, in Hebrew" },
          reason: { type: "string", description: "one or two sentences in Hebrew" },
          alternatives: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                return1y: { type: "string" },
                return3y: { type: "string" },
                return5y: { type: "string" },
                fee: { type: "string" },
              },
              required: ["name", "return1y", "return3y", "return5y", "fee"],
              additionalProperties: false,
            },
          },
        },
        required: ["fund", "verdict", "best", "reason", "alternatives"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "funds"],
  additionalProperties: false,
};

export async function generateFundReview(today = new Date()) {
  const funds = await db.fund.findMany({ orderBy: [{ kind: "asc" }, { balance: "desc" }] });
  if (!funds.length) throw new Error("no funds to review");
  const client = new Anthropic();
  const prompt = brief(funds, today);
  const notes = await research(client, prompt);
  const review = await structure(client, prompt, notes, SCHEMA);
  const month = startOfMonth(today);
  const data = { summary: review.summary, funds: JSON.stringify(review.funds), research: notes, createdAt: new Date() };
  return db.fundReview.upsert({ where: { month }, update: data, create: { month, ...data } });
}

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

For each account, research Israeli equity tracks (מניות / מניות סחיר / עוקב מדד S&P 500) in the same category. Take every number only from the official data of the Capital Market, Insurance and Savings Authority (רשות שוק ההון, ביטוח וחיסכון, Ministry of Finance): Gemelnet (gemelnet.cma.gov.il) for keren hishtalmut, Pensyanet (pensyanet.cma.gov.il) for pension funds, and its datasets on data.gov.il. Search is limited to those government sites; if a figure is not there, say it is missing rather than estimating it. Compare like with like: comprehensive pension funds (מקיפה) with comprehensive, supplementary pension funds (משלימה / כללית) with supplementary, keren hishtalmut with keren hishtalmut.

The deciding factors, in this order: net return over 5 years and over 3 years, then the management fees, both of them: % of balance and % of deposits. For fees, use the average fees each fund reports to the Authority and the regulated default-fund fees (קרנות ברירת מחדל) as the benchmark. Use 12-month returns only as context.

Then for each account:
- How does the current track rank on those factors?
- The 3 best funds/tracks that could replace it, with 3- and 5-year returns and both fees.
- Verdict: stay, or switch (and to which track). Switch only for a clear, persistent gap after fees, not a one-year lead. Moving between funds keeps the keren's seniority and is tax-free; note anything to check first (insurance cover in pension funds, fee negotiation with the current fund). The user's current fees are agent-negotiated discounts that the fund cancels on any withdrawal, transfer or track change within the same fund, so a switch must also beat the current fees, not just the fund's list price.
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
                return3y: { type: "string", description: "net, e.g. 14.2%" },
                return5y: { type: "string" },
                return1y: { type: "string" },
                feeBalance: { type: "string", description: "% of balance" },
                feeDeposit: { type: "string", description: "% of deposits" },
              },
              required: ["name", "return3y", "return5y", "return1y", "feeBalance", "feeDeposit"],
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

export async function generateFundReview(today = new Date(), depth = "full") {
  const funds = await db.fund.findMany({ orderBy: [{ kind: "asc" }, { balance: "desc" }] });
  if (!funds.length) throw new Error("no funds to review");
  const client = new Anthropic();
  const prompt = brief(funds, today);
  const notes = await research(client, prompt, depth, ["cma.gov.il", "data.gov.il", "gov.il"]);
  const review = await structure(client, prompt, notes, SCHEMA, depth);
  const month = startOfMonth(today);
  const data = { summary: review.summary, funds: JSON.stringify(review.funds), research: notes, createdAt: new Date() };
  return db.fundReview.upsert({ where: { month }, update: data, create: { month, ...data } });
}

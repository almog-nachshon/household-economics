import Anthropic from "@anthropic-ai/sdk";
import { BUCKETS, PROFILES, CANDIDATES } from "@/lib/portfolio";

// Monthly investment review by Claude: step 1 researches the candidates on the web next to their real
// 1-year numbers, step 2 turns that research into a validated 5-6 position split.
const MODEL = "claude-opus-5-5";
const BETAS = ["server-side-fallback-2026-07-01"];

export const advisorEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);

function candidateTable(bySymbol) {
  return BUCKETS.map((b) => {
    const rows = b.candidates.map(([s]) => {
      const q = bySymbol[s];
      const note = q.buyable ? "" : " [NOT BUYABLE as physical at IBKR - context only, do not pick]";
      if (q.error) return `- ${s} (${q.name}): no data${note}`;
      return `- ${s} (${q.name}): price ${q.price} ${q.currency}; 1m ${pct(q.m1)}, 3m ${pct(q.m3)}, 6m ${pct(q.m6)}, 12m ${pct(q.m12)}; volatility ${pct(q.vol)}; max drawdown ${pct(q.maxDrawdown)}${note}`;
    });
    return `### ${b.key}\n${rows.join("\n")}`;
  }).join("\n\n");
}

function brief({ bySymbol, usdIls, monthlyInvest, profile, held, today }) {
  const split = PROFILES[profile].split;
  const heldText = held.length ? held.map((h) => `${h.symbol} ${h.pct}%`).join(", ") : "nothing yet (first month)";
  return `Today is ${today.toISOString().slice(0, 10)}. An Israeli investor deposits ${monthlyInvest} ILS (USD/ILS ${usdIls?.toFixed(3) ?? "n/a"}) into Interactive Brokers by standing order on the 10th of every month and buys with all of it the same day. Help choose this month's purchase.

Target split by bucket (risk profile "${profile}"): long-term index funds ${split.long}%, metals ${split.metals}%, stocks ${split.stocks}%. Each bucket may move by up to 5 points if you have a reason.

Last month's purchase: ${heldText}.

Candidates with real 1-year daily data (adjusted closes):

${candidateTable(bySymbol)}

Constraints:
- 5 or 6 positions in total, percentages summing to 100, every position at least 5%.
- At least one position in each bucket whose target is above 0.
- Metals means the metal itself (spot gold XAUUSD / silver XAGUSD at IBKR), not miners or ETFs. Copper has no spot product at IBKR; leave it out.
- Never two funds that track the same index (VOO, CSPX.L and VUAA.L all track the S&P 500). For an Israeli investor the Irish UCITS listings (.L) are usually preferable for tax, but London funds trade in whole units only: skip one whose unit price is above its share of the monthly amount.
- Monthly buying is additive: a holding that is not picked again simply stops receiving new money (no selling, no capital gains tax). Prefer continuity; switch only for a real reason (deteriorating trend, fundamentals or news).

Research the current picture before deciding: recent earnings and guidance for the stocks, the macro and rate outlook, and what is driving gold and silver this month. Then give your recommended positions with a percentage each, a short reason per position, which of last month's holdings to stop adding to and why, and the main risks this month.`;
}

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "3-5 sentences in Hebrew: this month's picture and the logic of the split" },
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          pct: { type: "number" },
          action: { type: "string", enum: ["keep", "new"] },
          reason: { type: "string", description: "one sentence in Hebrew" },
        },
        required: ["symbol", "pct", "action", "reason"],
        additionalProperties: false,
      },
    },
    stopped: {
      type: "array",
      items: {
        type: "object",
        properties: { symbol: { type: "string" }, reason: { type: "string", description: "one sentence in Hebrew" } },
        required: ["symbol", "reason"],
        additionalProperties: false,
      },
    },
    risks: { type: "array", items: { type: "string", description: "in Hebrew" } },
  },
  required: ["summary", "picks", "stopped", "risks"],
  additionalProperties: false,
};

const textOf = (message) => message.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");

function checkStop(message) {
  if (message.stop_reason === "refusal") throw new Error("Claude declined the request");
  if (message.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off");
}

// Step 1: research with web search. A long search can pause the turn; it is resumed until done.
async function research(client, prompt) {
  const messages = [{ role: "user", content: prompt }];
  for (let i = 0; i < 4; i++) {
    const message = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 64000,
        betas: BETAS,
        fallbacks: "default",
        output_config: { effort: "high" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10 }],
        messages,
      })
      .finalMessage();
    if (message.stop_reason !== "pause_turn") {
      checkStop(message);
      return textOf(message);
    }
    messages.push({ role: "assistant", content: message.content });
  }
  throw new Error("research did not finish");
}

// Step 2: the research as a JSON split, validated against the candidate list and the rules.
async function structure(client, prompt, notes) {
  const message = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 16000,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        { role: "user", content: `${prompt}\n\nYour research and recommendation:\n\n${notes}\n\nNow return exactly that recommendation as JSON. Write the summary, reasons and risks in Hebrew.` },
      ],
    })
    .finalMessage();
  checkStop(message);
  return JSON.parse(textOf(message));
}

function validate(plan) {
  const picks = plan.picks.filter((p) => CANDIDATES[p.symbol]?.buyable && p.pct > 0);
  if (picks.length < 3) throw new Error(`invalid picks: ${plan.picks.map((p) => p.symbol).join(", ")}`);
  // Rounding drift is spread back so the split is exactly 100%.
  const total = picks.reduce((t, p) => t + p.pct, 0);
  return { ...plan, picks: picks.map((p) => ({ ...p, pct: Math.round((p.pct / total) * 1000) / 10 })) };
}

export async function runAdvisor(input) {
  const client = new Anthropic();
  const prompt = brief(input);
  const notes = await research(client, prompt);
  const plan = validate(await structure(client, prompt, notes));
  return { ...plan, research: notes, model: MODEL };
}

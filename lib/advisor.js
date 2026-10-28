import Anthropic from "@anthropic-ai/sdk";
import { BUCKETS, CANDIDATES, METALS_MAX } from "@/lib/portfolio";

// Investment review by Claude: step 1 researches the candidates and current holdings on the web next to
// their real 1-year numbers, step 2 turns that research into a JSON plan.
const MODEL = "claude-opus-5-5";
// Two depths: the full research on the 10th (cron), and a cheap manual check in between - a smaller model,
// fewer searches, no page reads and a short answer, to keep the tokens (and the cost) down.
export const DEPTHS = {
  full: { model: MODEL, effort: "high", searches: 30, fetches: 15, maxTokens: 64000 },
  lite: { model: "claude-sonnet-5-5", effort: "low", searches: 5, fetches: 0, maxTokens: 8000 },
};
const LITE_NOTE = "\n\nThis is a quick in-between check, so keep it lean: search only for the latest news, analyst moves and results of the leading contenders and the current holdings (a few searches at most), and keep the written research short (bullet points, under 600 words).";
const BETAS = ["server-side-fallback-2026-07-01"];

export const advisorEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);

function candidateTable(bySymbol) {
  return BUCKETS.map((b) => {
    const rows = b.candidates.map(([s]) => {
      const q = bySymbol[s];
      if (q.error) return `- ${s} (${q.name}): no data`;
      if (!q.buyable) return `- ${s}: 1m ${pct(q.m1)}, 3m ${pct(q.m3)}, 12m ${pct(q.m12)} [copper: no spot product at IBKR, context only - do not pick]`;
      const unit = s.endsWith(".L") ? `; whole units only, unit ≈ ${Math.round(q.priceIls ?? 0)} ILS` : "";
      return `- ${s} (${q.name}): 1m ${pct(q.m1)}, 3m ${pct(q.m3)}, 6m ${pct(q.m6)}, 12m ${pct(q.m12)}; volatility ${pct(q.vol)}; max drawdown ${pct(q.maxDrawdown)}${unit}`;
    });
    const head = b.key === "metals"
      ? `### metals: the physical metal (spot gold XAUUSD / silver XAGUSD at IBKR) - you set its share, 0-${METALS_MAX}% of the deposit, 1 pick`
      : `### ${b.key}: ${b.name} - ${b.pct}% of what remains after metals, ${b.count} pick(s)`;
    return `${head}\n${rows.join("\n")}`;
  }).join("\n\n");
}

function brief({ bySymbol, usdIls, monthlyInvest, holdings, depositDate, today }) {
  const holdingsText = holdings.length
    ? holdings.map((h) => `${h.symbol}: ${Math.round(h.amount)} ILS invested in total, last bought ${h.last}`).join("\n")
    : "none yet (first deposit)";
  return `Today is ${today.toISOString().slice(0, 10)}. An Israeli investor deposits ${monthlyInvest} ILS (USD/ILS ${usdIls?.toFixed(3) ?? "n/a"}) into Interactive Brokers by standing order and buys on ${depositDate.toISOString().slice(0, 10)}. Choose that deposit's holdings and review what is already held.

The split: four buckets with fixed shares and a fixed number of picks each, plus a metals bucket whose share you decide (0-${METALS_MAX}%) from what gold and silver are doing now and the macro picture; the other buckets shrink in proportion. Choose which candidates fill the places, using only symbols from the lists. Never two funds tracking the same index (VOO, CSPX.L and VUAA.L all track the S&P 500). For an Israeli investor the Irish UCITS listings (.L) are usually preferable for tax, but skip one whose unit costs more than its amount.

Candidates with real 1-year daily data (adjusted closes):

${candidateTable(bySymbol)}

Current holdings (bought in earlier months):
${holdingsText}

This is real personal money, so do a thorough, independent research pass before deciding; the Yahoo numbers above are only the starting point, not the basis of the decision. For every candidate that is a serious contender, and for every current holding, look up:
- Fundamentals: the latest quarterly results (revenue, EPS, margins vs expectations), guidance, profit or loss trend, valuation (forward P/E vs history and peers). For funds: holdings concentration, expense ratio, what drives the index now.
- Analysts: current consensus rating, the number of buy/hold/sell ratings, average 12-month price target and the implied upside, and recent upgrades/downgrades with the firm's reasoning.
- Outlook: forecasts for the next 12 months, upcoming catalysts (earnings dates, contracts, product launches, Fed meetings) and what could go wrong.
- News: recent articles and analysis (last weeks), from several reliable sources (e.g. Reuters, Bloomberg, CNBC, MarketWatch, Morningstar, Investing.com, Seeking Alpha, the Financial Times, the issuers' and companies' own sites and SEC filings). Cross-check prices and returns against those sources; when sources disagree say so and prefer the primary one.
- Metals: gold and silver separately - bank and analyst forecasts (e.g. Goldman Sachs, JPMorgan, UBS, Citi, the Silver Institute), central-bank buying, industrial demand (solar, electronics), supply deficits, the gold/silver ratio, real rates and the dollar. Weigh the bull case for each metal against the bear case before choosing the metal and its share.

Then weigh it all together: momentum and risk from the numbers, fundamentals, analyst views and the outlook, against what is already held. Prefer quality and a fair price over chasing the last month. Then:
1. The metals share and which metal, then the picks for each bucket. For each pick: why the money should go there, the analyst consensus and target, the outlook, and your conviction (1-5).
2. A recommendation for every current holding: add (it is among this month's picks), hold (keep it, no new money), reduce (sell part) or sell (sell all). Selling in Israel triggers 25% capital gains tax on the profit, so recommend selling only for a real reason: broken thesis, deteriorating fundamentals, or a much better use of the money.
3. The main risks right now.`;
}

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "3-5 sentences in Hebrew: the current picture and the logic of the picks" },
    metalsPct: { type: "number", description: `share of the deposit for metals, 0-${METALS_MAX}` },
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          reason: { type: "string", description: "one or two sentences in Hebrew: why the money goes here" },
          analysts: { type: "string", description: "in Hebrew: consensus rating, buy/hold/sell count, average target and implied upside, e.g. 'קנייה חזקה · 38 קנייה / 5 החזק · יעד ממוצע 210$ (+18%)'" },
          outlook: { type: "string", description: "one sentence in Hebrew: latest results and the 12-month outlook or catalyst" },
          conviction: { type: "number", description: "1-5, how strong the case is" },
        },
        required: ["symbol", "reason", "analysts", "outlook", "conviction"],
        additionalProperties: false,
      },
    },
    changes: {
      type: "array",
      description: "one entry per current holding",
      items: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          action: { type: "string", enum: ["add", "hold", "reduce", "sell"] },
          reason: { type: "string", description: "one sentence in Hebrew" },
        },
        required: ["symbol", "action", "reason"],
        additionalProperties: false,
      },
    },
    risks: { type: "array", items: { type: "string", description: "in Hebrew" } },
  },
  required: ["summary", "metalsPct", "picks", "changes", "risks"],
  additionalProperties: false,
};

const textOf = (message) => message.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");

function checkStop(message) {
  if (message.stop_reason === "refusal") throw new Error("Claude declined the request");
  if (message.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off");
}

// Step 1: research with web search. A long search can pause the turn; it is resumed until done.
// domains: limits search to those sites (e.g. the official regulator data for the fund review).
export async function research(client, prompt, depth = "full", domains) {
  const d = DEPTHS[depth];
  const messages = [{ role: "user", content: depth === "lite" ? prompt + LITE_NOTE : prompt }];
  const tools = [{ type: "web_search_20260209", name: "web_search", max_uses: d.searches, ...(domains && { allowed_domains: domains }) }];
  // Reads pages named in the prompt or found by search (e.g. a comparison table the user trusts).
  if (d.fetches) tools.push({ type: "web_fetch_20260209", name: "web_fetch", max_uses: d.fetches });
  for (let i = 0; i < 8; i++) {
    const message = await client.beta.messages
      .stream({
        model: d.model,
        max_tokens: d.maxTokens,
        betas: BETAS,
        fallbacks: "default",
        output_config: { effort: d.effort },
        tools,
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

// Step 2: the research as JSON.
export async function structure(client, prompt, notes, schema = SCHEMA, depth = "full") {
  const message = await client.beta.messages
    .stream({
      model: DEPTHS[depth].model,
      max_tokens: 16000,
      betas: BETAS,
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      messages: [
        { role: "user", content: `${prompt}\n\nYour research and recommendation:\n\n${notes}\n\nNow return exactly that recommendation as JSON. Write the summary, reasons and risks in Hebrew.` },
      ],
    })
    .finalMessage();
  checkStop(message);
  return JSON.parse(textOf(message));
}

export async function runAdvisor(input, depth = "full") {
  const client = new Anthropic();
  const prompt = brief(input);
  const notes = await research(client, prompt, depth);
  const plan = await structure(client, prompt, notes, SCHEMA, depth);
  // Unknown symbols are dropped here; lib/portfolio.js completePicks enforces the bucket rules.
  return {
    ...plan,
    picks: plan.picks.filter((p) => CANDIDATES[p.symbol]),
    metalsPct: Math.min(METALS_MAX, Math.max(0, Math.round(plan.metalsPct))),
    research: notes,
    model: DEPTHS[depth].model,
  };
}

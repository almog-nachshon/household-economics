import { db } from "@/lib/db";
import { greenLight } from "@/lib/portfolio";

// The deep research per stock, fund or metal (model Research), done in Claude Code: 10+ sources each, five parts
// scored -2..+2 and fused by fixed weights into one verdict, then re-checked by an independent second pass
// (scripts/save-research.js). The page shows one status per symbol and buys only on "buy" (statusOf).
export const STATUS = {
  buy: ["🟢", "לקנות"],
  wait: ["🟡", "עדיף לחכות"],
  sell: ["🔴", "למכור"],
};
// The fusion rule: [part, Hebrew name, weight %]. score = Σ weight × part; buy at 0.6 and up, sell at -0.4 and down.
export const WEIGHTS = [
  ["analysts", "אנליסטים", 35],
  ["revisions", "שינויי המלצות ודוחות", 20],
  ["technicals", "ניתוח טכני", 25],
  ["valuation", "תמחור", 10],
  ["sentiment", "סנטימנט", 10],
];
const DAY = 24 * 3600 * 1000;
// Research older than this, or a fall this big since it was done, is redone before buying.
const STALE_DAYS = 30;
const DROP = -0.1;

const parse = (s, fallback) => {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
};

// The research for the page, by symbol, without the long parts (the details panel asks /api/research for those).
export async function loadResearch() {
  const rows = await db.research.findMany();
  return Object.fromEntries(rows.map((r) => [r.symbol, {
    symbol: r.symbol, verdict: r.verdict, score: r.score, confidence: r.confidence, summary: r.summary, timing: r.timing,
    consensus: parse(r.consensus, {}), earnings: r.earnings, price: r.price, checked: r.checked, prevVerdict: r.prevVerdict,
    asOf: r.asOf, sourceCount: parse(r.sources, []).length,
  }]));
}

// Everything about one symbol's research, for the details panel.
export async function researchDetails(symbol) {
  const r = await db.research.findUnique({ where: { symbol } });
  if (!r) return null;
  return {
    ...r, reasons: parse(r.reasons, []), components: parse(r.components, {}), consensus: parse(r.consensus, {}), sources: parse(r.sources, []),
  };
}

const ilDate = (d) => d.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });

// The one status shown and acted on: the research verdict, with today's timing on top. A "buy" turns to "wait"
// while a quarterly report is due within a week, the price ran up fast (RSI 70+), it fell 10%+ since the research,
// or the research is over a month old; "wait" and "sell" stay as they are. Without research, the old rule:
// 🟢 + analysts (greenLight) is a buy, 🔴 a sell, anything else a wait.
// r: from loadResearch; g: the signal (lib/signals.js); price: the price now in the research's currency.
export function statusOf(r, g, price) {
  if (!r) {
    if (!g) return null;
    return { key: greenLight(g) ? "buy" : g.level === "exit" ? "sell" : "wait", research: false, why: g.reasons };
  }
  const base = { key: r.verdict, research: true, confidence: r.confidence, asOf: r.asOf };
  if (r.verdict !== "buy") return base;
  const days = g?.days ?? (r.earnings ? Math.ceil((r.earnings - Date.now()) / DAY) : null);
  const timing = [];
  if (days != null && days >= 0 && days <= 7) timing.push(`דוח רבעוני ${days === 0 ? "היום" : days === 1 ? "מחר" : `בעוד ${days} ימים`}: תנודה חדה אפשרית, עדיף לקנות אחריו`);
  if (g?.rsi != null && g.rsi >= 70) timing.push(`RSI ${Math.round(g.rsi)}: עלתה מהר, ״מחוממת״`);
  if (price && r.price && price / r.price - 1 <= DROP) timing.push(`ירדה ${Math.round((1 - price / r.price) * 100)}% מאז המחקר: צריך מחקר חדש לפני קנייה`);
  if (Date.now() - r.asOf > STALE_DAYS * DAY) timing.push(`המחקר מ-${ilDate(r.asOf)}, יותר מ-${STALE_DAYS} יום: צריך מחקר חדש לפני קנייה`);
  return timing.length ? { ...base, key: "wait", timing } : base;
}

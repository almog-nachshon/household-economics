import { db } from "@/lib/db";
import { BUCKETS, loadMarket } from "@/lib/portfolio";
import { signalsFor } from "@/lib/signals";
import { loadResearch, statusOf } from "@/lib/research";
import { duplicateOf } from "@/lib/overlap";

// Exit points: a holding this far below or above its cost raises an alert (the user chose -15% / +30%).
export const STOP = -0.15;
export const TARGET = 0.3;
// Cash waiting in the account above this (in its currency) is a reminder to invest or convert it.
const CASH_MIN = { USD: 100, ILS: 300 };
const WEEK = 7 * 24 * 3600 * 1000;

const n = (x) => x.toLocaleString("en-US", { maximumFractionDigits: 2 });
const cur = (x, c) => (c === "USD" ? `$${n(x)}` : c === "ILS" ? `${n(x)} ₪` : `${n(x)} ${c}`);
const pct = (x) => `${Math.abs(Math.round(x * 100))}%`;

// Raises an alert unless the same key was raised in the last week (dismissed or not). With `replace`, an open alert
// under the key whose message changed (e.g. a new cash amount) is swapped for the new one.
async function raise(key, data, replace = false) {
  const recent = await db.alert.findFirst({ where: { key, createdAt: { gt: new Date(Date.now() - WEEK) } }, orderBy: { createdAt: "desc" } });
  if (recent && !(replace && !recent.dismissed && recent.message !== data.message)) return;
  if (recent) await db.alert.update({ where: { id: recent.id }, data: { dismissed: true } });
  await db.alert.create({ data: { key, ...data } });
}

// After each IBKR sync: the trades it found, holdings past the exit points, the status of what is held (a research
// "sell", or duplicate funds, listed once), a watched candidate turning to "buy", and cash waiting in the account.
export async function raiseAlerts({ positions, cash, fresh }) {
  for (const t of fresh) {
    const when = t.date.toLocaleDateString("he-IL", { timeZone: "UTC" });
    const message = t.assetClass === "CASH"
      ? `זוהתה המרת מטבע ${t.symbol}: ${n(Math.abs(t.units))} בשער ${t.price} (${when}).`
      : `זוהתה ${t.side === "SELL" ? "מכירה" : "קנייה"} של ${n(Math.abs(t.units))} ${t.symbol} ב-${cur(t.price, t.currency)}, סה״כ ${cur(Math.abs(t.money), t.currency)} (${when}).`;
    await raise(`trade:${t.tradeId}`, { kind: "trade", symbol: t.symbol, message, href: "/invest#folio" });
  }
  for (const p of positions) {
    const r = p.cost ? p.value / p.cost - 1 : 0;
    if (r <= STOP) await raise(`stop:${p.symbol}`, { kind: "stop", symbol: p.symbol, message: `${p.symbol} ירדה ${pct(r)} ממחיר הקנייה. לשקול יציאה (עצירת הפסד).`, href: "/invest#folio" });
    if (r >= TARGET) await raise(`target:${p.symbol}`, { kind: "target", symbol: p.symbol, message: `${p.symbol} עלתה ${pct(r)} ממחיר הקנייה. לשקול מימוש חלקי של הרווח (25% מס רווחי הון).`, href: "/invest#folio" });
  }
  // The same status as the invest page: the deep research with today's timing (lib/research.js statusOf). Keys carry
  // the research date, so a new research can alert again.
  const held = positions.map((p) => p.symbol);
  // Candidates in a watched bucket (photonics) that are not held yet: an alert when one turns to "buy".
  const watched = BUCKETS.filter((b) => b.watch).flatMap((b) => b.candidates.map(([s]) => ({ s, bucket: b.name }))).filter((w) => !held.includes(w.s));
  const market = await loadMarket();
  const [signals, research] = await Promise.all([signalsFor(market.bySymbol, [...held, ...watched.map((w) => w.s)]), loadResearch()]);
  const status = (s) => statusOf(research[s], signals[s], market.bySymbol[s]?.price);
  const day = (s) => research[s]?.asOf.toISOString().slice(0, 10) ?? "none";
  for (const w of watched) {
    if (status(w.s)?.key === "buy") await raise(`watch-buy:${w.s}:${day(w.s)}`, { kind: "enter", symbol: w.s, message: `${w.bucket}: ${w.s} במצב ״לקנות״${research[w.s] ? ` לפי המחקר: ${research[w.s].summary}` : ""}`, href: "/invest#rank" });
  }
  const dupes = held.filter((s) => duplicateOf(s));
  if (dupes.length) await raise(`dupes:${[...dupes].sort().join(",")}`, { kind: "advisor", message: `כפילות בתיק: ${dupes.join(", ")}. רוב הכסף בהן במניות שכבר יש לך ב-VUAA וב-VWRA. ההצעה למכור ולהעביר לתחומים החסרים מוכנה בדף ההשקעות.`, href: "/invest#next" });
  for (const s of held) {
    if (duplicateOf(s) || status(s)?.key !== "sell") continue;
    await raise(`research-sell:${s}:${day(s)}`, { kind: "exit", symbol: s, message: `המחקר אומר למכור את ${s}: ${research[s]?.summary ?? signals[s]?.reasons?.[0] ?? ""}`, href: "/invest#folio" });
  }
  const plan = await db.aiPlan.findFirst({ orderBy: { createdAt: "desc" } });
  for (const c of plan ? JSON.parse(plan.changes) : []) {
    if ((c.action === "sell" || c.action === "reduce") && positions.some((p) => p.symbol === c.symbol)) {
      const what = c.action === "sell" ? "למכור" : "לצמצם (למכור חלק)";
      await raise(`advisor:${c.symbol}:${plan.id}`, { kind: "advisor", symbol: c.symbol, message: `המחקר ממליץ ${what} את ${c.symbol}${c.reason ? `: ${c.reason}` : "."}`, href: "/invest" });
    }
  }
  for (const c of cash) {
    if (c.currency === "USD" && c.amount >= CASH_MIN.USD)
      await raise("cash:USD", { kind: "cash", message: `יש ${cur(c.amount, "USD")} מזומן פנוי בחשבון. החלוקה המומלצת לסכום הזה מוכנה בדף ההשקעות.`, href: `/invest?amount=${Math.floor(c.amount)}&cur=USD` }, true);
    if (c.currency === "ILS" && c.amount >= CASH_MIN.ILS)
      await raise("cash:ILS", { kind: "cash", message: `יש ${cur(c.amount, "ILS")} בחשבון שעוד לא הומרו לדולר. קונים בדולרים, אז כדאי להמיר לפני הקנייה.`, href: "/invest" }, true);
  }
}

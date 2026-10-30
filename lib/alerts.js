import { db } from "@/lib/db";
import { loadMarket } from "@/lib/portfolio";
import { signalsFor } from "@/lib/signals";

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

// After each IBKR sync: the trades it found, holdings past the exit points, entry / exit signals on what is held, the
// research's sell / reduce calls on it, and cash waiting in the account.
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
  // The entry / exit signals (lib/signals.js) of what is held: a time to add, or a reason to consider leaving.
  const held = positions.map((p) => p.symbol);
  const signals = held.length ? await signalsFor((await loadMarket()).bySymbol, held) : {};
  for (const [symbol, g] of Object.entries(signals)) {
    if (g.level === "exit") await raise(`signal-exit:${symbol}`, { kind: "exit", symbol, message: `סימן יציאה ב-${symbol}: ${g.reasons.join("; ")}.`, href: "/invest#folio" });
    if (g.level === "enter") await raise(`signal-enter:${symbol}`, { kind: "enter", symbol, message: `זמן טוב להוסיף ל-${symbol}: ${g.reasons.join("; ")}.`, href: "/invest#folio" });
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

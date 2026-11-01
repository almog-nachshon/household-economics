import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { ils } from "@/lib/goal";
import { BUCKETS, loadMarket, planCash, nextSteps, isMetal, bucketPct, DEFAULT_METALS_PCT, ABOUT } from "@/lib/portfolio";
import { advisorEnabled } from "@/lib/advisor";
import AiButton from "@/components/AiButton";
import SyncButton from "@/components/SyncButton";
import Info from "@/components/Info";
import HoldingsMap from "@/components/HoldingsMap";
import TargetBars from "@/components/TargetBars";
import Logo from "@/components/Logo";
import Sources from "@/components/Sources";
import ExpandRow from "@/components/ExpandRow";
import Details from "@/components/Details";
import Screener from "@/components/Screener";
import SectionTabs from "@/components/SectionTabs";
import WeekAhead from "@/components/WeekAhead";
import StatusTag from "@/components/StatusTag";
import { LiveQuotes, LiveChange, LiveWeek, LivePrice, MarketStatus, IntradayChart, Ticker } from "@/components/Live";
import { portfolio } from "@/lib/holdings";
import { generatePlan, depositMonth, depositDate } from "@/lib/invest-run";
import { ibkrEnabled, syncIbkr, ibkrQuoteUrl, ibkrDetailsUrl } from "@/lib/ibkr";
import { STOP, TARGET } from "@/lib/alerts";
import Alerts from "@/components/Alerts";
import { signalsFor, finvizUrl, onFinviz } from "@/lib/signals";
import { loadResearch, statusOf, STATUS, WEIGHTS } from "@/lib/research";
import { technicalsFor, TECH } from "@/lib/technicals";
import { TechTag } from "@/components/TechPanel";
import { duplicateOf, lookThrough, HEAVY, FUNDS } from "@/lib/overlap";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
// A return in green when up and red when down.
const Ret = ({ x }) => <span className={x > 0 ? "pos" : x < 0 ? "neg" : ""}>{pct(x)}</span>;
const date = (d) => d.toLocaleDateString("he-IL");
const bucketName = Object.fromEntries(BUCKETS.map((b) => [b.key, b.name]));
// One color per bucket, used by the maps and the type tags.
// Checked with the dataviz palette validator (lightness, chroma, color-blind and normal-vision separation).
const BUCKET_COLORS = { index: "#0fa3a3", sector: "#6d5bd0", defense: "#b5651d", risk: "#d6457a", photonics: "#8fb0ff", metals: "#c9a227" };
// Text on a bucket color: dark on the light ones.
const ink = (key) => (key === "photonics" || key === "metals" ? "#1f2a30" : "#fff");
const splitText = (metalsPct) => BUCKETS.filter((b) => b.pct).map((b) => `${b.name} ${Math.round(bucketPct(b, metalsPct))}%`).join(", ");
const CASH_COLOR = "#9aa7ad";
// Israeli capital gains tax on a sale at a profit.
const TAX = 0.25;
// Risk level from the yearly volatility.
const RISK = [[0.15, "נמוך", "risk-low"], [0.25, "בינוני", "risk-mid"], [0.4, "גבוה", "risk-high"], [Infinity, "גבוה מאוד", "risk-vhigh"]];
const Risk = ({ vol }) => {
  if (vol == null) return null;
  const [, name, cls] = RISK.find(([max]) => vol < max);
  return <span className={`risk ${cls}`}>סיכון {name}</span>;
};
const typeOf = (p) => (isMetal(p.symbol) ? "מתכת" : /ETF|קרן|UCITS|SPDR|iShares|Vanguard|Invesco|VanEck|Global X/.test(p.name) ? "קרן סל" : "מניה");
const Div = ({ q }) => (q.divYield > 0 ? <span className="tag tag-div">דיבידנד ~{(q.divYield * 100).toFixed(1)}%</span> : null);
const sharpe = (x) => (x == null ? "—" : x.toFixed(2));
// A name that opens the exact instrument at IBKR (the conid verified by lib/ibkr.js), with its exchange and ISIN on hover.
const IbLink = ({ conid, ib, children }) =>
  conid ? <a href={ibkrQuoteUrl(conid)} target="_blank" rel="noreferrer" title={ib ? `באינטראקטיב: ${ib.ibSymbol} · ${ib.exchange} · ${ib.currency}${ib.isin ? ` · ISIN ${ib.isin}` : ""}` : "פתיחה באינטראקטיב"}>{children}</a> : children;
const signed = (x) => (x == null ? "—" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`);
// What to do with each holding, by its status.
const ACTION = { buy: "אפשר להוסיף", wait: "להחזיק, בלי כסף חדש", sell: "למכור" };

async function syncNow() {
  "use server";
  try {
    await syncIbkr();
  } catch (e) {
    redirect(`/invest?error=${encodeURIComponent(e.message)}`);
  }
  redirect("/invest");
}

async function runNow() {
  "use server";
  try {
    await generatePlan(new Date(), "lite");
  } catch (e) {
    redirect(`/invest?error=${encodeURIComponent(e.message)}`);
  }
  redirect("/invest");
}

// Records the deposit's buys and makes them the split shown on the deposit page.
async function confirm(formData) {
  "use server";
  const month = new Date(formData.get("month"));
  const picks = JSON.parse(formData.get("picks"));
  await db.$transaction([
    db.investPick.deleteMany({ where: { month } }),
    ...picks.map((p) => db.investPick.create({
      data: { month, symbol: p.symbol, bucket: p.bucket, pct: p.pct, amount: p.amount, units: p.units || 0, price: p.priceIls || 0 },
    })),
    db.settings.update({
      where: { id: 1 },
      data: { allocations: JSON.stringify(picks.map((p) => ({ ticker: p.symbol, name: p.name, pct: p.pct }))) },
    }),
  ]);
  revalidatePath("/invest");
}

async function undo(formData) {
  "use server";
  await db.investPick.deleteMany({ where: { month: new Date(formData.get("month")) } });
  revalidatePath("/invest");
}

// Without research or a Claude reason, the numbers speak for themselves.
const numbersReason = (q) =>
  `נבחרה לפי הביצועים: ${pct(q.m12)} בשנה, ${pct(q.m6)} בחצי שנה, ${pct(q.m3)} ב-3 חודשים, בתנודתיות של ${pct(q.vol)}.`;

const units = (p) =>
  p.units == null ? "—" : `${p.units} ${isMetal(p.symbol) ? (p.units === 1 ? "אונקיה" : "אונקיות") : p.units === 1 ? "יחידה" : "יחידות"}`;

export default async function Invest({ searchParams }) {
  const settings = await getSettings();
  const month = depositMonth();
  const day = depositDate(month);
  const [plan, latestPlan, done, market, folio, research] = await Promise.all([
    db.aiPlan.findUnique({ where: { month } }),
    db.aiPlan.findFirst({ orderBy: { month: "desc" } }),
    db.investPick.findMany({ where: { month } }),
    loadMarket(),
    portfolio(),
    loadResearch(),
  ]);
  // A one-off larger (or smaller) amount for this deposit, from the amount box; otherwise the standing order.
  // The amount box works in shekels or dollars (the ₪ / $ toggle); the split is always computed in shekels.
  // With IBKR, every shekel figure uses IBKR's own dollar rate from the statement, also for the candidates' prices.
  const fx = folio.broker && folio.usdIls ? folio.usdIls : market.usdIls;
  if (folio.broker && fx) for (const q of Object.values(market.bySymbol)) if (q.currency === "USD" && q.price) q.priceIls = q.price * fx;
  const usd = searchParams?.cur !== "ILS" && fx > 0; // dollars by default: IBKR trades in USD
  const rate = usd ? fx : 1;
  // With IBKR the amount is always the account's cash not yet invested (no amount box); otherwise the box or the
  // standing order.
  const typed = !ibkrEnabled() && Number(searchParams?.amount) > 0 ? Number(searchParams.amount) : null;
  const cashUsd = folio.broker ? folio.cashBy.find((c) => c.currency === "USD")?.amount ?? 0 : 0;
  const base = cashUsd >= 1 && fx ? cashUsd * fx : settings.monthlyInvest;
  const amount = typed ? typed * rate : base;
  const shown = Math.round(amount / rate);
  const money = (x) => (usd ? `${x < 0 ? "-" : ""}$${Math.round(Math.abs(x) / rate).toLocaleString("en-US")}` : ils(x));
  // A dollar amount with its shekels under it (IBKR's rate).
  const both = (x) => (usd ? <><span>{money(x)}</span><span className="ils-under">{ils(x)}</span></> : <span>{ils(x)}</span>);
  const withIls = (x) => (usd ? `${money(x)} · ${ils(x)}` : ils(x));
  const unitPrice = (x) => (usd ? `$${(x / rate).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : ils(x));
  const chosen = plan ? JSON.parse(plan.picks) : [];
  // The themes' targets and "the picture now" stay as the last plan set them until a newer one is saved; past the 10th
  // the deposit month moves on before there is a plan for it.
  const metalsPct = latestPlan ? latestPlan.metalsPct : DEFAULT_METALS_PCT;
  // Every candidate with data, best score first, the score scaled 0-100.
  const valid = Object.values(market.bySymbol).filter((q) => !q.error && q.buyable);
  const [lo, hi] = [Math.min(...valid.map((q) => q.score)), Math.max(...valid.map((q) => q.score))];
  const ranked = valid.map((q) => ({ ...q, rankScore: hi > lo ? ((q.score - lo) / (hi - lo)) * 100 : 50 })).sort((x, y) => y.score - x.score);
  const signals = await signalsFor(market.bySymbol, [...Object.keys(market.bySymbol), ...folio.rows.map((h) => h.symbol)]);
  const techs = await technicalsFor([...Object.keys(market.bySymbol), ...folio.rows.map((h) => h.symbol)]);
  // How much of what is held sits under each technical label, for the snapshot in the first block.
  const techHeld = Object.keys(TECH).map((k) => ({ key: k, value: folio.rows.filter((h) => techs[h.symbol]?.key === k).reduce((t, h) => t + h.value, 0) }));
  const techHeldTotal = techHeld.reduce((t, x) => t + x.value, 0);

  // One status per symbol, shown everywhere and the only thing that buys: the deep research with today's timing
  // (lib/research.js), except that a fund repeating the core is a duplicate (never bought, sold when held) and a
  // stock already HEAVY% of the account, counting what the funds hold of it, gets no new money (lib/overlap.js).
  const total = folio.value || 1;
  const lt = lookThrough(folio.rows, total);
  const heldSet = new Set(folio.rows.map((h) => h.symbol));
  const heavy = Object.values(lt)
    .filter((x) => x.pct >= HEAVY && x.direct > 0)
    .map((x) => ({ ...x, direct: (x.direct / total) * 100, via: (x.via / total) * 100 }));
  const statuses = {};
  for (const s of new Set([...Object.keys(market.bySymbol), ...heldSet])) {
    const st = statusOf(research[s], signals[s], market.bySymbol[s]?.price);
    const dup = duplicateOf(s);
    const hv = heavy.find((x) => x.symbol === s);
    statuses[s] = dup
      ? { ...st, research: st?.research ?? false, key: heldSet.has(s) ? "sell" : "dup", dup, base: st?.key, timing: null }
      : hv && st?.key === "buy"
        ? { ...st, key: "wait", timing: [...(st.timing ?? []), `כבר ${Math.round(hv.pct)}% מהחשבון בפועל, כולל מה שיש ממנה בתוך הקרנות: לא מוסיפים`] }
        : st;
  }
  const why = (s) => statuses[s]?.dup?.reason ?? statuses[s]?.timing?.join(" · ") ?? research[s]?.summary ?? signals[s]?.reasons?.[0] ?? "";
  // The same, in one short line for the lists of holdings, where the full duplicate reason would repeat row after row.
  const whyShort = (s) => (statuses[s]?.dup ? `${Math.round(statuses[s].dup.inSp500)}% מהקרן במניות S&P 500` : why(s));
  // How much more (ILS) each single stock may take before it is HEAVY% of the account, counting the funds' share of it.
  const room = Object.fromEntries(
    Object.keys(market.bySymbol).filter((s) => !FUNDS[s] && !isMetal(s)).map((s) => [s, Math.max(0, (HEAVY / 100) * total - (lt[s]?.value ?? 0))]),
  );

  // 3. The account's cash: the themes below target first, adding to what is held there, then down the ranking.
  const heldRows = folio.rows.filter((h) => h.bucket);
  const broker = folio.broker && heldRows.length > 0;
  const cashPlan = planCash({ held: broker ? heldRows : [], amount, bySymbol: market.bySymbol, statuses, metalsPct, ranked, chosen, room });
  const { picks, skipped, leftover, extras, left: extraLeft, waiting, shares } = cashPlan;
  const buys = [...picks, ...extras].map((p) => ({ ...p, cost: p.cost ?? p.amount }));
  // The detailed cards: the split's picks, then the next in line in priority order.
  const cards = [...picks, ...extras.map((p, i) => ({ ...p, amount: p.cost, pct: (p.cost / amount) * 100, next: i + 1, topUp: heldRows.some((h) => h.symbol === p.symbol) }))];

  // 4. Changes: each holding whose status is "sell" (a duplicate of the core, or the research's call) is sold whole,
  // and the money fills the themes below target the same way, on top of what the cash above already buys.
  const sells = broker
    ? heldRows.filter((h) => statuses[h.symbol]?.key === "sell").map((h) => ({ ...h, why: whyShort(h.symbol), tax: Math.max(0, h.profit) * TAX }))
    : [];
  const proceeds = sells.reduce((t, h) => t + h.value, 0);
  const afterCash = [...heldRows.filter((h) => !sells.some((x) => x.symbol === h.symbol)), ...buys.map((p) => ({ symbol: p.symbol, bucket: p.bucket, value: p.cost }))];
  const roomAfter = Object.fromEntries(Object.entries(room).map(([s, r]) => [s, r - buys.filter((p) => p.symbol === s).reduce((t, p) => t + p.cost, 0)]));
  const swap = sells.length ? planCash({ held: afterCash, amount: proceeds, bySymbol: market.bySymbol, statuses, metalsPct, ranked, chosen, room: roomAfter }) : null;
  const swapBuys = swap ? [...swap.picks, ...swap.extras].map((p) => ({ ...p, cost: p.cost ?? p.amount })) : [];
  const steps = folio.broker
    ? nextSteps({ rows: folio.rows, total, statuses, signals, waiting, metalsPct, dupes: heldRows.filter((h) => statuses[h.symbol]?.dup), heavy })
    : [];

  // The maps: each theme's holdings and the cash, as % of the whole account.
  const groups = [
    ...BUCKETS.map((b) => {
      const rows = folio.rows.filter((h) => h.bucket === b.key);
      const value = rows.reduce((t, h) => t + h.value, 0);
      return {
        key: b.key, name: b.name, color: BUCKET_COLORS[b.key], ink: ink(b.key), value, pct: (value / total) * 100, target: bucketPct(b, metalsPct), valueText: withIls(value),
        rows: rows.map((h) => ({ symbol: h.symbol, name: h.name, type: typeOf(h), change: market.bySymbol[h.symbol]?.d1 ?? null, profitPct: h.pct, profitText: withIls(h.profit), about: [ABOUT[h.symbol], statuses[h.symbol] && `${(statuses[h.symbol].key === "dup" ? ["⛔", "כפילות"] : STATUS[statuses[h.symbol].key]).join(" ")}: ${why(h.symbol)}`].filter(Boolean).join(" · "), value: h.value, pct: (h.value / total) * 100, valueText: withIls(h.value) })),
      };
    }),
    ...(folio.rows.some((h) => !h.bucket)
      ? [{
          key: "other", name: "אחר", color: "#5f6f77", value: folio.rows.filter((h) => !h.bucket).reduce((t, h) => t + h.value, 0), target: null,
          rows: folio.rows.filter((h) => !h.bucket).map((h) => ({ symbol: h.symbol, name: h.name, value: h.value, pct: (h.value / total) * 100, valueText: withIls(h.value) })),
        }].map((g) => ({ ...g, pct: (g.value / total) * 100, valueText: withIls(g.value) }))
      : []),
    { key: "cash", name: "מזומן לא מושקע", color: CASH_COLOR, value: Math.max(0, folio.cash), pct: (Math.max(0, folio.cash) / total) * 100, target: null, valueText: withIls(folio.cash), rows: [{ symbol: "מזומן לא מושקע", name: "", value: Math.max(0, folio.cash), pct: (Math.max(0, folio.cash) / total) * 100, valueText: withIls(folio.cash) }] },
  ];

  // The details under a clicked row (components/Details.js).
  const detailsFor = (s, h) => {
    const q = market.bySymbol[s];
    const b = BUCKETS.find((x) => x.key === (q?.bucket ?? h?.bucket));
    const conid = h?.conid ?? q?.ibkr?.conid;
    return (
      <Details
        symbol={s} name={q?.name ?? h?.name ?? s} type={typeOf(q ?? h)} bucket={b ? { name: b.name, color: BUCKET_COLORS[b.key], ink: ink(b.key) } : null}
        q={q} h={h} st={statuses[s]} tech={techs[s]} g={signals[s]} r={research[s]} lt={lt[s]} total={total} fmt={{ ils, unitPrice, withIls }} about={ABOUT[s]}
        links={{ ibkr: conid ? ibkrQuoteUrl(conid) : null, ibkrDetails: conid ? ibkrDetailsUrl(conid) : null, finviz: onFinviz(s) ? finvizUrl(s) : null }}
      />
    );
  };
  // The research behind "the picture now": when, how much, and the statuses it gave.
  const studied = Object.values(research);
  const researchDay = studied.length ? new Date(Math.max(...studied.map((r) => r.asOf.getTime()))) : null;
  const count = (k) => ranked.filter((q) => statuses[q.symbol]?.key === k).length;
  // The quarterly reports of the coming week, by day, from the signals and the research.
  const reportDays = {};
  for (const s of new Set([...Object.keys(market.bySymbol), ...heldSet])) {
    const when = signals[s]?.earnings ?? research[s]?.earnings;
    if (!when) continue;
    const d = new Date(when);
    const away = (d.getTime() - Date.now()) / (24 * 3600 * 1000);
    if (away < -1 || away > 7) continue;
    (reportDays[d.toISOString().slice(0, 10)] ??= []).push({ symbol: s, held: heldSet.has(s) });
  }
  const weekDays = Object.keys(reportDays).sort().map((k) => ({
    label: new Date(k).toLocaleDateString("he-IL", { timeZone: "UTC", weekday: "short", day: "numeric", month: "numeric" }),
    symbols: reportDays[k].sort((a, b) => b.held - a.held || a.symbol.localeCompare(b.symbol)),
  }));
  const TABS = [["folio", "התיק"], ["pnl", "רווח / הפסד"], ["cash", "מזומן"], ["next", "המלצות ושינויים"], ["picture", "התמונה כרגע"], ["rank", "דירוג"]];

  return (
    <>
      <div className="page-head">
        <h1>{folio.broker ? "השקעות" : `השקעות: הפקדה ב-${date(day)}`}</h1>
        <MarketStatus />
        <Alerts />
      </div>
      <div className="page-actions">
        {ibkrEnabled() && (
          <form action={syncNow} style={{ maxWidth: "none" }}>
            <SyncButton
              updated={folio.fetchedAt?.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" })}
              info={folio.broker
                ? `דוח סוף היום של אינטראקטיב מ-${folio.asOf.toLocaleDateString("he-IL", { timeZone: "UTC" })}${folio.todayFills ? ` + ${folio.todayFills} עסקאות מהיום` : ""}. מתעדכן לבד כל בוקר ב-9:00; עסקאות של היום נמשכות בכל רענון, כמה דקות אחרי הביצוע. הקניות מזוהות לבד, אין צורך לסמן ״קניתי״.`
                : "עוד לא נמשך דוח מאינטראקטיב."}
            />
          </form>
        )}
        {advisorEnabled() && (
          <form action={runNow} style={{ maxWidth: "none" }}>
            <AiButton
              label={<><span className="btn-long">בדיקה מהירה של </span>Claude</>}
              updated={plan?.createdAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" })}
              info={plan
                ? `${plan.final ? "בדיקה סופית" : "בדיקה יומית"} של Claude (${plan.model}). הכפתור מריץ בדיקה מהירה; המחקר המעמיק (הסטטוסים) נעשה ב-Claude Code.`
                : "Claude עוד לא בדק את ההפקדה הזו. עד אז החלוקה לפי הביצועים בלבד."}
            />
          </form>
        )}
      </div>
      {folio.broker && folio.rows.length > 0 && (
        <LiveQuotes symbols={[...new Set(["VOO", "QQQM", ...folio.rows.map((h) => h.symbol)])]}>
          <Ticker symbols={[...new Set(["VOO", "QQQM", ...folio.rows.map((h) => h.symbol)])]} labels={{ VOO: "S&P 500", QQQM: "NASDAQ 100" }} />
        </LiveQuotes>
      )}
      {folio.error && <p className="warn">העדכון האחרון מאינטראקטיב נכשל: {folio.error}</p>}
      {searchParams?.error && <p className="warn">הפעולה נכשלה: {searchParams.error}</p>}
      {market.rateError && <p className="warn">לא הצלחתי למשוך שערי מטבע ({market.rateError}).</p>}

      <WeekAhead days={weekDays} />
      {folio.broker && folio.rows.length > 0 && <SectionTabs tabs={TABS} />}

      <LiveQuotes symbols={folio.rows.map((h) => h.symbol)}>
        {/* 1. The portfolio now: the numbers, today's map and the holdings, each row opening its details */}
        <div className="card" id="folio" style={{ marginTop: 4 }}>
          <h2 style={{ margin: 0 }}>
            {folio.broker ? "המצב עכשיו: התיק שלי (אחזקות)" : "התיק שלי"}{" "}
            <Info text={folio.broker
              ? `מאינטראקטיב, במחירי הסגירה של ${folio.asOf.toLocaleDateString("he-IL", { timeZone: "UTC" })} (קניות מהיום במחיר הקנייה). התראה ב-${Math.round(STOP * 100)}% או ב-+${Math.round(TARGET * 100)}% ממחיר הקנייה. הרווח בדולרים, מומר לשקלים בשער היום.`
              : "לפי כל ההפקדות שסימנת ״קניתי״, במחירי היום"} />
          </h2>
          {folio.rows.length === 0 ? (
            <p className="label">
              {folio.broker
                ? `עוד אין החזקות בחשבון. מזומן בחשבון: ${money(folio.cash)}. אחרי הקנייה באינטראקטיב, התיק יתעדכן כאן לבד.`
                : "עוד אין קניות. אחרי ״קניתי״ התיק, הרווח והתשואה יחושבו כאן ובדף הראשי."}
            </p>
          ) : (
            <>
              <div className="hero-row" style={{ marginTop: 8 }}>
                {folio.broker && <div><div className="label">שווי החשבון</div><div className="value">{both(folio.value)}</div></div>}
                <div><div className="label">הושקע</div><div className="value">{both(folio.cost)}</div></div>
                <div><div className="label">שווי היום</div><div className="value">{both(folio.held)}</div></div>
                <div><div className="label">רווח / הפסד</div><div className={`value ${folio.profit >= 0 ? "pos" : "neg"}`}>{both(folio.profit)}</div></div>
                <div><div className="label">תשואה</div><div className={`value ${folio.pct >= 0 ? "pos" : "neg"}`}>{pct(folio.pct)}</div></div>
                {folio.broker && <div><div className="label">מזומן בחשבון</div><div className="value">{both(folio.cash)}</div></div>}
                {folio.week != null && <div><div className="label">רווח השבוע</div><div className={`value ${folio.week >= 0 ? "pos" : "neg"}`}>{both(folio.week)}</div></div>}
              </div>
              {techHeldTotal > 0 && (
                <div className="tech-held">
                  <b>📊 סיכום טכני של התיק (יומי)</b> <Info text="כמה משווי ההחזקות נמצא תחת כל תווית. התווית נקבעת לפי המגמה הארוכה, נוסחה שנבדקה על 1995-2026. ״מכירה״ פירושה סיכון גבוה יותר לירידה, לא הפסד ודאי. תמונת מצב בלבד: מה שקונה הוא הסטטוס מהמחקר. הפירוט בלחיצה על שורה." />
                  {techHeld.filter((x) => x.value > 0).map((x) => (
                    <span key={x.key}><span className={`tech tech-${x.key}`}>{TECH[x.key]}</span> {Math.round((x.value / techHeldTotal) * 100)}%</span>
                  ))}
                </div>
              )}
              {folio.broker && (
                <>
                  <h3 className="hmap-title">🎯 כמה יש בכל תחום מול היעד <Info text="היעד הוא החלוקה הקבועה שקבענו. הפס הוא מה שיש עכשיו, הקו השחור הוא היעד, והכול באחוזים מכל החשבון כולל מזומן. פער של יותר מ-5 נקודות מסומן באדום." /></h3>
                  <TargetBars groups={groups} total={total} money={money} />
                  <h3 className="hmap-title">📈 השינוי היום</h3>
                  <HoldingsMap groups={groups} />
                </>
              )}
              <div className="table-scroll" style={{ marginTop: 8 }}>
                <table className="compact holdings">
                  <thead><tr><th>סימול</th><th>שם</th><th>יחידות</th><th>הושקע</th><th>שווי</th><th>רווח</th><th>%</th><th>היום</th><th>טכני</th><th>סטטוס <Info text="מהמחקר המעמיק: לקנות / עדיף לחכות / למכור, עם התזמון של היום. ⛔ כפילות = קרן שרובה מניות שכבר יש לך בליבה (VUAA ו-VWRA). לחיצה על שורה פותחת את כל הפרטים, גרף שבועי והמקורות." /></th></tr></thead>
                  <tbody>
                    {folio.rows.map((h) => (
                      <ExpandRow
                        key={h.symbol}
                        colSpan={10}
                        cells={<>
                          <td className="sym-col"><span className="sym"><span className="exp-ico" aria-hidden="true">▾</span><Logo id={h.symbol} label={h.name} size={18} /><IbLink conid={h.conid ?? market.bySymbol[h.symbol]?.ibkr?.conid}><b>{h.symbol}</b></IbLink></span></td>
                          <td className="line-name" title={h.name}>{h.name} <span className="xtag hpie-type">{typeOf(h)}</span></td>
                          <td>{h.units ? Math.round(h.units * 1000) / 1000 : "—"}</td>
                          <td>{both(h.cost)}</td>
                          <td>{both(h.value)}</td>
                          <td className={h.profit >= 0 ? "pos" : "neg"}>{both(h.profit)}</td>
                          <td><Ret x={h.pct} /></td>
                          <td><LiveChange symbol={h.symbol} fallback={market.bySymbol[h.symbol]?.d1} /></td>
                          <td><TechTag t={techs[h.symbol]} short /></td>
                          <td><StatusTag st={statuses[h.symbol]} /></td>
                        </>}
                      >
                        {detailsFor(h.symbol, h)}
                      </ExpandRow>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="label tap-hint">👆 לחיצה על שורה: כל הפרטים, גרף שבועי והמחקר עם המקורות</p>
            </>
          )}
        </div>

        {/* 2. Profit or loss since buying, per holding */}
        {folio.broker && folio.rows.length > 0 && (
          <div className="card" id="pnl" style={{ marginTop: 12 }}>
            <h2 style={{ margin: 0 }}>
              💰 הרווח / ההפסד שלי מאז הקנייה: <span className={folio.profit >= 0 ? "pos" : "neg"}>{withIls(folio.profit)} ({pct(folio.pct)})</span>
            </h2>
            <HoldingsMap groups={groups} mode="profit" />
          </div>
        )}
      </LiveQuotes>

      {/* 3. Cash not yet invested, and what it buys */}
      {folio.broker ? (
        <div className="cash-line" id="cash">
          <h2 style={{ margin: 0 }}>💵 כסף לא מושקע בחשבון: {money(amount)} <span className="label">({ils(amount)})</span></h2>
          <Info text={`נבדק מאינטראקטיב בכל רענון (כולל קניות של היום). כל החלוקה למטה היא רק לכסף הזה, כך שלא נשאר מזומן בלי השקעה. השקלים לפי שער ההמרה של אינטראקטיב (${fx?.toFixed(3)}).`} />
        </div>
      ) : (
        <form method="get" style={{ display: "flex", gap: 8, alignItems: "center", maxWidth: "none", marginBottom: 12, flexWrap: "wrap" }}>
          <span>סכום להשקעה:</span>
          <input type="number" name="amount" min="1" step="1" defaultValue={shown} style={{ width: 140 }} />
          <input type="hidden" name="cur" value={usd ? "USD" : "ILS"} />
          <span className="cur-toggle">
            <a href={`/invest?amount=${Math.round(amount / (market.usdIls || 1))}&cur=USD`} className={usd ? "on" : ""}>$ דולר</a>
            <a href={`/invest?amount=${Math.round(amount)}&cur=ILS`} className={usd ? "" : "on"}>₪ שקל</a>
          </span>
          <button type="submit">חשב חלוקה</button>
          {market.usdIls && <span className="label">דולר = {market.usdIls.toFixed(3)} ₪ <Info text={market.usdFx?.official ? "שער יציג של בנק ישראל" : "שער עכשיו, חציון של כמה מקורות, מתעדכן כל דקה"} /></span>}
          <Sources q={market.usdFx} currency="ILS" digits={3} />
          {Math.round(amount) !== Math.round(base) && <a href="/invest">{cashUsd >= 1 ? `חזרה למזומן הפנוי בחשבון ($${Math.floor(cashUsd).toLocaleString("en-US")})` : `חזרה להוראת הקבע (${ils(settings.monthlyInvest)})`}</a>}
          {!typed && cashUsd >= 1 && <Info text="הסכום = המזומן הפנוי בחשבון אינטראקטיב. אפשר להקליד סכום אחר." />}
        </form>
      )}

      <LiveQuotes symbols={cards.map((p) => p.symbol)}>
        <div className="card invest-hero">
          <div className="invest-hero-head">
            <div>
              <div className="label">{folio.broker ? "לחלוקה עכשיו" : `הפקדה ב-${date(day)}`}</div>
              <div className="value big">{money(amount)}</div>
              {usd && <div className="label">≈ {ils(amount)}{folio.broker ? "" : ` לפי דולר = ${fx.toFixed(3)} ₪`}</div>}
              <div className="label">
                {picks.length ? `${picks.length} החזקות · ` : ""}לפי המחקר המעמיק{" "}
                <Info text={shares ? `החלוקה משלימה את מה שכבר בתיק: כסף לחלקים שרחוקים מהיעד (${splitText(metalsPct)}). בכל חלק מוסיפים קודם למניה שכבר מחזיקים בו, כדי לא לפצל להרבה מניות. רק מה שבמצב ״לקנות״, בלי כפילויות.` : `חלוקה קבועה: ${splitText(metalsPct)}, ומתכות לפי המחקר.`} />
              </div>
            </div>
            <div className="bucket-bars">
              {/* What is actually bought, per bucket, and what stays as cash: together 100% of the amount. */}
              {[
                ...BUCKETS.map((b) => ({ key: b.key, name: b.name, color: BUCKET_COLORS[b.key], value: buys.filter((p) => p.bucket === b.key).reduce((t, p) => t + p.cost, 0) })),
                { key: "cash", name: "נשאר כמזומן בתיק", color: CASH_COLOR, value: Math.max(0, extraLeft) },
              ].filter((x) => x.value > 0.5).map((x) => {
                const share = (x.value / amount) * 100;
                return (
                  <div key={x.key} className="bucket-bar">
                    <span>{x.name}</span>
                    <div className="meter thin"><div style={{ width: `${share}%`, background: x.color }} /></div>
                    <b>{Math.round(share * 10) / 10}%</b>
                  </div>
                );
              })}
            </div>
          </div>
          <h2 style={{ marginTop: 16 }}>{folio.broker ? "מה לקנות עכשיו" : "סקירת הקצאת התיק"}</h2>
          {folio.broker && picks.length === 0 && extras.length === 0 && <p className="label">אין כרגע קנייה בסכום הזה: אף מניה או קרן במצב ״לקנות״ (ובלי כפילות) שיחידה שלה נכנסת בסכום. הכסף יתחלק לבד ברגע שתהיה.</p>}
          {picks.length > 0 && (
            <div className="table-scroll">
              <table className="alloc-table">
                <thead>
                  <tr><th>החזקה</th><th className="alloc-bar-col">חלק מההפקדה</th><th>סכום</th><th>מחיר עכשיו</th><th>היום</th><th>השבוע</th><th>שנה</th><th>סוג</th></tr>
                </thead>
                <tbody>
                  {picks.map((p) => (
                    <tr key={p.symbol}>
                      <td><span className="sym"><Logo id={p.symbol} label={p.name} size={20} /><IbLink conid={p.ibkr?.conid} ib={p.ibkr}><b>{p.symbol}</b></IbLink>{p.topUp && <span className="topup-tag" title="תוספת להחזקה קיימת">➕</span>}{p.capped && <Info text={`רק עד ${HEAVY}% מהחשבון במניה אחת (כולל מה שיש ממנה בתוך הקרנות). מה שנשאר יורד לבאים בתור.`} />}</span></td>
                      <td className="alloc-bar-col">
                        <div className="alloc-bar">
                          <div style={{ width: `${Math.min(100, p.pct * 4)}%`, background: BUCKET_COLORS[p.bucket] }} />
                          <span>{Math.round(p.pct * 10) / 10}%</span>
                        </div>
                      </td>
                      <td><b>{both(p.amount)}</b></td>
                      <td><LivePrice symbol={p.symbol} ils={p.priceIls ? ils(p.priceIls) : null} /></td>
                      <td><LiveChange symbol={p.symbol} fallback={p.d1} /></td>
                      <td><LiveWeek symbol={p.symbol} /></td>
                      <td><Ret x={p.m12} /></td>
                      <td><span className="tag" style={{ marginInlineStart: 0 }}>{typeOf(p)}</span><Div q={p} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {skipped.map((p) => (
            <p key={p.symbol} className="label">
              {p.symbol} לא נקנה עכשיו: יחידה אחת עולה {unitPrice(p.priceIls)}, יותר מהחלק שלו ({money(p.target)}). הסכום נשאר כמזומן.
            </p>
          ))}
          {extras.length > 0 && (
            <div className="extra-box">
              <h2 style={{ margin: 0 }}>
                💡 עוד {money(leftover)} פנויים: הבאים בתור{" "}
                <Info text="כדי שלא יישאר מזומן בלי השקעה: הכסף שנשאר אחרי החלוקה יורד בטבלת הדירוג, להחזקה קיימת או למניה חדשה, לפי הסדר. רק מה שבמצב ״לקנות״, בלי כפילויות ובלי תחומים שכבר מעל היעד." />
              </h2>
              <table className="compact">
                <thead><tr><th>החזקה</th><th>תחום</th><th>סטטוס</th><th>לקנות</th><th>סכום</th><th>למה</th></tr></thead>
                <tbody>
                  {extras.map((p) => (
                    <tr key={p.symbol}>
                      <td><span className="sym"><Logo id={p.symbol} label={p.name} size={18} /><IbLink conid={p.ibkr?.conid} ib={p.ibkr}><b>{p.symbol}</b></IbLink></span></td>
                      <td><span className="tag" style={{ background: BUCKET_COLORS[p.bucket], color: ink(p.bucket), marginInlineStart: 0 }}>{bucketName[p.bucket]}</span></td>
                      <td><StatusTag st={statuses[p.symbol]} /></td>
                      <td><b>{units(p)}</b> <span className="label">× {unitPrice(p.priceIls)}</span></td>
                      <td><b>{both(p.cost)}</b></td>
                      <td className="label wrap">{why(p.symbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {waiting.length > 0 && (
            <p className="label">
              ⏳ בתוכנית אבל לא במצב ״לקנות״: {waiting.map((w) => w.symbol).join(", ")}{" "}
              <Info text={waiting.map((w) => `${w.symbol}: ${why(w.symbol)}`).join(" · ")} />
            </p>
          )}
          {extraLeft > 1 && (
            <p className="label">
              נשאר כמזומן בחשבון: {money(extraLeft)}{" "}
              <Info text={extras.length ? "פחות ממחיר יחידה אחת של מה שבמצב ״לקנות״. יתחלק לבד כשיגיע עוד כסף או כשעוד מניה תעבור ל״לקנות״." : "אין כרגע מניה או קרן במצב ״לקנות״ שיחידה שלה נכנסת בסכום הזה. יתחלק לבד ברגע שתהיה."} />
            </p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            {folio.broker ? null : done.length ? (
              <form action={undo} style={{ maxWidth: "none" }}>
                <span>✅ סומן כנקנה: {done.map((p) => p.symbol).join(", ")} </span>
                <input type="hidden" name="month" value={month.toISOString()} />
                <button type="submit" className="secondary">ביטול הסימון</button>
              </form>
            ) : (
              <form action={confirm}>
                <input type="hidden" name="month" value={month.toISOString()} />
                <input type="hidden" name="picks" value={JSON.stringify(picks.map(({ symbol, name, bucket, pct, amount, units, priceIls }) => ({ symbol, name, bucket, pct, amount, units, priceIls })))} />
                <button type="submit">קניתי ✓</button>
              </form>
            )}
          </div>
        </div>

        {cards.length > 0 && (
          <>
            <h2 style={{ marginTop: 20 }}>
              {cards.length} הבחירות: ניתוח מפורט{" "}
              {extras.length > 0 && <Info text="קודם ההשלמה לתחומים החסרים, ואחריה ״הבאים בתור״ לפי סדר העדיפות בדירוג (הכסף שנשאר אחרי החלוקה)." />}
            </h2>
            <div className="pick-grid">
              {cards.map((p) => {
                const g = signals[p.symbol];
                return (
                  <div key={p.symbol} className="xcard" style={{ borderTopColor: BUCKET_COLORS[p.bucket] }}>
                    <div className="xcard-head">
                      <Logo id={p.symbol} label={p.name} size={36} />
                      <div className="xcard-id">
                        {p.next && <span className="next-badge">💡 הבא בתור #{p.next}</span>}
                        {p.topUp && <span className="next-badge topup">➕ תוספת להחזקה קיימת</span>}
                        <div className="xcard-sym"><IbLink conid={p.ibkr?.conid} ib={p.ibkr}>{p.symbol}</IbLink></div>
                        <div className="xcard-name" dir="auto" title={p.name}><IbLink conid={p.ibkr?.conid} ib={p.ibkr}>{p.name}</IbLink></div>
                        {p.ibkr && (
                          <a className="ib-verified" href={ibkrDetailsUrl(p.ibkr.conid)} target="_blank" rel="noreferrer" title="פרטי החוזה הרשמיים של אינטראקטיב">
                            ✓ אומת באינטראקטיב · ID {p.ibkr.conid}{p.ibkr.isin ? ` · ISIN ${p.ibkr.isin}` : ` · ${p.ibkr.ibSymbol}`}
                          </a>
                        )}
                      </div>
                      <div className="xcard-money">
                        <div className="xcard-pct" style={{ color: BUCKET_COLORS[p.bucket] }}>{Math.round(p.pct * 10) / 10}%</div>
                        <div className="xcard-amount">{money(p.amount)}</div>
                      </div>
                    </div>
                    <div className="xcard-price-row">
                      <div>
                        <span className="xcard-k">מחיר ליחידה</span>
                        <b className="usd-price">{p.priceIls ? unitPrice(p.priceIls) : "—"}</b>
                        {usd && p.priceIls ? <span className="xcard-ils">{ils(p.priceIls)}</span> : null}
                      </div>
                      <div className="xcard-today"><span className="xcard-k">היום</span><LiveChange symbol={p.symbol} fallback={p.d1} /></div>
                    </div>
                    <Sources q={p} currency={p.currency} />
                    <div className="xcard-buyrow">
                      <span className="xcard-k">לקנות</span>
                      <b>{units(p)}</b>
                      <span className="xcard-buy-total">סה״כ <b>{money(p.cost)}</b>{usd ? <span> · {ils(p.cost)}</span> : null}</span>
                    </div>
                    <div className="xcard-tags">
                      <StatusTag st={statuses[p.symbol]} />
                      <Risk vol={p.vol} />
                      <span className="xtag">{typeOf(p)}</span>
                      <span className="xtag xtag-sector" style={{ color: BUCKET_COLORS[p.bucket], borderColor: BUCKET_COLORS[p.bucket] }}>{p.sector || bucketName[p.bucket]}</span>
                      {p.divYield > 0 && <span className="xtag xtag-div">💰 דיבידנד ~{(p.divYield * 100).toFixed(1)}%</span>}
                    </div>
                    <div className="xcard-about">{p.about || ABOUT[p.symbol]}</div>
                    <div className="xcard-why">
                      <span>💡 למה לקנות</span>
                      <p>{research[p.symbol]?.summary || p.reason || numbersReason(p)}</p>
                    </div>
                    {p.outlook && (
                      <div className="xcard-risk">
                        <span>⚠️ מה לשים לב</span>
                        <p>{p.outlook}</p>
                      </div>
                    )}
                    {g && (
                      <div className="xcard-signal">
                        <div className="xcard-signal-head"><span>⏱️ נתונים טכניים</span></div>
                        <div className="xcard-signal-metrics">
                          <span>RSI<Info text="מדד מומנטום 0-100: מעל 70 = עלתה מהר מדי (״מחוממת״), מתחת ל-30 = ירדה מהר מדי" /> <b>{g.rsi != null ? Math.round(g.rsi) : "—"}</b></span>
                          <span>מול ממוצע 50 יום <b>{signed(g.sma50)}</b></span>
                          <span>מול ממוצע 200 יום<Info text="מעל הממוצע = מגמת עלייה ארוכה" /> <b>{signed(g.sma200)}</b></span>
                          <span>מהשיא השנתי <b>{signed(g.fromHigh)}</b></span>
                          {g.analysts && <span>אנליסטים <b>{g.analysts.buy} קנייה · {g.analysts.hold} החזקה · {g.analysts.sell} מכירה</b></span>}
                          {g.earnings && <span>דוח רבעוני הבא <b>{g.earnings.toLocaleDateString("he-IL", { timeZone: "UTC" })}</b></span>}
                        </div>
                        {onFinviz(p.symbol) && <a href={finvizUrl(p.symbol)} target="_blank" rel="noreferrer" className="label">לגרף ולנתונים המלאים ב-Finviz ←</a>}
                      </div>
                    )}
                    <IntradayChart symbol={p.symbol} />
                    <div className="xcard-metrics">
                      <div><span>תשואה שנתית<Info text="השינוי במחיר (כולל דיבידנדים) ב-12 החודשים האחרונים" /></span><Ret x={p.m12} /></div>
                      <div><span>ממוצע חודשי<Info text="התשואה הממוצעת לחודש בשנה האחרונה" /></span><Ret x={p.mAvg} /></div>
                      <div><span>שארפ<Info text="תשואה ביחס לסיכון, מעל ריבית חסרת סיכון של 4%. מעל 1 = טוב, מעל 2 = מצוין" /></span><b className="pos">{sharpe(p.sharpe)}</b></div>
                      <div><span>תנודתיות<Info text="כמה המחיר קופץ במהלך שנה. מעל 40% = תנודתי מאוד" /></span><b>{pct(p.vol)}</b></div>
                      <div><span>ירידה מקס׳<Info text="הנפילה הגדולה ביותר מהשיא בשנה האחרונה" /></span><Ret x={p.maxDrawdown} /></div>
                      <div><span>מגמה 30 יום<Info text="השינוי במחיר בחודש האחרון" /></span><Ret x={p.m1} /></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </LiveQuotes>

      {/* 4. Recommendations and changes from here */}
      {folio.broker && heldRows.length > 0 && (
        <div className="card next-steps" id="next" style={{ marginTop: 16 }}>
          <h2>📌 המלצות ושינויים להמשך <Info text="מחושב מחדש בכל רענון: מה שבאמת יש בתיק מול החלוקה הרצויה, הסטטוס מהמחקר המעמיק עם התזמון של היום, והכפילויות בין הקרנות. לא ייעוץ השקעות." /></h2>
          {sells.length > 0 && (
            <div className="rebalance">
              <h3>🔄 שינויים בתיק: למכור ← לקנות</h3>
              <div className="rb-grid">
                <div>
                  <div className="rb-title rb-sell">1. למכור (כל ההחזקה)</div>
                  <table className="compact">
                    <tbody>
                      {sells.map((h) => (
                        <tr key={h.symbol}>
                          <td><span className="sym"><Logo id={h.symbol} label={h.name} size={18} /><b>{h.symbol}</b></span></td>
                          <td>{Math.round(h.units * 1000) / 1000} יח׳</td>
                          <td><b>{both(h.value)}</b></td>
                          <td className={h.profit >= 0 ? "pos" : "neg"}>{signed(h.pct)}</td>
                          <td className="label wrap">{h.why}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="rb-total">משתחרר: <b>{withIls(proceeds)}</b> · מס משוער: <b>{withIls(sells.reduce((t, h) => t + h.tax, 0))}</b> <Info text="25% מס רווחי הון רק על רווח; מכירה בהפסד בלי מס, וההפסד מקזז רווחים אחרים בשנה. עמלה באינטראקטיב: בערך דולר לעסקה." /></div>
                </div>
                <div>
                  <div className="rb-title rb-buy">2. לקנות בכסף שהתפנה</div>
                  {swapBuys.length ? (
                    <table className="compact">
                      <tbody>
                        {swapBuys.map((p) => (
                          <tr key={p.symbol}>
                            <td><span className="sym"><Logo id={p.symbol} label={p.name} size={18} /><IbLink conid={p.ibkr?.conid} ib={p.ibkr}><b>{p.symbol}</b></IbLink></span></td>
                            <td><span className="tag" style={{ background: BUCKET_COLORS[p.bucket], color: ink(p.bucket), marginInlineStart: 0 }}>{bucketName[p.bucket]}</span></td>
                            <td><b>{units(p)}</b> <span className="label">× {unitPrice(p.priceIls)}</span></td>
                            <td><b>{both(p.cost)}</b></td>
                            <td><StatusTag st={statuses[p.symbol]} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="label">כרגע אף מניה או קרן בתחומים החסרים לא במצב ״לקנות״.</p>
                  )}
                  {swap && swap.left > 1 && (
                    <div className="rb-total">נשאר כמזומן: <b>{withIls(swap.left)}</b> <Info text="עד שעוד מניה או קרן בתחום שחסר תעבור ל״לקנות״. אז הכסף יתחלק לבד בדף הזה." /></div>
                  )}
                </div>
              </div>
              {sells.some((h) => statuses[h.symbol]?.dup) && <p className="label">כפילות: קרן שרובה מניות שכבר יש לך ב-VUAA וב-VWRA לא מוסיפה פיזור.</p>}
              <p className="label">קודם מוכרים (כשהמסחר פתוח), ואחרי שהכסף נכנס קונים. הקנייה של המזומן שכבר בחשבון מופיעה למעלה ב״כסף לא מושקע״ וכבר נלקחה בחשבון כאן, כך שאין ספירה כפולה.</p>
            </div>
          )}
          <h3>מה עושים עם כל החזקה</h3>
          <div className="table-scroll">
            <table className="compact actions">
              <tbody>
                {heldRows.map((h) => {
                  const st = statuses[h.symbol];
                  return (
                    <tr key={h.symbol}>
                      <td><span className="sym"><Logo id={h.symbol} label={h.name} size={18} /><b>{h.symbol}</b></span></td>
                      <td><StatusTag st={st} /></td>
                      <td><b>{st?.dup ? "למכור: כפילות" : ACTION[st?.key] ?? "להחזיק"}</b></td>
                      <td className="label wrap">{whyShort(h.symbol)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {steps.length > 0 && <ul>{steps.map((s) => <li key={s.text}><span>{s.icon}</span> {s.text}</li>)}</ul>}
        </div>
      )}

      {/* 5. The picture now: the market and what the deep research found */}
      <div className="card" id="picture" style={{ marginTop: 12 }}>
        <h2>🧭 התמונה כרגע</h2>
        {researchDay ? (
          <p className="label">
            מחקר מעמיק מ-{researchDay.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}: {studied.length} מניות, קרנות ומתכות, {studied.reduce((t, r) => t + r.sourceCount, 0)} מקורות.
          </p>
        ) : (
          <p className="label">עוד אין מחקר מעמיק. עד שיהיה, הסטטוסים לפי הנתונים הטכניים והאנליסטים בלבד (מסומנים ב-*).</p>
        )}
        <div className="st-counts">
          <span className="st st-buy">🟢 לקנות: {count("buy")}</span>
          <span className="st st-wait">🟡 עדיף לחכות: {count("wait")}</span>
          <span className="st st-sell">🔴 למכור: {count("sell")}</span>
          <span className="st st-dup">⛔ כפילות: {count("dup") + sells.filter((h) => statuses[h.symbol]?.dup).length}</span>
        </div>
        {latestPlan && (
          <>
            <div className="picture-text">{latestPlan.summary}</div>
            <h3>סיכונים</h3>
            <ul>{JSON.parse(latestPlan.risks).map((r) => <li key={r}>{r}</li>)}</ul>
            <details>
              <summary style={{ cursor: "pointer" }}>המחקר המלא</summary>
              <div className="picture-text" style={{ marginTop: 8 }}>{latestPlan.research}</div>
            </details>
          </>
        )}
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer" }}>איך נקבע הסטטוס</summary>
          <ul className="method">
            <li>היעד לכל מניה, קרן ומתכת: 8 מקורות ומעלה. ריכוזי אנליסטים (MarketBeat, TipRanks, Zacks, StockAnalysis ועוד), שינויי המלצות ויעדים, הדוח האחרון, דירוגים טכניים (TradingView, Investing.com, Barchart), תמחור (Morningstar) וסנטימנט רק מאנשים ומדדים מוכרים.</li>
            {studied.some((r) => r.sourceCount < 8) && (
              <li>במחקר הזה פחות מ-8 מקורות: {studied.filter((r) => r.sourceCount < 8).sort((a, b) => a.sourceCount - b.sourceCount).map((r) => `${r.symbol} (${r.sourceCount})`).join(", ")}. קרן כפולה מקבלת מחקר מקוצר, כי הסטטוס שלה נקבע לפי החפיפה ולא לפי הציון.</li>
            )}
            <li>כל חלק מקבל ציון בין 2- ל-2+, והציון המשוקלל הוא: {WEIGHTS.map(([, name, w]) => `${name} ${w}%`).join(" · ")}.</li>
            <li>מ-0.6 ומעלה ״לקנות״, מ-0.4- ומטה ״למכור״, באמצע ״עדיף לחכות״. כשהאנליסטים שליליים, אף פעם לא ״לקנות״. מניה שיותר מ-15% מתחת לממוצע 200 הימים, עם הורדות המלצה, מקבלת ״למכור״.</li>
            <li>כל החזקה וכל ״לקנות״ או ״למכור״ נבדקים שוב בבדיקה עצמאית שנייה. כשיש מחלוקת, בדיקה שלישית מכריעה לפי העובדות.</li>
            <li>כל יום האתר מוסיף תזמון (⏱): ״לקנות״ הופך ל״עדיף לחכות״ בשבוע שלפני דוח רבעוני, כשהמניה ״מחוממת״ (RSI 70+), אחרי ירידה של 10% מאז המחקר, או כשהמחקר בן יותר מחודש.</li>
            <li>⛔ כפילות: קרן שיותר מחצי ממנה הן מניות מה-S&P 500, שכבר יש בליבה (VUAA ו-VWRA). היא לא נקנית, ואם מחזיקים בה מוצע למכור אותה. מניה שכבר {HEAVY}% מהחשבון בפועל (כולל מה שיש ממנה בתוך הקרנות) לא מקבלת כסף חדש.</li>
          </ul>
        </details>
      </div>

      {/* 6. Every stock and fund, ranked; each row opens its details */}
      <div className="card" id="rank" style={{ marginTop: 16 }}>
        <h2>דירוג כל המניות והקרנות <Info text="סטטוס = המחקר המעמיק עם התזמון של היום (לחיצה על שורה: הפרטים, גרף והמקורות). ציון 0-100: תשואת 3, 6 ו-12 חודשים פחות חצי מהתנודתיות. מודגש = נקנה עכשיו. לחיצה על סימול פותחת אותו באינטראקטיב. לא ייעוץ השקעות." /></h2>
        <Screener
          themes={BUCKETS.map((b) => [b.key, b.name])}
          columns={[["#", "rank"], ["סימול", null], ["סטטוס", null], ["טכני", "tech"], ["שם", null], ["תחום", null], ["ציון", "score"], ["שנה", "m12"], ["שארפ", "sharpe"], ["סיכון", "vol"], ["דיבידנד", "div"], ["מחיר", "price"]]}
          rows={ranked.map((q, i) => ({
            symbol: q.symbol,
            name: q.name,
            status: statuses[q.symbol]?.key ?? null,
            held: heldSet.has(q.symbol),
            bucket: q.bucket,
            chosen: buys.some((p) => p.symbol === q.symbol),
            sort: { rank: -i, tech: techs[q.symbol]?.score, score: q.rankScore, m12: q.m12, sharpe: q.sharpe, vol: q.vol, div: q.divYield ?? 0, price: q.priceIls },
            cells: <>
              <td className="label">{i + 1}</td>
              <td className="sym-col"><span className="sym"><span className="exp-ico" aria-hidden="true">▾</span><Logo id={q.symbol} label={q.name} size={18} /><IbLink conid={q.ibkr?.conid} ib={q.ibkr}><b>{q.symbol}</b></IbLink>{heldSet.has(q.symbol) && <span className="xtag held-tag">בתיק</span>}</span></td>
              <td><StatusTag st={statuses[q.symbol]} /></td>
              <td><TechTag t={techs[q.symbol]} short /></td>
              <td className="line-name" title={q.name}>{q.name}</td>
              <td><span className="tag" style={{ background: BUCKET_COLORS[q.bucket], color: ink(q.bucket), marginInlineStart: 0 }}>{bucketName[q.bucket]}</span></td>
              <td><b className="score">{Math.round(q.rankScore)}</b></td>
              <td><Ret x={q.m12} /></td>
              <td>{sharpe(q.sharpe)}</td>
              <td><Risk vol={q.vol} /></td>
              <td className="label">{q.divYield > 0 ? `${(q.divYield * 100).toFixed(1)}%` : "—"}</td>
              <td>{q.priceIls ? <b className="usd-price" dir="ltr">{unitPrice(q.priceIls)}</b> : "—"}</td>
            </>,
            details: detailsFor(q.symbol, folio.rows.find((h) => h.symbol === q.symbol)),
          }))}
        />
      </div>
    </>
  );
}

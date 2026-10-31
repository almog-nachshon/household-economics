import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { ils } from "@/lib/goal";
import { BUCKETS, loadMarket, completePicks, sizePicks, extraPicks, nextSteps, topUp, isMetal, bucketPct, DEFAULT_METALS_PCT, ABOUT } from "@/lib/portfolio";
import { advisorEnabled } from "@/lib/advisor";
import AiButton from "@/components/AiButton";
import SyncButton from "@/components/SyncButton";
import Info from "@/components/Info";
import HoldingsMap from "@/components/HoldingsMap";
import Logo from "@/components/Logo";
import Sources from "@/components/Sources";
import { LiveQuotes, LiveChange, LiveWeek, LivePrice, MarketStatus, IntradayChart } from "@/components/Live";
import { portfolio } from "@/lib/holdings";
import { generatePlan, depositMonth, depositDate, holdings } from "@/lib/invest-run";
import { ibkrEnabled, syncIbkr, ibkrQuoteUrl, ibkrDetailsUrl } from "@/lib/ibkr";
import { STOP, TARGET } from "@/lib/alerts";
import Alerts from "@/components/Alerts";
import { signalsFor, SIGNAL, finvizUrl, onFinviz } from "@/lib/signals";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
// A return in green when up and red when down.
const Ret = ({ x }) => <span className={x > 0 ? "pos" : x < 0 ? "neg" : ""}>{pct(x)}</span>;
const date = (d) => d.toLocaleDateString("he-IL");
const bucketName = Object.fromEntries(BUCKETS.map((b) => [b.key, b.name]));
// One color per bucket, used by the pie and the type tags.
// Checked with the dataviz palette validator (lightness, chroma, color-blind and normal-vision separation).
const BUCKET_COLORS = { index: "#0fa3a3", sector: "#6d5bd0", defense: "#b5651d", risk: "#d6457a", photonics: "#8fb0ff", metals: "#c9a227" };
// Text on a bucket color: dark on the light ones.
const ink = (key) => (key === "photonics" || key === "metals" ? "#1f2a30" : "#fff");
const splitText = (metalsPct) => BUCKETS.filter((b) => b.pct).map((b) => `${b.name} ${Math.round(bucketPct(b, metalsPct))}%`).join(", ");
const CASH_COLOR = "#9aa7ad";
// Risk level from the yearly volatility.
const RISK = [[0.15, "נמוך", "risk-low"], [0.25, "בינוני", "risk-mid"], [0.4, "גבוה", "risk-high"], [Infinity, "גבוה מאוד", "risk-vhigh"]];
const Risk = ({ vol }) => {
  if (vol == null) return null;
  const [, name, cls] = RISK.find(([max]) => vol < max);
  return <span className={`risk ${cls}`}>סיכון {name}</span>;
};
const typeOf = (p) => (isMetal(p.symbol) ? "מתכת" : /ETF|קרן|UCITS|SPDR|iShares|Vanguard|Invesco|VanEck/.test(p.name) ? "קרן סל" : "מניה");
const Div = ({ q }) => (q.divYield > 0 ? <span className="tag tag-div">דיבידנד ~{(q.divYield * 100).toFixed(1)}%</span> : null);
const sharpe = (x) => (x == null ? "—" : x.toFixed(2));
// A name that opens the exact instrument at IBKR (the conid verified by lib/ibkr.js), with its exchange and ISIN on hover.
const IbLink = ({ conid, ib, children }) =>
  conid ? <a href={ibkrQuoteUrl(conid)} target="_blank" rel="noreferrer" title={ib ? `באינטראקטיב: ${ib.ibSymbol} · ${ib.exchange} · ${ib.currency}${ib.isin ? ` · ISIN ${ib.isin}` : ""}` : "פתיחה באינטראקטיב"}>{children}</a> : children;
// The entry / exit signal (lib/signals.js) as a colored tag; the reasons on hover.
const SignalTag = ({ s }) => (s ? <span className={`signal signal-${s.level}`} title={s.reasons.join(" · ")}>{SIGNAL[s.level][0]} {SIGNAL[s.level][1]}</span> : null);
const signed = (x) => (x == null ? "—" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`);
const CHANGES = { add: "להוסיף", hold: "להחזיק, בלי כסף חדש", reduce: "לצמצם (למכור חלק)", sell: "למכור" };

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

// Without a Claude reason, the numbers speak for themselves.
const numbersReason = (q) =>
  `נבחרה לפי הביצועים: ${pct(q.m12)} בשנה, ${pct(q.m6)} בחצי שנה, ${pct(q.m3)} ב-3 חודשים, בתנודתיות של ${pct(q.vol)}.`;

const units = (p) =>
  p.units == null ? "—" : `${p.units} ${isMetal(p.symbol) ? (p.units === 1 ? "אונקיה" : "אונקיות") : p.units === 1 ? "יחידה" : "יחידות"}`;

export default async function Invest({ searchParams }) {
  const settings = await getSettings();
  const month = depositMonth();
  const day = depositDate(month);
  const [plan, done, held, market, folio] = await Promise.all([
    db.aiPlan.findUnique({ where: { month } }),
    db.investPick.findMany({ where: { month } }),
    holdings(),
    loadMarket(),
    portfolio(),
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
  // With IBKR synced, the default is the dollars waiting in the account; otherwise the standing order.
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
  const metalsPct = plan ? plan.metalsPct : DEFAULT_METALS_PCT;
  // Every candidate with data, best score first, the score scaled 0-100.
  const valid = Object.values(market.bySymbol).filter((q) => !q.error && q.buyable);
  const [lo, hi] = [Math.min(...valid.map((q) => q.score)), Math.max(...valid.map((q) => q.score))];
  const ranked = valid.map((q) => ({ ...q, rankScore: hi > lo ? ((q.score - lo) / (hi - lo)) * 100 : 50 })).sort((x, y) => y.score - x.score);
  const signals = await signalsFor(market.bySymbol, [...Object.keys(market.bySymbol), ...folio.rows.map((h) => h.symbol)]);
  // With IBKR holdings the cash tops up the buckets furthest below target, adding to what is already held there
  // (lib/portfolio.js topUp); otherwise the fixed split of the plan's picks.
  const heldRows = folio.rows.filter((h) => h.bucket);
  const top = folio.broker && heldRows.length
    ? topUp({ held: heldRows, bySymbol: market.bySymbol, signals, amount, metalsPct, chosen })
    : { picks: completePicks(chosen, market.bySymbol, amount, metalsPct), waiting: [], shares: null };
  const { shares, waiting } = top;
  const { picks, skipped, leftover } = sizePicks(top.picks, amount);
  // What is left goes to more units of holdings with a buy signal in the buckets that need it (never new names when
  // something is held), so no cash sits idle.
  const pool = folio.broker && heldRows.length ? ranked.filter((q) => heldRows.some((h) => h.symbol === q.symbol) && (shares?.[q.bucket] ?? 0) > 0) : ranked;
  const indexes = new Set([...picks, ...folio.rows].map((x) => market.bySymbol[x.symbol]?.index).filter(Boolean));
  const { extras, left: extraLeft } = leftover > 1
    ? extraPicks(pool, signals, leftover, new Set(picks.map((p) => p.symbol)), folio.broker && heldRows.length ? new Set() : indexes)
    : { extras: [], left: leftover };
  const steps = folio.broker
    ? nextSteps({ rows: folio.rows, cash: folio.cash, signals, metalsPct, money, waiting })
    : [];
  // Everything to buy now (the split and the next in line), with its cost.
  const buys = [...picks, ...extras].map((p) => ({ ...p, cost: p.cost ?? p.amount }));
  // The detailed cards: the split's picks, then the next in line in priority order.
  const cards = [...picks, ...extras.map((p, i) => ({ ...p, amount: p.cost, pct: (p.cost / amount) * 100, next: i + 1, topUp: heldRows.some((h) => h.symbol === p.symbol) }))];
  // The donut: each bucket's holdings and the cash, as % of the whole account.
  const total = folio.value || 1;
  const groups = [
    ...BUCKETS.map((b) => {
      const rows = folio.rows.filter((h) => h.bucket === b.key);
      const value = rows.reduce((t, h) => t + h.value, 0);
      return {
        key: b.key, name: b.name, color: BUCKET_COLORS[b.key], ink: ink(b.key), value, pct: (value / total) * 100, target: bucketPct(b, metalsPct), valueText: withIls(value),
        rows: rows.map((h) => ({ symbol: h.symbol, name: h.name, type: typeOf(h), change: market.bySymbol[h.symbol]?.d1 ?? null, profitPct: h.pct, about: [ABOUT[h.symbol], signals[h.symbol] && SIGNAL[signals[h.symbol].level].join(" ") + ": " + signals[h.symbol].reasons[0]].filter(Boolean).join(" · "), value: h.value, pct: (h.value / total) * 100, valueText: withIls(h.value) })),
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
  const changes = plan
    ? JSON.parse(plan.changes)
    : held.map((h) => ({ symbol: h.symbol, action: picks.some((p) => p.symbol === h.symbol) ? "add" : "hold", reason: null }));

  return (
    <>
      <div className="page-head">
        <h1>{folio.broker ? "השקעות" : `השקעות: הפקדה ב-${date(day)}`}</h1>
        <MarketStatus />
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
              label="בדיקה מהירה של Claude"
              updated={plan?.createdAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" })}
              info={plan
                ? `${plan.final ? "בדיקה סופית" : "בדיקה יומית"} של Claude (${plan.model}). ${plan.final ? "" : `הבדיקה הסופית ב-${date(day)}, לפני ההפקדה. `}הכפתור מריץ בדיקה מהירה; מחקר מלא נעשה ב-Claude Code.`
                : "Claude עוד לא בדק את ההפקדה הזו. עד אז החלוקה לפי הביצועים בלבד."}
            />
          </form>
        )}
        <Alerts />
      </div>
      {folio.error && <p className="warn">העדכון האחרון מאינטראקטיב נכשל: {folio.error}</p>}
      {searchParams?.error && <p className="warn">הפעולה נכשלה: {searchParams.error}</p>}
      {market.rateError && <p className="warn">לא הצלחתי למשוך שערי מטבע ({market.rateError}).</p>}

      <div className="card" id="folio" style={{ marginTop: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>
            {folio.broker ? "המצב עכשיו: התיק שלי" : "התיק שלי"}{" "}
            <Info text={folio.broker
              ? `מאינטראקטיב, במחירי הסגירה של ${folio.asOf.toLocaleDateString("he-IL", { timeZone: "UTC" })} (קניות מהיום במחיר הקנייה). התראה ב-${Math.round(STOP * 100)}% או ב-+${Math.round(TARGET * 100)}% ממחיר הקנייה. הרווח בדולרים, מומר לשקלים בשער היום.`
              : "לפי כל ההפקדות שסימנת ״קניתי״, במחירי היום"} />
          </h2>
        </div>
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
            {folio.broker && (
              <>
                <LiveQuotes symbols={folio.rows.map((h) => h.symbol)}>
                  <HoldingsMap groups={groups} />
                </LiveQuotes>
                <div className="bucket-chips">
                  {groups.filter((g) => g.value > 0).map((g) => (
                    <span key={g.key} className="bucket-chip">
                      <span className="swatch" style={{ background: g.color }} /> {g.name} <b>{g.pct.toFixed(1)}%</b>
                      {g.target != null && <span className={`label ${Math.abs(g.pct - g.target) > 5 ? "neg" : ""}`}> (יעד {Math.round(g.target)}%)</span>}
                      <span className="label"> · {g.valueText}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table className="compact">
                <thead><tr><th>סימול</th><th>שם</th><th>יחידות</th><th>הושקע</th><th>שווי</th><th>רווח</th><th>%</th><th>כניסה / יציאה</th></tr></thead>
                <tbody>
                  {folio.rows.map((h) => (
                    <tr key={h.symbol}>
                      <td><span className="sym"><Logo id={h.symbol} label={h.name} size={18} /><IbLink conid={h.conid ?? market.bySymbol[h.symbol]?.ibkr?.conid}><b>{h.symbol}</b></IbLink></span></td>
                      <td className="line-name" title={h.name}>{h.name} <span className="xtag hpie-type">{typeOf(h)}</span> <Info text={ABOUT[h.symbol]} /></td>
                      <td>{h.units ? Math.round(h.units * 1000) / 1000 : "—"}</td>
                      <td>{both(h.cost)}</td>
                      <td>{both(h.value)}</td>
                      <td className={h.profit >= 0 ? "pos" : "neg"}>{both(h.profit)}</td>
                      <td><Ret x={h.pct} /></td>
                      <td><SignalTag s={signals[h.symbol]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {steps.length > 0 && (
        <div className="card next-steps" style={{ marginTop: 12 }}>
          <h2>📌 המלצות להמשך <Info text="מחושב מחדש בכל רענון: לפי מה שבאמת יש בתיק מול החלוקה הרצויה, סימני הכניסה / יציאה ותאריכי הדוחות. לא ייעוץ השקעות." /></h2>
          <ul>{steps.map((s) => <li key={s.text}><span>{s.icon}</span> {s.text}</li>)}</ul>
        </div>
      )}

      {folio.broker ? (
        <div className="cash-line">
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
              {picks.length} החזקות · {plan ? `לפי מחקר של Claude` : "לפי ציון ביצועים"}{" "}
              <Info text={shares ? `החלוקה משלימה את מה שכבר בתיק: כסף לחלקים שרחוקים מהיעד (${splitText(metalsPct)}). בכל חלק מוסיפים קודם למניה שכבר מחזיקים בו, כדי לא לפצל להרבה מניות. רק מניות עם סימן 🟢 / ⚪.` : `חלוקה קבועה: ${splitText(metalsPct)}, ומתכות לפי המחקר.`} />
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
        {folio.broker && picks.length === 0 && extras.length === 0 && <p className="label">אין כרגע קנייה מומלצת בסכום הזה: אין מניה עם סימן 🟢 / ⚪ שיחידה שלה נכנסת בחלק שחסר. הכסף יחכה להפקדה הבאה או לשינוי בסימנים.</p>}
        <div className="table-scroll">
          <table className="alloc-table">
            <thead>
              <tr><th>החזקה</th><th className="alloc-bar-col">חלק מההפקדה</th><th>סכום</th><th>מחיר עכשיו</th><th>היום</th><th>השבוע</th><th>שנה</th><th>סוג</th></tr>
            </thead>
            <tbody>
              {picks.map((p) => (
                <tr key={p.symbol}>
                  <td><span className="sym"><Logo id={p.symbol} label={p.name} size={20} /><IbLink conid={p.ibkr?.conid} ib={p.ibkr}><b>{p.symbol}</b></IbLink>{p.topUp && <span className="topup-tag" title="תוספת להחזקה קיימת">➕</span>}</span></td>
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
        {skipped.map((p) => (
          <p key={p.symbol} className="label">
            {p.symbol} לא נקנה החודש: יחידה אחת עולה {unitPrice(p.priceIls)}, יותר מהחלק שלו בהפקדה ({money(p.target)}). הסכום נשאר כמזומן.
          </p>
        ))}
        {extras.length > 0 && (
          <div className="extra-box">
            <h2 style={{ margin: 0 }}>
              💡 עוד {money(leftover)} פנויים: הבאים בתור{" "}
              <Info text="כדי שלא יישאר מזומן בלי השקעה: הכסף שנשאר אחרי החלוקה מוסיף יחידות להחזקות הקיימות עם סימן קנייה (🟢 או ⚪), בחלקים של התיק שעוד מתחת ליעד. בלי מניות חדשות." />
            </h2>
            <table className="compact">
              <thead><tr><th>החזקה</th><th>תחום</th><th>סימן</th><th>לקנות</th><th>סכום</th><th>למה</th></tr></thead>
              <tbody>
                {extras.map((p) => (
                  <tr key={p.symbol}>
                    <td><span className="sym"><Logo id={p.symbol} label={p.name} size={18} /><IbLink conid={p.ibkr?.conid} ib={p.ibkr}><b>{p.symbol}</b></IbLink></span></td>
                    <td><span className="tag" style={{ background: BUCKET_COLORS[p.bucket], color: ink(p.bucket), marginInlineStart: 0 }}>{bucketName[p.bucket]}</span></td>
                    <td><SignalTag s={p.signal} /></td>
                    <td><b>{units(p)}</b> <span className="label">× {unitPrice(p.priceIls)}</span></td>
                    <td><b>{both(p.cost)}</b></td>
                    <td className="label">{p.signal.reasons[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {waiting.length > 0 && (
          <p className="label">
            ⏳ מחכים לסימן: {waiting.map((w) => `${w.symbol} (${signals[w.symbol]?.level === "exit" ? "🔴" : "🟡"})`).join(", ")}{" "}
            <Info text={waiting.map((w) => `${w.symbol}: ${signals[w.symbol]?.reasons?.[0] ?? ""}`).join(" · ")} />
          </p>
        )}
        {extraLeft > 1 && (
          <p className="label">
            נשאר כמזומן בחשבון: {money(extraLeft)}{" "}
            <Info text={extras.length ? "פחות ממחיר יחידה אחת של המועמדים עם סימן קנייה. יישאר להפקדה הבאה." : "אין כרגע מועמד נוסף עם סימן קנייה (🟢 / ⚪) שנכנס בסכום הזה. יישאר להפקדה הבאה."} />
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

      <h2 style={{ marginTop: 20 }}>
        {cards.length} הבחירות: ניתוח מפורט{" "}
        {extras.length > 0 && <Info text="קודם ההמלצות של התוכנית, ואחריהן ״הבאים בתור״ לפי סדר העדיפות בדירוג (הכסף שנשאר אחרי החלוקה)." />}
      </h2>
      <div className="pick-grid">
        {cards.map((p) => (
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
              <Risk vol={p.vol} />
              <span className="xtag">{typeOf(p)}</span>
              <span className="xtag xtag-sector" style={{ color: BUCKET_COLORS[p.bucket], borderColor: BUCKET_COLORS[p.bucket] }}>{p.sector || bucketName[p.bucket]}</span>
              {p.divYield > 0 && <span className="xtag xtag-div">💰 דיבידנד ~{(p.divYield * 100).toFixed(1)}%</span>}
              {p.conviction ? <span className="xtag xtag-stars" title="רמת ביטחון במחקר">{"★".repeat(Math.round(p.conviction))}{"☆".repeat(5 - Math.round(p.conviction))}</span> : null}
            </div>
            <div className="xcard-about">{p.about || ABOUT[p.symbol]}</div>
            <div className="xcard-why">
              <span>💡 למה לקנות</span>
              <p>{p.reason || numbersReason(p)}</p>
            </div>
            {p.outlook && (
              <div className="xcard-risk">
                <span>⚠️ מה לשים לב</span>
                <p>{p.outlook}</p>
              </div>
            )}
            {signals[p.symbol] && (() => {
              const g = signals[p.symbol];
              return (
                <div className={`xcard-signal signal-box-${g.level}`}>
                  <div className="xcard-signal-head">
                    <span>⏱️ כניסה / יציאה</span>
                    <SignalTag s={g} />
                  </div>
                  <ul>{g.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  <div className="xcard-signal-metrics">
                    <span>RSI<Info text="מדד מומנטום 0-100: מעל 70 = עלתה מהר מדי (״מחוממת״), מתחת ל-30 = ירדה מהר מדי" /> <b>{g.rsi != null ? Math.round(g.rsi) : "—"}</b></span>
                    <span>מול ממוצע 50 יום <b>{signed(g.sma50)}</b></span>
                    <span>מול ממוצע 200 יום<Info text="מעל הממוצע = מגמת עלייה ארוכה; ירידה של 5% מתחתיו = סימן יציאה" /> <b>{signed(g.sma200)}</b></span>
                    <span>מהשיא השנתי <b>{signed(g.fromHigh)}</b></span>
                    {g.analysts && <span>אנליסטים <b>{g.analysts.buy} קנייה · {g.analysts.hold} החזקה · {g.analysts.sell} מכירה</b></span>}
                    {g.earnings && <span>דוח רבעוני הבא <b>{g.earnings.toLocaleDateString("he-IL", { timeZone: "UTC" })}</b></span>}
                  </div>
                  {onFinviz(p.symbol) && <a href={finvizUrl(p.symbol)} target="_blank" rel="noreferrer" className="label">לגרף ולנתונים המלאים ב-Finviz ←</a>}
                </div>
              );
            })()}
            <IntradayChart symbol={p.symbol} />
            <div className="xcard-metrics">
              <div><span>תשואה שנתית<Info text="השינוי במחיר (כולל דיבידנדים) ב-12 החודשים האחרונים" /></span><Ret x={p.m12} /></div>
              <div><span>ממוצע חודשי<Info text="התשואה הממוצעת לחודש בשנה האחרונה" /></span><Ret x={p.mAvg} /></div>
              <div><span>שארפ<Info text="תשואה ביחס לסיכון, מעל ריבית חסרת סיכון של 4%. מעל 1 = טוב, מעל 2 = מצוין" /></span><b className="pos">{sharpe(p.sharpe)}</b></div>
              <div><span>תנודתיות<Info text="כמה המחיר קופץ במהלך שנה. מעל 40% = תנודתי מאוד" /></span><b>{pct(p.vol)}</b></div>
              <div><span>ירידה מקס׳<Info text="הנפילה הגדולה ביותר מהשיא בשנה האחרונה" /></span><Ret x={p.maxDrawdown} /></div>
              <div><span>מגמה 30 יום<Info text="השינוי במחיר בחודש האחרון" /></span><Ret x={p.m1} /></div>
            </div>
            {(p.eps || p.analysts) && (
              <div className="xcard-box">
                {p.eps && <div className="xcard-eps"><span>EPS צפוי<Info text="רווח צפוי למניה ומכפיל הרווח, לפי תחזיות האנליסטים" /></span><b>{p.eps}</b></div>}
                {p.analysts && <div className="xcard-analysts">{p.analysts}</div>}
              </div>
            )}
            <details className="xcard-details">
              <summary>עוד על החברה ←</summary>
              <p>{p.about || ABOUT[p.symbol]}</p>
            </details>
          </div>
        ))}
      </div>
      </LiveQuotes>

      <div className="card" style={{ marginTop: 12 }}>
        <h2>המלצות ושינויים מהחודש הקודם <Info text="מכירה ברווח = 25% מס רווחי הון בישראל, ולכן ההמלצה למכור רק כשיש סיבה ממשית." /></h2>
        {changes.length === 0 ? (
          <p className="label">עוד אין החזקות. אחרי שתסמן ״קניתי״, כאן יופיעו המלצות להוסיף, להחזיק, לצמצם או למכור.</p>
        ) : (
          <ul>
            {changes.map((c) => (
              <li key={c.symbol} className={c.action === "sell" || c.action === "reduce" ? "warn" : ""}>
                <b>{c.symbol}</b>: {CHANGES[c.action]}{c.reason ? `. ${c.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>

      {plan && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2>התמונה כרגע</h2>
          <p>{plan.summary}</p>
          <h2>סיכונים</h2>
          <ul>{JSON.parse(plan.risks).map((r) => <li key={r}>{r}</li>)}</ul>
          <details>
            <summary style={{ cursor: "pointer" }}>המחקר המלא של Claude</summary>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{plan.research}</div>
          </details>
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <h2>דירוג כל המניות והקרנות <Info text="ציון 0-100: תשואת 3, 6 ו-12 חודשים פחות חצי מהתנודתיות. מודגש = נבחר. לחיצה על סימול פותחת אותו באינטראקטיב, לחיצה על שם מציגה פרטים. המחירים מ-Yahoo Finance (מתעדכנים כל 12 שעות) ומקורות חיים נוספים. זו המלצה לפי נתוני עבר וחדשות, לא ייעוץ השקעות." /></h2>
        <div className="table-scroll">
          <table className="compact wide rank">
            <thead><tr><th>#</th><th>סימול</th><th>שם</th><th>תחום</th><th>ציון</th><th>שנה</th><th>שארפ</th><th>סיכון</th><th>דיבידנד</th><th>מחיר</th></tr></thead>
            <tbody>
              {ranked.map((q, i) => (
                <tr key={q.symbol} className={picks.some((p) => p.symbol === q.symbol) ? "chosen" : ""}>
                  <td className="label">{i + 1}</td>
                  <td><span className="sym"><Logo id={q.symbol} label={q.name} size={18} /><IbLink conid={q.ibkr?.conid} ib={q.ibkr}><b>{q.symbol}</b></IbLink></span></td>
                  <td className="line-name">
                    <details>
                      <summary title={q.name}>{q.name}</summary>
                      <div className="pick-more">{ABOUT[q.symbol]}</div>
                    </details>
                  </td>
                  <td><span className="tag" style={{ background: BUCKET_COLORS[q.bucket], color: ink(q.bucket), marginInlineStart: 0 }}>{bucketName[q.bucket]}</span></td>
                  <td><b className="score">{Math.round(q.rankScore)}</b></td>
                  <td><Ret x={q.m12} /></td>
                  <td>{sharpe(q.sharpe)}</td>
                  <td><Risk vol={q.vol} /></td>
                  <td className="label">{q.divYield > 0 ? `${(q.divYield * 100).toFixed(1)}%` : "—"}</td>
                  <td>{q.priceIls ? <b className="usd-price">{unitPrice(q.priceIls)}</b> : "—"}{usd && q.priceIls ? <span className="label ils-small"> · {ils(q.priceIls)}</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </>
  );
}

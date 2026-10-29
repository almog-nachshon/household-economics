import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { ils } from "@/lib/goal";
import { BUCKETS, loadMarket, completePicks, sizePicks, isMetal, bucketPct, DEFAULT_METALS_PCT, ABOUT } from "@/lib/portfolio";
import { advisorEnabled } from "@/lib/advisor";
import AiButton from "@/components/AiButton";
import Logo from "@/components/Logo";
import { LiveQuotes, LiveChange, LiveWeek, LivePrice, MarketStatus, IntradayChart } from "@/components/Live";
import { portfolio } from "@/lib/holdings";
import { generatePlan, depositMonth, depositDate, holdings } from "@/lib/invest-run";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
// A return in green when up and red when down.
const Ret = ({ x }) => <span className={x > 0 ? "pos" : x < 0 ? "neg" : ""}>{pct(x)}</span>;
const date = (d) => d.toLocaleDateString("he-IL");
const bucketName = Object.fromEntries(BUCKETS.map((b) => [b.key, b.name]));
// One color per bucket, used by the pie and the type tags.
const BUCKET_COLORS = { index: "#0fa3a3", sector: "#3b82c4", defense: "#7a5c3e", risk: "#e0607e", metals: "#d4a017" };
// Risk level from the yearly volatility.
const RISK = [[0.15, "נמוך", "risk-low"], [0.25, "בינוני", "risk-mid"], [0.4, "גבוה", "risk-high"], [Infinity, "גבוה מאוד", "risk-vhigh"]];
const Risk = ({ vol }) => {
  if (vol == null) return null;
  const [, name, cls] = RISK.find(([max]) => vol < max);
  return <span className={`risk ${cls}`}>סיכון {name}</span>;
};
const typeOf = (p) => (isMetal(p.symbol) ? "מתכת" : /ETF|קרן|UCITS|SPDR|iShares|Vanguard|Invesco|VanEck/.test(p.name) ? "קרן סל" : "מניה");
const Div = ({ q }) => (q.divYield > 0 ? <span className="tag tag-div">דיבידנד ~{(q.divYield * 100).toFixed(1)}%</span> : null);
// A small ⓘ with an explanation on hover / tap.
const Info = ({ text }) => <span className="info" title={text} tabIndex={0}>i</span>;
const sharpe = (x) => (x == null ? "—" : x.toFixed(2));
const CHANGES = { add: "להוסיף", hold: "להחזיק, בלי כסף חדש", reduce: "לצמצם (למכור חלק)", sell: "למכור" };

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
  const usd = searchParams?.cur === "USD" && market.usdIls > 0;
  const rate = usd ? market.usdIls : 1;
  const typed = Number(searchParams?.amount) > 0 ? Number(searchParams.amount) : null;
  const amount = typed ? typed * rate : settings.monthlyInvest;
  const shown = Math.round(amount / rate);
  const money = (x) => (usd ? `$${Math.round(x / rate).toLocaleString("en-US")}` : ils(x));
  const unitPrice = (x) => (usd ? `$${(x / rate).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : ils(x));
  const chosen = plan ? JSON.parse(plan.picks) : [];
  const metalsPct = plan ? plan.metalsPct : DEFAULT_METALS_PCT;
  const { picks, leftover } = sizePicks(completePicks(chosen, market.bySymbol, amount, metalsPct), amount);
  // Every candidate with data, best score first, the score scaled 0-100.
  const valid = Object.values(market.bySymbol).filter((q) => !q.error && q.buyable);
  const [lo, hi] = [Math.min(...valid.map((q) => q.score)), Math.max(...valid.map((q) => q.score))];
  const ranked = valid.map((q) => ({ ...q, rankScore: hi > lo ? ((q.score - lo) / (hi - lo)) * 100 : 50 })).sort((x, y) => y.score - x.score);
  const changes = plan
    ? JSON.parse(plan.changes)
    : held.map((h) => ({ symbol: h.symbol, action: picks.some((p) => p.symbol === h.symbol) ? "add" : "hold", reason: null }));

  return (
    <>
      <div className="page-head">
        <h1>השקעות: הפקדה ב-{date(day)}</h1>
        <MarketStatus />
        {advisorEnabled() && (
          <form action={runNow} style={{ maxWidth: "none" }}>
            <AiButton label="בדיקה מהירה של Claude" updated={plan?.createdAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })} />
          </form>
        )}
      </div>
      <p className="label">
        {plan
          ? `${plan.final ? "בדיקה סופית" : "בדיקה יומית"} של Claude מ-${plan.createdAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}. ${plan.final ? "" : `הבדיקה הסופית ב-${date(day)}, לפני ההפקדה.`}`
          : advisorEnabled()
            ? "Claude עוד לא בדק את ההפקדה הזו. עד אז החלוקה לפי הביצועים בלבד."
            : "חסר ANTHROPIC_API_KEY, אז החלוקה לפי הביצועים בלבד (בלי Claude)."}
      </p>
      {searchParams?.error && <p className="warn">הבדיקה נכשלה: {searchParams.error}</p>}
      {market.rateError && <p className="warn">לא הצלחתי למשוך שערי מטבע ({market.rateError}).</p>}

      <form method="get" style={{ display: "flex", gap: 8, alignItems: "center", maxWidth: "none", marginBottom: 12, flexWrap: "wrap" }}>
        <span>סכום להשקעה:</span>
        <input type="number" name="amount" min="1" step="1" defaultValue={shown} style={{ width: 140 }} />
        <input type="hidden" name="cur" value={usd ? "USD" : "ILS"} />
        <span className="cur-toggle">
          <a href={`/invest?amount=${Math.round(amount)}&cur=ILS`} className={usd ? "" : "on"}>₪ שקל</a>
          <a href={`/invest?amount=${Math.round(amount / (market.usdIls || 1))}&cur=USD`} className={usd ? "on" : ""}>$ דולר</a>
        </span>
        <button type="submit">חשב חלוקה</button>
        {market.usdIls && <span className="label">דולר = {market.usdIls.toFixed(3)} ₪</span>}
        {Math.round(amount) !== settings.monthlyInvest && <a href="/invest">חזרה להוראת הקבע ({ils(settings.monthlyInvest)})</a>}
      </form>

      <LiveQuotes symbols={picks.map((p) => p.symbol)}>
      <div className="card invest-hero">
        <div className="invest-hero-head">
          <div>
            <div className="label">הפקדה ב-{date(day)}</div>
            <div className="value big">{money(amount)}</div>
            <div className="label">{picks.length} החזקות · {plan ? `לפי מחקר של Claude` : "לפי ציון ביצועים"}</div>
          </div>
          <div className="bucket-bars">
            {BUCKETS.map((b) => {
              const share = bucketPct(b, metalsPct);
              return (
                <div key={b.key} className="bucket-bar">
                  <span>{b.name}</span>
                  <div className="meter thin"><div style={{ width: `${share}%`, background: BUCKET_COLORS[b.key] }} /></div>
                  <b>{Math.round(share * 10) / 10}%</b>
                </div>
              );
            })}
          </div>
        </div>
        <h2 style={{ marginTop: 16 }}>סקירת הקצאת התיק</h2>
        <div className="table-scroll">
          <table className="alloc-table">
            <thead>
              <tr><th>החזקה</th><th className="alloc-bar-col">חלק מההפקדה</th><th>סכום</th><th>מחיר עכשיו</th><th>היום</th><th>השבוע</th><th>שנה</th><th>סוג</th></tr>
            </thead>
            <tbody>
              {picks.map((p) => (
                <tr key={p.symbol}>
                  <td><span className="sym"><Logo id={p.symbol} label={p.name} size={20} /><b>{p.symbol}</b></span></td>
                  <td className="alloc-bar-col">
                    <div className="alloc-bar">
                      <div style={{ width: `${Math.min(100, p.pct * 4)}%`, background: BUCKET_COLORS[p.bucket] }} />
                      <span>{Math.round(p.pct * 10) / 10}%</span>
                    </div>
                  </td>
                  <td><b>{money(p.amount)}</b></td>
                  <td><LivePrice symbol={p.symbol} ils={p.priceIls && !usd ? ils(p.priceIls) : null} /></td>
                  <td><LiveChange symbol={p.symbol} fallback={p.d1} /></td>
                  <td><LiveWeek symbol={p.symbol} /></td>
                  <td><Ret x={p.m12} /></td>
                  <td><span className="tag" style={{ marginInlineStart: 0 }}>{typeOf(p)}</span><Div q={p} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {leftover > 1 && <p className="label">נשאר כמזומן בחשבון: {money(leftover)} (קונים רק יחידות שלמות, אז האחוזים בפועל קרובים ליעד אבל לא זהים). יישאר להפקדה הבאה.</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {done.length ? (
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

      <h2 style={{ marginTop: 20 }}>{picks.length} הבחירות: ניתוח מפורט</h2>
      <div className="pick-grid">
        {picks.map((p) => (
          <div key={p.symbol} className="xcard">
            <div className="xcard-top">
              <div>
                <div className="xcard-title"><Logo id={p.symbol} label={p.name} size={24} /><span className="xcard-sym">{p.symbol}</span><Risk vol={p.vol} /></div>
                <div className="xcard-name" dir="auto" title={p.name}>{p.name}</div>
                <div className="xcard-sub">{p.sector || bucketName[p.bucket]}</div>
              </div>
              <div className="xcard-money">
                <div className="xcard-pct"><Info text="החלק של ההחזקה מסכום ההפקדה" />{Math.round(p.pct * 10) / 10}%</div>
                <div className="xcard-amount">{money(p.amount)}</div>
                <div className="xcard-price">
                  <LiveChange symbol={p.symbol} fallback={p.d1} />
                  <b>{p.priceIls ? unitPrice(p.priceIls) : "—"}</b> / {isMetal(p.symbol) ? "אונקיה" : "יחידה"}
                </div>
              </div>
            </div>
            <div className="xcard-tags">
              <span className="xtag">{typeOf(p)}</span>
              {p.divYield > 0 && <span className="xtag xtag-div">💰 דיבידנד ~{(p.divYield * 100).toFixed(1)}%</span>}
              {p.conviction ? <span className="xtag" title="רמת ביטחון במחקר">{"★".repeat(Math.round(p.conviction))}{"☆".repeat(5 - Math.round(p.conviction))}</span> : null}
            </div>
            <div className="xcard-about">{p.about || ABOUT[p.symbol]}</div>
            <div className="xcard-buy">
              <span>לקנות</span>
              <b>{units(p)}</b>
              <span className="label">ב-{money(p.amount)}</span>
            </div>
            <div className="xcard-bar"><div style={{ width: `${Math.min(100, p.pct * 4)}%` }} /></div>
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
              <summary>פרטי החברה ←</summary>
              <p><b>מה זה: </b>{p.about || ABOUT[p.symbol]}</p>
              <p><b>למה עכשיו: </b>{p.reason || numbersReason(p)}</p>
              {p.outlook && <p><b>מה לשים לב: </b>{p.outlook}</p>}
              <p className="xcard-units">לקנות: {units(p)}</p>
            </details>
          </div>
        ))}
      </div>
      </LiveQuotes>

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0 }}>התיק שלי</h2>
          <span className="label">לפי כל ההפקדות שסימנת ״קניתי״, במחירי היום</span>
        </div>
        {folio.rows.length === 0 ? (
          <p className="label">עוד אין קניות. אחרי ״קניתי״ התיק, הרווח והתשואה יחושבו כאן ובדף הראשי.</p>
        ) : (
          <>
            <div className="hero-row" style={{ marginTop: 8 }}>
              <div><div className="label">הושקע</div><div className="value">{ils(folio.cost)}</div></div>
              <div><div className="label">שווי היום</div><div className="value">{ils(folio.value)}</div></div>
              <div><div className="label">רווח / הפסד</div><div className={`value ${folio.profit >= 0 ? "pos" : "neg"}`}>{ils(folio.profit)}</div></div>
              <div><div className="label">תשואה</div><div className={`value ${folio.pct >= 0 ? "pos" : "neg"}`}>{pct(folio.pct)}</div></div>
            </div>
            <div style={{ overflowX: "auto", marginTop: 8 }}>
              <table className="compact">
                <thead><tr><th>סימול</th><th>שם</th><th>יחידות</th><th>הושקע</th><th>שווי</th><th>רווח</th><th>%</th></tr></thead>
                <tbody>
                  {folio.rows.map((h) => (
                    <tr key={h.symbol}>
                      <td><span className="sym"><Logo id={h.symbol} label={h.name} size={18} /><b>{h.symbol}</b></span></td>
                      <td className="line-name" title={h.name}>{h.name}</td>
                      <td>{h.units ? h.units.toFixed(3) : "—"}</td>
                      <td>{ils(h.cost)}</td>
                      <td>{ils(h.value)}</td>
                      <td className={h.profit >= 0 ? "pos" : "neg"}>{ils(h.profit)}</td>
                      <td><Ret x={h.pct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h2>המלצות ושינויים מהחודש הקודם</h2>
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
        <p className="label">מכירה ברווח = 25% מס רווחי הון בישראל, ולכן ההמלצה למכור רק כשיש סיבה ממשית.</p>
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
        <h2>דירוג כל המניות והקרנות</h2>
        <div className="label">ציון 0-100: תשואת 3, 6 ו-12 חודשים פחות חצי מהתנודתיות · מודגש = נבחר · לחיצה על שם לפרטים</div>
        <div className="table-scroll">
          <table className="compact wide rank">
            <thead><tr><th>#</th><th>סימול</th><th>שם</th><th>תחום</th><th>ציון</th><th>שנה</th><th>שארפ</th><th>סיכון</th><th>דיבידנד</th><th>מחיר</th></tr></thead>
            <tbody>
              {ranked.map((q, i) => (
                <tr key={q.symbol} className={picks.some((p) => p.symbol === q.symbol) ? "chosen" : ""}>
                  <td className="label">{i + 1}</td>
                  <td><span className="sym"><Logo id={q.symbol} label={q.name} size={18} /><b>{q.symbol}</b></span></td>
                  <td className="line-name">
                    <details>
                      <summary title={q.name}>{q.name}</summary>
                      <div className="pick-more">{ABOUT[q.symbol]}</div>
                    </details>
                  </td>
                  <td><span className="tag" style={{ background: BUCKET_COLORS[q.bucket], color: "#fff", marginInlineStart: 0 }}>{bucketName[q.bucket]}</span></td>
                  <td><b className="score">{Math.round(q.rankScore)}</b></td>
                  <td><Ret x={q.m12} /></td>
                  <td>{sharpe(q.sharpe)}</td>
                  <td><Risk vol={q.vol} /></td>
                  <td className="label">{q.divYield > 0 ? `${(q.divYield * 100).toFixed(1)}%` : "—"}</td>
                  <td className="label">{q.priceIls ? unitPrice(q.priceIls) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="label" style={{ marginTop: 12 }}>
        הטבלה מ-Yahoo Finance (מתעדכנת כל 12 שעות); Claude מצליב מחירים וחדשות מול Reuters, Bloomberg, CNBC, Morningstar, Investing.com ודוחות החברות. זו המלצה של מודל לפי נתוני עבר וחדשות, לא ייעוץ השקעות.
      </p>
    </>
  );
}

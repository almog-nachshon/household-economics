import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { ils } from "@/lib/goal";
import { BUCKETS, loadMarket, completePicks, sizePicks, fractional, isMetal, bucketPct, DEFAULT_METALS_PCT } from "@/lib/portfolio";
import { advisorEnabled } from "@/lib/advisor";
import { generatePlan, depositMonth, depositDate, holdings } from "@/lib/invest-run";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
// A return in green when up and red when down.
const Ret = ({ x }) => <span className={x > 0 ? "pos" : x < 0 ? "neg" : ""}>{pct(x)}</span>;
const date = (d) => d.toLocaleDateString("he-IL");
const bucketName = Object.fromEntries(BUCKETS.map((b) => [b.key, b.name]));
const CHANGES = { add: "להוסיף", hold: "להחזיק, בלי כסף חדש", reduce: "לצמצם (למכור חלק)", sell: "למכור" };

async function runNow() {
  "use server";
  try {
    await generatePlan();
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
    ...picks.map((p) => db.investPick.create({ data: { month, symbol: p.symbol, bucket: p.bucket, pct: p.pct, amount: p.amount } })),
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
  p.units == null ? "—" : isMetal(p.symbol) ? `${p.units.toFixed(3)} אונקיות` : fractional(p.symbol) ? `${p.units.toFixed(3)} יחידות` : `${p.units} יחידות`;

function Returns({ q }) {
  return (
    <table style={{ marginTop: 8 }}>
      <thead><tr><th>חודש</th><th>3 חודשים</th><th>6 חודשים</th><th>שנה</th><th>תנודתיות</th><th>ירידה מקס׳</th></tr></thead>
      <tbody><tr><td><Ret x={q.m1} /></td><td><Ret x={q.m3} /></td><td><Ret x={q.m6} /></td><td><Ret x={q.m12} /></td><td>{pct(q.vol)}</td><td><Ret x={q.maxDrawdown} /></td></tr></tbody>
    </table>
  );
}

export default async function Invest({ searchParams }) {
  const settings = await getSettings();
  const month = depositMonth();
  const day = depositDate(month);
  const [plan, done, held, market] = await Promise.all([
    db.aiPlan.findUnique({ where: { month } }),
    db.investPick.findMany({ where: { month } }),
    holdings(),
    loadMarket(),
  ]);
  // A one-off larger (or smaller) amount for this deposit, from the amount box; otherwise the standing order.
  const amount = Number(searchParams?.amount) > 0 ? Number(searchParams.amount) : settings.monthlyInvest;
  const chosen = plan ? JSON.parse(plan.picks) : [];
  const metalsPct = plan ? plan.metalsPct : DEFAULT_METALS_PCT;
  const { picks, leftover } = sizePicks(completePicks(chosen, market.bySymbol, amount, metalsPct), amount);
  const changes = plan
    ? JSON.parse(plan.changes)
    : held.map((h) => ({ symbol: h.symbol, action: picks.some((p) => p.symbol === h.symbol) ? "add" : "hold", reason: null }));

  return (
    <>
      <h1>השקעות: הפקדה ב-{date(day)}</h1>
      <p className="label">
        {plan
          ? `${plan.final ? "בדיקה סופית" : "בדיקה יומית"} של Claude מ-${plan.createdAt.toLocaleString("he-IL")}. ${plan.final ? "" : `הבדיקה הסופית ב-${date(day)}, לפני ההפקדה.`}`
          : advisorEnabled()
            ? "Claude עוד לא בדק את ההפקדה הזו. עד אז החלוקה לפי הביצועים בלבד."
            : "חסר ANTHROPIC_API_KEY, אז החלוקה לפי הביצועים בלבד (בלי Claude)."}
      </p>
      {searchParams?.error && <p className="warn">הבדיקה נכשלה: {searchParams.error}</p>}
      {market.rateError && <p className="warn">לא הצלחתי למשוך שערי מטבע ({market.rateError}).</p>}

      <form method="get" style={{ display: "flex", gap: 8, alignItems: "center", maxWidth: "none", marginBottom: 12, flexWrap: "wrap" }}>
        <span>סכום להשקעה:</span>
        <input type="number" name="amount" min="1" step="1" defaultValue={amount} style={{ width: 140 }} />
        <button type="submit">חשב חלוקה</button>
        {amount !== settings.monthlyInvest && <a href="/invest">חזרה להוראת הקבע ({ils(settings.monthlyInvest)})</a>}
      </form>

      <div className="card">
        <h2>{ils(amount)} לאינטראקטיב, לאן:</h2>
        <p className="label" style={{ marginTop: 0 }}>
          {BUCKETS.map((b) => `${b.name} ${Math.round(bucketPct(b, metalsPct) * 10) / 10}%`).join(" · ")}
          {plan ? " (אחוז המתכות לפי הבדיקה של Claude)" : ""}
        </p>
        {picks.map((p) => (
          <details key={p.symbol} style={{ borderBottom: "1px solid var(--track)", padding: "10px 0" }}>
            <summary style={{ cursor: "pointer", fontSize: 18 }}>
              <b>{ils(p.amount)}</b> ← <b>{p.symbol}</b> {p.name} <span className="label">({bucketName[p.bucket]}, {Math.round(p.pct * 10) / 10}%)</span>
            </summary>
            <div style={{ overflowX: "auto" }}>
              <p className="label" style={{ margin: "8px 0 0" }}>
                מחיר: {p.priceIls ? ils(p.priceIls) : "—"} ({p.price} {p.currency}{isMetal(p.symbol) ? " לאונקיה" : ""}) · לקנות: {units(p)}
              </p>
              <Returns q={p} />
              <p style={{ marginBottom: 0 }}>💡 {p.reason || numbersReason(p)}</p>
            </div>
          </details>
        ))}
        {leftover > 1 && <p className="label">נשאר כמזומן בחשבון: {ils(leftover)} (קרן בלונדון נקנית ביחידות שלמות).</p>}
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
              <input type="hidden" name="picks" value={JSON.stringify(picks.map(({ symbol, name, bucket, pct, amount }) => ({ symbol, name, bucket, pct, amount })))} />
              <button type="submit">קניתי ✓</button>
            </form>
          )}
          {advisorEnabled() && (
            <form action={runNow}>
              <button type="submit" className="secondary">בדיקה של Claude עכשיו (1–3 דק׳)</button>
            </form>
          )}
        </div>
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

      <details className="card" style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer" }}>כל המועמדים והביצועים שלהם</summary>
        {BUCKETS.map((b) => (
          <div key={b.key} style={{ marginTop: 12, overflowX: "auto" }}>
            <h2>{b.name}: {Math.round(bucketPct(b, metalsPct) * 10) / 10}%, {b.count === 1 ? "בחירה אחת" : `${b.count} בחירות`}</h2>
            <table>
              <thead><tr><th>סימול</th><th>שם</th><th>חודש</th><th>3 חודשים</th><th>6 חודשים</th><th>שנה</th><th>תנודתיות</th></tr></thead>
              <tbody>
                {b.candidates.map(([s]) => {
                  const q = market.bySymbol[s];
                  return (
                    <tr key={s} style={picks.some((p) => p.symbol === s) ? { fontWeight: 700 } : undefined}>
                      <td>{s}</td><td>{q.name}</td>
                      {q.error ? <td colSpan={5} className="warn">אין נתונים</td> : (
                        <><td><Ret x={q.m1} /></td><td><Ret x={q.m3} /></td><td><Ret x={q.m6} /></td><td><Ret x={q.m12} /></td><td>{pct(q.vol)}</td></>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </details>

      <p className="label" style={{ marginTop: 12 }}>
        מחירים מ-Yahoo Finance, מתעדכנים כל 12 שעות. זו המלצה של מודל לפי נתוני עבר וחדשות, לא ייעוץ השקעות.
      </p>
    </>
  );
}

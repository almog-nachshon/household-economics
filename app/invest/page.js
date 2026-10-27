import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { startOfMonth } from "@/lib/budget";
import { monthLabel } from "@/lib/plan";
import { ils } from "@/lib/goal";
import { BUCKETS, PROFILES, loadMarket, sizePicks, reviewStatus, isMetal, fractional } from "@/lib/portfolio";
import { advisorEnabled } from "@/lib/advisor";
import { generatePlan, lastHeld } from "@/lib/invest-run";
import Stat from "@/components/Stat";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const ACTIONS = { keep: "ממשיכים", new: "חדש החודש" };

async function setProfile(formData) {
  "use server";
  await db.settings.update({ where: { id: 1 }, data: { riskProfile: String(formData.get("riskProfile")) } });
  revalidatePath("/invest");
}

async function runNow() {
  "use server";
  try {
    await generatePlan();
  } catch (e) {
    redirect(`/invest?error=${encodeURIComponent(e.message)}`);
  }
  redirect("/invest");
}

// Records this month's buys and makes them the split shown on the deposit page.
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

const unitsLabel = (p) =>
  p.units == null ? "—" : isMetal(p.symbol) ? `${p.units.toFixed(3)} אונ׳` : fractional(p.symbol) ? p.units.toFixed(3) : p.units;

export default async function Invest({ searchParams }) {
  const settings = await getSettings();
  const month = startOfMonth(new Date());
  const [plan, done, held, market] = await Promise.all([
    db.aiPlan.findUnique({ where: { month } }),
    db.investPick.findMany({ where: { month } }),
    lastHeld(month),
    loadMarket(),
  ]);
  const review = reviewStatus();
  const sized = plan ? sizePicks(JSON.parse(plan.picks), settings.monthlyInvest, market.bySymbol) : null;
  const bucketName = Object.fromEntries(BUCKETS.map((b) => [b.key, b.name]));

  return (
    <>
      <h1>השקעות: החלוקה של {monthLabel(month)}</h1>
      <p className="label">
        הוראת קבע של {ils(settings.monthlyInvest)} לאינטראקטיב ב-10 לכל חודש (משנים בהגדרות). ב-10 לחודש Claude
        בודק את המועמדים עם נתוני שוק אמיתיים וחדשות עדכניות ובוחר 5–6 החזקות.
      </p>

      <form action={setProfile} style={{ display: "flex", gap: 8, alignItems: "center", maxWidth: "none", marginBottom: 12 }}>
        <span>רמת סיכון:</span>
        <select name="riskProfile" defaultValue={settings.riskProfile}>
          {Object.entries(PROFILES).map(([k, p]) => (
            <option key={k} value={k}>{p.name} (מדדים {p.split.long}% / מתכות {p.split.metals}% / מניות {p.split.stocks}%)</option>
          ))}
        </select>
        <button type="submit" className="secondary">עדכון</button>
      </form>

      {searchParams?.error && <p className="warn">הניתוח נכשל: {searchParams.error}</p>}
      {market.rateError && <p className="warn">לא הצלחתי למשוך שערי מטבע ({market.rateError}), אז אין חישוב יחידות.</p>}

      {!plan && (
        <div className="card" style={{ marginBottom: 12 }}>
          {!advisorEnabled() ? (
            <p className="warn">חסר ANTHROPIC_API_KEY בקובץ ‎.env, אז Claude לא יכול להריץ את הניתוח.</p>
          ) : (
            <form action={runNow} style={{ maxWidth: "none" }}>
              <p>
                {review.due ? "עוד לא נעשה ניתוח החודש." : `הניתוח האוטומטי הבא: ${review.next.toLocaleDateString("he-IL")}.`}{" "}
                הניתוח לוקח 1–3 דקות.
              </p>
              <button type="submit">הרץ ניתוח של Claude עכשיו</button>
            </form>
          )}
        </div>
      )}

      {plan && (
        <>
          <div className="grid">
            <Stat label="להשקיע החודש" value={ils(settings.monthlyInvest)} />
            <Stat label="שער דולר" value={market.usdIls ? `₪${market.usdIls.toFixed(3)}` : "—"} />
            <Stat label="נשאר כמזומן בחשבון" value={ils(sized.leftover)} hint="מקרנות בלונדון שנקנות ביחידות שלמות" />
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <h2>הסיכום של Claude</h2>
            <p>{plan.summary}</p>
            <p className="label">נותח ב-{plan.createdAt.toLocaleString("he-IL")} ({plan.model})</p>
          </div>

          <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
            <h2>מה קונים</h2>
            <table>
              <thead><tr><th>סימול</th><th>שם</th><th>קבוצה</th><th>%</th><th>סכום</th><th>מחיר</th><th>יחידות</th><th>מצב</th><th>למה</th></tr></thead>
              <tbody>
                {sized.picks.map((p) => (
                  <tr key={p.symbol}>
                    <td><b>{p.symbol}</b></td>
                    <td>{p.name}</td>
                    <td>{bucketName[p.bucket]}</td>
                    <td>{p.pct}%</td>
                    <td>{ils(p.amount)}</td>
                    <td>{p.priceIls ? ils(p.priceIls) : "—"}</td>
                    <td>{unitsLabel(p)}</td>
                    <td>{ACTIONS[p.action]}</td>
                    <td style={{ whiteSpace: "normal", minWidth: 220 }}>{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {JSON.parse(plan.stopped).length > 0 && (
              <>
                <h2 style={{ marginTop: 12 }}>מפסיקים להוסיף (לא מוכרים)</h2>
                <ul>{JSON.parse(plan.stopped).map((s) => <li key={s.symbol}><b>{s.symbol}</b>: {s.reason}</li>)}</ul>
              </>
            )}
            <h2 style={{ marginTop: 12 }}>סיכונים החודש</h2>
            <ul>{JSON.parse(plan.risks).map((r) => <li key={r}>{r}</li>)}</ul>

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
                  <input type="hidden" name="picks" value={JSON.stringify(sized.picks.map(({ symbol, name, bucket, pct, amount }) => ({ symbol, name, bucket, pct, amount })))} />
                  <button type="submit">קניתי ✓</button>
                </form>
              )}
              {advisorEnabled() && (
                <form action={runNow}>
                  <button type="submit" className="secondary">הרץ ניתוח מחדש</button>
                </form>
              )}
            </div>
          </div>

          <details className="card" style={{ marginTop: 12 }}>
            <summary>המחקר המלא של Claude</summary>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{plan.research}</div>
          </details>
        </>
      )}

      {held.length > 0 && <p className="label">בחודש הקודם נקנו: {held.map((h) => `${h.symbol} ${h.pct}%`).join(", ")}</p>}

      {BUCKETS.map((b) => (
        <div key={b.key} className="card" style={{ marginTop: 12, overflowX: "auto" }}>
          <h2>{b.name}</h2>
          <table>
            <thead><tr><th>סימול</th><th>שם</th><th>מחיר</th><th>חודש</th><th>3 חודשים</th><th>6 חודשים</th><th>שנה</th><th>תנודתיות</th><th>ירידה מקס׳</th></tr></thead>
            <tbody>
              {b.candidates.map(([s]) => {
                const q = market.bySymbol[s];
                const picked = sized?.picks.some((p) => p.symbol === s);
                return (
                  <tr key={s} style={picked ? { fontWeight: 700 } : undefined}>
                    <td>{s}</td>
                    <td>{q.name}</td>
                    {q.error ? (
                      <td colSpan={7} className="warn">אין נתונים ({q.error})</td>
                    ) : (
                      <>
                        <td>{q.priceIls ? ils(q.priceIls) : `${q.price} ${q.currency}`}</td>
                        <td>{pct(q.m1)}</td><td>{pct(q.m3)}</td><td>{pct(q.m6)}</td><td>{pct(q.m12)}</td>
                        <td>{pct(q.vol)}</td><td>{pct(q.maxDrawdown)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      <div className="card label" style={{ marginTop: 12 }}>
        <h2>איך זה עובד</h2>
        <ul>
          <li>מחירים יומיים מ-Yahoo Finance (כולל דיבידנדים) של השנה האחרונה, מתעדכנים כל 12 שעות.</li>
          <li>ב-10 לחודש Claude מקבל את המספרים האלה ואת ההחזקות מהחודש הקודם, מחפש ברשת דוחות, חדשות ומאקרו, ובוחר 5–6 החזקות לפי רמת הסיכון.</li>
          <li>מתכות: זהב וכסף כמתכת (ספוט XAUUSD / XAGUSD באינטראקטיב, צריך הרשאת מסחר במתכות). לנחושת אין ספוט באינטראקטיב, רק חוזה עתידי גדול, ולכן היא מוצגת למעקב בלבד.</li>
          <li>קרנות עם ״.L״ הן קרנות אירלנדיות בלונדון: בלי חשיפה למס עיזבון אמריקאי, ומס דיבידנד 15% במקום 25%. נקנות ביחידות שלמות.</li>
          <li>זו המלצה של מודל שפה על בסיס נתוני עבר וחדשות, לא ייעוץ השקעות. ההחלטה והאחריות שלך.</li>
        </ul>
      </div>
    </>
  );
}

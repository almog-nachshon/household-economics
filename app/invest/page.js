import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { startOfMonth } from "@/lib/budget";
import { monthLabel } from "@/lib/plan";
import { ils } from "@/lib/goal";
import { buildPlan, reviewStatus, fractional, PROFILES } from "@/lib/portfolio";
import Stat from "@/components/Stat";

export const dynamic = "force-dynamic";

const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
const ACTIONS = { start: "קנייה ראשונה", keep: "ממשיכים", new: "חדש החודש" };

async function setProfile(formData) {
  "use server";
  await db.settings.update({ where: { id: 1 }, data: { riskProfile: String(formData.get("riskProfile")) } });
  revalidatePath("/invest");
}

// Records this month's buys and makes them the split shown on the deposit page.
async function confirm(formData) {
  "use server";
  const month = new Date(formData.get("month"));
  const picks = JSON.parse(formData.get("picks"));
  await db.$transaction([
    db.investPick.deleteMany({ where: { month } }),
    ...picks.map(({ name, ...p }) => db.investPick.create({ data: { month, ...p } })),
    db.settings.update({
      where: { id: 1 },
      data: { allocations: JSON.stringify(picks.map((p) => ({ ticker: p.symbol, name: p.name, pct: Math.round(p.pct * 10) / 10 }))) },
    }),
  ]);
  revalidatePath("/invest");
}

async function undo(formData) {
  "use server";
  await db.investPick.deleteMany({ where: { month: new Date(formData.get("month")) } });
  revalidatePath("/invest");
}

export default async function Invest() {
  const settings = await getSettings();
  const month = startOfMonth(new Date());
  const [done, prev] = await Promise.all([
    db.investPick.findMany({ where: { month } }),
    db.investPick.findFirst({ where: { month: { lt: month } }, orderBy: { month: "desc" } }),
  ]);
  const held = prev ? await db.investPick.findMany({ where: { month: prev.month } }) : [];
  const plan = await buildPlan({ monthlyInvest: settings.monthlyInvest, profile: settings.riskProfile, held });
  const review = reviewStatus();
  const names = Object.fromEntries(plan.buckets.flatMap((b) => b.all.map((q) => [q.symbol, q.name])));

  return (
    <>
      <h1>השקעות: חלוקה חודשית באינטראקטיב</h1>
      <p className="label">
        הוראת קבע של {ils(settings.monthlyInvest)} לחשבון המסחר בכל חודש (משנים בהגדרות).
        הבדיקה החודשית נעשית בין ה-10 ל-12 לחודש, אחרי שהמשכורת נכנסת.
      </p>
      <div className={`card ${review.open ? "" : "label"}`} style={{ marginBottom: 12 }}>
        {review.open
          ? "🔔 זה זמן הבדיקה החודשית: עברו על הרשימה, קנו באינטראקטיב וסמנו ״קניתי״."
          : `הבדיקה הבאה: ${review.next.toLocaleDateString("he-IL")}. המספרים כאן מתעדכנים כל יום.`}
      </div>

      <form action={setProfile} style={{ display: "flex", gap: 8, alignItems: "center", maxWidth: "none", marginBottom: 12 }}>
        <span>רמת סיכון:</span>
        <select name="riskProfile" defaultValue={settings.riskProfile}>
          {Object.entries(PROFILES).map(([k, p]) => (
            <option key={k} value={k}>{p.name} ({Object.values(p.split).join("/")})</option>
          ))}
        </select>
        <button type="submit" className="secondary">עדכון</button>
      </form>

      <div className="grid">
        <Stat label="להשקיע החודש" value={ils(settings.monthlyInvest)} />
        <Stat label="שער דולר" value={plan.usdIls ? `₪${plan.usdIls.toFixed(3)}` : "—"} warn={!plan.usdIls} />
        <Stat label="נשאר כמזומן בחשבון" value={ils(plan.leftover)} hint="מצטבר לקנייה של יחידה שלמה בחודש הבא" />
      </div>
      {plan.rateError && <p className="warn">לא הצלחתי למשוך שערי מטבע ({plan.rateError}), אז אין חישוב יחידות.</p>}

      <div className="card" style={{ marginTop: 12, overflowX: "auto" }}>
        <h2>מה קונים ב{monthLabel(month)}</h2>
        <table>
          <thead><tr><th>סימול</th><th>שם</th><th>סוג</th><th>%</th><th>סכום</th><th>מחיר</th><th>יחידות</th><th>מצב</th></tr></thead>
          <tbody>
            {plan.picks.map((p) => (
              <tr key={p.symbol}>
                <td><b>{p.symbol}</b></td>
                <td>{p.name}</td>
                <td>{plan.buckets.find((b) => b.key === p.bucket).name}</td>
                <td>{p.pct.toFixed(1)}%</td>
                <td>{ils(p.amount)}</td>
                <td>{p.priceIls ? ils(p.priceIls) : "—"}</td>
                <td>{p.units == null ? "—" : fractional(p.symbol) ? p.units.toFixed(3) : p.units}</td>
                <td>{p.swappedFrom ? `במקום ${p.swappedFrom} (יחידה יקרה מדי)` : ACTIONS[p.action]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {plan.picks.some((p) => p.units === 0) && (
          <p className="label">0 יחידות: קרן בלונדון נקנית ביחידות שלמות. הכסף נשאר כמזומן ויספיק לקנייה כשיצטבר.</p>
        )}
        {plan.buckets.some((b) => b.dropped.length) && (
          <p className="label">
            הפסקנו להוסיף כסף ל: {plan.buckets.flatMap((b) => b.dropped).map((q) => q.symbol).join(", ")}.
            לא מוכרים: מה שכבר קניתם נשאר בתיק, והכסף החדש הולך לקרנות שמובילות עכשיו (בלי מס רווחי הון על מכירה).
          </p>
        )}

        <div style={{ marginTop: 12 }}>
          {done.length ? (
            <form action={undo}>
              <p>✅ סומן כנקנה החודש: {done.map((p) => p.symbol).join(", ")}</p>
              <input type="hidden" name="month" value={month.toISOString()} />
              <button type="submit" className="secondary">ביטול הסימון</button>
            </form>
          ) : (
            <form action={confirm}>
              <input type="hidden" name="month" value={month.toISOString()} />
              <input type="hidden" name="picks" value={JSON.stringify(plan.picks.map((p) => ({ symbol: p.symbol, name: p.name, bucket: p.bucket, pct: p.pct, amount: p.amount })))} />
              <button type="submit">קניתי ✓</button>
            </form>
          )}
        </div>
      </div>

      {plan.buckets.map((b) => (
        <div key={b.key} className="card" style={{ marginTop: 12, overflowX: "auto" }}>
          <h2>{b.name}: {b.pct}% מההפקדה{b.pct ? `, ${b.count} הטובות נבחרות` : " (לא בפרופיל הזה)"}</h2>
          <table>
            <thead><tr><th>#</th><th>סימול</th><th>שם</th><th>חודש</th><th>3 חודשים</th><th>6 חודשים</th><th>שנה</th><th>תנודתיות</th><th>ירידה מקס׳</th><th>ציון</th></tr></thead>
            <tbody>
              {b.all.map((q, i) => (
                <tr key={q.symbol} style={b.picks.some((p) => p.symbol === q.symbol) ? { fontWeight: 700 } : undefined}>
                  <td>{q.error ? "" : i + 1}</td>
                  <td>{q.symbol}</td>
                  <td>{names[q.symbol]}</td>
                  {q.error ? (
                    <td colSpan={7} className="warn">אין נתונים ({q.error})</td>
                  ) : (
                    <>
                      <td>{pct(q.m1)}</td><td>{pct(q.m3)}</td><td>{pct(q.m6)}</td><td>{pct(q.m12)}</td>
                      <td>{pct(q.vol)}</td><td>{pct(q.maxDrawdown)}</td><td>{q.score.toFixed(3)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="card label" style={{ marginTop: 12 }}>
        <h2>איך זה מחושב</h2>
        <ul>
          <li>מחירים יומיים מ-Yahoo Finance כולל דיבידנדים, של השנה האחרונה, מתעדכנים כל 12 שעות.</li>
          <li>ציון = ממוצע התשואות של 3, 6 ו-12 חודשים פחות חצי מהתנודתיות השנתית. ציון גבוה = עלתה יפה בלי טלטלות.</li>
          <li>מחזיקים בבחירה של החודש הקודם כל עוד היא בין {"N+1"} המקומות הראשונים בקבוצה שלה, כדי לא להחליף בגלל ירידה קטנה.</li>
          <li>קרנות עם ״.L״ הן קרנות אירלנדיות שנסחרות בלונדון: בלי חשיפה למס עיזבון אמריקאי, ומס דיבידנד 15% במקום 25%.</li>
          <li>״הון סיכון״ אמיתי לא זמין למשקיע פרטי באינטראקטיב, לכן הקבוצה הזו היא קרנות ומניות בסיכון גבוה.</li>
          <li>ביצועי עבר לא מבטיחים תשואה עתידית. זה כלי עזר לפי כללים קבועים, לא ייעוץ השקעות.</li>
        </ul>
      </div>
    </>
  );
}

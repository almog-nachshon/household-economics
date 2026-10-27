import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { ils } from "@/lib/goal";
import { BUCKETS, loadMarket, completePicks, sizePicks, fractional, isMetal, bucketPct, DEFAULT_METALS_PCT, ABOUT } from "@/lib/portfolio";
import { advisorEnabled } from "@/lib/advisor";
import { SplitPie } from "@/components/Charts";
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
        <div className="pies" style={{ marginBottom: 12 }}>
          <SplitPie
            centerLabel="להשקעה"
            data={picks.map((p) => ({ name: `${p.symbol} · ${p.name} · ${bucketName[p.bucket]}`, value: p.amount, color: BUCKET_COLORS[p.bucket] }))}
          />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="compact">
            <thead>
              <tr><th>סכום</th><th>סימול</th><th>שם (לחיצה לפרטים)</th><th>סוג</th><th>%</th><th>לקנות</th><th>שנה</th></tr>
            </thead>
            <tbody>
              {picks.map((p) => (
                <tr key={p.symbol}>
                  <td><b>{ils(p.amount)}</b></td>
                  <td><b>{p.symbol}</b></td>
                  <td className="line-name">
                    <details>
                      <summary title={p.name}>{p.name}</summary>
                      <div className="pick-more">
                        <div>💡 {p.reason || numbersReason(p)}</div>
                        <div className="label">
                          מחיר {p.priceIls ? ils(p.priceIls) : "—"} · חודש <Ret x={p.m1} /> · 3 ח׳ <Ret x={p.m3} /> · 6 ח׳ <Ret x={p.m6} /> · תנודתיות {pct(p.vol)}
                        </div>
                      </div>
                    </details>
                  </td>
                  <td><span className="tag" style={{ background: BUCKET_COLORS[p.bucket], color: "#fff" }}>{bucketName[p.bucket]}</span></td>
                  <td>{Math.round(p.pct * 10) / 10}%</td>
                  <td>{units(p)}</td>
                  <td><Ret x={p.m12} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

      <h2 style={{ marginTop: 20 }}>כל המניות והקרנות לפי תחום</h2>
      <div className="blocks">
        {BUCKETS.map((b) => (
          <div key={b.key} className="card" style={{ borderTopColor: BUCKET_COLORS[b.key] }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <h2 style={{ margin: 0, color: BUCKET_COLORS[b.key] }}>{b.name}</h2>
              <b>{Math.round(bucketPct(b, metalsPct) * 10) / 10}%</b>
            </div>
            <div className="label">{b.count === 1 ? "בחירה אחת" : `${b.count} בחירות`} · מודגש = נבחר החודש · לחיצה על שם לפרטים</div>
            <table className="compact">
              <thead><tr><th>סימול</th><th>שם</th><th>חודש</th><th>6 ח׳</th><th>שנה</th></tr></thead>
              <tbody>
                {b.candidates.map(([s]) => {
                  const q = market.bySymbol[s];
                  return (
                    <tr key={s} style={picks.some((p) => p.symbol === s) ? { fontWeight: 700 } : undefined}>
                      <td>{s}</td>
                      <td className="line-name">
                        <details>
                          <summary title={q.name}>{q.name}</summary>
                          <div className="pick-more">
                            <div>{ABOUT[s]}</div>
                            {!q.error && (
                              <div className="label">
                                מחיר {q.priceIls ? ils(q.priceIls) : `${q.price} ${q.currency}`} · 3 ח׳ <Ret x={q.m3} /> · תנודתיות {pct(q.vol)} · ירידה מקס׳ <Ret x={q.maxDrawdown} />
                              </div>
                            )}
                          </div>
                        </details>
                      </td>
                      {q.error ? <td colSpan={3} className="warn">אין נתונים</td> : (
                        <><td><Ret x={q.m1} /></td><td><Ret x={q.m6} /></td><td><Ret x={q.m12} /></td></>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <p className="label" style={{ marginTop: 12 }}>
        מחירים מ-Yahoo Finance, מתעדכנים כל 12 שעות. זו המלצה של מודל לפי נתוני עבר וחדשות, לא ייעוץ השקעות.
      </p>
    </>
  );
}

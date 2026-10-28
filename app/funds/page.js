import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/data";
import { monthlyDeposit, project, yearlyFee, timeline, PENSION_FACTOR } from "@/lib/funds";
import { monthLabel } from "@/lib/plan";
import { ils } from "@/lib/goal";
import Stat from "@/components/Stat";
import { advisorEnabled } from "@/lib/advisor";
import AiButton from "@/components/AiButton";
import Logo, { ClaudeMark } from "@/components/Logo";
import { generateFundReview } from "@/lib/fund-advisor";

export const dynamic = "force-dynamic";

const KINDS = { keren: "קרן השתלמות", pension: "פנסיה" };
const VERDICTS = { stay: "להישאר", switch: "כדאי לעבור", check: "לבדוק" };
const date = (d) => d.toLocaleDateString("he-IL");
const dayOf = (v) => {
  if (!v) return null;
  const [y, m, d] = String(v).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");

const NUMBERS = ["balance", "employeeMonthly", "employerMonthly", "severanceMonthly", "feeBalancePct", "feeDepositPct", "returnPct", "providerRetire", "providerPension"];

function fundData(formData) {
  return {
    name: String(formData.get("name")),
    kind: String(formData.get("kind")),
    ...Object.fromEntries(NUMBERS.map((k) => [k, Number(formData.get(k) || 0)])),
    balanceDate: dayOf(formData.get("balanceDate")),
    liquidDate: dayOf(formData.get("liquidDate")),
    joinDate: dayOf(formData.get("joinDate")),
    forHome: formData.get("forHome") === "on",
    track: String(formData.get("track") || ""),
    policy: String(formData.get("policy") || ""),
    coverage: String(formData.get("coverage") || ""),
  };
}

async function addFund(formData) {
  "use server";
  await db.fund.create({ data: fundData(formData) });
  revalidatePath("/funds");
}

async function updateFund(formData) {
  "use server";
  await db.fund.update({ where: { id: Number(formData.get("id")) }, data: fundData(formData) });
  revalidatePath("/funds");
}

async function removeFund(formData) {
  "use server";
  await db.fund.delete({ where: { id: Number(formData.get("id")) } });
  revalidatePath("/funds");
}

async function reviewNow() {
  "use server";
  try {
    await generateFundReview();
  } catch (e) {
    redirect(`/funds?error=${encodeURIComponent(e.message)}#review`);
  }
  redirect("/funds#review");
}

async function saveBirthYear(formData) {
  "use server";
  await db.settings.update({ where: { id: 1 }, data: { birthYear: Number(formData.get("birthYear") || 0) } });
  revalidatePath("/funds");
}

const inline = { display: "grid", gap: 4, maxWidth: "none" };
const Row = ({ children }) => <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>{children}</div>;

// The same fields for adding and editing a fund.
function FundFields({ f = {} }) {
  const n = (k, label, step = "1", width = 100) => (
    <label style={inline}>{label} <input type="number" name={k} step={step} defaultValue={f[k] ?? ""} style={{ width }} /></label>
  );
  return (
    <Row>
      <label style={inline}>שם <input name="name" required defaultValue={f.name} /></label>
      <label style={inline}>סוג <select name="kind" defaultValue={f.kind}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {n("balance", "יתרה", "0.01", 120)}
      <label style={inline}>נכון ל- <input type="date" name="balanceDate" required defaultValue={iso(f.balanceDate)} /></label>
      {n("employeeMonthly", "עובד לחודש", "0.01")}
      {n("employerMonthly", "מעסיק לחודש", "0.01")}
      {n("severanceMonthly", "פיצויים לחודש", "0.01")}
      {n("feeBalancePct", "דמי ניהול מצבירה %", "0.01", 80)}
      {n("feeDepositPct", "מהפקדה %", "0.01", 80)}
      {n("returnPct", "תשואה שנתית משוערת %", "0.1", 80)}
      <label style={inline}>נזילה ב- <input type="date" name="liquidDate" defaultValue={iso(f.liquidDate)} /></label>
      <label style={inline}>מסלול <input name="track" defaultValue={f.track} style={{ width: 110 }} /></label>
      <label style={inline}>מספר פוליסה <input name="policy" defaultValue={f.policy} style={{ width: 120 }} /></label>
      <label style={inline}>הצטרפות <input type="date" name="joinDate" defaultValue={iso(f.joinDate)} /></label>
      {n("providerRetire", "צפי הקופה לפרישה", "1", 120)}
      {n("providerPension", "קצבה צפויה (הקופה)", "1", 110)}
      <label style={{ ...inline, width: "100%" }}>כיסויים (שורה לכל כיסוי: שם: סכום) <textarea name="coverage" rows={3} defaultValue={f.coverage} /></label>
      <label style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" name="forHome" defaultChecked={f.forHome} /> לבית</label>
    </Row>
  );
}

export default async function Funds({ searchParams }) {
  const [funds, settings, review] = await Promise.all([
    db.fund.findMany({ orderBy: [{ kind: "asc" }, { balance: "desc" }] }),
    getSettings(),
    db.fundReview.findFirst({ orderBy: { month: "desc" } }),
  ]);
  const target = settings.targetDate;
  const retire = settings.birthYear ? new Date(settings.birthYear + 67, 0, 1) : null;
  const kerens = funds.filter((f) => f.kind === "keren");
  const pensions = funds.filter((f) => f.kind === "pension");
  const total = (list) => list.reduce((t, f) => t + f.balance, 0);
  // Money for the home: kerens marked "for home" that are liquid by the target date, projected to it.
  const forHome = kerens.filter((f) => f.forHome && f.liquidDate && f.liquidDate <= target);
  const homeValue = forHome.reduce((t, f) => t + project(f, target).value, 0);

  return (
    <>
      <div className="page-head">
        <h1>קרנות השתלמות ופנסיה</h1>
        {advisorEnabled() && (
          <form action={reviewNow} style={{ maxWidth: "none" }}>
            <AiButton label="בדיקת מסלולים עם Claude" updated={review?.createdAt.toLocaleString("he-IL")} />
          </form>
        )}
      </div>
      <div className="grid">
        <Stat label="קרנות השתלמות היום" value={ils(total(kerens))} />
        <Stat label="פנסיה היום" value={ils(total(pensions))} />
        <Stat label="הפקדות לחודש (הכל)" value={ils(funds.reduce((t, f) => t + monthlyDeposit(f), 0))} />
        <Stat label={`זמין לבית ב-${date(target)}`} value={ils(homeValue)} hint={forHome.map((f) => f.name).join(", ") || "סמן ״לבית״ בקרן שנזילה עד היעד"} />
      </div>

      {[["keren", kerens], ["pension", pensions]].map(([kind, list]) => list.length > 0 && (
        <section key={kind}>
          <h2 style={{ marginTop: 20 }}>{KINDS[kind]} ({list.length}): {ils(total(list))}</h2>
          <div className="blocks">
            {list.map((f) => {
              const dep = monthlyDeposit(f);
              const atRetire = f.providerRetire || (retire ? project(f, retire).value : 0);
              const pensionMonthly = f.providerPension || (atRetire ? atRetire / PENSION_FACTOR : 0);
              return (
                <div key={f.id} className="card fund-card">
                  <div className="fund-head">
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Logo id={/פניקס/.test(f.name) ? "phoenix" : /מור/.test(f.name) ? "mor" : f.name} label={f.name} size={32} />
                      <div>
                      <h2 style={{ margin: 0 }}>{f.name}</h2>
                      <div className="label">{f.policy && `פוליסה ${f.policy}`}</div>
                      </div>
                    </div>
                    <span className={`status ${dep ? "on" : ""}`}>{dep ? "פעילה" : "ללא הפקדות"}</span>
                  </div>
                  <div className="fund-balance">{ils(f.balance)}</div>
                  <div className="label" style={{ textAlign: "center" }}>נכון ל-{date(f.balanceDate)}</div>
                  <div className="fund-grid">
                    <div><span className="label">מסלול</span><b>{f.track || "—"}</b></div>
                    <div><span className="label">הצטרפות</span><b>{f.joinDate ? date(f.joinDate) : "—"}</b></div>
                    <div><span className="label">דמי ניהול מצבירה</span><b>{f.feeBalancePct}%</b></div>
                    <div><span className="label">דמי ניהול מהפקדה</span><b>{f.feeDepositPct}%</b></div>
                    <div>
                      <span className="label">הפקדה לחודש</span><b>{dep ? ils(dep) : "—"}</b>
                      {dep > 0 && <span className="label">עובד {ils(f.employeeMonthly)} · מעסיק {ils(f.employerMonthly)}{f.severanceMonthly ? ` · פיצויים ${ils(f.severanceMonthly)}` : ""}</span>}
                    </div>
                    <div><span className="label">עלות דמי ניהול לשנה</span><b className="neg">{ils(yearlyFee(f))}</b></div>
                    {kind === "keren" ? (
                      <>
                        <div><span className="label">נזילה</span><b>{f.liquidDate ? date(f.liquidDate) : "—"}</b></div>
                        <div><span className="label">צפי בנזילות</span><b className="pos">{f.liquidDate ? ils(project(f, f.liquidDate).value) : "—"}</b></div>
                      </>
                    ) : (
                      <>
                        <div><span className="label">צפי חיסכון לפרישה{f.providerRetire ? " (הקופה)" : ""}</span><b className="pos">{atRetire ? ils(atRetire) : "הזן שנת לידה"}</b></div>
                        <div><span className="label">קצבה צפויה{f.providerPension ? " (הקופה)" : ""}</span><b className="pos">{pensionMonthly ? `${ils(pensionMonthly)} לחודש` : "—"}</b></div>
                      </>
                    )}
                  </div>
                  {f.coverage && (
                    <div style={{ marginTop: 8 }}>
                      <div className="label">כיסויים ביטוחיים</div>
                      <ul className="coverage">{f.coverage.split("\n").filter(Boolean).map((c) => <li key={c}>{c}</li>)}</ul>
                    </div>
                  )}
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer" }}>עדכון</summary>
                    <form action={updateFund} style={{ maxWidth: "none", marginTop: 8 }}>
                      <input type="hidden" name="id" value={f.id} />
                      <FundFields f={f} />
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button type="submit">שמירה</button>
                        <button type="submit" formAction={removeFund} className="secondary">מחיקה</button>
                      </div>
                    </form>
                  </details>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="card" id="review" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, display: "flex", gap: 8, alignItems: "center" }}><ClaudeMark size={20} /> בדיקת מסלולים עם Claude</h2>
        </div>
        <p className="label">
          משווה את מסלולי המניות שלך בפנסיה ובהשתלמות למובילים בשוק (תשואה נטו 1/3/5 שנים, דמי ניהול, סיכון). רץ אוטומטית
          ב-10 לכל חודש.
        </p>
        {searchParams?.error && <p className="warn">הבדיקה נכשלה: {searchParams.error}</p>}
        {review ? (
          <>
            <p>{review.summary}</p>
            <p className="label">נבדק ב-{review.createdAt.toLocaleString("he-IL")}</p>
            {JSON.parse(review.funds).map((r) => (
              <div key={r.fund} className="review-fund">
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b>{r.fund}</b>
                  <span className={`tag ${r.verdict === "stay" ? "tag-stay" : r.verdict === "switch" ? "tag-switch" : ""}`}>{VERDICTS[r.verdict]}</span>
                </div>
                <div>מומלץ: <b>{r.best}</b></div>
                <div className="label">{r.reason}</div>
                {r.alternatives.length > 0 && (
                  <div style={{ overflowX: "auto" }}>
                    <table className="compact">
                      <thead><tr><th>מסלול</th><th>12 ח׳</th><th>3 שנים</th><th>5 שנים</th><th>דמי ניהול</th></tr></thead>
                      <tbody>
                        {r.alternatives.map((a) => (
                          <tr key={a.name}><td className="line-name" title={a.name}>{a.name}</td><td>{a.return1y}</td><td>{a.return3y}</td><td>{a.return5y}</td><td>{a.fee}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            <details>
              <summary style={{ cursor: "pointer" }}>המחקר המלא</summary>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{review.research}</div>
            </details>
          </>
        ) : (
          <p className="label">{advisorEnabled() ? "עוד לא נעשתה בדיקה." : "חסר ANTHROPIC_API_KEY."}</p>
        )}
      </div>

      {kerens.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2>מה לעשות עם כל קרן</h2>
          <ul>
            {[...kerens].sort((x, y) => (x.liquidDate ?? 0) - (y.liquidDate ?? 0)).map((f, i) => {
              const atLiquid = f.liquidDate ? project(f, f.liquidDate).value : null;
              const beforeTarget = f.liquidDate && f.liquidDate <= target;
              return (
                <li key={f.id} style={{ marginBottom: 8 }}>
                  <b>{f.name}</b>{" "}
                  {f.liquidDate ? `נזילה ב-${date(f.liquidDate)}, צפי ${ils(atLiquid)}.` : "אין תאריך נזילות."}{" "}
                  {i === 0 && beforeTarget
                    ? `הנזילה הראשונה. לא חייבים למשוך בנזילות: הכסף ממשיך לצבור תשואה פטורה ממס, ואפשר למשוך בכל רגע. ההצעה: להשאיר אותה עד קניית הדירה (${date(target)}) כחלק מההון העצמי, ושנה לפני הקנייה להעביר למסלול סולידי (כללי / אג״ח) כדי שירידה בשוק לא תפגע במקדמה.`
                    : beforeTarget
                      ? "נזילה לפני יעד הבית: אפשר לכלול אותה בהון העצמי (סמן ״לבית״)."
                      : `נזילה אחרי יעד הבית (${date(target)}), אז היא לא כסף לדירה. אפשר להשאיר אותה במסלול מנייתי לטווח ארוך, או לקחת נגדה הלוואה בריבית נמוכה אם יחסר להון העצמי.`}
                  {!monthlyDeposit(f) && " לא פעילה (אין הפקדות), אבל ממשיכה לצבור."}
                  {f.feeBalancePct > 0.5 && ` דמי הניהול ${f.feeBalancePct}% מהצבירה: אפשר לבקש מהסוכן הורדה (מקובל להשיג 0.5% ומטה), זה ${ils(f.balance * (f.feeBalancePct - 0.5) / 100)} בשנה היום.`}
                </li>
              );
            })}
          </ul>
          <p className="label">מעבר כסף בין קרנות השתלמות (ניוד) שומר על הוותק. משיכה לפני הנזילות חייבת במס.</p>
        </div>
      )}

      {kerens.length > 0 && (
        <details className="card" style={{ marginTop: 12 }} open>
          <summary style={{ cursor: "pointer" }}><b>צפי לכל חודש עד הנזילות</b></summary>
          <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto", marginTop: 8 }}>
            <table>
              <thead><tr><th>חודש</th>{kerens.map((f) => <th key={f.id}>{f.name}</th>)}<th>נזיל באותו חודש</th></tr></thead>
              <tbody>
                {timeline(kerens).map((row) => (
                  <tr key={row.month.toISOString()}>
                    <td>{monthLabel(row.month)}</td>
                    {row.values.map((v) => <td key={v.id} className={v.liquid ? "pos" : ""}>{ils(v.value)}{v.liquid ? " ✓" : ""}</td>)}
                    <td><b className={row.liquidTotal ? "pos" : ""}>{ils(row.liquidTotal)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="label">✓ = נזילה. לפי התשואה המשוערת של כל קרן אחרי דמי ניהול, וההפקדות החודשיות בקרן הפעילה.</p>
        </details>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <h2>הוספת קרן</h2>
        <form action={addFund} style={{ maxWidth: "none" }}>
          <FundFields f={{ returnPct: 5 }} />
          <button type="submit" style={{ marginTop: 8 }}>הוספה</button>
        </form>
      </div>

      <form action={saveBirthYear} className="card" style={{ marginTop: 12, maxWidth: "none" }}>
        <Row>
          <label style={inline}>שנת לידה (לתחזית פנסיה בגיל 67) <input type="number" name="birthYear" defaultValue={settings.birthYear || ""} style={{ width: 100 }} /></label>
          <button type="submit" className="secondary">שמירה</button>
        </Row>
      </form>

      <div className="card label" style={{ marginTop: 12 }}>
        <h2>איך זה מחושב</h2>
        <ul>
          <li>תחזית חודשית: היתרה צוברת את התשואה המשוערת פחות דמי הניהול מצבירה, וכל הפקדה נכנסת אחרי דמי הניהול מהפקדה.</li>
          <li>קרן השתלמות נזילה אחרי 6 שנות ותק (או 3 שנים למטרות מסוימות), ואז המשיכה פטורה ממס רווחי הון עד תקרת ההפקדה.</li>
          <li>קצבה משוערת = הצבירה בגיל 67 חלקי {PENSION_FACTOR} (מקדם המרה מקורב). המקדם בפועל תלוי בקרן, במין ובמסלול.</li>
          <li>התשואה היא הנחה, לא הבטחה. כדאי לעדכן את היתרה פעם בחודש או ברבעון לפי האתר של הקופה.</li>
        </ul>
      </div>
    </>
  );
}

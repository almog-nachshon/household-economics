import Info from "@/components/Info";
import { TECH } from "@/lib/technicals";
import { GRADES, NO_DATA } from "@/lib/engine";

const VOTE = { buy: "קנייה", sell: "מכירה", neutral: "ניטרלי" };
const MEANING = {
  "strong-buy": "מגמה ארוכה עולה, והטווח הבינוני מאשר.",
  buy: "מגמה ארוכה עולה, בירידה זמנית בטווח הבינוני.",
  neutral: "המגמה הארוכה מעורבת: להחזיק ולא להוסיף לפי הסימן הזה.",
  sell: "מגמה ארוכה יורדת, עם התאוששות בטווח הבינוני.",
  "strong-sell": "מגמה ארוכה יורדת, וגם הטווח הבינוני שלילי.",
  "no-data": "אין 200 ימי מסחר: אי אפשר לקבוע מגמה ארוכה.",
};

// The one technical label as a pill: קנייה חזקה / קנייה / ניטרלי - אחזקה / מכירה / מכירה חזקה (lib/technicals.js).
export function TechTag({ t, short = false }) {
  if (!t) return <span className="label">—</span>;
  return <span className={`tech tech-${t.key}`} title={MEANING[t.key]}>{short && t.key === "neutral" ? "ניטרלי" : short && t.key === "no-data" ? "אין נתונים" : TECH[t.key]}</span>;
}

function Group({ title, g, fmt }) {
  const total = g.rows.length || 1;
  return (
    <div className="tp-group">
      <div className="tp-head"><b>{title}</b></div>
      <div className="tp-bar" role="img" aria-label={`${g.buy} קנייה, ${g.neutral} ניטרלי, ${g.sell} מכירה`}>
        {g.buy > 0 && <i className="tp-buy" style={{ width: `${(g.buy / total) * 100}%` }} />}
        {g.neutral > 0 && <i className="tp-neutral" style={{ width: `${(g.neutral / total) * 100}%` }} />}
        {g.sell > 0 && <i className="tp-sell" style={{ width: `${(g.sell / total) * 100}%` }} />}
      </div>
      <div className="label tp-count">קנייה {g.buy} · ניטרלי {g.neutral} · מכירה {g.sell}</div>
      <table className="compact">
        <tbody>
          {g.rows.map((r) => (
            <tr key={r.name}>
              <td dir="ltr" className="tp-name">{r.name}</td>
              <td dir="ltr">{fmt(r.value)}</td>
              <td className={r.vote === "buy" ? "pos" : r.vote === "sell" ? "neg" : "label"}>{VOTE[r.vote]}{r.note ? ` (${r.note})` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The candidate engine, in comparison mode: never what decides. e: lib/engine.js evaluate.
function Candidate({ e }) {
  const pc = (x) => `${x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
  const day = (s) => s && new Date(`${s}T00:00:00Z`).toLocaleDateString("he-IL", { timeZone: "UTC" });
  const graded = e.state === "graded";
  return (
    <div className="tp-cand">
      <div className="tp-top">
        <b>🧪 מנוע מועמד (מצב השוואה)</b>
        {graded ? <span className={`tech tech-${e.grade}`}>{GRADES[e.grade]}</span> : <span className={`tech tech-${e.state === "no-data" ? "no-data" : "neutral"}`}>{e.state === "no-data" ? NO_DATA : "אין דירוג ממודל"}</span>}
        <Info text="מועמד לבדיקה, לא הוכח כאמין: לא קונה ולא מחליף את התווית שלמעלה. בבדיקה הוא לא ניצח קנייה והחזקה ביחס לסיכון. דרגות מכירה לא התאמתו ולכן לא מוצגות. ציון אינו הסתברות. הדרגה היא על המניה, לא הוראת פעולה בתיק." />
      </div>
      {graded ? (
        <>
          <div className="label tp-extra">אופק: {Math.round(e.horizonDays / 21)} חודשים מול S&P 500 · נכון לסוף חודש {day(e.asOf)} · ציון המודל {pc(e.score)} (לא הסתברות) · גרסה {e.version}</div>
          {e.prevGrade && e.prevGrade !== e.grade && <div className="label tp-extra">השתנה מ-{GRADES[e.prevGrade]}: הדרגה החדשה חזרה בשני סופי חודש.</div>}
          <div className="label tp-extra">בעבר, בדרגה הזו, 80% מהתוצאות ב-3 חודשים היו בין {pc(e.range.q10)} ל-{pc(e.range.q90)}. זה נתון היסטורי, לא תחזית.</div>
          <div className="label tp-extra">תומך: {e.pros.join(", ") || "—"} · סותר: {e.cons.join(", ") || "—"}</div>
        </>
      ) : (
        <div className="label tp-extra">{e.why.join(" · ")}</div>
      )}
    </div>
  );
}

// The technical label in the details panel: what it means, the five checks that decide it, the day's volatility and
// pivot levels, and, folded, the 23 indicators' votes (detail only, they do not decide the label).
// t: lib/technicals.js technicalsOf; cur: the price's currency sign.
export default function TechPanel({ t, cur = "", engine = null }) {
  if (!t && !engine) return null;
  if (!t) return <div className="tp"><Candidate e={engine} /></div>;
  const num = (x) => (x == null ? "—" : Math.abs(x) >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x.toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const money = (x) => `${cur}${x.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return (
    <div className="tp">
      <div className="tp-top">
        <b>📊 תווית טכנית</b> <TechTag t={t} />
        <Info text="מתארת את מצב המגמה: הטווח הארוך קובע, והבינוני מחזק או מחליש. זו לא תחזית: בבדיקה הנקייה (2021-2026) התווית לא ניבאה תשואה ולא הפרידה באופן מובהק בין ירידות. לא קובעת קנייה: מה שקונה הוא הסטטוס מהמחקר." />
      </div>
      <p className="tp-mean">{MEANING[t.key]}</p>
      {t.checks && (
        <ul className="tp-checks">
          {t.checks.map((c) => (
            <li key={c.name}>
              <span className={c.ok ? "pos" : "neg"}>{c.ok ? "✓" : "✗"}</span> {c.name}
              {c.value != null && <span className="label" dir="ltr"> {c.value > 0 ? "+" : ""}{(c.value * 100).toFixed(1)}%</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="label tp-extra">
        ATR (14): <b dir="ltr">{t.atr == null ? "—" : money(t.atr)}</b>{t.atrPct != null ? ` (${(t.atrPct * 100).toFixed(1)}% ביום, תנודתיות בלבד)` : ""} · תמיכה S1 <b dir="ltr">{money(t.pivots.s1)}</b> · Pivot <b dir="ltr">{money(t.pivots.pivot)}</b> · התנגדות R1 <b dir="ltr">{money(t.pivots.r1)}</b>
      </div>
      <details className="tp-rows">
        <summary>פירוט 23 האינדיקטורים (לא קובע את התווית)</summary>
        <div className="tp-grid">
          <Group title="ממוצעים נעים" g={t.ma} fmt={num} />
          <Group title="אינדיקטורים" g={t.ind} fmt={num} />
        </div>
      </details>
      {engine && <Candidate e={engine} />}
    </div>
  );
}

const CUR = { USD: "$", GBP: "£", EUR: "€", ILS: "₪" };
const CONFIDENCE = {
  high: ["אמינות גבוהה", "3 מקורות או יותר מסכימים בטווח של 0.5%"],
  medium: ["אמינות בינונית", "2 מקורות מסכימים בטווח של 1%"],
  low: ["אמינות נמוכה", "מקור אחד בלבד, או פער גדול בין המקורות: כדאי לבדוק ידנית"],
};

const age = (t) => {
  if (!t) return "";
  const min = Math.round((Date.now() - t) / 60000);
  return min < 1 ? "עכשיו" : min < 60 ? `לפני ${min} דק׳` : min < 1440 ? `לפני ${Math.round(min / 60)} שע׳` : new Date(t).toLocaleDateString("he-IL");
};

// Where a price comes from: the fused price's reliability, each source's own price with a link to its page,
// and pages to check by hand. Reference-only sources (futures, official daily rates) are greyed; a source
// that strayed from the others is struck out and left out of the price. Tel Aviv prices (agorot) show in ₪.
export default function Sources({ q, currency, digits = 2 }) {
  if (!q?.sources?.length) return null;
  const ila = currency === "ILA";
  const fmt = (x) => `${CUR[ila ? "ILS" : currency] ?? ""}${(ila ? x / 100 : x).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  const [label, why] = CONFIDENCE[q.confidence] ?? CONFIDENCE.low;
  return (
    <div className="sources">
      <span className={`src-conf src-conf-${q.confidence ?? "low"}`} title={why}>{label}</span>
      {q.sources.map((s) => {
        const tip = [s.outlier ? "חריג מהשאר: לא נכלל במחיר" : s.note || (s.delayed ? "בעיכוב" : "מחיר חי"), age(s.time)].filter(Boolean).join(" · ");
        return (
          <a key={s.name} href={s.url} target="_blank" rel="noreferrer" className={`src${s.ref ? " src-ref" : ""}${s.outlier ? " src-out" : ""}`} title={tip}>
            {s.name} <b dir="ltr">{fmt(s.price)}</b>{s.note ? ` (${s.note})` : s.delayed ? " (בעיכוב)" : ""}
          </a>
        );
      })}
      {q.spread > 0.01 && <span className="src-gap">פער {(q.spread * 100).toFixed(1)}% בין המקורות</span>}
      {q.links?.map((l) => (
        <a key={l.name} href={l.url} target="_blank" rel="noreferrer" className="src-link">{l.name} ↗</a>
      ))}
    </div>
  );
}

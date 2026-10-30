const CUR = { USD: "$", GBP: "£", EUR: "€", ILS: "₪" };

// Where a price comes from: each source's own price with a link to its page, how far apart they are, and
// pages to check by hand. Reference-only sources (futures, official daily rates) are greyed.
export default function Sources({ q, currency, digits = 2 }) {
  if (!q?.sources?.length) return null;
  const fmt = (x) => `${CUR[currency] ?? ""}${x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  const live = q.sources.filter((s) => !s.ref).length;
  return (
    <div className="sources">
      <span className="sources-k">{live > 1 ? `חציון של ${live} מקורות` : "מקור"}</span>
      {q.sources.map((s) => (
        <a key={s.name} href={s.url} target="_blank" rel="noreferrer" className={s.ref ? "src src-ref" : "src"} title={s.note || "מחיר חי"}>
          {s.name} <b dir="ltr">{fmt(s.price)}</b>{s.note ? ` (${s.note})` : ""}
        </a>
      ))}
      {q.spread > 0.01 && <span className="src-gap">פער {(q.spread * 100).toFixed(1)}% בין המקורות</span>}
      {q.links?.map((l) => (
        <a key={l.name} href={l.url} target="_blank" rel="noreferrer" className="src-link">{l.name} ↗</a>
      ))}
    </div>
  );
}

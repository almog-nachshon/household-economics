"use client";
import { useMemo, useState } from "react";
import ExpandRow from "@/components/ExpandRow";

const STATUS_FILTERS = [["all", "הכול"], ["held", "בתיק"], ["buy", "🟢 לקנות"], ["wait", "🟡 לחכות"], ["sell", "🔴 למכור"], ["dup", "⛔ כפילות"]];

// The ranking as a screener, like TradingView's: filter by status, theme or text, and sort by any numeric column (a
// second click flips it). A click on a row opens its details, as everywhere. rows: [{symbol, name, status, held, bucket,
// chosen, sort: {column key: number}, cells, details}], best score first; columns: [[label, sort key or null]];
// themes: [[key, name]].
export default function Screener({ rows, columns, themes }) {
  const [status, setStatus] = useState("all");
  const [theme, setTheme] = useState("all");
  const [text, setText] = useState("");
  const [sort, setSort] = useState({ key: null, up: false });
  const count = (k) => (k === "all" ? rows.length : k === "held" ? rows.filter((r) => r.held).length : rows.filter((r) => r.status === k).length);
  const shown = useMemo(() => {
    const t = text.trim().toLowerCase();
    const out = rows.filter((r) =>
      (status === "all" || (status === "held" ? r.held : r.status === status)) &&
      (theme === "all" || r.bucket === theme) &&
      (!t || r.symbol.toLowerCase().includes(t) || r.name.toLowerCase().includes(t)));
    if (!sort.key) return out;
    const val = (r) => r.sort[sort.key] ?? -Infinity;
    return [...out].sort((a, b) => (sort.up ? val(a) - val(b) : val(b) - val(a)));
  }, [rows, status, theme, text, sort]);
  const by = (key) => setSort((s) => (s.key === key ? { key, up: !s.up } : { key, up: false }));
  return (
    <>
      <div className="scr-bar">
        <div className="scr-chips">
          {STATUS_FILTERS.map(([k, label]) => (
            <button key={k} type="button" className={status === k ? "on" : ""} onClick={() => setStatus(k)}>{label} <span>{count(k)}</span></button>
          ))}
        </div>
        <select aria-label="סינון לפי תחום" value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="all">כל התחומים</option>
          {themes.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
        </select>
        <input type="search" aria-label="חיפוש לפי סימול או שם" placeholder="חיפוש סימול או שם" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="table-scroll scr-scroll">
        <table className="compact wide rank">
          <thead>
            <tr>
              {columns.map(([label, key]) => (
                <th key={label} className={key ? "scr-sort" : ""} aria-sort={sort.key === key && key ? (sort.up ? "ascending" : "descending") : undefined}>
                  {key ? <button type="button" onClick={() => by(key)}>{label}{sort.key === key ? (sort.up ? " ▲" : " ▼") : ""}</button> : label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <ExpandRow key={r.symbol} colSpan={columns.length} className={r.chosen ? "chosen" : ""} cells={r.cells}>
                {r.details}
              </ExpandRow>
            ))}
            {shown.length === 0 && <tr><td colSpan={columns.length} className="label">אין ניירות שמתאימים לסינון.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

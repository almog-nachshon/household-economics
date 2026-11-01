"use client";
import { useEffect, useState } from "react";

const RANGES = [["5d", "שבוע"], ["1mo", "חודש"], ["1y", "שנה"]];
const SINCE = { "5d": "בשבוע האחרון", "1mo": "בחודש האחרון", "1y": "בשנה האחרונה" };
const CUR = { USD: "$", GBP: "£", EUR: "€", ILS: "₪" };
const UP = "#0f9d58";
const DOWN = "#d93025";
const IL = { timeZone: "Asia/Jerusalem" };

// The price over the last week (default), month or year from /api/chart, like a trading app: green when the range
// ended above where it started (the close before it), red when below, a dashed line at that start, a tick per trading
// day, and a crosshair with the price and time under the pointer or finger. Points are evenly spaced, so nights and
// weekends leave no gaps.
export default function PriceChart({ symbol }) {
  const [range, setRange] = useState("5d");
  const [data, setData] = useState({});
  const [hover, setHover] = useState(null);
  useEffect(() => {
    if (data[range]) return;
    let gone = false;
    fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then((r) => r.json())
      .then((d) => !gone && setData((x) => ({ ...x, [range]: d })))
      .catch(() => !gone && setData((x) => ({ ...x, [range]: { error: "network" } })));
    return () => {
      gone = true;
    };
  }, [symbol, range, data]);

  const d = data[range];
  const pts = d?.points ?? [];
  const tabs = (
    <div className="pc-tabs" role="tablist">
      {RANGES.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={range === k} className={range === k ? "on" : ""} onClick={() => (setRange(k), setHover(null))}>
          {label}
        </button>
      ))}
    </div>
  );
  if (!d) return <div className="pc">{tabs}<div className="pc-empty">טוען גרף…</div></div>;
  if (d.error || pts.length < 2) return <div className="pc">{tabs}<div className="pc-empty">אין נתוני גרף כרגע</div></div>;

  const W = 640, H = 190, L = 6, R = 58, T = 8, B = 22;
  const base = d.prev ?? pts[0][1];
  const values = pts.map(([, c]) => c).concat(base);
  const lo = Math.min(...values), hi = Math.max(...values);
  const x = (i) => L + (i / (pts.length - 1)) * (W - L - R);
  const y = (c) => T + (1 - (c - lo) / (hi - lo || 1)) * (H - T - B);
  const last = pts[pts.length - 1][1];
  const color = last >= base ? UP : DOWN;
  const line = pts.map(([, c], i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(" ");
  const cur = CUR[d.currency] ?? "";
  const fmt = (c) => `${cur}${c.toLocaleString("en-US", { minimumFractionDigits: c >= 1000 ? 0 : 2, maximumFractionDigits: c >= 1000 ? 0 : 2 })}`;
  const chg = (c) => {
    const r = c / base - 1;
    return <span className={r >= 0 ? "pos" : "neg"}>{r >= 0 ? "▲" : "▼"} {Math.abs(r * 100).toFixed(2)}%</span>;
  };
  const daily = range === "1y";
  const when = (t) => new Date(t * 1000).toLocaleString("he-IL", daily ? { ...IL, day: "numeric", month: "numeric", year: "2-digit" } : { ...IL, weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  // A tick where a new trading day (week view), week (month view) or month (year view) starts.
  const key = (t) => {
    const dt = new Date(t * 1000);
    if (range === "5d") return dt.toLocaleDateString("en-CA", IL);
    if (range === "1mo") return `${dt.toLocaleDateString("en-CA", IL).slice(0, 8)}${Math.floor((dt.getUTCDate() - 1) / 7)}`;
    return dt.toLocaleDateString("en-CA", IL).slice(0, 7);
  };
  const ticks = pts.map(([t], i) => (i === 0 || key(t) !== key(pts[i - 1][0]) ? i : null)).filter((i) => i != null);
  const tickLabel = (t) => new Date(t * 1000).toLocaleDateString("he-IL", range === "5d" ? { ...IL, weekday: "short", day: "numeric", month: "numeric" } : range === "1mo" ? { ...IL, day: "numeric", month: "numeric" } : { ...IL, month: "short" });
  const levels = [hi, (hi + lo) / 2, lo];
  const point = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((px - L) / (W - L - R)) * (pts.length - 1)))));
  };
  const h = hover != null ? pts[hover] : null;

  return (
    <div className="pc">
      {tabs}
      <div className="pc-head" dir="rtl">
        {h ? (
          <>
            <b dir="ltr">{fmt(h[1])}</b> {chg(h[1])} <span className="label">{when(h[0])}</span>
          </>
        ) : (
          <>
            <b dir="ltr">{fmt(last)}</b> {chg(last)} <span className="label">{SINCE[range]} · מ-{fmt(base)}</span>
          </>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="pc-svg" dir="ltr" onPointerMove={point} onPointerDown={point} onPointerLeave={() => setHover(null)} role="img" aria-label={`גרף מחיר של ${symbol}`}>
        {levels.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#edf1f3" />
            <text x={W - R + 6} y={y(v) + 4} fontSize="11" fill="#6b7a81">{fmt(v)}</text>
          </g>
        ))}
        {ticks.map((i) => (
          <g key={i}>
            {i > 0 && <line x1={x(i)} x2={x(i)} y1={T} y2={H - B} stroke="#edf1f3" />}
            <text x={x(i) + 3} y={H - 6} fontSize="10.5" fill="#6b7a81">{tickLabel(pts[i][0])}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(base)} y2={y(base)} stroke="#9aa5ad" strokeDasharray="4 4" />
        <path d={`${line} L${x(pts.length - 1).toFixed(1)},${H - B} L${L},${H - B} Z`} fill={color} opacity="0.1" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {h && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#17262c" strokeOpacity="0.35" />
            <circle cx={x(hover)} cy={y(h[1])} r="4.5" fill={color} stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>
    </div>
  );
}

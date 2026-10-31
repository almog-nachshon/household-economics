"use client";
import { useEffect, useRef, useState } from "react";
import { useLiveQuotes } from "@/components/Live";

// The portfolio as a heat map, like Finviz's market map: each holding a tile sized by its share of the account,
// grouped by theme (bucket) under a header in the theme's color, and colored on a diverging scale (red down, gray
// flat, green up): a small move (up to +2% / down to -1.5%) is a faint greenish / reddish gray, a bigger one a bright,
// strong color. mode "today": today's change, live from the surrounding LiveQuotes (else the last daily close).
// mode "profit": the user's own profit or loss since buying. Hover shows the
// details. groups: [{key, name, color, rows: [{symbol, name, type, value, change, pct, profitPct, profitText,
// valueText}]}]; cash is a plain gray group.
// The map's drawing size: wide on a computer, nearly square on a phone so the tiles keep readable text.
const WIDE = { W: 900, H: 440 };
const NARROW = { W: 420, H: 460 };
const HEAD = 20;
const GAP = 2;
// Where a move stops being "small" (the user's thresholds), and the move at which the color is at its strongest.
const UP = 0.02;
const DOWN = 0.015;

const mix = (a, b, t) => {
  const [p, q] = [a, b].map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
  return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * t)).join(",")})`;
};
const NEUTRAL = "#7d8a90";
const GREEN = "#12b347";
const RED = "#e5132a";
// Small: 15-40% of the way from gray to the color; past the threshold: 70% rising to the full color at twice it.
function tileColor(chg) {
  if (chg == null || Math.abs(chg) < 0.0005) return NEUTRAL;
  const limit = chg > 0 ? UP : DOWN;
  const a = Math.abs(chg);
  const t = a <= limit ? 0.15 + 0.25 * (a / limit) : 0.7 + 0.3 * Math.min(1, (a - limit) / limit);
  return mix(NEUTRAL, chg > 0 ? GREEN : RED, t);
}
const signed = (x, d = 2) => (x == null ? "—" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);

// Squarified treemap of `nodes` ({value}) in the rectangle, laid out right to left for Hebrew.
function squarify(nodes, { x, y, w, h }) {
  const out = [];
  const total = nodes.reduce((t, n) => t + n.value, 0);
  if (!total || w <= 0 || h <= 0) return out;
  const scale = (w * h) / total;
  let rest = [...nodes].sort((a, b) => b.value - a.value).map((n) => ({ ...n, area: n.value * scale }));
  let [cx, cy, cw, ch] = [0, 0, w, h];
  while (rest.length) {
    const side = Math.min(cw, ch);
    const worst = (row) => {
      const s = row.reduce((t, n) => t + n.area, 0);
      const [mx, mn] = [Math.max(...row.map((n) => n.area)), Math.min(...row.map((n) => n.area))];
      return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
    };
    const row = [rest[0]];
    while (row.length < rest.length && worst([...row, rest[row.length]]) <= worst(row)) row.push(rest[row.length]);
    const s = row.reduce((t, n) => t + n.area, 0);
    if (cw >= ch) {
      const colW = s / ch;
      let yy = cy;
      for (const n of row) out.push({ ...n, x: cx, y: yy, w: colW, h: n.area / colW }), (yy += n.area / colW);
      cx += colW;
      cw -= colW;
    } else {
      const rowH = s / cw;
      let xx = cx;
      for (const n of row) out.push({ ...n, x: xx, y: cy, w: n.area / rowH, h: rowH }), (xx += n.area / rowH);
      cy += rowH;
      ch -= rowH;
    }
    rest = rest.slice(row.length);
  }
  return out.map((n) => ({ ...n, x: x + (w - n.x - n.w), y: y + n.y }));
}

export default function HoldingsMap({ groups, mode = "today" }) {
  const metric = (r) => (mode === "profit" ? r.profitPct : r.change);
  const live = useLiveQuotes();
  // Details of one tile: follow the mouse on a computer; a tap pins them (a phone has no hover), and a second tap on the
  // same tile, the ✕, or a tap outside the map closes them.
  const [tip, setTip] = useState(null);
  const box = useRef(null);
  useEffect(() => {
    if (!tip?.pinned) return;
    const away = (e) => !box.current?.contains(e.target) && setTip(null);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [tip?.pinned]);
  const place = (e, t, g, pinned) => {
    const r = box.current.getBoundingClientRect();
    return { t, g, pinned, left: e.clientX - r.left, top: e.clientY - r.top };
  };
  const [{ W, H }, setSize] = useState(WIDE);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const pick = () => setSize(mq.matches ? NARROW : WIDE);
    pick();
    mq.addEventListener("change", pick);
    return () => mq.removeEventListener("change", pick);
  }, []);
  const withLive = groups.map((g) => ({
    ...g,
    rows: g.rows.map((r) => ({ ...r, change: live[r.symbol]?.change ?? r.change })),
    value: g.rows.reduce((t, r) => t + r.value, 0),
  })).filter((g) => g.value > 0);
  // Drawn sizes have a floor so a small holding stays readable: a group at least 7% of the map, a holding at least 14% of
  // its group. The numbers shown are always the real ones.
  const total = withLive.reduce((t, g) => t + g.value, 0);
  const boxes = squarify(withLive.map((g) => ({ ...g, real: g.value, value: Math.max(g.value, total * 0.07) })), { x: 0, y: 0, w: W, h: H });

  return (
    <div className="hmap" ref={box} onMouseLeave={() => !tip?.pinned && setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`מפת התיק: גודל לפי חלק מהחשבון, צבע לפי ${mode === "profit" ? "הרווח מאז הקנייה" : "השינוי היום"}`}>
        {boxes.map((g) => {
          const inner = { x: g.x + GAP, y: g.y + HEAD, w: g.w - 2 * GAP, h: g.h - HEAD - GAP };
          const tiles = squarify(g.rows.map((r) => ({ ...r, value: Math.max(r.value, g.real * 0.14) })), inner);
          return (
            <g key={g.key}>
              <rect x={g.x + 1} y={g.y + 1} width={g.w - 2} height={g.h - 2} rx={4} fill={g.key === "cash" ? "#eef2f3" : g.color} />
              <text x={g.x + g.w - 6} y={g.y + 14} fill={g.key === "cash" ? "#3d4a50" : g.ink ?? "#fff"} fontSize={12} fontWeight={700} textAnchor="start" direction="rtl">
                {g.w > 70 ? `${g.name} ${Math.round(g.pct)}%` : `${Math.round(g.pct)}%`}
              </text>
              {tiles.map((t) => {
                const fs = Math.max(9, Math.min(28, t.w / Math.max(3, t.symbol.length * 0.75), t.h / 2.6));
                const cash = g.key === "cash";
                return (
                  <g
                    key={t.symbol}
                    onMouseMove={(e) => e.pointerType !== "touch" && !tip?.pinned && setTip(place(e, t, g, false))}
                    onClick={(e) => setTip(tip?.pinned && tip.t.symbol === t.symbol ? null : place(e, t, g, true))}
                  >
                    <rect x={t.x + 1} y={t.y + 1} width={Math.max(0, t.w - 2)} height={Math.max(0, t.h - 2)} rx={3} fill={cash ? "#c9d2d6" : tileColor(metric(t))} />
                    {/* too narrow for the name across: write it upward along the tile */}
                    {t.w <= 30 && t.w > 12 && t.h > 40 && (
                      <text x={t.x + t.w / 2} y={t.y + t.h / 2} transform={`rotate(-90 ${t.x + t.w / 2} ${t.y + t.h / 2})`} textAnchor="middle" dominantBaseline="central" fill={cash ? "#3d4a50" : "#fff"} fontWeight={700} fontSize={Math.max(9, Math.min(14, t.w * 0.55))}>
                        {t.symbol}
                      </text>
                    )}
                    {t.w > 30 && t.h > 18 && (
                      <text x={t.x + t.w / 2} y={t.y + t.h / 2} textAnchor="middle" fill={cash ? "#3d4a50" : "#fff"} fontWeight={700}>
                        <tspan x={t.x + t.w / 2} dy={t.h > fs * 2.4 ? -fs * 0.35 : fs * 0.35} fontSize={fs}>{t.symbol}</tspan>
                        {t.h > fs * 2.4 && <tspan x={t.x + t.w / 2} dy={fs * 1.05} fontSize={fs * 0.62} fontWeight={600}>{cash ? `${Math.round(t.pct)}%` : signed(metric(t), mode === "profit" ? 1 : 2)}</tspan>}
                        {!cash && mode === "profit" && t.h > fs * 3.6 && t.profitText && <tspan x={t.x + t.w / 2} dy={fs * 0.8} fontSize={fs * 0.5} fontWeight={500}>{t.profitText}</tspan>}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className={`hmap-tip${tip.pinned ? " pinned" : ""}`} style={{ left: tip.left, top: tip.top }}>
          {tip.pinned && <button type="button" className="hmap-close" aria-label="סגירה" onClick={() => setTip(null)}>✕</button>}
          <b>{tip.t.symbol}</b> <span className="label">{tip.t.name}</span>
          {tip.t.type && <div className="label">{tip.t.type} · תחום: {tip.g.name}</div>}
          {tip.t.about && <div className="hmap-about">{tip.t.about}</div>}
          <div>{tip.t.valueText} · {tip.t.pct.toFixed(1)}% מהחשבון</div>
          {tip.g.key !== "cash" && (
            <>
              <div>היום: <b className={tip.t.change >= 0 ? "pos" : "neg"}>{signed(tip.t.change)}</b></div>
              {tip.t.profitPct != null && <div>מאז הקנייה: <b className={tip.t.profitPct >= 0 ? "pos" : "neg"}>{signed(tip.t.profitPct, 1)}</b>{tip.t.profitText ? ` (${tip.t.profitText})` : ""}</div>}
            </>
          )}
        </div>
      )}
      <div className="hmap-scale">
        <span>ירידה חזקה</span>
        <span className="hmap-ramp" />
        <span>עלייה חזקה</span>
        <span className="label">(עד ‎-1.5% / ‎+2% צבע חלש)</span>
        <span className="label">גודל = חלק מהחשבון · צבע = {mode === "profit" ? "הרווח / ההפסד שלי מאז הקנייה" : "השינוי היום"}</span>
      </div>
    </div>
  );
}

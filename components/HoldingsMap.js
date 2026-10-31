"use client";
import { useState } from "react";
import { useLiveQuotes } from "@/components/Live";

// The portfolio as a heat map, like Finviz's market map: each holding a tile sized by its share of the account,
// grouped by theme (bucket) under a header in the theme's color, and colored by today's change on a diverging scale
// (red down, gray flat, green up, full color at ±3%). Live changes come from the surrounding LiveQuotes; otherwise the
// last daily close. Hover shows the details. groups: [{key, name, color, rows: [{symbol, name, type, value, change,
// pct, profitPct, valueText}]}]; cash is a plain gray group.
const W = 900;
const H = 440;
const HEAD = 20;
const GAP = 2;
const FULL = 0.03;

const mix = (a, b, t) => {
  const [p, q] = [a, b].map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
  return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * t)).join(",")})`;
};
const NEUTRAL = "#7d8a90";
const tileColor = (chg) => (chg == null ? NEUTRAL : mix(NEUTRAL, chg >= 0 ? "#1e8e3e" : "#d93025", Math.min(1, Math.abs(chg) / FULL)));
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

export default function HoldingsMap({ groups }) {
  const live = useLiveQuotes();
  const [tip, setTip] = useState(null);
  const withLive = groups.map((g) => ({
    ...g,
    rows: g.rows.map((r) => ({ ...r, change: live[r.symbol]?.change ?? r.change })),
    value: g.rows.reduce((t, r) => t + r.value, 0),
  })).filter((g) => g.value > 0);
  const boxes = squarify(withLive, { x: 0, y: 0, w: W, h: H });

  return (
    <div className="hmap" onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="מפת התיק: גודל לפי חלק מהחשבון, צבע לפי השינוי היום">
        {boxes.map((g) => {
          const inner = { x: g.x + GAP, y: g.y + HEAD, w: g.w - 2 * GAP, h: g.h - HEAD - GAP };
          const tiles = squarify(g.rows, inner);
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
                    onMouseMove={(e) => {
                      const r = e.currentTarget.ownerSVGElement.parentNode.getBoundingClientRect();
                      setTip({ t, g, left: e.clientX - r.left, top: e.clientY - r.top });
                    }}
                  >
                    <rect x={t.x + 1} y={t.y + 1} width={Math.max(0, t.w - 2)} height={Math.max(0, t.h - 2)} rx={3} fill={cash ? "#c9d2d6" : tileColor(t.change)} />
                    {t.w > 30 && t.h > 18 && (
                      <text x={t.x + t.w / 2} y={t.y + t.h / 2} textAnchor="middle" fill={cash ? "#3d4a50" : "#fff"} fontWeight={700}>
                        <tspan x={t.x + t.w / 2} dy={t.h > fs * 2.4 ? -fs * 0.35 : fs * 0.35} fontSize={fs}>{t.symbol}</tspan>
                        {t.h > fs * 2.4 && <tspan x={t.x + t.w / 2} dy={fs * 1.05} fontSize={fs * 0.62} fontWeight={600}>{cash ? `${Math.round(t.pct)}%` : signed(t.change)}</tspan>}
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
        <div className="hmap-tip" style={{ left: tip.left, top: tip.top }}>
          <b>{tip.t.symbol}</b> <span className="label">{tip.t.name}</span>
          {tip.t.type && <div className="label">{tip.t.type} · תחום: {tip.g.name}</div>}
          {tip.t.about && <div className="hmap-about">{tip.t.about}</div>}
          <div>{tip.t.valueText} · {tip.t.pct.toFixed(1)}% מהחשבון</div>
          {tip.g.key !== "cash" && (
            <>
              <div>היום: <b className={tip.t.change >= 0 ? "pos" : "neg"}>{signed(tip.t.change)}</b></div>
              {tip.t.profitPct != null && <div>מאז הקנייה: <b className={tip.t.profitPct >= 0 ? "pos" : "neg"}>{signed(tip.t.profitPct, 1)}</b></div>}
            </>
          )}
        </div>
      )}
      <div className="hmap-scale">
        <span>-3%</span>
        <span className="hmap-ramp" />
        <span>+3%</span>
        <span className="label">גודל = חלק מהחשבון · צבע = השינוי היום</span>
      </div>
    </div>
  );
}

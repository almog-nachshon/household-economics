"use client";
import { useEffect, useRef, useState } from "react";
import { flowLayout } from "@/lib/maps";
import { PIE } from "@/components/Charts";

// Where the month's money goes: a flow map from the income on the right to what it pays for on the left. Each width is
// the amount. Hovering or tapping a block or ribbon writes its numbers in the line under the map. The domains keep their
// colors from the "by domain" pie (components/Charts.js), and every block is named, so identity is never color alone.
const colorOf = (n) => (n.kind === "invest" ? PIE[4] : n.kind === "left" ? "#1e8e3e" : n.kind === "short" ? "var(--neg)" : n.kind === "hub" ? "var(--muted)" : n.slot != null ? PIE[n.slot] : "var(--accent)");
const ils = (n) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

export default function MoneyFlow({ flow }) {
  const ref = useRef(null);
  const [W, setW] = useState(880);
  const [on, setOn] = useState(null);
  useEffect(() => {
    const measure = () => ref.current && setW(Math.max(280, ref.current.clientWidth));
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(ref.current);
    return () => seen.disconnect();
  }, []);
  const narrow = W < 520;
  const side = narrow ? 84 : 175;
  const rows = Math.max(flow.sources.length, flow.outs.length);
  const H = Math.max(narrow ? 240 : 260, rows * 58);
  const { nodes, links } = flowLayout(flow, { W, H, side });
  // On a phone the "expenses of" prefix goes first; then the end of a long name goes, on any screen. The line under the
  // map has it in full.
  const short = (s) => {
    const t = narrow ? s.replace(/^הוצאות /, "") : s;
    const most = narrow ? 11 : 22;
    return t.length > most ? `${t.slice(0, most - 1)}…` : t;
  };
  const pct = (v) => `${Math.round((v / flow.total) * 100)}%`;
  const hit = (id, text) => ({ onPointerEnter: () => setOn({ id, text }), onPointerLeave: () => setOn(null), onClick: () => setOn({ id, text }) });
  const nodeText = (n) => `${n.name}: ${ils(n.value)} (${pct(n.value)} מהסך)`;
  // A ribbon is named by its side that is not the middle bar or the only source.
  const linkText = (l) => {
    const n = l.to.side === "left" ? l.to : l.from;
    return `${n.name}: ${ils(l.value)} (${pct(l.value)} מהסך)`;
  };
  const dim = (id) => (on && on.id !== id ? 0.45 : 1);

  return (
    <div ref={ref} className="flow">
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="זרימת הכסף החודשית מההכנסות אל ההוצאות, ההשקעה ומה שנשאר">
        {links.map((l) => {
          const n = l.to.side === "left" ? l.to : l.from;
          return <path key={l.id} d={l.path} fill={colorOf(n)} fillOpacity={on?.id === l.id ? 0.55 : 0.28} {...hit(l.id, linkText(l))} />;
        })}
        {nodes.map((n) => (
          <g key={n.id} opacity={dim(n.id)} {...hit(n.id, nodeText(n))}>
            <title>{nodeText(n)}</title>
            <rect x={n.x} y={n.y} width={12} height={n.h} rx={3} fill={colorOf(n)} />
            {n.side !== "middle" && (
              <text x={n.side === "right" ? n.x + 18 : n.x - 6} y={n.y + n.h / 2} textAnchor={n.side === "right" ? "end" : "start"} className="flow-text">
                <tspan x={n.side === "right" ? n.x + 18 : n.x - 6} dy="-0.2em" className="flow-name">{short(n.name)}</tspan>
                <tspan x={n.side === "right" ? n.x + 18 : n.x - 6} dy="1.2em" className="flow-value">{ils(n.value)}</tspan>
              </text>
            )}
          </g>
        ))}
      </svg>
      <p className="label flow-line">
        {on ? on.text : <>הכנסה {ils(flow.income)} · הוצאות קבועות {ils(flow.fixedTotal)} ({pct(flow.fixedTotal)}) · {flow.short > 0 ? <b className="neg">חסר {ils(flow.short)}</b> : <>נשאר {ils(flow.left)}</>}</>}
      </p>
    </div>
  );
}

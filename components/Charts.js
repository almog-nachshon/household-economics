"use client";
import { Fragment } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

// Turquoise-led palette for pie slices; the "left over" slice is always green.
const PIE = ["#0fa3a3", "#3b82c4", "#f2a541", "#e0607e", "#8e6fd1", "#5bb98c", "#c98a4b", "#7a8b99", "#2bb3d6", "#d1495b", "#a3b18a", "#6d597a"];
const ils0 = (n) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

// Donut with the total in the middle and an HTML legend (name, amount, %) beside it.
export function SplitPie({ data, centerLabel = "סה״כ" }) {
  const total = data.reduce((t, d) => t + d.value, 0);
  const color = (d, i) => d.color || PIE[i % PIE.length];
  return (
    <div className="pie">
      <div className="pie-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="95%" paddingAngle={1.5} stroke="none" isAnimationActive={false}>
              {data.map((d, i) => <Cell key={d.name} fill={color(d, i)} />)}
            </Pie>
            <Tooltip formatter={(v, n) => [`${ils0(v)} (${((v / total) * 100).toFixed(1)}%)`, n]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pie-center">
          <div className="label">{centerLabel}</div>
          <b>{ils0(total)}</b>
        </div>
      </div>
      <ul className="pie-legend">
        {data.map((d, i) => (
          <li key={d.name}>
            <span className="dot" style={{ background: color(d, i) }} />
            <span className="name">{d.name}</span>
            <span className="amount">{ils0(d.value)}</span>
            <span className="share">{((d.value / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The portfolio as a two-ring donut: themes (buckets) inside, each holding outside in its theme's color, cash in gray;
// % of the whole account. Beside it a legend table grouped by theme (share vs target), so identity is never color
// alone. groups: [{key, name, color, value, pct, target, valueText, rows: [{symbol, name, value, pct, valueText}]}].
export function HoldingsPie({ groups, totalText }) {
  const inner = groups.filter((g) => g.value > 0);
  const outer = inner.flatMap((g) => g.rows.map((r) => ({ ...r, color: g.color, group: g.name })));
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="pie-tip">
        <b>{d.symbol ?? d.name}</b>
        {d.symbol && <div className="label">{d.name}</div>}
        <div>{d.valueText} · {d.pct.toFixed(1)}%</div>
      </div>
    );
  };
  const pctLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, payload }) => {
    if (payload.pct < 6) return null;
    const r = (innerRadius + outerRadius) / 2;
    const a = (-midAngle * Math.PI) / 180;
    return <text x={cx + r * Math.cos(a)} y={cy + r * Math.sin(a)} fill="#fff" fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="central">{Math.round(payload.pct)}%</text>;
  };
  return (
    <div className="hpie">
      <div className="hpie-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={inner} dataKey="value" nameKey="name" innerRadius="36%" outerRadius="58%" stroke="#fff" strokeWidth={2} isAnimationActive={false}>
              {inner.map((g) => <Cell key={g.key} fill={g.color} />)}
            </Pie>
            <Pie data={outer} dataKey="value" nameKey="symbol" innerRadius="62%" outerRadius="96%" stroke="#fff" strokeWidth={2} isAnimationActive={false} label={pctLabel} labelLine={false}>
              {outer.map((r) => <Cell key={r.symbol} fill={r.color} />)}
            </Pie>
            <Tooltip content={<Tip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pie-center">
          <div className="label">סה״כ בחשבון</div>
          <b>{totalText}</b>
        </div>
      </div>
      <table className="hpie-legend">
        <tbody>
          {inner.map((g) => (
            <Fragment key={g.key}>
              <tr className="hpie-group">
                <td><span className="swatch" style={{ background: g.color }} /> {g.name}</td>
                <td><b>{g.pct.toFixed(1)}%</b></td>
                <td className="label">{g.target != null ? `יעד ${Math.round(g.target)}%` : ""}</td>
                <td>{g.valueText}</td>
              </tr>
              {g.rows.length > 1 || g.rows[0]?.symbol !== g.name
                ? g.rows.map((r) => (
                    <tr key={r.symbol} className="hpie-row">
                      <td><b>{r.symbol}</b> <span className="label">{r.name}</span></td>
                      <td>{r.pct.toFixed(1)}%</td>
                      <td><div className="meter thin"><div style={{ width: `${Math.min(100, r.pct * 3)}%`, background: g.color }} /></div></td>
                      <td>{r.valueText}</td>
                    </tr>
                  ))
                : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

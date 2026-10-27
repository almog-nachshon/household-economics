"use client";
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

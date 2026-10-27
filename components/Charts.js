"use client";
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine } from "recharts";

const fmt = (n) => `${Math.round(n / 1000)}K`;

export function CashflowChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" reversed />
        <YAxis tickFormatter={fmt} orientation="right" />
        <Tooltip formatter={(v) => v.toLocaleString("he-IL")} />
        <Legend />
        <Bar dataKey="income" name="הכנסות" fill="#1e8e3e" />
        <Bar dataKey="expenses" name="הוצאות" fill="#d93025" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BalanceChart({ data, lines, target }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ left: 8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" reversed />
        <YAxis tickFormatter={fmt} orientation="right" />
        <Tooltip formatter={(v) => Math.round(v).toLocaleString("he-IL")} />
        <Legend />
        {target && <ReferenceLine y={target} stroke="#888" strokeDasharray="4 4" label="יעד" />}
        {lines.map((l) => (
          <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// Turquoise-led palette for pie slices; the "left over" slice is always green.
const PIE = ["#0fa3a3", "#3b82c4", "#f2a541", "#e0607e", "#8e6fd1", "#5bb98c", "#c98a4b", "#7a8b99", "#2bb3d6", "#d1495b", "#a3b18a", "#6d597a"];
const ils0 = (n) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

export function SplitPie({ data }) {
  const total = data.reduce((t, d) => t + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="80%" paddingAngle={1}
          label={({ percent }) => (percent >= 0.04 ? `${Math.round(percent * 100)}%` : "")} labelLine={false}>
          {data.map((d, i) => <Cell key={d.name} fill={d.color || PIE[i % PIE.length]} />)}
        </Pie>
        <Tooltip formatter={(v, n) => [`${ils0(v)} (${((v / total) * 100).toFixed(1)}%)`, n]} />
        <Legend layout="horizontal" verticalAlign="bottom" formatter={(n, e) => `${n} ${ils0(e.payload.value)}`} />
      </PieChart>
    </ResponsiveContainer>
  );
}

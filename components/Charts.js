"use client";
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine } from "recharts";

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

"use client";
import { Fragment } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, ComposedChart, Area, Line, XAxis, YAxis, ReferenceLine, CartesianGrid } from "recharts";
import Info from "@/components/Info";

// Turquoise-led palette for pie slices; the "left over" slice is always green.
// The first five and the "left over" green pass the dataviz validator in both themes.
export const PIE = ["#0fa3a3", "#2563eb", "#d97706", "#d6457a", "#6d5bd0", "#5bb98c", "#c98a4b", "#7a8b99", "#2bb3d6", "#d1495b", "#a3b18a", "#6d597a"];
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
// alone. groups: [{key, name, color, value, pct, target, valueText, rows: [{symbol, name, type, about, value, pct, valueText}]}].
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
                      <td><b>{r.symbol}</b> <span className="label">{r.name}</span>{r.type && <span className="xtag hpie-type">{r.type}</span>} <Info text={r.about} /></td>
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

// What the account really holds, in three rings that line up: theme, holding, and what is inside each fund. Beside it
// the companies by their true share of the account, directly and through the funds, against the single-stock limit.
// rings, ranking: lib/maps.js.
export function ExposureMap({ rings, ranking, totalText, heavy, asOf }) {
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="pie-tip">
        <b>{d.title}</b>
        {d.sub && <div className="label">{d.sub}</div>}
        <div>{d.text} · {d.pct.toFixed(1)}%</div>
      </div>
    );
  };
  const symbolLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, payload }) => {
    if (payload.pct < 8) return null;
    const r = (innerRadius + outerRadius) / 2;
    const a = (-midAngle * Math.PI) / 180;
    return <text x={cx + r * Math.cos(a)} y={cy + r * Math.sin(a)} fill={payload.ink ?? "#1f2a30"} fontSize={10} fontWeight={700} textAnchor="middle" dominantBaseline="central">{payload.title.replace(/\.L$/, "")}</text>;
  };
  const ring = { dataKey: "value", nameKey: "title", startAngle: 90, endAngle: -270, stroke: "var(--card)", strokeWidth: 1.5, isAnimationActive: false };
  return (
    <div className="xp">
      <div>
        <div className="hpie-chart">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie {...ring} data={rings.themes} innerRadius="30%" outerRadius="50%">
                {rings.themes.map((d) => <Cell key={d.id} fill={d.color} />)}
              </Pie>
              <Pie {...ring} data={rings.holdings} innerRadius="52%" outerRadius="74%" label={symbolLabel} labelLine={false}>
                {rings.holdings.map((d) => <Cell key={d.id} fill={d.color} />)}
              </Pie>
              <Pie {...ring} data={rings.parts} innerRadius="76%" outerRadius="97%">
                {rings.parts.map((d) => <Cell key={d.id} fill={d.color} fillOpacity={d.opacity} />)}
              </Pie>
              <Tooltip content={<Tip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pie-center">
            <div className="label">סה״כ</div>
            <b className="xp-total">{totalText}</b>
          </div>
        </div>
        <ul className="xp-legend">
          {rings.themes.map((d) => (
            <li key={d.id}><span className="swatch" style={{ background: d.color }} /> {d.title} <b>{d.pct.toFixed(0)}%</b></li>
          ))}
        </ul>
      </div>
      <div className="table-scroll">
        <table className="compact xp-rank">
          <thead><tr><th>חברה</th><th>% מהחשבון</th><th>ישירות</th><th>דרך קרנות</th></tr></thead>
          <tbody>
            {ranking.map((r) => (
              <tr key={r.symbol}>
                <td><b>{r.symbol}</b>{r.heavy && <span className="xp-heavy"> מעל {heavy}%</span>}</td>
                <td>
                  <div className="xp-bar">
                  <span className="xp-pct">{r.pct.toFixed(1)}%</span>
                  <div className="meter thin xp-meter"><div style={{ width: `${Math.min(100, (r.pct / heavy) * 100)}%`, background: r.heavy ? "var(--warn)" : undefined }} /></div>
                  </div>
                </td>
                <td className="label">{r.direct || "-"}</td>
                <td className="label">{r.via || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="label xp-note">הפס נמדד מול המגבלה: {heavy}% מהחשבון למניה בודדת. משקלי המניות בקרנות {asOf ? `מ-${asOf.split("-").reverse().join(".")}` : "מהמחקר"}, ורק למניות שהאתר עוקב אחריהן, לכן ״שאר הקרן״ בטבעת החיצונית הוא כל מה שלא פורט.</p>
      </div>
    </div>
  );
}

// The home goal over time: the band between the low and high portfolio returns, the middle return as a line, and the
// amount needed. One axis; the time runs left to right like the price charts. data: goalRange in lib/maps.js.
export function GoalRange({ data, required, returns }) {
  const k = (v) => `₪${Math.round(v / 1000).toLocaleString("en-US")}K`;
  const Tip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="pie-tip">
        <b>{label}</b>
        <div>{returns[2]}% בשנה: {ils0(d.high)}</div>
        <div><b>{returns[1]}% בשנה: {ils0(d.mid)}</b></div>
        <div>{returns[0]}% בשנה: {ils0(d.low)}</div>
        <div className="label">נדרש: {ils0(required)}</div>
      </div>
    );
  };
  const end = data[data.length - 1];
  const top = Math.ceil((Math.max(required, end.high) * 1.04) / 100000) * 100000;
  return (
    <div className="goal-range">
      <div className="goal-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid vertical={false} stroke="var(--track)" />
            <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={44} tick={{ fontSize: 12, fill: "var(--muted)" }} tickLine={false} axisLine={{ stroke: "var(--track)" }} />
            <YAxis domain={[0, top]} tickFormatter={k} width={68} orientation="left" tick={{ fontSize: 12, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
            <Area dataKey="range" stroke="none" fill="var(--accent)" fillOpacity={0.18} isAnimationActive={false} activeDot={false} />
            <Line dataKey="mid" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <ReferenceLine y={required} stroke="var(--text)" strokeDasharray="4 4" label={{ value: `⁦${k(required)}⁩ נדרש`, position: "insideBottomLeft", fontSize: 12, fill: "var(--text)" }} />
            <Tooltip content={<Tip />} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="goal-ends">
        {[["low", 0], ["mid", 1], ["high", 2]].map(([key, i]) => {
          const gap = end[key] - required;
          return (
            <div key={key}>
              <div className="label">{returns[i]}% בשנה{i === 1 ? " (ההנחה)" : ""}</div>
              <b>{ils0(end[key])}</b>
              <div className={gap >= 0 ? "pos" : "neg"}>{gap >= 0 ? `מעל ב-${ils0(gap)}` : `חסר ${ils0(-gap)}`}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

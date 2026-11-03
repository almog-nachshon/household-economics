import { project, projectPortfolio } from "./funds.js";

// The numbers behind the three maps: where the month's money goes, what the account really holds, and the range of
// the home goal. Pure, so they run in the tests (lib/maps.test.mjs); every total is the one the pages already show.

// Income sources into what they pay for: the fixed costs per domain (items from fixedItems, where the card bill counts
// only what is not detailed elsewhere), the monthly investment, and what is left. When the costs pass the income, the
// missing part is a source of its own, so both sides always add up. `slot` is the domain's place among those with
// money, which is its color in the "by domain" pie beside the map.
export function moneyFlow({ incomes, income, domains, items, monthlyInvest }) {
  const lines = incomes.filter((i) => !i.month && i.amount > 0).map((i) => ({ id: `in${i.id}`, name: i.name, value: i.amount }));
  const sources = lines.length ? lines : income > 0 ? [{ id: "in", name: "הכנסה", value: income }] : [];
  const fixed = domains
    .map((d) => ({ id: d.key, name: d.name, value: items.filter((i) => i.domain === d.key).reduce((t, i) => t + i.amount, 0) }))
    .filter((d) => d.value > 0)
    .map((d, slot) => ({ ...d, slot }));
  const fixedTotal = fixed.reduce((t, d) => t + d.value, 0);
  const invest = monthlyInvest > 0 ? [{ id: "invest", name: "השקעה", value: monthlyInvest, kind: "invest" }] : [];
  const left = income - fixedTotal - (monthlyInvest > 0 ? monthlyInvest : 0);
  return {
    sources: left < 0 ? [...sources, { id: "short", name: "חסר בחודש", value: -left, kind: "short" }] : sources,
    outs: [...fixed, ...invest, ...(left > 0 ? [{ id: "left", name: "נשאר", value: left, kind: "left" }] : [])],
    income,
    fixedTotal,
    left: Math.max(0, left),
    short: Math.max(0, -left),
    total: income + Math.max(0, -left),
  };
}

// Where each block and ribbon of the money map sits. The money flows from right to left, for Hebrew: the sources on the
// right and what they pay for on the left, through one middle bar when there are several sources.
export function flowLayout({ sources, outs, total }, { W, H, side, bar = 12, gap = 28 }) {
  const rightX = W - side - bar;
  const leftX = side;
  const columns = sources.length > 1 ? [sources, [{ id: "hub", name: "סך הכול", value: total, kind: "hub" }], outs] : [sources, outs];
  const longest = Math.max(...columns.map((c) => c.length));
  const scale = (H - gap * (longest - 1)) / total;
  const nodes = columns.flatMap((column, c) => {
    const x = rightX - ((rightX - leftX) * c) / (columns.length - 1);
    const height = column.reduce((t, n) => t + Math.max(2, n.value * scale), 0) + gap * (column.length - 1);
    let y = (H - height) / 2;
    return column.map((n) => {
      const h = Math.max(2, n.value * scale);
      const placed = { ...n, x, y, h, column: c, side: c === 0 ? "right" : c === columns.length - 1 ? "left" : "middle" };
      y += h + gap;
      return placed;
    });
  });
  const inColumn = (c) => nodes.filter((n) => n.column === c);
  // Each pair of neighboring columns: the ribbons of the single side (the middle bar, or the only source) stack along it.
  const links = [];
  for (let c = 0; c < columns.length - 1; c++) {
    const [from, to] = [inColumn(c), inColumn(c + 1)];
    const many = from.length > to.length ? from : to;
    const one = many === from ? to[0] : from[0];
    let along = one.y;
    for (const n of many) {
      const w = (n.value / total) * one.h;
      const [a, b] = many === from ? [{ x: n.x, y: n.y, h: n.h, node: n }, { x: one.x + bar, y: along, h: w, node: one }] : [{ x: one.x, y: along, h: w, node: one }, { x: n.x + bar, y: n.y, h: n.h, node: n }];
      const [ax, bx] = many === from ? [a.x, b.x] : [a.x, b.x];
      const mid = (ax + bx) / 2;
      links.push({
        id: `${a.node.id}-${b.node.id}`, from: a.node, to: b.node, value: n.value,
        path: `M${ax} ${a.y}C${mid} ${a.y} ${mid} ${b.y} ${bx} ${b.y}L${bx} ${b.y + b.h}C${mid} ${b.y + b.h} ${mid} ${a.y + a.h} ${ax} ${a.y + a.h}Z`,
      });
      along += w;
    }
  }
  return { nodes, links };
}

// The account in three rings: theme, holding, and what is inside each fund. Every ring adds up to the whole account,
// so the rings line up. Inside a fund: the stocks the site follows (FUNDS[symbol].top, its weights) and the rest of it.
export function exposureRings(groups, funds, fmt) {
  const shown = groups.filter((g) => g.value > 0);
  const whole = shown.reduce((t, g) => t + g.value, 0);
  const share = (v) => (whole ? (v / whole) * 100 : 0);
  const themes = shown.map((g) => ({ id: g.key, title: g.name, value: g.value, pct: share(g.value), color: g.color, text: fmt(g.value) }));
  const holdings = shown.flatMap((g) =>
    g.rows.filter((r) => r.value > 0).map((r) => ({ id: r.symbol, title: r.symbol, sub: r.name, value: r.value, pct: share(r.value), color: g.color, ink: g.ink, text: fmt(r.value) })),
  );
  const parts = shown.flatMap((g) =>
    g.rows.filter((r) => r.value > 0).flatMap((r) => {
      const top = funds[r.symbol]?.top;
      const piece = (id, title, sub, value, opacity) => ({ id, title, sub, value, pct: share(value), color: g.color, opacity, text: fmt(value) });
      if (!top) return [piece(`${r.symbol}/self`, r.symbol, r.name, r.value, 0.5)];
      const inside = Object.entries(top).map(([s, w]) => [s, (r.value * w) / 100]).sort((x, y) => y[1] - x[1]);
      const rest = Math.max(0, r.value - inside.reduce((t, [, v]) => t + v, 0));
      return [
        ...inside.map(([s, v]) => piece(`${r.symbol}/${s}`, s, `בתוך ${r.symbol}`, v, 0.85)),
        piece(`${r.symbol}/rest`, "שאר הקרן", `${r.symbol}: מניות שהאתר לא עוקב אחריהן`, rest, 0.22),
      ];
    }),
  );
  return { themes, holdings, parts };
}

// The companies by how much of the account they really are, directly and through the funds (lookThrough in
// lib/overlap.js), with the single-stock limit.
export function exposureRanking(lt, fmt, heavy, count = 10) {
  return Object.values(lt)
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map((x) => ({
      symbol: x.symbol, pct: x.pct, direct: x.direct > 0 ? fmt(x.direct) : "", via: x.via > 0 ? fmt(x.via) : "", value: fmt(x.value),
      funds: x.parts.map((p) => p.fund), heavy: x.pct >= heavy,
    }));
}

// The home goal month by month under three yearly returns for the portfolio; only that return changes. The middle one
// is the 5% the page already assumes, so its last point is homeGoal's `projected` and its first is `current`.
export const GOAL_RETURNS = [0, 5, 10];

export function goalRange({ settings, homeSavings, kerens, monthlySaving, portfolioNow, today = new Date() }) {
  const target = settings.targetDate;
  const months = Math.max(0, (target.getFullYear() - today.getFullYear()) * 12 + target.getMonth() - today.getMonth());
  const forHome = kerens.filter((f) => f.forHome && f.liquidDate && f.liquidDate <= target);
  const points = [];
  for (let k = 0; k <= months; k++) {
    const at = k === 0 ? today : k === months ? target : new Date(today.getFullYear(), today.getMonth() + k, 1);
    const base = homeSavings + monthlySaving * k + forHome.reduce((t, f) => t + project(f, at).value, 0);
    const [low, mid, high] = GOAL_RETURNS.map((r) => base + projectPortfolio(portfolioNow, settings.monthlyInvest, k, r));
    points.push({ label: `${String(at.getMonth() + 1).padStart(2, "0")}/${String(at.getFullYear()).slice(2)}`, low, mid, high, range: [low, high] });
  }
  return points;
}

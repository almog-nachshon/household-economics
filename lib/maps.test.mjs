// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { moneyFlow, flowLayout, exposureRings, exposureRanking, goalRange } from "./maps.js";
import { project, projectPortfolio } from "./funds.js";

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg ?? ""} ${a} != ${b}`);
const sum = (list) => list.reduce((t, x) => t + x.value, 0);
const domains = [{ key: "housing", name: "משק בית" }, { key: "car", name: "רכב" }, { key: "current", name: "שוטף" }, { key: "loans", name: "הלוואות" }];
const items = [{ domain: "housing", amount: 6000 }, { domain: "housing", amount: 1000 }, { domain: "loans", amount: 1500 }];

test("money flow: both sides add up to the income, and a domain with nothing is left out", () => {
  const f = moneyFlow({ incomes: [{ id: 1, name: "שכר", amount: 12000 }, { id: 2, name: "שכר 2", amount: 8000 }, { id: 3, name: "מענק", amount: 9000, month: 3 }], income: 20000, domains, items, monthlyInvest: 2000 });
  near(sum(f.sources), 20000, "sources");
  near(sum(f.outs), 20000, "outs");
  assert.deepEqual(f.outs.map((o) => o.id), ["housing", "loans", "invest", "left"]);
  assert.deepEqual(f.outs.slice(0, 2).map((o) => o.slot), [0, 1], "the slots follow the pie, which skips empty domains");
  near(f.left, 9500);
  assert.equal(f.short, 0);
});

test("money flow: costs over the income show as a source of their own, with nothing left", () => {
  const f = moneyFlow({ incomes: [], income: 9000, domains, items, monthlyInvest: 2000 });
  assert.equal(f.sources[0].name, "הכנסה", "without income lines, the one number the page uses");
  near(f.short, 1500);
  near(sum(f.sources), sum(f.outs), "balanced");
  assert.ok(!f.outs.some((o) => o.id === "left"));
});

test("money flow: the blocks fit the map and the ribbons meet them", () => {
  for (const incomes of [[{ id: 1, name: "א", amount: 20000 }], [{ id: 1, name: "א", amount: 12000 }, { id: 2, name: "ב", amount: 8000 }]]) {
    const f = moneyFlow({ incomes, income: 20000, domains, items, monthlyInvest: 2000 });
    const { nodes, links } = flowLayout(f, { W: 400, H: 260, side: 90 });
    for (const n of nodes) {
      assert.ok(n.y >= -0.01 && n.y + n.h <= 260.01, `${n.name} is inside the height`);
      assert.ok(n.x >= 90 && n.x + 12 <= 310.01, `${n.name} is inside the width`);
    }
    assert.ok(links.every((l) => !l.path.includes("NaN")));
    assert.equal(links.length, incomes.length > 1 ? incomes.length + f.outs.length : f.outs.length);
    const [right, left] = [nodes.filter((n) => n.side === "right"), nodes.filter((n) => n.side === "left")];
    assert.ok(right[0].x > left[0].x, "the money flows right to left");
  }
});

test("look through: every ring adds up to the account, with the rest of each fund shown", () => {
  const funds = { "VUAA.L": { top: { NVDA: 8, GOOGL: 5 } } };
  const groups = [
    { key: "index", name: "מדדים", color: "#000", value: 1000, rows: [{ symbol: "VUAA.L", name: "S&P", value: 1000 }] },
    { key: "ai", name: "AI", color: "#111", value: 300, rows: [{ symbol: "NVDA", name: "NVIDIA", value: 300 }] },
    { key: "space", name: "חלל", color: "#222", value: 0, rows: [] },
    { key: "cash", name: "מזומן", color: "#333", value: 200, rows: [{ symbol: "מזומן", name: "מזומן", value: 200 }] },
  ];
  const r = exposureRings(groups, funds, String);
  for (const ring of [r.themes, r.holdings, r.parts]) near(sum(ring), 1500);
  assert.ok(!r.themes.some((t) => t.id === "space"), "an empty theme gets no slice");
  near(r.parts.find((p) => p.id === "VUAA.L/rest").value, 870, "fund minus the named stocks");
  near(r.parts.find((p) => p.id === "VUAA.L/NVDA").value, 80);
  near(sum(r.parts.slice(0, 3)), r.holdings[0].value, "a fund's parts line up with the fund");
});

test("look through: the ranking sorts by true share and flags the single-stock limit", () => {
  const lt = {
    NVDA: { symbol: "NVDA", direct: 300, via: 80, value: 380, pct: 25.3, parts: [{ fund: "VUAA.L" }] },
    GOOGL: { symbol: "GOOGL", direct: 0, via: 50, value: 50, pct: 3.3, parts: [{ fund: "VUAA.L" }] },
    NONE: { symbol: "NONE", direct: 0, via: 0, value: 0, pct: 0, parts: [] },
  };
  const rows = exposureRanking(lt, String, 20);
  assert.deepEqual(rows.map((x) => x.symbol), ["NVDA", "GOOGL"]);
  assert.deepEqual(rows.map((x) => x.heavy), [true, false]);
  assert.equal(rows[1].direct, "");
});

test("goal range: the first point is today's equity, the middle's last is the page's projection, in order", () => {
  const today = new Date(2026, 10, 3);
  const target = new Date(2030, 5, 1);
  const keren = { forHome: true, liquidDate: new Date(2028, 0, 1), balance: 100000, balanceDate: new Date(2026, 9, 1), returnPct: 6, feeBalancePct: 0.5, feeDepositPct: 0, employeeMonthly: 500, employerMonthly: 1000, severanceMonthly: 0 };
  const late = { ...keren, liquidDate: new Date(2032, 0, 1) };
  const settings = { targetDate: target, monthlyInvest: 1000 };
  const pts = goalRange({ settings, homeSavings: 50000, kerens: [keren, late], monthlySaving: 2000, portfolioNow: 40000, today });
  const months = 43;
  assert.equal(pts.length, months + 1);
  near(pts[0].mid, 50000 + project(keren, today).value + 40000, "today");
  near(pts[months].mid, 50000 + 2000 * months + project(keren, target).value + projectPortfolio(40000, 1000, months), "at the target");
  assert.ok(pts.every((p) => p.low <= p.mid && p.mid <= p.high));
  assert.deepEqual(pts[5].range, [pts[5].low, pts[5].high]);
  near(pts[0].low, pts[0].high, "the range starts from one number");
});

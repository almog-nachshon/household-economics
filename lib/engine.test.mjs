// Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { features, predict, rawGrade, published, confirmed, monthEnds, dataProblems, evaluate, MIN_BARS } from "./engine.js";
import { technicalsOf } from "./technicals.js";

const read = (f) => JSON.parse(fs.readFileSync(new URL(f, import.meta.url)));
const model = read("./engine-model.json");
const fx = read("./engine.fixture.json");
const bars = (rows) => rows.map(([t, o, h, l, c, v, a]) => ({ t, o, h, l, c, v, a }));
const spy = bars(fx.spy);
const NOW = Date.parse("2026-11-01T12:00:00Z");

// A made-up rising series, for the data checks.
const synth = (n, end = "2026-10-30") => {
  const out = [], d = new Date(`${end}T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const c = 100 + i * -0.05 + n * 0.05;
    out.unshift({ t: d.toISOString().slice(0, 10), o: c, h: c + 1, l: c - 1, c, v: 2e7, a: c });
    d.setUTCDate(d.getUTCDate() - 1);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
};

for (const k of fx.cases) {
  test(`features match the researched Python code: ${k.symbol}`, () => {
    const f = features(bars(k.bars), spy, bars(k.sectorBars));
    for (const [name, want] of Object.entries(k.features)) {
      if (want == null) continue;
      assert.ok(f[name] != null, `${name} is missing`);
      assert.ok(Math.abs(f[name] - want) <= 1e-6 * Math.max(1, Math.abs(want)), `${name}: ${f[name]} vs ${want}`);
    }
  });
}

test("no future data: changing bars after the grading month-end changes nothing", () => {
  // Graded in the middle of October, so the last month-end is September's and October's bars come after it.
  const k = fx.cases[0], b = bars(k.bars).filter((x) => x.t <= "2026-10-20"), sec = bars(k.sectorBars), now = Date.parse("2026-10-21T12:00:00Z");
  const a = evaluate({ symbol: k.symbol, kind: "stock", bars: b, spy, sector: sec, model, now });
  assert.equal(a.state, "graded");
  const i = b.findIndex((x) => x.t > a.asOf);
  assert.ok(i > 0, "the fixture has bars after the month-end");
  const later = b.map((x, j) => (j >= i ? { ...x, o: x.o * 3, h: x.h * 3, l: x.l * 3, c: x.c * 3, a: x.a * 3 } : x));
  const c = evaluate({ symbol: k.symbol, kind: "stock", bars: later, spy, sector: sec, model, now });
  assert.equal(c.score, a.score);
  assert.equal(c.raw, a.raw);
});

test("an unfinished month is not a month-end", () => {
  const b = [{ t: "2026-09-30" }, { t: "2026-10-01" }, { t: "2026-10-30" }, { t: "2026-11-02" }];
  assert.deepEqual(monthEnds(b, "2026-11-03"), [0, 2]);
  assert.deepEqual(monthEnds(b.slice(0, 3), "2026-11-01"), [0, 2]);
  assert.deepEqual(monthEnds(b.slice(0, 3), "2026-10-31"), [0]);
});

test("thresholds, and a grade must beat the round-trip cost", () => {
  const m = { thresholds: [-0.02, -0.01, 0.01, 0.02], cost: 0.002 };
  assert.equal(rawGrade(0.03, m), "strong-buy");
  assert.equal(rawGrade(0.02, m), "strong-buy");
  assert.equal(rawGrade(0.015, m), "buy");
  assert.equal(rawGrade(0, m), "neutral");
  assert.equal(rawGrade(-0.015, m), "sell");
  assert.equal(rawGrade(-0.03, m), "strong-sell");
  // A low bar for "buy" still needs the cost covered.
  assert.equal(rawGrade(0.001, { thresholds: [-0.02, -0.01, 0, 0.02], cost: 0.002 }), "neutral");
});

test("grades the validation did not support are not published", () => {
  assert.equal(published("sell", model), "neutral");
  assert.equal(published("strong-sell", model), "neutral");
  assert.equal(published("strong-buy", model), "strong-buy");
});

test("a change needs two month-ends in a row", () => {
  assert.equal(confirmed(["buy", "neutral"]), "buy");
  assert.equal(confirmed(["buy", "neutral", "neutral"]), "neutral");
  assert.equal(confirmed(["buy", "neutral", "buy", "neutral"]), "buy");
});

test("missing features count as the training average, not as zero", () => {
  const empty = predict({}, model);
  assert.ok(Math.abs(empty.p - model.b0) < 1e-12);
});

test("insufficient, stale and bad data give no grade, and never neutral", () => {
  const cases = {
    short: synth(MIN_BARS - 1),
    stale: synth(400, "2026-09-01"),
    bad: synth(400).map((x, i) => (i === 390 ? { ...x, c: 0 } : x)),
    empty: [],
  };
  for (const [name, b] of Object.entries(cases)) {
    assert.ok(dataProblems(b, NOW).length, name);
    const r = evaluate({ symbol: "X", kind: "stock", bars: b, spy, model, now: NOW });
    assert.equal(r.state, "no-data", name);
    assert.equal(r.grade, null, name);
  }
});

test("a stock outside the tested liquidity gets no grade", () => {
  const b = synth(400).map((x) => ({ ...x, v: 10 }));
  const r = evaluate({ symbol: "X", kind: "stock", bars: b, spy, model, now: NOW });
  assert.equal(r.state, "no-data");
});

test("no benchmark, no grade", () => {
  assert.equal(evaluate({ symbol: "X", kind: "stock", bars: synth(400), spy: [], model, now: NOW }).state, "no-data");
});

test("funds and metals have no graded model", () => {
  for (const kind of ["fund", "metal"]) assert.equal(evaluate({ symbol: "X", kind, bars: synth(400), spy, model, now: NOW }).state, "no-model");
});

test("the active label says no data instead of neutral under 200 days", () => {
  const b = synth(150).map((x) => ({ open: x.o, high: x.h, low: x.l, close: x.c, volume: x.v, adj: x.a }));
  assert.equal(technicalsOf(b).key, "no-data");
});

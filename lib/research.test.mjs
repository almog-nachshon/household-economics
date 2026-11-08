import { test } from "node:test";
import assert from "node:assert/strict";
import { combine } from "./research-mix.js";

const d = (s) => new Date(`${s}T12:00:00Z`);
test("50/50 average decides by the same thresholds", () => {
  const m = combine({ score: 0.8, verdict: "buy", asOf: d("2026-11-08") }, { score: 0.3, verdict: "wait", asOf: d("2026-11-07") });
  assert.equal(m.score, 0.55);
  assert.equal(m.verdict, "wait");
});
test("buy against sell is a wait", () => {
  const m = combine({ score: 1.5, verdict: "buy", asOf: d("2026-11-08") }, { score: -0.5, verdict: "sell", asOf: d("2026-11-08") });
  assert.equal(m.verdict, "wait");
  assert.ok(m.split);
});
test("without ChatGPT, or with a stale one, Claude alone", () => {
  const c = { score: 0.7, verdict: "buy", asOf: d("2026-11-08") };
  assert.equal(combine(c, null).verdict, "buy");
  assert.equal(combine(c, { score: -1, verdict: "sell", asOf: d("2026-09-01") }).gpt, null);
});

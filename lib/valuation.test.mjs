import test from "node:test";
import assert from "node:assert/strict";
import { valuePosition } from "./valuation.mjs";

const now = Date.UTC(2026, 10, 17, 16);
const position = { symbol: "TEST", currency: "USD", assetClass: "STK", units: 4, markPrice: 90, value: 360 };
const meta = { symbol: "TEST", currency: "USD", instrumentType: "EQUITY", regularMarketPrice: 100, regularMarketTime: now / 1000 - 60 };
const options = { verified: true, baseline: now - 86400000, now };
test("uses broker units with a matching timestamped price", () => {
  assert.equal(valuePosition(position, meta, options).value, 400);
  assert.equal(valuePosition({ ...position, units: -4 }, meta, options).value, -400);
});
test("rejects mismatched currency, listing, unsupported assets and missing contract verification", () => {
  for (const m of [{ ...meta, currency: "GBP" }, { ...meta, symbol: "OTHER" }, { ...meta, instrumentType: "FUTURE" }]) assert.equal(valuePosition(position, m, options).source, "IBKR");
  assert.equal(valuePosition(position, meta, { ...options, verified: false }).source, "IBKR");
  assert.equal(valuePosition({ ...position, assetClass: "CMDTY" }, meta, options).source, "IBKR");
});
test("rejects stale, future, invalid and pre-fill quotes", () => {
  for (const m of [{ ...meta, regularMarketTime: now / 1000 - 1800 }, { ...meta, regularMarketTime: now / 1000 + 120 }, { ...meta, regularMarketPrice: NaN }, { ...meta, regularMarketPrice: 0 }]) assert.equal(valuePosition(position, m, options).value, 360);
  assert.equal(valuePosition(position, meta, { ...options, baseline: now }).source, "IBKR");
});
test("accepts a completed session close, but rejects an older session", () => {
  const end = now / 1000 - 3600;
  const closed = { ...meta, regularMarketTime: end - 10, currentTradingPeriod: { regular: { start: end - 23400, end } } };
  assert.equal(valuePosition(position, closed, options).reason, "close");
  assert.equal(valuePosition(position, { ...closed, regularMarketTime: end - 86400 }, options).source, "IBKR");
});
test("Finnhub keeps its provenance and rejects quotes outside the regular session", () => {
  const regular = { ...meta, priceSource: "Finnhub", currentTradingPeriod: { regular: { start: now / 1000 - 3600, end: now / 1000 + 3600 } } };
  assert.equal(valuePosition(position, regular, options).source, "Finnhub");
  assert.equal(valuePosition(position, { ...regular, currentTradingPeriod: { regular: { start: now / 1000 + 100, end: now / 1000 + 3600 } } }, options).reason, "session");
});

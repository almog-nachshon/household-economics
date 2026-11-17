import test from "node:test";
import assert from "node:assert/strict";
import { finnhubRequest, finnhubQuote } from "./finnhub.js";

test("API cache coalesces requests, keeps credentials out of URLs and reserves quota for holdings", async () => {
  const originalFetch = globalThis.fetch, originalKey = process.env.FINNHUB_API_KEY;
  const state = globalThis.finnhubState;
  state.cache.clear(); state.requests = []; state.backoff = 0;
  process.env.FINNHUB_API_KEY = "test-secret";
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url.includes("test-secret"), false);
    assert.equal(options.headers["X-Finnhub-Token"], "test-secret");
    return { ok: true, status: 200, json: async () => ({ c: 100, t: Math.floor(Date.now() / 1000) }) };
  };
  try {
    await Promise.all([finnhubQuote("AAPL"), finnhubQuote("AAPL")]);
    assert.equal(calls, 1);
    for (let i = 0; i < 24; i++) await finnhubRequest(`/test/${i}`);
    await assert.rejects(finnhubRequest("/test/blocked"), /rate_limit/);
    for (let i = 0; i < 20; i++) await finnhubRequest(`/priority/${i}`, { priority: true });
    await assert.rejects(finnhubRequest("/priority/blocked", { priority: true }), /rate_limit/);
    assert.equal(calls, 45);
    await assert.rejects(finnhubQuote("VWRA.L"), /unsupported/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.FINNHUB_API_KEY; else process.env.FINNHUB_API_KEY = originalKey;
    state.cache.clear(); state.requests = []; state.backoff = 0;
  }
});

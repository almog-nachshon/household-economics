import test from "node:test";
import assert from "node:assert/strict";
import { validateOpportunityReport, rankOpportunities } from "./opportunity-report.mjs";

const entry = (symbol = "VRSN", score = 80) => ({
  symbol, exchange: "NASDAQ", currency: "USD", strategy: "momentum",
  opportunityScore: score, portfolioFitScore: null, decision: "WATCH",
  thesis: "Sample thesis for test", risks: ["Stock-specific risk"],
  dataConfidence: "partial", brokerAvailability: "unverified",
  sources: [{ title: "Issuer filing", url: "https://www.sec.gov/edgar/search/", asOf: "2026-11-27" }]
});
const report = (candidates = [entry()]) => ({
  schemaVersion: "1.0", reportId: "monthly-2026-11", researchDate: "2026-11-27", candidates
});

test("accepts a valid offline research report", () => {
  assert.deepEqual(validateOpportunityReport(report()), { ok: true, errors: [] });
});
test("rejects missing attribution and fabricated scores", () => {
  const c = entry();
  c.sources = [];
  c.opportunityScore = Infinity;
  const result = validateOpportunityReport(report([c]));
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /sources/);
  assert.match(result.errors.join(" "), /opportunityScore/);
});
test("rejects duplicate securities with same exchange", () => {
  assert.equal(validateOpportunityReport(report([entry(), entry("vrsn")])).ok, false);
});
test("sorts opportunity ranking without mutating imported report", () => {
  const original = report([entry("AAPL", 45), entry("VRSN", 85)]);
  assert.equal(rankOpportunities(original)[0].symbol, "VRSN");
  assert.equal(original.candidates[0].symbol, "AAPL");
});
test("rejects non-HTTPS sources and unverifiable broker labels", () => {
  const c = entry();
  c.sources[0].url = "javascript:alert(1)";
  c.brokerAvailability = "approved";
  assert.equal(validateOpportunityReport(report([c])).ok, false);
});

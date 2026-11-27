import test from "node:test";
import assert from "node:assert/strict";
import { parseOpportunityReport, validateOpportunityReport, rankOpportunities, sameReport, REPORT_LIMIT_BYTES } from "./opportunity-report.mjs";

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
test("rejects missing attribution and non-finite scores", () => {
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

test("validates real calendar dates and rejects sources dated after the report", () => {
  const impossible = { ...report(), researchDate: "2026-02-30" };
  assert.match(validateOpportunityReport(impossible).errors.join(" "), /researchDate/);
  const c = entry();
  c.sources[0].asOf = "2026-11-28";
  assert.match(validateOpportunityReport(report([c])).errors.join(" "), /sources/);
  c.sources[0].url = "https://name:secret@example.com";
  c.sources[0].asOf = "2026-11-27";
  assert.match(validateOpportunityReport(report([c])).errors.join(" "), /sources/);
});

test("handles malformed JSON values without coercion and compares normalized listing identities", () => {
  const malformed = { ...entry(), symbol: { toString: null } };
  assert.match(validateOpportunityReport(report([malformed])).errors.join(" "), /symbol/);
  const duplicate = { ...entry("vrsn"), exchange: " nasdaq " };
  assert.match(validateOpportunityReport(report([entry(), duplicate])).errors.join(" "), /duplicated/);
  assert.equal(validateOpportunityReport(report([entry(), { ...entry(), exchange: "XTKS" }])).ok, true);
});

test("parses valid reports and limits the actual UTF-8 byte size", () => {
  assert.deepEqual(parseOpportunityReport(JSON.stringify(report())), report());
  assert.throws(() => parseOpportunityReport(" "), /ריק/);
  assert.throws(() => parseOpportunityReport("{"), SyntaxError);
  const oversized = report([{ ...entry(), thesis: "א".repeat(REPORT_LIMIT_BYTES / 2) }]);
  assert.throws(() => parseOpportunityReport(JSON.stringify(oversized)), /1 MiB/);
});

test("compares duplicate report content independently of object key order", () => {
  const original = report([entry("AAPL"), entry("VRSN")]);
  const reordered = JSON.parse(JSON.stringify(original, (key, value) =>
    value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value));
  assert.equal(sameReport(original, reordered), true);
  reordered.candidates.reverse();
  assert.equal(sameReport(original, reordered), false);
});

test("ranks using opportunity score without using portfolio fit as a tiebreaker", () => {
  const original = report([{ ...entry("VRSN"), portfolioFitScore: 100 }, { ...entry("AAPL"), portfolioFitScore: 0 }]);
  assert.deepEqual(rankOpportunities(original).map((row) => row.symbol), ["AAPL", "VRSN"]);
});

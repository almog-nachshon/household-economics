import test from "node:test";
import assert from "node:assert/strict";
import { validateOpportunityResearch } from "./opportunity-schema.mjs";
import { analyzeResearch, portfolioInputs, scoreOpportunity, scorePortfolioFit } from "./opportunities.mjs";

const asOf = "2026-10-15T12:00:00Z";
const observation = (value, observedAt = asOf) => ({ value, observedAt, sourceIds: ["test"] });
const rating = (evidence, value = 1) => ({ rating: value, evidence, rationale: "Synthetic test rationale" });

export function fixture() {
  return {
    schemaVersion: "4.1", researchProvider: "ChatGPT", title: "Synthetic test scan", asOf,
    sources: [{ id: "test", title: "Synthetic citation", url: "https://example.com/fixture", accessedAt: asOf }],
    universe: {
      methodology: "Synthetic test across exchanges", limitations: "Test data only", sourceIds: ["test"],
      markets: ["XNAS", "XTKS"], screenedCount: 500,
      strategyScreenedCounts: { momentum: 450, acceleration: 400, value: 450, emerging: 500, turnaround: 450 },
      candidates: [
        { listing: "XNAS:DEMO", name: "Demo issuer", sector: "Technology", industry: "Fixture", currency: "USD", fundamentalCurrency: "USD", sourceIds: ["test"] },
        { listing: "XTKS:0123", name: "Demo Japan issuer", sector: null, industry: null, currency: "JPY", fundamentalCurrency: null, sourceIds: ["test"] },
      ],
    },
    holdingSectors: [
      { symbol: "FUND", conid: 600, allocation: observation([{ sector: "Technology", weightPct: 35 }, { sector: "Other", weightPct: 65 }]) },
    ],
    reports: [{
      listing: "XNAS:DEMO", confidence: "medium", confidenceNote: "Test only",
      reasonsFor: [observation("Growing cash flow")], reasonsAgainst: [observation("Valuation risk")],
      invalidation: [observation("Base margin falls below 20%")], limitations: ["Synthetic test observations"],
      technical: {
        close: observation(100), dailyTrend: observation("rising"), weeklyTrend: observation("rising"),
        relativeStrengthSp500Pct: observation(10), rsi14: null, relativeVolume: observation(2),
        annualizedVolatilityPct: observation(24), maxDrawdownPct: observation(-20),
      },
      fundamental: {
        revenueGrowthPct: observation(12), freeCashFlow: observation(1000000),
        totalDebt: observation(0), forwardPE: observation(18), competitiveAdvantage: observation("Test moat"),
      },
      technicalAssessment: {
        trend: rating(["dailyTrend", "weeklyTrend"]), strength: rating(["relativeStrengthSp500Pct"]), confirmation: rating(["relativeVolume"]),
      },
      fundamentalAssessment: {
        growth: rating(["revenueGrowthPct"]), profitability: rating(["freeCashFlow"]),
        balanceSheet: rating(["totalDebt"]), valuation: rating(["forwardPE"]), outlook: rating(["competitiveAdvantage"]),
      },
      strategies: { momentum: observation("Confirmed on daily and weekly history"), emerging: observation("Early adoption with funding") },
      scenarios: Object.fromEntries([["bear", 80], ["base", 120], ["bull", 150]].map(([key, fairValue]) =>
        [key, observation({ fairValue, horizonMonths: 48, assumptions: "Synthetic model inputs" })])),
      broker: observation({ status: "listed", conid: 123 }),
      ilsPerUnit: observation(3.5),
    }],
  };
}

test("accepts discovery outside watchlists and multiple independent strategy matches", () => {
  const research = fixture();
  assert.deepEqual(validateOpportunityResearch(research), []);
  assert.equal(research.universe.candidates[1].listing, "XTKS:0123");
  assert.deepEqual(Object.keys(research.reports[0].strategies), ["momentum", "emerging"]);
  assert.equal(analyzeResearch(research).shortlist[0].listing, "XNAS:DEMO");
});

test("rejects unsupported versions, invented score fields, invalid observations and unsafe citations", () => {
  const mutations = [
    (data) => { data.schemaVersion = "4.0"; },
    (data) => { data.reports[0].score = 100; },
    (data) => { data.reports[0].technical.close.value = Infinity; },
    (data) => { data.reports[0].technical.close.observedAt = "2026-02-30T12:00:00Z"; },
    (data) => { data.reports[0].technical.close.sourceIds = ["unknown"]; },
    (data) => { data.sources[0].url = "javascript:alert(1)"; },
    (data) => { data.sources[0].url = "https://user:password@example.com"; },
    (data) => { data.sources[0].accessedAt = "2026-10-14T12:00:00Z"; },
    (data) => { data.reports[0].technicalAssessment.strength.evidence = ["rsi14"]; },
    (data) => { data.reports[0].technicalAssessment.trend.evidence = ["dailyTrend"]; },
    (data) => { data.reports[0].scenarios.base.value.fairValue = 900; },
    (data) => { data.reports[0].broker.value.conid = null; },
    (data) => { data.universe.strategyScreenedCounts.momentum = 0; },
    (data) => { data.universe.candidates[1] = data.universe.candidates[0]; },
    (data) => { data.reports[0].listing = "XMEX:OTHER"; },
    (data) => { data.holdingSectors[0].allocation.value[1].weightPct = 70; },
  ];
  for (const mutate of mutations) {
    const research = fixture();
    mutate(research);
    assert.ok(validateOpportunityResearch(research).length, mutate.toString());
  }
});

test("leaves missing metrics unscored, retains measured zero and requires independent fundamental support", () => {
  const report = fixture().reports[0];
  const opportunity = scoreOpportunity(report);
  assert.equal(opportunity.score, 75);
  assert.equal(opportunity.fundamental.coverage, 100);
  report.fundamental = {};
  report.fundamentalAssessment = {};
  assert.equal(scoreOpportunity(report).technical.score, 75);
  assert.equal(scoreOpportunity(report).fundamental.score, null);
  assert.equal(scoreOpportunity(report).score, null);
  report.fundamentalAssessment.valuation = rating(["forwardPE"], -2);
  assert.equal(scoreOpportunity(report).fundamental.score, 0);
});

test("calculates 20 ranked and 6 consideration rows without padding or permitting breakouts alone", () => {
  const research = fixture();
  const [{ candidate, ...report }] = analyzeResearch(research).reports.map(({ opportunity, ...row }) => row);
  research.universe.candidates = Array.from({ length: 22 }, (_, i) => ({ ...candidate, listing: `XNAS:DEMO${i}` }));
  research.reports = research.universe.candidates.map(({ listing }) => ({ ...structuredClone(report), listing }));
  research.reports[0].fundamentalAssessment = {};
  const result = analyzeResearch(research);
  assert.equal(result.top.length, 20);
  assert.equal(result.shortlist.length, 6);
  assert.ok(!result.ranked.some(({ listing }) => listing === "XNAS:DEMO0"));
  research.reports = [structuredClone(report)];
  research.reports[0].listing = research.universe.candidates[0].listing;
  research.reports[0].scenarios.base.value.fairValue = 95;
  assert.equal(analyzeResearch(research).shortlist.length, 0);
});

test("portfolio fit tracks current holdings independently of opportunity and uses whole shares", () => {
  const research = fixture();
  const row = analyzeResearch(research).top[0];
  const held = { symbol: "FUND", conid: 600, value: 10000, currency: "USD" };
  const profile = portfolioInputs({ rows: [held], held: 10000, broker: true }, research);
  const fit = scorePortfolioFit(row, profile);
  assert.equal(fit.units, 2);
  assert.equal(fit.spend, 700);
  assert.equal(fit.currencyPct, 100);
  assert.equal(fit.sectorPct, 100 * 4200 / 10700);
  assert.equal(fit.score, 77);
  assert.equal(scoreOpportunity(row).score, 75);
  const withExisting = portfolioInputs({ rows: [held, { symbol: "DIFFERENT", conid: 123, value: 2000, currency: "USD" }],
    held: 12000, broker: true }, research);
  assert.ok(scorePortfolioFit(row, withExisting).positionPct > fit.positionPct);
  assert.equal(scorePortfolioFit(row, profile, 100).score, 0);
});

test("missing classifications, FX, broker coverage and risk data do not become neutral inputs", () => {
  const research = fixture();
  const row = analyzeResearch(research).top[0];
  const unclassified = portfolioInputs({ rows: [{ symbol: "OTHER", value: 10000, currency: "EUR" }], held: 10000, broker: true }, research);
  const fit = scorePortfolioFit(row, unclassified);
  assert.equal(fit.score, null);
  assert.equal(fit.coverage, 0);
  const empty = portfolioInputs({ rows: [], held: 0, broker: true }, research);
  assert.equal(scorePortfolioFit({ ...row, broker: null }, empty).score, null);
  assert.equal(scorePortfolioFit({ ...row, ilsPerUnit: null }, empty).units, null);
  assert.equal(scorePortfolioFit({ ...row, technical: { ...row.technical, maxDrawdownPct: null } }, empty).score, null);
  const leveraged = portfolioInputs({ rows: [{ symbol: "SHORT", value: -1000, units: -1 }], held: -1000, broker: true }, research);
  assert.equal(scorePortfolioFit(row, leveraged).score, null);
});

import Ajv from "ajv";

export const SCHEMA_VERSION = "4.1";
export const IMPORT_LIMIT = 5 * 1024 * 1024;
export const STRATEGIES = ["momentum", "acceleration", "value", "emerging", "turnaround"];

const text = (max = 2000) => ({ type: "string", minLength: 1, maxLength: max, pattern: "\\S" });
const enumeration = (...values) => ({ enum: values });
const number = (min, max) => ({ type: "number", minimum: min, maximum: max });
const integer = (min, max) => ({ ...number(min, max), type: "integer" });
const array = (items, maxItems, minItems = 0) => ({ type: "array", items, maxItems, minItems });
const object = (properties, required = Object.keys(properties)) => ({
  type: "object", additionalProperties: false, properties, required,
});
const optionalFields = (properties) => object(properties, []);
const timestamp = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,3})?Z$" };
const sourceId = { type: "string", pattern: "^[A-Za-z0-9_-]{1,64}$" };
const sourceIds = { ...array(sourceId, 12, 1), uniqueItems: true };
const listing = { type: "string", pattern: "^[A-Z0-9][A-Z0-9._-]{0,19}:[A-Z0-9][A-Z0-9._/ -]{0,28}$" };
const symbol = { type: "string", pattern: "^[A-Z0-9][A-Z0-9._/= -]{0,28}$" };
const currency = { type: "string", pattern: "^[A-Z]{3}$" };
const price = number(0.000001, 1e9);
const pct = number(-1e6, 1e6);
const amount = number(-1e16, 1e16);
const conid = integer(1, 2147483647);
const url = { type: "string", maxLength: 2048, pattern: "^https?://" };
const observation = (value) => object({ value, observedAt: timestamp, sourceIds, note: text() }, ["value", "observedAt", "sourceIds"]);
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const observedFields = (fields) => optionalFields(Object.fromEntries(
  Object.entries(fields).map(([key, value]) => [key, nullable(observation(value))]),
));
const zone = object({ low: price, high: price });
const trend = enumeration("rising", "sideways", "falling");
const judgment = (keys) => optionalFields(Object.fromEntries(keys.map((key) => [key, nullable(
  object({ rating: integer(-2, 2), evidence: { ...array(text(64), 20, 1), uniqueItems: true }, rationale: text() }),
)])));

export const TECHNICAL_FIELDS = {
  close: price, dailyTrend: trend, weeklyTrend: trend, sma20: price, sma50: price, sma200: price,
  relativeStrengthSp500Pct: pct, rsi14: number(0, 100), macd: object({ line: amount, signal: amount, histogram: amount }),
  relativeVolume: number(0, 1e6), support: array(zone, 10, 1), resistance: array(zone, 10, 1),
  breakout: object({ status: enumeration("confirmed", "pending", "failed", "none"), confirmation: text(), failure: text() }),
  atr14: price, annualizedVolatilityPct: number(0, 1e6), maxDrawdownPct: number(-100, 0),
};
export const FUNDAMENTAL_FIELDS = {
  revenueGrowthPct: pct, epsGrowthPct: pct, grossMarginPct: pct, operatingMarginPct: pct, freeCashFlow: amount,
  totalDebt: number(0, 1e16), financialStrength: text(), forwardPE: price, forwardEvEbitda: price, forwardPriceToSales: price,
  analystEarningsRevisions: text(), guidanceChanges: text(), competitiveAdvantage: text(), catalysts: array(text(), 15, 1),
};
export const TECHNICAL_RUBRIC = {
  trend: { weight: 45, groups: [["dailyTrend"], ["weeklyTrend", "sma200"]] },
  strength: { weight: 30, groups: [["relativeStrengthSp500Pct"]] },
  confirmation: { weight: 25, groups: [["relativeVolume", "breakout", "rsi14", "macd"]] },
};
export const FUNDAMENTAL_RUBRIC = {
  growth: { weight: 25, groups: [["revenueGrowthPct", "epsGrowthPct"]] },
  profitability: { weight: 20, groups: [["grossMarginPct", "operatingMarginPct", "freeCashFlow"]] },
  balanceSheet: { weight: 15, groups: [["totalDebt", "financialStrength"]] },
  valuation: { weight: 25, groups: [["forwardPE", "forwardEvEbitda", "forwardPriceToSales"]] },
  outlook: { weight: 15, groups: [["analystEarningsRevisions", "guidanceChanges", "competitiveAdvantage", "catalysts"]] },
};

const confidence = enumeration("low", "medium", "high");
const report = object({
  listing, technical: observedFields(TECHNICAL_FIELDS),
  fundamental: observedFields(FUNDAMENTAL_FIELDS),
  technicalAssessment: judgment(Object.keys(TECHNICAL_RUBRIC)), fundamentalAssessment: judgment(Object.keys(FUNDAMENTAL_RUBRIC)),
  strategies: optionalFields(Object.fromEntries(STRATEGIES.map((key) => [key, observation(text())]))),
  confidence, confidenceNote: text(), reasonsFor: array(observation(text()), 20), reasonsAgainst: array(observation(text()), 20),
  invalidation: array(observation(text()), 20, 1), limitations: array(text(), 20),
  scenarios: optionalFields(Object.fromEntries(["bull", "base", "bear"].map((key) => [key, observation(
    object({ fairValue: nullable(price), horizonMonths: integer(1, 120), assumptions: text() }),
  )]))),
  broker: nullable(observation(object({ status: enumeration("listed", "unavailable"), conid: nullable(conid) }))),
  ilsPerUnit: nullable(observation(number(0.00000001, 1e6))),
});

export const opportunitySchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "Investment Advisor Opportunity Research 4.1",
  ...object({
    schemaVersion: { const: SCHEMA_VERSION }, title: text(140), asOf: timestamp,
    researchProvider: { const: "ChatGPT" },
    sources: array(object({ id: sourceId, title: text(200), url, accessedAt: timestamp }), 2500, 1),
    universe: object({
      methodology: text(4000), limitations: text(4000), sourceIds,
      markets: { ...array(text(100), 300, 1), uniqueItems: true }, screenedCount: integer(1, 1e8),
      strategyScreenedCounts: object(Object.fromEntries(STRATEGIES.map((key) => [key, integer(0, 1e8)]))),
      candidates: array(object({ listing, name: text(180), sector: nullable(text(100)), industry: nullable(text(120)), currency, fundamentalCurrency: nullable(currency), sourceIds }), 20000),
    }),
    reports: array(report, 100),
    holdingSectors: array(object({
      symbol, conid: nullable(conid),
      allocation: observation(array(object({ sector: text(100), weightPct: number(0.000001, 100) }), 100, 1)),
    }), 300),
  }, ["schemaVersion", "title", "asOf", "researchProvider", "sources", "universe", "reports"]),
};

const validateSchema = new Ajv({ strict: true, strictNumbers: true, ownProperties: true }).compile(opportunitySchema);
const validTimestamp = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().replace(/\.\d{3}Z$/, "Z") === value.replace(/(?:\.\d{1,3})?Z$/, "Z");
};
const validUrl = (value) => {
  try {
    const parsed = new URL(value);
    return parsed.hostname && !parsed.username && !parsed.password && !/\s/.test(value);
  } catch {
    return false;
  }
};

export function validateOpportunityResearch(data, now = new Date()) {
  if (!validateSchema(data)) {
    const { instancePath, message, params } = validateSchema.errors[0];
    const field = params.missingProperty ?? params.additionalProperty;
    return [`${instancePath || "/"} ${message}${field ? ` (${field})` : ""}`];
  }
  if (!validTimestamp(data.asOf) || Date.parse(data.asOf) > now.getTime()) return ["/asOf must be a valid UTC timestamp at or before import."];
  const asOf = Date.parse(data.asOf);
  const errors = [];
  const sources = new Map();
  for (const [i, source] of data.sources.entries()) {
    if (sources.has(source.id)) errors.push(`/sources/${i} duplicates source ${source.id}.`);
    if (!validUrl(source.url) || !validTimestamp(source.accessedAt) || Date.parse(source.accessedAt) > asOf) {
      errors.push(`/sources/${i} requires an HTTP(S) URL and a valid access time at or before asOf.`);
    }
    sources.set(source.id, source);
  }
  function checkSources(ids, path, observedAt) {
    for (const id of ids) {
      const source = sources.get(id);
      if (!source) errors.push(`${path} references unknown source ${id}.`);
      else if (observedAt && Date.parse(observedAt) > Date.parse(source.accessedAt)) {
        errors.push(`${path} has an observation later than source ${id} was accessed.`);
      }
    }
  }
  function checkObservation(item, path) {
    if (!item) return;
    if (!validTimestamp(item.observedAt) || Date.parse(item.observedAt) > asOf) {
      errors.push(`${path}/observedAt requires a valid UTC timestamp at or before asOf.`);
    }
    checkSources(item.sourceIds, path, item.observedAt);
  }
  checkSources(data.universe.sourceIds, "/universe");
  const candidates = new Map();
  for (const [i, candidate] of data.universe.candidates.entries()) {
    if (candidates.has(candidate.listing)) errors.push(`/universe/candidates/${i} duplicates listing ${candidate.listing}.`);
    candidates.set(candidate.listing, candidate);
    checkSources(candidate.sourceIds, `/universe/candidates/${i}`);
  }
  if (candidates.size > data.universe.screenedCount) errors.push("/universe/screenedCount must cover every candidate.");
  for (const strategy of STRATEGIES) {
    const count = data.universe.strategyScreenedCounts[strategy];
    const matches = data.reports.filter((row) => row.strategies[strategy]).length;
    if (count > data.universe.screenedCount || count < matches) errors.push(`/universe/strategyScreenedCounts/${strategy} conflicts with overall coverage or matches.`);
  }
  const reported = new Set();
  for (const [i, row] of data.reports.entries()) {
    const path = `/reports/${i}`;
    const candidate = candidates.get(row.listing);
    if (!candidate || reported.has(row.listing)) errors.push(`${path}/listing must uniquely refer to a universe candidate.`);
    reported.add(row.listing);
    for (const field of ["technical", "fundamental", "strategies", "scenarios", "reasonsFor", "reasonsAgainst", "invalidation"]) {
      for (const [key, item] of Object.entries(row[field])) checkObservation(item, `${path}/${field}/${key}`);
    }
    for (const field of ["broker", "ilsPerUnit"]) checkObservation(row[field], `${path}/${field}`);
    for (const [section, rubric] of [["technical", TECHNICAL_RUBRIC], ["fundamental", FUNDAMENTAL_RUBRIC]]) {
      for (const [key, assessment] of Object.entries(row[`${section}Assessment`])) {
        if (assessment && (assessment.evidence.some((field) => !Object.hasOwn(row[section], field) || !row[section][field])
          || rubric[key].groups.some((group) => !group.some((field) => assessment.evidence.includes(field))))) {
          errors.push(`${path}/${section}Assessment/${key} requires its documented observations.`);
        }
      }
    }
    const zones = [...(row.technical.support?.value ?? []), ...(row.technical.resistance?.value ?? [])];
    if (zones.some(({ low, high }) => low > high)) errors.push(`${path} has a price zone with low above high.`);
    const scenarios = ["bear", "base", "bull"].map((key) => row.scenarios[key]?.value).filter((value) => value?.fairValue != null);
    if (scenarios.some((scenario, index) => index > 0 && (scenario.horizonMonths !== scenarios[0].horizonMonths
      || scenario.fairValue < scenarios[index - 1].fairValue))) errors.push(`${path}/scenarios must have a common horizon and ascending fair values.`);
    if (row.broker && (row.broker.value.status === "listed") !== (row.broker.value.conid != null)) {
      errors.push(`${path}/broker requires a contract ID only for a listed instrument.`);
    }
    if ((row.fundamental.freeCashFlow || row.fundamental.totalDebt) && !candidate?.fundamentalCurrency) {
      errors.push(`${path} requires fundamentalCurrency for reported cash flow or debt.`);
    }
    if (candidate?.currency === "ILS" && row.ilsPerUnit && row.ilsPerUnit.value !== 1) errors.push(`${path}/ilsPerUnit must equal 1 for ILS.`);
  }
  const holdings = new Set();
  for (const [i, holding] of (data.holdingSectors ?? []).entries()) {
    const path = `/holdingSectors/${i}`;
    const key = holding.conid ?? holding.symbol;
    const allocation = holding.allocation.value;
    if (holdings.has(key)) errors.push(`${path} duplicates a holding.`);
    holdings.add(key);
    checkObservation(holding.allocation, `${path}/allocation`);
    const names = new Set(allocation.map(({ sector }) => sector.trim().toLowerCase()));
    if (names.size !== allocation.length || allocation.reduce((sum, { weightPct }) => sum + weightPct, 0) > 100.000001) {
      errors.push(`${path}/allocation requires distinct sectors totaling at most 100%.`);
    }
  }
  return errors.slice(0, 20);
}

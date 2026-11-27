import { FUNDAMENTAL_RUBRIC, TECHNICAL_RUBRIC } from "./opportunity-schema.mjs";

export const MONTHLY_DEPOSIT_ILS = 4000;
export const DEFAULT_ALLOCATION_ILS = 1000;
const DAY = 86_400_000;
const clamp = (n) => Math.min(100, Math.max(0, n));
const normalized = (value) => value?.trim().toLowerCase();

export function assessmentScore(assessments, rubric) {
  let coverage = 0;
  let total = 0;
  for (const [key, { weight }] of Object.entries(rubric)) {
    const item = assessments[key];
    if (!item) continue;
    coverage += weight;
    total += weight * (item.rating + 2) * 25;
  }
  return { score: coverage ? Math.round(total / coverage) : null, coverage };
}

export function scoreOpportunity(report) {
  const technical = assessmentScore(report.technicalAssessment, TECHNICAL_RUBRIC);
  const fundamental = assessmentScore(report.fundamentalAssessment, FUNDAMENTAL_RUBRIC);
  const score = technical.coverage >= 75 && report.technicalAssessment.trend
    && fundamental.coverage >= 70 && report.fundamentalAssessment.valuation
    ? Math.round(0.35 * technical.score + 0.65 * fundamental.score)
    : null;
  return { technical, fundamental, score };
}

export function analyzeResearch(research) {
  const candidates = new Map(research.universe.candidates.map((row) => [row.listing, row]));
  const reports = research.reports.map((report) => ({
    ...report, candidate: candidates.get(report.listing), opportunity: scoreOpportunity(report),
  }));
  const ranked = reports.filter((row) => row.opportunity.score != null).sort((a, b) =>
    b.opportunity.score - a.opportunity.score || b.opportunity.fundamental.score - a.opportunity.fundamental.score
    || a.listing.localeCompare(b.listing));
  const top = ranked.slice(0, 20);
  const shortlist = top.filter((row) => {
    const close = row.technical.close?.value;
    const scenarios = ["bear", "base", "bull"].map((key) => row.scenarios[key]?.value.fairValue);
    return row.confidence !== "low" && row.opportunity.score >= 65 && row.opportunity.fundamental.score >= 65
      && row.fundamentalAssessment.profitability && row.fundamentalAssessment.balanceSheet
      && row.reasonsFor.length && row.reasonsAgainst.length && close && scenarios.every((value) => value != null)
      && scenarios[1] > close && row.scenarios.base.value.horizonMonths >= 36 && row.scenarios.base.value.horizonMonths <= 60
      && row.broker?.value.status === "listed"
      && Date.parse(research.asOf) - Date.parse(row.broker.observedAt) <= 90 * DAY
      && Date.parse(research.asOf) - Date.parse(row.technical.close.observedAt) <= 10 * DAY
      && Date.parse(research.asOf) - Date.parse(row.technical.weeklyTrend?.observedAt ?? row.technical.sma200?.observedAt) <= 14 * DAY;
  }).slice(0, 6);
  return { reports, ranked, top, shortlist };
}

export function portfolioInputs(folio, research) {
  const byContract = new Map();
  const bySymbol = new Map();
  const candidates = new Map(research.universe.candidates.map((row) => [row.listing, row]));
  for (const report of research.reports) {
    const sector = candidates.get(report.listing)?.sector;
    if (sector && report.broker?.value.conid) byContract.set(report.broker.value.conid, { value: [{ sector, weightPct: 100 }] });
  }
  for (const entry of research.holdingSectors ?? []) {
    if (entry.conid) byContract.set(entry.conid, entry.allocation);
    else bySymbol.set(entry.symbol, entry.allocation);
  }
  const sectors = new Map();
  const currencies = new Map();
  const positions = [];
  let sectorKnown = 0;
  let currencyKnown = 0;
  let costBasisUsed = false;
  const add = (map, key, value) => map.set(key, (map.get(key) ?? 0) + value);
  for (const holding of folio.rows) {
    const value = holding.value;
    if (!(value > 0)) continue;
    costBasisUsed ||= !folio.broker && !holding.priceIls;
    positions.push({ symbol: holding.symbol, conid: holding.conid ?? null, currency: holding.currency ?? null, value });
    const observation = (holding.conid && byContract.get(holding.conid)) ?? bySymbol.get(holding.symbol);
    for (const { sector, weightPct } of observation?.value ?? []) {
      const partial = value * weightPct / 100;
      add(sectors, normalized(sector), partial);
      sectorKnown += partial;
    }
    if (!holding.currency) continue;
    add(currencies, holding.currency, value);
    currencyKnown += value;
  }
  const total = folio.held;
  return {
    total, positions, sectors: Object.fromEntries(sectors), currencies: Object.fromEntries(currencies),
    sectorCoverage: total > 0 ? Math.min(1, sectorKnown / total) : 1,
    currencyCoverage: total > 0 ? Math.min(1, currencyKnown / total) : 1,
    valid: (Boolean(folio.broker) || folio.rows.length > 0) && !folio.missingFx?.length
      && !folio.rows.some(({ units, value }) => units < 0 || value < 0) && !costBasisUsed,
    asOf: folio.asOf?.toISOString() ?? null,
    broker: Boolean(folio.broker),
  };
}

export function scorePortfolioFit(row, portfolio, budget = DEFAULT_ALLOCATION_ILS) {
  const { candidate, technical } = row;
  const close = technical.close?.value;
  const fx = candidate.currency === "ILS" ? 1 : row.ilsPerUnit?.value;
  const unitIls = close && fx ? close * fx : null;
  const brokerStatus = row.broker?.value.status ?? "unknown";
  const units = unitIls ? Math.floor(budget / unitIls) : null;
  const spend = units == null ? null : units * unitIls;
  const volatility = technical.annualizedVolatilityPct?.value;
  const drawdown = technical.maxDrawdownPct?.value;
  const result = { score: null, units, spend, unitIls, brokerStatus, sectorPct: null, currencyPct: null,
    positionPct: null, coverage: portfolio.sectorCoverage, reason: null };
  if (brokerStatus === "unavailable" || (unitIls && unitIls > MONTHLY_DEPOSIT_ILS)) return { ...result, score: 0, reason: "ineligible" };
  if (brokerStatus !== "listed" || units == null || !portfolio.valid) return { ...result, reason: "missing" };
  if (units === 0) return { ...result, score: 0, reason: "budget" };
  const total = portfolio.total + spend;
  const sector = normalized(candidate.sector);
  const held = portfolio.positions.reduce((sum, holding) => {
    const matches = holding.conid ? holding.conid === row.broker.value.conid
      : holding.symbol === row.listing.split(":")[1] && holding.currency === candidate.currency;
    return sum + (matches ? holding.value : 0);
  }, 0);
  const positionPct = 100 * (held + spend) / total;
  const sectorPct = sector ? 100 * ((Object.hasOwn(portfolio.sectors, sector) ? portfolio.sectors[sector] : 0) + spend) / total : null;
  const currencyPct = 100 * ((portfolio.currencies[candidate.currency] ?? 0) + spend) / total;
  const exposure = { ...result, positionPct, sectorPct, currencyPct };
  if (sectorPct == null || portfolio.sectorCoverage < 0.8 || portfolio.currencyCoverage < 0.8
    || volatility == null || drawdown == null) return { ...exposure, reason: "missing" };

  const concentration = clamp(100 - Math.max(0, sectorPct - 20) * 2);
  const position = clamp(100 - Math.max(0, positionPct - 5) * 5);
  const currency = candidate.currency !== "ILS" ? clamp(100 - Math.max(0, currencyPct - 40)) : 100;
  const risk = clamp(100 - Math.max(0, volatility - 20) * 2 - Math.max(0, Math.abs(drawdown) - 25));
  return { ...exposure, score: Math.round(0.25 * concentration + 0.20 * position + 0.15 * currency + 0.40 * risk) };
}

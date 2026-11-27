const prompt = `Run an external ChatGPT web research session for Investment Advisor 4.1. I will attach the opportunity-research-4.1.schema.json downloaded from the website. Return one JSON file that conforms to it. Use Hebrew for narrative when practical. The website calculates the scores and does not call an AI API.

Start from broad exchange listings and market screeners across regions, sectors, industries, company sizes and currencies. Use a common-stock or ADR universe and record coverage, screens, liquidity or other objective limits, gaps and accessible exchanges. Avoid fixed ticker lists, portfolio holdings, sectors, and ETF themes as discovery filters. Report the actual distinct listings screened (overall and per strategy), and include the candidate roster that came out of that work. Distinguish each listing by EXCHANGE:SYMBOL, preferably using the exchange MIC. Explain if only a subset of exchanges or listings was accessible. Never pad coverage, results, or sources.

Run each screen independently and allow multiple matches for a company:
- momentum: sustained daily/weekly relative strength, breakout and volume confirmation.
- acceleration: improving rates of comparable-period revenue or EPS growth, checked against guidance and revisions.
- value: defensible cash flow, margins or balance sheet and a credible forward valuation discount.
- emerging: verified adoption, revenue or backlog signals, a catalyst and a funding/runway check.
- turnaround: improving business performance, finances or guidance AND confirmation from longer-term price data.

Research at least 20 promising candidates when the evidence supports it. Investigate the strength and limitations of every thesis, including evidence against investment, sourced price zones and explicit measurable invalidation conditions. Pick the candidates meriting deeper research irrespective of existing holdings. VRSN is an illustration of what to look for, not a seed or required pick. Verify fundamentals even when the trend is clearly strengthening. The website generates the ranked and consideration lists, so don't supply ranks, scores or trade recommendations.

Use dated daily and weekly closes, not intraday charts, for trends. Explain lookback and price adjustment in the observation notes. For S&P 500 relative strength, report the security's return minus the S&P 500 return in percentage points over the same period and currency basis, using adjusted series or specifying the basis. Use the last completed session and 20/50/200 daily closes for the simple moving averages. Describe RSI(14), MACD (12/26/9), volume relative to the prior 20-session average, zones, breakout confirmation and failure, ATR(14), annualized daily volatility, and peak-to-trough drawdown (as a negative percentage; record the window). Omit unsupported measurements or set the optional fields to null.

Check company filings/releases for revenue, EPS, margins, free cash flow, debt and financial health. State the period and whether GAAP/adjusted in each observation note. Explain forward multiple basis, earnings estimate revisions, guidance, competitive advantage and catalysts. Use whole currency units for cash flow and debt, specify fundamentalCurrency separately from the listing currency, and normalize price quotes to major currency units. For bull/base/bear value scenarios use the same horizon (ideally 36–60 months), currency and valuation basis, with explicit assumptions. Fair value may be null when an estimate is unsupported. Use confidence levels that reflect verification and important gaps.

Every observation has a value, UTC observedAt, and sourceIds referencing the run's sources. Some values are objects or arrays per the schema. Supply public HTTP(S) links directly to supporting sources and record the UTC time you accessed each. Source access dates must be between the observation and the run's asOf time. For analysis or scenarios, cite the inputs, label the analysis and use the latest observation date of the inputs. Avoid unverified claims and leave missing data blank. Prefer primary sources and cross-check material observations when possible.

Assess each rubric dimension using -2 (strongly adverse), -1 (adverse), 0 (mixed or neutral on evidence), +1 (favorable), or +2 (strongly favorable). Include named, non-null observation keys in evidence and explain the judgment. Skip a dimension if it lacks evidence. Technical dimensions require trend: dailyTrend plus weeklyTrend or sma200; strength: relativeStrengthSp500Pct; confirmation: at least one of relativeVolume, breakout, rsi14, macd. Fundamentals require growth: at least one of revenueGrowthPct or epsGrowthPct; profitability: grossMarginPct, operatingMarginPct or freeCashFlow; balanceSheet: totalDebt or financialStrength; valuation: forwardPE, forwardEvEbitda or forwardPriceToSales; outlook: analystEarningsRevisions, guidanceChanges, competitiveAdvantage or catalysts.

Verify exact listing and currency using the public Interactive Brokers contract source. Record conid if listed; use unavailable only with supporting evidence, otherwise null. Account permissions must still be checked separately in Interactive Israel. Cite observed FX to ILS for each non-ILS listing if available. No leverage or automatic trading. The user's monthly deposit is 4,000 ILS, horizon 3–5 years, and risk tolerance moderate. If a current holdings list was supplied, optionally provide holdingSectors using issuer classifications or dated fund look-through percentages. Identify holdings by conid when available and use matching sector naming. Missing allocation weights represent unknown exposure. The website models holdings separately from market rankings.

Return only the JSON file content. Set schemaVersion to "4.1" and researchProvider to "ChatGPT". Do not add fake filler candidates when coverage falls short.`;

export function GET() {
  return new Response(prompt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="opportunity-research-4.1-prompt.txt"',
    },
  });
}

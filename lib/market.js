import { pricesFor, fxFor } from "@/lib/sources";

// Daily prices from Yahoo Finance's public chart endpoint, cached for 12 hours. The price right now is the
// median of Yahoo and the other live sources (lib/sources.js).
const HEADERS = { "User-Agent": "Mozilla/5.0" };
const DAY = { m1: 21, m3: 63, m6: 126 };

async function chart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&events=div`;
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 43200 } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const r = (await res.json()).chart?.result?.[0];
  if (!r) throw new Error("no data");
  // Adjusted closes include dividends, so accumulating and distributing funds compare fairly.
  const raw = r.indicators.adjclose?.[0]?.adjclose ?? r.indicators.quote[0].close;
  // Dividends paid over the year, per unit (none for accumulating funds and metals).
  const dividends = Object.values(r.events?.dividends ?? {}).reduce((t, d) => t + d.amount, 0);
  return { closes: raw.filter((x) => x != null), price: r.meta.regularMarketPrice, currency: r.meta.currency, type: r.meta.instrumentType, dividends };
}

// Returns over 1/3/6/12 months, annualized volatility and the year's max drawdown.
function metrics(closes) {
  const last = closes[closes.length - 1];
  const ret = (n) => last / closes[Math.max(0, closes.length - 1 - n)] - 1;
  const daily = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = daily.reduce((t, x) => t + x, 0) / daily.length;
  const vol = Math.sqrt(daily.reduce((t, x) => t + (x - mean) ** 2, 0) / (daily.length - 1)) * Math.sqrt(252);
  let peak = closes[0];
  let maxDrawdown = 0;
  for (const c of closes) {
    peak = Math.max(peak, c);
    maxDrawdown = Math.min(maxDrawdown, c / peak - 1);
  }
  const m1 = ret(DAY.m1), m3 = ret(DAY.m3), m6 = ret(DAY.m6), m12 = closes[closes.length - 1] / closes[0] - 1;
  // Risk-adjusted momentum: average of the 3/6/12-month returns, minus half the volatility.
  const score = (m3 + m6 + m12) / 3 - vol / 2;
  // Sharpe over the year against a ~4% risk-free rate (US T-bills).
  const sharpe = (m12 - 0.04) / vol;
  // Last day's change and the average monthly return over the year.
  const d1 = last / closes[closes.length - 2] - 1;
  const mAvg = (1 + m12) ** (1 / 12) - 1;
  return { m1, m3, m6, m12, vol, maxDrawdown, score, sharpe, d1, mAvg };
}

export async function quote(symbol) {
  try {
    const { closes, price: cached, currency, type, dividends } = await chart(symbol);
    if (closes.length < 130) throw new Error("not enough history");
    const yahoo = await livePrice(symbol).catch(() => ({ price: cached }));
    const { price, spread, confidence, sources, links } = await pricesFor(symbol, yahoo, { type, currency });
    return { symbol, price, currency, spread, confidence, sources, links, divYield: dividends && price ? dividends / price : 0, ...metrics(closes) };
  } catch (e) {
    return { symbol, error: e.message };
  }
}

// The latest price (and exchange rate) right now, refreshed every minute; the 1-year history stays cached.
async function livePrice(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const m = (await res.json()).chart?.result?.[0]?.meta;
  if (!m?.regularMarketPrice) throw new Error("no live price");
  return { price: m.regularMarketPrice, time: m.regularMarketTime };
}

// ILS per one unit of a quote currency: the median of the live rates (Yahoo, CNBC, Swissquote), or Bank of
// Israel's rate when none answers. `fx` holds each currency's sources. Yahoo quotes London prices in pence (GBp),
// Tel Aviv in agorot (ILA).
export async function ilsRates(currencies) {
  const rates = { ILS: 1, ILA: 0.01 };
  const fx = {};
  await Promise.all(
    [...new Set(currencies)].filter((c) => c && !rates[c]).map(async (c) => {
      const base = c === "GBp" ? "GBP" : c;
      const yahoo = await livePrice(base === "USD" ? "ILS=X" : `${base}ILS=X`).catch(() => null);
      fx[base] = await fxFor(base, yahoo);
      rates[c] = c === "GBp" ? fx[base].price / 100 : fx[base].price;
    }),
  );
  return { ...rates, fx };
}

// Live prices from several independent sources besides Yahoo, none needing a key or a login, each with a link
// to its own quote page. The price used is the median of the sources that price the same instrument.
// Nasdaq.com: US listings (Nasdaq Last Sale, real time). CNBC: US, London, spot metals and FX.
// Finnhub: US listings, only when FINNHUB_API_KEY is set.
// Swissquote (a Swiss bank's public feed): spot gold/silver and USD/ILS. Bank of Israel and the ECB: official
// daily exchange rates, shown for reference and used only when no live rate answers.
const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" };
const get = (url, revalidate = 60) =>
  fetch(url, { headers: { ...HEADERS, Accept: "application/json" }, next: { revalidate }, signal: AbortSignal.timeout(6000) }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
const num = (s) => Number(String(s).replace(/[$,]/g, ""));

// Metals are bought at spot at IBKR (XAUUSD / XAGUSD), so the spot feeds set their price and Yahoo's futures
// stay as a reference. Copper has no spot: every source quotes the futures contract.
const METALS = {
  "GC=F": { cnbc: "XAU=", swissquote: "XAU/USD", spot: true },
  "SI=F": { cnbc: "XAG=", swissquote: "XAG/USD", spot: true },
  "HG=F": { cnbc: "@HG.1" },
};
const FX = { USD: { cnbc: "ILS=", swissquote: "USD/ILS" }, GBP: { cnbc: "GBPILS=" }, EUR: { cnbc: "EURILS=" } };

async function nasdaq(symbol, type) {
  const classes = type === "ETF" ? ["etf"] : type === "EQUITY" ? ["stocks"] : ["stocks", "etf"];
  for (const c of classes) {
    const d = (await get(`https://api.nasdaq.com/api/quote/${symbol}/info?assetclass=${c}`)).data;
    if (!d) continue;
    // Outside regular hours the primary figure is the pre-/after-market trade and the secondary is the close.
    const p = d.secondaryData?.lastSalePrice ? d.secondaryData : d.primaryData;
    return { name: "Nasdaq", price: num(p.lastSalePrice), currency: "USD", url: `https://www.nasdaq.com/market-activity/${c}/${symbol.toLowerCase()}` };
  }
  throw new Error("not on Nasdaq");
}

// Only with FINNHUB_API_KEY in .env (a free key); the free plan covers US listings.
async function finnhub(symbol) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("no FINNHUB_API_KEY");
  const q = await get(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${key}`);
  if (!q?.c) throw new Error("no Finnhub quote");
  return { name: "Finnhub", price: q.c, currency: "USD", time: q.t ? q.t * 1000 : null, url: `https://finnhub.io/` };
}

// Tel Aviv quotes come in agorot (CNBC labels them ILS) and are delayed.
async function cnbc(symbol) {
  const url = `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(symbol)}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`;
  const q = (await get(url)).FormattedQuoteResult?.FormattedQuote?.[0];
  if (!q || q.code !== 0 || !num(q.last)) throw new Error("no CNBC quote");
  const tlv = symbol.endsWith("-IL");
  return {
    name: "CNBC",
    price: num(q.last),
    currency: tlv ? "ILA" : q.currencyCode,
    time: q.last_time?.includes("T") ? Date.parse(q.last_time) : null,
    delayed: q.realTime === "false",
    url: `https://www.cnbc.com/quotes/${encodeURIComponent(symbol)}`,
  };
}

async function swissquote(pair) {
  const url = `https://forex-data-feed.swissquote.com/public-quotes/bboquotes/instrument/${pair}`;
  const r = (await get(url))[0];
  const p = r?.spreadProfilePrices?.[0];
  if (!p) throw new Error("no Swissquote quote");
  return { name: "Swissquote", price: (p.bid + p.ask) / 2, time: r.ts, url };
}

async function boi(base) {
  const r = (await get("https://www.boi.org.il/PublicApi/GetExchangeRates", 3600)).exchangeRates?.find((x) => x.key === base);
  if (!r) throw new Error(`no ${base} rate`);
  return { name: "בנק ישראל", price: r.currentExchangeRate / r.unit, url: "https://www.boi.org.il/roles/markets/exchangerates/", ref: true, note: "שער יציג" };
}

async function ecb(base) {
  const price = (await get(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=ILS`, 3600)).rates?.ILS;
  if (!price) throw new Error(`no ${base} rate`);
  return { name: "ECB", price, url: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html", ref: true, note: "שער רשמי" };
}

const settled = async (jobs) => (await Promise.allSettled(jobs.filter(Boolean))).flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const OUTLIER = 0.015;

// Fuses the sources into one price: the median of the live (not reference-only) sources, after dropping any
// source more than 1.5% from the others' median (only with 3+ sources, when a majority can outvote one).
// Each dropped source is marked `outlier`. Confidence: high = 3+ sources within 0.5%, medium = 2+ within 1%.
function consensus(sources) {
  const live = sources.filter((s) => s.price > 0 && !s.ref);
  if (!live.length) return { confidence: "none" };
  if (live.length >= 3) {
    const m = median(live.map((s) => s.price));
    for (const s of live) if (Math.abs(s.price / m - 1) > OUTLIER) s.outlier = true;
  }
  const ps = live.filter((s) => !s.outlier).map((s) => s.price);
  const spread = Math.max(...ps) / Math.min(...ps) - 1;
  const confidence = ps.length >= 3 && spread <= 0.005 ? "high" : ps.length >= 2 && spread <= 0.01 ? "medium" : "low";
  return { price: median(ps), spread, count: ps.length, confidence };
}

// Pages to check a price by hand.
function links(symbol) {
  if (symbol.includes("=")) return [];
  const base = symbol.replace(/\.(L|TA)$/, "");
  const google = symbol.endsWith(".L") ? `quote/${base}:LON` : symbol.endsWith(".TA") ? `quote/${base}:TLV` : `?q=${symbol}`;
  const tv = symbol.endsWith(".L") ? `LSE:${base}` : symbol.endsWith(".TA") ? `TASE:${base}` : symbol;
  return [
    { name: "Google Finance", url: `https://www.google.com/finance/${google}` },
    { name: "TradingView", url: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}` },
    ...(symbol.endsWith(".TA") ? [{ name: "הבורסה בת״א", url: `https://market.tase.co.il/he/market_data/securities/data/all` }] : []),
  ];
}

// All sources for one symbol: `yahoo` is Yahoo's live reading ({ price, time }); `type` and `currency` come
// from Yahoo's chart, and a source quoting another currency is left out.
export async function pricesFor(symbol, yahoo, { type, currency } = {}) {
  const m = METALS[symbol];
  const jobs = m
    ? [m.cnbc && cnbc(m.cnbc), m.swissquote && swissquote(m.swissquote)]
    : symbol.endsWith(".L")
      ? [cnbc(`${symbol.slice(0, -2)}-GB`)]
      : symbol.endsWith(".TA")
        ? [cnbc(`${symbol.slice(0, -3)}-IL`)]
        : /[.=]/.test(symbol)
          ? []
          : [nasdaq(symbol, type), cnbc(symbol), finnhub(symbol)];
  const others = (await settled(jobs)).filter((s) => !s.currency || !currency || s.currency === currency);
  const sources = [
    ...(yahoo?.price
      ? [{
          name: "Yahoo",
          price: yahoo.price,
          time: yahoo.time ? yahoo.time * 1000 : null,
          delayed: symbol.endsWith(".TA"),
          url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`,
          ref: m?.spot,
          note: m?.spot ? "חוזה עתידי" : null,
        }]
      : []),
    ...others,
  ];
  const c = consensus(sources);
  // Spot metals with no spot feed answering fall back to the futures price.
  return { price: c.price ?? yahoo?.price, spread: c.spread, count: c.count ?? 0, confidence: c.confidence, sources, links: links(symbol) };
}

// ILS per one unit of `base` (USD, GBP, EUR): the median of the live rates, or Bank of Israel's official rate
// when none answers.
export async function fxFor(base, yahoo) {
  const f = FX[base] ?? {};
  const sources = [
    ...(yahoo?.price ? [{ name: "Yahoo", price: yahoo.price, time: yahoo.time ? yahoo.time * 1000 : null, url: `https://finance.yahoo.com/quote/${base === "USD" ? "ILS" : base + "ILS"}%3DX/` }] : []),
    ...(await settled([f.cnbc && cnbc(f.cnbc), f.swissquote && swissquote(f.swissquote), boi(base), ecb(base)])),
  ];
  const c = consensus(sources);
  const official = sources.find((s) => s.name === "בנק ישראל");
  const price = c.price ?? official?.price;
  if (!price) throw new Error(`no ${base} rate`);
  return { price, spread: c.spread, count: c.count ?? 0, confidence: c.confidence, official: !c.price, sources };
}

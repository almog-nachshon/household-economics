// Duplication between funds, and the real weight of a single stock once what the funds hold of it is counted.
// The core of the portfolio is the index bucket's two funds: VUAA.L (S&P 500) and VWRA.L (the whole world, most of
// it the same US companies: the core's deliberate US-plus-world mix). Any other fund with half or more of its money in
// S&P 500 companies adds no spread on top of the core: a duplicate. It is never bought, and held it is offered for
// sale under "changes". Single stocks are a deliberate bet, never duplicates; one whose real weight (its own value plus
// its share inside the funds) reaches HEAVY % of the account gets no new money.
export const CORE = ["VUAA.L", "VWRA.L"];
export const DUP_MIN = 50;
export const HEAVY = 20;

// Per fund: inSp500 = % of its money in S&P 500 companies; top = % weight of the single stocks inside it that this
// portfolio holds or may buy; asOf = the holdings date; url = where the numbers come from. From the deep research of
// 2026-11-01 (issuer holdings files via StockAnalysis / justETF / Vanguard, S&P DJI methodology for the Select Sector
// funds, etfbff / etfrc overlap tools). QQQM: at least its 51% sum-of-min-weights overlap with the S&P 500; 55.5%
// summing its S&P 500 members. Redo with the next research.
export const FUNDS = {
  "VUAA.L": { inSp500: 100, top: { NVDA: 8.37, AMD: 1.52, TSLA: 1.51 }, asOf: "2026-09-30", url: "https://www.justetf.com/en/etf-profile.html?isin=IE00BFMXXD54" },
  "CSPX.L": { inSp500: 100, top: { NVDA: 8.37, AMD: 1.52, TSLA: 1.51 }, asOf: "2026-09-30", url: "https://www.ishares.com/uk/individual/en/products/253743/" },
  VOO: { inSp500: 100, top: { NVDA: 8.39, AMD: 1.52, TSLA: 1.52 }, asOf: "2026-09-30", url: "https://investor.vanguard.com/investment-products/etfs/profile/voo" },
  "VWRA.L": { inSp500: 55, top: { NVDA: 5.01 }, asOf: "2026-09-30", url: "https://www.vanguard.co.uk/professional/product/etf/equity/9679/ftse-all-world-ucits-etf-usd-accumulating" },
  VTI: { inSp500: 83, top: { NVDA: 7.13 }, asOf: "2026-09-30", url: "https://investor.vanguard.com/investment-products/etfs/profile/vti" },
  QQQM: { inSp500: 55.5, top: { NVDA: 8, AMD: 3.69, TSLA: 3.41 }, asOf: "2026-10-29", url: "https://stockanalysis.com/etf/qqqm/holdings/" },
  SMH: { inSp500: 75, top: { NVDA: 19.62, AMD: 5.58 }, asOf: "2026-10-30", url: "https://stockanalysis.com/etf/smh/holdings/" },
  XLK: { inSp500: 100, top: { NVDA: 14.98, AMD: 4.85, PLTR: 2.65 }, asOf: "2026-10-29", url: "https://stockanalysis.com/etf/xlk/holdings/" },
  XLF: { inSp500: 100, top: {}, asOf: "2026-10-29", url: "https://stockanalysis.com/etf/xlf/holdings/" },
  XLE: { inSp500: 100, top: {}, asOf: "2026-10-29", url: "https://stockanalysis.com/etf/xle/holdings/" },
  XLV: { inSp500: 100, top: {}, asOf: "2026-10-29", url: "https://stockanalysis.com/etf/xlv/holdings/" },
  XLI: { inSp500: 100, top: { RTX: 4.97, LMT: 2.42 }, asOf: "2026-10-29", url: "https://stockanalysis.com/etf/xli/holdings/" },
  ITA: { inSp500: 77, top: { RTX: 16.81, LMT: 5.62, NOC: 5, GD: 4.82, RKLB: 2.44 }, asOf: "2026-10-29", url: "https://stockanalysis.com/etf/ita/holdings/" },
  XAR: { inSp500: 37, top: { LMT: 3.63, NOC: 3.23, GD: 3.11, RTX: 2.99 }, asOf: "2026-10-29", url: "https://stockanalysis.com/etf/xar/holdings/" },
  NLR: { inSp500: 18, top: { CEG: 9.16, CCJ: 8.46, BWXT: 6.72 }, asOf: "2026-10-30", url: "https://stockanalysis.com/etf/nlr/holdings/" },
  URA: { inSp500: 0, top: { CCJ: 23.05, OKLO: 4.63 }, asOf: "2026-10-30", url: "https://stockanalysis.com/etf/ura/holdings/" },
};

// The duplicate entry for a fund (its numbers and a Hebrew reason), or null.
export function duplicateOf(symbol) {
  const f = FUNDS[symbol];
  if (!f || CORE.includes(symbol) || f.inSp500 == null || f.inSp500 < DUP_MIN) return null;
  return { ...f, reason: `${Math.round(f.inSp500)}% מהכסף בקרן הזו הוא במניות מה-S&P 500, שכבר יש לך ב-VUAA וב-VWRA: היא לא מוסיפה פיזור, רק כפילות.` };
}

// rows: holdings [{symbol, value}] (ILS); total: the account's value. Returns, for each single stock held directly or
// inside a held fund, {symbol, direct, via, value, pct, parts: [{fund, value}]} with pct of the account.
export function lookThrough(rows, total) {
  const out = {};
  const at = (s) => (out[s] ??= { symbol: s, direct: 0, via: 0, parts: [] });
  for (const h of rows) {
    const f = FUNDS[h.symbol];
    if (!f) {
      at(h.symbol).direct += h.value;
      continue;
    }
    for (const [s, w] of Object.entries(f.top ?? {})) {
      const v = (h.value * w) / 100;
      at(s).via += v;
      at(s).parts.push({ fund: h.symbol, value: v, weight: w });
    }
  }
  for (const x of Object.values(out)) {
    x.value = x.direct + x.via;
    x.pct = total ? (x.value / total) * 100 : 0;
  }
  return out;
}

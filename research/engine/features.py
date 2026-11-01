# Builds the research panel: one row per symbol at each month's last trading day, using only data up to that close.
# Targets start at the NEXT day's open, the first price a signal could trade at. Usage: python features.py <data dir>
# All features are scaled by the symbol's own volatility and need no other stock, so the live engine can compute them.
import pickle, sys
import numpy as np, pandas as pd

HZ = (21, 63, 252)
UNIVERSE_N = 150

def rma(x, n): return x.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()

def closes(d): return d.c * 1.0

def base(d):
    "Dividend-and-split adjusted OHLC, so returns and levels are consistent across a split."
    k = d.a / d.c
    return pd.DataFrame({"o": d.o * k, "h": d.h * k, "l": d.l * k, "c": d.a, "v": d.v.fillna(0), "dv": d.c * d.v.fillna(0)})

def build(d, spy, sec):
    b = base(d); c, h, l, v = b.c, b.h, b.l, b.v
    r = np.log(c).diff()
    vol = r.rolling(63).std() * 252 ** .5
    unit = lambda n: vol * (n / 252) ** .5
    sma50, sma200 = c.rolling(50).mean(), c.rolling(200).mean()
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    up, dn = h.diff(), -l.diff()
    pdm, mdm = up.where((up > dn) & (up > 0), 0.0), dn.where((dn > up) & (dn > 0), 0.0)
    atr = rma(tr, 14); pdi, mdi = 100 * rma(pdm, 14) / atr, 100 * rma(mdm, 14) / atr
    adx = rma(100 * (pdi - mdi).abs() / (pdi + mdi), 14)
    ch = c.diff(); rsi = 100 - 100 / (1 + rma(ch.clip(lower=0), 14) / rma((-ch).clip(lower=0), 14))
    ret = lambda n: c / c.shift(n) - 1
    f = pd.DataFrame(index=c.index)
    # Trend
    f["t_d200"] = (c / sma200 - 1) / vol
    f["t_d50"] = (c / sma50 - 1) / vol
    f["t_slope50"] = (sma50 / sma50.shift(21) - 1) / unit(21)
    f["t_cross"] = (sma50 / sma200 - 1) / vol
    f["t_adx"] = np.sign(pdi - mdi) * adx / 50
    # Momentum
    f["m_21"] = ret(21) / unit(21)
    f["m_63"] = ret(63) / unit(63)
    f["m_6_1"] = (c.shift(21) / c.shift(126) - 1) / unit(105)
    f["m_12_1"] = (c.shift(21) / c.shift(252) - 1) / unit(231)
    f["m_rsi"] = (rsi - 50) / 50
    f["m_rsi_up"] = f.m_rsi * (c > sma200)      # RSI read in the context of the long trend
    f["m_rsi_dn"] = f.m_rsi * (c <= sma200)
    sp = spy.reindex(c.index).ffill()
    f["m_rs63"] = (ret(63) - (sp / sp.shift(63) - 1)) / unit(63)
    if sec is not None:
        se = sec.reindex(c.index).ffill()
        f["m_rsec63"] = (ret(63) - (se / se.shift(63) - 1)) / unit(63)
    else:
        f["m_rsec63"] = 0.0
    # Volume
    f["v_rel"] = np.log((v.rolling(20).mean() + 1) / (v.rolling(120).mean() + 1))
    f["v_conf"] = ((r * (v / v.rolling(60).mean())).rolling(21).sum()) / unit(21)
    obv = (np.sign(ch) * v).cumsum()
    f["v_obv"] = (obv - obv.rolling(20).mean()) / (v.rolling(120).mean() * 20 + 1)
    # Risk
    f["k_atr"] = atr / c
    f["k_vol"] = vol
    f["k_dvol"] = r.clip(upper=0).rolling(63).std() * 252 ** .5
    f["k_dd"] = c / h.rolling(252).max() - 1
    # Market
    f["x_spy200"] = sp / sp.rolling(200).mean() - 1
    f["x_spyvol"] = np.log(sp).diff().rolling(63).std() * 252 ** .5
    # The ladder in the live site today (lib/technicals.js), as the simple benchmark.
    e50 = c.ewm(span=50, adjust=False, min_periods=50).mean()
    macd = c.ewm(span=12, adjust=False).mean() - c.ewm(span=26, adjust=False).mean()
    med = ((c.shift(21) / c.shift(126) - 1) > 0).astype(int) + (c > e50).astype(int) + (macd > 0).astype(int)
    u, w = (c > sma200) & (sma50 > sma200), (c < sma200) & (sma50 < sma200)
    f["ladder"] = np.select([u & (med >= 2), u, w & (med >= 2), w], [2, 1, -1, -2], 0)
    f.loc[sma200.isna(), "ladder"] = np.nan
    # Targets: enter at the next open, leave at the open h days later, and how deep it fell meanwhile.
    op = b.o
    for n in HZ:
        f[f"y{n}"] = op.shift(-(n + 1)) / op.shift(-1) - 1
        f[f"end{n}"] = pd.Series(c.index, index=c.index).shift(-(n + 1))
    lows = l.values; opv = op.values; dd = np.full(len(c), np.nan)
    for i in range(len(c) - 64):
        dd[i] = lows[i + 1:i + 65].min() / opv[i + 1] - 1
    f["dd63"] = dd
    f["liq"] = b.dv.rolling(126).median()
    return f

def main():
    OUT = sys.argv[1]
    R = pickle.load(open(OUT + "/raw.pkl", "rb"))
    PX, SECT, FUNDS = R["px"], R["sectors"], R["funds"]
    spy = base(PX["SPY"]); spyo = spy.o
    rows = []
    for s, d in PX.items():
        if len(d) < 300: continue
        sec = PX.get(SECT.get(s)) if SECT.get(s) else None
        f = build(d, spy.c, base(sec).c if sec is not None else None)
        for n in HZ:
            so = spyo.reindex(f.index)
            f[f"x{n}"] = f[f"y{n}"] - (so.shift(-(n + 1)) / so.shift(-1) - 1)
        m = f.groupby(f.index.to_period("M")).tail(1).copy()
        m["sym"] = s; m["fund"] = s in FUNDS; m["sp"] = s in SECT; m["mine"] = s in R["mine"]
        rows.append(m)
    A = pd.concat(rows).rename_axis("date").reset_index()
    A = A[A.date >= "2006-01-01"]
    # The stock universe by a rule that was computable at the time: each month's 150 most traded stocks in the pool.
    st = A[A.sp & A.liq.notna() & A.k_vol.notna()].copy()
    st["rk"] = st.groupby("date").liq.rank(ascending=False)
    A["univ"] = False
    A.loc[st[st.rk <= UNIVERSE_N].index, "univ"] = True
    A.to_pickle(OUT + "/panel.pkl")
    print("rows", len(A), "universe rows", int(A.univ.sum()), "symbols in universe", A[A.univ].sym.nunique(), A.date.min().date(), A.date.max().date())

if __name__ == "__main__":
    main()

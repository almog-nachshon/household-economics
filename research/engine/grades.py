# The five grades from a model's prediction, and how each grade and a simple portfolio really did, after costs.
# Thresholds come from the training rows' predictions at each yearly refit, and a grade needs the prediction to beat the
# round-trip cost. Usage: python grades.py <data dir> <stocks|funds> <model name in CANDIDATES> [--final]
# Without --final only the validation years are read; the lock is lifted once, after the model and rules are fixed.
import sys, json, warnings
import numpy as np, pandas as pd
from models import *
warnings.filterwarnings("ignore")
OUT, PROFILE, NAME = sys.argv[1:4]
FINAL = "--final" in sys.argv
LOCK = pd.Timestamp("2021-01-01")
COST = .001          # each side: commission and half the spread, an assumption
HZ = 63 if PROFILE == "stocks" else 252
CANDIDATES = {"trend+risk": cols("trend+risk"), "trend": cols("trend"), "trend+mom": cols("trend+mom"), "mom": cols("mom"), "all": cols("all"), "no_vol": [c for c in cols("trend+risk") if c not in ("k_vol", "k_atr", "k_dvol")]}
A0 = pd.read_pickle(OUT + "/panel.pkl")
A = (A0[A0.univ] if PROFILE == "stocks" else A0[A0.fund]).copy().reset_index(drop=True)
LAST = pd.Timestamp("2099-01-01") if FINAL else LOCK
A = A[A.date < LAST].reset_index(drop=True)
if not FINAL: A.loc[A[f"end{HZ}"] >= LOCK, [f"y{HZ}", f"x{HZ}", "y21", "x21", "dd63"]] = np.nan
YEARS = list(range(2021, A.date.max().year + 1)) if FINAL else list(range(2012, 2021))
START = pd.Timestamp(f"{YEARS[0]}-01-01")
KEYS = ["strong-sell", "sell", "neutral", "buy", "strong-buy"]
tgt, end = f"x{HZ}", f"end{HZ}"
FEATS = CANDIDATES.get(NAME)
pred = pd.Series(np.nan, index=A.index); grade = pd.Series(index=A.index, dtype=object); fits = []
for y in YEARS:
    s = pd.Timestamp(f"{y}-01-01")
    tr = A[A[end] < s].dropna(subset=[tgt]); te = A[(A.date >= s) & (A.date < pd.Timestamp(f"{y+1}-01-01"))]
    if NAME == "ladder":
        grade.loc[te.index] = te.ladder.map({2: "strong-buy", 1: "buy", 0: "neutral", -1: "sell", -2: "strong-sell"}); pred.loc[te.index] = te.ladder; continue
    m = Ridge(FEATS, 1000).fit(tr, tr[tgt].values); fits.append((y, m))
    pt = m.predict(tr); p10, p30, p70, p90 = np.percentile(pt, [10, 30, 70, 90]); p = m.predict(te); pred.loc[te.index] = p
    grade.loc[te.index] = np.select([(p >= p90) & (p > 2 * COST), (p >= p70) & (p > 2 * COST), (p <= p10) & (p < -2 * COST), (p <= p30) & (p < -2 * COST)], ["strong-buy", "buy", "strong-sell", "sell"], "neutral")
D = A[A.date >= START].copy(); D["g"] = grade.loc[D.index]; D["p"] = pred.loc[D.index]; D = D.dropna(subset=["g"])
if "--confirm" in sys.argv:
    # A grade changes only after the new one holds for two month-ends in a row: the tested guard against flicker.
    def confirm(x):
        out = []; cur = None; prev = None
        for g in x:
            if cur is None or g == cur: cur = g
            elif g == prev: cur = g
            prev = g; out.append(cur)
        return pd.Series(out, x.index)
    D = D.sort_values(["sym", "date"]); D["g"] = D.groupby("sym").g.transform(confirm)
if fits:
    y, m = fits[-1]; print("weights at last refit", y, {f: round(float(w) * 100, 2) for f, w in zip(m.f, m.w)}, "base", round(m.b0 * 100, 2))

def boot(s, n=500, block=None):
    x = np.asarray(s.dropna()); 
    if len(x) < 6: return (np.nan, np.nan)
    b = max(1, block or 3); rng = np.random.default_rng(0); out = []
    for _ in range(n):
        idx = np.concatenate([np.arange(i, i + b) % len(x) for i in rng.integers(0, len(x), len(x) // b + 1)])[:len(x)]
        out.append(x[idx].mean())
    return np.percentile(out, [5, 95])
rows = []
yr = lambda c: f"y{HZ}" if c == "abs" else f"x{HZ}"
for k in KEYS:
    g = D[D.g == k]
    if not len(g): rows.append({"grade": k, "n": 0}); continue
    wx = g.groupby("date")[tgt].mean(); wy = g.groupby("date")[f"y{HZ}"].mean(); lo, hi = boot(wx, block=HZ // 21)
    w = g[f"y{HZ}"].dropna()
    rows.append({"grade": k, "n": len(g), "months": g.date.nunique(), "ret%": wy.mean() * 100 - 2 * COST * 100, "excess%": wx.mean() * 100 - 2 * COST * 100, "ex_lo": lo * 100 - .2, "ex_hi": hi * 100 - .2, "win%": (w > 2 * COST).mean() * 100, "avg_win%": w[w > 2 * COST].mean() * 100, "avg_loss%": w[w <= 2 * COST].mean() * 100, "worst3m%": g.groupby("date").dd63.mean().mean() * 100})
print(pd.DataFrame(rows).round(1).to_string(index=False))

def sim(keep):
    "Monthly: equal money in the kept names, entered at the next open, idle money at 0%. Returns are 21 days per month."
    last = {}; out = []; turn = []
    for d, g in D.groupby("date"):
        g = g.dropna(subset=["y21"])
        if not len(g): continue
        h = g[keep(g)]; w = {s: 1 / len(g) for s in h.sym}
        t = sum(abs(w.get(s, 0) - last.get(s, 0)) for s in set(w) | set(last)); turn.append(t)
        out.append((h.y21.sum() / len(g)) - t * COST); last = w
    r = np.array(out); v = np.cumprod(1 + r); yrs = len(r) / 12
    return {"cagr": (v[-1] ** (1 / yrs) - 1) * 100, "vol": r.std() * 12 ** .5 * 100, "sharpe": r.mean() / r.std() * 12 ** .5, "maxdd": (v / np.maximum.accumulate(v)).min() * 100 - 100, "turn_yr": np.mean(turn) * 12, "in%": np.mean([keep(g).mean() for _, g in D.groupby("date")]) * 100, "months": len(r)}
fmt = lambda x: {k: round(float(v), 2) for k, v in x.items()}
print("hold whole universe ", fmt(sim(lambda g: pd.Series(True, g.index))))
print("model buy+strong    ", fmt(sim(lambda g: g.g.isin(["buy", "strong-buy"]))))
print("model not sell      ", fmt(sim(lambda g: ~g.g.isin(["sell", "strong-sell"]))))
print("ladder buy+strong   ", fmt(sim(lambda g: g.ladder >= 1)))
print("ladder not sell     ", fmt(sim(lambda g: g.ladder >= 0)))
spy = A0[A0.sym == "SPY"].set_index("date").y21; spy = spy[(spy.index >= START) & (spy.index < LAST)].dropna(); v = np.cumprod(1 + spy.values)
print("SPY                 ", fmt({"cagr": (v[-1] ** (12 / len(v)) - 1) * 100, "vol": spy.std() * 12 ** .5 * 100, "sharpe": spy.mean() / spy.std() * 12 ** .5, "maxdd": (v / np.maximum.accumulate(v)).min() * 100 - 100, "months": len(v)}))
f = D.sort_values("date").groupby("sym").g.apply(lambda x: (x != x.shift()).sum() / max(1, len(x) / 12)); print("grade changes per year (median)", round(f.median(), 1))
ic = ic_series(D, D.p, tgt); print("IC", round(ic.mean(), 3), "t", round(nw_t(ic.values, HZ // 21), 2), "by year", ic.groupby(ic.index.year).mean().round(2).to_dict())
dic = ic_series(D, D.p, "dd63"); print("IC with the next 3 months' deepest fall", round(dic.mean(), 3), "t", round(nw_t(dic.values, 3), 2))

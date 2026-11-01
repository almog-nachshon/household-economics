# Fits the fixed configuration (all features, ridge 1000) on every finished row and writes the live model and a test
# fixture. Usage: python export.py <data dir> <repo lib dir>
# The per-grade ranges are from yearly walk-forward predictions, 2012 on, with the two-month confirmation.
import json, pickle, sys
import numpy as np, pandas as pd
from models import *
from features import build, base
OUT, LIB = sys.argv[1], sys.argv[2]
HZ, COST = 63, .001
A0 = pd.read_pickle(OUT + "/panel.pkl"); A = A0[A0.univ].reset_index(drop=True); F = cols("all")
R = pickle.load(open(OUT + "/raw.pkl", "rb")); PX, SECT = R["px"], R["sectors"]
KEYS = ["strong-sell", "sell", "neutral", "buy", "strong-buy"]
def thresholds(m, tr): return np.percentile(m.predict(tr), [10, 30, 70, 90])
def to_grade(p, th):
    return np.select([(p >= th[3]) & (p > 2 * COST), (p >= th[2]) & (p > 2 * COST), (p <= th[0]) & (p < -2 * COST), (p <= th[1]) & (p < -2 * COST)], ["strong-buy", "buy", "strong-sell", "sell"], "neutral")
def confirm(x):
    out = []; cur = prev = None
    for g in x:
        if cur is None or g == cur: cur = g
        elif g == prev: cur = g
        prev = g; out.append(cur)
    return pd.Series(out, x.index)
rows = []
for y in range(2012, A.date.max().year + 1):
    s = pd.Timestamp(f"{y}-01-01"); tr = A[A.end63 < s].dropna(subset=["x63"]); te = A[(A.date >= s) & (A.date < pd.Timestamp(f"{y+1}-01-01"))].copy()
    m = Ridge(F, 1000).fit(tr, tr.x63.values); te["g"] = to_grade(m.predict(te), thresholds(m, tr)); rows.append(te)
D = pd.concat(rows).sort_values(["sym", "date"]); D["g"] = D.groupby("sym").g.transform(confirm)
stats = {}
for k in KEYS:
    g = D[D.g == k].dropna(subset=["y63"]); net = g.y63 - 2 * COST
    stats[k] = {"n": int(len(g)), "q10": float(net.quantile(.1)), "q50": float(net.quantile(.5)), "q90": float(net.quantile(.9))}
now = A0.date.max()
tr = A.dropna(subset=["x63"]); m = Ridge(F, 1000).fit(tr, tr.x63.values); th = thresholds(m, tr)
liq = A[A.date == A.date.max()].liq.min()
syms = "NVDA RTX LMT NOC GD ESLT BWXT AMD PLTR TSLA RKLB IONQ SOFI CCJ CEG OKLO SMR COHR AAOI AXTI GLW".split()
model = {"version": "cand-2026-11-01-ridge-all-1000-confirm2", "horizonDays": HZ, "trainedThrough": str(tr.end63.max().date()), "features": m.f, "mu": m.mu.tolist(), "sd": m.sd.tolist(), "w": m.w.tolist(), "b0": float(m.b0), "thresholds": th.tolist(), "cost": 2 * COST, "minDollarVolume": float(liq), "sectors": {s: SECT[s] for s in syms if SECT.get(s)}, "gradeStats": stats, "enabled": ["buy", "strong-buy"]}
json.dump(model, open(LIB + "/engine-model.json", "w"), indent=1)
print("model", {k: (round(v, 4) if isinstance(v, float) else v) for k, v in model.items() if k in ("trainedThrough", "minDollarVolume")}, "stats", {k: {a: round(b, 3) for a, b in v.items()} for k, v in stats.items()})
print("weights", {f: round(w * 100, 2) for f, w in zip(m.f, m.w)})
# The fixture: public prices with the Python features of the last row, for the JS parity test.
def rec(d): return [[str(i.date()), *[None if pd.isna(x) else float(x) for x in r]] for i, r in zip(d.index, d[["o", "h", "l", "c", "v", "a"]].values)]
fx = {"spy": rec(PX["SPY"].tail(400)), "cases": []}
for s, sec in (("NVDA", "XLK"), ("LMT", "XLI")):
    d = PX[s].tail(400); se = PX[sec].tail(400)
    f = build(d, base(PX["SPY"].tail(400)).c, base(se).c).iloc[-1]
    fx["cases"].append({"symbol": s, "bars": rec(d), "sectorBars": rec(se), "features": {k: (None if pd.isna(f[k]) else float(f[k])) for k in m.f}})
json.dump(fx, open(LIB + "/engine.fixture.json", "w"))
# Not the basis for anything: the user's own stocks, graded by the model, on the final years.
M = A0[A0.mine & A0.sym.notin(A.sym) if False else A0.mine].copy(); out = []
for y in range(2021, A.date.max().year + 1):
    s = pd.Timestamp(f"{y}-01-01"); tr2 = A[A.end63 < s].dropna(subset=["x63"]); te = M[(M.date >= s) & (M.date < pd.Timestamp(f"{y+1}-01-01"))].copy()
    if len(te): mm = Ridge(F, 1000).fit(tr2, tr2.x63.values); te["g"] = to_grade(mm.predict(te), thresholds(mm, tr2)); out.append(te)
M = pd.concat(out)
print(M.groupby("g").agg(n=("x63", "count"), excess=("x63", lambda x: round(x.mean() * 100 - .2, 1)), ret=("y63", lambda x: round(x.mean() * 100 - .2, 1))).reindex(KEYS).to_string())

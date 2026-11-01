# Model selection on the validation years only. Every trial is printed and counted. The final years are not read here.
# Usage: python compare.py <data dir> <profile: stocks|funds>
import pickle, sys, json, warnings
import numpy as np, pandas as pd
from models import *
warnings.filterwarnings("ignore")
OUT, PROFILE = sys.argv[1], sys.argv[2]
A = pd.read_pickle(OUT + "/panel.pkl")
LOCK = pd.Timestamp("2021-01-01")
hz = 63 if PROFILE == "stocks" else 252
A = (A[A.univ] if PROFILE == "stocks" else A[A.fund]).copy()
A = A[A.date < LOCK].reset_index(drop=True)
# Only what had already finished by the lock date, so no final-period return leaks into a late training row.
A.loc[A[f"end{hz}"] >= LOCK, [f"y{hz}", f"x{hz}"]] = np.nan
YEARS = list(range(2012, 2021))
VAL = A[A.date >= "2012-01-01"]
lag = hz // 21
trials = []
def report(name, p):
    d = VAL; pv = p.loc[d.index]
    for tgt in (f"x{hz}", f"y{hz}"):
        ic = ic_series(d, pv, tgt); sp = spread_series(d, pv, tgt)
        by = ic.groupby(ic.index.year).mean()
        trials.append({"model": name, "target": tgt, "ic": ic.mean(), "ic_t": nw_t(ic.values, lag), "yrs_pos": (by > 0).mean(), "q5_q1": sp.mean() * 100, "q5_q1_t": nw_t(sp.values, lag), "n": int(pv.notna().sum())})
report("ladder (live today)", A.ladder.astype(float))
for s in A.columns.intersection(["t_d200", "m_12_1", "m_6_1", "k_vol", "k_dd", "m_rsi"]):
    report(f"single {s}", A[s].astype(float))
for setname in SETS:
    for alpha in (10, 1000, 10000):
        p = walk(A, lambda: Ridge(cols(setname), alpha), hz, YEARS, f"x{hz}")
        report(f"ridge {setname} a={alpha}", p)
sys.path.insert(0, sys.argv[3] if len(sys.argv) > 3 else "")
try:
    from sklearn.ensemble import HistGradientBoostingRegressor as H
    class GBM:
        def __init__(self, f): self.f = f; self.m = H(max_depth=3, learning_rate=.05, max_iter=150, min_samples_leaf=200, random_state=0)
        def fit(self, d, y): self.m.fit(d[self.f].values, np.clip(y, *np.nanpercentile(y, [1, 99]))); return self
        def predict(self, d): return self.m.predict(d[self.f].values)
    report("gbm all", walk(A, lambda: GBM(cols("all")), hz, YEARS, f"x{hz}"))
except ImportError as e:
    print("no gbm", e)
T = pd.DataFrame(trials).round(3)
pd.set_option("display.width", 200); pd.set_option("display.max_rows", 200)
print("profile", PROFILE, "horizon", hz, "rows", len(VAL), "symbols", VAL.sym.nunique(), "trials", T.model.nunique())
print(T[T.target == f"x{hz}"].sort_values("ic", ascending=False).drop(columns="target").head(16).to_string(index=False))
print("-- absolute return target, same models, top 6")
print(T[T.target == f"y{hz}"].sort_values("ic", ascending=False).drop(columns="target").head(6).to_string(index=False))
T.to_csv(f"{OUT}/trials_{PROFILE}.csv", index=False)

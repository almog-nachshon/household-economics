# Shared by compare.py and final.py: feature groups, models fitted on past data only, and honest statistics.
import numpy as np, pandas as pd
GROUPS = {
    "trend": ["t_d200", "t_d50", "t_slope50", "t_cross", "t_adx"],
    "mom": ["m_21", "m_63", "m_6_1", "m_12_1", "m_rsi_up", "m_rsi_dn", "m_rs63", "m_rsec63"],
    "vol": ["v_rel", "v_conf", "v_obv"],
    "risk": ["k_atr", "k_vol", "k_dvol", "k_dd"],
    "mkt": ["x_spy200", "x_spyvol"],
}
SETS = {
    "trend": ["trend"], "mom": ["mom"], "risk": ["risk"], "vol": ["vol"],
    "trend+mom": ["trend", "mom"], "trend+risk": ["trend", "risk"], "trend+mom+risk": ["trend", "mom", "risk"],
    "all": ["trend", "mom", "vol", "risk", "mkt"],
}
def cols(name): return [c for g in SETS[name] for c in GROUPS[g]]

class Ridge:
    "Standardized, clipped at 3 SD, target clipped at its 1st and 99th percentile; everything learned from the train rows."
    def __init__(self, features, alpha): self.f, self.alpha = features, alpha
    def fit(self, d, y):
        X = d[self.f].values
        self.mu, self.sd = np.nanmean(X, 0), np.nanstd(X, 0) + 1e-9
        Z = np.clip((np.nan_to_num(X, nan=0) * 1.0 - self.mu) / self.sd, -3, 3)
        Z[np.isnan(X)] = 0
        lo, hi = np.nanpercentile(y, [1, 99]); t = np.clip(y, lo, hi)
        self.b0 = t.mean()
        self.w = np.linalg.solve(Z.T @ Z + self.alpha * np.eye(Z.shape[1]), Z.T @ (t - self.b0))
        return self
    def predict(self, d):
        X = d[self.f].values
        Z = np.clip((np.nan_to_num(X, nan=0) * 1.0 - self.mu) / self.sd, -3, 3)
        Z[np.isnan(X)] = 0
        return self.b0 + Z @ self.w

def nw_t(s, lag):
    "t-statistic of a monthly series' mean, with Newey-West errors for the overlap of long horizons."
    x = np.asarray(s, float); x = x[~np.isnan(x)]; n = len(x)
    if n < 12: return np.nan
    e = x - x.mean(); v = (e @ e) / n
    for k in range(1, lag + 1):
        v += 2 * (1 - k / (lag + 1)) * (e[k:] @ e[:-k]) / n
    return x.mean() / (v / n) ** .5

def ic_series(d, pred, y):
    g = d.assign(p=pred, t=d[y]).dropna(subset=["p", "t"])
    return g.groupby("date").apply(lambda x: x.p.rank().corr(x.t.rank()) if len(x) > 20 and x.p.nunique() > 1 else np.nan, include_groups=False)

def spread_series(d, pred, y, q=.2):
    g = d.assign(p=pred, t=d[y]).dropna(subset=["p", "t"])
    def one(x):
        if len(x) < 20 or x.p.nunique() < 3: return np.nan
        return x[x.p >= x.p.quantile(1 - q)].t.mean() - x[x.p <= x.p.quantile(q)].t.mean()
    return g.groupby("date").apply(one, include_groups=False)

def walk(A, make, hz, years, target):
    "Yearly refit on everything whose target had ended before the year began (the purge that stops overlap leaking)."
    out = pd.Series(np.nan, index=A.index)
    end = f"end{hz}"
    for y in years:
        start = pd.Timestamp(f"{y}-01-01")
        tr = A[(A[end] < start)].dropna(subset=[target])
        te = A[(A.date >= start) & (A.date < pd.Timestamp(f"{y + 1}-01-01"))]
        if len(tr) < 500 or not len(te): continue
        m = make().fit(tr, tr[target].values)
        out.loc[te.index] = m.predict(te)
    return out

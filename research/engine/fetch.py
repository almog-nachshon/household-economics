# Downloads public daily prices for the engine's research. Usage: python fetch.py <data dir>
# Pool: today's S&P 500 list, plus liquid funds. The list is today's, so stocks that later left the market are missing:
# survivorship is reduced by the monthly liquidity rule in features.py, not removed.
import csv, io, json, os, pickle, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
import pandas as pd

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
FUNDS = "SPY QQQ DIA IWM MDY EFA EEM VGK EWJ VTI VOO XLK XLF XLE XLV XLI XLY XLP XLU XLB XLRE XLC SMH ITA XAR GLD SLV TLT IEF NLR URA VT".split()
MINE = "NVDA RTX LMT NOC GD ESLT BWXT AMD PLTR TSLA RKLB IONQ SOFI CCJ CEG OKLO SMR COHR AAOI AXTI GLW".split()
SECTOR = {"Information Technology": "XLK", "Financials": "XLF", "Energy": "XLE", "Health Care": "XLV", "Industrials": "XLI", "Consumer Discretionary": "XLY", "Consumer Staples": "XLP", "Utilities": "XLU", "Materials": "XLB", "Real Estate": "XLRE", "Communication Services": "XLC"}

def curl(u):
    return subprocess.run(["curl", "-s", "-m", "40", "-A", "Mozilla/5.0", u], capture_output=True, text=True).stdout

rows = list(csv.DictReader(io.StringIO(curl("https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv"))))
sectors = {r["Symbol"].replace(".", "-"): SECTOR.get(r.get("GICS Sector") or r.get("Sector")) for r in rows}
print("pool", len(sectors))

def get(s):
    u = f"https://query1.finance.yahoo.com/v8/finance/chart/{s}?period1=1104537600&period2=1798761600&interval=1d"
    try:
        r = json.loads(curl(u))["chart"]["result"][0]
        q = r["indicators"]["quote"][0]
        d = pd.DataFrame({"o": q["open"], "h": q["high"], "l": q["low"], "c": q["close"], "v": q["volume"], "a": r["indicators"]["adjclose"][0]["adjclose"]}, index=pd.to_datetime(r["timestamp"], unit="s").normalize())
        d = d.dropna(subset=["o", "h", "l", "c", "a"])
        d = d[(d.c > 0) & (d.o > 0)]
        return s, d[~d.index.duplicated(keep="last")]
    except Exception:
        return s, None

syms = sorted(set(sectors) | set(FUNDS) | set(MINE))
with ThreadPoolExecutor(8) as ex:
    px = {s: d for s, d in ex.map(get, syms) if d is not None and len(d) > 300}
pickle.dump({"px": px, "sectors": sectors, "funds": FUNDS, "mine": MINE}, open(OUT + "/raw.pkl", "wb"))
print("symbols", len(px), "from", min(d.index[0] for d in px.values()).date(), "to", max(d.index[-1] for d in px.values()).date())

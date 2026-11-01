"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/components/Theme";

const RANGES = [["5d", "שבוע"], ["1mo", "חודש"], ["3mo", "3 חודשים"], ["1y", "שנה"], ["5y", "5 שנים"]];
const SINCE = { "5d": "בשבוע האחרון", "1mo": "בחודש האחרון", "3mo": "ב-3 חודשים", "1y": "בשנה האחרונה", "5y": "ב-5 שנים" };
const CUR = { USD: "$", GBP: "£", EUR: "€", ILS: "₪" };
// TradingView's own up and down colors; the moving averages keep the same colors in every chart.
const UP = "#089981";
const DOWN = "#f23645";
const MA50 = "#2962ff";
const MA200 = "#ff6d00";
const IL = { timeZone: "Asia/Jerusalem" };
const SKIN = {
  light: { bg: "#ffffff", text: "#66757d", grid: "#f0f3f4", border: "#e3ecee" },
  dark: { bg: "#1e222d", text: "#9598a1", grid: "#2a2e39", border: "#2a2e39" },
};

const stamp = (t, withTime) =>
  new Date(t * 1000).toLocaleString("he-IL", withTime ? { ...IL, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" } : { ...IL, day: "numeric", month: "numeric", year: "2-digit" });

// The price chart in the details panel, drawn with TradingView's open-source Lightweight Charts (loaded only when a
// panel opens): candles or a line, volume, the 50 and 200 day averages on the daily ranges, a crosshair, and zoom and
// pan with the wheel or a finger. Data from /api/chart, in Israel time. Over the chart, like TradingView: open, high,
// low, close and the move under the pointer, and otherwise the move over the whole range.
export default function PriceChart({ symbol }) {
  const [range, setRange] = useState("5d");
  const [kind, setKind] = useState("candles");
  const [data, setData] = useState({});
  const [hover, setHover] = useState(null);
  const box = useRef(null);
  const theme = useTheme();
  useEffect(() => {
    if (data[range]) return;
    let gone = false;
    fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then((r) => r.json())
      .then((d) => !gone && setData((x) => ({ ...x, [range]: d })))
      .catch(() => !gone && setData((x) => ({ ...x, [range]: { error: "network" } })));
    return () => {
      gone = true;
    };
  }, [symbol, range, data]);

  const d = data[range];
  const bars = d?.candles ?? [];
  const intraday = range === "5d" || range === "1mo";

  useEffect(() => {
    if (bars.length < 2 || !box.current) return;
    let chart;
    let gone = false;
    import("lightweight-charts").then(({ createChart, CrosshairMode }) => {
      if (gone || !box.current) return;
      chart = createChart(box.current, {
        autoSize: true,
        layout: { background: { color: SKIN[theme].bg }, textColor: SKIN[theme].text, fontSize: 11, fontFamily: "Inter, system-ui, sans-serif" },
        grid: { vertLines: { color: SKIN[theme].grid }, horzLines: { color: SKIN[theme].grid } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: SKIN[theme].border, scaleMargins: { top: 0.06, bottom: 0.22 } },
        timeScale: {
          borderColor: SKIN[theme].border,
          timeVisible: intraday,
          secondsVisible: false,
          tickMarkFormatter: (t, type) => new Date(t * 1000).toLocaleString("he-IL", type >= 3 ? { ...IL, hour: "2-digit", minute: "2-digit" } : type === 0 ? { ...IL, year: "numeric" } : type === 1 ? { ...IL, month: "short" } : { ...IL, day: "numeric", month: "numeric" }),
        },
        localization: { locale: "en-US", timeFormatter: (t) => stamp(t, intraday) },
      });
      const main = kind === "candles"
        ? chart.addCandlestickSeries({ upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, borderVisible: false })
        : chart.addLineSeries({ color: bars[bars.length - 1].close >= (d.prev ?? bars[0].open) ? UP : DOWN, lineWidth: 2 });
      main.setData(kind === "candles" ? bars : bars.map((b) => ({ time: b.time, value: b.close })));
      const vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
      vol.setData(bars.map((b) => ({ time: b.time, value: b.volume ?? 0, color: b.close >= b.open ? `${UP}55` : `${DOWN}55` })));
      for (const [line, color] of [[d.ma50, MA50], [d.ma200, MA200]]) {
        if (line?.length) chart.addLineSeries({ color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }).setData(line);
      }
      chart.timeScale().fitContent();
      chart.subscribeCrosshairMove((p) => {
        const b = p.time ? bars.find((x) => x.time === p.time) : null;
        setHover(b ?? null);
      });
    });
    return () => {
      gone = true;
      if (chart) chart.remove();
      setHover(null);
    };
  }, [bars, kind, intraday, d, theme]);

  const tabs = (
    <div className="pc-bar">
      <div className="pc-tabs" role="tablist">
        {RANGES.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={range === k} className={range === k ? "on" : ""} onClick={() => setRange(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="pc-tabs">
        <button type="button" className={kind === "candles" ? "on" : ""} onClick={() => setKind("candles")}>נרות</button>
        <button type="button" className={kind === "line" ? "on" : ""} onClick={() => setKind("line")}>קו</button>
      </div>
    </div>
  );
  if (!d) return <div className="pc">{tabs}<div className="pc-empty">טוען גרף…</div></div>;
  if (d.error || bars.length < 2) return <div className="pc">{tabs}<div className="pc-empty">אין נתוני גרף כרגע</div></div>;

  const cur = CUR[d.currency] ?? "";
  const fmt = (c) => `${cur}${c.toLocaleString("en-US", { minimumFractionDigits: c >= 1000 ? 0 : 2, maximumFractionDigits: c >= 1000 ? 0 : 2 })}`;
  const last = bars[bars.length - 1];
  const base = d.prev ?? bars[0].open;
  const move = (r) => <span className={r >= 0 ? "pos" : "neg"}>{r >= 0 ? "▲" : "▼"} {Math.abs(r * 100).toFixed(2)}%</span>;
  return (
    <div className="pc">
      {tabs}
      {hover ? (
        <div className="pc-head pc-ohlc" dir="ltr">
          <span>O <b>{fmt(hover.open)}</b></span>
          <span>H <b>{fmt(hover.high)}</b></span>
          <span>L <b>{fmt(hover.low)}</b></span>
          <span>C <b>{fmt(hover.close)}</b></span>
          {move(hover.close / hover.open - 1)}
          <span className="label">{stamp(hover.time, intraday)}</span>
        </div>
      ) : (
        <div className="pc-head">
          <b dir="ltr">{fmt(last.close)}</b> {move(last.close / base - 1)} <span className="label">{SINCE[range]}</span>
          {d.ma50?.length > 0 && <span className="pc-ma"><i style={{ background: MA50 }} /> ממוצע 50 <i style={{ background: MA200 }} /> ממוצע 200</span>}
        </div>
      )}
      <div className="pc-chart" dir="ltr" ref={box} />
    </div>
  );
}

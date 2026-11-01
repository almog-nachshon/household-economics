import Logo from "@/components/Logo";
import Info from "@/components/Info";
import StatusTag from "@/components/StatusTag";
import PriceChart from "@/components/PriceChart";
import ResearchPanel from "@/components/ResearchPanel";
import TechPanel from "@/components/TechPanel";
import { LiveChange, LiveWeek } from "@/components/Live";
import { STATUS, WEIGHTS } from "@/lib/research";

const CUR = { USD: "$", GBP: "£", EUR: "€", ILS: "₪" };
const pct = (x, d = 1) => (x == null ? "—" : `${(x * 100).toFixed(d)}%`);
const signed = (x) => (x == null ? "—" : `${x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`);
const Ret = ({ x }) => <span className={x > 0 ? "pos" : x < 0 ? "neg" : ""}>{signed(x)}</span>;
// The symbol's chart on TradingView: London funds and the metals go by their TradingView names.
const TV_NAMES = { "GC=F": "TVC:GOLD", "SI=F": "TVC:SILVER", "HG=F": "COMEX:HG1!" };
const tvUrl = (s) => `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(TV_NAMES[s] ?? (s.endsWith(".L") ? `LSE:${s.slice(0, -2)}` : s))}`;
const day = (d) => (d ? new Date(d).toLocaleDateString("he-IL", { timeZone: "UTC" }) : "—");

// Everything about one stock, fund or metal, opened from its row in the holdings or ranking table: the status and why
// (the research's bottom line, today's timing, a duplicate), a TradingView-style price chart, the key numbers, the
// position when held (with its real weight counting what the funds hold of it), the full research with its sources,
// what the company or fund is, and links to IBKR, TradingView, Finviz and Yahoo.
// q: lib/portfolio.js loadMarket entry; h: the holding (lib/holdings.js) or null; st: status; g: signal (lib/signals.js);
// r: research (lib/research.js loadResearch); lt: lib/overlap.js lookThrough entry; fmt: the page's money formatters.
export default function Details({ symbol, name, type, bucket, q, h, st, tech, g, r, lt, total, fmt, links, about }) {
  const changed = r?.prevVerdict && r.prevVerdict !== r.verdict ? STATUS[r.prevVerdict] : null;
  const numbers = [
    ["מחיר", q?.price != null ? <><b dir="ltr">{CUR[q.currency] ?? ""}{q.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b>{q.priceIls ? <span className="label"> · {fmt.ils(q.priceIls)}</span> : null}</> : "—"],
    ["היום", <LiveChange key="d" symbol={symbol} fallback={q?.d1} />],
    ["השבוע", <LiveWeek key="w" symbol={symbol} />],
    ["3 חודשים", <Ret x={q?.m3} />],
    ["שנה", <Ret x={q?.m12} />],
    ["RSI (14 יום)", g?.rsi != null ? <b>{Math.round(g.rsi)}</b> : "—", "מומנטום 0-100: מעל 70 עלתה מהר מדי, מתחת ל-30 ירדה מהר מדי"],
    ["מול ממוצע 50 יום", <Ret x={g?.sma50} />],
    ["מול ממוצע 200 יום", <Ret x={g?.sma200} />, "מעל = מגמת עלייה ארוכה"],
    ["מהשיא השנתי", <Ret x={g?.fromHigh} />],
    ["תנודתיות שנתית", pct(q?.vol), "כמה המחיר קופץ בשנה. מעל 40% = תנודתי מאוד"],
    ["ירידה מקסימלית בשנה", <Ret x={q?.maxDrawdown} />],
    ["דיבידנד", q?.divYield > 0 ? pct(q.divYield) : "—"],
    ["דוח רבעוני הבא", day(g?.earnings ?? r?.earnings)],
    ...(g?.analysts ? [["אנליסטים (Finnhub)", `${g.analysts.buy} קנייה · ${g.analysts.hold} החזקה · ${g.analysts.sell} מכירה`]] : []),
  ];
  return (
    <div className="dt">
      <div className="dt-head">
        <div className="dt-title">
          <Logo id={symbol} label={name} size={34} />
          <div>
            <div><b className="dt-sym">{symbol}</b> <span className="label">{name}</span></div>
            <div className="dt-tags">
              <span className="xtag">{type}</span>
              {bucket && <span className="tag" style={{ background: bucket.color, color: bucket.ink, marginInlineStart: 0 }}>{bucket.name}</span>}
            </div>
          </div>
        </div>
        <StatusTag st={st} big />
      </div>

      <div className={`dt-status dt-status-${st?.key ?? "none"}`}>
        {r?.summary ? <p>{r.summary}</p> : null}
        {st?.timing && <p className="dt-why">⏱ היום: {st.timing.join(" · ")}. המחקר עצמו: {STATUS[r?.verdict]?.join(" ")}.</p>}
        {st?.dup && <p className="dt-why">⛔ {st.dup.reason}{st.base ? ` (המחקר על הקרן עצמה: ${STATUS[st.base]?.join(" ")})` : ""}</p>}
        {st && !st.research && !st.dup && <p className="dt-why">אין עדיין מחקר מעמיק על {symbol}: הסטטוס לפי הנתונים הטכניים והאנליסטים בלבד.</p>}
        {changed && <p className="label">השתנה במחקר האחרון: היה {changed.join(" ")}.</p>}
      </div>

      <div className="dt-body">
        <PriceChart symbol={symbol} />
        <div className="dt-kv">
          {numbers.map(([k, v, tip]) => (
            <div key={k}>
              <span>{k}{tip ? <Info text={tip} /> : null}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>

      <TechPanel t={tech} cur={CUR[q?.currency] ?? ""} />

      {h && (
        <div className="dt-pos">
          <b>💼 ההחזקה שלי</b>
          <div className="dt-kv dt-kv-pos">
            <div><span>יחידות</span><span>{Math.round(h.units * 1000) / 1000}</span></div>
            <div><span>מחיר קנייה ממוצע</span><span>{h.units ? fmt.unitPrice(h.cost / h.units) : "—"}</span></div>
            <div><span>הושקע</span><span>{fmt.withIls(h.cost)}</span></div>
            <div><span>שווי</span><span>{fmt.withIls(h.value)}</span></div>
            <div><span>רווח / הפסד</span><span className={h.profit >= 0 ? "pos" : "neg"}>{fmt.withIls(h.profit)} ({signed(h.pct)})</span></div>
            <div><span>חלק מהחשבון</span><span>{total ? pct(h.value / total) : "—"}</span></div>
          </div>
        </div>
      )}
      {lt?.via > 0 && (
        <p className="dt-lt">
          🧩 החשיפה האמיתית ל-{symbol}: <b>{lt.pct.toFixed(1)}% מהחשבון</b>
          {lt.direct > 0 ? ` (${((lt.direct / total) * 100).toFixed(1)}% ישירות` : " (0% ישירות"}
          {lt.parts.map((p) => ` + ${((p.value / total) * 100).toFixed(1)}% דרך ${p.fund}`).join("")})
          <Info text="כמה מהחשבון באמת יושב במניה הזו: ההחזקה הישירה ועוד החלק שלה בתוך כל קרן שמחזיקים, לפי המשקל שלה בקרן." />
        </p>
      )}

      {r ? <ResearchPanel symbol={symbol} weights={WEIGHTS} labels={STATUS} /> : null}

      {about && <p className="dt-about">{about}</p>}
      <div className="dt-links">
        {links.ibkr && <a href={links.ibkr} target="_blank" rel="noreferrer">באינטראקטיב ↗</a>}
        {links.ibkrDetails && <a href={links.ibkrDetails} target="_blank" rel="noreferrer">פרטי החוזה ↗</a>}
        <a href={tvUrl(symbol)} target="_blank" rel="noreferrer">TradingView ↗</a>
        {links.finviz && <a href={links.finviz} target="_blank" rel="noreferrer">Finviz ↗</a>}
        <a href={`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`} target="_blank" rel="noreferrer">Yahoo Finance ↗</a>
      </div>
    </div>
  );
}

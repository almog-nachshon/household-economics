"use client";
import { useEffect, useState } from "react";

const TIER = { 1: ["רשמי", "מקור ראשוני: החברה, הבורסה, מנפיק הקרן, ספק המדד"], 2: ["מקצועי", "אתר נתונים, חדשות או ריכוז אנליסטים מוכר"], 3: ["דעה", "דעות ורשתות: נכנס רק לחלק הסנטימנט"] };
const KIND = { analysts: "אנליסטים", revisions: "שינויי המלצות", earnings: "דוחות", technicals: "טכני", valuation: "תמחור", sentiment: "סנטימנט", composition: "הרכב הקרן", macro: "מאקרו", news: "חדשות" };

// One symbol's deep research, loaded when its details open (/api/research): the reasons, the five parts with their
// weights and scores (-2..+2) and what each is based on, the fused score against the thresholds, how it was checked,
// and every source with its reliability tier, rating, date and link. weights: [[part, name, %]]; labels: {verdict: [icon, label]}.
export default function ResearchPanel({ symbol, weights, labels }) {
  const [r, setR] = useState(null);
  useEffect(() => {
    let gone = false;
    fetch(`/api/research?symbol=${encodeURIComponent(symbol)}`)
      .then((res) => res.json())
      .then((x) => !gone && setR(x))
      .catch(() => !gone && setR({ error: "network" }));
    return () => {
      gone = true;
    };
  }, [symbol]);
  if (!r) return <div className="rp rp-empty">טוען את המחקר…</div>;
  if (r.error) return <div className="rp rp-empty">אין עדיין מחקר מעמיק על {symbol}.</div>;
  const asOf = new Date(r.asOf).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" });
  const c = r.consensus ?? {};
  const sources = [...r.sources].sort((a, b) => a.tier - b.tier);
  return (
    <div className="rp">
      <div className="rp-head">
        <b>🔎 המחקר המעמיק</b>
        <span className="label">
          {asOf} · ביטחון {"★".repeat(r.confidence)}{"☆".repeat(5 - r.confidence)} · {r.sources.length} מקורות{r.checked ? ` · ${r.checked}` : ""}
        </span>
      </div>
      {r.reasons.length > 0 && <ul className="rp-reasons">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>}
      {(c.rating || c.avgTarget) && (
        <div className="rp-cons">
          קונצנזוס האנליסטים: <b>{c.rating || "—"}</b>
          {c.analystCount ? ` (${c.analystCount} אנליסטים)` : ""}
          {c.avgTarget ? <> · יעד ממוצע ל-12 חודשים <b dir="ltr">${c.avgTarget.toLocaleString("en-US")}</b>{c.upsidePct != null ? <span className={c.upsidePct >= 0 ? "pos" : "neg"}> ({c.upsidePct > 0 ? "+" : ""}{Math.round(c.upsidePct)}%)</span> : null}</> : null}
        </div>
      )}
      <div className="rp-parts">
        {weights.map(([k, name, w]) => {
          const p = r.components?.[k];
          if (!p) return null;
          const pctW = (Math.abs(p.score) / 2) * 50;
          return (
            <div key={k} className="rp-part">
              <span className="rp-name">{name} <span className="label">{w}%</span></span>
              <span className="rp-bar" title={`${p.score > 0 ? "+" : ""}${p.score} מתוך ±2`}>
                <span className={p.score >= 0 ? "rp-fill-pos" : "rp-fill-neg"} style={{ width: `${pctW}%`, [p.score >= 0 ? "left" : "right"]: "50%" }} />
              </span>
              <b className={p.score > 0 ? "pos" : p.score < 0 ? "neg" : ""} dir="ltr">{p.score > 0 ? "+" : ""}{p.score}</b>
              <span className="rp-note">{p.note_he}</span>
            </div>
          );
        })}
      </div>
      <div className="rp-score">
        ציון משוקלל <b dir="ltr">{r.score > 0 ? "+" : ""}{r.score}</b> → {labels[r.verdict]?.[0]} <b>{labels[r.verdict]?.[1]}</b>
        <span className="label"> (״לקנות״ מ-0.6 ומעלה, ״למכור״ מ-0.4- ומטה, באמצע ״לחכות״)</span>
      </div>
      {r.timing && <div className="rp-timing">⏱ {r.timing}</div>}
      <details className="rp-sources">
        <summary>כל {r.sources.length} המקורות</summary>
        <ul>
          {sources.map((s) => (
            <li key={s.url + s.name}>
              <span className={`tier tier-${s.tier}`} title={TIER[s.tier]?.[1]}>{TIER[s.tier]?.[0]}</span>
              <span className="label">{KIND[s.kind] ?? s.kind}</span>{" "}
              <a href={s.url} target="_blank" rel="noreferrer">{s.name}</a>
              {s.rating ? <> · <b>{s.rating}</b></> : null}
              {s.date ? <span className="label"> · {s.date}</span> : null}
              {s.note_he ? <div className="rp-src-note">{s.note_he}</div> : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

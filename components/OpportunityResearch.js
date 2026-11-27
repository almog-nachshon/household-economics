"use client";

import { useMemo, useState, useEffect } from "react";
import { validateOpportunityReport, rankOpportunities } from "@/lib/opportunity-report.mjs";

const STRATEGY = { momentum: "מומנטום ופריצה", earnings: "האצת רווחים", value: "איכות בתמחור", growth: "צמיחה", recovery: "התאוששות", other: "אחר" };
const DECISION = { WATCH: "מעקב", REVIEW: "למחקר נוסף", AVOID: "להימנע" };
const sample = {
  schemaVersion: "1.0", reportId: "research-YYYY-MM", researchDate: "2026-11-27",
  candidates: [{
    symbol: "VRSN", exchange: "NASDAQ", currency: "USD", strategy: "momentum",
    opportunityScore: 70, portfolioFitScore: null, decision: "WATCH",
    thesis: "דוגמת מבנה בלבד: יש להחליף במחקר עדכני ומאומת.",
    risks: ["מחיר ותמחור דורשים אימות"],
    sources: [{ title: "SEC EDGAR (דוגמה בלבד)", url: "https://www.sec.gov/edgar/search/", asOf: "2026-11-27" }],
    dataConfidence: "unverified", brokerAvailability: "unverified"
  }]
};

export default function OpportunityResearch() {
  const [reports, setReports] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [selection, setSelection] = useState("");
  const [filter, setFilter] = useState("ALL");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/opportunities", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("טעינת המחקרים מהשרת נכשלה");
        return response.json();
      })
      .then(data => setReports(Array.isArray(data.reports) ? data.reports : []))
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    return () => controller.abort();
  }, []);
  const active = reports.find(r => r.reportId === selection) || reports[0];
  const rows = useMemo(() => active ? rankOpportunities(active).filter(c => filter === "ALL" || c.strategy === filter) : [], [active, filter]);

  function parseDraft(value) {
    setDraft(value); setPreview(null); setError("");
    if (!value.trim()) return;
    try {
      if (value.length > 1024 * 1024) throw Error("הקובץ גדול מדי (מקסימום 1MB)");
      const parsed = JSON.parse(value);
      const checked = validateOpportunityReport(parsed);
      if (!checked.ok) throw Error(checked.errors.slice(0, 8).join("; "));
      setPreview(parsed);
    } catch (e) { setError(e.message); }
  }
  async function save() {
    if (!preview) return;
    setError("");
    try {
      const response = await fetch("/api/opportunities", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preview)
      });
      const result = await response.json();
      if (!response.ok) throw Error([result.error, ...(result.details || [])].filter(Boolean).join("; "));
      const list = await fetch("/api/opportunities", { cache: "no-store" });
      if (!list.ok) throw Error("הדוח נשמר אך טעינת הרשימה נכשלה");
      const data = await list.json();
      setReports(data.reports || []);
      setSelection(preview.reportId); setDraft(""); setPreview(null);
    } catch (e) { setError(e.message); }
  }
  function downloadTemplate() {
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "opportunities-template.json"; link.click(); URL.revokeObjectURL(url);
  }
  return <section dir="rtl" style={{ maxWidth: 1100, margin: "2rem auto", padding: "0 1rem" }}>
    <h1>🔎 גילוי הזדמנויות השקעה</h1>
    <p>מחקר ChatGPT חיצוני, ללא API. רשימות המועמדים אינן המלצות מסחר ואינן משנות את תיק ההחזקות.</p>
    <div style={{ border: "1px solid #91a5af", borderRadius: 12, padding: 16, marginBottom: 24 }}>
      <h2>ייצוא תיק וייבוא מחקר JSON</h2>
      <p><a href="/api/opportunities/context">⬇ ייצוא תיק מושחר למחקר ב־ChatGPT</a></p>
      <p>העתק JSON או בחר קובץ מחקר. הדוחות נשמרים <strong>במסד הנתונים הפרטי של האתר</strong>, בנפרד מהעסקאות והברוקר.</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" onClick={downloadTemplate}>הורד מבנה JSON לדוגמה</button>
        <label>בחר קובץ <input type="file" accept=".json,application/json" onChange={async (e) => {
          const file = e.target.files?.[0]; if (!file) return;
          if (file.size > 1024 * 1024) { setError("קובץ מעל 1MB"); return; }
          parseDraft(await file.text());
          e.target.value = "";
        }}/></label>
      </div>
      <textarea aria-label="הדבק מחקר JSON" value={draft} onChange={e => parseDraft(e.target.value)} placeholder="הדבק כאן JSON שהתקבל מ־ChatGPT" rows={5} style={{ width: "100%", fontFamily: "monospace", direction: "ltr" }}/>
      {error && <p role="alert" style={{ color: "#e05a70" }}>{error}</p>}
      {preview && <p>הדוח תקין: {preview.candidates.length} מועמדים, תאריך {preview.researchDate}. <button type="button" onClick={save}>שמור מחקר</button></p>}
    </div>
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
      <label>דוח <select value={active?.reportId || ""} onChange={e => setSelection(e.target.value)}>
        {reports.map(r => <option key={r.reportId} value={r.reportId}>{r.researchDate} — {r.reportId}</option>)}
      </select></label>
      <label>סוג הזדמנות <select value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="ALL">הכל</option>{Object.entries(STRATEGY).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
      </select></label>
    </div>
    {!active ? <p>לא יובא עדיין מחקר. התחל בהורדת תבנית והחזר לכאן דוח JSON מאומת.</p> :
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(285px, 1fr))", gap: 16 }}>
        {rows.map(c => <article key={c.symbol + c.exchange} style={{ border: "1px solid #91a5af", borderRadius: 12, padding: 16, overflowWrap: "anywhere" }}>
          <h3>{c.symbol} <small>{c.exchange} · {c.currency}</small></h3>
          <p>{STRATEGY[c.strategy]} · {DECISION[c.decision]}</p>
          <p><strong>הזדמנות {c.opportunityScore}/100</strong> | התאמה לתיק {c.portfolioFitScore ?? "לא נבדקה"}</p>
          <p>{c.thesis}</p>
          <strong>סיכונים</strong><ul>{c.risks.map((r,i) => <li key={i}>{r}</li>)}</ul>
          <p>אמינות נתונים: {c.dataConfidence} · זמינות בברוקר: {c.brokerAvailability}</p>
          <details><summary>מקורות ותאריכים</summary><ul>{c.sources.map((s,i) => <li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> ({s.asOf})</li>)}</ul></details>
        </article>)}
      </div>}
  </section>;
}

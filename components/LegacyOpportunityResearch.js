"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { parseOpportunityReport, rankOpportunities, REPORT_LIMIT_BYTES } from "@/lib/opportunity-report.mjs";

const VIEW_KEY = "opportunity-reports-view-v1";
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

function rememberView(selection, filter) {
  try { sessionStorage.setItem(VIEW_KEY, JSON.stringify({ selection, filter })); } catch { /* The view can still change in memory. */ }
}

export default function LegacyOpportunityResearch() {
  const [reports, setReports] = useState([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [selection, setSelection] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [saving, setSaving] = useState(false);
  const edit = useRef(0);

  useEffect(() => {
    try {
      const view = JSON.parse(sessionStorage.getItem(VIEW_KEY));
      if (typeof view?.selection === "string") setSelection(view.selection);
      if (view?.filter === "ALL" || Object.hasOwn(STRATEGY, view?.filter)) setFilter(view.filter);
    } catch { /* Ignore invalid view state. */ }
    const controller = new AbortController();
    const refresh = () => fetch("/api/opportunities", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("טעינת המחקרים מהשרת נכשלה");
        return response.json();
      })
      .then(data => setReports(Array.isArray(data.reports) ? data.reports : []))
      .catch(e => { if (e.name !== "AbortError") setError(e.message); });
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const active = reports.find(r => r.reportId === selection) || reports[0];
  const rows = useMemo(() => active ? rankOpportunities(active).filter(c => filter === "ALL" || c.strategy === filter) : [], [active, filter]);

  function parseDraft(value, fromFile = false) {
    setDraft(value); setPreview(null); setError("");
    if (!fromFile && !value.trim()) return;
    try {
      setPreview(parseOpportunityReport(value));
    } catch (e) { setError(e.message); }
  }

  async function readFile(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    input.value = "";
    const version = ++edit.current;
    setDraft(""); setPreview(null); setError("");
    if (file.size > REPORT_LIMIT_BYTES) {
      setError("הקובץ גדול מדי (מקסימום 1 MiB).");
      return;
    }
    try {
      const value = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      if (edit.current === version) parseDraft(value, true);
    } catch {
      if (edit.current === version) setError("לא ניתן לקרוא את הקובץ כטקסט UTF-8.");
    }
  }

  async function save() {
    if (!preview || saving) return;
    setError("");
    setSaving(true);
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
      setSelection(preview.reportId); setFilter("ALL"); setDraft(""); setPreview(null);
      rememberView(preview.reportId, "ALL");
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }
  function downloadTemplate() {
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "opportunities-template.json"; link.click(); URL.revokeObjectURL(url);
  }
  return <section dir="rtl" style={{ maxWidth: 1100, margin: "2rem auto", padding: "0 1rem" }}>
    <h1>היסטוריית מחקר 1.0</h1>
    <p><a href="/invest/opportunities">חזרה לגילוי הזדמנויות 4.1</a></p>
    <div style={{ border: "1px solid #91a5af", borderRadius: 12, padding: 16, marginBottom: 24 }}>
      <h2>ייצוא תיק וייבוא מחקר JSON</h2>
      <p><a href="/api/opportunities/context">⬇ ייצוא תיק מושחר למחקר ב־ChatGPT</a></p>
      <p>העתק JSON או בחר קובץ מחקר. הדוחות נשמרים <strong>במסד הנתונים הפרטי של האתר</strong>, בנפרד מהעסקאות והברוקר.</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" onClick={downloadTemplate}>הורד מבנה JSON לדוגמה</button>
        <label>בחר קובץ <input type="file" accept=".json,application/json" onChange={readFile} disabled={saving} /></label>
      </div>
      <textarea aria-label="הדבק מחקר JSON" value={draft} disabled={saving} onChange={e => {
        edit.current++;
        parseDraft(e.target.value);
      }} placeholder="הדבק כאן JSON שהתקבל מ־ChatGPT" rows={5} style={{ width: "100%", fontFamily: "monospace", direction: "ltr" }}/>
      {error && <p role="alert" style={{ color: "#e05a70" }}>{error}</p>}
      {preview && <p>הדוח תקין: {preview.candidates.length} מועמדים, תאריך {preview.researchDate}. <button type="button" disabled={saving} onClick={save}>שמור מחקר</button></p>}
    </div>
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
      <label><span id="legacy-report-label">דוח</span> <select aria-labelledby="legacy-report-label" value={active?.reportId || ""} disabled={!active} onChange={e => {
        setSelection(e.target.value);
        rememberView(e.target.value, filter);
      }}>
        {reports.map(r => <option key={r.reportId} value={r.reportId}>{r.researchDate} — {r.reportId}</option>)}
      </select></label>
      <label><span id="legacy-strategy-label">סוג הזדמנות</span> <select aria-labelledby="legacy-strategy-label" value={filter} disabled={!active} onChange={e => {
        setFilter(e.target.value);
        rememberView(active.reportId, e.target.value);
      }}>
        <option value="ALL">הכל</option>{Object.entries(STRATEGY).map(([key, title]) => <option key={key} value={key}>{title}</option>)}
      </select></label>
    </div>
    {!active ? <p>לא יובא עדיין מחקר. התחל בהורדת תבנית והחזר לכאן דוח JSON מאומת.</p> :
      !rows.length ? <p role="status">אין מועמדים באסטרטגיה שנבחרה בדוח זה.</p> :
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 285px), 1fr))", gap: 16 }}>
        {rows.map(c => <article key={JSON.stringify([c.symbol, c.exchange])} style={{ border: "1px solid #91a5af", borderRadius: 12, padding: 16, overflowWrap: "anywhere" }}>
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

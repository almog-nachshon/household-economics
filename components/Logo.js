"use client";
import { useState } from "react";

// Who is behind each symbol / provider, for its logo (the site's icon via Google's favicon service).
const DOMAINS = {
  VOO: "vanguard.com", VTI: "vanguard.com", "VUAA.L": "vanguard.com", "VWRA.L": "vanguard.com",
  "CSPX.L": "ishares.com", ITA: "ishares.com", QQQM: "invesco.com", SMH: "vaneck.com",
  XLK: "ssga.com", XLV: "ssga.com", XLF: "ssga.com", XLE: "ssga.com", XLI: "ssga.com", XAR: "ssga.com",
  LMT: "lockheedmartin.com", RTX: "rtx.com", NOC: "northropgrumman.com", GD: "gd.com", ESLT: "elbitsystems.com",
  NVDA: "nvidia.com", AMD: "amd.com", PLTR: "palantir.com", TSLA: "tesla.com", RKLB: "rocketlabusa.com", IONQ: "ionq.com",
  MSFT: "microsoft.com", GOOGL: "google.com", AMZN: "amazon.com", META: "meta.com", AVGO: "broadcom.com", TSM: "tsmc.com", AAPL: "apple.com",
  mor: "more.co.il", phoenix: "fnx.co.il", leumi: "leumi.co.il", max: "max.co.il",
};
const EMOJI = { "GC=F": "🥇", "SI=F": "🥈", "HG=F": "🟤" };

export default function Logo({ id, label, size = 22 }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, borderRadius: 6, flex: "none", verticalAlign: "middle" };
  if (EMOJI[id]) return <span style={{ ...style, display: "inline-grid", placeItems: "center", fontSize: size * 0.8 }}>{EMOJI[id]}</span>;
  const domain = DOMAINS[id];
  if (!domain || failed) {
    return (
      <span style={{ ...style, display: "inline-grid", placeItems: "center", background: "var(--accent-soft)", color: "var(--accent)", fontSize: size * 0.45, fontWeight: 700 }}>
        {(label || id || "?").replace(/[^A-Za-z֐-׿]/g, "").slice(0, 2)}
      </span>
    );
  }
  return <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt="" style={style} onError={() => setFailed(true)} />;
}

// Claude's mark (a sunburst), spinning while a run is in progress.
export function ClaudeMark({ size = 18, spinning = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={spinning ? "claude-spin" : ""} aria-label="Claude" style={{ flex: "none" }}>
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x="11" y="1.5" width="2" height="8" rx="1" fill="#D97757" transform={`rotate(${i * 30} 12 12)`} opacity={spinning ? 0.35 + (i / 12) * 0.65 : 1} />
      ))}
    </svg>
  );
}

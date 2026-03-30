import { useState } from "react";
import { marginColor, fmtAED, fmtIDR } from '../helpers.js';

const Badge = ({ text, color = "#2EAA5A", bg = "#0D2E1A" }) => <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "3px", fontSize: "10px", fontFamily: "monospace", background: bg, color, border: "1px solid " + color + "33" }}>{text}</span>;
const Spinner = () => <div style={{ width: "14px", height: "14px", border: "2px solid #C9A84C", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />;
const ConfidenceBadge = ({ confidence, c }) => { if (!confidence) return null; const color = confidence.level === "high" ? c.green : confidence.level === "medium" ? c.darkGold : c.red; return <span style={{ fontSize: "9px", fontWeight: 700, color, padding: "1px 5px", borderRadius: "3px", border: "1px solid " + color + "44", fontFamily: "monospace" }}>{confidence.score}/100</span>; };
const WaveStatusBar = ({ waves, c }) => { if (!waves?.length) return null; return (<div style={{ marginBottom: "12px", padding: "10px 12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px" }}><div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px", textTransform: "uppercase" }}>SEARCH WAVES</div>{waves.map((w, i) => { const icon = w.status === "ok" ? "\u2713" : w.status === "skip" ? "\u2014" : w.status === "empty" ? "\u25cb" : "\u2717"; const wColor = w.status === "ok" ? c.green : w.status === "skip" ? c.dimmer : w.status === "empty" ? c.darkGold : c.red; return (<div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", fontSize: "11px" }}><span style={{ color: wColor, fontWeight: 700, width: "14px", textAlign: "center" }}>{icon}</span><span style={{ color: c.text, minWidth: "120px" }}>{w.name}</span><span style={{ color: w.count > 0 ? c.green : c.dimmer, fontWeight: 600 }}>{w.count} results</span>{w.reason && <span style={{ color: c.dim, fontSize: "10px", fontStyle: "italic" }}>{w.reason}</span>}</div>); })}</div>); };

export { Badge, Spinner, ConfidenceBadge, WaveStatusBar };

// ══════════ PRODUCT TABLE (reused in Brainstorm + Discover) ══════════
// NOTE: ProductTable is defined inside App component because it uses 'c', 'dark', 'validatingIdx', etc.
// It's passed as a prop or defined in-page. We export a factory that takes the theme.

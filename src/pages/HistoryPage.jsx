import { useState } from "react";
import { Badge, ConfidenceBadge } from "../components/SharedUI";
import { STATUS_COLORS, STATUS_COLORS_LIGHT, MARGIN_THRESHOLD, getStyles } from "../constants";
import { marginColor, fmtIDR, fmtAED } from "../helpers";

export default function HistoryPage({ c, dark, history, setHistory, updateHistoryStatus, restoreFromHistory, exportQuickCSV, exportStructuredCSV, exportBackup, importBackup, backupFileRef, setMode }) {
  const { secStyle, btnStyle, btnSec, btnGreen } = getStyles(c);
  const [expandedHistoryIdx, setExpandedHistoryIdx] = useState(-1);
  const [histFilter, setHistFilter] = useState("all"); // all | candidates | investigated | rejected | active
  const candidates = history.filter(h => (h.margins?.median?.margin || 0) >= MARGIN_THRESHOLD.candidate);
  const statuses = ["Candidate", "Investigated", "Active", "Rejected"];

  const filtered = history.filter(h => {
    if (histFilter === "all") return true;
    if (histFilter === "candidates") return (h.margins?.median?.margin || 0) >= MARGIN_THRESHOLD.candidate;
    return (h.status || "").toLowerCase() === histFilter.toLowerCase();
  });

  return (
    <div style={secStyle}>
      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "16px" }}>
        {[
          { l: "TOTAL", v: history.length, cl: c.gold },
          { l: "CANDIDATES", v: candidates.length, cl: c.green },
          { l: "INVESTIGATED", v: history.filter(h => h.status === "Investigated").length, cl: c.darkGold || c.gold },
          { l: "ACTIVE", v: history.filter(h => h.status === "Active").length, cl: c.gold },
        ].map(s => (
          <div key={s.l} style={{ padding: "10px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
            <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px" }}>{s.l}</div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: s.cl }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Filter + export bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "4px" }}>
          {["all", "candidates", "Investigated", "Active", "Rejected"].map(f => (
            <button key={f} onClick={() => setHistFilter(f)} style={{ padding: "3px 8px", background: histFilter === f ? c.gold : "transparent", color: histFilter === f ? c.btnText : c.dim, border: "1px solid " + (histFilter === f ? c.gold : c.border), borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px", textTransform: "capitalize" }}>{f}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <button onClick={exportQuickCSV} style={{ padding: "3px 8px", background: "transparent", color: c.gold, border: "1px solid " + c.gold, borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px" }}>QUICK CSV</button>
          <button onClick={exportStructuredCSV} style={{ padding: "3px 8px", background: "transparent", color: c.gold, border: "1px solid " + c.gold, borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px" }}>FULL CSV</button>
          <button onClick={exportBackup} style={{ padding: "3px 8px", background: "transparent", color: c.green, border: "1px solid " + c.green, borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px" }}>BACKUP</button>
          <button onClick={() => backupFileRef.current?.click()} style={{ padding: "3px 8px", background: "transparent", color: c.dim, border: "1px solid " + c.border2, borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px" }}>IMPORT</button>
          <input ref={backupFileRef} type="file" accept=".json" style={{ display: "none" }} onChange={e => e.target.files?.[0] && importBackup(e.target.files[0])} />
        </div>
      </div>

      {/* History list */}
      {filtered.length === 0 && <div style={{ textAlign: "center", padding: "40px", color: c.dimmer }}>
        <div style={{ fontSize: "28px", marginBottom: "8px" }}>{"\ud83d\udccb"}</div>
        <div style={{ fontSize: "13px" }}>No lookups yet</div>
        <div style={{ fontSize: "11px", color: c.dimmest, marginTop: "4px" }}>Products you research will appear here</div>
      </div>}

      <div style={{ maxHeight: "500px", overflowY: "auto" }}>
        {filtered.map((h, realIdx) => {
          const idx = history.indexOf(h);
          const m = h.margins?.median?.margin || 0;
          const sc = dark ? STATUS_COLORS : STATUS_COLORS_LIGHT;
          const statusStyle = h.status && sc[h.status] ? { background: sc[h.status].bg, color: sc[h.status].text, border: "1px solid " + sc[h.status].border } : {};
          const isExpanded = expandedHistoryIdx === idx;
          return (
            <div key={idx} style={{ padding: "10px 12px", borderBottom: "1px solid " + c.border, background: isExpanded ? c.surface2 : "transparent" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }} onClick={() => setExpandedHistoryIdx(isExpanded ? -1 : idx)}>
                <span style={{ fontSize: "16px", fontWeight: 800, color: marginColor(m), minWidth: "50px", fontFamily: "monospace" }}>{m.toFixed(0)}%</span>
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: "12px", color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.uaeProduct?.product_name || "—"}</div>
                  <div style={{ fontSize: "10px", color: c.dim }}>{fmtAED(h.uaeProduct?.price_aed)} → {fmtIDR(h.medianPriceIDR)} · {h.timestamp?.slice(0, 10) || ""}</div>
                </div>
                {h.confidence && <ConfidenceBadge confidence={h.confidence} c={c} />}
                {h.status && <span style={{ ...statusStyle, padding: "2px 6px", borderRadius: "3px", fontSize: "9px", fontWeight: 700, fontFamily: "monospace" }}>{h.status}</span>}
                <span style={{ color: c.dimmest, fontSize: "10px" }}>{isExpanded ? "\u25be" : "\u25b8"}</span>
              </div>

              {/* Expanded detail */}
              {isExpanded && <div style={{ marginTop: "10px", padding: "10px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px" }}>
                {/* Status buttons */}
                <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
                  <span style={{ fontSize: "9px", color: c.dimmer, paddingTop: "4px" }}>STATUS:</span>
                  {statuses.map(s => (
                    <button key={s} onClick={() => updateHistoryStatus(idx, s)} style={{ padding: "3px 8px", background: h.status === s ? (sc[s]?.bg || "transparent") : "transparent", color: h.status === s ? (sc[s]?.text || c.dim) : c.dim, border: "1px solid " + (h.status === s ? (sc[s]?.border || c.border) : c.border), borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px" }}>{s}</button>
                  ))}
                </div>
                {/* Indo results preview */}
                {h.indoResults?.results?.length > 0 && <div style={{ marginBottom: "8px" }}>
                  <div style={{ fontSize: "9px", color: c.dimmer, marginBottom: "4px" }}>INDONESIAN LISTINGS ({h.indoResults.results.length})</div>
                  {h.indoResults.results.slice(0, 5).map((r, ri) => (
                    <div key={ri} style={{ fontSize: "10px", color: c.dim, padding: "2px 0", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: "8px" }}>{r.name}</span>
                      <span style={{ color: c.gold, whiteSpace: "nowrap" }}>{fmtIDR(r.price_idr)}</span>
                    </div>
                  ))}
                </div>}
                {/* Actions */}
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => { restoreFromHistory(h); setMode("auto"); }} style={{ padding: "4px 10px", background: c.gold, color: c.btnText, border: "none", borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px", fontWeight: 700 }}>RE-OPEN IN LOOKUP</button>
                  {h.uaeProduct?.url && <a href={h.uaeProduct.url} target="_blank" rel="noopener" style={{ padding: "4px 10px", background: "transparent", color: c.dim, border: "1px solid " + c.border2, borderRadius: "3px", fontFamily: "monospace", fontSize: "9px", textDecoration: "none" }}>VIEW LISTING</a>}
                </div>
              </div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

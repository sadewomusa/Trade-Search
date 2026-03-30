import { Badge, ConfidenceBadge } from '../components/SharedUI.jsx';
import { STATUS_COLORS, STATUS_COLORS_LIGHT } from '../constants.js';
import { marginColor, fmtIDR } from '../helpers.js';

export default function HistoryPage({
  c, dark, secStyle, btnSec,
  isAdmin, userId,
  history, setHistory,
  expandedHistoryIdx, setExpandedHistoryIdx,
  updateHistoryStatus,
  exportQuickCSV, exportStructuredCSV, exportBackup, importBackup, backupFileRef,
  saveHistory,
}) {
  return <div style={secStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "6px" }}>
          <span style={{ fontSize: "10px", color: c.dim, letterSpacing: "1px" }}>{history.length} LOOKUPS</span>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <button style={btnSec} onClick={exportQuickCSV}>{"\ud83d\udcca"} EXPORT CSV</button>
            {isAdmin && <>
              <button style={btnSec} onClick={exportStructuredCSV}>FULL CSV</button>
              <button style={btnSec} onClick={exportBackup}>{"\ud83d\udcbe BACKUP"}</button>
              <input type="file" ref={backupFileRef} accept=".json" style={{ display: "none" }} onChange={e => e.target.files[0] && importBackup(e.target.files[0])} />
              <button style={btnSec} onClick={() => backupFileRef.current?.click()}>{"\ud83d\udcc2 RESTORE"}</button>
              <button style={{ ...btnSec, color: c.red, borderColor: c.red }} onClick={async () => { if (!confirm("Clear all?")) return; setHistory([]); await saveHistory(userId, []); }}>CLEAR</button>
            </>}
          </div>
        </div>
        {!history.length ? <div style={{ textAlign: "center", padding: "40px", color: c.dimmer }}>No lookups yet.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "550px", overflowY: "auto" }}>
            {history.map((h, i) => {
              const m = h.margins?.median?.margin || 0;
              const sc = (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT)[h.status] || (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT).Candidate;
              const isExp = expandedHistoryIdx === i;
              return (
                <div key={i} style={{ background: c.surface2, border: "1px solid " + sc.border, borderRadius: "4px", borderLeft: "3px solid " + sc.text }}>
                  <div style={{ padding: "10px 12px", cursor: "pointer" }} onClick={() => setExpandedHistoryIdx(isExp ? -1 : i)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "3px" }}>{h.uaeProduct?.product_name}</div>
                        <div style={{ fontSize: "10px", color: h.uaeProduct?.product_name_id ? c.gold : c.dim, marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: h.uaeProduct?.product_name_id ? 500 : 400 }}>{h.uaeProduct?.product_name_id || h.normalized?.clean_name_id}</div>
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
                          <Badge text={"AED " + (h.uaeProduct?.price_aed || 0)} color={c.gold} bg={c.surface} />
                          <Badge text={fmtIDR(h.medianPriceIDR)} color={c.green} bg={c.surface} />
                          {h.confidence && <ConfidenceBadge confidence={h.confidence} c={c} />}
                          <span style={{ fontSize: "9px", color: c.dimmest }}>{h.timestamp?.slice(0, 10)}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", marginLeft: "10px" }}>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: marginColor(m) }}>{m.toFixed(1)}%</div>
                        <select value={h.status} onChange={e => { e.stopPropagation(); updateHistoryStatus(i, e.target.value); }} onClick={e => e.stopPropagation()} style={{ padding: "2px 4px", background: sc.bg, border: "1px solid " + sc.border, color: sc.text, fontFamily: "monospace", fontSize: "9px", borderRadius: "3px" }}>
                          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  {isExp && (h.indoResults?.results || []).length > 0 && <div style={{ padding: "0 12px 12px", borderTop: "1px solid " + c.border }}>
                    <div style={{ fontSize: "9px", color: c.dimmer, padding: "8px 0 4px", textTransform: "uppercase" }}>INDO LISTINGS ({(h.indoResults?.results || []).length})</div>
                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                      {(h.indoResults?.results || []).map((r, j) => <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid " + c.border, fontSize: "10px" }}>
                        <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                        <div style={{ display: "flex", gap: "8px", marginLeft: "8px" }}>
                          <span style={{ color: r.source === "Shopee" ? "#EE4D2D" : c.green, fontSize: "9px" }}>{r.source === "Shopee" ? "S" : "T"}</span>
                          <span style={{ color: c.gold, fontWeight: 700 }}>{fmtIDR(r.price_idr)}</span>
                        </div>
                      </div>)}
                    </div>
                  </div>}
                </div>
              );
            })}
          </div>
        )}
  </div>;
}

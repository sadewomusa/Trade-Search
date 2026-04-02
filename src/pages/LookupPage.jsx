import { useState } from "react";
import { Badge, Spinner, ConfidenceBadge, WaveStatusBar } from '../components/SharedUI.jsx';
import { FREIGHT_MODES, STATUS_COLORS, STATUS_COLORS_LIGHT, MARGIN_THRESHOLD, ROUTES, WEIGHT_KG, VOLUME_CBM } from '../constants.js';
import { marginColor, fmtAED, fmtIDR, fmtUSD } from '../helpers.js';

export default function LookupPage({
  c, dark, secStyle, inputStyle, btnStyle, btnSec, btnGreen,
  isAdmin, loading, stage, progress, autoError,
  apifyPaused, setApifyPaused, apifyPauseRef, apifyAbortRef,
  streamingResults,
  lookupView, setLookupView,
  url, setUrl, runDryRun, cooldown,
  history, restoreFromHistory,
  dryRunData, setDryRunData,
  editableQueries, setEditableQueries, newQueryInput, setNewQueryInput,
  indoResults, marginData,
  indoMode,
  runLookupToko, runLookupShopee, runLookupIndoSearch,
  runMarginAnalysis, marginAnalysisLoading,
  resetLookup,
  marginScenario, setMarginScenario,
  scenarioBData, scenarioBLoading,
  scenarioBMargins,
  displayMargins, displayStatus,
  freightMode, setFreightMode,
  qtyMode, setQtyMode, qty, setQty, getQty,
  routeComparisons,
  fx,
  exportPDF,
  waveStatus,
  activeSection, setActiveSection,
  SectionToggle, PriceRow,
  launchDeepDiveFromLookup,
}) {
  return <div style={secStyle}>
        {loading && stage && <div style={{ marginBottom: "12px" }}><div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}><Spinner /><span style={{ fontSize: "12px", color: c.gold, flex: 1 }}>{stage}</span><div style={{ display: "flex", gap: "4px" }}>{!apifyPaused ? <button onClick={() => { apifyPauseRef.current = true; setApifyPaused(true); }} style={{ padding: "4px 10px", background: "transparent", border: "1px solid " + c.darkGold, color: c.darkGold, borderRadius: "3px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", fontWeight: 700 }}>{"\u23f8"} PAUSE</button> : <button onClick={() => { apifyPauseRef.current = false; setApifyPaused(false); }} style={{ padding: "4px 10px", background: c.green, border: "1px solid " + c.green, color: "#fff", borderRadius: "3px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", fontWeight: 700 }}>{"\u25b6"} CONTINUE</button>}<button onClick={() => { apifyAbortRef.current = true; apifyPauseRef.current = false; setApifyPaused(false); }} style={{ padding: "4px 10px", background: "transparent", border: "1px solid " + c.red, color: c.red, borderRadius: "3px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", fontWeight: 700 }}>{"\u25a0"} STOP</button></div></div>{progress > 0 && <div style={{ width: "100%", height: "3px", background: c.border, borderRadius: "2px" }}><div style={{ width: progress + "%", height: "100%", background: apifyPaused ? c.darkGold : c.gold, borderRadius: "2px", transition: "width 0.3s" }} /></div>}{streamingResults.length > 0 && <div style={{ marginTop: "8px", padding: "8px 10px", background: c.surface2, border: "1px solid " + c.green + "44", borderRadius: "4px", fontSize: "10px", color: c.green }}>{"\u26a1"} {streamingResults.length} results found so far{streamingResults.filter(r => r.source === "Tokopedia").length > 0 && " | Source 1: " + streamingResults.filter(r => r.source === "Tokopedia").length}{streamingResults.filter(r => r.source === "Shopee").length > 0 && " | Source 2: " + streamingResults.filter(r => r.source === "Shopee").length}</div>}</div>}
        {autoError && <div style={{ padding: "12px", background: dark ? "#3a1a1a" : "#FEF2F2", border: "1px solid " + c.red + "44", borderRadius: "4px", marginBottom: "12px", fontSize: "12px", color: c.red }}>{autoError}</div>}

        {/* ── LANDING VIEW ── */}
        {lookupView === "landing" && <>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && runDryRun()} placeholder="Paste any Amazon or amzn.to product URL..." style={{ ...inputStyle, flex: 1, padding: "12px 14px" }} />
            <button onClick={runDryRun} disabled={loading || !url.trim() || cooldown > 0} style={{ ...btnStyle, padding: "12px 20px", fontSize: "11px", opacity: loading || !url.trim() ? 0.4 : 1, whiteSpace: "nowrap" }}>{cooldown > 0 ? "WAIT " + cooldown + "s" : loading ? "READING..." : "QUICK CHECK"}</button>
          </div>

          {!loading && !autoError && <div style={{ textAlign: "center", padding: "30px 20px" }}>
            <div style={{ fontSize: "36px", marginBottom: "10px", opacity: 0.15 }}>{"\u26a1"}</div>
            <div style={{ fontSize: "12px", color: c.dim }}>Paste any Amazon product URL to analyze trade potential</div>
            <div style={{ fontSize: "10px", color: c.dimmer, marginTop: "6px" }}>Supports amazon.ae, .com, .co.uk, .de, .sa, amzn.to short links, and more</div>
          </div>}

          {/* ── RECENT SEARCHES ── */}
          {(() => {
            const seen = new Set();
            const recent = history.filter(h => {
              const key = h.uaeProduct?.asin || h.uaeProduct?.url || h.uaeProduct?.product_name;
              if (!key || seen.has(key)) return false;
              seen.add(key); return true;
            }).slice(0, 8);
            if (!recent.length) return null;
            return <div style={{ marginTop: "8px" }}>
              <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>RECENT SEARCHES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {recent.map((h, i) => {
                  const m = h.margins?.median?.margin || 0;
                  const tokoCount = (h.indoResults?.results || []).filter(r => r.source === "Tokopedia").length;
                  const shopeeCount = (h.indoResults?.results || []).filter(r => r.source === "Shopee").length;
                  const missingSource = tokoCount === 0 && shopeeCount > 0 ? "Source 1" : shopeeCount === 0 && tokoCount > 0 ? "Source 2" : null;
                  return <div key={i} onClick={() => restoreFromHistory(h)} style={{ padding: "10px 12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "11px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.uaeProduct?.product_name}</div>
                      <div style={{ display: "flex", gap: "6px", marginTop: "4px", fontSize: "9px", color: c.dimmer, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ color: c.gold }}>AED {h.uaeProduct?.price_aed}</span>
                        {tokoCount > 0 && <span style={{ color: c.green, background: dark ? "#0D2E1A" : "#E8F5EC", padding: "1px 4px", borderRadius: "2px" }}>S1:{tokoCount}</span>}
                        {shopeeCount > 0 && <span style={{ color: "#EE4D2D", background: dark ? "#2D1508" : "#FFF0EC", padding: "1px 4px", borderRadius: "2px" }}>S2:{shopeeCount}</span>}
                        {missingSource && <span style={{ color: c.darkGold, fontSize: "8px", fontStyle: "italic" }}>+ tap to explore {missingSource}</span>}
                        <span>{h.timestamp?.slice(0, 10)}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", marginLeft: "10px" }}>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: marginColor(m) }}>{m.toFixed(1)}%</div>
                    </div>
                  </div>;
                })}
              </div>
            </div>;
          })()}
        </>}

        {/* ── SCRAPE VIEW ── */}
        {lookupView === "scrape" && dryRunData && <div>
          <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "10px" }}>
            <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>PRODUCT {dryRunData.url && <a href={dryRunData.url} target="_blank" rel="noopener" style={{ color: c.dim, fontSize: "9px", marginLeft: "8px" }}>open {"\u2197"}</a>}</div>
            <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "2px" }}>{"\ud83c\uddec\ud83c\udde7"} {dryRunData.product_name}</div>
            {dryRunData.product_name_id && <div style={{ fontSize: "12px", fontWeight: 600, color: c.gold, marginBottom: "6px", padding: "5px 10px", background: dark ? "#2A2210" : "#FDF8ED", borderRadius: "4px", borderLeft: "3px solid " + c.gold }}>{"\ud83c\uddee\ud83c\udde9"} {dryRunData.product_name_id}</div>}
            {(dryRunData.product_summary || dryRunData.spec_summary) && <div style={{ fontSize: "10px", color: c.dim, marginBottom: "6px", padding: "4px 8px", background: c.cardBg, borderRadius: "3px", borderLeft: "2px solid " + c.gold }}>{dryRunData.product_summary || dryRunData.spec_summary}</div>}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", fontSize: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ color: c.dim, fontSize: "10px" }}>AED</span>
                <input type="number" value={dryRunData.price_aed || ""} onChange={e => setDryRunData({ ...dryRunData, price_aed: parseFloat(e.target.value) || 0 })} style={{ width: "80px", padding: "3px 6px", background: c.input, border: "1px solid " + (!dryRunData.price_aed ? c.red : c.border2), color: c.gold, fontFamily: "monospace", fontSize: "14px", fontWeight: 700, borderRadius: "3px", outline: "none", textAlign: "right" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ color: c.dim, fontSize: "10px" }}>PACK:</span>
                <input type="number" min="1" value={dryRunData.pack_quantity || 1} onChange={e => setDryRunData({ ...dryRunData, pack_quantity: parseInt(e.target.value) || 1 })} style={{ width: "50px", padding: "3px 6px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "12px", borderRadius: "3px", outline: "none", textAlign: "center" }} />
              </div>
              <Badge text={dryRunData.source || "Amazon.ae"} /> <Badge text={dryRunData.category} color={c.green} bg={c.sectionBg} />
            </div>
          </div>
          <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "10px" }}>
            <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>TRANSLATION</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "12px", marginBottom: "10px" }}><div><span style={{ color: c.dim }}>EN:</span> {dryRunData.clean_name_en}</div><div><span style={{ color: c.dim }}>ID:</span> <span style={{ color: c.gold, fontWeight: 600 }}>{dryRunData.clean_name_id}</span></div></div>
            <div>
              <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px" }}>SEARCH QUERIES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>{editableQueries.map((q, i) => <div key={i} style={{ display: "flex", gap: "4px" }}><input value={q} onChange={e => { const u = [...editableQueries]; u[i] = e.target.value; setEditableQueries(u); }} style={{ ...inputStyle, padding: "5px 8px", fontSize: "11px", flex: 1 }} /><button onClick={() => setEditableQueries(editableQueries.filter((_, idx) => idx !== i))} style={{ background: "transparent", border: "1px solid " + c.red + "44", color: c.red, fontSize: "10px", padding: "4px 8px", borderRadius: "3px", cursor: "pointer" }}>{"\u2715"}</button></div>)}</div>
              <div style={{ display: "flex", gap: "4px" }}><input value={newQueryInput} onChange={e => setNewQueryInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newQueryInput.trim()) { setEditableQueries([...editableQueries, newQueryInput.trim()]); setNewQueryInput(""); } }} placeholder="Add keyword..." style={{ ...inputStyle, padding: "5px 8px", fontSize: "11px", flex: 1 }} /><button onClick={() => { if (newQueryInput.trim()) { setEditableQueries([...editableQueries, newQueryInput.trim()]); setNewQueryInput(""); } }} style={{ ...btnSec, padding: "5px 12px", fontSize: "9px" }}>+ ADD</button></div>
            </div>
          </div>
          {!loading && <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + c.green + "44", borderRadius: "4px", marginBottom: "10px" }}>
            {indoResults?.results?.length > 0 && <div style={{ fontSize: "10px", color: c.green, fontFamily: "monospace", marginBottom: "10px" }}>{"\u2713"} {indoResults.results.length} listings loaded{indoResults.results.filter(r => r.source === "Tokopedia").length > 0 && " | Source 1: " + indoResults.results.filter(r => r.source === "Tokopedia").length}{indoResults.results.filter(r => r.source === "Shopee").length > 0 && " | Source 2: " + indoResults.results.filter(r => r.source === "Shopee").length}</div>}
            {(() => {
              const hasTokoResults = (indoResults?.results || []).filter(r => r.source === "Tokopedia").length > 0;
              const hasShopeeResults = (indoResults?.results || []).filter(r => r.source === "Shopee").length > 0;
              const isApifyMode = (isAdmin ? indoMode : "apify") === "apify";
              const noQueries = editableQueries.filter(q => q.trim()).length === 0;
              return <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                {isApifyMode ? <>
                  <button onClick={runLookupToko} disabled={noQueries || loading} style={{ ...btnGreen, padding: "12px 24px", fontSize: "12px", opacity: (noQueries || loading) ? 0.4 : 1 }}>{hasTokoResults ? "\u21bb Re-explore" : "\ud83d\udd0d Explore"} Source 1</button>
                  <button onClick={runLookupShopee} disabled={noQueries || loading} style={{ ...btnGreen, padding: "12px 24px", fontSize: "12px", background: "#EE4D2D", opacity: (noQueries || loading) ? 0.4 : 1 }}>{hasShopeeResults ? "\u21bb Re-explore" : "\ud83d\udd0d Explore"} Source 2</button>
                </> : <button onClick={runLookupIndoSearch} disabled={noQueries || loading} style={{ ...btnGreen, padding: "12px 36px", fontSize: "12px", opacity: (noQueries || loading) ? 0.4 : 1 }}>{"\ud83d\udd0d"} EXPLORE INDONESIA</button>}
                {indoResults && <button onClick={() => setLookupView("results")} style={{ ...btnStyle, padding: "12px 24px", fontSize: "12px" }}>VIEW RESULTS {"\u2192"}</button>}
              </div>;
            })()}
          </div>}
          {/* ── INDO LISTINGS (visible immediately after source search) ── */}
          {!loading && indoResults?.results?.length > 0 && <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "10px" }}>
            <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>INDONESIA LISTINGS ({indoResults.results.length})</div>
            {indoResults.price_stats && <div className="bandar-grid4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "12px" }}>
              {[{ l: "LOWEST", v: indoResults.price_stats.lowest_idr, cl: c.green },{ l: "MEDIAN", v: indoResults.price_stats.median_idr, cl: c.gold },{ l: "AVERAGE", v: indoResults.price_stats.average_idr, cl: c.dim },{ l: "HIGHEST", v: indoResults.price_stats.highest_idr, cl: c.red }].map(s => (
                <div key={s.l} style={{ padding: "8px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}><div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "3px" }}>{s.l}</div><div style={{ fontSize: "13px", fontWeight: 700, color: s.cl }}>{fmtIDR(s.v)}</div><div style={{ fontSize: "11px", color: c.gold, fontWeight: 600, marginTop: "2px" }}>{fmtAED(s.v * fx.IDR_TO_AED)}</div></div>
              ))}
            </div>}
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2.5fr 0.6fr 0.7fr 0.5fr", gap: "4px", padding: "5px 0", borderBottom: "1px solid " + c.border2, fontSize: "9px", color: c.dimmer, textTransform: "uppercase", position: "sticky", top: 0, background: c.surface2, zIndex: 1 }}>
                <div>{"Product \u00b7 Seller"}</div><div>Source</div><div style={{ textAlign: "right" }}>Price</div><div style={{ textAlign: "right" }}>Sold</div>
              </div>
              {indoResults.results.map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2.5fr 0.6fr 0.7fr 0.5fr", gap: "4px", padding: "6px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", alignItems: "center" }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.url ? <a href={r.url} target="_blank" rel="noopener" style={{ color: c.text, textDecoration: "none" }}>{r.name}</a> : r.name}
                    {r.seller && <span style={{ color: c.dimmest }}>{" \u00b7 "}{r.seller}</span>}
                  </div>
                  <div><Badge text={isAdmin ? (r.source || "Tokopedia") : (r.source === "Shopee" ? "S2" : "S1")} color={r.source === "Shopee" ? "#EE4D2D" : c.green} bg={r.source === "Shopee" ? (dark ? "#2D1508" : "#FFF0EC") : (dark ? "#0D2E1A" : "#E8F5EC")} /></div>
                  <div style={{ color: c.gold, fontWeight: 700, textAlign: "right" }}>{fmtIDR(r.price_idr)}<div style={{ fontSize: "9px", color: c.dim, fontWeight: 400 }}>{fmtAED(r.price_idr * fx.IDR_TO_AED)}</div></div>
                  <div style={{ color: r.sold ? c.darkGold : c.dimmest, textAlign: "right", fontSize: "10px" }}>{r.sold || "\u2014"}</div>
                </div>
              ))}
            </div>
          </div>}
          <div style={{ display: "flex", justifyContent: "center", marginTop: "8px" }}>
            <button onClick={resetLookup} style={{ ...btnSec, padding: "6px 16px", fontSize: "9px" }}>{"\u2190"} NEW SEARCH</button>
          </div>
        </div>}

        {/* ── RESULTS VIEW ── */}
        {lookupView === "results" && dryRunData && <div>
          {/* Product summary bar */}
          <div style={{ padding: "10px 12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "12px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dryRunData.product_name}</div>
              <div style={{ fontSize: "10px", color: c.gold, marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{dryRunData.product_name_id || dryRunData.clean_name_id} {"\u00b7"} <span style={{ color: c.dim, fontWeight: 400 }}>AED {dryRunData.price_aed}</span></div>
            </div>
          </div>

          {/* ── Deep Dive from this product ── */}
          {launchDeepDiveFromLookup && <div style={{ marginBottom: "10px" }}>
            <button onClick={launchDeepDiveFromLookup} style={{ ...btnSec, padding: "8px 20px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px", width: "100%", justifyContent: "center", border: "1px dashed " + c.gold + "66", background: dark ? c.gold + "08" : c.gold + "06" }}>
              {"\ud83c\udfaf"} Deep Dive from this product
              <span style={{ fontSize: "9px", color: c.dim, fontStyle: "italic" }}>{"\u2014"} find similar bestsellers + Indonesian suppliers</span>
            </button>
          </div>}

          {indoResults && <SectionToggle index={1} title={"Indonesia Market" + (isAdmin ? " \u2014 " + (indoResults.source === "apify" ? "Apify" : "Claude") : "")} icon={"\ud83c\uddee\ud83c\udde9"} count={indoResults.results?.length}>
            {isAdmin && indoResults.wave_status && <WaveStatusBar waves={indoResults.wave_status} c={c} />}
            {indoResults.confidence && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", marginBottom: "12px", background: indoResults.confidence.level === "high" ? (dark ? "#0D2E1A" : "#E8F5EC") : indoResults.confidence.level === "medium" ? (dark ? "#2A2210" : "#FDF8ED") : (dark ? "#3a1a1a" : "#FEF2F2"), border: "1px solid " + (indoResults.confidence.level === "high" ? c.green : indoResults.confidence.level === "medium" ? c.gold : c.red) + "44", borderRadius: "4px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: indoResults.confidence.level === "high" ? c.green : indoResults.confidence.level === "medium" ? c.gold : c.red }}>{"\u25cf "}{indoResults.confidence.level} CONFIDENCE</div>
                <div style={{ fontSize: "10px", color: c.dim, flex: 1 }}>{indoResults.confidence.validCount} valid{indoResults.confidence.withSold > 0 && " \u00b7 " + indoResults.confidence.withSold + " sold data"}{indoResults.confidence.flags?.length > 0 && " \u00b7 " + indoResults.confidence.flags.join(", ")}</div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: c.dim }}>{indoResults.confidence.score}/100</div>
              </div>
            )}
            {indoResults.price_stats && <div className="bandar-grid4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "12px" }}>
              {[{ l: "LOWEST", v: indoResults.price_stats.lowest_idr, cl: c.green },{ l: "MEDIAN", v: indoResults.price_stats.median_idr, cl: c.gold },{ l: "AVERAGE", v: indoResults.price_stats.average_idr, cl: c.dim },{ l: "HIGHEST", v: indoResults.price_stats.highest_idr, cl: c.red }].map(s => (
                <div key={s.l} style={{ padding: "8px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}><div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "3px" }}>{s.l}</div><div style={{ fontSize: "13px", fontWeight: 700, color: s.cl }}>{fmtIDR(s.v)}</div><div style={{ fontSize: "11px", color: c.gold, fontWeight: 600, marginTop: "2px" }}>{fmtAED(s.v * fx.IDR_TO_AED)}</div></div>
              ))}
            </div>}
            <div style={{ maxHeight: "400px", overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2.5fr 0.6fr 0.7fr 0.5fr", gap: "4px", padding: "5px 0", borderBottom: "1px solid " + c.border2, fontSize: "9px", color: c.dimmer, textTransform: "uppercase", position: "sticky", top: 0, background: c.surface, zIndex: 1 }}>
                <div>{"Product \u00b7 Seller"}</div><div>Source</div><div style={{ textAlign: "right" }}>Price</div><div style={{ textAlign: "right" }}>Sold</div>
              </div>
              {indoResults.results?.map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2.5fr 0.6fr 0.7fr 0.5fr", gap: "4px", padding: "6px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", alignItems: "center" }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.url ? <a href={r.url} target="_blank" rel="noopener" style={{ color: c.text, textDecoration: "none" }}>{r.name}</a> : r.name}
                    {r.seller && <span style={{ color: c.dimmest }}>{" \u00b7 "}{r.seller}</span>}
                  </div>
                  <div><Badge text={isAdmin ? (r.source || "Tokopedia") : (r.source === "Shopee" ? "S2" : "S1")} color={r.source === "Shopee" ? "#EE4D2D" : c.green} bg={r.source === "Shopee" ? (dark ? "#2D1508" : "#FFF0EC") : (dark ? "#0D2E1A" : "#E8F5EC")} /></div>
                  <div style={{ color: c.gold, fontWeight: 700, textAlign: "right" }}>{fmtIDR(r.price_idr)}<div style={{ fontSize: "9px", color: c.dim, fontWeight: 400 }}>{fmtAED(r.price_idr * fx.IDR_TO_AED)}</div></div>
                  <div style={{ color: r.sold ? c.darkGold : c.dimmest, textAlign: "right", fontSize: "10px" }}>{r.sold || "\u2014"}</div>
                </div>
              ))}
            </div>
          </SectionToggle>}

          {/* ── RUN MARGIN ANALYSIS BUTTON (when indo results exist but margin not yet run) ── */}
          {indoResults?.results?.length > 0 && !marginData && !marginAnalysisLoading && <div style={{ padding: "20px", background: c.surface2, border: "2px dashed " + c.gold + "66", borderRadius: "8px", textAlign: "center", marginBottom: "8px" }}>
            <div style={{ fontSize: "11px", color: c.dim, marginBottom: "10px" }}>Indonesia data loaded ({indoResults.results.length} listings). Run margin analysis to calculate profitability.</div>
            <button onClick={runMarginAnalysis} style={{ ...btnGreen, padding: "14px 36px", fontSize: "13px", fontWeight: 700, letterSpacing: "1px" }}>{"\ud83d\udcca"} RUN MARGIN ANALYSIS</button>
            <div style={{ fontSize: "9px", color: c.dimmer, marginTop: "8px" }}>Runs Scenario A (link price) + Scenario B (similar items) {"\u00b7"} Uses 1 margin analysis quota</div>
          </div>}

          {marginAnalysisLoading && <div style={{ padding: "20px", background: c.surface2, border: "1px solid " + c.gold + "44", borderRadius: "8px", textAlign: "center", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px" }}><Spinner /><span style={{ fontSize: "12px", color: c.gold }}>Running margin analysis (A + B)...</span></div>
            {stage && <div style={{ fontSize: "10px", color: c.dimmer, marginTop: "6px" }}>{stage}</div>}
          </div>}

          {marginData && displayMargins && <SectionToggle index={2} title="Margin Analysis" icon={"\ud83d\udcca"}>
            {/* Scenario selector */}
            <div style={{ marginBottom: "14px", display: "flex", gap: "0", border: "1px solid " + c.border2, borderRadius: "4px", overflow: "hidden" }}>
              <button onClick={() => setMarginScenario("A")} style={{ flex: 1, padding: "10px 12px", background: marginScenario === "A" ? c.gold : "transparent", color: marginScenario === "A" ? c.btnText : c.dim, border: "none", cursor: "pointer", fontFamily: "monospace", fontSize: "10px", fontWeight: 700, textAlign: "left" }}>
                <div>SCENARIO A</div>
                <div style={{ fontSize: "8px", fontWeight: 400, marginTop: "2px", opacity: 0.8 }}>Link price vs Indonesia median/average</div>
              </button>
              <button onClick={() => { setMarginScenario("B"); }} style={{ flex: 1, padding: "10px 12px", background: marginScenario === "B" ? c.gold : "transparent", color: marginScenario === "B" ? c.btnText : c.dim, border: "none", borderLeft: "1px solid " + c.border2, cursor: "pointer", fontFamily: "monospace", fontSize: "10px", fontWeight: 700, textAlign: "left" }}>
                <div>SCENARIO B</div>
                <div style={{ fontSize: "8px", fontWeight: 400, marginTop: "2px", opacity: 0.8 }}>Similar items regional avg vs Indonesia</div>
              </button>
            </div>

            {/* Freight mode toggle */}
            <div style={{ marginBottom: "14px", padding: "10px 12px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px" }}>
              <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "8px", textTransform: "uppercase" }}>FREIGHT MODE</div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {Object.entries(FREIGHT_MODES).map(([id, info]) => (
                  <button key={id} onClick={() => setFreightMode(id)} style={{ padding: "6px 12px", background: freightMode === id ? c.gold : "transparent", color: freightMode === id ? c.btnText : c.dim, border: "1px solid " + (freightMode === id ? c.gold : c.border2), borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "monospace", flex: "1 1 auto", textAlign: "center" }}>
                    {info.icon} {info.label}
                    <div style={{ fontSize: "8px", color: freightMode === id ? c.btnText + "cc" : c.dimmest, marginTop: "2px" }}>{info.transit}</div>
                  </button>
                ))}
              </div>
              <div style={{ fontSize: "9px", color: c.dimmer, marginTop: "6px", fontStyle: "italic" }}>{FREIGHT_MODES[freightMode]?.note || ""}</div>
            </div>

            {/* ═══ SCENARIO A: Link price vs Indo ═══ */}
            {marginScenario === "A" && <>
              {/* Route comparison table */}
              {routeComparisons.length > 0 && <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "8px", textTransform: "uppercase" }}>ROUTE COMPARISON (MEDIAN PRICE)</div>
                <div style={{ overflowX: "auto" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.8fr 0.8fr 0.6fr 0.6fr 0.7fr 0.7fr", gap: "4px", padding: "6px 0", borderBottom: "1px solid " + c.border2, fontSize: "8px", color: c.dimmer, textTransform: "uppercase", minWidth: "550px" }}>
                    <div>Route</div><div>Transit</div><div>Rate</div><div>Freight</div><div>Margin</div><div>Profit/unit</div>
                  </div>
                  {routeComparisons.map(rt => {
                    const isActive = freightMode === rt.mode;
                    const mColor = marginColor(rt.margin);
                    return (
                      <div key={rt.id} onClick={() => setFreightMode(rt.mode)} style={{ display: "grid", gridTemplateColumns: "1.8fr 0.8fr 0.6fr 0.6fr 0.7fr 0.7fr", gap: "4px", padding: "7px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", cursor: "pointer", background: isActive ? (dark ? "#1A1A10" : "#FFFBF0") : "transparent", minWidth: "550px", borderLeft: rt.highlight ? "3px solid " + c.gold : "3px solid transparent", paddingLeft: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <span>{rt.icon}</span>
                          <span style={{ fontSize: "10px", fontWeight: rt.highlight ? 600 : 400, color: rt.highlight ? c.gold : c.text }}>{rt.label}</span>
                          {rt.highlight && <span style={{ fontSize: "7px", color: c.gold, background: dark ? "#2A2210" : "#FDF8ED", padding: "1px 4px", borderRadius: "2px", border: "1px solid " + c.gold + "44" }}>Khorfakkan</span>}
                        </div>
                        <div style={{ fontSize: "10px", color: c.dim }}>{rt.transit}</div>
                        <div style={{ fontSize: "10px", color: c.dim }}>${rt.rate}{rt.unit.includes("CBM") ? "/cbm" : rt.unit.includes("ctr") ? "/ctr" : "/kg"}</div>
                        <div style={{ fontSize: "10px", color: c.dim }}>{fmtUSD(rt.freightUSD)}</div>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: mColor }}>{rt.margin.toFixed(1)}%</div>
                        <div style={{ fontSize: "10px", color: rt.profitUSD > 0 ? c.green : c.red }}>{fmtAED(rt.profitAED)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>}

              {/* Scenario A header */}
              <div style={{ padding: "10px 12px", background: c.surface2, border: "1px solid " + c.gold + "33", borderRadius: "4px", marginBottom: "14px" }}>
                <div style={{ fontSize: "10px", color: c.gold, fontWeight: 700, marginBottom: "4px" }}>SCENARIO A: Your Link Price vs Indonesia</div>
                <div style={{ fontSize: "9px", color: c.dim }}>Sell price: <span style={{ color: c.gold, fontWeight: 700 }}>AED {marginData.uaeProduct?.price_aed}</span> (from linked product) vs Indo median {fmtIDR(marginData.medianPriceIDR)} / average {fmtIDR(marginData.indoResults?.price_stats?.average_idr)}</div>
              </div>

              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "10px", color: c.dim }}>FOR:</span>
                {[{ id: "unit", label: "Per Unit" }, { id: "custom", label: "Custom Qty" }, { id: "container", label: "Container (20ft)" }].map(m => (
                  <button key={m.id} onClick={() => setQtyMode(m.id)} style={{ padding: "4px 10px", background: qtyMode === m.id ? c.gold : "transparent", color: qtyMode === m.id ? c.btnText : c.dim, border: "1px solid " + (qtyMode === m.id ? c.gold : c.border2), borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "monospace" }}>{m.label}</button>
                ))}
                {qtyMode === "custom" && <input type="number" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} min="1" style={{ ...inputStyle, width: "80px", padding: "4px 8px", fontSize: "11px", textAlign: "center" }} />}
                <span style={{ fontSize: "10px", color: c.dimmer }}>{"\u00d7 "}{getQty()} units</span>
              </div>
              {/* Margin cards: vs median and vs average */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                <div style={{ padding: "12px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                  <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px" }}>VS MEDIAN INDO</div>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: marginColor(displayMargins.median.margin) }}>{displayMargins.median.margin.toFixed(1)}%</div>
                </div>
                <div style={{ padding: "12px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                  <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px" }}>VS AVERAGE INDO</div>
                  <div style={{ fontSize: "28px", fontWeight: 700, color: marginColor(displayMargins.average.margin) }}>{displayMargins.average.margin.toFixed(1)}%</div>
                </div>
              </div>
              <div className="bandar-grid3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                {[{ l: "BEST", m: displayMargins.best }, { l: "MEDIAN", m: displayMargins.median }, { l: "WORST", m: displayMargins.worst }].map(x => (
                  <div key={x.l} style={{ padding: "10px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}><div style={{ fontSize: "8px", color: c.dimmer }}>{x.l}</div><div style={{ fontSize: "18px", fontWeight: 700, color: marginColor(x.m.margin) }}>{x.m.margin.toFixed(1)}%</div></div>
                ))}
              </div>
              <div style={{ background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", padding: "12px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "10px", padding: "4px 0", borderBottom: "1px solid " + c.border2, color: c.dimmer, fontWeight: 700 }}><div>COST</div><div>USD</div><div>AED</div><div>IDR</div></div>
                {(() => { const m = displayMargins.median, q = getQty(); return <>
                  <PriceRow label={"UAE Sell"} usd={m.uaeUSD*q} aed={m.uaeAED*q} idr={m.uaeIDR*q} />
                  <PriceRow label={"Indo"} usd={m.indoUSD*q} aed={m.indoAED*q} idr={m.indoIDR*q} />
                  <PriceRow label={"Freight"} usd={m.freightUSD*q} aed={m.freightAED*q} idr={m.freightIDR*q} />
                  <PriceRow label={"Customs"} usd={m.dutyUSD*q} aed={m.dutyAED*q} idr={m.dutyIDR*q} />
                  <PriceRow label={"Last Mile"} usd={m.lastMileUSD*q} aed={m.lastMileAED*q} idr={m.lastMileIDR*q} />
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "6px 0", fontWeight: 700 }}><div style={{ color: c.red }}>TOTAL</div><div style={{ color: c.red }}>{fmtUSD(m.totalUSD*q)}</div><div style={{ color: c.red }}>{fmtAED(m.totalAED*q)}</div><div style={{ color: c.red }}>{fmtIDR(m.totalIDR*q)}</div></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "6px 0", fontWeight: 700 }}><div style={{ color: c.green }}>PROFIT</div><div style={{ color: c.green }}>{fmtUSD((m.uaeUSD-m.totalUSD)*q)}</div><div style={{ color: c.green }}>{fmtAED((m.uaeAED-m.totalAED)*q)}</div><div style={{ color: c.green }}>{fmtIDR((m.uaeIDR-m.totalIDR)*q)}</div></div>
                </>; })()}
              </div>
              <div style={{ marginTop: "10px", padding: "8px", borderRadius: "4px", textAlign: "center", fontSize: "12px", fontWeight: 600, background: displayStatus === "Candidate" ? (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT).Candidate.bg : displayStatus === "Investigated" ? (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT).Active.bg : (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT).Rejected.bg, color: marginColor(displayMargins.median.margin), border: "1px solid " + (displayStatus === "Candidate" ? STATUS_COLORS.Candidate.border : STATUS_COLORS.Rejected.border) }}>
                {displayMargins.median.margin >= MARGIN_THRESHOLD.candidate ? "\u2713 CANDIDATE" : displayMargins.median.margin >= MARGIN_THRESHOLD.borderline ? "\u25cb BORDERLINE" : "\u2717 LOW MARGIN"} {"\u2014"} {displayMargins.median.margin.toFixed(1)}%
              </div>
            </>}

            {/* ═══ SCENARIO B: Regional similar items vs Indo ═══ */}
            {marginScenario === "B" && <>
              <div style={{ padding: "10px 12px", background: c.surface2, border: "1px solid " + c.gold + "33", borderRadius: "4px", marginBottom: "14px" }}>
                <div style={{ fontSize: "10px", color: c.gold, fontWeight: 700, marginBottom: "4px" }}>SCENARIO B: Regional Market Price vs Indonesia</div>
                <div style={{ fontSize: "9px", color: c.dim, marginBottom: "4px" }}>Compare median/average of similar items from <span style={{ color: c.gold, fontWeight: 600 }}>{dryRunData.source || "Amazon.ae"}</span> against Indonesia prices</div>
                <div style={{ fontSize: "9px", color: c.dimmer }}>Searches for similar products on the same marketplace using the product name, then calculates margins using their market price distribution.</div>
              </div>

              {/* Manual trigger — only if B wasn't loaded yet (e.g. restored from history) */}
              {!scenarioBData && !scenarioBLoading && <div style={{ textAlign: "center", padding: "20px" }}>
                <div style={{ fontSize: "10px", color: c.dimmer, marginBottom: "10px" }}>Scenario B data not available. Re-run margin analysis to load it.</div>
                <button onClick={runMarginAnalysis} disabled={!indoResults?.results?.length} style={{ ...btnGreen, padding: "12px 28px", fontSize: "12px", opacity: !indoResults?.results?.length ? 0.4 : 1 }}>{"\ud83d\udcca"} Re-run Margin Analysis</button>
                <div style={{ fontSize: "9px", color: c.dimmer, marginTop: "6px" }}>Uses 1 margin analysis quota</div>
              </div>}

              {scenarioBLoading && <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "20px", justifyContent: "center" }}><Spinner /><span style={{ fontSize: "12px", color: c.gold }}>Finding similar items...</span></div>}

              {scenarioBData && scenarioBData.count === 0 && <div style={{ padding: "20px", textAlign: "center" }}>
                <div style={{ color: c.dimmer, fontSize: "11px", marginBottom: "10px" }}>No similar items found in {scenarioBData.source}. Try searching from Discover tab first, then re-run.</div>
                <button onClick={runMarginAnalysis} disabled={!indoResults?.results?.length} style={{ ...btnSec, padding: "8px 16px", fontSize: "10px" }}>{"\u21bb"} Re-run Analysis (1 quota)</button>
              </div>}

              {scenarioBData && scenarioBData.count > 0 && <>
                {/* Regional market summary */}
                <div className="bandar-grid4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "14px" }}>
                  {[
                    { l: "LOWEST", v: scenarioBData.lowest, cl: c.green },
                    { l: "MEDIAN", v: scenarioBData.uaeMedian, cl: c.gold },
                    { l: "AVERAGE", v: scenarioBData.uaeAverage, cl: c.dim },
                    { l: "HIGHEST", v: scenarioBData.highest, cl: c.red }
                  ].map(s => (
                    <div key={s.l} style={{ padding: "8px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                      <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "3px" }}>{s.l} ({scenarioBData.source?.split(".")[1]?.toUpperCase() || "AE"})</div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: s.cl }}>{fmtAED(s.v)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "9px", color: c.dimmer, marginBottom: "12px", textAlign: "center" }}>Based on {scenarioBData.count} similar items from {scenarioBData.source}</div>

                {scenarioBMargins && <>
                  {/* 2x2 margin grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                    <div style={{ padding: "12px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                      <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "0.5px" }}>MEDIAN SELL vs MEDIAN INDO</div>
                      <div style={{ fontSize: "28px", fontWeight: 700, color: marginColor(scenarioBMargins.medianVsMedIndo.margin) }}>{scenarioBMargins.medianVsMedIndo.margin.toFixed(1)}%</div>
                      <div style={{ fontSize: "9px", color: c.dim }}>Sell {fmtAED(scenarioBData.uaeMedian)} | Source {fmtAED(scenarioBMargins.medianVsMedIndo.indoAED)}</div>
                    </div>
                    <div style={{ padding: "12px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                      <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "0.5px" }}>MEDIAN SELL vs AVG INDO</div>
                      <div style={{ fontSize: "28px", fontWeight: 700, color: marginColor(scenarioBMargins.medianVsAvgIndo.margin) }}>{scenarioBMargins.medianVsAvgIndo.margin.toFixed(1)}%</div>
                      <div style={{ fontSize: "9px", color: c.dim }}>Sell {fmtAED(scenarioBData.uaeMedian)} | Source {fmtAED(scenarioBMargins.medianVsAvgIndo.indoAED)}</div>
                    </div>
                    <div style={{ padding: "12px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                      <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "0.5px" }}>AVG SELL vs MEDIAN INDO</div>
                      <div style={{ fontSize: "28px", fontWeight: 700, color: marginColor(scenarioBMargins.avgVsMedIndo.margin) }}>{scenarioBMargins.avgVsMedIndo.margin.toFixed(1)}%</div>
                      <div style={{ fontSize: "9px", color: c.dim }}>Sell {fmtAED(scenarioBData.uaeAverage)} | Source {fmtAED(scenarioBMargins.avgVsMedIndo.indoAED)}</div>
                    </div>
                    <div style={{ padding: "12px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                      <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "0.5px" }}>AVG SELL vs AVG INDO</div>
                      <div style={{ fontSize: "28px", fontWeight: 700, color: marginColor(scenarioBMargins.avgVsAvgIndo.margin) }}>{scenarioBMargins.avgVsAvgIndo.margin.toFixed(1)}%</div>
                      <div style={{ fontSize: "9px", color: c.dim }}>Sell {fmtAED(scenarioBData.uaeAverage)} | Source {fmtAED(scenarioBMargins.avgVsAvgIndo.indoAED)}</div>
                    </div>
                  </div>

                  {/* Detailed breakdown for median vs median */}
                  <div style={{ background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", padding: "12px" }}>
                    <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px" }}>DETAILED BREAKDOWN (MEDIAN vs MEDIAN)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "10px", padding: "4px 0", borderBottom: "1px solid " + c.border2, color: c.dimmer, fontWeight: 700 }}><div>COST</div><div>USD</div><div>AED</div><div>IDR</div></div>
                    {(() => { const m = scenarioBMargins.medianVsMedIndo; return <>
                      <PriceRow label={"Regional Sell"} usd={m.uaeUSD} aed={m.uaeAED} idr={m.uaeIDR} />
                      <PriceRow label={"Indo Source"} usd={m.indoUSD} aed={m.indoAED} idr={m.indoIDR} />
                      <PriceRow label={"Freight"} usd={m.freightUSD} aed={m.freightAED} idr={m.freightIDR} />
                      <PriceRow label={"Customs"} usd={m.dutyUSD} aed={m.dutyAED} idr={m.dutyIDR} />
                      <PriceRow label={"Last Mile"} usd={m.lastMileUSD} aed={m.lastMileAED} idr={m.lastMileIDR} />
                      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "6px 0", fontWeight: 700 }}><div style={{ color: c.red }}>TOTAL</div><div style={{ color: c.red }}>{fmtUSD(m.totalUSD)}</div><div style={{ color: c.red }}>{fmtAED(m.totalAED)}</div><div style={{ color: c.red }}>{fmtIDR(m.totalIDR)}</div></div>
                      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "6px 0", fontWeight: 700 }}><div style={{ color: c.green }}>PROFIT</div><div style={{ color: c.green }}>{fmtUSD(m.uaeUSD-m.totalUSD)}</div><div style={{ color: c.green }}>{fmtAED(m.uaeAED-m.totalAED)}</div><div style={{ color: c.green }}>{fmtIDR(m.uaeIDR-m.totalIDR)}</div></div>
                    </>; })()}
                  </div>
                </>}

                {!scenarioBLoading && <button onClick={runMarginAnalysis} disabled={!indoResults?.results?.length} style={{ ...btnSec, padding: "6px 14px", fontSize: "9px", marginTop: "10px", opacity: !indoResults?.results?.length ? 0.4 : 1 }}>{"\u21bb"} Re-run Analysis (1 quota)</button>}
              </>}
            </>}
          </SectionToggle>}

          {!loading && <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
            <button onClick={() => setLookupView("scrape")} style={{ ...btnSec, padding: "8px 20px", fontSize: "10px" }}>{"\u2190"} EDIT QUERIES</button>
            <button onClick={resetLookup} style={{ ...btnSec, padding: "8px 20px", fontSize: "10px" }}>{"\u2190"} NEW SEARCH</button>
            {marginData && indoResults?.results?.length > 0 && <button onClick={runMarginAnalysis} disabled={marginAnalysisLoading} style={{ ...btnSec, padding: "8px 20px", fontSize: "10px", borderColor: c.gold + "66", color: c.gold }}>{"\u21bb"} RE-RUN MARGINS (1 quota)</button>}
            {marginData && <button onClick={exportPDF} style={{ ...btnSec, padding: "8px 16px", fontSize: "10px" }}>{"\ud83d\udcc4"} PDF</button>}
          </div>}
        </div>}
  </div>;
}

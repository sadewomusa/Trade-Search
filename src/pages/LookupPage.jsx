import { Spinner, WaveStatusBar, ConfidenceBadge, Badge } from "../components/SharedUI";
import { FREIGHT_MODES, ROUTES, WEIGHT_KG, MARGIN_THRESHOLD, getStyles } from "../constants";
import { marginColor, fmtIDR, fmtAED, fmtUSD } from "../helpers";

export default function LookupPage({
  c, dark,
  // Lookup state (managed by App)
  url, setUrl, loading, stage, progress, dryRunData, indoResults, marginData, autoError,
  editableQueries, setEditableQueries, newQueryInput, setNewQueryInput,
  cooldown, activeSection, setActiveSection, waveStatus, lookupView,
  marginScenario, setMarginScenario, scenarioBData, scenarioBLoading,
  qty, setQty, freightMode, setFreightMode, qtyMode, setQtyMode,
  streamingResults, apifyPaused, marginAnalysisLoading,
  // Computed values (from App)
  displayMargins, displayStatus, scenarioBMargins, routeComparisons,
  // Functions (from App)
  runDryRun, runLookupToko, runLookupShopee, runLookupIndoSearch,
  runMarginAnalysis, resetLookup, exportPDF,
  apifyAbortRef, apifyPauseRef, setApifyPaused,
  fx, getQty,
}) {
  const { inputStyle, btnStyle, btnSec, btnGreen, secStyle } = getStyles(c);

  const SectionToggle = ({ index, title, icon, children, count }) => (
    <div style={{ marginBottom: "8px", border: "1px solid " + (activeSection === index ? c.gold + "44" : c.border), borderRadius: "6px", overflow: "hidden" }}>
      <button onClick={() => setActiveSection(activeSection === index ? -1 : index)} style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px", background: activeSection === index ? c.surface2 : c.surface, border: "none", cursor: "pointer", textAlign: "left", color: c.text, fontFamily: "'Inconsolata',monospace", fontSize: "12px" }}>
        <span style={{ fontSize: "16px" }}>{icon}</span>
        <span style={{ flex: 1, fontWeight: 600, color: activeSection === index ? c.gold : c.text }}>{title}</span>
        {count !== undefined && <span style={{ color: c.green, fontSize: "10px" }}>{count}</span>}
        <span style={{ color: c.dimmer }}>{activeSection === index ? "\u25be" : "\u25b8"}</span>
      </button>
      {activeSection === index && <div style={{ padding: "16px", borderTop: "1px solid " + c.border }}>{children}</div>}
    </div>
  );

  const PriceRow = ({ label, usd, aed, idr }) => (
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "4px 0", borderBottom: "1px solid " + c.border }}>
      <div style={{ color: c.dim }}>{label}</div>
      <div style={{ color: c.gold }}>{fmtUSD(usd)}</div>
      <div>{fmtAED(aed)}</div>
      <div>{fmtIDR(idr)}</div>
    </div>
  );

  return (
    <div style={secStyle}>
      {/* ═══ LANDING: Paste URL ═══ */}
      {lookupView === "landing" && <div>
        <div style={{ fontSize: "12px", color: c.dim, marginBottom: "12px" }}>Paste any Amazon product URL to check Indonesia margins</div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
          <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && runDryRun()} placeholder="https://www.amazon.ae/dp/... or amzn.to/..." style={{ ...inputStyle, flex: 1 }} />
          <button onClick={runDryRun} disabled={loading || cooldown > 0} style={{ ...btnGreen, opacity: loading || cooldown > 0 ? 0.5 : 1, display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>
            {loading ? <><Spinner /> READING...</> : cooldown > 0 ? `WAIT ${cooldown}s` : "QUICK CHECK"}
          </button>
        </div>
        {stage && <div style={{ fontSize: "11px", color: c.gold, marginBottom: "6px" }}>{stage}</div>}
        {progress > 0 && progress < 100 && <div style={{ height: "3px", background: c.border, borderRadius: "2px", marginBottom: "8px" }}><div style={{ height: "100%", background: c.gold, borderRadius: "2px", width: progress + "%", transition: "width 0.3s" }} /></div>}
        {autoError && <div style={{ padding: "10px", background: dark ? "#3a1a1a" : "#fef2f2", border: "1px solid " + c.red, borderRadius: "4px", fontSize: "11px", color: c.red }}>{autoError}</div>}
      </div>}

      {/* ═══ SCRAPE VIEW: Product found, edit queries, explore sources ═══ */}
      {lookupView === "scrape" && dryRunData && <div>
        <button onClick={resetLookup} style={{ ...btnSec, padding: "4px 12px", fontSize: "9px", marginBottom: "12px" }}>{"\u2190"} NEW LOOKUP</button>

        {/* Product card */}
        <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "6px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: c.text, marginBottom: "4px" }}>{dryRunData.product_name}</div>
          {dryRunData.product_name_id && <div style={{ fontSize: "11px", color: c.dim, marginBottom: "4px" }}>{"\ud83c\uddee\ud83c\udde9"} {dryRunData.product_name_id}</div>}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "11px" }}>
            <span style={{ color: c.gold, fontWeight: 700 }}>AED {dryRunData.price_aed}</span>
            {dryRunData.brand && <Badge text={dryRunData.brand} color={c.dim} bg={c.surface} />}
            {dryRunData.category && <Badge text={dryRunData.category} color={c.green} bg={dark ? "#0D2E1A" : "#E8F5EC"} />}
            {dryRunData.weight_class && <Badge text={dryRunData.weight_class} color={c.gold} bg={dark ? "#2A2210" : "#FDF8ED"} />}
          </div>
          {dryRunData.product_summary && <div style={{ fontSize: "10px", color: c.dimmer, marginTop: "6px", fontStyle: "italic" }}>{dryRunData.product_summary}</div>}
        </div>

        {/* Editable queries */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px" }}>SEARCH QUERIES (edit before exploring)</div>
          {editableQueries.map((q, i) => (
            <div key={i} style={{ display: "flex", gap: "4px", marginBottom: "4px" }}>
              <input value={q} onChange={e => { const u = [...editableQueries]; u[i] = e.target.value; setEditableQueries(u); }} style={{ ...inputStyle, padding: "6px 8px", fontSize: "11px", flex: 1 }} />
              <button onClick={() => setEditableQueries(editableQueries.filter((_, j) => j !== i))} style={{ background: "transparent", border: "1px solid " + c.border, color: c.red, borderRadius: "3px", padding: "0 8px", cursor: "pointer", fontSize: "11px" }}>{"\u2715"}</button>
            </div>
          ))}
          <div style={{ display: "flex", gap: "4px" }}>
            <input value={newQueryInput} onChange={e => setNewQueryInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newQueryInput.trim()) { setEditableQueries([...editableQueries, newQueryInput.trim()]); setNewQueryInput(""); } }} placeholder="Add query..." style={{ ...inputStyle, padding: "6px 8px", fontSize: "11px", flex: 1 }} />
            <button onClick={() => { if (newQueryInput.trim()) { setEditableQueries([...editableQueries, newQueryInput.trim()]); setNewQueryInput(""); } }} style={{ ...btnStyle, padding: "6px 12px", fontSize: "10px" }}>+</button>
          </div>
        </div>

        {/* Source buttons */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
          <button onClick={runLookupToko} disabled={loading} style={{ ...btnGreen, opacity: loading ? 0.5 : 1, display: "flex", alignItems: "center", gap: "6px" }}>
            {loading ? <><Spinner /> EXPLORING...</> : "EXPLORE SOURCE 1 (Tokopedia)"}
          </button>
          <button onClick={runLookupShopee} disabled={loading} style={{ ...btnStyle, background: "#FF5722", color: "#fff", opacity: loading ? 0.5 : 1, display: "flex", alignItems: "center", gap: "6px" }}>
            {loading ? <><Spinner /> EXPLORING...</> : "EXPLORE SOURCE 2 (Shopee)"}
          </button>
        </div>

        {/* Abort / Pause controls */}
        {loading && <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
          <button onClick={() => { apifyPauseRef.current = !apifyPauseRef.current; setApifyPaused(!apifyPaused); }} style={{ padding: "4px 10px", background: "transparent", color: apifyPaused ? c.green : c.gold, border: "1px solid " + (apifyPaused ? c.green : c.gold), borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px" }}>{apifyPaused ? "\u25b6 RESUME" : "\u23f8 PAUSE"}</button>
          <button onClick={() => { apifyAbortRef.current = true; }} style={{ padding: "4px 10px", background: "transparent", color: c.red, border: "1px solid " + c.red, borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px" }}>{"\u25a0 STOP"}</button>
        </div>}

        {stage && <div style={{ fontSize: "11px", color: c.gold, marginBottom: "6px" }}>{stage}</div>}
        {progress > 0 && progress < 100 && <div style={{ height: "3px", background: c.border, borderRadius: "2px", marginBottom: "8px" }}><div style={{ height: "100%", background: c.gold, borderRadius: "2px", width: progress + "%", transition: "width 0.3s" }} /></div>}
        {autoError && <div style={{ padding: "10px", background: dark ? "#3a1a1a" : "#fef2f2", border: "1px solid " + c.red, borderRadius: "4px", fontSize: "11px", color: c.red, marginBottom: "8px" }}>{autoError}</div>}

        {/* Streaming results preview */}
        {streamingResults.length > 0 && !indoResults && <div style={{ padding: "10px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "12px" }}>
          <div style={{ fontSize: "9px", color: c.dimmer, marginBottom: "4px" }}>STREAMING: {streamingResults.length} results so far</div>
          {streamingResults.slice(0, 5).map((r, i) => (
            <div key={i} style={{ fontSize: "10px", color: c.dim, display: "flex", justifyContent: "space-between" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{r.name}</span>
              <span style={{ color: c.gold }}>{fmtIDR(r.price_idr)}</span>
            </div>
          ))}
        </div>}

        {/* Indo results (if already explored) */}
        {indoResults && <div>
          <WaveStatusBar waves={waveStatus} c={c} />
          <div style={{ fontSize: "10px", color: c.green, marginBottom: "8px" }}>{"\u2713"} {indoResults.results.length} Indonesian listings found (median: {fmtIDR(indoResults.price_stats?.median_idr)})</div>
          {/* RUN MARGIN ANALYSIS button */}
          {!marginData && <button onClick={runMarginAnalysis} disabled={marginAnalysisLoading} style={{ ...btnGreen, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
            {marginAnalysisLoading ? <><Spinner /> ANALYZING...</> : "\ud83d\udcca RUN MARGIN ANALYSIS (A + B)"}
          </button>}
        </div>}
      </div>}

      {/* ═══ RESULTS VIEW: Margin analysis done ═══ */}
      {lookupView === "results" && dryRunData && <div>
        <button onClick={resetLookup} style={{ ...btnSec, padding: "4px 12px", fontSize: "9px", marginBottom: "12px" }}>{"\u2190"} NEW LOOKUP</button>

        {/* Product card (compact) */}
        <div style={{ padding: "10px 14px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "6px", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: c.text }}>{dryRunData.product_name?.slice(0, 60)}{dryRunData.product_name?.length > 60 ? "..." : ""}</div>
            <div style={{ fontSize: "10px", color: c.dim }}>{dryRunData.source} · AED {dryRunData.price_aed}</div>
          </div>
          {indoResults && <div style={{ fontSize: "10px", color: c.green }}>{indoResults.results?.length || 0} indo listings · {fmtIDR(indoResults.price_stats?.median_idr)}</div>}
        </div>

        {indoResults && !marginData && <div>
          <WaveStatusBar waves={waveStatus} c={c} />
          <button onClick={runMarginAnalysis} disabled={marginAnalysisLoading} style={{ ...btnGreen, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
            {marginAnalysisLoading ? <><Spinner /> ANALYZING...</> : "\ud83d\udcca RUN MARGIN ANALYSIS (A + B)"}
          </button>
        </div>}

        {stage && <div style={{ fontSize: "11px", color: c.gold, marginBottom: "6px" }}>{stage}</div>}
        {autoError && <div style={{ padding: "10px", background: dark ? "#3a1a1a" : "#fef2f2", border: "1px solid " + c.red, borderRadius: "4px", fontSize: "11px", color: c.red, marginBottom: "8px" }}>{autoError}</div>}

        {/* ═══ MARGIN DATA ═══ */}
        {marginData && displayMargins && <div>
          {/* Big margin number */}
          <div style={{ textAlign: "center", padding: "20px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "8px", marginBottom: "16px" }}>
            <div style={{ fontSize: "40px", fontWeight: 800, color: marginColor(displayMargins.median.margin), fontFamily: "'Inconsolata',monospace" }}>{displayMargins.median.margin.toFixed(1)}%</div>
            <div style={{ fontSize: "11px", color: c.dim }}>Gross Margin (Median)</div>
            <div style={{ marginTop: "8px" }}>
              <Badge text={displayStatus} color={displayStatus === "Candidate" ? c.green : displayStatus === "Investigated" ? c.gold : c.red} bg={displayStatus === "Candidate" ? (dark ? "#0D2E1A" : "#E8F5EC") : displayStatus === "Investigated" ? (dark ? "#2A2210" : "#FDF8ED") : (dark ? "#3a1a1a" : "#fef2f2")} />
              {marginData.confidence && <span style={{ marginLeft: "8px" }}><ConfidenceBadge confidence={marginData.confidence} c={c} /></span>}
            </div>
          </div>

          {/* Freight mode toggle */}
          <div style={{ display: "flex", gap: "4px", marginBottom: "12px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "9px", color: c.dimmer, paddingTop: "6px" }}>FREIGHT:</span>
            {Object.entries(FREIGHT_MODES).map(([k, v]) => (
              <button key={k} onClick={() => setFreightMode(k)} style={{ padding: "4px 10px", background: freightMode === k ? c.gold : "transparent", color: freightMode === k ? c.btnText : c.dim, border: "1px solid " + (freightMode === k ? c.gold : c.border), borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px" }}>{v.icon} {v.label}</button>
            ))}
          </div>

          {/* Scenario A / B toggle */}
          <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
            <button onClick={() => setMarginScenario("A")} style={{ padding: "6px 14px", background: marginScenario === "A" ? c.gold : "transparent", color: marginScenario === "A" ? c.btnText : c.dim, border: "1px solid " + (marginScenario === "A" ? c.gold : c.border), borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "10px", fontWeight: 700 }}>A: Link Price</button>
            <button onClick={() => setMarginScenario("B")} style={{ padding: "6px 14px", background: marginScenario === "B" ? c.green : "transparent", color: marginScenario === "B" ? "#fff" : c.dim, border: "1px solid " + (marginScenario === "B" ? c.green : c.border), borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "10px", fontWeight: 700 }}>B: Market Avg</button>
          </div>

          {/* ═══ SCENARIO A ═══ */}
          {marginScenario === "A" && <div>
            <SectionToggle index={0} title="Cost Breakdown" icon={"\ud83d\udcb0"}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "9px", color: c.dimmer, padding: "4px 0", borderBottom: "1px solid " + c.border2 }}>
                <div>ITEM</div><div>USD</div><div>AED</div><div>IDR</div>
              </div>
              <PriceRow label="UAE Sell" usd={displayMargins.median.uaeUSD} aed={displayMargins.median.uaeAED} idr={displayMargins.median.uaeIDR} />
              <PriceRow label="Indo Source" usd={displayMargins.median.indoUSD} aed={displayMargins.median.indoAED} idr={displayMargins.median.indoIDR} />
              <PriceRow label={FREIGHT_MODES[freightMode]?.label || "Freight"} usd={displayMargins.median.freightUSD} aed={displayMargins.median.freightAED} idr={displayMargins.median.freightIDR} />
              <PriceRow label="Customs 5%" usd={displayMargins.median.dutyUSD} aed={displayMargins.median.dutyAED} idr={displayMargins.median.dutyIDR} />
              <PriceRow label="Last Mile" usd={displayMargins.median.lastMileUSD} aed={displayMargins.median.lastMileAED} idr={displayMargins.median.lastMileIDR} />
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "6px 0", fontWeight: 700 }}>
                <div style={{ color: c.red }}>TOTAL COST</div>
                <div style={{ color: c.red }}>{fmtUSD(displayMargins.median.totalUSD)}</div>
                <div style={{ color: c.red }}>{fmtAED(displayMargins.median.totalAED)}</div>
                <div style={{ color: c.red }}>{fmtIDR(displayMargins.median.totalIDR)}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "6px 0", fontWeight: 700, borderTop: "2px solid " + c.gold }}>
                <div style={{ color: c.green }}>PROFIT</div>
                <div style={{ color: c.green }}>{fmtUSD(displayMargins.median.uaeUSD - displayMargins.median.totalUSD)}</div>
                <div style={{ color: c.green }}>{fmtAED(displayMargins.median.uaeAED - displayMargins.median.totalAED)}</div>
                <div style={{ color: c.green }}>{fmtIDR(displayMargins.median.uaeIDR - displayMargins.median.totalIDR)}</div>
              </div>
            </SectionToggle>

            <SectionToggle index={1} title="Margin Range" icon={"\ud83d\udcca"}>
              {[{ label: "Best (Lowest Indo)", data: displayMargins.best }, { label: "Median", data: displayMargins.median }, { label: "Worst (Highest Indo)", data: displayMargins.worst }].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid " + c.border }}>
                  <span style={{ fontSize: "11px", color: c.dim }}>{r.label}</span>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: marginColor(r.data.margin) }}>{r.data.margin.toFixed(1)}%</span>
                </div>
              ))}
            </SectionToggle>

            <SectionToggle index={2} title="Indonesian Listings" icon={"\ud83c\uddee\ud83c\udde9"} count={indoResults?.results?.length}>
              {indoResults?.results?.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid " + c.border, fontSize: "10px" }}>
                  <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: "8px" }}>
                    <span style={{ color: c.text }}>{r.name}</span>
                    <span style={{ color: c.dimmest }}> · {r.source}{r.seller ? " · " + r.seller : ""}{r.sold ? " · " + r.sold + " sold" : ""}</span>
                  </div>
                  <span style={{ color: c.gold, whiteSpace: "nowrap" }}>{fmtIDR(r.price_idr)}</span>
                </div>
              ))}
            </SectionToggle>

            <SectionToggle index={3} title="Logistics Routes" icon={"\ud83d\udea2"} count={routeComparisons.length}>
              {routeComparisons.map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", borderBottom: "1px solid " + c.border }}>
                  <span style={{ fontSize: "16px" }}>{r.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "11px", color: r.highlight ? c.gold : c.text, fontWeight: r.highlight ? 600 : 400 }}>{r.label}</div>
                    <div style={{ fontSize: "9px", color: c.dim }}>{r.transit} · {r.rate} {r.unit}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: marginColor(r.margin) }}>{r.margin.toFixed(1)}%</div>
                    <div style={{ fontSize: "9px", color: c.dim }}>{fmtUSD(r.profitUSD)} profit</div>
                  </div>
                </div>
              ))}
            </SectionToggle>
          </div>}

          {/* ═══ SCENARIO B ═══ */}
          {marginScenario === "B" && <div>
            {scenarioBLoading && <div style={{ textAlign: "center", padding: "20px" }}><Spinner /><div style={{ marginTop: "8px", color: c.gold, fontSize: "11px" }}>Finding similar items...</div></div>}
            {scenarioBData && scenarioBData.count > 0 && scenarioBMargins && <div>
              <div style={{ padding: "12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "6px", marginBottom: "12px" }}>
                <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px" }}>MARKET COMPARISON ({scenarioBData.count} similar items on {scenarioBData.source})</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px" }}>
                  {[{ l: "LOWEST", v: fmtAED(scenarioBData.lowest) }, { l: "MEDIAN", v: fmtAED(scenarioBData.uaeMedian) }, { l: "AVERAGE", v: fmtAED(scenarioBData.uaeAverage) }, { l: "HIGHEST", v: fmtAED(scenarioBData.highest) }].map(s => (
                    <div key={s.l} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "8px", color: c.dimmer }}>{s.l}</div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: c.gold }}>{s.v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {[
                  { label: "UAE Median vs Indo Median", m: scenarioBMargins.medianVsMedIndo },
                  { label: "UAE Median vs Indo Avg", m: scenarioBMargins.medianVsAvgIndo },
                  { label: "UAE Average vs Indo Median", m: scenarioBMargins.avgVsMedIndo },
                  { label: "UAE Average vs Indo Avg", m: scenarioBMargins.avgVsAvgIndo },
                ].map(s => (
                  <div key={s.label} style={{ padding: "12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                    <div style={{ fontSize: "9px", color: c.dimmer, marginBottom: "4px" }}>{s.label}</div>
                    <div style={{ fontSize: "22px", fontWeight: 800, color: marginColor(s.m.margin) }}>{s.m.margin.toFixed(1)}%</div>
                  </div>
                ))}
              </div>
            </div>}
            {scenarioBData && scenarioBData.count === 0 && <div style={{ padding: "20px", textAlign: "center", color: c.dimmer }}>No similar items found for Scenario B comparison</div>}
          </div>}

          {/* Export */}
          <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
            <button onClick={exportPDF} style={btnSec}>EXPORT PDF</button>
            <button onClick={() => { resetLookup(); }} style={{ ...btnSec, color: c.dim, borderColor: c.border2 }}>NEW LOOKUP</button>
          </div>
        </div>}
      </div>}
    </div>
  );
}

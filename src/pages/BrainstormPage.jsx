import { Spinner, ProductTable, Badge } from "../components/SharedUI";
import { AMAZON_AE_DEPTS, getStyles } from "../constants";
import { fmtAED } from "../helpers";

export default function BrainstormPage({
  c, dark,
  // State (managed by App.jsx)
  bsAmazonProducts, setBsAmazonProducts, bsLastScan, bsDept, setBsDept,
  bsStep, bsSubcats, setBsSubcats, bsProgress, bsError, bsHideBranded, setBsHideBranded,
  bsBoostIndo, setBsBoostIndo, bsFilter, setBsFilter, bsSort, setBsSort,
  bsValidatingIdx, bsValidationResults,
  bsAbortRef, stage,
  // Functions (from App.jsx)
  bsExtractSubcats, bsScrapeApproved, validateProduct, exportBrainstormCSV,
  setBsValidatingIdx, setBsValidationResults,
}) {
  const { secStyle, btnStyle, btnGreen, inputStyle } = getStyles(c);

  // Filtered + sorted products
  const bsFiltered = bsAmazonProducts.filter(p => {
    if (bsHideBranded && p.isBranded) return false;
    if (bsFilter.search && !p.name.toLowerCase().includes(bsFilter.search.toLowerCase())) return false;
    if (bsFilter.minPrice && p.price_aed < parseFloat(bsFilter.minPrice)) return false;
    if (bsFilter.maxPrice && p.price_aed > parseFloat(bsFilter.maxPrice)) return false;
    if (bsFilter.dept !== "all" && p.department !== bsFilter.dept && p.subcategory !== bsFilter.dept) return false;
    return p.price_aed > 0;
  }).sort((a, b) => {
    if (bsSort === "signal") return (b.indoSignal?.score || 0) - (a.indoSignal?.score || 0);
    if (bsSort === "price_asc") return a.price_aed - b.price_aed;
    if (bsSort === "price_desc") return b.price_aed - a.price_aed;
    if (bsSort === "reviews") return (b.reviews || 0) - (a.reviews || 0);
    return 0;
  });

  return (
    <div style={secStyle}>
      <div style={{ fontSize: "10px", color: c.dimmer, marginBottom: "12px", letterSpacing: "1px" }}>BRAINSTORM — ADMIN-ONLY PIPELINE</div>

      {/* Department selector */}
      {bsStep === 0 && <div>
        <div style={{ fontSize: "11px", color: c.dim, marginBottom: "8px" }}>Select Amazon.ae department to scan:</div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
          {AMAZON_AE_DEPTS.map(d => (
            <button key={d.slug} onClick={() => setBsDept(d.slug)} style={{ padding: "6px 12px", background: bsDept === d.slug ? c.gold : "transparent", color: bsDept === d.slug ? c.btnText : c.dim, border: "1px solid " + (bsDept === d.slug ? c.gold : c.border2), borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "10px" }}>{d.label}</button>
          ))}
        </div>
        <button onClick={bsExtractSubcats} style={btnGreen}>EXTRACT SUB-CATEGORIES</button>
        {bsError && <div style={{ marginTop: "8px", color: c.red, fontSize: "11px" }}>{bsError}</div>}
      </div>}

      {/* Step 1: Loading */}
      {bsStep === 1 && <div style={{ textAlign: "center", padding: "40px" }}>
        <Spinner /><div style={{ marginTop: "12px", color: c.gold, fontSize: "12px" }}>{stage || "Extracting..."}</div>
      </div>}

      {/* Step 2: Review sub-categories */}
      {bsStep === 2 && <div>
        <div style={{ fontSize: "11px", color: c.dim, marginBottom: "12px" }}>Review sub-categories — toggle which ones to scrape:</div>
        <div style={{ maxHeight: "300px", overflowY: "auto", marginBottom: "16px" }}>
          {bsSubcats.map((sc, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", borderBottom: "1px solid " + c.border, fontSize: "11px" }}>
              <input type="checkbox" checked={sc.enabled} onChange={() => { const u = [...bsSubcats]; u[i] = { ...u[i], enabled: !u[i].enabled }; setBsSubcats(u); }} />
              <span style={{ flex: 1, color: sc.enabled ? c.text : c.dimmest }}>{sc.name}</span>
              <Badge text={sc.action} color={sc.action === "SCRAPE" ? c.green : c.red} bg={sc.action === "SCRAPE" ? (dark ? "#0D2E1A" : "#E8F5EC") : (dark ? "#3a1a1a" : "#fef2f2")} />
              <span style={{ fontSize: "9px", color: c.dimmer, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sc.reason}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={bsScrapeApproved} style={btnGreen}>SCRAPE {bsSubcats.filter(s => s.enabled).length} SUB-CATEGORIES</button>
          <button onClick={() => { /* reset handled by App */ }} style={{ ...btnStyle, background: "transparent", color: c.dim, border: "1px solid " + c.border2 }}>CANCEL</button>
        </div>
        {bsError && <div style={{ marginTop: "8px", color: c.red, fontSize: "11px" }}>{bsError}</div>}
      </div>}

      {/* Step 3: Scraping progress */}
      {bsStep === 3 && <div style={{ textAlign: "center", padding: "20px" }}>
        <Spinner />
        <div style={{ marginTop: "12px", color: c.gold, fontSize: "12px" }}>{stage || "Scraping..."}</div>
        <div style={{ fontSize: "11px", color: c.dim, marginTop: "4px" }}>{bsProgress.done}/{bsProgress.total}: {bsProgress.current}</div>
        <button onClick={() => { bsAbortRef.current = true; }} style={{ marginTop: "12px", padding: "6px 16px", background: "transparent", color: c.red, border: "1px solid " + c.red, borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "10px" }}>STOP</button>
        {bsAmazonProducts.length > 0 && <div style={{ marginTop: "12px", fontSize: "11px", color: c.green }}>{bsAmazonProducts.length} products found so far</div>}
      </div>}

      {/* Step 5 / Products view */}
      {(bsStep === 5 || bsAmazonProducts.length > 0) && bsStep !== 1 && bsStep !== 2 && bsStep !== 3 && <div>
        {/* Filters */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <input value={bsFilter.search} onChange={e => setBsFilter(f => ({ ...f, search: e.target.value }))} placeholder="Filter products..." style={{ ...inputStyle, flex: 1, minWidth: "150px", padding: "6px 10px", fontSize: "11px" }} />
          <label style={{ fontSize: "10px", color: c.dim, display: "flex", alignItems: "center", gap: "4px" }}>
            <input type="checkbox" checked={bsHideBranded} onChange={() => setBsHideBranded(!bsHideBranded)} /> Hide branded
          </label>
          <label style={{ fontSize: "10px", color: c.dim, display: "flex", alignItems: "center", gap: "4px" }}>
            <input type="checkbox" checked={bsBoostIndo} onChange={() => setBsBoostIndo(!bsBoostIndo)} /> Boost Indo
          </label>
        </div>
        {/* Sort + stats */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "6px" }}>
          <div style={{ display: "flex", gap: "4px" }}>
            {[{ id: "signal", label: "\ud83c\uddee\ud83c\udde9 Signal" }, { id: "reviews", label: "Reviews" }, { id: "price_asc", label: "Price \u2191" }, { id: "price_desc", label: "Price \u2193" }].map(s => (
              <button key={s.id} onClick={() => setBsSort(s.id)} style={{ padding: "3px 8px", background: bsSort === s.id ? c.gold : "transparent", color: bsSort === s.id ? c.btnText : c.dim, border: "1px solid " + (bsSort === s.id ? c.gold : c.border), borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px" }}>{s.label}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ fontSize: "10px", color: c.dim }}>{bsFiltered.length}/{bsAmazonProducts.length}</span>
            <button onClick={() => exportBrainstormCSV(bsFiltered, bsDept)} style={{ padding: "3px 8px", background: "transparent", color: c.gold, border: "1px solid " + c.gold, borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px" }}>CSV</button>
            <button onClick={bsExtractSubcats} style={{ padding: "3px 8px", background: "transparent", color: c.green, border: "1px solid " + c.green, borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px" }}>NEW SCAN</button>
          </div>
        </div>
        {bsLastScan && <div style={{ fontSize: "9px", color: c.dimmest, marginBottom: "8px" }}>Last scan: {new Date(bsLastScan).toLocaleString()}</div>}

        <ProductTable
          products={bsFiltered}
          validatingIdx={bsValidatingIdx}
          validationResults={bsValidationResults}
          onValidate={(p) => validateProduct(p, setBsValidatingIdx, setBsValidationResults)}
          showSubcat={true}
          showSignal={true}
          c={c}
          dark={dark}
        />
      </div>}
    </div>
  );
}

import { Spinner } from '../components/SharedUI.jsx';
import { AMAZON_AE_DEPTS, BRAND_BLOCKLIST_DEFAULT } from '../constants.js';

export default function BrainstormPage({
  c, dark, secStyle, inputStyle, btnStyle, btnSec, btnGreen,
  isAdmin, authToken,
  loading, stage, progress,
  bsStep, setBsStep, bsError, bsSubcats, setBsSubcats,
  bsProgress, bsDept, setBsDept,
  bsExtractSubcats, bsScrapeApproved, bsAbortRef,
  bsAmazonProducts, bsAllProducts, bsLastScan,
  bsHideBranded, setBsHideBranded,
  bsBoostIndo, setBsBoostIndo,
  bsFilter, setBsFilter,
  bsSort, setBsSort,
  bsFiltered,
  bsValidatingIdx, bsValidationResults,
  validateProduct, setBsValidatingIdx, setBsValidationResults,
  showBrandList, setShowBrandList,
  allBrands, baseBrands, setBaseBrands, customBrands, setCustomBrands,
  newBrandInput, setNewBrandInput,
  brandSearchFilter, setBrandSearchFilter,
  exportBrainstormCSV,
  ProductTable,
}) {
  return <div style={secStyle}>


        {/* Status bar */}
        {(loading || bsStep === 3) && stage && <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}><Spinner /><span style={{ fontSize: "12px", color: c.gold }}>{stage}</span></div>}
        {bsError && <div style={{ padding: "10px", background: dark ? "#3a1a1a" : "#FEF2F2", border: "1px solid " + c.red + "44", borderRadius: "4px", marginBottom: "12px", fontSize: "11px", color: c.red }}>{bsError}</div>}

        {/* ── AMAZON BRAINSTORM ── */}
        <div style={{ marginBottom: "16px", padding: "12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "10px", color: c.gold, letterSpacing: "1px", fontWeight: 700 }}>AMAZON.AE SUB-CATEGORY DRILL</span>
              {isAdmin && <span style={{ fontSize: "8px", color: c.dimmer, padding: "1px 5px", border: "1px solid " + c.border, borderRadius: "3px" }}>~$0.89/dept</span>}
            </div>
            {bsLastScan && <span style={{ fontSize: "10px", color: c.dimmer }}>Last: {new Date(bsLastScan).toLocaleDateString()}</span>}
          </div>

          {bsStep === 0 && <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <select value={bsDept} onChange={e => setBsDept(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "8px 12px", fontSize: "11px" }}>
              {AMAZON_AE_DEPTS.map(d => <option key={d.slug} value={d.slug}>{d.label}</option>)}
            </select>
            <button onClick={bsExtractSubcats} disabled={!authToken} style={{ ...btnGreen, padding: "10px 20px", fontSize: "11px", opacity: !authToken ? 0.4 : 1 }}>
              {"\ud83e\udde0"} BRAINSTORM {(AMAZON_AE_DEPTS.find(d => d.slug === bsDept)?.label || "").toUpperCase()}
            </button>
          </div>}

          {/* Step 2: Sub-category review */}
          {bsStep === 2 && <div>
            <div style={{ fontSize: "10px", color: c.gold, marginBottom: "8px", fontWeight: 700 }}>Review sub-categories — toggle SCRAPE/SKIP before proceeding:</div>
            <div style={{ maxHeight: "300px", overflowY: "auto", marginBottom: "10px" }}>
              {bsSubcats.map((sc, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", alignItems: "center", padding: "6px 0", borderBottom: "1px solid " + c.border }}>
                  <button onClick={() => { const u = [...bsSubcats]; u[i].enabled = !u[i].enabled; setBsSubcats(u); }} style={{ padding: "3px 10px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", background: sc.enabled ? c.green : "transparent", color: sc.enabled ? "#fff" : c.red, border: "1px solid " + (sc.enabled ? c.green : c.red), borderRadius: "3px", minWidth: "55px" }}>{sc.enabled ? "SCRAPE" : "SKIP"}</button>
                  <span style={{ flex: 1, fontSize: "11px", color: sc.enabled ? c.text : c.dimmest }}>{sc.name}</span>
                  <span style={{ fontSize: "9px", color: c.dim, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sc.reason}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "10px", color: c.dim }}>{bsSubcats.filter(s => s.enabled).length} SCRAPE {"\u00b7"} {bsSubcats.filter(s => !s.enabled).length} SKIP {"\u00b7"} Est: <span style={{ color: c.darkGold }}>${(bsSubcats.filter(s => s.enabled).length * 0.08).toFixed(2)}</span></span>
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => { setBsStep(0); setBsSubcats([]); }} style={{ ...btnSec, padding: "8px 16px", fontSize: "10px" }}>{"\u2190"} BACK</button>
                <button onClick={bsScrapeApproved} style={{ ...btnGreen, padding: "8px 20px", fontSize: "10px" }}>{"\u2713"} CONFIRM & SCRAPE ({bsSubcats.filter(s => s.enabled).length} sub-cats)</button>
              </div>
            </div>
          </div>}

          {/* Step 3: Scraping progress */}
          {bsStep === 3 && <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <div style={{ flex: 1, height: "3px", background: c.border, borderRadius: "2px" }}><div style={{ width: (bsProgress.done / Math.max(1, bsProgress.total) * 100) + "%", height: "100%", background: c.gold, borderRadius: "2px", transition: "width 0.5s" }} /></div>
              <span style={{ fontSize: "10px", color: c.gold, whiteSpace: "nowrap" }}>{bsProgress.current}... {bsProgress.done}/{bsProgress.total}</span>
              <button onClick={() => { bsAbortRef.current = true; }} style={{ ...btnSec, padding: "4px 10px", fontSize: "9px", color: c.red, borderColor: c.red }}>{"\u25a0"} STOP</button>
            </div>
          </div>}

          {/* Step 5: Done */}
          {bsStep === 5 && <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "10px", color: c.green }}>{"\u2713"} {bsAmazonProducts.length} products extracted</span>
            <span style={{ fontSize: "10px", color: c.dim }}>{bsAmazonProducts.filter(p => !p.isBranded).length} after brand filter</span>
            <button onClick={() => { setBsStep(0); setBsSubcats([]); }} style={{ ...btnSec, padding: "4px 12px", fontSize: "9px" }}>NEW SCAN</button>
            <button onClick={() => exportBrainstormCSV(bsAmazonProducts, "amazon")} style={{ ...btnSec, padding: "4px 12px", fontSize: "9px" }}>{"\ud83d\udcca"} CSV</button>
          </div>}
        </div>

        {/* ── BRAND BLOCKLIST ── */}
        <div style={{ marginBottom: "16px" }}>
          <button onClick={() => setShowBrandList(!showBrandList)} style={{ width: "100%", padding: "8px 12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", cursor: "pointer", display: "flex", justifyContent: "space-between", color: c.dim, fontFamily: "monospace", fontSize: "10px" }}>
            <span>{"\ud83d\udeab"} Brand Blocklist ({allBrands.length} total{isAdmin && " \u00b7 " + baseBrands.length + " base \u00b7 " + customBrands.length + " custom"})</span>
            <span>{showBrandList ? "\u25be" : "\u25b8"}</span>
          </button>
          {showBrandList && <div style={{ padding: "12px", background: c.surface2, border: "1px solid " + c.border, borderTop: "none", borderRadius: "0 0 4px 4px" }}>
            {/* Add brand */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
              <input value={newBrandInput} onChange={e => setNewBrandInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newBrandInput.trim()) { if (isAdmin) { setBaseBrands(prev => [...new Set([...prev, newBrandInput.trim()])]); } else { setCustomBrands(prev => [...new Set([...prev, newBrandInput.trim()])]); } setNewBrandInput(""); } }} placeholder={isAdmin ? "Add to base blocklist..." : "Add brand..."} style={{ ...inputStyle, flex: 1, padding: "4px 8px", fontSize: "10px" }} />
              <button onClick={() => { if (newBrandInput.trim()) { if (isAdmin) { setBaseBrands(prev => [...new Set([...prev, newBrandInput.trim()])]); } else { setCustomBrands(prev => [...new Set([...prev, newBrandInput.trim()])]); } setNewBrandInput(""); } }} style={{ ...btnSec, padding: "4px 10px", fontSize: "9px" }}>+ ADD</button>
            </div>
            {/* Search/filter */}
            <div style={{ marginBottom: "8px" }}>
              <input value={brandSearchFilter} onChange={e => setBrandSearchFilter(e.target.value)} placeholder="Search brands..." style={{ ...inputStyle, width: "100%", padding: "4px 8px", fontSize: "10px" }} />
            </div>
            {/* Custom brands (user-level) */}
            {customBrands.length > 0 && <div style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "4px" }}>MY CUSTOM ({customBrands.length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                {customBrands.filter(b => !brandSearchFilter || b.toLowerCase().includes(brandSearchFilter.toLowerCase())).map((b, i) => <span key={"c" + i} style={{ padding: "2px 6px", background: dark ? "#2A2210" : "#FDF8ED", border: "1px solid " + c.darkGold + "44", borderRadius: "3px", fontSize: "9px", color: c.darkGold, cursor: "pointer" }} onClick={() => setCustomBrands(customBrands.filter(x => x !== b))}>{b} {"\u2715"}</span>)}
              </div>
            </div>}
            {/* Base brand blocklist — editable for admin, read-only for others */}
            <div style={{ marginBottom: "4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px" }}>BASE BLOCKLIST ({baseBrands.length}){isAdmin && " \u2014 click to remove"}</div>
              {isAdmin && <div style={{ display: "flex", gap: "4px" }}>
                <button onClick={() => { if (confirm("Reset to default " + BRAND_BLOCKLIST_DEFAULT.length + " brands?")) setBaseBrands([...BRAND_BLOCKLIST_DEFAULT]); }} style={{ padding: "2px 6px", fontSize: "7px", fontFamily: "monospace", cursor: "pointer", background: "transparent", color: c.dimmer, border: "1px solid " + c.border2, borderRadius: "2px" }}>RESET DEFAULT</button>
              </div>}
            </div>
            <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexWrap: "wrap", gap: "3px" }}>
              {baseBrands.filter(b => !brandSearchFilter || b.toLowerCase().includes(brandSearchFilter.toLowerCase())).map((b, i) => (
                <span key={"b" + i} style={{ padding: "2px 6px", background: isAdmin ? (dark ? "#1a1a2a" : "#F0F0FF") : (dark ? "#3a1a1a" : "#FEF2F2"), border: "1px solid " + (isAdmin ? c.dim + "33" : c.red + "22"), borderRadius: "3px", fontSize: "8px", color: isAdmin ? c.dim : c.dimmest, cursor: isAdmin ? "pointer" : "default" }} onClick={() => { if (isAdmin) setBaseBrands(baseBrands.filter(x => x !== b)); }}>{b}{isAdmin && " \u2715"}</span>
              ))}
              {baseBrands.filter(b => !brandSearchFilter || b.toLowerCase().includes(brandSearchFilter.toLowerCase())).length === 0 && <span style={{ fontSize: "9px", color: c.dimmest }}>No brands match filter</span>}
            </div>
            {isAdmin && <div style={{ marginTop: "8px", fontSize: "9px", color: c.dimmer, fontStyle: "italic" }}>Changes auto-save globally for all users</div>}
          </div>}
        </div>

        {/* ── FILTER BAR ── */}
        {bsAllProducts.length > 0 && <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setBsHideBranded(!bsHideBranded)} style={{ padding: "4px 10px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", background: bsHideBranded ? c.red : "transparent", color: bsHideBranded ? "#fff" : c.dim, border: "1px solid " + (bsHideBranded ? c.red : c.border2), borderRadius: "3px" }}>{"\ud83d\udeab"} {bsHideBranded ? "BRANDED HIDDEN" : "SHOW ALL"}</button>
          <button onClick={() => setBsBoostIndo(!bsBoostIndo)} style={{ padding: "4px 10px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", background: bsBoostIndo ? c.green : "transparent", color: bsBoostIndo ? "#fff" : c.dim, border: "1px solid " + (bsBoostIndo ? c.green : c.border2), borderRadius: "3px" }}>{"\ud83c\uddee\ud83c\udde9"} BOOST {bsBoostIndo ? "ON" : "OFF"}</button>
          <input value={bsFilter.search} onChange={e => setBsFilter({ ...bsFilter, search: e.target.value })} placeholder="Search..." style={{ ...inputStyle, width: "140px", padding: "4px 8px", fontSize: "10px" }} />
          <input value={bsFilter.minPrice} onChange={e => setBsFilter({ ...bsFilter, minPrice: e.target.value })} placeholder="Min AED" style={{ ...inputStyle, width: "60px", padding: "4px 6px", fontSize: "10px", textAlign: "center" }} />
          <input value={bsFilter.maxPrice} onChange={e => setBsFilter({ ...bsFilter, maxPrice: e.target.value })} placeholder="Max AED" style={{ ...inputStyle, width: "60px", padding: "4px 6px", fontSize: "10px", textAlign: "center" }} />
          {[{ id: "signal", label: "\ud83c\uddee\ud83c\udde9 Signal" }, { id: "reviews", label: "Reviews" }, { id: "price_asc", label: "Price \u2191" }].map(s => (
            <button key={s.id} onClick={() => setBsSort(s.id)} style={{ padding: "3px 8px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", background: bsSort === s.id ? c.gold : "transparent", color: bsSort === s.id ? c.btnText : c.dim, border: "1px solid " + (bsSort === s.id ? c.gold : c.border2), borderRadius: "3px" }}>{s.label}</button>
          ))}
          <span style={{ fontSize: "10px", color: c.green }}>{bsFiltered.length}/{bsAllProducts.length}</span>
        </div>}

        {/* ── RESULTS TABLE ── */}
        {bsFiltered.length > 0 && <ProductTable products={bsFiltered} validatingIdx={bsValidatingIdx} validationResults={bsValidationResults} onValidate={p => validateProduct(p, setBsValidatingIdx, setBsValidationResults)} showSubcat showSignal />}

        {bsAllProducts.length === 0 && bsStep === 0 && <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: "36px", marginBottom: "10px", opacity: 0.15 }}>{"\ud83e\udde0"}</div>
          <div style={{ fontSize: "12px", color: c.dim }}>Select a department and brainstorm to discover niche products</div>
          <div style={{ fontSize: "10px", color: c.dimmer, marginTop: "6px" }}>Sub-category drilling surfaces hidden gems that top-level scans miss</div>
        </div>}
  </div>;
}

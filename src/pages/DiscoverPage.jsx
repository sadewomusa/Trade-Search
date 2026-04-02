import { Spinner } from '../components/SharedUI.jsx';

export default function DiscoverPage({
  c, dark, secStyle, inputStyle, btnStyle, btnSec, btnGreen,
  isAdmin,
  keywords, setKeywords, newKeywordInput, setNewKeywordInput,
  discSearchInput, setDiscSearchInput,
  discSearchingAmazon, searchAmazonSD,
  discAllProducts, discError,
  discHistory, discSelectedIdx, setDiscSelectedIdx, setDiscAmazonResults,
  setDiscValidationResults,
  discSort, setDiscSort,
  discValidatingIdx, discValidationResults,
  validateProduct, setDiscValidatingIdx, setDiscValidationResults: setDiscValResults,
  exportDiscoverCSV, deleteDiscHistory,
  stage,
  fmtAED,
  ProductTable,
  discViewMode, setDiscViewMode,
  discSelected, setDiscSelected,
  discQuickFilter, setDiscQuickFilter,
  discPriceMin, setDiscPriceMin,
  discPriceMax, setDiscPriceMax,
  discPreviewOpen, setDiscPreviewOpen,
  discPreviewLoading,
  discPreviewCache,
  fetchProductPreview,
  extractSizeTag,
  launchDeepDiveFromDiscover,
}) {
  // ── Client-side quick filters ──
  const filteredProducts = (discAllProducts || []).filter(p => {
    if (discQuickFilter && !(p.title || p.name || "").toLowerCase().includes(discQuickFilter.toLowerCase())) return false;
    const price = parseFloat(p.price_aed || p.price) || 0;
    if (discPriceMin && price < parseFloat(discPriceMin)) return false;
    if (discPriceMax && price > parseFloat(discPriceMax)) return false;
    return true;
  });

  const toggleSelect = (asin) => {
    setDiscSelected(prev => {
      const next = new Set(prev);
      if (next.has(asin)) next.delete(asin);
      else next.add(asin);
      return next;
    });
  };

  const selectedCount = discSelected?.size || 0;
  const canDeepDive = selectedCount >= 5 && selectedCount <= 15;

  const pill = { display: "inline-block", padding: "1px 5px", borderRadius: "8px", fontSize: "9px", fontFamily: "monospace" };
  const mono = { fontFamily: "'Inconsolata',monospace" };

  return <div style={secStyle}>


        {/* ── KEYWORD BANK (admin only) ── */}
        {isAdmin && <div style={{ marginBottom: "16px", padding: "12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px" }}>
          <div style={{ fontSize: "9px", color: c.gold, letterSpacing: "1px", fontWeight: 700, marginBottom: "8px" }}>{"\ud83c\udf1f"} KEYWORD BANK ({keywords.length})</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }}>
            {keywords.map((kw, i) => (
              <button key={i} onClick={() => setDiscSearchInput(kw)} style={{ padding: "3px 8px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", background: dark ? "#0D2E1A" : "#E8F5EC", color: c.green, border: "1px solid " + c.green + "44", borderRadius: "3px", position: "relative" }}>
                {kw}
                <span onClick={e => { e.stopPropagation(); setKeywords(keywords.filter((_, idx) => idx !== i)); }} style={{ marginLeft: "4px", color: c.dimmest, fontSize: "8px" }}>{"\u2715"}</span>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            <input value={newKeywordInput} onChange={e => setNewKeywordInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newKeywordInput.trim() && !keywords.includes(newKeywordInput.trim())) { setKeywords([...keywords, newKeywordInput.trim()]); setNewKeywordInput(""); } }} placeholder="Add keyword..." style={{ ...inputStyle, flex: 1, padding: "5px 8px", fontSize: "10px" }} />
            <button onClick={() => { if (newKeywordInput.trim() && !keywords.includes(newKeywordInput.trim())) { setKeywords([...keywords, newKeywordInput.trim()]); setNewKeywordInput(""); } }} style={{ ...btnSec, padding: "5px 12px", fontSize: "9px" }}>+ ADD</button>
          </div>
        </div>}

        {/* ── SEARCH ── */}
        <div style={{ marginBottom: "16px", padding: "12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "10px" }}>
            <input value={discSearchInput} onChange={e => setDiscSearchInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && discSearchInput.trim()) { searchAmazonSD(discSearchInput); } }} placeholder="Search keyword (e.g. coconut bowl, rattan basket)..." style={{ ...inputStyle, flex: 1, padding: "10px 12px" }} />
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => searchAmazonSD(discSearchInput)} disabled={discSearchingAmazon || !discSearchInput.trim()} style={{ ...btnGreen, padding: "8px 16px", fontSize: "10px", opacity: (discSearchingAmazon || !discSearchInput.trim()) ? 0.4 : 1 }}>
              {discSearchingAmazon ? <><Spinner />{" Searching..."}</> : "SEARCH AMAZON"}
            </button>
            {discAllProducts.length > 0 && <button onClick={() => exportDiscoverCSV(discAllProducts, discHistory[discSelectedIdx]?.keyword || discSearchInput)} style={{ ...btnSec, padding: "6px 12px", fontSize: "9px" }}>{"\ud83d\udcca"} CSV</button>}
          </div>
          {isAdmin && <div style={{ fontSize: "8px", color: c.dimmest, marginTop: "4px" }}>Fetches 3 pages · Filters zero-review products · Sorted by popularity</div>}
        </div>

        {/* ── PAST SEARCHES — persistent chip bar ── */}
        {discHistory.length > 0 && <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", textTransform: "uppercase" }}>PAST SEARCHES</div>
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {discHistory.map((dh, i) => (
              <div key={i} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 10px", background: discSelectedIdx === i ? (dark ? "#0D2E1A" : "#E8F5EC") : c.surface2, border: "1px solid " + (discSelectedIdx === i ? c.green : c.border), borderRadius: "4px", cursor: "pointer", transition: "all 0.15s" }} onClick={() => { setDiscAmazonResults(dh.results); setDiscSelectedIdx(i); setDiscValidationResults({}); }}>
                <span style={{ fontSize: "10px", fontWeight: discSelectedIdx === i ? 700 : 400, color: discSelectedIdx === i ? c.green : c.text, maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dh.keyword}</span>
                <span style={{ fontSize: "8px", color: c.dimmer, fontFamily: "monospace" }}>{dh.results?.length}</span>
                <span onClick={e => { e.stopPropagation(); exportDiscoverCSV(dh.results, dh.keyword); }} style={{ fontSize: "8px", color: c.dim, cursor: "pointer", padding: "0 2px" }} title="Export CSV">{"\ud83d\udcca"}</span>
                <span onClick={e => { e.stopPropagation(); deleteDiscHistory(i); }} style={{ fontSize: "8px", color: c.red + "88", cursor: "pointer", padding: "0 2px" }} title="Delete">{"\u2715"}</span>
              </div>
            ))}
          </div>
        </div>}

        {discError && <div style={{ padding: "10px", background: dark ? "#3a1a1a" : "#FEF2F2", border: "1px solid " + c.red + "44", borderRadius: "4px", marginBottom: "12px", fontSize: "11px", color: c.red }}>{discError}</div>}
        {discSearchingAmazon && stage && <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}><Spinner /><span style={{ fontSize: "12px", color: c.gold }}>{stage}</span></div>}

        {/* ── PRICE SUMMARY ── */}
        {discAllProducts.length > 0 && (() => {
          const prices = discAllProducts.map(p => p.price_aed).filter(p => p > 0).sort((a, b) => a - b);
          const lowest = prices[0] || 0;
          const highest = prices[prices.length - 1] || 0;
          const median = prices[Math.floor(prices.length / 2)] || 0;
          const average = prices.length ? Math.round((prices.reduce((s, x) => s + x, 0) / prices.length) * 100) / 100 : 0;
          const topReviewed = [...discAllProducts].sort((a, b) => (b.reviews || 0) - (a.reviews || 0))[0];
          return (
            <div style={{ marginBottom: "16px", padding: "12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px" }}>
              {discSelectedIdx >= 0 && discHistory[discSelectedIdx] && <div style={{ fontSize: "10px", color: c.gold, fontWeight: 700, marginBottom: "10px", letterSpacing: "0.5px" }}>{"\ud83d\udcca"} {discHistory[discSelectedIdx].keyword.toUpperCase()} — {discAllProducts.length} products {discHistory[discSelectedIdx]?.filtered > 0 && <span style={{ color: c.dimmer, fontWeight: 400 }}>({discHistory[discSelectedIdx].filtered} zero-review filtered)</span>}</div>}
              <div className="bandar-grid4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "10px" }}>
                {[
                  { l: "LOWEST", v: lowest, cl: c.green },
                  { l: "MEDIAN", v: median, cl: c.gold },
                  { l: "AVERAGE", v: average, cl: c.dim },
                  { l: "HIGHEST", v: highest, cl: c.red }
                ].map(s => (
                  <div key={s.l} style={{ padding: "8px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                    <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "3px" }}>{s.l}</div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: s.cl }}>{fmtAED(s.v)}</div>
                  </div>
                ))}
              </div>
              {topReviewed && <div style={{ fontSize: "9px", color: c.dim }}>
                {"\ud83c\udfc6"} Top seller: <span style={{ color: c.text, fontWeight: 500 }}>{topReviewed.name?.slice(0, 60)}{topReviewed.name?.length > 60 ? "..." : ""}</span> — <span style={{ color: c.gold }}>{fmtAED(topReviewed.price_aed)}</span> · <span style={{ color: c.green }}>{(topReviewed.reviews || 0).toLocaleString()} reviews</span>
              </div>}
            </div>
          );
        })()}

        {/* ── View toggle + Quick filters + Sort bar ── */}
        {discAllProducts.length > 0 && <div style={{ marginBottom: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
            {/* View mode toggle */}
            <div style={{ display: "flex", gap: "4px" }}>
              {[{ id: "card", icon: "\u25a6" }, { id: "list", icon: "\u2630" }].map(v => (
                <button key={v.id} onClick={() => setDiscViewMode(v.id)} style={{ padding: "4px 10px", fontSize: "11px", fontFamily: "monospace", cursor: "pointer", background: discViewMode === v.id ? c.gold : "transparent", color: discViewMode === v.id ? c.btnText : c.dim, border: "1px solid " + (discViewMode === v.id ? c.gold : c.border), borderRadius: "3px" }}>{v.icon}</button>
              ))}
            </div>
            {/* Quick filters */}
            <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
              <input value={discQuickFilter} onChange={e => setDiscQuickFilter(e.target.value)} placeholder="Filter titles..." style={{ ...inputStyle, padding: "4px 8px", fontSize: "10px", width: "130px" }} />
              <input type="number" value={discPriceMin} onChange={e => setDiscPriceMin(e.target.value)} placeholder="Min" style={{ ...inputStyle, padding: "4px 6px", fontSize: "10px", width: "60px" }} />
              <span style={{ color: c.dim, fontSize: "10px" }}>{"\u2013"}</span>
              <input type="number" value={discPriceMax} onChange={e => setDiscPriceMax(e.target.value)} placeholder="Max" style={{ ...inputStyle, padding: "4px 6px", fontSize: "10px", width: "60px" }} />
            </div>
          </div>
          {/* Sort buttons */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            {[{ id: "reviews", label: "Most Reviews" }, { id: "rating", label: "Top Rated" }, { id: "price_asc", label: "Price \u2191" }, { id: "price_desc", label: "Price \u2193" }].map(s => (
              <button key={s.id} onClick={() => setDiscSort(s.id)} style={{ padding: "3px 8px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", background: discSort === s.id ? c.gold : "transparent", color: discSort === s.id ? c.btnText : c.dim, border: "1px solid " + (discSort === s.id ? c.gold : c.border2), borderRadius: "3px" }}>{s.label}</button>
            ))}
            <span style={{ fontSize: "10px", color: c.green, marginLeft: "auto", ...mono }}>{filteredProducts.length}{filteredProducts.length !== discAllProducts.length ? " / " + discAllProducts.length : ""} results</span>
          </div>
        </div>}

        {/* ── Results: Card View ── */}
        {discAllProducts.length > 0 && discViewMode === "card" && <ProductTable products={filteredProducts} validatingIdx={discValidatingIdx} validationResults={discValidationResults} onValidate={p => validateProduct(p, setDiscValidatingIdx, setDiscValidationResults)} showSubcat={false} showSignal={false} />}

        {/* ── Results: Compact List View ── */}
        {discAllProducts.length > 0 && discViewMode === "list" && <div style={{ border: "1px solid " + c.border, borderRadius: "4px", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", background: dark ? "#111" : "#f5f5f0", borderBottom: "1px solid " + c.border, fontSize: "9px", color: c.dim, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            <div style={{ width: 30 }}>{"\u2611"}</div>
            <div style={{ width: 40 }}>Img</div>
            <div style={{ flex: 1 }}>Title</div>
            <div style={{ width: 80, textAlign: "right" }}>Price</div>
            <div style={{ width: 55, textAlign: "center" }}>Rating</div>
            <div style={{ width: 65, textAlign: "center" }}>Size</div>
            <div style={{ width: 36 }}></div>
          </div>
          {/* Rows */}
          <div style={{ maxHeight: "450px", overflowY: "auto" }}>
            {filteredProducts.map((p, i) => {
              const asin = p.asin;
              const isSelected = discSelected?.has(asin);
              const size = extractSizeTag ? extractSizeTag(p.title || p.name || "") : null;
              const isPreviewOpen = discPreviewOpen === asin;
              const prevData = discPreviewCache?.[asin];
              return <div key={asin || i}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 8px", borderBottom: "1px solid " + c.border + "44", background: isSelected ? (dark ? "#1a2a1a" : "#f0faf0") : "transparent" }}>
                  <input type="checkbox" checked={!!isSelected} onChange={() => toggleSelect(asin)} style={{ width: 16, height: 16, accentColor: c.gold, cursor: "pointer" }} />
                  {(p.image || p.thumbnail) && <img src={p.image || p.thumbnail} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 3, background: "#fff" }} />}
                  <div style={{ flex: 1, minWidth: 0, fontSize: "11px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...mono }}>{p.title || p.name || "\u2014"}</div>
                  <div style={{ width: 80, textAlign: "right", fontSize: "11px", color: c.gold, fontWeight: 600, ...mono }}>{(p.price_aed || p.price) ? "AED " + parseFloat(p.price_aed || p.price).toFixed(0) : "\u2014"}</div>
                  <div style={{ width: 55, textAlign: "center", fontSize: "10px", color: c.dim }}>{"\u2b50" + (p.rating || "\u2014")}</div>
                  <div style={{ width: 65, textAlign: "center" }}>
                    {size ? <span style={{ ...pill, background: dark ? "#1a2a2a" : "#e0f0f0", color: dark ? "#6dd" : "#077" }}>{size}</span> : <span style={{ fontSize: "9px", color: c.dimmest }}>{"\u2014"}</span>}
                  </div>
                  <button onClick={() => fetchProductPreview(asin)} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "14px", color: c.dim, padding: "2px", width: 30 }} title="Preview (5 credits)">{"\ud83d\udc41"}</button>
                </div>
                {/* Inline preview */}
                {isPreviewOpen && <div style={{ padding: "8px 16px 10px 60px", background: dark ? "#111" : "#fafafa", borderBottom: "1px solid " + c.border, fontSize: "10px" }}>
                  {discPreviewLoading && !prevData ? <span style={{ color: c.dim }}>Loading preview...</span> : prevData ? <div>
                    {prevData.feature_bullets?.length > 0 && <div style={{ marginBottom: 6 }}>
                      <span style={{ fontSize: "9px", color: c.dim, textTransform: "uppercase", letterSpacing: "1px" }}>Key Features</span>
                      <ul style={{ margin: "2px 0 0 16px", padding: 0, color: c.text }}>{prevData.feature_bullets.slice(0, 5).map((b, bi) => <li key={bi} style={{ marginBottom: 2, lineHeight: 1.3 }}>{b}</li>)}</ul>
                    </div>}
                    {prevData.product_information && <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", color: c.text }}>
                      {Object.entries(prevData.product_information).slice(0, 8).map(([k, v]) => <span key={k}><span style={{ color: c.dim }}>{k}:</span> {v}</span>)}
                    </div>}
                  </div> : <span style={{ color: c.dim }}>No data</span>}
                </div>}
              </div>;
            })}
          </div>
        </div>}

        {discAllProducts.length === 0 && !discSearchingAmazon && <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: "36px", marginBottom: "10px", opacity: 0.15 }}>{"\ud83d\udd0d"}</div>
          <div style={{ fontSize: "12px", color: c.dim }}>{discHistory.length > 0 ? "Select a past search above, or search a new keyword" : "Type a product keyword to search Amazon.ae"}</div>
          <div style={{ fontSize: "10px", color: c.dimmer, marginTop: "6px" }}>Find products on Amazon.ae, then validate margins against Indonesian prices</div>
        </div>}

        {/* ── Floating Deep Dive button ── */}
        {selectedCount >= 3 && <div style={{ position: "sticky", bottom: 16, display: "flex", justifyContent: "center", padding: "10px 0", zIndex: 100, pointerEvents: "none" }}>
          <button onClick={canDeepDive ? launchDeepDiveFromDiscover : undefined} disabled={!canDeepDive} style={{ pointerEvents: "auto", padding: "10px 28px", fontSize: "13px", fontFamily: "'Lora',serif", fontWeight: 600, background: canDeepDive ? c.gold : c.surface, color: canDeepDive ? c.btnText : c.dim, border: "2px solid " + (canDeepDive ? c.gold : c.border2), borderRadius: "24px", cursor: canDeepDive ? "pointer" : "not-allowed", boxShadow: "0 4px 16px " + (dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.15)"), opacity: canDeepDive ? 1 : 0.7, transition: "all 0.2s" }} title={!canDeepDive ? "Select at least 5 products (max 15)" : ""}>
            {"\ud83c\udfaf"} Deep Dive Selected ({selectedCount})
          </button>
        </div>}
  </div>;
}

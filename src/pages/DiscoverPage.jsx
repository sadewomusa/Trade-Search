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
}) {
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

        {/* ── Sort bar ── */}
        {discAllProducts.length > 0 && <div style={{ display: "flex", gap: "6px", marginBottom: "10px", flexWrap: "wrap", alignItems: "center" }}>
          {[{ id: "reviews", label: "Most Reviews" }, { id: "rating", label: "Top Rated" }, { id: "price_asc", label: "Price \u2191" }, { id: "price_desc", label: "Price \u2193" }].map(s => (
            <button key={s.id} onClick={() => setDiscSort(s.id)} style={{ padding: "3px 8px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", background: discSort === s.id ? c.gold : "transparent", color: discSort === s.id ? c.btnText : c.dim, border: "1px solid " + (discSort === s.id ? c.gold : c.border2), borderRadius: "3px" }}>{s.label}</button>
          ))}
          <span style={{ fontSize: "10px", color: c.green, marginLeft: "auto" }}>{discAllProducts.length} results</span>
        </div>}

        {/* Results */}
        {discAllProducts.length > 0 && <ProductTable products={discAllProducts} validatingIdx={discValidatingIdx} validationResults={discValidationResults} onValidate={p => validateProduct(p, setDiscValidatingIdx, setDiscValidationResults)} showSubcat={false} showSignal={false} />}

        {discAllProducts.length === 0 && !discSearchingAmazon && <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: "36px", marginBottom: "10px", opacity: 0.15 }}>{"\ud83d\udd0d"}</div>
          <div style={{ fontSize: "12px", color: c.dim }}>{discHistory.length > 0 ? "Select a past search above, or search a new keyword" : "Type a product keyword to search Amazon.ae"}</div>
          <div style={{ fontSize: "10px", color: c.dimmer, marginTop: "6px" }}>Find products on Amazon.ae, then validate margins against Indonesian prices</div>
        </div>}
  </div>;
}

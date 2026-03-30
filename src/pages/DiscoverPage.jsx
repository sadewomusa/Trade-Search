import { useState } from "react";
import { Spinner, ProductTable } from "../components/SharedUI";
import { getStyles } from "../constants";
import { fmtAED } from "../helpers";

export default function DiscoverPage({ c, dark, stage, workerCall, addDiag, setStage, validateProduct, historyRef, saveHistoryNow, setHistory, checkQuota, incrementUsage, callClaude, parseJSON, calcMargin, runFullIndoSearch, storeSet, userId, storageReady, authToken }) {
  const { inputStyle, btnStyle, btnGreen, secStyle } = getStyles(c);

  const [discSearchInput, setDiscSearchInput] = useState("");
  const [discAmazonResults, setDiscAmazonResults] = useState([]);
  const [discSearchingAmazon, setDiscSearchingAmazon] = useState(false);
  const [discError, setDiscError] = useState("");
  const [discValidatingIdx, setDiscValidatingIdx] = useState(null);
  const [discValidationResults, setDiscValidationResults] = useState({});
  const [discHistory, setDiscHistory] = useState([]);
  const [discSelectedIdx, setDiscSelectedIdx] = useState(-1);
  const [discSort, setDiscSort] = useState("reviews");

  // Load discover history on mount
  const [loaded, setLoaded] = useState(false);
  if (!loaded && userId && storageReady) {
    import("../storage").then(({ storeGet }) => {
      storeGet(userId + ":discover:history").then(disc => {
        if (disc?.length) { setDiscHistory(disc); setDiscAmazonResults(disc[0]?.results || []); setDiscSelectedIdx(0); }
      });
    });
    setLoaded(true);
  }

  // Auto-save discover history
  const saveDiscHistory = (newHistory) => {
    setDiscHistory(newHistory);
    if (storageReady && userId && newHistory.length) {
      setTimeout(() => storeSet(userId + ":discover:history", newHistory), 2000);
    }
  };

  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  const searchAmazonSD = async (keyword) => {
    if (!keyword.trim()) return;
    setDiscSearchingAmazon(true); setDiscError(""); setDiscSelectedIdx(-1);
    addDiag("info", "disc_amazon", `Searching Amazon.ae: "${keyword}" (3 pages)`);
    try {
      let allItems = [];
      const seenAsins = new Set();
      for (let page = 1; page <= 3; page++) {
        setStage(`Searching page ${page}/3...`);
        try {
          const data = await workerCall("scrapingdog_search", { query: keyword.trim(), domain: "ae", page });
          const products = (data.results || data.organic_results || data.search_results || data || []);
          const items = (Array.isArray(products) ? products : []).map(p => ({
            name: p.title || p.name || "",
            price_aed: parseFloat(String(p.price || p.extracted_price || "0").replace(/[^0-9.]/g, "")) || 0,
            rating: parseFloat(p.rating || p.stars || 0) || 0,
            reviews: parseInt(String(p.reviews || p.total_reviews || p.ratings_total || "0").replace(/[^0-9]/g, "")) || 0,
            asin: p.asin || "",
            url: p.link || p.url || (p.asin ? "https://www.amazon.ae/dp/" + p.asin : ""),
            source: "Amazon.ae",
            department: keyword,
            brand: p.brand || ""
          })).filter(p => p.name && p.name.length > 3 && p.price_aed > 0);
          for (const item of items) {
            const key = item.asin || (item.name + "_" + item.price_aed);
            if (!seenAsins.has(key)) { seenAsins.add(key); allItems.push(item); }
          }
          addDiag("info", "disc_amazon", `Page ${page}: ${items.length} raw → ${allItems.length} total so far`);
          if (items.length < 5) break;
          if (page < 3) await wait(800);
        } catch (e) { addDiag("warn", "disc_amazon", `Page ${page}: ${e.message}`); break; }
      }
      const totalRaw = allItems.length;
      const withReviews = allItems.filter(p => p.reviews > 0);
      const sorted = withReviews.sort((a, b) => b.reviews - a.reviews);
      addDiag(sorted.length > 0 ? "ok" : "warn", "disc_amazon", `${sorted.length} products final (sorted by reviews)`);
      const entry = { keyword: keyword.trim(), timestamp: new Date().toISOString(), results: sorted, totalRaw, filtered: totalRaw - sorted.length };
      const newHistory = [entry, ...discHistory].slice(0, 100);
      saveDiscHistory(newHistory);
      setDiscAmazonResults(sorted);
      setDiscSelectedIdx(0);
    } catch (e) { addDiag("error", "disc_amazon", e.message); setDiscError(e.message); }
    setDiscSearchingAmazon(false); setStage("");
  };

  const exportDiscoverCSV = (results, keyword) => {
    if (!results?.length) return;
    const h = ["Name","AED","Rating","Reviews","ASIN","Brand","Source","URL"];
    const rows = results.map(p => ['"' + (p.name || "").replace(/"/g, '""') + '"', p.price_aed || 0, p.rating || 0, p.reviews || 0, p.asin || "", '"' + (p.brand || "") + '"', p.source || "", p.url || ""].join(","));
    const blob = new Blob([[h.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bandar-discover-" + (keyword || "search").replace(/[^a-z0-9]/gi, "-").slice(0, 40) + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
  };

  const deleteDiscHistory = (idx) => {
    const nh = discHistory.filter((_, i) => i !== idx);
    saveDiscHistory(nh);
    if (discSelectedIdx === idx) { setDiscAmazonResults([]); setDiscSelectedIdx(-1); }
    else if (discSelectedIdx > idx) { setDiscSelectedIdx(discSelectedIdx - 1); }
  };

  const discAllProducts = [...discAmazonResults].sort((a, b) => {
    if (discSort === "reviews") return (b.reviews || 0) - (a.reviews || 0);
    if (discSort === "price_asc") return a.price_aed - b.price_aed;
    if (discSort === "price_desc") return b.price_aed - a.price_aed;
    if (discSort === "rating") return (b.rating || 0) - (a.rating || 0);
    return 0;
  });

  return (
    <div style={secStyle}>
      {/* Search bar */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <input value={discSearchInput} onChange={e => setDiscSearchInput(e.target.value)} onKeyDown={e => e.key === "Enter" && searchAmazonSD(discSearchInput)} placeholder="Search Amazon.ae (e.g. coconut bowl, rattan basket)..." style={{ ...inputStyle, flex: 1, minWidth: "200px" }} />
        <button onClick={() => searchAmazonSD(discSearchInput)} disabled={discSearchingAmazon || !discSearchInput.trim()} style={{ ...btnGreen, opacity: discSearchingAmazon || !discSearchInput.trim() ? 0.5 : 1, display: "flex", alignItems: "center", gap: "6px" }}>
          {discSearchingAmazon ? <><Spinner /> SEARCHING...</> : "SEARCH AMAZON"}
        </button>
      </div>
      {stage && <div style={{ fontSize: "11px", color: c.gold, marginBottom: "8px" }}>{stage}</div>}
      {discError && <div style={{ padding: "8px", background: dark ? "#3a1a1a" : "#fef2f2", border: "1px solid " + c.red, borderRadius: "4px", fontSize: "11px", color: c.red, marginBottom: "12px" }}>{discError}</div>}

      {/* Search history chips */}
      {discHistory.length > 0 && <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px" }}>SEARCH HISTORY</div>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {discHistory.map((dh, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <button onClick={() => { setDiscAmazonResults(dh.results || []); setDiscSelectedIdx(i); }} style={{ padding: "4px 10px", background: discSelectedIdx === i ? c.gold : "transparent", color: discSelectedIdx === i ? c.btnText : c.dim, border: "1px solid " + (discSelectedIdx === i ? c.gold : c.border2), borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "10px" }}>
                {dh.keyword} <span style={{ opacity: 0.6 }}>({dh.results?.length || 0})</span>
              </button>
              <button onClick={() => deleteDiscHistory(i)} style={{ background: "transparent", border: "none", color: c.dimmest, cursor: "pointer", fontSize: "10px", padding: "2px" }}>{"\u2715"}</button>
            </div>
          ))}
        </div>
      </div>}

      {/* Sort + export */}
      {discAllProducts.length > 0 && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <span style={{ fontSize: "9px", color: c.dimmer }}>SORT:</span>
          {[{ id: "reviews", label: "Reviews" }, { id: "price_asc", label: "Price \u2191" }, { id: "price_desc", label: "Price \u2193" }, { id: "rating", label: "Rating" }].map(s => (
            <button key={s.id} onClick={() => setDiscSort(s.id)} style={{ padding: "3px 8px", background: discSort === s.id ? c.gold : "transparent", color: discSort === s.id ? c.btnText : c.dim, border: "1px solid " + (discSort === s.id ? c.gold : c.border), borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px" }}>{s.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", color: c.dim }}>{discAllProducts.length} products</span>
          <button onClick={() => exportDiscoverCSV(discAllProducts, discHistory[discSelectedIdx]?.keyword || "search")} style={{ padding: "3px 8px", background: "transparent", color: c.gold, border: "1px solid " + c.gold, borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "9px" }}>CSV</button>
        </div>
      </div>}

      {/* Price stats */}
      {discAllProducts.length > 0 && (() => {
        const prices = discAllProducts.map(p => p.price_aed).filter(p => p > 0).sort((a, b) => a - b);
        const avg = prices.length ? (prices.reduce((s, p) => s + p, 0) / prices.length) : 0;
        const med = prices.length ? prices[Math.floor(prices.length / 2)] : 0;
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "12px" }}>
            {[{ l: "LOWEST", v: fmtAED(prices[0]) }, { l: "MEDIAN", v: fmtAED(med) }, { l: "AVERAGE", v: fmtAED(avg) }, { l: "HIGHEST", v: fmtAED(prices[prices.length - 1]) }].map(s => (
              <div key={s.l} style={{ padding: "8px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px" }}>{s.l}</div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: c.gold }}>{s.v}</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Product table */}
      {discAllProducts.length > 0 && <ProductTable
        products={discAllProducts}
        validatingIdx={discValidatingIdx}
        validationResults={discValidationResults}
        onValidate={(p) => validateProduct(p, setDiscValidatingIdx, setDiscValidationResults)}
        showSubcat={false}
        showSignal={false}
        c={c}
        dark={dark}
      />}

      {discAllProducts.length === 0 && !discSearchingAmazon && <div style={{ textAlign: "center", padding: "60px 20px", color: c.dimmer }}>
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>{"\ud83d\udd0d"}</div>
        <div style={{ fontSize: "13px" }}>Search Amazon.ae to discover products</div>
        <div style={{ fontSize: "11px", marginTop: "4px", color: c.dimmest }}>Try: coconut bowl, rattan basket, teak cutting board</div>
      </div>}
    </div>
  );
}

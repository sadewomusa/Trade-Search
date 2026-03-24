import { useState, useEffect, useCallback, useRef } from "react";

const FREIGHT_RATES = { light: 3, medium: 4, heavy: 6 };
const CUSTOMS_DUTY = 0.05;
const LAST_MILE_AED = 20;
const AED_TO_USD = 0.2723;
const IDR_TO_USD = 0.0000613;
const MIN_MARGIN = 0.40;
const WEIGHT_KG = { light: 0.3, medium: 1.0, heavy: 3.0 };
const WEIGHT_CLASSES = {
  electronics: "medium", kitchen: "medium", beauty: "light", fashion: "light",
  home: "heavy", toys: "medium", sports: "medium", baby: "medium", office: "light", other: "medium",
};
const STATUS_COLORS = {
  Candidate: { bg: "#1a3a2a", text: "#4ade80", border: "#2d5a3d" },
  Investigated: { bg: "#1a2a3a", text: "#60a5fa", border: "#2d4a6d" },
  Rejected: { bg: "#3a1a1a", text: "#f87171", border: "#5a2d2d" },
  Active: { bg: "#3a3a1a", text: "#facc15", border: "#5a5a2d" },
};

function calcMargin(uaePriceAED, indoPriceIDR, weightClass) {
  const uaeUSD = uaePriceAED * AED_TO_USD;
  const indoUSD = indoPriceIDR * IDR_TO_USD;
  const wkg = WEIGHT_KG[weightClass] || 1.0;
  const freight = (FREIGHT_RATES[weightClass] || 4) * wkg;
  const cif = indoUSD + freight;
  const duty = cif * CUSTOMS_DUTY;
  const lastMile = LAST_MILE_AED * AED_TO_USD;
  const totalCost = indoUSD + freight + duty + lastMile;
  const margin = uaeUSD > 0 ? ((uaeUSD - totalCost) / uaeUSD) * 100 : 0;
  return { uaeUSD, indoUSD, freight, duty, lastMile, totalCost, margin };
}

function marginColor(m) { return m >= 40 ? "#4ade80" : m >= 20 ? "#facc15" : "#f87171"; }

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map(line => {
    const vals = []; let current = ""; let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) { vals.push(current.trim()); current = ""; }
      else current += ch;
    }
    vals.push(current.trim());
    const obj = {};
    headers.forEach((h, i) => (obj[h] = vals[i] || ""));
    return obj;
  });
}

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/phone|charger|cable|headphone|earphone|speaker|power bank|usb|bluetooth|smart watch/i.test(n)) return "electronics";
  if (/pan|pot|kitchen|cook|bake|knife|cutting|blender|mixer|spatula|plate/i.test(n)) return "kitchen";
  if (/cream|serum|lotion|shampoo|perfume|makeup|lipstick|mascara|skincare|sunscreen/i.test(n)) return "beauty";
  if (/shirt|dress|shoe|bag|wallet|belt|hat|socks|jacket|hoodie/i.test(n)) return "fashion";
  if (/pillow|curtain|lamp|rug|mat|towel|organizer|storage|shelf|decor/i.test(n)) return "home";
  if (/toy|game|puzzle|doll|lego|figure/i.test(n)) return "toys";
  if (/ball|fitness|gym|yoga|exercise|water bottle/i.test(n)) return "sports";
  if (/baby|diaper|pacifier|stroller|bottle feed/i.test(n)) return "baby";
  if (/pen|notebook|stapler|tape|folder|desk/i.test(n)) return "office";
  return "other";
}

const Badge = ({ text, color = "#4ade80", bg = "#1a3a2a" }) => (
  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "3px", fontSize: "10px", fontFamily: "monospace", background: bg, color, border: `1px solid ${color}33`, letterSpacing: "0.5px" }}>{text}</span>
);

const Spinner = () => (
  <div style={{ width: "14px", height: "14px", border: "2px solid #e8d5b5", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
);

export default function ArbitragePlatform() {
  const [mode, setMode] = useState("auto");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState("");
  const [history, setHistory] = useState([]);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [uaeProduct, setUaeProduct] = useState(null);
  const [indoResults, setIndoResults] = useState(null);
  const [marginData, setMarginData] = useState(null);
  const [autoError, setAutoError] = useState("");
  const [bulkTab, setBulkTab] = useState(0);
  const [uaeProducts, setUaeProducts] = useState([]);
  const [normalized, setNormalized] = useState([]);
  const [bulkIndoResults, setBulkIndoResults] = useState([]);
  const [database, setDatabase] = useState([]);
  const [normalizing, setNormalizing] = useState(false);
  const [normProgress, setNormProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [indoDragOver, setIndoDragOver] = useState(false);
  const fileRef = useRef(null);
  const indoFileRef = useRef(null);

  useEffect(() => {
    try {
      const k = localStorage.getItem("arb-api-key"); if (k) { setApiKey(k); setApiKeyStatus("loaded"); }
      const h = localStorage.getItem("arb-auto-history"); if (h) setHistory(JSON.parse(h));
      const db = localStorage.getItem("arb-database"); if (db) setDatabase(JSON.parse(db));
      const uae = localStorage.getItem("arb-uae-products"); if (uae) setUaeProducts(JSON.parse(uae));
      const norm = localStorage.getItem("arb-normalized"); if (norm) setNormalized(JSON.parse(norm));
    } catch (e) {}
  }, []);
  useEffect(() => { if (history.length > 0) localStorage.setItem("arb-auto-history", JSON.stringify(history)); }, [history]);
  useEffect(() => { if (database.length > 0) localStorage.setItem("arb-database", JSON.stringify(database)); }, [database]);

  const saveApiKey = () => { localStorage.setItem("arb-api-key", apiKey); setApiKeyStatus("saved"); setTimeout(() => setApiKeyStatus(""), 2000); };

  const callClaude = async (prompt, useSearch = false) => {
    const body = { model: "claude-sonnet-4-20250514", max_tokens: 2000, messages: [{ role: "user", content: prompt }] };
    if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("API error: " + r.status);
    const data = await r.json();
    return data.content?.map(b => b.text || "").filter(Boolean).join("\n") || "";
  };

  const parseJSON = (text) => { const c = text.replace(/```json|```/g, "").trim(); const m = c.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : c); };

  const runAutoLookup = async () => {
    if (!apiKey) { setApiKeyStatus("missing"); return; }
    if (!url.trim()) return;
    setLoading(true); setAutoError(""); setUaeProduct(null); setIndoResults(null); setMarginData(null);
    try {
      setStage("Reading product from URL...");
      const ex = await callClaude(`You are a product data extraction engine. Use web search to find this UAE marketplace product and extract details.\n\nURL: ${url.trim()}\n\nReturn ONLY valid JSON (no markdown, no backticks):\n- "product_name": full name\n- "price_aed": price as number\n- "brand": brand or ""\n- "rating": star rating or 0\n- "reviews": count or 0\n- "source": "Amazon.ae" or "Noon"\n\nJSON only:`, true);
      let uae; try { uae = parseJSON(ex); } catch(e) { throw new Error("Could not extract product. Try full URL with https://"); }
      setUaeProduct(uae);

      setStage("Translating to Bahasa Indonesia...");
      const nm = await callClaude(`Product normalization. Output ONLY valid JSON:\n- "clean_name_en": short generic English name\n- "clean_name_id": Bahasa Indonesia\n- "category": [electronics, kitchen, beauty, fashion, home, toys, sports, baby, office, other]\n- "weight_class": [light, medium, heavy]\n- "key_specs": specs string\n- "search_queries": array of 3 Bahasa search queries for Tokopedia/Shopee\n\nProduct: "${uae.product_name}" Price: AED ${uae.price_aed}\nJSON only:`);
      let norm; try { norm = parseJSON(nm); } catch(e) { throw new Error("Could not normalize product."); }

      setStage("Searching Tokopedia & Shopee...");
      const queries = norm.search_queries || [norm.clean_name_id];
      const sr = await callClaude(`Search Tokopedia and Shopee Indonesia for:\nQueries: ${JSON.stringify(queries)}\nProduct: "${norm.clean_name_en}" (${norm.key_specs || ""})\n\nFind real listings with IDR prices. Return ONLY valid JSON:\n{"results": [{"name":"...","price_idr":number,"source":"Tokopedia"/"Shopee","seller":"...","seller_rating":0,"url":"..."}], "price_stats":{"lowest_idr":number,"highest_idr":number,"median_idr":number,"average_idr":number,"num_results":number}}\n\nFind 5-8 real listings. JSON only:`, true);
      let indo; try { indo = parseJSON(sr); } catch(e) { throw new Error("Could not find Indonesian listings."); }
      setIndoResults({ ...indo, normalized: norm });

      setStage("Calculating margins...");
      const wc = norm.weight_class || "medium";
      const stats = indo.price_stats || {};
      const med = stats.median_idr || stats.average_idr || 0;
      const low = stats.lowest_idr || med;
      const high = stats.highest_idr || med;
      const mData = {
        uaeProduct: uae, normalized: norm, indoResults: indo,
        margins: { median: calcMargin(uae.price_aed, med, wc), best: calcMargin(uae.price_aed, low, wc), worst: calcMargin(uae.price_aed, high, wc) },
        medianPriceIDR: med, lowestPriceIDR: low, highestPriceIDR: high, weightClass: wc,
        timestamp: new Date().toISOString(),
        status: calcMargin(uae.price_aed, med, wc).margin >= 40 ? "Candidate" : calcMargin(uae.price_aed, med, wc).margin >= 20 ? "Investigated" : "Rejected",
      };
      setMarginData(mData);
      setHistory(prev => [mData, ...prev].slice(0, 100));
      setStage("");
    } catch (err) { setAutoError(err.message); setStage(""); }
    setLoading(false);
  };

  const handleUAEUpload = useCallback((file) => { const reader = new FileReader(); reader.onload = (e) => { const rows = parseCSV(e.target.result); const products = rows.map((r, i) => ({ id: `uae-${Date.now()}-${i}`, name: r["product_name"] || r["name"] || r["title"] || r["Product Name"] || r["Name"] || r["Title"] || Object.values(r)[0] || "", price: parseFloat(r["price"] || r["Price"] || r["selling_price"] || r["current_price"] || Object.values(r)[1] || "0"), currency: "AED", asin: r["asin"] || r["ASIN"] || "", rating: parseFloat(r["rating"] || r["Rating"] || "0"), reviews: parseInt(r["reviews"] || r["review_count"] || "0"), source: r["source"] || (r["asin"] ? "Amazon.ae" : "Noon"), category: guessCategory(r["product_name"] || r["name"] || r["title"] || r["Product Name"] || r["Name"] || r["Title"] || Object.values(r)[0] || ""), })); setUaeProducts(products); localStorage.setItem("arb-uae-products", JSON.stringify(products)); }; reader.readAsText(file); }, []);
  const handleIndoUpload = useCallback((file) => { const reader = new FileReader(); reader.onload = (e) => { const rows = parseCSV(e.target.result); const results = rows.map((r, i) => ({ id: `indo-${Date.now()}-${i}`, searchQuery: r["search_query"] || r["query"] || r["Search Query"] || "", name: r["product_name"] || r["name"] || r["title"] || r["Product Name"] || r["Name"] || r["Title"] || Object.values(r)[0] || "", price: parseFloat(r["price"] || r["Price"] || r["selling_price"] || "0"), currency: "IDR", seller: r["seller"] || r["shop_name"] || r["Seller"] || "", sellerRating: parseFloat(r["seller_rating"] || r["shop_rating"] || "0"), salesVolume: r["sales_volume"] || r["sold"] || r["total_sold"] || "", source: r["source"] || "Tokopedia", })); setBulkIndoResults(results); }; reader.readAsText(file); }, []);

  const runNormalization = async () => {
    if (uaeProducts.length === 0 || !apiKey) return;
    setNormalizing(true); setNormProgress(0); const results = [];
    for (let i = 0; i < uaeProducts.length; i++) {
      const p = uaeProducts[i];
      try {
        const result = await callClaude(`Product normalization. Output ONLY valid JSON:\n- "clean_name_en": short generic English name\n- "clean_name_id": Bahasa Indonesia\n- "category": [electronics, kitchen, beauty, fashion, home, toys, sports, baby, office, other]\n- "key_specs": specs\n- "search_query_tokopedia": 2-4 word Bahasa search query\n\nProduct: "${p.name}" Price: AED ${p.price}\nJSON only:`);
        const parsed = parseJSON(result);
        results.push({ ...p, cleanNameEn: parsed.clean_name_en || p.name, cleanNameId: parsed.clean_name_id || "", detectedCategory: parsed.category || p.category, keySpecs: parsed.key_specs || "", searchQuery: parsed.search_query_tokopedia || "", normalized: true });
      } catch (err) { results.push({ ...p, cleanNameEn: p.name, cleanNameId: "", detectedCategory: p.category, keySpecs: "", searchQuery: "", normalized: false }); }
      setNormProgress(((i + 1) / uaeProducts.length) * 100);
      await new Promise(r => setTimeout(r, 300));
    }
    setNormalized(results); localStorage.setItem("arb-normalized", JSON.stringify(results)); setNormalizing(false);
  };

  const runMarginCalc = () => {
    const source = normalized.length > 0 ? normalized : uaeProducts;
    if (source.length === 0 || bulkIndoResults.length === 0) return;
    const entries = source.map(uaeP => {
      const query = uaeP.searchQuery || uaeP.cleanNameId || uaeP.name;
      const matches = bulkIndoResults.filter(ir => { const sq = ir.searchQuery?.toLowerCase() || ""; const q = query.toLowerCase(); return sq === q || ir.name?.toLowerCase().includes(q.split(" ")[0]?.toLowerCase()); });
      let indoPrice = 0;
      if (matches.length > 0) { const prices = matches.map(m => m.price).filter(p => p > 0).sort((a, b) => a - b); indoPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0; }
      const cat = uaeP.detectedCategory || uaeP.category || "other";
      const wc = WEIGHT_CLASSES[cat] || "medium";
      const m = calcMargin(uaeP.price, indoPrice, wc);
      return { id: `db-${uaeP.id}`, nameEn: uaeP.cleanNameEn || uaeP.name, nameId: uaeP.cleanNameId || "", category: cat, uaePriceAED: uaeP.price, indoPriceIDR: indoPrice, weightClass: wc, freightUSD: m.freight, dutyUSD: m.duty, lastMileUSD: m.lastMile, totalCostUSD: m.totalCost, grossMarginPct: m.margin, status: m.margin >= MIN_MARGIN * 100 ? "Candidate" : "Rejected", notes: "", source: uaeP.source || "Amazon.ae" };
    });
    setDatabase(entries); setBulkTab(4);
  };

  const updateDbStatus = (id, s) => setDatabase(prev => prev.map(p => p.id === id ? { ...p, status: s } : p));
  const updateDbNotes = (id, n) => setDatabase(prev => prev.map(p => p.id === id ? { ...p, notes: n } : p));
  const updateHistoryStatus = (i, s) => setHistory(prev => prev.map((item, idx) => idx === i ? { ...item, status: s } : item));

  const exportHistory = () => {
    if (history.length === 0) return;
    const h = ["Product","UAE (AED)","Bahasa","Category","Indo Median (IDR)","Margin %","Status","Date"];
    const r = history.map(x => [`"${x.uaeProduct?.product_name || ""}"`, x.uaeProduct?.price_aed || 0, `"${x.normalized?.clean_name_id || ""}"`, x.normalized?.category || "", x.medianPriceIDR || 0, x.margins?.median?.margin?.toFixed(1) || 0, x.status || "", x.timestamp?.slice(0, 10) || ""].join(","));
    const blob = new Blob([[h.join(","), ...r].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `lookups-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const exportDatabase = () => {
    if (database.length === 0) return;
    const h = ["Name","Bahasa","Category","UAE (AED)","Indo (IDR)","Margin %","Status","Notes"];
    const r = database.map(p => [`"${p.nameEn}"`,`"${p.nameId}"`,p.category,p.uaePriceAED.toFixed(2),p.indoPriceIDR.toFixed(0),p.grossMarginPct.toFixed(1),p.status,`"${p.notes}"`].join(","));
    const blob = new Blob([[h.join(","), ...r].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `pipeline-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const inputStyle = { width: "100%", padding: "10px 12px", background: "#1a1a1a", border: "1px solid #333", color: "#d4d4d4", fontFamily: "monospace", fontSize: "13px", borderRadius: "3px", outline: "none" };
  const btnStyle = { padding: "10px 24px", background: "#e8d5b5", color: "#0f0f0f", border: "none", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", borderRadius: "3px" };
  const btnSec = { ...btnStyle, background: "transparent", color: "#e8d5b5", border: "1px solid #e8d5b5" };
  const sectionStyle = { padding: "24px", background: "#0f0f0f", border: "1px solid #333", borderTop: "none", minHeight: "420px", borderRadius: "0 0 4px 4px" };
  const candidates = history.filter(h => (h.margins?.median?.margin || 0) >= 40);
  const dbCandidates = database.filter(p => p.grossMarginPct >= 40);

  const dropZone = (isIndo, onDrop, onClick, label) => (
    <div onDragOver={e => { e.preventDefault(); isIndo ? setIndoDragOver(true) : setDragOver(true); }} onDragLeave={() => isIndo ? setIndoDragOver(false) : setDragOver(false)} onDrop={e => { e.preventDefault(); isIndo ? setIndoDragOver(false) : setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onDrop(f); }} onClick={onClick}
      style={{ border: `2px dashed ${(isIndo ? indoDragOver : dragOver) ? "#e8d5b5" : "#444"}`, borderRadius: "4px", padding: "40px 24px", textAlign: "center", cursor: "pointer", background: (isIndo ? indoDragOver : dragOver) ? "#1a1a1a" : "transparent" }}>
      <div style={{ fontSize: "28px", marginBottom: "8px", opacity: 0.3 }}>↑</div>
      <div style={{ color: "#888", fontSize: "12px", fontFamily: "monospace" }}>{label}</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#d4d4d4", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", padding: "24px" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Instrument+Serif&display=swap" rel="stylesheet" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ marginBottom: "20px", borderBottom: "1px solid #222", paddingBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "30px", fontWeight: 400, color: "#e8d5b5", margin: 0 }}>Cross-Border Arbitrage</h1>
            <div style={{ fontSize: "11px", color: "#555", marginTop: "4px", letterSpacing: "2px", textTransform: "uppercase" }}>UAE ← Indonesia · Product Discovery Engine</div>
          </div>
          <div style={{ display: "flex", gap: "16px", fontSize: "11px", textAlign: "right" }}>
            <div><div style={{ color: "#555" }}>LOOKUPS</div><div style={{ color: "#e8d5b5", fontSize: "18px", fontWeight: 700 }}>{history.length}</div></div>
            <div><div style={{ color: "#555" }}>CANDIDATES</div><div style={{ color: "#4ade80", fontSize: "18px", fontWeight: 700 }}>{candidates.length + dbCandidates.length}</div></div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "16px", padding: "10px 14px", background: "#111", border: `1px solid ${apiKeyStatus === "missing" ? "#f87171" : "#222"}`, borderRadius: "4px" }}>
        <span style={{ fontSize: "10px", color: "#888", whiteSpace: "nowrap", letterSpacing: "1px" }}>API KEY</span>
        <input type={showKey ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-ant-..." style={{ ...inputStyle, flex: 1, padding: "5px 10px", fontSize: "12px" }} />
        <button onClick={() => setShowKey(!showKey)} style={{ ...btnSec, padding: "5px 10px", fontSize: "10px" }}>{showKey ? "HIDE" : "SHOW"}</button>
        <button onClick={saveApiKey} style={{ ...btnStyle, padding: "5px 14px", fontSize: "10px" }}>SAVE</button>
        {apiKeyStatus === "saved" && <span style={{ fontSize: "11px", color: "#4ade80" }}>✓</span>}
        {apiKeyStatus === "loaded" && <span style={{ fontSize: "11px", color: "#60a5fa" }}>✓</span>}
        {apiKeyStatus === "missing" && <span style={{ fontSize: "11px", color: "#f87171" }}>⚠</span>}
      </div>

      <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid #333" }}>
        {[{ id: "auto", label: "⚡ AUTO LOOKUP" }, { id: "history", label: "📋 HISTORY" }, { id: "bulk", label: "📦 BULK PIPELINE" }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: "12px 20px", background: mode === m.id ? "#0f0f0f" : "transparent", color: mode === m.id ? "#e8d5b5" : "#6b6b6b", border: mode === m.id ? "1px solid #333" : "1px solid transparent", borderBottom: mode === m.id ? "1px solid #0f0f0f" : "1px solid #333", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", letterSpacing: "0.5px", position: "relative", top: "1px", borderRadius: "4px 4px 0 0" }}>
            {m.label}
            {m.id === "history" && history.length > 0 && <span style={{ marginLeft: 6, color: "#4ade80", fontSize: 10 }}>[{history.length}]</span>}
            {m.id === "bulk" && database.length > 0 && <span style={{ marginLeft: 6, color: "#4ade80", fontSize: 10 }}>[{database.length}]</span>}
          </button>
        ))}
      </div>

      {mode === "auto" && (
        <div style={sectionStyle}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && runAutoLookup()} placeholder="Paste Amazon.ae or Noon product URL here..." style={{ ...inputStyle, flex: 1, fontSize: "14px", padding: "14px 16px" }} />
            <button onClick={runAutoLookup} disabled={loading || !url.trim()} style={{ ...btnStyle, padding: "14px 32px", fontSize: "13px", opacity: loading || !url.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>{loading ? "ANALYZING..." : "ANALYZE"}</button>
          </div>
          {loading && stage && <div style={{ padding: "14px", background: "#111", border: "1px solid #222", borderRadius: "4px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}><Spinner /> <span style={{ fontSize: "13px", color: "#e8d5b5" }}>{stage}</span></div>}
          {autoError && <div style={{ padding: "14px", background: "#3a1a1a", border: "1px solid #5a2d2d", borderRadius: "4px", marginBottom: "16px", fontSize: "13px", color: "#f87171" }}>⚠ {autoError}</div>}

          {uaeProduct && (<div>
            <div style={{ padding: "16px", background: "#111", border: "1px solid #222", borderRadius: "4px", marginBottom: "12px" }}>
              <div style={{ fontSize: "9px", color: "#666", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>UAE PRODUCT</div>
              <div style={{ fontSize: "14px", fontWeight: 500, marginBottom: "6px" }}>{uaeProduct.product_name}</div>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ color: "#e8d5b5", fontWeight: 700, fontSize: "18px" }}>AED {uaeProduct.price_aed}</span>
                <Badge text={uaeProduct.source || "Amazon.ae"} />
                {uaeProduct.rating > 0 && <span style={{ color: "#facc15", fontSize: "13px" }}>★ {uaeProduct.rating}</span>}
              </div>
            </div>

            {indoResults?.normalized && (
              <div style={{ padding: "16px", background: "#111", border: "1px solid #1a1a3a", borderRadius: "4px", marginBottom: "12px" }}>
                <div style={{ fontSize: "9px", color: "#666", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>TRANSLATION</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "12px" }}>
                  <div><span style={{ color: "#666" }}>EN:</span> {indoResults.normalized.clean_name_en}</div>
                  <div><span style={{ color: "#666" }}>ID:</span> <span style={{ color: "#e8d5b5", fontWeight: 600 }}>{indoResults.normalized.clean_name_id}</span></div>
                  <div><Badge text={indoResults.normalized.category} color="#60a5fa" bg="#1a2a3a" /></div>
                  <div><Badge text={indoResults.normalized.weight_class} color="#888" bg="#1a1a1a" /></div>
                </div>
              </div>
            )}

            {indoResults?.price_stats && (
              <div style={{ padding: "16px", background: "#111", border: "1px solid #1a3050", borderRadius: "4px", marginBottom: "12px" }}>
                <div style={{ fontSize: "9px", color: "#666", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px" }}>INDONESIA — {indoResults.results?.length || 0} LISTINGS</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "12px" }}>
                  {[{ l: "LOWEST", v: indoResults.price_stats.lowest_idr, c: "#4ade80" }, { l: "MEDIAN", v: indoResults.price_stats.median_idr, c: "#e8d5b5" }, { l: "AVERAGE", v: indoResults.price_stats.average_idr, c: "#60a5fa" }, { l: "HIGHEST", v: indoResults.price_stats.highest_idr, c: "#f87171" }].map(s => (
                    <div key={s.l} style={{ padding: "10px", background: "#0a0a0a", border: "1px solid #222", borderRadius: "4px", textAlign: "center" }}>
                      <div style={{ fontSize: "8px", color: "#555", letterSpacing: "1px", marginBottom: "4px" }}>{s.l}</div>
                      <div style={{ fontSize: "14px", fontWeight: 700, color: s.c }}>{s.v ? `IDR ${s.v.toLocaleString()}` : "—"}</div>
                      <div style={{ fontSize: "9px", color: "#444" }}>{s.v ? `$${(s.v * IDR_TO_USD).toFixed(2)}` : ""}</div>
                    </div>
                  ))}
                </div>
                {indoResults.results && <div style={{ maxHeight: "180px", overflowY: "auto" }}>{indoResults.results.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1a1a1a", fontSize: "11px" }}>
                    <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name} <span style={{ color: "#555" }}>· {r.seller}</span></div>
                    <div style={{ color: "#e8d5b5", fontWeight: 700, marginLeft: "12px" }}>IDR {r.price_idr?.toLocaleString()}</div>
                  </div>
                ))}</div>}
              </div>
            )}

            {marginData && (
              <div style={{ padding: "16px", background: "#111", border: `1px solid ${marginColor(marginData.margins.median.margin)}44`, borderRadius: "4px", borderLeft: `4px solid ${marginColor(marginData.margins.median.margin)}` }}>
                <div style={{ fontSize: "9px", color: "#666", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "12px" }}>MARGIN ANALYSIS</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                  {[{ l: "BEST", m: marginData.margins.best }, { l: "MEDIAN", m: marginData.margins.median }, { l: "WORST", m: marginData.margins.worst }].map(c => (
                    <div key={c.l} style={{ padding: "12px", background: "#0a0a0a", border: "1px solid #222", borderRadius: "4px", textAlign: "center" }}>
                      <div style={{ fontSize: "8px", color: "#555", letterSpacing: "1px", marginBottom: "6px" }}>{c.l}</div>
                      <div style={{ fontSize: "26px", fontWeight: 700, color: marginColor(c.m.margin) }}>{c.m.margin.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px", fontSize: "11px", padding: "10px", background: "#0a0a0a", borderRadius: "4px" }}>
                  <div><span style={{ color: "#555" }}>Sell:</span> <span style={{ color: "#e8d5b5" }}>${marginData.margins.median.uaeUSD.toFixed(2)}</span></div>
                  <div><span style={{ color: "#555" }}>Source:</span> ${marginData.margins.median.indoUSD.toFixed(2)}</div>
                  <div><span style={{ color: "#555" }}>Freight:</span> ${marginData.margins.median.freight.toFixed(2)}</div>
                  <div><span style={{ color: "#555" }}>Customs:</span> ${marginData.margins.median.duty.toFixed(2)}</div>
                  <div><span style={{ color: "#555" }}>Last mi:</span> ${marginData.margins.median.lastMile.toFixed(2)}</div>
                  <div><span style={{ color: "#555" }}>Total:</span> <strong style={{ color: "#f87171" }}>${marginData.margins.median.totalCost.toFixed(2)}</strong></div>
                </div>
                <div style={{ marginTop: "12px", padding: "8px", borderRadius: "4px", textAlign: "center", fontSize: "12px", fontWeight: 600, background: marginData.margins.median.margin >= 40 ? "#1a3a2a" : marginData.margins.median.margin >= 20 ? "#1a1a0d" : "#3a1a1a", border: `1px solid ${marginData.margins.median.margin >= 40 ? "#2d5a3d" : marginData.margins.median.margin >= 20 ? "#3a3a1a" : "#5a2d2d"}`, color: marginColor(marginData.margins.median.margin) }}>
                  {marginData.margins.median.margin >= 40 ? "✓ CANDIDATE" : marginData.margins.median.margin >= 20 ? "○ BORDERLINE" : "✗ LOW MARGIN"} — {marginData.margins.median.margin.toFixed(1)}%
                </div>
              </div>
            )}
          </div>)}

          {!loading && !uaeProduct && !autoError && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#444" }}>
              <div style={{ fontSize: "36px", marginBottom: "12px", opacity: 0.2 }}>⚡</div>
              <div style={{ fontSize: "13px" }}>Paste an Amazon.ae or Noon link above</div>
              <div style={{ fontSize: "11px", marginTop: "6px" }}>Auto-extract → Translate → Search Indo → Calculate margin</div>
            </div>
          )}
        </div>
      )}

      {mode === "history" && (
        <div style={sectionStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ fontSize: "10px", color: "#888", letterSpacing: "1.5px" }}>{history.length} LOOKUPS</div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button style={btnSec} onClick={exportHistory}>EXPORT</button>
              <button style={{ ...btnSec, color: "#f87171", borderColor: "#f87171" }} onClick={() => { setHistory([]); localStorage.removeItem("arb-auto-history"); }}>CLEAR</button>
            </div>
          </div>
          {history.length === 0 ? <div style={{ textAlign: "center", padding: "40px", color: "#555" }}>No lookups yet.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "550px", overflowY: "auto" }}>
              {history.map((h, i) => { const m = h.margins?.median?.margin || 0; const sc = STATUS_COLORS[h.status] || STATUS_COLORS.Candidate; return (
                <div key={i} style={{ padding: "12px 14px", background: "#111", border: `1px solid ${sc.border}`, borderRadius: "4px", borderLeft: `3px solid ${sc.text}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "4px" }}>{h.uaeProduct?.product_name}</div>
                      <div style={{ fontSize: "11px", color: "#888", marginBottom: "4px" }}>{h.normalized?.clean_name_id}</div>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <Badge text={`AED ${h.uaeProduct?.price_aed}`} color="#e8d5b5" bg="#1a1a0d" />
                        <Badge text={`IDR ${h.medianPriceIDR?.toLocaleString()}`} color="#60a5fa" bg="#1a2a3a" />
                        <Badge text={h.normalized?.category || ""} color="#c084fc" bg="#1a0d2a" />
                        <span style={{ fontSize: "9px", color: "#444" }}>{h.timestamp?.slice(0, 10)}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", marginLeft: "12px" }}>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: marginColor(m) }}>{m.toFixed(1)}%</div>
                      <select value={h.status} onChange={e => updateHistoryStatus(i, e.target.value)} style={{ padding: "2px 6px", background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, fontFamily: "monospace", fontSize: "10px", borderRadius: "3px", marginTop: "4px" }}>
                        {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ); })}
            </div>
          )}
        </div>
      )}

      {mode === "bulk" && (
        <div style={sectionStyle}>
          <div style={{ display: "flex", gap: "2px", marginBottom: "16px", borderBottom: "1px solid #222" }}>
            {["① UAE", "② Normalize", "③ Indo", "④ Margins", "⑤ Database"].map((label, i) => (
              <button key={i} onClick={() => setBulkTab(i)} style={{ padding: "8px 14px", background: bulkTab === i ? "#1a1a1a" : "transparent", color: bulkTab === i ? "#e8d5b5" : "#555", border: "none", cursor: "pointer", fontFamily: "monospace", fontSize: "10px", borderBottom: bulkTab === i ? "2px solid #e8d5b5" : "2px solid transparent" }}>{label}</button>
            ))}
          </div>

          {bulkTab === 0 && (<div>
            <input type="file" ref={fileRef} accept=".csv" style={{ display: "none" }} onChange={e => e.target.files[0] && handleUAEUpload(e.target.files[0])} />
            {uaeProducts.length === 0 ? dropZone(false, handleUAEUpload, () => fileRef.current?.click(), "Drop Apify UAE CSV here") : (<div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}><span style={{ fontSize: "11px", color: "#4ade80" }}>✓ {uaeProducts.length} products</span><button style={{ ...btnSec, padding: "4px 12px", fontSize: "10px" }} onClick={() => { setUaeProducts([]); localStorage.removeItem("arb-uae-products"); }}>Clear</button></div>
              <div style={{ maxHeight: "300px", overflowY: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}><thead><tr style={{ borderBottom: "1px solid #333" }}>{["Product","AED","Category"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px", color: "#666", fontSize: "9px", letterSpacing: "1px" }}>{h}</th>)}</tr></thead><tbody>{uaeProducts.slice(0, 50).map((p, i) => (<tr key={i} style={{ borderBottom: "1px solid #1a1a1a" }}><td style={{ padding: "6px", maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td><td style={{ padding: "6px", color: "#e8d5b5", fontWeight: 700 }}>{p.price.toFixed(2)}</td><td style={{ padding: "6px" }}><Badge text={p.category} color="#60a5fa" bg="#1a2a3a" /></td></tr>))}</tbody></table></div>
              <button style={{ ...btnStyle, marginTop: "12px" }} onClick={() => setBulkTab(1)}>Next →</button>
            </div>)}
          </div>)}

          {bulkTab === 1 && (<div>
            {uaeProducts.length === 0 ? <div style={{ color: "#555", textAlign: "center", padding: "40px" }}>Upload UAE products first</div> : (<div>
              {!apiKey && <div style={{ padding: "10px", background: "#3a1a1a", border: "1px solid #5a2d2d", borderRadius: "4px", marginBottom: "12px", fontSize: "11px", color: "#f87171" }}>⚠ API key required</div>}
              <button style={{ ...btnStyle, opacity: normalizing || !apiKey ? 0.5 : 1, marginBottom: "12px" }} onClick={runNormalization} disabled={normalizing || !apiKey}>{normalizing ? `${normProgress.toFixed(0)}%` : `Normalize ${uaeProducts.length} Products`}</button>
              {normalizing && <div style={{ width: "100%", height: "3px", background: "#222", borderRadius: "2px", marginBottom: "12px" }}><div style={{ width: `${normProgress}%`, height: "100%", background: "#e8d5b5", borderRadius: "2px", transition: "width 0.3s" }} /></div>}
              {normalized.length > 0 && (<div>
                <div style={{ maxHeight: "280px", overflowY: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}><thead><tr style={{ borderBottom: "1px solid #333" }}>{["Original","Bahasa","Query"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px", color: "#666", fontSize: "9px", letterSpacing: "1px" }}>{h}</th>)}</tr></thead><tbody>{normalized.slice(0, 50).map((p, i) => (<tr key={i} style={{ borderBottom: "1px solid #1a1a1a" }}><td style={{ padding: "6px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#888" }}>{p.name}</td><td style={{ padding: "6px", color: "#e8d5b5" }}>{p.cleanNameId || "—"}</td><td style={{ padding: "6px", color: "#4ade80" }}>{p.searchQuery || "—"}</td></tr>))}</tbody></table></div>
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <button style={btnStyle} onClick={() => setBulkTab(2)}>Next →</button>
                  <button style={btnSec} onClick={() => { const csv = "search_query,clean_name_en,clean_name_id,category\n" + normalized.map(n => `"${n.searchQuery}","${n.cleanNameEn}","${n.cleanNameId}","${n.detectedCategory}"`).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "queries.csv"; a.click(); }}>Export Queries</button>
                </div>
              </div>)}
            </div>)}
          </div>)}

          {bulkTab === 2 && (<div>
            <input type="file" ref={indoFileRef} accept=".csv" style={{ display: "none" }} onChange={e => e.target.files[0] && handleIndoUpload(e.target.files[0])} />
            {bulkIndoResults.length === 0 ? dropZone(true, handleIndoUpload, () => indoFileRef.current?.click(), "Drop Tokopedia/Shopee CSV here") : (<div>
              <span style={{ fontSize: "11px", color: "#4ade80" }}>✓ {bulkIndoResults.length} results</span>
              <div style={{ maxHeight: "280px", overflowY: "auto", marginTop: "12px" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}><thead><tr style={{ borderBottom: "1px solid #333" }}>{["Query","Product","IDR"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px", color: "#666", fontSize: "9px", letterSpacing: "1px" }}>{h}</th>)}</tr></thead><tbody>{bulkIndoResults.slice(0, 50).map((p, i) => (<tr key={i} style={{ borderBottom: "1px solid #1a1a1a" }}><td style={{ padding: "6px", color: "#4ade80" }}>{p.searchQuery || "—"}</td><td style={{ padding: "6px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td><td style={{ padding: "6px", color: "#e8d5b5", fontWeight: 700 }}>{p.price.toLocaleString()}</td></tr>))}</tbody></table></div>
              <button style={{ ...btnStyle, marginTop: "12px" }} onClick={() => setBulkTab(3)}>Next →</button>
            </div>)}
          </div>)}

          {bulkTab === 3 && (<div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px", fontSize: "11px" }}>
              <div style={{ padding: "12px", background: "#111", border: "1px solid #222", borderRadius: "4px" }}>Freight: L $3 · M $4 · H $6 /kg</div>
              <div style={{ padding: "12px", background: "#111", border: "1px solid #222", borderRadius: "4px" }}>Customs 5% · Last mile AED 20</div>
              <div style={{ padding: "12px", background: "#111", border: "1px solid #222", borderRadius: "4px" }}>AED/USD 0.2723 · IDR/USD 0.0000613</div>
            </div>
            <div style={{ display: "flex", gap: "12px", alignItems: "center", padding: "16px", background: "#111", border: "1px solid #222", borderRadius: "4px" }}>
              <div style={{ flex: 1, fontSize: "12px" }}><div>{uaeProducts.length > 0 ? "✓" : "✗"} UAE: {uaeProducts.length}</div><div>{bulkIndoResults.length > 0 ? "✓" : "✗"} Indo: {bulkIndoResults.length}</div></div>
              <button style={{ ...btnStyle, opacity: uaeProducts.length > 0 && bulkIndoResults.length > 0 ? 1 : 0.3 }} onClick={runMarginCalc} disabled={uaeProducts.length === 0 || bulkIndoResults.length === 0}>Calculate</button>
            </div>
          </div>)}

          {bulkTab === 4 && (<div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
              <span style={{ fontSize: "10px", color: "#888", letterSpacing: "1.5px" }}>{database.length} PRODUCTS</span>
              <div style={{ display: "flex", gap: "8px" }}><button style={btnSec} onClick={exportDatabase}>EXPORT</button><button style={{ ...btnSec, color: "#f87171", borderColor: "#f87171" }} onClick={() => { setDatabase([]); localStorage.removeItem("arb-database"); }}>CLEAR</button></div>
            </div>
            {database.length === 0 ? <div style={{ textAlign: "center", padding: "40px", color: "#555" }}>Run calc first</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "450px", overflowY: "auto" }}>
                {database.sort((a, b) => b.grossMarginPct - a.grossMarginPct).map(p => { const sc = STATUS_COLORS[p.status] || STATUS_COLORS.Candidate; return (
                  <div key={p.id} style={{ padding: "10px 12px", background: "#111", border: `1px solid ${sc.border}`, borderRadius: "4px", borderLeft: `3px solid ${sc.text}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nameEn}</div>
                        <div style={{ fontSize: "11px", color: "#888" }}>{p.nameId}</div>
                        <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}><Badge text={p.category} color="#60a5fa" bg="#1a2a3a" /><span style={{ fontSize: "10px", color: "#555" }}>AED {p.uaePriceAED.toFixed(0)} → IDR {p.indoPriceIDR.toLocaleString()}</span></div>
                      </div>
                      <div style={{ textAlign: "right", marginLeft: "12px" }}><div style={{ fontSize: "20px", fontWeight: 700, color: marginColor(p.grossMarginPct) }}>{p.grossMarginPct.toFixed(1)}%</div></div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "8px" }}>
                      <select value={p.status} onChange={e => updateDbStatus(p.id, e.target.value)} style={{ padding: "3px 6px", background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, fontFamily: "monospace", fontSize: "10px", borderRadius: "3px" }}>{Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}</select>
                      <input type="text" placeholder="Notes..." value={p.notes} onChange={e => updateDbNotes(p.id, e.target.value)} style={{ ...inputStyle, padding: "3px 8px", fontSize: "10px", flex: 1 }} />
                    </div>
                  </div>
                ); })}
              </div>
            )}
          </div>)}
        </div>
      )}
    </div>
  );
}
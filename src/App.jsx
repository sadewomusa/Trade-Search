
import { useState, useEffect, useCallback, useRef } from "react";

const FREIGHT_RATES = { light: 3, medium: 4, heavy: 6 };
const CUSTOMS_DUTY = 0.05;
const LAST_MILE_AED = 20;
const AED_TO_USD = 0.2723;
const IDR_TO_USD = 0.0000613;
const MIN_MARGIN = 0.40;

const WEIGHT_CLASSES = {
  electronics: "medium", kitchen: "medium", beauty: "light", fashion: "light",
  home: "heavy", toys: "medium", sports: "medium", baby: "medium", office: "light", other: "medium",
};
const WEIGHT_KG = { light: 0.3, medium: 1.0, heavy: 3.0 };

const STATUS_COLORS = {
  Candidate: { bg: "#1a3a2a", text: "#4ade80", border: "#2d5a3d" },
  Investigated: { bg: "#1a2a3a", text: "#60a5fa", border: "#2d4a6d" },
  Rejected: { bg: "#3a1a1a", text: "#f87171", border: "#5a2d2d" },
  Active: { bg: "#3a3a1a", text: "#facc15", border: "#5a5a2d" },
};

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
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

function calcMargin(uaePriceAED, indoPriceIDR, category) {
  const uaeUSD = uaePriceAED * AED_TO_USD;
  const indoUSD = indoPriceIDR * IDR_TO_USD;
  const wc = WEIGHT_CLASSES[category] || "medium";
  const wkg = WEIGHT_KG[wc];
  const freight = FREIGHT_RATES[wc] * wkg;
  const cif = indoUSD + freight;
  const duty = cif * CUSTOMS_DUTY;
  const lastMile = LAST_MILE_AED * AED_TO_USD;
  const totalCost = indoUSD + freight + duty + lastMile;
  const margin = uaeUSD > 0 ? ((uaeUSD - totalCost) / uaeUSD) * 100 : 0;
  return { uaeUSD, indoUSD, freight, duty, lastMile, totalCost, margin, wc, wkg };
}

const Tab = ({ label, active, onClick, count }) => (
  <button onClick={onClick} style={{
    padding: "10px 20px", background: active ? "#0f0f0f" : "transparent",
    color: active ? "#e8d5b5" : "#6b6b6b",
    border: active ? "1px solid #333" : "1px solid transparent",
    borderBottom: active ? "1px solid #0f0f0f" : "1px solid #333",
    cursor: "pointer", fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    fontSize: "12px", letterSpacing: "0.5px", textTransform: "uppercase",
    position: "relative", top: "1px", borderRadius: "4px 4px 0 0",
  }}>
    {label}
    {count !== undefined && <span style={{ marginLeft: 8, color: "#4ade80", fontSize: 10 }}>[{count}]</span>}
  </button>
);

const Badge = ({ text, color = "#4ade80", bg = "#1a3a2a" }) => (
  <span style={{
    display: "inline-block", padding: "2px 8px", borderRadius: "3px", fontSize: "10px",
    fontFamily: "monospace", background: bg, color, border: `1px solid ${color}33`, letterSpacing: "0.5px",
  }}>{text}</span>
);

export default function ArbitragePipeline() {
  const [tab, setTab] = useState(0);
  const [uaeProducts, setUaeProducts] = useState([]);
  const [normalized, setNormalized] = useState([]);
  const [indoResults, setIndoResults] = useState([]);
  const [database, setDatabase] = useState([]);
  const [normalizing, setNormalizing] = useState(false);
  const [normProgress, setNormProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [indoDragOver, setIndoDragOver] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState("");
  const fileRef = useRef(null);
  const indoFileRef = useRef(null);

  useEffect(() => {
    try {
      const savedKey = localStorage.getItem("arb-api-key");
      if (savedKey) { setApiKey(savedKey); setApiKeyStatus("loaded"); }
      const db = localStorage.getItem("arb-database");
      if (db) setDatabase(JSON.parse(db));
      const uae = localStorage.getItem("arb-uae-products");
      if (uae) setUaeProducts(JSON.parse(uae));
      const norm = localStorage.getItem("arb-normalized");
      if (norm) setNormalized(JSON.parse(norm));
    } catch (e) { console.error("Error loading saved data:", e); }
  }, []);

  useEffect(() => {
    if (database.length > 0) localStorage.setItem("arb-database", JSON.stringify(database));
  }, [database]);

  const saveApiKey = () => {
    localStorage.setItem("arb-api-key", apiKey);
    setApiKeyStatus("saved");
    setTimeout(() => setApiKeyStatus(""), 2000);
  };

  const handleUAEUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target.result);
      const products = rows.map((r, i) => ({
        id: `uae-${Date.now()}-${i}`,
        name: r["product_name"] || r["name"] || r["title"] || r["Product Name"] || r["Name"] || r["Title"] || Object.values(r)[0] || "",
        price: parseFloat(r["price"] || r["Price"] || r["selling_price"] || r["current_price"] || Object.values(r)[1] || "0"),
        currency: "AED", asin: r["asin"] || r["ASIN"] || r["product_id"] || r["Product ID"] || "",
        rating: parseFloat(r["rating"] || r["Rating"] || "0"),
        reviews: parseInt(r["reviews"] || r["review_count"] || r["Reviews"] || "0"),
        source: r["source"] || (r["asin"] ? "Amazon.ae" : "Noon"),
        category: guessCategory(r["product_name"] || r["name"] || r["title"] || r["Product Name"] || r["Name"] || r["Title"] || Object.values(r)[0] || ""),
      }));
      setUaeProducts(products);
      localStorage.setItem("arb-uae-products", JSON.stringify(products));
    };
    reader.readAsText(file);
  }, []);

  const handleIndoUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target.result);
      const results = rows.map((r, i) => ({
        id: `indo-${Date.now()}-${i}`,
        searchQuery: r["search_query"] || r["query"] || r["Search Query"] || "",
        name: r["product_name"] || r["name"] || r["title"] || r["Product Name"] || r["Name"] || r["Title"] || Object.values(r)[0] || "",
        price: parseFloat(r["price"] || r["Price"] || r["selling_price"] || "0"),
        currency: "IDR", seller: r["seller"] || r["shop_name"] || r["Seller"] || "",
        sellerRating: parseFloat(r["seller_rating"] || r["shop_rating"] || "0"),
        salesVolume: r["sales_volume"] || r["sold"] || r["total_sold"] || "",
        source: r["source"] || "Tokopedia", url: r["url"] || r["product_url"] || "",
      }));
      setIndoResults(results);
    };
    reader.readAsText(file);
  }, []);

  const runNormalization = async () => {
    if (uaeProducts.length === 0) return;
    if (!apiKey) { setApiKeyStatus("missing"); return; }
    setNormalizing(true); setNormProgress(0);
    const results = [];
    for (let i = 0; i < uaeProducts.length; i++) {
      const p = uaeProducts[i];
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1000,
            messages: [{ role: "user", content: `You are a product normalization engine for cross-border trade. Given a UAE marketplace product name, output ONLY valid JSON (no markdown, no backticks) with these fields:
- "clean_name_en": a short generic English product description (remove brand names, marketing language)
- "clean_name_id": the same description translated to Bahasa Indonesia (for Tokopedia/Shopee search)
- "category": one of [electronics, kitchen, beauty, fashion, home, toys, sports, baby, office, other]
- "key_specs": extracted specs like size, material, weight as a short string
- "search_query_tokopedia": the optimal Bahasa Indonesia search query for Tokopedia (2-4 words)

Product: "${p.name}"
Price: AED ${p.price}

Output JSON only:` }],
          }),
        });
        if (!response.ok) throw new Error(`API ${response.status}`);
        const data = await response.json();
        const text = data.content?.map(b => b.text || "").join("") || "";
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        results.push({ ...p, cleanNameEn: parsed.clean_name_en || p.name, cleanNameId: parsed.clean_name_id || "", detectedCategory: parsed.category || p.category, keySpecs: parsed.key_specs || "", searchQuery: parsed.search_query_tokopedia || "", normalized: true });
      } catch (err) {
        results.push({ ...p, cleanNameEn: p.name, cleanNameId: "", detectedCategory: p.category, keySpecs: "", searchQuery: "", normalized: false, error: err.message });
      }
      setNormProgress(((i + 1) / uaeProducts.length) * 100);
      await new Promise(r => setTimeout(r, 300));
    }
    setNormalized(results);
    localStorage.setItem("arb-normalized", JSON.stringify(results));
    setNormalizing(false);
  };

  const runMarginCalc = () => {
    const source = normalized.length > 0 ? normalized : uaeProducts;
    if (source.length === 0 || indoResults.length === 0) return;
    const entries = source.map((uaeP) => {
      const query = uaeP.searchQuery || uaeP.cleanNameId || uaeP.name;
      const matchingIndo = indoResults.filter((ir) => {
        const sq = ir.searchQuery?.toLowerCase() || "";
        const q = query.toLowerCase();
        return sq === q || ir.name?.toLowerCase().includes(q.split(" ")[0]?.toLowerCase());
      });
      let indoPrice = 0, indoSeller = "", indoName = "";
      if (matchingIndo.length > 0) {
        const prices = matchingIndo.map((m) => m.price).filter((p) => p > 0).sort((a, b) => a - b);
        indoPrice = prices.length > 0 ? prices[Math.floor(prices.length / 2)] : 0;
        const best = matchingIndo.reduce((a, b) => (parseFloat(b.sellerRating) > parseFloat(a.sellerRating) ? b : a), matchingIndo[0]);
        indoSeller = best.seller; indoName = best.name;
      }
      const cat = uaeP.detectedCategory || uaeP.category || "other";
      const m = calcMargin(uaeP.price, indoPrice, cat);
      return {
        id: `db-${uaeP.id}`, nameEn: uaeP.cleanNameEn || uaeP.name, nameId: uaeP.cleanNameId || "",
        category: cat, uaePriceAED: uaeP.price, uaePriceUSD: m.uaeUSD, indoPriceIDR: indoPrice,
        indoPriceUSD: m.indoUSD, indoProductName: indoName, indoSeller, weightClass: m.wc,
        weightKg: m.wkg, freightUSD: m.freight, dutyUSD: m.duty, lastMileUSD: m.lastMile,
        totalCostUSD: m.totalCost, grossMarginPct: m.margin,
        status: m.margin >= MIN_MARGIN * 100 ? "Candidate" : "Rejected",
        notes: "", source: uaeP.source || "Amazon.ae", asin: uaeP.asin || "",
      };
    });
    setDatabase(entries); setTab(4);
  };

  const updateStatus = (id, s) => setDatabase((prev) => prev.map((p) => (p.id === id ? { ...p, status: s } : p)));
  const updateNotes = (id, n) => setDatabase((prev) => prev.map((p) => (p.id === id ? { ...p, notes: n } : p)));

  const exportCSV = () => {
    if (database.length === 0) return;
    const headers = ["Name (EN)","Name (ID)","Category","UAE Price (AED)","Indo Price (IDR)","Weight Class","Freight ($)","Duty ($)","Last Mile ($)","Total Cost ($)","Gross Margin %","Status","Notes"];
    const rows = database.map((p) => [`"${p.nameEn}"`,`"${p.nameId}"`,p.category,p.uaePriceAED.toFixed(2),p.indoPriceIDR.toFixed(0),p.weightClass,p.freightUSD.toFixed(2),p.dutyUSD.toFixed(2),p.lastMileUSD.toFixed(2),p.totalCostUSD.toFixed(2),p.grossMarginPct.toFixed(1),p.status,`"${p.notes}"`].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `arbitrage-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const candidates = database.filter((p) => p.grossMarginPct >= MIN_MARGIN * 100);
  const avgMargin = database.length > 0 ? database.reduce((s, p) => s + p.grossMarginPct, 0) / database.length : 0;
  const sectionStyle = { padding: "24px", background: "#0f0f0f", border: "1px solid #333", borderTop: "none", minHeight: "420px", borderRadius: "0 0 4px 4px" };
  const inputStyle = { width: "100%", padding: "10px 12px", background: "#1a1a1a", border: "1px solid #333", color: "#d4d4d4", fontFamily: "monospace", fontSize: "13px", borderRadius: "3px", outline: "none" };
  const btnStyle = { padding: "10px 24px", background: "#e8d5b5", color: "#0f0f0f", border: "none", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", borderRadius: "3px" };
  const btnSecondary = { ...btnStyle, background: "transparent", color: "#e8d5b5", border: "1px solid #e8d5b5" };

  const dropZone = (isIndo, onDrop, onClick, label, sublabel) => (
    <div onDragOver={(e) => { e.preventDefault(); isIndo ? setIndoDragOver(true) : setDragOver(true); }}
      onDragLeave={() => isIndo ? setIndoDragOver(false) : setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); isIndo ? setIndoDragOver(false) : setDragOver(false); const file = e.dataTransfer.files[0]; if (file) onDrop(file); }}
      onClick={onClick}
      style={{ border: `2px dashed ${(isIndo ? indoDragOver : dragOver) ? "#e8d5b5" : "#444"}`, borderRadius: "4px", padding: "48px 24px", textAlign: "center", cursor: "pointer", background: (isIndo ? indoDragOver : dragOver) ? "#1a1a1a" : "transparent", transition: "all 0.2s" }}>
      <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.4 }}>↑</div>
      <div style={{ color: "#999", fontSize: "13px", fontFamily: "monospace" }}>{label}</div>
      <div style={{ color: "#555", fontSize: "11px", fontFamily: "monospace", marginTop: "8px" }}>{sublabel}</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#d4d4d4", fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace", padding: "24px" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Instrument+Serif&display=swap" rel="stylesheet" />
      <div style={{ marginBottom: "24px", borderBottom: "1px solid #222", paddingBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: "32px", fontWeight: 400, color: "#e8d5b5", margin: 0 }}>Cross-Border Arbitrage Pipeline</h1>
            <div style={{ fontSize: "11px", color: "#555", marginTop: "6px", letterSpacing: "2px", textTransform: "uppercase" }}>UAE ← Indonesia · Product Discovery Engine</div>
          </div>
          <div style={{ display: "flex", gap: "16px", fontSize: "11px", textAlign: "right" }}>
            <div><div style={{ color: "#555" }}>PRODUCTS</div><div style={{ color: "#e8d5b5", fontSize: "18px", fontWeight: 700 }}>{database.length}</div></div>
            <div><div style={{ color: "#555" }}>CANDIDATES</div><div style={{ color: "#4ade80", fontSize: "18px", fontWeight: 700 }}>{candidates.length}</div></div>
            <div><div style={{ color: "#555" }}>AVG MARGIN</div><div style={{ color: avgMargin >= 40 ? "#4ade80" : avgMargin >= 20 ? "#facc15" : "#f87171", fontSize: "18px", fontWeight: 700 }}>{avgMargin.toFixed(1)}%</div></div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "20px", padding: "12px 16px", background: "#111", border: `1px solid ${apiKeyStatus === "missing" ? "#f87171" : "#222"}`, borderRadius: "4px" }}>
        <span style={{ fontSize: "11px", color: "#888", whiteSpace: "nowrap", letterSpacing: "1px" }}>API KEY</span>
        <input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-..." style={{ ...inputStyle, flex: 1, padding: "6px 10px", fontSize: "12px" }} />
        <button onClick={() => setShowKey(!showKey)} style={{ ...btnSecondary, padding: "6px 12px", fontSize: "10px" }}>{showKey ? "HIDE" : "SHOW"}</button>
        <button onClick={saveApiKey} style={{ ...btnStyle, padding: "6px 16px", fontSize: "10px" }}>SAVE</button>
        {apiKeyStatus === "saved" && <span style={{ fontSize: "11px", color: "#4ade80" }}>✓ Saved</span>}
        {apiKeyStatus === "loaded" && <span style={{ fontSize: "11px", color: "#60a5fa" }}>✓ Loaded</span>}
        {apiKeyStatus === "missing" && <span style={{ fontSize: "11px", color: "#f87171" }}>⚠ Required</span>}
      </div>
      <div style={{ display: "flex", gap: "4px", marginBottom: "24px", alignItems: "center" }}>
        {["Scrape UAE", "Normalize", "Search Indo", "Margins", "Database"].map((s, i) => {
          const filled = (i === 0 && uaeProducts.length > 0) || (i === 1 && normalized.length > 0) || (i === 2 && indoResults.length > 0) || (i >= 3 && database.length > 0);
          return (<div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ flex: 1, height: "3px", background: filled ? "#e8d5b5" : "#222", borderRadius: "2px", position: "relative" }}>
              <div style={{ position: "absolute", top: "-10px", left: "50%", transform: "translateX(-50%)", fontSize: "9px", color: filled ? "#e8d5b5" : "#444", whiteSpace: "nowrap", letterSpacing: "1px", textTransform: "uppercase" }}>{s}</div>
            </div>
            {i < 4 && <span style={{ color: "#333", margin: "0 2px", fontSize: "10px" }}>→</span>}
          </div>);
        })}
      </div>
      <div style={{ borderBottom: "1px solid #333", display: "flex", gap: "2px", marginTop: "8px" }}>
        <Tab label="① Scrape UAE" active={tab === 0} onClick={() => setTab(0)} count={uaeProducts.length || undefined} />
        <Tab label="② Normalize" active={tab === 1} onClick={() => setTab(1)} count={normalized.length || undefined} />
        <Tab label="③ Search Indo" active={tab === 2} onClick={() => setTab(2)} count={indoResults.length || undefined} />
        <Tab label="④ Margins" active={tab === 3} onClick={() => setTab(3)} />
        <Tab label="⑤ Database" active={tab === 4} onClick={() => setTab(4)} count={database.length || undefined} />
      </div>
      {tab === 0 && (<div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div><h2 style={{ fontSize: "14px", color: "#e8d5b5", margin: 0, letterSpacing: "1px" }}>STAGE 1 — UAE PRODUCT IMPORT</h2><p style={{ fontSize: "11px", color: "#666", margin: "6px 0 0" }}>Upload CSV from Apify</p></div>
          {uaeProducts.length > 0 && <button style={btnSecondary} onClick={() => { setUaeProducts([]); localStorage.removeItem("arb-uae-products"); }}>Clear</button>}
        </div>
        <input type="file" ref={fileRef} accept=".csv" style={{ display: "none" }} onChange={(e) => e.target.files[0] && handleUAEUpload(e.target.files[0])} />
        {uaeProducts.length === 0 ? (<div>{dropZone(false, handleUAEUpload, () => fileRef.current?.click(), "Drop your Apify CSV here or click to upload", "Expected: product_name, price, asin, rating, reviews")}</div>
        ) : (<div>
          <div style={{ fontSize: "11px", color: "#4ade80", marginBottom: "16px" }}>✓ {uaeProducts.length} products loaded</div>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead><tr style={{ borderBottom: "1px solid #333" }}>{["Product","Price (AED)","Source","Category","Rating"].map((h) => (<th key={h} style={{ textAlign: "left", padding: "8px", color: "#888", fontWeight: 500, fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>{h}</th>))}</tr></thead>
            <tbody>{uaeProducts.slice(0, 50).map((p, i) => (<tr key={i} style={{ borderBottom: "1px solid #1a1a1a" }}>
              <td style={{ padding: "8px", maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td>
              <td style={{ padding: "8px", color: "#e8d5b5", fontWeight: 700 }}>{p.price.toFixed(2)}</td>
              <td style={{ padding: "8px" }}><Badge text={p.source} /></td>
              <td style={{ padding: "8px" }}><Badge text={p.category} color="#60a5fa" bg="#1a2a3a" /></td>
              <td style={{ padding: "8px", color: "#facc15" }}>{p.rating > 0 ? `★ ${p.rating}` : "—"}</td>
            </tr>))}</tbody></table></div>
          <div style={{ marginTop: "20px" }}><button style={btnStyle} onClick={() => setTab(1)}>Proceed to Normalize →</button></div>
        </div>)}
      </div>)}
      {tab === 1 && (<div style={sectionStyle}>
        <h2 style={{ fontSize: "14px", color: "#e8d5b5", margin: "0 0 20px", letterSpacing: "1px" }}>STAGE 2 — AI NORMALIZATION</h2>
        {uaeProducts.length === 0 ? <div style={{ padding: "40px", textAlign: "center", color: "#555" }}>Complete Stage 1 first.</div> : (<div>
          {!apiKey && <div style={{ padding: "12px", background: "#3a1a1a", border: "1px solid #5a2d2d", borderRadius: "4px", marginBottom: "16px", fontSize: "12px", color: "#f87171" }}>⚠ Enter API key above</div>}
          <button style={{ ...btnStyle, opacity: normalizing || !apiKey ? 0.5 : 1, marginBottom: "16px" }} onClick={runNormalization} disabled={normalizing || !apiKey}>{normalizing ? `${normProgress.toFixed(0)}%` : `Normalize ${uaeProducts.length} Products`}</button>
          {normalizing && <div style={{ width: "100%", height: "4px", background: "#222", borderRadius: "2px", marginBottom: "16px" }}><div style={{ width: `${normProgress}%`, height: "100%", background: "#e8d5b5", borderRadius: "2px", transition: "width 0.3s" }} /></div>}
          {normalized.length > 0 && (<div><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead><tr style={{ borderBottom: "1px solid #333" }}>{["Original","Clean (EN)","Bahasa (ID)","Category","Search Query"].map((h) => (<th key={h} style={{ textAlign: "left", padding: "8px", color: "#888", fontWeight: 500, fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>{h}</th>))}</tr></thead>
            <tbody>{normalized.slice(0, 50).map((p, i) => (<tr key={i} style={{ borderBottom: "1px solid #1a1a1a" }}>
              <td style={{ padding: "8px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#888" }}>{p.name}</td>
              <td style={{ padding: "8px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.cleanNameEn}</td>
              <td style={{ padding: "8px", color: "#e8d5b5" }}>{p.cleanNameId || "—"}</td>
              <td style={{ padding: "8px" }}><Badge text={p.detectedCategory} color="#60a5fa" bg="#1a2a3a" /></td>
              <td style={{ padding: "8px", color: "#4ade80" }}>{p.searchQuery || "—"}</td>
            </tr>))}</tbody></table></div>
            <div style={{ marginTop: "16px", display: "flex", gap: "12px" }}>
              <button style={btnStyle} onClick={() => setTab(2)}>Proceed →</button>
              <button style={btnSecondary} onClick={() => { const csv = "search_query,clean_name_en,clean_name_id,category\n" + normalized.map(n => `"${n.searchQuery}","${n.cleanNameEn}","${n.cleanNameId}","${n.detectedCategory}"`).join("\n"); const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "tokopedia-queries.csv"; a.click(); URL.revokeObjectURL(url); }}>Export Queries</button>
            </div></div>)}
        </div>)}
      </div>)}
      {tab === 2 && (<div style={sectionStyle}>
        <h2 style={{ fontSize: "14px", color: "#e8d5b5", margin: "0 0 20px", letterSpacing: "1px" }}>STAGE 3 — INDONESIA RESULTS</h2>
        <input type="file" ref={indoFileRef} accept=".csv" style={{ display: "none" }} onChange={(e) => e.target.files[0] && handleIndoUpload(e.target.files[0])} />
        {indoResults.length === 0 ? dropZone(true, handleIndoUpload, () => indoFileRef.current?.click(), "Drop Tokopedia/Shopee CSV here", "Expected: search_query, product_name, price (IDR), seller")
        : (<div>
          <div style={{ fontSize: "11px", color: "#4ade80", marginBottom: "16px" }}>✓ {indoResults.length} results</div>
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead><tr style={{ borderBottom: "1px solid #333" }}>{["Query","Product","Price (IDR)","Seller"].map((h) => (<th key={h} style={{ textAlign: "left", padding: "8px", color: "#888", fontWeight: 500, fontSize: "10px", letterSpacing: "1px", textTransform: "uppercase" }}>{h}</th>))}</tr></thead>
            <tbody>{indoResults.slice(0, 50).map((p, i) => (<tr key={i} style={{ borderBottom: "1px solid #1a1a1a" }}>
              <td style={{ padding: "8px", color: "#4ade80" }}>{p.searchQuery || "—"}</td>
              <td style={{ padding: "8px", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</td>
              <td style={{ padding: "8px", color: "#e8d5b5", fontWeight: 700 }}>{p.price.toLocaleString()}</td>
              <td style={{ padding: "8px", color: "#888" }}>{p.seller || "—"}</td>
            </tr>))}</tbody></table></div>
          <button style={{ ...btnStyle, marginTop: "16px" }} onClick={() => setTab(3)}>Proceed →</button>
        </div>)}
      </div>)}
      {tab === 3 && (<div style={sectionStyle}>
        <h2 style={{ fontSize: "14px", color: "#e8d5b5", margin: "0 0 20px", letterSpacing: "1px" }}>STAGE 4 — MARGIN ENGINE</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "24px" }}>
          <div style={{ padding: "16px", background: "#111", border: "1px solid #222", borderRadius: "4px" }}><div style={{ fontSize: "10px", color: "#888", letterSpacing: "1px", marginBottom: "8px" }}>FREIGHT ($/KG)</div><div style={{ fontSize: "12px", lineHeight: 2 }}>Light: $3 · Med: $4 · Heavy: $6</div></div>
          <div style={{ padding: "16px", background: "#111", border: "1px solid #222", borderRadius: "4px" }}><div style={{ fontSize: "10px", color: "#888", letterSpacing: "1px", marginBottom: "8px" }}>COSTS</div><div style={{ fontSize: "12px", lineHeight: 2 }}>Customs: 5% · Last mile: AED 20</div></div>
          <div style={{ padding: "16px", background: "#111", border: "1px solid #222", borderRadius: "4px" }}><div style={{ fontSize: "10px", color: "#888", letterSpacing: "1px", marginBottom: "8px" }}>FX</div><div style={{ fontSize: "12px", lineHeight: 2 }}>AED/USD: 0.2723 · IDR/USD: 0.0000613</div></div>
        </div>
        <div style={{ display: "flex", gap: "16px", alignItems: "center", padding: "20px", background: "#111", border: "1px solid #222", borderRadius: "4px" }}>
          <div style={{ flex: 1, fontSize: "12px" }}>
            <div>{uaeProducts.length > 0 ? "✓" : "✗"} UAE: {uaeProducts.length}</div>
            <div>{indoResults.length > 0 ? "✓" : "✗"} Indo: {indoResults.length}</div>
          </div>
          <button style={{ ...btnStyle, opacity: uaeProducts.length > 0 && indoResults.length > 0 ? 1 : 0.3 }} onClick={runMarginCalc} disabled={uaeProducts.length === 0 || indoResults.length === 0}>Calculate</button>
        </div>
      </div>)}
      {tab === 4 && (<div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "14px", color: "#e8d5b5", margin: 0, letterSpacing: "1px" }}>STAGE 5 — DATABASE</h2>
          <div style={{ display: "flex", gap: "8px" }}>
            <button style={btnSecondary} onClick={exportCSV}>Export CSV</button>
            <button style={{ ...btnSecondary, color: "#f87171", borderColor: "#f87171" }} onClick={() => { setDatabase([]); localStorage.removeItem("arb-database"); }}>Clear</button>
          </div>
        </div>
        {database.length === 0 ? <div style={{ padding: "40px", textAlign: "center", color: "#555" }}>Run Stage 4 first.</div> : (<div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
            {Object.entries(STATUS_COLORS).map(([status, colors]) => (<div key={status} style={{ padding: "12px", background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: "4px", textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: 700, color: colors.text }}>{database.filter((p) => p.status === status).length}</div>
              <div style={{ fontSize: "10px", color: colors.text, opacity: 0.7, letterSpacing: "1px", textTransform: "uppercase" }}>{status}</div>
            </div>))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "500px", overflowY: "auto" }}>
            {database.sort((a, b) => b.grossMarginPct - a.grossMarginPct).map((p) => {
              const sc = STATUS_COLORS[p.status]; const mc = p.grossMarginPct >= 40 ? "#4ade80" : p.grossMarginPct >= 20 ? "#facc15" : "#f87171";
              return (<div key={p.id} style={{ padding: "14px 16px", background: "#111", border: `1px solid ${sc.border}`, borderRadius: "4px", borderLeft: `3px solid ${sc.text}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nameEn}</div>
                    {p.nameId && <div style={{ fontSize: "11px", color: "#888", marginBottom: "6px" }}>{p.nameId}</div>}
                    <div style={{ display: "flex", gap: "8px" }}><Badge text={p.category} color="#60a5fa" bg="#1a2a3a" /><Badge text={`${p.weightClass}`} color="#888" bg="#1a1a1a" /></div>
                  </div>
                  <div style={{ textAlign: "right", marginLeft: "16px" }}><div style={{ fontSize: "22px", fontWeight: 700, color: mc }}>{p.grossMarginPct.toFixed(1)}%</div></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "8px", marginTop: "10px", fontSize: "11px" }}>
                  <div>UAE: AED {p.uaePriceAED.toFixed(0)}</div>
                  <div>Indo: IDR {p.indoPriceIDR.toLocaleString()}</div>
                  <div>Freight: ${p.freightUSD.toFixed(2)}</div>
                  <div>Duty: ${p.dutyUSD.toFixed(2)}</div>
                  <div><strong>Cost: ${p.totalCostUSD.toFixed(2)}</strong></div>
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "10px" }}>
                  <select value={p.status} onChange={(e) => updateStatus(p.id, e.target.value)} style={{ padding: "4px 8px", background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, fontFamily: "monospace", fontSize: "11px", borderRadius: "3px" }}>
                    {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input type="text" placeholder="Notes..." value={p.notes} onChange={(e) => updateNotes(p.id, e.target.value)} style={{ ...inputStyle, padding: "4px 8px", fontSize: "11px", flex: 1 }} />
                </div>
              </div>);
            })}
          </div>
        </div>)}
      </div>)}
    </div>
  );
}

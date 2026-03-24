import { useState, useEffect, useCallback, useRef } from "react";

// ══════════ CONSTANTS ══════════
const DEFAULT_FX = {
  AEDUSD: 0.2723,
  IDRUSD: 0.0000613,
  AED_TO_IDR: 0.2723 / 0.0000613,  // 1 AED = ~4,441 IDR
  IDR_TO_AED: 0.0000613 / 0.2723,  // 1 IDR = ~0.000225 AED
};
const DEFAULT_FREIGHT = {
  air: { rate_per_kg: 4, min_kg: 100, transit: { port_port: "3-5 days", port_door: "5-7 days", door_door: "7-10 days" } },
  ocean: { rate_20ft: 800, rate_40ft: 1400, rate_per_cbm: 45, transit: { port_port: "14-18 days", port_door: "18-25 days", door_door: "21-30 days" } },
  source: "default", updated: null,
};
const CUSTOMS_DUTY = 0.05;
const LAST_MILE_AED = 20;
const MARGIN_THRESHOLD = { candidate: 40, borderline: 20 };
const WEIGHT_KG = { light: 0.3, medium: 1.0, heavy: 3.0 };
const STATUS_COLORS = {
  Candidate: { bg: "#0D2E1A", text: "#2EAA5A", border: "#1A5C32" },
  Investigated: { bg: "#0D1F15", text: "#5BAD6E", border: "#1A4A2D" },
  Rejected: { bg: "#3a1a1a", text: "#f87171", border: "#5a2d2d" },
  Active: { bg: "#2A2210", text: "#D4A843", border: "#4A3D18" },
};
const MAX_HISTORY = 100;
const FX_CACHE_MS = 86400000; // 24h

function marginColor(m) {
  return m >= MARGIN_THRESHOLD.candidate ? "#2EAA5A" : m >= MARGIN_THRESHOLD.borderline ? "#D4A843" : "#f87171";
}
function fmtIDR(n) { return n ? "IDR " + Math.round(n).toLocaleString() : "—"; }
function fmtAED(n) { return n ? "AED " + n.toFixed(2) : "—"; }
function fmtUSD(n) { return n ? "$" + n.toFixed(2) : "—"; }

// ══════════ IDR PRICE SANITIZER ══════════
// Catches dot-separator corruption: 25.000 → 25 instead of 25000
function sanitizeIDR(price) {
  if (typeof price === "string") {
    // "Rp 25.000" or "Rp25.000" or "25.000"
    const cleaned = price.replace(/^[Rr]p\.?\s*/,"").replace(/\./g, "").replace(/,/g, "").trim();
    price = parseInt(cleaned, 10) || 0;
  }
  if (typeof price !== "number" || isNaN(price)) return 0;
  // If price looks like a decimal that was a dot-separated IDR (e.g. 25.0 should be 25000)
  // Heuristic: any IDR price under 500 is almost certainly corrupted
  // Real IDR prices for products are typically 5,000 - 50,000,000
  if (price > 0 && price < 500) {
    // Likely "25.000" parsed as 25.0 — multiply by 1000
    price = Math.round(price * 1000);
  }
  if (price > 0 && price < 1000) {
    // Still suspicious — could be "150.000" parsed as 150 — multiply by 1000
    price = Math.round(price * 1000);
  }
  return Math.round(price);
}

// ══════════ DATA CONFIDENCE SCORER ══════════
function computeConfidence(results, priceStats) {
  const validPrices = results.filter(r => (r.price_idr || 0) >= 1000);
  const totalResults = results.length;
  const withSold = results.filter(r => r.sold && r.sold.trim() && !/^-|^—/.test(r.sold)).length;

  // Price spread ratio: highest / lowest — anything over 10x is suspect
  const spread = priceStats.highest_idr && priceStats.lowest_idr > 0
    ? priceStats.highest_idr / priceStats.lowest_idr : 999;

  let score = 0;
  let flags = [];

  // Valid price count (0-40 pts)
  if (validPrices.length >= 10) score += 40;
  else if (validPrices.length >= 5) score += 30;
  else if (validPrices.length >= 3) score += 20;
  else { score += 5; flags.push("Few valid prices"); }

  // Price spread (0-30 pts)
  if (spread <= 3) score += 30;
  else if (spread <= 5) score += 20;
  else if (spread <= 10) score += 10;
  else { score += 0; flags.push(`Wide price spread (${spread.toFixed(0)}×)`); }

  // Sold data (0-20 pts)
  if (withSold >= 5) score += 20;
  else if (withSold >= 2) score += 10;
  else { score += 0; flags.push("No sold data"); }

  // Discarded vs total (0-10 pts)
  const discardRate = totalResults > 0 ? (totalResults - validPrices.length) / totalResults : 1;
  if (discardRate <= 0.1) score += 10;
  else if (discardRate <= 0.3) score += 5;
  else { score += 0; flags.push(`${Math.round(discardRate * 100)}% prices discarded`); }

  const level = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  return { score, level, flags, validCount: validPrices.length, totalCount: totalResults, withSold, spread: spread < 999 ? spread : null };
}

// ══════════ CSV PARSER (handles quoted fields, escaped quotes, BOM) ══════════
function parseCSV(text) {
  // Strip BOM
  let raw = text.replace(/^\uFEFF/, "").trim();
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return [];

  const parseRow = (line) => {
    const vals = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            cur += '"'; i++; // escaped quote
          } else {
            inQ = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') { inQ = true; }
        else if (ch === ",") { vals.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
    }
    vals.push(cur.trim());
    return vals;
  };

  const headers = parseRow(lines[0]).map(h => h.replace(/^"|"$/g, ""));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = parseRow(line);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = vals[i] || ""));
    return obj;
  });
}

function guessCategory(n) {
  const l = (n || "").toLowerCase();
  if (/phone|charger|cable|headphone|speaker|power bank|usb|bluetooth|watch/i.test(l)) return "electronics";
  if (/pan|pot|kitchen|cook|bake|knife|blender|mixer|plate/i.test(l)) return "kitchen";
  if (/cream|serum|lotion|shampoo|perfume|makeup|lipstick|skincare/i.test(l)) return "beauty";
  if (/shirt|dress|shoe|bag|wallet|belt|hat|socks|jacket/i.test(l)) return "fashion";
  if (/pillow|curtain|lamp|rug|mat|towel|organizer|shelf/i.test(l)) return "home";
  if (/toy|game|puzzle|doll|lego|figure/i.test(l)) return "toys";
  if (/ball|fitness|gym|yoga|exercise|bottle/i.test(l)) return "sports";
  if (/baby|diaper|pacifier|stroller/i.test(l)) return "baby";
  if (/pen|notebook|stapler|tape|folder|desk/i.test(l)) return "office";
  return "other";
}

// ══════════ SAFE LOCALSTORAGE ══════════
function lsGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota or restricted */ }
}
function lsGetRaw(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSetRaw(key, val) {
  try { localStorage.setItem(key, val); } catch { /* restricted */ }
}

const Badge = ({ text, color = "#2EAA5A", bg = "#0D2E1A" }) => (
  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "3px", fontSize: "10px", fontFamily: "monospace", background: bg, color, border: `1px solid ${color}33` }}>{text}</span>
);
const Spinner = () => (
  <div style={{ width: "14px", height: "14px", border: "2px solid #C9A84C", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
);

// ══════════ MAIN APP ══════════
export default function GTCrossTrade() {
  // ─── Auth ───
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedOut, setLockedOut] = useState(false);

  // ─── Theme ───
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("arb-theme") !== "light"; } catch { return true; }
  });
  const toggleTheme = () => {
    const n = !dark;
    setDark(n);
    lsSetRaw("arb-theme", n ? "dark" : "light");
  };

  // ─── Core ───
  const [mode, setMode] = useState("auto");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState("");
  const [history, setHistory] = useState([]);

  // ─── FX ───
  const [fx, setFx] = useState(DEFAULT_FX);
  const [fxUpdated, setFxUpdated] = useState(null);

  // ─── Freight ───
  const [freight, setFreight] = useState(DEFAULT_FREIGHT);
  const [freightLoading, setFreightLoading] = useState(false);

  // ─── Auto Lookup ───
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [dryRunData, setDryRunData] = useState(null);
  const [uaeSimilar, setUaeSimilar] = useState(null);
  const [indoResults, setIndoResults] = useState(null);
  const [marginData, setMarginData] = useState(null);
  const [autoError, setAutoError] = useState("");
  const [editableQueries, setEditableQueries] = useState([]);
  const [newQueryInput, setNewQueryInput] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [activeSection, setActiveSection] = useState(0);
  const [qty, setQty] = useState(1);
  const [qtyMode, setQtyMode] = useState("unit");

  // ─── Bulk ───
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

  // ─── Theme colors ───
  const c = dark ? {
    bg: "#0a0a0a", surface: "#0C0F0C", surface2: "#0E120E", input: "#1a1a1a",
    border: "#222", border2: "#333", text: "#d4d4d4", dim: "#888", dimmer: "#555", dimmest: "#444",
    gold: "#C9A84C", green: "#2EAA5A", red: "#f87171", darkGold: "#D4A843",
    cardBg: "#080808", btnText: "#0f0f0f", sectionBg: "#0D1F15",
  } : {
    bg: "#F5F2EB", surface: "#FFFFFF", surface2: "#F0EDE4", input: "#FFFFFF",
    border: "#D4CFC4", border2: "#C0BAB0", text: "#1A1A1A", dim: "#555", dimmer: "#888", dimmest: "#AAA",
    gold: "#8B6914", green: "#1A7A3A", red: "#DC2626", darkGold: "#9A7A1C",
    cardBg: "#F8F6F0", btnText: "#FFFFFF", sectionBg: "#E8F5EC",
  };

  // ─── PIN ───
  const hashPin = async (pin) => {
    const e = new TextEncoder().encode(pin + "arb-salt-2026");
    const b = await crypto.subtle.digest("SHA-256", e);
    return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join("");
  };
  const [correctHash, setCorrectHash] = useState("");
  useEffect(() => { hashPin(String.fromCharCode(55, 54, 54, 57, 49, 49)).then(h => setCorrectHash(h)); }, []);

  const handleUnlock = async () => {
    if (lockedOut) return;
    const h = await hashPin(pinInput);
    if (h === correctHash) {
      setUnlocked(true);
      setPinError("");
      setPinInput("");
    } else {
      const n = attempts + 1;
      setAttempts(n);
      setPinInput("");
      if (n >= 3) setLockedOut(true);
      else setPinError("Wrong PIN (" + (3 - n) + " left)");
    }
  };

  // ─── Load data after unlock ───
  useEffect(() => {
    if (!unlocked) return;
    const k = lsGetRaw("arb-api-key");
    if (k) { setApiKey(k); setApiKeyStatus("loaded"); }
    setHistory(lsGet("arb-auto-history", []));
    setDatabase(lsGet("arb-database", []));
    const f = lsGet("arb-freight");
    if (f) setFreight(f);
  }, [unlocked]);

  useEffect(() => { if (history.length > 0) lsSet("arb-auto-history", history); }, [history]);
  useEffect(() => { if (database.length > 0) lsSet("arb-database", database); }, [database]);

  // ─── Auto-save API key ───
  useEffect(() => {
    if (!apiKey || apiKey.length < 10) return;
    const t = setTimeout(() => {
      lsSetRaw("arb-api-key", apiKey);
      setApiKeyStatus("saved");
      setTimeout(() => setApiKeyStatus(""), 1500);
    }, 1000);
    return () => clearTimeout(t);
  }, [apiKey]);

  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(x => x <= 1 ? 0 : x - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // ══════════ FX RATES ══════════
  useEffect(() => {
    if (!unlocked) return;
    const fetchFx = async () => {
      const cached = lsGet("arb-fx");
      if (cached && Date.now() - cached.ts < FX_CACHE_MS) {
        setFx(cached.rates);
        setFxUpdated(new Date(cached.ts));
        return;
      }
      try {
        const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=AED,IDR");
        const d = await r.json();
        const aedusd = 1 / d.rates.AED;
        const idrusd = 1 / d.rates.IDR;
        const rates = {
          AEDUSD: aedusd,
          IDRUSD: idrusd,
          AED_TO_IDR: aedusd / idrusd,
          IDR_TO_AED: idrusd / aedusd,
        };
        setFx(rates);
        setFxUpdated(new Date());
        lsSet("arb-fx", { rates, ts: Date.now() });
      } catch (e) { console.log("FX fetch failed, using defaults"); }
    };
    fetchFx();
  }, [unlocked]);

  // ══════════ CLAUDE API ══════════
  const callClaude = async (prompt, model, useSearch = false, retries = 2, maxTokens = 2048) => {
    const body = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    };
    if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    const delay = useSearch ? 15000 : 8000;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify(body),
        });
        if (r.status === 429) {
          let detail = "";
          try { const e = await r.json(); detail = e.error?.message || ""; } catch {}
          if (attempt < retries) {
            setStage(s => s.replace(/ \(retry.*/, "") + ` (retry in ${Math.round((attempt + 1) * delay / 1000)}s...)`);
            await wait((attempt + 1) * delay);
            continue;
          }
          throw new Error("Rate limited. " + (detail.includes("acceleration") ? "Wait 2 min between lookups." : "Wait 30s and retry.") + " No cost charged.");
        }
        if (!r.ok) {
          let d = "";
          try { const e = await r.json(); d = e.error?.message || ""; } catch {}
          throw new Error(`API ${r.status}: ${d || "error"}`);
        }
        const data = await r.json();
        return data.content?.map(b => b.text || "").filter(Boolean).join("\n") || "";
      } catch (err) {
        if (attempt === retries) throw err;
        await wait((attempt + 1) * 10000);
      }
    }
  };

  const parseJSON = (text) => {
    let s = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const matches = [];
    let depth = 0, start = -1;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '{') { if (depth === 0) start = i; depth++; }
      if (s[i] === '}') { depth--; if (depth === 0 && start >= 0) { matches.push(s.substring(start, i + 1)); start = -1; } }
    }
    for (const m of matches.sort((a, b) => b.length - a.length)) {
      try {
        const p = JSON.parse(m);
        if (p.product_name || p.results || p.clean_name_en || p.similar || p.products) return p;
      } catch {}
    }
    try { return JSON.parse(s); } catch {}
    throw new Error("No valid JSON");
  };

  // ══════════ PROGRESS TIMER ══════════
  const runWithProgress = async (fn, estimatedSec) => {
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => { const next = p + (100 / estimatedSec / 4); return next > 95 ? 95 : next; });
    }, 250);
    try {
      const result = await fn();
      setProgress(100);
      clearInterval(interval);
      return result;
    } catch (e) {
      clearInterval(interval);
      setProgress(0);
      throw e;
    }
  };

  // ══════════ FETCH FREIGHT RATES ══════════
  const fetchFreightRates = async () => {
    if (!apiKey) return;
    setFreightLoading(true);
    try {
      const result = await callClaude(
`Search for current freight shipping rates from Indonesia (Jakarta/Surabaya) to UAE (Jebel Ali/Dubai) for both air and ocean freight in 2025-2026.

Return ONLY valid JSON:
{
  "air": { "rate_per_kg": number in USD, "min_kg": minimum kg, "transit": { "port_port": "X-Y days", "port_door": "X-Y days", "door_door": "X-Y days" }},
  "ocean": { "rate_20ft": USD for 20ft container, "rate_40ft": USD for 40ft container, "rate_per_cbm": USD per CBM, "transit": { "port_port": "X-Y days", "port_door": "X-Y days", "door_door": "X-Y days" }},
  "source": "where you found these rates",
  "notes": "any relevant notes about current market conditions"
}
JSON only:`, "claude-sonnet-4-20250514", true, 2, 4096);
      const data = parseJSON(result);
      const fr = { ...data, updated: Date.now(), source: "live" };
      setFreight(fr);
      lsSet("arb-freight", fr);
    } catch (e) { console.log("Freight fetch failed:", e); }
    setFreightLoading(false);
  };

  // ══════════ QUICK CHECK ══════════
  const runDryRun = async () => {
    if (!apiKey) { setApiKeyStatus("missing"); return; }
    const input = url.trim();
    if (!input) return;
    if (input.includes("amzn.eu") || input.includes("amzn.to") || input.includes("a.co/")) {
      setAutoError("Shortened link. Open in browser first, copy full URL.");
      return;
    }

    setLoading(true);
    setAutoError("");
    setDryRunData(null);
    setUaeSimilar(null);
    setIndoResults(null);
    setMarginData(null);
    setEditableQueries([]);
    setNewQueryInput("");
    setActiveSection(0);

    const asinMatch = input.match(/\/dp\/([A-Z0-9]{10})/i) || input.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
    const asin = asinMatch ? asinMatch[1] : "";
    const isNoon = input.includes("noon.com");
    const marketplace = isNoon ? "Noon UAE" : "Amazon.ae";

    try {
      // Step 1: Search for the product
      setStage("Searching for product... (~10s)");
      const rawInfo = await runWithProgress(() => callClaude(
`I need to find the EXACT product details for this ${marketplace} listing.

URL: ${input}
${asin ? `ASIN/Product ID: ${asin}` : ""}

Do these searches:
1. Search: "${asin ? asin + " amazon.ae" : input}"
2. Search: "${asin ? asin + " price AED" : ""}"
${isNoon ? `3. Search: the product URL on noon.com` : `3. Search the full product name if you find it`}

I MUST know:
- The EXACT product name as shown on ${marketplace}
- The EXACT current price in AED (this is critical — I need the actual number)
- Brand name
- Star rating and number of reviews
- Key specs: size, material, weight, quantity/pack size, color

If you find the product, report ALL details. Include the price in AED — even if approximate, give me a number.`,
        "claude-haiku-4-5-20251001", true, 2, 4096), 12);

      // Step 2: Format + translate
      setStage("Translating & formatting... (~5s)");
      await wait(2000);
      const formatted = await runWithProgress(() => callClaude(
`You are a data formatting engine. Convert this product info to JSON.

PRODUCT INFO FROM WEB SEARCH:
${rawInfo}

ORIGINAL URL: ${input}
MARKETPLACE: ${marketplace}
${asin ? `ASIN: ${asin}` : ""}

Output ONLY this JSON (no explanation, no markdown):
{"product_name":"the exact full product name found","price_aed":NUMBER_IN_AED,"brand":"brand name","rating":NUMBER,"reviews":NUMBER,"source":"${marketplace}","clean_name_en":"short generic English description without brand","clean_name_id":"Bahasa Indonesia translation for Tokopedia","category":"electronics/kitchen/beauty/fashion/home/toys/sports/baby/office/other","weight_class":"light/medium/heavy","key_specs":"specs found","search_queries_id":["bahasa query 1","bahasa query 2","bahasa query 3"],"search_queries_en":["english query 1","english query 2"]}

CRITICAL RULES:
- price_aed MUST be a number (e.g. 45.00, 89, 129.99). If the search found ANY price, use it. If price was in USD, multiply by 3.67 to get AED.
- search_queries_id MUST be Bahasa Indonesia: baby socks→"kaos kaki bayi", frying pan→"wajan anti lengket"
- Generate 3-5 DIVERSE Bahasa queries: include the generic product name, a short keyword version, and a variation with common Indonesian marketplace terms like "murah", "terlaris", "original"
- product_name should be the actual name found, not a generic description
- If you're unsure about price, estimate based on the product type and ${marketplace} pricing

JSON only:`,
        "claude-haiku-4-5-20251001", false, 2, 2048), 6);

      let data;
      try {
        data = parseJSON(formatted);
      } catch (e) {
        console.log("Step 1 raw:", rawInfo?.substring(0, 500));
        console.log("Step 2 raw:", formatted?.substring(0, 500));
        throw new Error("Format failed. Try again — web search sometimes returns incomplete data.");
      }
      if (!data.product_name) throw new Error("Product name not found. The product page may not be indexed. Try searching the product name manually on Google first.");

      // If price is still 0, try to extract from raw text
      if (!data.price_aed || data.price_aed === 0) {
        const priceMatch = rawInfo.match(/AED\s*(\d+(?:\.\d+)?)/i) || rawInfo.match(/(\d+(?:\.\d+)?)\s*AED/i) || rawInfo.match(/price[:\s]+(\d+(?:\.\d+)?)/i);
        if (priceMatch) data.price_aed = parseFloat(priceMatch[1]);
      }

      data.source = data.source || marketplace;
      data.url = input;

      setDryRunData(data);
      setEditableQueries([
        ...(data.search_queries_id || [data.clean_name_id]),
        ...(data.search_queries_en || []),
      ]);
      setStage("");

      if (!data.price_aed || data.price_aed === 0) {
        setAutoError("Product found but price couldn't be detected. You can enter the price manually below.");
      }
    } catch (err) {
      setAutoError(err.message);
      setStage("");
      if (err.message.includes("429") || err.message.includes("Rate")) setCooldown(30);
    }
    setLoading(false);
  };

  // ══════════ INDO SEARCH (FIXED — the main action) ══════════
  const runIndoSearch = async () => {
    if (!dryRunData || !apiKey) return;
    setLoading(true);
    setAutoError("");
    setIndoResults(null);
    setMarginData(null);

    const allQueries = editableQueries.filter(q => q.trim());
    if (allQueries.length === 0) {
      setAutoError("Add at least one search query.");
      setLoading(false);
      return;
    }

    // Split queries: prioritize Bahasa (non-ASCII or known ID patterns) over English
    const bahasaQueries = allQueries.filter(q => /[^a-zA-Z0-9\s\-\.]/.test(q) || /murah|terlaris|harga|bayi|kaki|wajan|anti|sabun|tas|baju|celana|sepatu|alat|mesin/i.test(q));
    const englishQueries = allQueries.filter(q => !bahasaQueries.includes(q));
    // Use top 3 Bahasa + top 2 English, with Bahasa first
    const primaryQueries = [...bahasaQueries.slice(0, 3), ...englishQueries.slice(0, 2)];
    if (primaryQueries.length === 0) primaryQueries.push(...allQueries.slice(0, 3));

    const doSearch = async (queries, attemptLabel) => {
      // Step 1: Search naturally (Sonnet + web search, higher token limit)
      setStage(`${attemptLabel}Searching Indonesian marketplaces... (~25s)`);
      // Build focused search instructions: Bahasa terms + bestseller targeting
      const searchInstructions = queries.slice(0, 3).map(q =>
        `- Search: "${q} tokopedia terlaris"\n- Search: "${q} shopee paling laku"`
      ).join("\n");

      const rawSearch = await runWithProgress(() => callClaude(
`You are a product researcher. Search for "${dryRunData.clean_name_id}" (English: "${dryRunData.clean_name_en}") on Indonesian e-commerce marketplaces.

Do these searches one by one:
${searchInstructions}
- Search: "${queries[0]} harga terbaru indonesia"
- Search: "top selling ${dryRunData.category || "product"} ${queries[0]} tokopedia shopee"

IMPORTANT INSTRUCTIONS:
- You MUST actually perform each web search above
- PRIORITIZE listings that show sales volume / "terjual" / "sold" counts — these indicate real demand
- For EVERY product listing you find, extract:
  * Product name (exact name from the listing)
  * Price in IDR (Indonesian Rupiah) — convert from Rp format: Rp 25.000 = 25000, Rp 1.500.000 = 1500000
  * Marketplace: "Tokopedia" or "Shopee"
  * Seller/shop name
  * Units sold if visible (e.g. "1rb+ terjual", "500+ sold", "5.000+ terjual")
  * Product URL
- Include ALL products found across all searches — even slightly different variants
- Aim for at least 8-15 listings
- Pay attention to "terjual" or "sold" indicators — these are critical for evaluating market demand

List every product found with all available details. Be thorough — especially with prices and sold counts.`,
        "claude-sonnet-4-20250514", true, 2, 4096), 30);

      // Step 2: Format to JSON (Haiku, higher token limit)
      setStage(`${attemptLabel}Formatting results... (~5s)`);
      await wait(1500);
      const formatted = await runWithProgress(() => callClaude(
`Convert this Indonesian marketplace search data into valid JSON. No explanation, no markdown, no backticks.

RAW SEARCH RESULTS:
${rawSearch}

Output this JSON structure:
{"results":[{"name":"exact product name from listing","price_idr":NUMBER_IN_RUPIAH,"source":"Tokopedia" or "Shopee","seller":"shop name","sold":"units sold if mentioned e.g. 1rb+ terjual, 500+ sold, otherwise empty string","url":"product URL if found, otherwise empty string"}],"price_stats":{"lowest_idr":NUMBER,"highest_idr":NUMBER,"median_idr":NUMBER,"average_idr":NUMBER,"num_results":NUMBER},"search_notes":"brief summary of what was found"}

CRITICAL RULES FOR PRICES:
- price_idr MUST be an INTEGER number in Indonesian Rupiah
- Convert from Rp format: "Rp 25.000" = 25000 (NOT 25.0), "Rp 1.500.000" = 1500000 (NOT 1500.0)
- Indonesian prices use DOTS as thousands separators: 15.000 means fifteen thousand (15000)
- NEVER output a decimal like 25.000 — that should be the integer 25000
- Valid price range for most products: 5000 to 50000000
- If a price looks like it's below 1000 IDR, you probably forgot to convert dots

OTHER RULES:
- Include EVERY product found — do not skip any
- source must be exactly "Tokopedia" or "Shopee"
- "sold" field: use the EXACT text from the listing (e.g. "1rb+ terjual", "250+ sold"). If not available, use empty string ""
- Calculate price_stats from the actual results array

JSON only, no other text:`,
        "claude-haiku-4-5-20251001", false, 2, 4096), 8);

      return formatted;
    };

    try {
      let formatted = await doSearch(primaryQueries, "");
      let indo;

      try {
        indo = parseJSON(formatted);
      } catch (e) {
        console.log("Indo format failed, raw:", formatted?.substring(0, 500));
        // Retry: sometimes the formatting fails but data was found
        setStage("Re-formatting results...");
        await wait(1000);
        try {
          const reformat = await callClaude(
`The following text contains Indonesian marketplace product data. Extract it into JSON.

TEXT:
${formatted}

Return ONLY: {"results":[{"name":"product name","price_idr":NUMBER,"source":"Tokopedia or Shopee","seller":"shop","sold":"","url":""}],"price_stats":{"lowest_idr":0,"highest_idr":0,"median_idr":0,"average_idr":0,"num_results":0},"search_notes":""}

Calculate price_stats from the results. JSON only:`,
            "claude-haiku-4-5-20251001", false, 1, 4096);
          indo = parseJSON(reformat);
        } catch {
          throw new Error("Could not format search results. Try again.");
        }
      }

      // Normalize result keys
      if (!indo.results) indo.results = indo.products || [];

      // ─── RETRY WITH BROADER TERMS if no results ───
      if (indo.results.length === 0) {
        console.log("First search returned 0 results, retrying with broader terms...");
        const broadQuery = dryRunData.clean_name_id || dryRunData.clean_name_en;
        const categoryFallback = dryRunData.category || "product";

        const formatted2 = await doSearch(
          [broadQuery, `${categoryFallback} murah`, dryRunData.clean_name_en],
          "🔄 Retry: "
        );

        try {
          const indo2 = parseJSON(formatted2);
          if (!indo2.results) indo2.results = indo2.products || [];
          if (indo2.results.length > 0) {
            indo = indo2;
          }
        } catch {
          // Still no results after retry
        }
      }

      // ─── LAST RESORT: direct broad search ───
      if (indo.results.length === 0) {
        setStage("Trying broad category search...");
        try {
          const lastResort = await runWithProgress(() => callClaude(
`Search for "${dryRunData.clean_name_en}" products available in Indonesia. Try these searches:
- Search: "${dryRunData.clean_name_en} tokopedia"
- Search: "${dryRunData.clean_name_en} shopee"
- Search: "${dryRunData.category} ${dryRunData.clean_name_en} harga indonesia"

Find ANY Indonesian e-commerce listings with prices in IDR/Rupiah. List every product with name, price in IDR, and which marketplace.`,
            "claude-sonnet-4-20250514", true, 1, 4096), 20);

          const lastFormatted = await callClaude(
`Extract products and prices from this text into JSON:
${lastResort}
Return: {"results":[{"name":"","price_idr":NUMBER,"source":"Tokopedia or Shopee","seller":"","sold":"","url":""}],"price_stats":{"lowest_idr":0,"highest_idr":0,"median_idr":0,"average_idr":0,"num_results":0},"search_notes":""}
JSON only:`, "claude-haiku-4-5-20251001", false, 1, 4096);

          const indo3 = parseJSON(lastFormatted);
          if (!indo3.results) indo3.results = indo3.products || [];
          if (indo3.results.length > 0) indo = indo3;
        } catch (e) {
          console.log("Last resort search failed:", e);
        }
      }

      if (indo.results.length === 0) {
        throw new Error("No Indonesian listings found after 3 search attempts. Try editing the keywords to simpler Bahasa terms, or search for a broader product category.");
      }

      // ─── SANITIZE PRICES + CLEAN RESULTS ───
      indo.results = indo.results.map(r => {
        let sold = r.sold || r.terjual || "";
        if (typeof sold === "string" && /not visible|not available|n\/a|^0$/i.test(sold)) sold = "";
        const rawPrice = r.price_idr || r.price || 0;
        const sanitizedPrice = sanitizeIDR(rawPrice);
        return {
          name: r.name || r.product_name || "",
          price_idr: sanitizedPrice,
          price_idr_raw: rawPrice, // keep original for debugging
          source: r.source || r.platform || "Tokopedia",
          seller: r.seller || r.shop || r.shop_name || "",
          sold,
          url: r.url || r.link || "",
        };
      });

      // Remove results with invalid prices
      const validResults = indo.results.filter(r => r.price_idr >= 1000);
      const discardedCount = indo.results.length - validResults.length;
      if (discardedCount > 0) console.log(`Discarded ${discardedCount} results with invalid IDR prices`);

      // Outlier removal: if spread > 10x, trim top/bottom 10%
      if (validResults.length >= 5) {
        const sorted = [...validResults].sort((a, b) => a.price_idr - b.price_idr);
        const lo = sorted[0].price_idr;
        const hi = sorted[sorted.length - 1].price_idr;
        if (hi / lo > 10) {
          const trimCount = Math.max(1, Math.floor(validResults.length * 0.1));
          const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
          if (trimmed.length >= 3) {
            indo.results = trimmed;
            console.log(`Trimmed ${trimCount * 2} outliers (spread was ${(hi / lo).toFixed(0)}×)`);
          } else {
            indo.results = validResults;
          }
        } else {
          indo.results = validResults;
        }
      } else {
        indo.results = validResults;
      }

      // Recompute price_stats from sanitized, validated results
      const cleanPrices = indo.results
        .map(r => r.price_idr)
        .filter(x => x >= 1000)
        .sort((a, b) => a - b);

      if (cleanPrices.length > 0) {
        indo.price_stats = {
          lowest_idr: cleanPrices[0],
          highest_idr: cleanPrices[cleanPrices.length - 1],
          median_idr: cleanPrices[Math.floor(cleanPrices.length / 2)],
          average_idr: Math.round(cleanPrices.reduce((s, x) => s + x, 0) / cleanPrices.length),
          num_results: cleanPrices.length,
        };
      } else if (indo.results.length > 0) {
        // Fallback: use whatever we have
        const anyPrices = indo.results.map(r => r.price_idr).filter(x => x > 0).sort((a, b) => a - b);
        if (anyPrices.length > 0) {
          indo.price_stats = {
            lowest_idr: anyPrices[0],
            highest_idr: anyPrices[anyPrices.length - 1],
            median_idr: anyPrices[Math.floor(anyPrices.length / 2)],
            average_idr: Math.round(anyPrices.reduce((s, x) => s + x, 0) / anyPrices.length),
            num_results: anyPrices.length,
          };
        }
      }

      // ─── CONFIDENCE SCORING ───
      const confidence = computeConfidence(indo.results, indo.price_stats || {});
      indo.confidence = confidence;

      setIndoResults(indo);

      // ─── Calculate margins ───
      const wc = dryRunData.weight_class || "medium";
      const stats = indo.price_stats;
      if (!stats || !stats.median_idr) throw new Error("No valid prices found after sanitization. Try different keywords.");
      const med = stats.median_idr;
      const low = stats.lowest_idr || med;
      const high = stats.highest_idr || med;

      const calcMargin = (indoIDR) => {
        const uaeUSD = dryRunData.price_aed * fx.AEDUSD;
        const indoUSD = indoIDR * fx.IDRUSD;
        const wkg = WEIGHT_KG[wc] || 1.0;
        const fr = (freight.air?.rate_per_kg || 4) * wkg;
        const duty = (indoUSD + fr) * CUSTOMS_DUTY;
        const lm = LAST_MILE_AED * fx.AEDUSD;
        const total = indoUSD + fr + duty + lm;
        const margin = uaeUSD > 0 ? ((uaeUSD - total) / uaeUSD) * 100 : 0;
        return {
          uaeUSD, uaeAED: dryRunData.price_aed, uaeIDR: dryRunData.price_aed * fx.AED_TO_IDR,
          indoUSD, indoAED: indoUSD / fx.AEDUSD, indoIDR,
          freightUSD: fr, freightAED: fr / fx.AEDUSD, freightIDR: fr / fx.IDRUSD,
          dutyUSD: duty, dutyAED: duty / fx.AEDUSD, dutyIDR: duty / fx.IDRUSD,
          lastMileUSD: lm, lastMileAED: LAST_MILE_AED, lastMileIDR: LAST_MILE_AED * fx.AED_TO_IDR,
          totalUSD: total, totalAED: total / fx.AEDUSD, totalIDR: total / fx.IDRUSD,
          margin,
        };
      };

      const medianMargin = calcMargin(med);
      const mData = {
        uaeProduct: dryRunData,
        normalized: dryRunData,
        uaeSimilar,
        indoResults: indo,
        margins: {
          median: medianMargin,
          best: calcMargin(low),
          worst: calcMargin(high),
        },
        confidence,
        medianPriceIDR: med,
        lowestPriceIDR: low,
        highestPriceIDR: high,
        weightClass: wc,
        timestamp: new Date().toISOString(),
        status: medianMargin.margin >= MARGIN_THRESHOLD.candidate ? "Candidate"
          : medianMargin.margin >= MARGIN_THRESHOLD.borderline ? "Investigated"
          : "Rejected",
      };
      setMarginData(mData);
      setHistory(prev => [mData, ...prev].slice(0, MAX_HISTORY));
      setActiveSection(2);
      setStage("");
    } catch (err) {
      setAutoError(err.message);
      setStage("");
      if (err.message.includes("429") || err.message.includes("Rate")) setCooldown(30);
    }
    setLoading(false);
  };

  // ══════════ UAE SIMILAR ══════════
  const runUaeSimilar = async () => {
    if (!dryRunData || !apiKey) return;
    setLoading(true);
    setAutoError("");
    setUaeSimilar(null);
    try {
      setStage("Finding similar UAE products... (~15s)");
      const rawSearch = await runWithProgress(() => callClaude(
`Search Amazon.ae and Noon UAE for 8-10 products similar to "${dryRunData.product_name}".
Category: ${dryRunData.category} | Price range: around AED ${dryRunData.price_aed}

Search for: "${dryRunData.clean_name_en} amazon.ae" and "${dryRunData.clean_name_en} noon uae"

Find the best sellers and most purchased items. List each product with its name, price in AED, which marketplace it's from, and any ratings or best seller indicators you can find.`,
        "claude-sonnet-4-20250514", true, 2, 4096), 18);

      await wait(2000);
      setStage("Formatting results... (~5s)");
      const formatted = await runWithProgress(() => callClaude(
`Convert this product search data into ONLY valid JSON. No explanation.

Search results:
${rawSearch}

Output ONLY this JSON:
{"similar":[{"name":"product name","price_aed":number,"source":"Amazon.ae or Noon","rating":number_or_0,"sold":"best seller or sold count if mentioned","url":"if found"}],"price_stats":{"lowest_aed":number,"highest_aed":number,"median_aed":number,"average_aed":number,"num_results":number},"search_notes":"summary"}

All prices must be numbers in AED. JSON only:`,
        "claude-haiku-4-5-20251001", false, 2, 4096), 6);

      const uaeData = parseJSON(formatted);
      if (!uaeData.similar) uaeData.similar = uaeData.results || [];
      if (!uaeData.price_stats && uaeData.similar.length > 0) {
        const p = uaeData.similar.map(x => x.price_aed || x.price || 0).filter(x => x > 0).sort((a, b) => a - b);
        uaeData.price_stats = {
          lowest_aed: p[0],
          highest_aed: p[p.length - 1],
          median_aed: p[Math.floor(p.length / 2)],
          average_aed: Math.round(p.reduce((s, x) => s + x, 0) / p.length * 100) / 100,
          num_results: p.length,
        };
      }
      setUaeSimilar(uaeData);
      setActiveSection(0);
      setStage("");
    } catch (err) {
      setAutoError(err.message);
      setStage("");
      if (err.message.includes("429") || err.message.includes("Rate")) setCooldown(30);
    }
    setLoading(false);
  };

  // ══════════ EXPORTS ══════════
  const exportStructuredCSV = () => {
    if (!history.length) return;
    const headers = [
      "Date", "Product Name EN", "Product Name ID", "Brand", "Category", "Weight Class", "Source",
      "UAE Price AED", "UAE Price USD", "UAE Price IDR",
      "Indo Median IDR", "Indo Lowest IDR", "Indo Highest IDR", "Indo Median USD",
      "Freight USD", "Customs USD", "Last Mile USD",
      "Total Cost USD", "Total Cost AED", "Total Cost IDR",
      "Margin Best %", "Margin Median %", "Margin Worst %", "Status",
    ];
    const rows = history.map(h => {
      const m = h.margins?.median || {};
      return [
        h.timestamp?.slice(0, 10) || "",
        `"${h.uaeProduct?.product_name || ""}"`,
        `"${h.normalized?.clean_name_id || ""}"`,
        `"${h.uaeProduct?.brand || ""}"`,
        h.normalized?.category || "",
        h.normalized?.weight_class || "",
        h.uaeProduct?.source || "",
        h.uaeProduct?.price_aed || 0,
        (m.uaeUSD || 0).toFixed(2),
        (m.uaeIDR || 0).toFixed(0),
        h.medianPriceIDR || 0,
        h.lowestPriceIDR || 0,
        h.highestPriceIDR || 0,
        (m.indoUSD || 0).toFixed(2),
        (m.freightUSD || 0).toFixed(2),
        (m.dutyUSD || 0).toFixed(2),
        (m.lastMileUSD || 0).toFixed(2),
        (m.totalUSD || 0).toFixed(2),
        (m.totalAED || 0).toFixed(2),
        (m.totalIDR || 0).toFixed(0),
        (h.margins?.best?.margin || 0).toFixed(1),
        (h.margins?.median?.margin || 0).toFixed(1),
        (h.margins?.worst?.margin || 0).toFixed(1),
        h.status || "",
      ].join(",");
    });
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `gt-crosstrade-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const exportHistory = () => {
    if (!history.length) return;
    const h = ["Product", "AED", "IDR", "Bahasa", "Category", "Indo Median IDR", "Margin %", "Status", "Date"];
    const r = history.map(x => [
      `"${x.uaeProduct?.product_name || ""}"`,
      x.uaeProduct?.price_aed || 0,
      Math.round((x.uaeProduct?.price_aed || 0) * fx.AED_TO_IDR),
      `"${x.normalized?.clean_name_id || ""}"`,
      x.normalized?.category || "",
      x.medianPriceIDR || 0,
      x.margins?.median?.margin?.toFixed(1) || 0,
      x.status || "",
      x.timestamp?.slice(0, 10) || "",
    ].join(","));
    const blob = new Blob([[h.join(","), ...r].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lookups-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const exportPDF = () => {
    if (!marginData) return;
    const m = marginData.margins.median;
    const q = getQty();
    const html = `<!DOCTYPE html><html><head><title>GT Cross-Trade Analysis - ${marginData.uaeProduct?.product_name}</title>
    <style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#1a1a1a}h1{font-size:20px;border-bottom:2px solid #1a7a3a;padding-bottom:8px}h2{font-size:14px;color:#8B6914;margin-top:24px}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{padding:8px 12px;border:1px solid #ddd;text-align:left;font-size:12px}th{background:#f5f2eb;font-weight:700}.green{color:#1a7a3a}.red{color:#dc2626}.gold{color:#8B6914}.big{font-size:28px;font-weight:700;text-align:center;padding:16px}.verdict{padding:12px;text-align:center;border-radius:4px;font-weight:700;margin-top:16px}@media print{body{padding:20px}}</style></head><body>
    <h1>GT Cross-Trade Analysis</h1>
    <p><strong>Date:</strong> ${new Date().toLocaleDateString()} | <strong>FX:</strong> 1 AED = ${Math.round(fx.AED_TO_IDR)} IDR</p>
    <h2>Product</h2>
    <table><tr><th>Name</th><td>${marginData.uaeProduct?.product_name}</td></tr>
    <tr><th>Bahasa</th><td>${marginData.normalized?.clean_name_id}</td></tr>
    <tr><th>Category</th><td>${marginData.normalized?.category}</td></tr>
    <tr><th>Source</th><td>${marginData.uaeProduct?.source} | AED ${marginData.uaeProduct?.price_aed}</td></tr></table>
    <h2>Indonesia Market (Median of ${marginData.indoResults?.price_stats?.num_results || 0} listings)</h2>
    <table><tr><th></th><th>Lowest</th><th>Median</th><th>Highest</th></tr>
    <tr><th>IDR</th><td>${fmtIDR(marginData.lowestPriceIDR)}</td><td>${fmtIDR(marginData.medianPriceIDR)}</td><td>${fmtIDR(marginData.highestPriceIDR)}</td></tr></table>
    <h2>Margin Analysis (×${q} units)</h2>
    <table><tr><th>Item</th><th>USD</th><th>AED</th><th>IDR</th></tr>
    <tr><th>UAE Sell Price</th><td>${fmtUSD(m.uaeUSD * q)}</td><td>${fmtAED(m.uaeAED * q)}</td><td>${fmtIDR(m.uaeIDR * q)}</td></tr>
    <tr><th>Indo Source</th><td>${fmtUSD(m.indoUSD * q)}</td><td>${fmtAED(m.indoAED * q)}</td><td>${fmtIDR(m.indoIDR * q)}</td></tr>
    <tr><th>Air Freight</th><td>${fmtUSD(m.freightUSD * q)}</td><td>${fmtAED(m.freightAED * q)}</td><td>${fmtIDR(m.freightIDR * q)}</td></tr>
    <tr><th>Customs 5%</th><td>${fmtUSD(m.dutyUSD * q)}</td><td>${fmtAED(m.dutyAED * q)}</td><td>${fmtIDR(m.dutyIDR * q)}</td></tr>
    <tr><th>Last Mile</th><td>${fmtUSD(m.lastMileUSD * q)}</td><td>${fmtAED(m.lastMileAED * q)}</td><td>${fmtIDR(m.lastMileIDR * q)}</td></tr>
    <tr style="font-weight:700;background:#fef2f2"><th class="red">Total Cost</th><td class="red">${fmtUSD(m.totalUSD * q)}</td><td class="red">${fmtAED(m.totalAED * q)}</td><td class="red">${fmtIDR(m.totalIDR * q)}</td></tr>
    <tr style="font-weight:700;background:#e8f5ec"><th class="green">Profit</th><td class="green">${fmtUSD((m.uaeUSD - m.totalUSD) * q)}</td><td class="green">${fmtAED((m.uaeAED - m.totalAED) * q)}</td><td class="green">${fmtIDR((m.uaeIDR - m.totalIDR) * q)}</td></tr></table>
    <div class="big">${m.margin >= MARGIN_THRESHOLD.candidate ? '<span class="green">' : '<span class="red">'}${m.margin.toFixed(1)}% Gross Margin</span></div>
    <div class="verdict" style="background:${m.margin >= MARGIN_THRESHOLD.candidate ? '#e8f5ec;color:#1a7a3a' : m.margin >= MARGIN_THRESHOLD.borderline ? '#fdf8ed;color:#8B6914' : '#fef2f2;color:#dc2626'}">${m.margin >= MARGIN_THRESHOLD.candidate ? "✓ CANDIDATE" : m.margin >= MARGIN_THRESHOLD.borderline ? "○ BORDERLINE" : "✗ LOW MARGIN"}</div>
    <script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
  };

  const exportCurrentCSV = () => {
    if (!marginData) return;
    const m = marginData.margins.median;
    const q = getQty();
    const h = ["Item", "USD", "AED", "IDR"];
    const rows = [
      ["UAE Sell", fmtUSD(m.uaeUSD * q), fmtAED(m.uaeAED * q), fmtIDR(m.uaeIDR * q)],
      ["Indo Source", fmtUSD(m.indoUSD * q), fmtAED(m.indoAED * q), fmtIDR(m.indoIDR * q)],
      ["Freight", fmtUSD(m.freightUSD * q), fmtAED(m.freightAED * q), fmtIDR(m.freightIDR * q)],
      ["Customs", fmtUSD(m.dutyUSD * q), fmtAED(m.dutyAED * q), fmtIDR(m.dutyIDR * q)],
      ["Last Mile", fmtUSD(m.lastMileUSD * q), fmtAED(m.lastMileAED * q), fmtIDR(m.lastMileIDR * q)],
      ["Total Cost", fmtUSD(m.totalUSD * q), fmtAED(m.totalAED * q), fmtIDR(m.totalIDR * q)],
      ["Profit", fmtUSD((m.uaeUSD - m.totalUSD) * q), fmtAED((m.uaeAED - m.totalAED) * q), fmtIDR((m.uaeIDR - m.totalIDR) * q)],
      ["Margin", m.margin.toFixed(1) + "%", "", ""],
    ];
    const csv = [h.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${dryRunData?.clean_name_en || "product"}-analysis.csv`;
    a.click();
  };

  // ══════════ BULK PIPELINE ══════════
  const handleUAEUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target.result);
      const products = rows.map((r, i) => ({
        id: `uae-${Date.now()}-${i}`,
        name: r.product_name || r.name || r.title || r["Product Name"] || Object.values(r)[0] || "",
        price: parseFloat(r.price || r.Price || r.selling_price || Object.values(r)[1] || "0"),
        source: r.source || (r.asin ? "Amazon.ae" : "Noon"),
        category: guessCategory(r.product_name || r.name || r.title || Object.values(r)[0] || ""),
      }));
      setUaeProducts(products);
      lsSet("arb-uae-products", products);
    };
    reader.readAsText(file);
  }, []);

  const handleIndoUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target.result);
      setBulkIndoResults(rows.map((r, i) => ({
        id: `indo-${Date.now()}-${i}`,
        searchQuery: r.search_query || r.query || "",
        name: r.product_name || r.name || Object.values(r)[0] || "",
        price: parseFloat(r.price || r.Price || "0"),
        seller: r.seller || r.shop_name || "",
        source: r.source || "Tokopedia",
      })));
    };
    reader.readAsText(file);
  }, []);

  const runNormalization = async () => {
    if (!uaeProducts.length || !apiKey) return;
    setNormalizing(true);
    setNormProgress(0);
    const res = [];

    for (let i = 0; i < uaeProducts.length; i++) {
      const p = uaeProducts[i];
      try {
        const r = await callClaude(
          `Normalize. JSON only:\n{"clean_name_en":"","clean_name_id":"","category":"","search_query_tokopedia":""}\nProduct:"${p.name}" AED ${p.price}`,
          "claude-haiku-4-5-20251001", false, 1, 1024
        );
        const d = parseJSON(r);
        res.push({
          ...p,
          cleanNameEn: d.clean_name_en || p.name,
          cleanNameId: d.clean_name_id || "",
          detectedCategory: d.category || p.category,
          searchQuery: d.search_query_tokopedia || "",
          normalized: true,
        });
      } catch {
        res.push({
          ...p,
          cleanNameEn: p.name,
          cleanNameId: "",
          detectedCategory: p.category,
          searchQuery: "",
          normalized: false,
        });
      }
      setNormProgress(((i + 1) / uaeProducts.length) * 100);
      await wait(500);
    }

    setNormalized(res);
    lsSet("arb-normalized", res);
    setNormalizing(false);
  };

  const runMarginCalc = () => {
    const src = normalized.length > 0 ? normalized : uaeProducts;
    if (!src.length || !bulkIndoResults.length) return;

    const entries = src.map(u => {
      const q = u.searchQuery || u.cleanNameId || u.name;
      const matches = bulkIndoResults.filter(ir => {
        const sq = ir.searchQuery?.toLowerCase() || "";
        return sq === q.toLowerCase() || ir.name?.toLowerCase().includes(q.toLowerCase().split(" ")[0]);
      });
      let ip = 0;
      if (matches.length) {
        const p = matches.map(x => x.price).filter(x => x > 0).sort((a, b) => a - b);
        ip = p[Math.floor(p.length / 2)] || 0;
      }
      const usd = u.price * fx.AEDUSD;
      const iusd = ip * fx.IDRUSD;
      const fr = 4 * 1;
      const duty = (iusd + fr) * CUSTOMS_DUTY;
      const lm = LAST_MILE_AED * fx.AEDUSD;
      const total = iusd + fr + duty + lm;
      const mg = usd > 0 ? ((usd - total) / usd) * 100 : 0;
      return {
        id: `db-${u.id}`,
        nameEn: u.cleanNameEn || u.name,
        nameId: u.cleanNameId || "",
        category: u.detectedCategory || u.category,
        uaePriceAED: u.price,
        indoPriceIDR: ip,
        grossMarginPct: mg,
        status: mg >= MARGIN_THRESHOLD.candidate ? "Candidate" : "Rejected",
        notes: "",
        source: u.source,
      };
    });
    setDatabase(entries);
    setBulkTab(4);
  };

  const updateHistoryStatus = (i, s) => setHistory(prev => prev.map((x, idx) => idx === i ? { ...x, status: s } : x));

  const resetLookup = () => {
    setDryRunData(null);
    setUaeSimilar(null);
    setIndoResults(null);
    setMarginData(null);
    setAutoError("");
    setUrl("");
    setEditableQueries([]);
    setNewQueryInput("");
    setActiveSection(0);
  };

  // ══════════ STYLES ══════════
  const inputStyle = {
    width: "100%", padding: "10px 12px", background: c.input,
    border: `1px solid ${c.border2}`, color: c.text,
    fontFamily: "monospace", fontSize: "13px", borderRadius: "3px", outline: "none",
  };
  const btnStyle = {
    padding: "10px 24px", background: c.gold, color: c.btnText, border: "none",
    cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px",
    fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", borderRadius: "3px",
  };
  const btnSec = { ...btnStyle, background: "transparent", color: c.gold, border: `1px solid ${c.gold}` };
  const btnGreen = { ...btnStyle, background: c.green, color: "#fff" };
  const secStyle = {
    padding: "24px", background: c.surface, border: `1px solid ${c.border2}`,
    borderTop: "none", minHeight: "420px", borderRadius: "0 0 4px 4px",
  };
  const candidates = history.filter(h => (h.margins?.median?.margin || 0) >= MARGIN_THRESHOLD.candidate);

  const dropZone = (isI, onDrop, onClick, label) => (
    <div
      onDragOver={e => { e.preventDefault(); isI ? setIndoDragOver(true) : setDragOver(true); }}
      onDragLeave={() => isI ? setIndoDragOver(false) : setDragOver(false)}
      onDrop={e => { e.preventDefault(); isI ? setIndoDragOver(false) : setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onDrop(f); }}
      onClick={onClick}
      style={{
        border: `2px dashed ${(isI ? indoDragOver : dragOver) ? c.gold : c.border2}`,
        borderRadius: "4px", padding: "40px 24px", textAlign: "center", cursor: "pointer",
      }}
    >
      <div style={{ fontSize: "28px", marginBottom: "8px", opacity: 0.3 }}>↑</div>
      <div style={{ color: c.dim, fontSize: "12px", fontFamily: "monospace" }}>{label}</div>
    </div>
  );

  // Section toggle
  const SectionToggle = ({ index, title, icon, children, count }) => (
    <div style={{ marginBottom: "8px", border: `1px solid ${activeSection === index ? c.gold + "44" : c.border}`, borderRadius: "6px", overflow: "hidden" }}>
      <button
        onClick={() => setActiveSection(activeSection === index ? -1 : index)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: "10px",
          padding: "14px 16px", background: activeSection === index ? c.surface2 : c.surface,
          border: "none", cursor: "pointer", textAlign: "left", color: c.text,
          fontFamily: "'JetBrains Mono',monospace", fontSize: "12px",
        }}
      >
        <span style={{ fontSize: "16px" }}>{icon}</span>
        <span style={{ flex: 1, fontWeight: 600, color: activeSection === index ? c.gold : c.text }}>{title}</span>
        {count !== undefined && <span style={{ color: c.green, fontSize: "10px" }}>{count} items</span>}
        <span style={{ color: c.dimmer, fontSize: "14px" }}>{activeSection === index ? "▾" : "▸"}</span>
      </button>
      {activeSection === index && <div style={{ padding: "16px", borderTop: `1px solid ${c.border}` }}>{children}</div>}
    </div>
  );

  const PriceRow = ({ label, usd, aed, idr }) => (
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "4px 0", borderBottom: `1px solid ${c.border}` }}>
      <div style={{ color: c.dim }}>{label}</div>
      <div style={{ color: c.gold }}>{fmtUSD(usd)}</div>
      <div>{fmtAED(aed)}</div>
      <div>{fmtIDR(idr)}</div>
    </div>
  );

  const getQty = () =>
    qtyMode === "container" ? Math.floor(24000 / (WEIGHT_KG[dryRunData?.weight_class || "medium"] || 1))
    : qtyMode === "custom" ? qty : 1;

  // ══════════ RENDER ══════════
  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "'JetBrains Mono','Fira Code',monospace", padding: "24px", transition: "background 0.3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Instrument+Serif&display=swap" rel="stylesheet" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* LOCK SCREEN */}
      {!unlocked ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh", position: "relative" }}>
          <button onClick={toggleTheme} style={{ position: "absolute", top: 0, right: 0, background: "transparent", border: `1px solid ${c.border2}`, color: c.dim, fontFamily: "monospace", fontSize: "11px", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}>{dark ? "☀" : "🌙"}</button>
          <div style={{ width: "340px", padding: "40px", background: c.surface, border: `1px solid ${c.border}`, borderRadius: "8px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "16px", opacity: 0.3 }}>🔒</div>
            <h2 style={{ fontFamily: "'Instrument Serif',serif", fontSize: "24px", fontWeight: 400, color: c.gold, marginBottom: "8px" }}>{lockedOut ? "Access Denied" : "Enter PIN"}</h2>
            {lockedOut ? (
              <div>
                <p style={{ fontSize: "13px", color: c.red }}>Too many wrong attempts.</p>
                <p style={{ fontSize: "12px", color: c.dim, marginTop: "8px" }}>Contact admin.</p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: "12px", color: c.dimmer, marginBottom: "24px" }}>Restricted access</p>
                <input type="password" value={pinInput} onChange={e => { setPinInput(e.target.value); setPinError(""); }} onKeyDown={e => e.key === "Enter" && handleUnlock()} placeholder="Enter PIN" autoFocus style={{ width: "100%", padding: "14px", background: c.input, border: `1px solid ${pinError ? c.red : c.border2}`, color: c.gold, fontFamily: "monospace", fontSize: "18px", borderRadius: "4px", textAlign: "center", letterSpacing: "8px", outline: "none", marginBottom: "12px" }} />
                {pinError && <div style={{ fontSize: "12px", color: c.red, marginBottom: "12px" }}>{pinError}</div>}
                <button onClick={handleUnlock} style={{ width: "100%", padding: "12px", background: c.gold, color: c.btnText, border: "none", borderRadius: "4px", fontFamily: "monospace", fontWeight: 700, letterSpacing: "1px", cursor: "pointer" }}>UNLOCK</button>
              </div>
            )}
          </div>
        </div>
      ) : (<>

      {/* HEADER */}
      <div style={{ marginBottom: "16px", borderBottom: `1px solid ${c.border}`, paddingBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ fontFamily: "'Instrument Serif',serif", fontSize: "28px", fontWeight: 400, color: c.gold, margin: 0 }}>GT Cross-Trade</h1>
            <div style={{ fontSize: "10px", color: c.dimmer, marginTop: "4px", letterSpacing: "2px", textTransform: "uppercase" }}>UAE ← Indonesia · {fxUpdated ? `FX updated ${fxUpdated.toLocaleDateString()}` : "FX: defaults"}</div>
          </div>
          <div style={{ display: "flex", gap: "12px", fontSize: "11px", alignItems: "flex-end" }}>
            <div style={{ textAlign: "right" }}><div style={{ color: c.dimmer }}>LOOKUPS</div><div style={{ color: c.gold, fontSize: "16px", fontWeight: 700 }}>{history.length}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ color: c.dimmer }}>CANDIDATES</div><div style={{ color: c.green, fontSize: "16px", fontWeight: 700 }}>{candidates.length}</div></div>
            <button onClick={toggleTheme} style={{ background: c.surface2, border: `1px solid ${c.border2}`, color: c.dim, fontFamily: "monospace", fontSize: "10px", padding: "6px 10px", borderRadius: "4px", cursor: "pointer" }}>{dark ? "☀" : "🌙"}</button>
          </div>
        </div>
      </div>

      {/* API KEY */}
      <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "12px", padding: "8px 12px", background: c.surface2, border: `1px solid ${c.border}`, borderRadius: "4px" }}>
        <span style={{ fontSize: "9px", color: c.dim, letterSpacing: "1px" }}>KEY</span>
        <input type={showKey ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-ant-..." style={{ ...inputStyle, flex: 1, padding: "4px 8px", fontSize: "11px" }} />
        <button onClick={() => setShowKey(!showKey)} style={{ ...btnSec, padding: "4px 8px", fontSize: "9px" }}>{showKey ? "HIDE" : "SHOW"}</button>
        {apiKeyStatus && <span style={{ fontSize: "10px", color: apiKeyStatus === "missing" ? c.red : c.green }}>✓</span>}
      </div>

      {/* MODE TABS */}
      <div style={{ display: "flex", gap: "2px", borderBottom: `1px solid ${c.border2}` }}>
        {[{ id: "auto", label: "⚡ LOOKUP" }, { id: "history", label: "📋 HISTORY" }, { id: "bulk", label: "📦 BULK" }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{
            padding: "10px 18px",
            background: mode === m.id ? c.surface : "transparent",
            color: mode === m.id ? c.gold : c.dimmest,
            border: mode === m.id ? `1px solid ${c.border2}` : "1px solid transparent",
            borderBottom: mode === m.id ? `1px solid ${c.surface}` : `1px solid ${c.border2}`,
            cursor: "pointer", fontFamily: "monospace", fontSize: "11px",
            position: "relative", top: "1px", borderRadius: "4px 4px 0 0",
          }}>
            {m.label}
            {m.id === "history" && history.length > 0 && <span style={{ marginLeft: 4, color: c.green, fontSize: 9 }}>[{history.length}]</span>}
          </button>
        ))}
      </div>

      {/* ══════════ AUTO LOOKUP ══════════ */}
      {mode === "auto" && (
        <div style={secStyle}>
          {/* URL Input */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && runDryRun()} placeholder="Paste full Amazon.ae or Noon product URL..." style={{ ...inputStyle, flex: 1, fontSize: "13px", padding: "12px 14px" }} />
            <button onClick={runDryRun} disabled={loading || !url.trim() || cooldown > 0} style={{ ...btnStyle, padding: "12px 20px", fontSize: "11px", opacity: loading || !url.trim() || cooldown > 0 ? 0.4 : 1, whiteSpace: "nowrap" }}>
              {cooldown > 0 ? `WAIT ${cooldown}s` : loading && !dryRunData ? "READING..." : "QUICK CHECK ~$0.02"}
            </button>
          </div>

          {/* Progress bar */}
          {loading && stage && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <Spinner /><span style={{ fontSize: "12px", color: c.gold }}>{stage}</span>
              </div>
              <div style={{ width: "100%", height: "3px", background: c.border, borderRadius: "2px" }}>
                <div style={{ width: `${progress}%`, height: "100%", background: c.gold, borderRadius: "2px", transition: "width 0.3s" }} />
              </div>
            </div>
          )}

          {autoError && (
            <div style={{ padding: "12px", background: dark ? "#3a1a1a" : "#FEF2F2", border: `1px solid ${c.red}44`, borderRadius: "4px", marginBottom: "12px", fontSize: "12px", color: c.red }}>
              ⚠ {autoError}
            </div>
          )}

          {/* Empty state */}
          {!loading && !dryRunData && !autoError && (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: "36px", marginBottom: "10px", opacity: 0.15 }}>⚡</div>
              <div style={{ fontSize: "12px", color: c.dim }}>Paste a product URL and click Quick Check</div>
              <div style={{ marginTop: "16px", display: "inline-block", padding: "14px 20px", background: c.surface2, border: `1px solid ${c.border}`, borderRadius: "6px", textAlign: "left", fontSize: "11px", lineHeight: 2 }}>
                <span style={{ color: c.green }}>① Quick Check</span> <span style={{ color: c.dimmer }}>— read + translate</span> <span style={{ color: c.dim }}>~$0.02</span><br />
                <span style={{ color: c.gold }}>② Indo Search &amp; Margins</span> <span style={{ color: c.dimmer }}>— Tokopedia + Shopee + cost analysis</span> <span style={{ color: c.dim }}>~$0.06-0.08</span>
              </div>
            </div>
          )}

          {/* RESULTS */}
          {dryRunData && (<div>
            {/* Product card */}
            <div style={{ padding: "14px", background: c.surface2, border: `1px solid ${c.border}`, borderRadius: "4px", marginBottom: "10px" }}>
              <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>
                UAE PRODUCT {dryRunData.url && <a href={dryRunData.url} target="_blank" style={{ color: c.dim, fontSize: "9px", marginLeft: "8px" }}>open link ↗</a>}
              </div>
              <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>{dryRunData.product_name}</div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", fontSize: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ color: c.dim, fontSize: "10px" }}>AED</span>
                  <input type="number" value={dryRunData.price_aed || ""} onChange={e => { const v = parseFloat(e.target.value) || 0; setDryRunData({ ...dryRunData, price_aed: v }); }} style={{ width: "80px", padding: "3px 6px", background: c.input, border: `1px solid ${!dryRunData.price_aed ? c.red : c.border2}`, color: c.gold, fontFamily: "monospace", fontSize: "14px", fontWeight: 700, borderRadius: "3px", outline: "none", textAlign: "right" }} />
                </div>
                {dryRunData.price_aed > 0 && <span style={{ color: c.dim }}>≈ {fmtIDR(dryRunData.price_aed * fx.AED_TO_IDR)}</span>}
                {dryRunData.price_aed > 0 && <span style={{ color: c.dimmer }}>≈ {fmtUSD(dryRunData.price_aed * fx.AEDUSD)}</span>}
                <Badge text={dryRunData.source || "Amazon.ae"} />
                <Badge text={dryRunData.category} color={c.green} bg={c.sectionBg} />
                {dryRunData.rating > 0 && <span style={{ color: c.darkGold }}>★ {dryRunData.rating}</span>}
              </div>
              {(!dryRunData.price_aed || dryRunData.price_aed === 0) && <div style={{ fontSize: "11px", color: c.darkGold, marginTop: "6px" }}>⚠ Price not detected — type the AED price from the product page above</div>}
            </div>

            {/* Translation + editable queries */}
            <div style={{ padding: "14px", background: c.surface2, border: `1px solid ${c.border}`, borderRadius: "4px", marginBottom: "10px" }}>
              <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>TRANSLATION</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "12px", marginBottom: "10px" }}>
                <div><span style={{ color: c.dim }}>EN:</span> {dryRunData.clean_name_en}</div>
                <div><span style={{ color: c.dim }}>ID:</span> <span style={{ color: c.gold, fontWeight: 600 }}>{dryRunData.clean_name_id}</span></div>
              </div>
              {!indoResults && (<div>
                <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px" }}>SEARCH QUERIES — edit or add before searching</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
                  {editableQueries.map((q, i) => (
                    <div key={i} style={{ display: "flex", gap: "4px" }}>
                      <input value={q} onChange={e => { const u = [...editableQueries]; u[i] = e.target.value; setEditableQueries(u); }} style={{ ...inputStyle, padding: "5px 8px", fontSize: "11px", flex: 1 }} />
                      <button onClick={() => setEditableQueries(editableQueries.filter((_, idx) => idx !== i))} style={{ background: "transparent", border: `1px solid ${c.red}44`, color: c.red, fontSize: "10px", padding: "4px 8px", borderRadius: "3px", cursor: "pointer" }}>✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  <input value={newQueryInput} onChange={e => setNewQueryInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newQueryInput.trim()) { setEditableQueries([...editableQueries, newQueryInput.trim()]); setNewQueryInput(""); } }} placeholder="Add keyword..." style={{ ...inputStyle, padding: "5px 8px", fontSize: "11px", flex: 1 }} />
                  <button onClick={() => { if (newQueryInput.trim()) { setEditableQueries([...editableQueries, newQueryInput.trim()]); setNewQueryInput(""); } }} style={{ ...btnSec, padding: "5px 12px", fontSize: "9px" }}>+ ADD</button>
                </div>
              </div>)}
            </div>

            {/* Search Indonesia button */}
            {!indoResults && !loading && (
              <div style={{ padding: "14px", background: c.surface2, border: `1px solid ${c.green}44`, borderRadius: "4px", marginBottom: "10px", textAlign: "center" }}>
                <button onClick={runIndoSearch} disabled={cooldown > 0 || editableQueries.filter(q => q.trim()).length === 0} style={{ ...btnGreen, padding: "12px 36px", fontSize: "12px", opacity: cooldown > 0 ? 0.4 : 1 }}>
                  {cooldown > 0 ? `⏳ WAIT ${cooldown}s` : "🔍 SEARCH INDONESIA + MARGINS — ~$0.06-0.08"}
                </button>
                <div style={{ fontSize: "9px", color: c.dimmer, marginTop: "6px" }}>Up to 3 search attempts with automatic retry</div>
              </div>
            )}

            {/* ══════════ 4 TOGGLE SECTIONS ══════════ */}
            {(uaeSimilar || indoResults || marginData) && (<div>

              {/* ① UAE MARKET */}
              <SectionToggle index={0} title="UAE Market — Similar Products" icon="🇦🇪" count={uaeSimilar?.similar?.length}>
                {!uaeSimilar && !loading && (
                  <div style={{ textAlign: "center", padding: "16px" }}>
                    <p style={{ fontSize: "11px", color: c.dimmer, marginBottom: "10px" }}>Find 8-10 similar products on Amazon.ae & Noon</p>
                    <button onClick={runUaeSimilar} disabled={cooldown > 0 || loading} style={{ ...btnSec, padding: "10px 24px", fontSize: "11px", opacity: cooldown > 0 ? 0.4 : 1 }}>
                      {cooldown > 0 ? `⏳ WAIT ${cooldown}s` : "🇦🇪 FIND SIMILAR UAE PRODUCTS — ~$0.08-0.10"}
                    </button>
                  </div>
                )}
                {uaeSimilar?.price_stats && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "12px" }}>
                    {[
                      { l: "LOWEST", v: uaeSimilar.price_stats.lowest_aed, c: c.green },
                      { l: "MEDIAN", v: uaeSimilar.price_stats.median_aed, c: c.gold },
                      { l: "AVERAGE", v: uaeSimilar.price_stats.average_aed, c: c.dim },
                      { l: "HIGHEST", v: uaeSimilar.price_stats.highest_aed, c: c.red },
                    ].map(s => (
                      <div key={s.l} style={{ padding: "8px", background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: "4px", textAlign: "center" }}>
                        <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "3px" }}>{s.l}</div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: s.c }}>{fmtAED(s.v)}</div>
                        <div style={{ fontSize: "9px", color: c.dimmest }}>{fmtIDR(s.v * fx.AED_TO_IDR)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {uaeSimilar?.similar?.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px solid ${c.border}`, fontSize: "11px" }}>
                    <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name} <span style={{ color: c.dimmest }}>· {r.source}</span></div>
                    <div style={{ color: c.gold, fontWeight: 700, marginLeft: "10px", whiteSpace: "nowrap" }}>{fmtAED(r.price_aed)} <span style={{ color: c.dimmest, fontWeight: 400 }}>({fmtIDR(r.price_aed * fx.AED_TO_IDR)})</span></div>
                  </div>
                ))}
              </SectionToggle>

              {/* ② INDONESIA MARKET */}
              <SectionToggle index={1} title="Indonesia Market — Tokopedia & Shopee" icon="🇮🇩" count={indoResults?.results?.length}>
                {/* Confidence indicator */}
                {indoResults?.confidence && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", marginBottom: "12px",
                    background: indoResults.confidence.level === "high" ? (dark ? "#0D2E1A" : "#E8F5EC")
                      : indoResults.confidence.level === "medium" ? (dark ? "#2A2210" : "#FDF8ED")
                      : (dark ? "#3a1a1a" : "#FEF2F2"),
                    border: `1px solid ${indoResults.confidence.level === "high" ? c.green + "44"
                      : indoResults.confidence.level === "medium" ? c.gold + "44"
                      : c.red + "44"}`,
                    borderRadius: "4px",
                  }}>
                    <div style={{
                      fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase",
                      color: indoResults.confidence.level === "high" ? c.green
                        : indoResults.confidence.level === "medium" ? c.gold : c.red,
                    }}>
                      {indoResults.confidence.level === "high" ? "● HIGH" : indoResults.confidence.level === "medium" ? "● MEDIUM" : "● LOW"} CONFIDENCE
                    </div>
                    <div style={{ fontSize: "10px", color: c.dim, flex: 1 }}>
                      {indoResults.confidence.validCount} valid prices
                      {indoResults.confidence.withSold > 0 && ` · ${indoResults.confidence.withSold} with sold data`}
                      {indoResults.confidence.spread && ` · ${indoResults.confidence.spread.toFixed(1)}× spread`}
                    </div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: c.dim }}>{indoResults.confidence.score}/100</div>
                  </div>
                )}
                {/* Confidence flags */}
                {indoResults?.confidence?.flags?.length > 0 && (
                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "10px" }}>
                    {indoResults.confidence.flags.map((f, i) => (
                      <span key={i} style={{
                        display: "inline-block", padding: "2px 6px", borderRadius: "3px",
                        fontSize: "9px", fontFamily: "monospace",
                        background: dark ? "#2A2210" : "#FDF8ED",
                        color: c.darkGold,
                        border: `1px solid ${c.gold}33`,
                      }}>⚠ {f}</span>
                    ))}
                  </div>
                )}
                {indoResults?.price_stats && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "12px" }}>
                    {[
                      { l: "LOWEST", v: indoResults.price_stats.lowest_idr, c: c.green },
                      { l: "MEDIAN", v: indoResults.price_stats.median_idr, c: c.gold },
                      { l: "AVERAGE", v: indoResults.price_stats.average_idr, c: c.dim },
                      { l: "HIGHEST", v: indoResults.price_stats.highest_idr, c: c.red },
                    ].map(s => (
                      <div key={s.l} style={{ padding: "8px", background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: "4px", textAlign: "center" }}>
                        <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "3px" }}>{s.l}</div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: s.c }}>{fmtIDR(s.v)}</div>
                        <div style={{ fontSize: "9px", color: c.dimmest }}>{fmtAED(s.v * fx.IDR_TO_AED)}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2.5fr 0.6fr 0.7fr 0.5fr", gap: "4px", padding: "5px 0", borderBottom: `1px solid ${c.border2}`, fontSize: "9px", color: c.dimmer, letterSpacing: "0.5px", textTransform: "uppercase", position: "sticky", top: 0, background: c.surface, zIndex: 1 }}>
                    <div>Product · Seller</div><div>Source</div><div style={{ textAlign: "right" }}>Price</div><div style={{ textAlign: "right" }}>Sold</div>
                  </div>
                  {indoResults?.results?.map((r, i) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "2.5fr 0.6fr 0.7fr 0.5fr", gap: "4px",
                      padding: "6px 0", borderBottom: `1px solid ${c.border}`, fontSize: "11px", alignItems: "center",
                      background: r.sold && r.sold.trim() ? (dark ? "#0D1F1522" : "#E8F5EC44") : "transparent",
                    }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.url ? <a href={r.url} target="_blank" rel="noopener" style={{ color: c.text, textDecoration: "none" }} title={r.name}>{r.name}</a> : r.name}
                        {r.seller && <span style={{ color: c.dimmest }}> · {r.seller}</span>}
                      </div>
                      <div><Badge text={r.source || "Tokopedia"} color={r.source === "Shopee" ? "#EE4D2D" : c.green} bg={r.source === "Shopee" ? (dark ? "#2D1508" : "#FFF0EC") : (dark ? "#0D2E1A" : "#E8F5EC")} /></div>
                      <div style={{ color: c.gold, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>{fmtIDR(r.price_idr)}</div>
                      <div style={{ color: r.sold ? c.darkGold : c.dimmest, textAlign: "right", fontSize: "10px" }}>{r.sold || "—"}</div>
                    </div>
                  ))}
                </div>
                {indoResults?.search_notes && <div style={{ marginTop: "8px", fontSize: "10px", color: c.dimmer, fontStyle: "italic" }}>{indoResults.search_notes}</div>}
              </SectionToggle>

              {/* ③ MARGIN ANALYSIS */}
              {marginData && (
                <SectionToggle index={2} title="Margin Analysis" icon="📊">
                  {/* Qty selector */}
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "10px", color: c.dim }}>CALCULATE FOR:</span>
                    {[{ id: "unit", label: "Per Unit" }, { id: "custom", label: "Custom Qty" }, { id: "container", label: "Per Container (20ft)" }].map(m => (
                      <button key={m.id} onClick={() => setQtyMode(m.id)} style={{ padding: "4px 10px", background: qtyMode === m.id ? c.gold : "transparent", color: qtyMode === m.id ? c.btnText : c.dim, border: `1px solid ${qtyMode === m.id ? c.gold : c.border2}`, borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "monospace" }}>{m.label}</button>
                    ))}
                    {qtyMode === "custom" && <input type="number" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} min="1" style={{ ...inputStyle, width: "80px", padding: "4px 8px", fontSize: "11px", textAlign: "center" }} />}
                    <span style={{ fontSize: "10px", color: c.dimmer }}>× {getQty()} units</span>
                  </div>

                  {/* Margin boxes */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                    {[
                      { l: "BEST", m: marginData.margins.best },
                      { l: "MEDIAN", m: marginData.margins.median },
                      { l: "WORST", m: marginData.margins.worst },
                    ].map(x => (
                      <div key={x.l} style={{ padding: "12px", background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: "4px", textAlign: "center" }}>
                        <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "4px" }}>{x.l}</div>
                        <div style={{ fontSize: "24px", fontWeight: 700, color: marginColor(x.m.margin) }}>{x.m.margin.toFixed(1)}%</div>
                      </div>
                    ))}
                  </div>

                  {/* Cost breakdown table */}
                  <div style={{ background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: "4px", padding: "12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "10px", padding: "4px 0", borderBottom: `1px solid ${c.border2}`, color: c.dimmer, fontWeight: 700 }}>
                      <div>COST ITEM</div><div>USD</div><div>AED</div><div>IDR</div>
                    </div>
                    {(() => {
                      const m = marginData.margins.median;
                      const q = getQty();
                      return (<>
                        <PriceRow label={`UAE Sell Price ×${q}`} usd={m.uaeUSD * q} aed={m.uaeAED * q} idr={m.uaeIDR * q} />
                        <PriceRow label={`Indo Source ×${q}`} usd={m.indoUSD * q} aed={m.indoAED * q} idr={m.indoIDR * q} />
                        <PriceRow label={`Air Freight ×${q}`} usd={m.freightUSD * q} aed={m.freightAED * q} idr={m.freightIDR * q} />
                        <PriceRow label={`Customs 5% ×${q}`} usd={m.dutyUSD * q} aed={m.dutyAED * q} idr={m.dutyIDR * q} />
                        <PriceRow label={`Last Mile ×${q}`} usd={m.lastMileUSD * q} aed={m.lastMileAED * q} idr={m.lastMileIDR * q} />
                        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "6px 0", fontWeight: 700 }}>
                          <div style={{ color: c.red }}>TOTAL COST</div>
                          <div style={{ color: c.red }}>{fmtUSD(m.totalUSD * q)}</div>
                          <div style={{ color: c.red }}>{fmtAED(m.totalAED * q)}</div>
                          <div style={{ color: c.red }}>{fmtIDR(m.totalIDR * q)}</div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "6px 0", fontWeight: 700 }}>
                          <div style={{ color: c.green }}>PROFIT</div>
                          <div style={{ color: c.green }}>{fmtUSD((m.uaeUSD - m.totalUSD) * q)}</div>
                          <div style={{ color: c.green }}>{fmtAED((m.uaeAED - m.totalAED) * q)}</div>
                          <div style={{ color: c.green }}>{fmtIDR((m.uaeIDR - m.totalIDR) * q)}</div>
                        </div>
                      </>);
                    })()}
                  </div>

                  {/* Verdict */}
                  <div style={{
                    marginTop: "10px", padding: "8px", borderRadius: "4px", textAlign: "center",
                    fontSize: "12px", fontWeight: 600,
                    background: marginData.margins.median.margin >= MARGIN_THRESHOLD.candidate ? STATUS_COLORS.Candidate.bg : marginData.margins.median.margin >= MARGIN_THRESHOLD.borderline ? STATUS_COLORS.Active.bg : STATUS_COLORS.Rejected.bg,
                    border: `1px solid ${marginData.margins.median.margin >= MARGIN_THRESHOLD.candidate ? STATUS_COLORS.Candidate.border : marginData.margins.median.margin >= MARGIN_THRESHOLD.borderline ? STATUS_COLORS.Active.border : STATUS_COLORS.Rejected.border}`,
                    color: marginColor(marginData.margins.median.margin),
                  }}>
                    {marginData.margins.median.margin >= MARGIN_THRESHOLD.candidate ? "✓ CANDIDATE" : marginData.margins.median.margin >= MARGIN_THRESHOLD.borderline ? "○ BORDERLINE" : "✗ LOW MARGIN"} — {marginData.margins.median.margin.toFixed(1)}%
                    {marginData.confidence && (
                      <span style={{
                        marginLeft: "8px", fontSize: "9px", fontWeight: 400, opacity: 0.8,
                        padding: "1px 6px", borderRadius: "3px",
                        background: marginData.confidence.level === "high" ? c.green + "22"
                          : marginData.confidence.level === "medium" ? c.gold + "22" : c.red + "22",
                        color: marginData.confidence.level === "high" ? c.green
                          : marginData.confidence.level === "medium" ? c.gold : c.red,
                      }}>
                        {marginData.confidence.level.toUpperCase()} CONF ({marginData.confidence.score})
                      </span>
                    )}
                  </div>
                  {/* Low confidence warning */}
                  {marginData.confidence?.level === "low" && (
                    <div style={{ marginTop: "8px", padding: "8px 10px", background: dark ? "#2A1A10" : "#FEF2F2", border: `1px solid ${c.red}33`, borderRadius: "4px", fontSize: "10px", color: c.red }}>
                      ⚠ Low confidence data — margins may be unreliable. Consider re-searching with simpler Bahasa keywords or verifying prices manually on Tokopedia/Shopee.
                    </div>
                  )}
                </SectionToggle>
              )}

              {/* ④ LOGISTICS */}
              <SectionToggle index={3} title="Logistics — Freight & Transit" icon="🚢">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <div style={{ fontSize: "10px", color: c.dimmer }}>
                    {freight.source === "live" ? `Live rates · Updated ${new Date(freight.updated).toLocaleDateString()}` : "Using default estimates"}
                    {freight.updated && Date.now() - freight.updated > 604800000 && <span style={{ color: c.darkGold }}> · ⚠ Over 7 days old</span>}
                  </div>
                  <button onClick={fetchFreightRates} disabled={freightLoading} style={{ ...btnSec, padding: "5px 12px", fontSize: "9px", opacity: freightLoading ? 0.5 : 1 }}>
                    {freightLoading ? "Fetching..." : freight.source === "live" ? "🔄 Refresh" : "📡 Fetch Live Rates ~$0.08"}
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                  {/* Air */}
                  <div style={{ padding: "12px", background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: "4px" }}>
                    <div style={{ fontSize: "10px", color: c.gold, fontWeight: 700, marginBottom: "8px" }}>✈ AIR FREIGHT</div>
                    <div style={{ fontSize: "12px", lineHeight: 1.8 }}>
                      <div><span style={{ color: c.dim }}>Rate:</span> <span style={{ color: c.gold, fontWeight: 700 }}>${freight.air?.rate_per_kg || 4}/kg</span></div>
                      <div><span style={{ color: c.dim }}>Min:</span> {freight.air?.min_kg || 100} kg</div>
                      <div style={{ marginTop: "6px", fontSize: "10px", color: c.dimmer, borderTop: `1px solid ${c.border}`, paddingTop: "6px" }}>
                        <div>Port→Port: {freight.air?.transit?.port_port || "3-5 days"}</div>
                        <div>Port→Door: {freight.air?.transit?.port_door || "5-7 days"}</div>
                        <div>Door→Door: {freight.air?.transit?.door_door || "7-10 days"}</div>
                      </div>
                    </div>
                  </div>
                  {/* Ocean */}
                  <div style={{ padding: "12px", background: c.cardBg, border: `1px solid ${c.border}`, borderRadius: "4px" }}>
                    <div style={{ fontSize: "10px", color: c.gold, fontWeight: 700, marginBottom: "8px" }}>🚢 OCEAN FREIGHT</div>
                    <div style={{ fontSize: "12px", lineHeight: 1.8 }}>
                      <div><span style={{ color: c.dim }}>20ft:</span> <span style={{ color: c.gold, fontWeight: 700 }}>${freight.ocean?.rate_20ft || 800}</span></div>
                      <div><span style={{ color: c.dim }}>40ft:</span> ${freight.ocean?.rate_40ft || 1400}</div>
                      <div><span style={{ color: c.dim }}>Per CBM:</span> ${freight.ocean?.rate_per_cbm || 45}</div>
                      <div style={{ marginTop: "6px", fontSize: "10px", color: c.dimmer, borderTop: `1px solid ${c.border}`, paddingTop: "6px" }}>
                        <div>Port→Port: {freight.ocean?.transit?.port_port || "14-18 days"}</div>
                        <div>Port→Door: {freight.ocean?.transit?.port_door || "18-25 days"}</div>
                        <div>Door→Door: {freight.ocean?.transit?.door_door || "21-30 days"}</div>
                      </div>
                    </div>
                  </div>
                </div>
                {freight.notes && <div style={{ fontSize: "10px", color: c.dimmer, fontStyle: "italic" }}>{freight.notes}</div>}
              </SectionToggle>

            </div>)}

            {/* Actions bar */}
            {(indoResults || autoError) && !loading && (
              <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                <button onClick={resetLookup} style={{ ...btnSec, padding: "8px 20px", fontSize: "10px" }}>← NEW LOOKUP</button>
                {marginData && <button onClick={exportPDF} style={{ ...btnSec, padding: "8px 16px", fontSize: "10px" }}>📄 EXPORT PDF</button>}
                {marginData && <button onClick={exportCurrentCSV} style={{ ...btnSec, padding: "8px 16px", fontSize: "10px" }}>📊 EXPORT CSV</button>}
              </div>
            )}
          </div>)}
        </div>
      )}

      {/* ══════════ HISTORY ══════════ */}
      {mode === "history" && (
        <div style={secStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "6px" }}>
            <span style={{ fontSize: "10px", color: c.dim, letterSpacing: "1px" }}>{history.length} LOOKUPS</span>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button style={btnSec} onClick={exportHistory}>QUICK CSV</button>
              <button style={btnSec} onClick={exportStructuredCSV}>📊 FULL CSV (pivot-ready)</button>
              <button style={{ ...btnSec, color: c.red, borderColor: c.red }} onClick={() => { setHistory([]); try { localStorage.removeItem("arb-auto-history"); } catch {} }}>CLEAR</button>
            </div>
          </div>
          {!history.length ? (
            <div style={{ textAlign: "center", padding: "40px", color: c.dimmer }}>No lookups yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "550px", overflowY: "auto" }}>
              {history.map((h, i) => {
                const m = h.margins?.median?.margin || 0;
                const sc = STATUS_COLORS[h.status] || STATUS_COLORS.Candidate;
                return (
                  <div key={i} style={{ padding: "10px 12px", background: c.surface2, border: `1px solid ${sc.border}`, borderRadius: "4px", borderLeft: `3px solid ${sc.text}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "3px" }}>{h.uaeProduct?.product_name}</div>
                        <div style={{ fontSize: "10px", color: c.dim, marginBottom: "3px" }}>{h.normalized?.clean_name_id}</div>
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                          <Badge text={`AED ${h.uaeProduct?.price_aed}`} color={c.gold} bg={c.surface} />
                          <Badge text={fmtIDR(h.medianPriceIDR)} color={c.green} bg={c.surface} />
                          <Badge text={h.normalized?.category || ""} color={c.dim} bg={c.surface} />
                          <span style={{ fontSize: "9px", color: c.dimmest }}>{h.timestamp?.slice(0, 10)}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", marginLeft: "10px" }}>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: marginColor(m) }}>{m.toFixed(1)}%</div>
                        <select value={h.status} onChange={e => updateHistoryStatus(i, e.target.value)} style={{ padding: "2px 4px", background: sc.bg, border: `1px solid ${sc.border}`, color: sc.text, fontFamily: "monospace", fontSize: "9px", borderRadius: "3px", marginTop: "2px" }}>
                          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════ BULK ══════════ */}
      {mode === "bulk" && (
        <div style={secStyle}>
          <div style={{ display: "flex", gap: "2px", marginBottom: "14px", borderBottom: `1px solid ${c.border}` }}>
            {["① UAE", "② Norm", "③ Indo", "④ Calc", "⑤ DB"].map((l, i) => (
              <button key={i} onClick={() => setBulkTab(i)} style={{
                padding: "6px 12px",
                background: bulkTab === i ? c.surface2 : "transparent",
                color: bulkTab === i ? c.gold : c.dimmest,
                border: "none", cursor: "pointer", fontFamily: "monospace", fontSize: "10px",
                borderBottom: bulkTab === i ? `2px solid ${c.gold}` : "2px solid transparent",
              }}>{l}</button>
            ))}
          </div>

          {bulkTab === 0 && (
            <div>
              <input type="file" ref={fileRef} accept=".csv" style={{ display: "none" }} onChange={e => e.target.files[0] && handleUAEUpload(e.target.files[0])} />
              {!uaeProducts.length
                ? dropZone(false, handleUAEUpload, () => fileRef.current?.click(), "Drop UAE CSV")
                : (<div>
                    <span style={{ fontSize: "11px", color: c.green }}>✓ {uaeProducts.length}</span>
                    <button style={{ ...btnStyle, marginTop: "12px" }} onClick={() => setBulkTab(1)}>Next →</button>
                  </div>)
              }
            </div>
          )}

          {bulkTab === 1 && (
            <div>
              {!uaeProducts.length
                ? <div style={{ color: c.dimmer, textAlign: "center", padding: "40px" }}>Upload first</div>
                : (<div>
                    <button style={{ ...btnStyle, opacity: normalizing || !apiKey ? 0.5 : 1 }} onClick={runNormalization} disabled={normalizing || !apiKey}>
                      {normalizing ? `${normProgress.toFixed(0)}%` : `Normalize ${uaeProducts.length}`}
                    </button>
                    {normalized.length > 0 && <button style={{ ...btnStyle, marginTop: "12px" }} onClick={() => setBulkTab(2)}>Next →</button>}
                  </div>)
              }
            </div>
          )}

          {bulkTab === 2 && (
            <div>
              <input type="file" ref={indoFileRef} accept=".csv" style={{ display: "none" }} onChange={e => e.target.files[0] && handleIndoUpload(e.target.files[0])} />
              {!bulkIndoResults.length
                ? dropZone(true, handleIndoUpload, () => indoFileRef.current?.click(), "Drop Indo CSV")
                : (<div>
                    <span style={{ fontSize: "11px", color: c.green }}>✓ {bulkIndoResults.length}</span>
                    <button style={{ ...btnStyle, marginTop: "12px" }} onClick={() => setBulkTab(3)}>Next →</button>
                  </div>)
              }
            </div>
          )}

          {bulkTab === 3 && (
            <div>
              <button
                style={{ ...btnStyle, opacity: uaeProducts.length && bulkIndoResults.length ? 1 : 0.3 }}
                onClick={runMarginCalc}
                disabled={!uaeProducts.length || !bulkIndoResults.length}
              >
                Calculate Margins
              </button>
            </div>
          )}

          {bulkTab === 4 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                <span style={{ fontSize: "10px", color: c.dim }}>{database.length} products</span>
                <button style={btnSec} onClick={() => {
                  const h = ["Name", "Bahasa", "AED", "IDR", "Margin%", "Status"];
                  const r = database.map(p => [
                    `"${p.nameEn}"`, `"${p.nameId}"`, p.uaePriceAED, p.indoPriceIDR,
                    p.grossMarginPct.toFixed(1), p.status,
                  ].join(","));
                  const b = new Blob([[h.join(","), ...r].join("\n")], { type: "text/csv" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(b);
                  a.download = "bulk.csv";
                  a.click();
                }}>EXPORT</button>
              </div>
              {database.sort((a, b) => b.grossMarginPct - a.grossMarginPct).map(p => {
                const sc = STATUS_COLORS[p.status] || STATUS_COLORS.Candidate;
                return (
                  <div key={p.id} style={{
                    padding: "8px 10px", background: c.surface2,
                    border: `1px solid ${sc.border}`, borderRadius: "4px",
                    borderLeft: `3px solid ${sc.text}`, marginBottom: "4px",
                    display: "flex", justifyContent: "space-between",
                  }}>
                    <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "11px" }}>
                      {p.nameEn} <span style={{ color: c.dim }}>AED {p.uaePriceAED.toFixed(0)}</span>
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: marginColor(p.grossMarginPct), marginLeft: "10px" }}>
                      {p.grossMarginPct.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      </>)}
    </div>
  );
}
import { useState, useEffect, useCallback, useRef } from "react";
// ══════════ SUPABASE CONFIG — FILL THESE IN ══════════
const SUPABASE_URL = "https://cqpxzxafavqflnrilgjh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_f4N-v3Gs7qJsPW4jUe_fzw_u81VVIg3";
// ══════════ CONSTANTS ══════════
const DEFAULT_FX = {
  AEDUSD: 0.2723, IDRUSD: 0.0000613,
  AED_TO_IDR: 0.2723 / 0.0000613,
  IDR_TO_AED: 0.0000613 / 0.2723,
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
const MAX_HISTORY = 2000;
const FX_CACHE_MS = 86400000;

// ══════════ HELPERS ══════════
function marginColor(m) {
  if (isNaN(m)) return "#f87171";
  return m >= MARGIN_THRESHOLD.candidate ? "#2EAA5A" : m >= MARGIN_THRESHOLD.borderline ? "#D4A843" : "#f87171";
}
function fmtIDR(n) { return n != null && !isNaN(n) ? "IDR " + Math.round(n).toLocaleString() : "\u2014"; }
function fmtAED(n) { return n != null && !isNaN(n) ? "AED " + n.toFixed(2) : "\u2014"; }
function fmtUSD(n) { return n != null && !isNaN(n) ? "$" + n.toFixed(2) : "\u2014"; }
function escapeHtml(unsafe) {
  if (!unsafe) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ══════════ IDR PRICE SANITIZER ══════════
function sanitizeIDR(price) {
  if (typeof price === "string") {
    const cleaned = price.replace(/^[Rr]p.?\s*/, "").replace(/\./g, "").replace(/,/g, "").trim();
    price = parseInt(cleaned, 10) || 0;
  }
  if (typeof price !== "number" || isNaN(price)) return 0;
  if (price > 0 && price < 500) price = Math.round(price * 1000);
  if (price > 0 && price < 1000) price = Math.round(price * 1000);
  return Math.round(price);
}

// ══════════ CONFIDENCE SCORER ══════════
function computeConfidence(results, priceStats) {
  const validPrices = results.filter(r => (r.price_idr || 0) >= 1000);
  const totalResults = results.length;
  const withSold = results.filter(r => r.sold && r.sold.trim() && !/^-|^\u2014/.test(r.sold)).length;
  const spread = priceStats.highest_idr && priceStats.lowest_idr > 0
    ? priceStats.highest_idr / priceStats.lowest_idr : 999;
  let score = 0;
  let flags = [];
  if (validPrices.length >= 10) score += 40;
  else if (validPrices.length >= 5) score += 30;
  else if (validPrices.length >= 3) score += 20;
  else { score += 5; flags.push("Few valid prices"); }
  if (spread <= 3) score += 30;
  else if (spread <= 5) score += 20;
  else if (spread <= 10) score += 10;
  else { score += 0; flags.push("Wide price spread (" + spread.toFixed(0) + "\u00d7)"); }
  if (withSold >= 5) score += 20;
  else if (withSold >= 2) score += 10;
  else { score += 0; flags.push("No sold data"); }
  const discardRate = totalResults > 0 ? (totalResults - validPrices.length) / totalResults : 1;
  if (discardRate <= 0.1) score += 10;
  else if (discardRate <= 0.3) score += 5;
  else { score += 0; flags.push(Math.round(discardRate * 100) + "% prices discarded"); }
  const level = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
  return { score, level, flags, validCount: validPrices.length, totalCount: totalResults, withSold, spread: spread < 999 ? spread : null };
}

// ══════════ CSV PARSER ══════════
function parseCSV(text) {
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
          if (i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ",") { vals.push(cur.trim()); cur = ""; }
        else cur += ch;
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

// ══════════ PERSISTENT STORAGE LAYER ══════════
const supabaseReady = SUPABASE_URL !== "https://YOUR-PROJECT-ID.supabase.co" && SUPABASE_ANON_KEY !== "eyJ...your-anon-key-here...";

async function supabaseGet(key) {
  if (!supabaseReady) return null;
  const res = await fetch(
    SUPABASE_URL + "/rest/v1/kv_store?key=eq." + encodeURIComponent(key) + "&select=value",
    { headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY } }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  if (!rows || rows.length === 0) return null;
  return JSON.parse(rows[0].value);
}

async function supabaseSet(key, val) {
  if (!supabaseReady) return false;
  const res = await fetch(SUPABASE_URL + "/rest/v1/kv_store", {
    method: "POST",
    headers: {
      "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY,
      "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify({ key, value: JSON.stringify(val), updated_at: new Date().toISOString() }),
  });
  return res.ok;
}

async function supabaseDel(key) {
  if (!supabaseReady) return;
  await fetch(SUPABASE_URL + "/rest/v1/kv_store?key=eq." + encodeURIComponent(key), {
    method: "DELETE",
    headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY },
  });
}

async function storeGet(key) {
  try {
    const val = await supabaseGet(key);
    if (val !== null) {
      try { localStorage.setItem("gt:" + key, JSON.stringify(val)); } catch {}
      return val;
    }
  } catch (e) { console.warn("Supabase get failed:", e.message); }
  try { const v = localStorage.getItem("gt:" + key); return v ? JSON.parse(v) : null; } catch { return null; }
}

async function storeSet(key, val) {
  try { localStorage.setItem("gt:" + key, JSON.stringify(val)); } catch {}
  try { return await supabaseSet(key, val); } catch (e) { console.warn("Supabase set failed:", e.message); return false; }
}

async function storeDel(key) {
  try { localStorage.removeItem("gt:" + key); } catch {}
  try { await supabaseDel(key); } catch {}
}

async function loadHistory(pin) {
  try {
    const data = await storeGet(pin + ":history");
    if (data && Array.isArray(data) && data.length > 0) return data.map(expandEntry);
    try {
      const metaRaw = localStorage.getItem("gt:" + pin + ":meta");
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        if (meta && meta.shardCount) {
          const all = [];
          for (let i = 0; i < meta.shardCount; i++) {
            const shardRaw = localStorage.getItem("gt:" + pin + ":history:" + i);
            if (shardRaw) { const shard = JSON.parse(shardRaw); if (Array.isArray(shard)) all.push(...shard); }
          }
          if (all.length > 0) {
            console.log("Migrating " + all.length + " entries from sharded format...");
            await storeSet(pin + ":history", all);
            for (let i = 0; i < meta.shardCount; i++) localStorage.removeItem("gt:" + pin + ":history:" + i);
            localStorage.removeItem("gt:" + pin + ":meta");
            return all.map(expandEntry);
          }
        }
      }
    } catch {}
    return [];
  } catch (e) { console.warn("loadHistory failed:", e); return []; }
}

async function saveHistory(pin, history) {
  try {
    const compressed = history.map(compressEntry);
    return await storeSet(pin + ":history", compressed);
  } catch (e) { console.warn("saveHistory failed:", e); return false; }
}

function compressEntry(h) {
  const mm = h.margins?.median || {};
  return {
    pn: h.uaeProduct?.product_name || "",
    pid: h.normalized?.clean_name_id || h.uaeProduct?.clean_name_id || "",
    pen: h.uaeProduct?.clean_name_en || h.normalized?.clean_name_en || "",
    br: h.uaeProduct?.brand || "",
    cat: h.normalized?.category || h.uaeProduct?.category || "",
    wc: h.weightClass || "medium",
    src: h.uaeProduct?.source || "",
    url: h.uaeProduct?.url || "",
    pa: h.uaeProduct?.price_aed || 0,
    ir: (h.indoResults?.results || []).slice(0, 50).map(r => ({
      n: r.name || "",
      p: r.price_idr || 0,
      s: r.source === "Shopee" ? "S" : "T",
      sl: r.seller || "",
      sd: r.sold || "",
    })),
    lo: h.lowestPriceIDR || h.indoResults?.price_stats?.lowest_idr || 0,
    md: h.medianPriceIDR || h.indoResults?.price_stats?.median_idr || 0,
    hi: h.highestPriceIDR || h.indoResults?.price_stats?.highest_idr || 0,
    nr: h.indoResults?.price_stats?.num_results || 0,
    mb: h.margins?.best?.margin || 0,
    mm: h.margins?.median?.margin || 0,
    mw: h.margins?.worst?.margin || 0,
    mc: {
      uU: mm.uaeUSD || 0, uA: mm.uaeAED || 0, uI: mm.uaeIDR || 0,
      iU: mm.indoUSD || 0, iA: mm.indoAED || 0, iI: mm.indoIDR || 0,
      fU: mm.freightUSD || 0, fA: mm.freightAED || 0, fI: mm.freightIDR || 0,
      dU: mm.dutyUSD || 0, dA: mm.dutyAED || 0, dI: mm.dutyIDR || 0,
      lU: mm.lastMileUSD || 0, lA: mm.lastMileAED || 0, lI: mm.lastMileIDR || 0,
      tU: mm.totalUSD || 0, tA: mm.totalAED || 0, tI: mm.totalIDR || 0,
    },
    cs: h.confidence?.score || 0,
    cl: h.confidence?.level || "low",
    cf: h.confidence?.flags || [],
    st: h.status || "",
    ts: h.timestamp || "",
    ap: h.source === "apify" ? 1 : 0,
  };
}

function expandEntry(c) {
  if (c.uaeProduct) return c;
  const mc = c.mc || {};
  return {
    uaeProduct: {
      product_name: c.pn, clean_name_en: c.pen, clean_name_id: c.pid,
      brand: c.br, category: c.cat, weight_class: c.wc,
      source: c.src, url: c.url, price_aed: c.pa,
    },
    normalized: { clean_name_id: c.pid, clean_name_en: c.pen, category: c.cat, weight_class: c.wc },
    indoResults: {
      results: (c.ir || []).map(r => ({
        name: r.n, price_idr: r.p,
        source: r.s === "S" ? "Shopee" : "Tokopedia",
        seller: r.sl, sold: r.sd, url: "",
      })),
      price_stats: { lowest_idr: c.lo, median_idr: c.md, highest_idr: c.hi, num_results: c.nr },
      confidence: { score: c.cs, level: c.cl, flags: c.cf },
    },
    margins: {
      best: { margin: c.mb },
      median: {
        margin: c.mm,
        uaeUSD: mc.uU, uaeAED: mc.uA, uaeIDR: mc.uI,
        indoUSD: mc.iU, indoAED: mc.iA, indoIDR: mc.iI,
        freightUSD: mc.fU, freightAED: mc.fA, freightIDR: mc.fI,
        dutyUSD: mc.dU, dutyAED: mc.dA, dutyIDR: mc.dI,
        lastMileUSD: mc.lU, lastMileAED: mc.lA, lastMileIDR: mc.lI,
        totalUSD: mc.tU, totalAED: mc.tA, totalIDR: mc.tI,
      },
      worst: { margin: c.mw },
    },
    confidence: { score: c.cs, level: c.cl, flags: c.cf },
    medianPriceIDR: c.md, lowestPriceIDR: c.lo, highestPriceIDR: c.hi,
    weightClass: c.wc, status: c.st, timestamp: c.ts,
    source: c.ap ? "apify" : "legacy",
  };
}

async function hashPin(pin) {
  const e = new TextEncoder().encode(pin + "arb-salt-2026");
  const b = await crypto.subtle.digest("SHA-256", e);
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join("");
}

const Badge = ({ text, color = "#2EAA5A", bg = "#0D2E1A" }) => (
  <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "3px", fontSize: "10px", fontFamily: "monospace", background: bg, color, border: "1px solid " + color + "33" }}>{text}</span>
);
const Spinner = () => (
  <div style={{ width: "14px", height: "14px", border: "2px solid #C9A84C", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
);

// ══════════ MAIN APP ══════════
export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [lockedOut, setLockedOut] = useState(false);
  const [pinHashes, setPinHashes] = useState({});
  const [storageReady, setStorageReady] = useState(false);
  const [dark, setDark] = useState(true);
  const toggleTheme = async () => {
    const n = !dark;
    setDark(n);
    await storeSet("global:theme", n ? "dark" : "light");
  };

  const [mode, setMode] = useState("auto");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState("");
  const [history, setHistory] = useState([]);
  const [fx, setFx] = useState(DEFAULT_FX);
  const [fxUpdated, setFxUpdated] = useState(null);
  const [freight, setFreight] = useState(DEFAULT_FREIGHT);
  const [freightLoading, setFreightLoading] = useState(false);

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
  // Wave status tracker
  const [waveStatus, setWaveStatus] = useState([]);

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

  const [scrapeMode, setScrapeMode] = useState("legacy");
  const [apifyKey, setApifyKey] = useState("");
  const [showApifyKey, setShowApifyKey] = useState(false);
  const [apifyStatus, setApifyStatus] = useState("");
  const [tokoActorId, setTokoActorId] = useState("voyager/tokopedia-scraper");
  const [shopeeActorId, setShopeeActorId] = useState("voyager/shopee-scraper");
  const [showActorConfig, setShowActorConfig] = useState(false);

  const [expandedHistoryIdx, setExpandedHistoryIdx] = useState(-1);
  const saveTimerRef = useRef(null);
  const apiKeyLoadedFromStorage = useRef(false);
  const apifyKeyLoadedFromStorage = useRef(false);
  const historyRef = useRef(history);
  historyRef.current = history;
  const currentPinRef = useRef(currentPin);
  currentPinRef.current = currentPin;

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

  useEffect(() => {
    (async () => {
      const h1 = await hashPin("766911");
      const h2 = await hashPin("240996");
      setPinHashes({ [h1]: "766911", [h2]: "240996" });
      const t = await storeGet("global:theme");
      if (t === "light") setDark(false);
    })();
  }, []);

  const handleUnlock = async () => {
    if (lockedOut || Object.keys(pinHashes).length === 0) return;
    const h = await hashPin(pinInput);
    const matchedPin = pinHashes[h];
    if (matchedPin) {
      setCurrentPin(matchedPin);
      setUnlocked(true);
      setPinError("");
      setPinInput("");
    } else {
      const n = attempts + 1;
      setAttempts(n);
      setPinInput("");
      if (n >= 5) setLockedOut(true);
      else setPinError("Wrong PIN (" + (5 - n) + " left)");
    }
  };

  useEffect(() => {
    if (!unlocked || !currentPin) return;
    setStorageReady(false);
    (async () => {
      try {
        const config = await storeGet(currentPin + ":config");
        if (config) {
          if (config.apiKey) { apiKeyLoadedFromStorage.current = true; setApiKey(config.apiKey); setApiKeyStatus("loaded"); }
          if (config.apifyKey) { apifyKeyLoadedFromStorage.current = true; setApifyKey(config.apifyKey); setApifyStatus("loaded"); }
          if (config.tokoActorId) setTokoActorId(config.tokoActorId);
          if (config.shopeeActorId) setShopeeActorId(config.shopeeActorId);
          if (config.scrapeMode) setScrapeMode(config.scrapeMode);
          if (config.freight) setFreight(config.freight);
        }
        const h = await loadHistory(currentPin);
        setHistory(h);
        const db = await storeGet(currentPin + ":database");
        if (db && Array.isArray(db)) setDatabase(db);
      } catch (e) {
        console.warn("Failed to load data:", e);
      }
      setStorageReady(true);
    })();
  }, [unlocked, currentPin]);

  const saveHistoryNow = useCallback(async (newHistory) => {
    if (!currentPinRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await saveHistory(currentPinRef.current, newHistory);
  }, []);

  const saveHistoryDebounced = useCallback(() => {
    if (!currentPinRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await saveHistory(currentPinRef.current, historyRef.current);
    }, 2000);
  }, []);
  useEffect(() => {
    if (!storageReady || !currentPin) return;
    saveHistoryDebounced();
  }, [history, storageReady, currentPin, saveHistoryDebounced]);

  useEffect(() => {
    if (!storageReady || !currentPin || database.length === 0) return;
    const t = setTimeout(() => storeSet(currentPin + ":database", database), 2000);
    return () => clearTimeout(t);
  }, [database, storageReady, currentPin]);

  const saveConfigDebounced = useCallback(() => {
    if (!currentPin || !storageReady) return;
    const t = setTimeout(async () => {
      await storeSet(currentPin + ":config", {
        apiKey, apifyKey, tokoActorId, shopeeActorId, scrapeMode,
        freight: freight.source === "live" ? freight : null,
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [currentPin, storageReady, apiKey, apifyKey, tokoActorId, shopeeActorId, scrapeMode, freight]);

  useEffect(() => {
    if (!storageReady || !currentPin) return;
    const cleanup = saveConfigDebounced();
    return cleanup;
  }, [saveConfigDebounced]);

  useEffect(() => {
    if (!apiKey || apiKey.length < 10 || !storageReady) return;
    if (apiKeyLoadedFromStorage.current) { apiKeyLoadedFromStorage.current = false; return; }
    setApiKeyStatus("saved");
    const t = setTimeout(() => setApiKeyStatus(""), 1500);
    return () => clearTimeout(t);
  }, [apiKey, storageReady]);

  useEffect(() => {
    if (!apifyKey || apifyKey.length < 5 || !storageReady) return;
    if (apifyKeyLoadedFromStorage.current) { apifyKeyLoadedFromStorage.current = false; return; }
    setApifyStatus("saved");
    const t = setTimeout(() => setApifyStatus(""), 1500);
    return () => clearTimeout(t);
  }, [apifyKey, storageReady]);

  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(x => x <= 1 ? 0 : x - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    if (!unlocked) return;
    (async () => {
      const cached = await storeGet("global:fx");
      if (cached && Date.now() - cached.ts < FX_CACHE_MS) {
        const base = cached.rates;
        const aedusd = base.AEDUSD || 0.2723;
        const idrusd = base.IDRUSD || 0.0000613;
        setFx({ AEDUSD: aedusd, IDRUSD: idrusd, AED_TO_IDR: aedusd / idrusd, IDR_TO_AED: idrusd / aedusd });
        setFxUpdated(new Date(cached.ts));
        return;
      }
      try {
        const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=AED,IDR");
        const d = await r.json();
        const aedusd = 1 / d.rates.AED;
        const idrusd = 1 / d.rates.IDR;
        const rates = { AEDUSD: aedusd, IDRUSD: idrusd, AED_TO_IDR: aedusd / idrusd, IDR_TO_AED: idrusd / aedusd };
        setFx(rates);
        setFxUpdated(new Date());
        await storeSet("global:fx", { rates, ts: Date.now() });
      } catch (e) { console.log("FX fetch failed, using defaults"); }
    })();
  }, [unlocked]);

  const callClaude = async (prompt, model, useSearch = false, retries = 2, maxTokens = 2048) => {
    const body = { 
      action: 'claude',
      data: {
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        tools: useSearch ? [{ type: "web_search_20250305", name: "web_search" }] : undefined
      }
    };
    const delay = useSearch ? 15000 : 8000;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const r = await fetch("https://trades-proxy.sadewoahmadm.workers.dev", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (r.status === 429) {
          if (attempt < retries) {
            setStage(s => s.replace(/ \(retry.*/, "") + " (retry in " + Math.round((attempt + 1) * delay / 1000) + "s...)");
            await wait((attempt + 1) * delay);
            continue;
          }
          throw new Error("Rate limited. Wait 30s and retry. No cost charged.");
        }
        if (!r.ok) {
          let d = "";
          try { const e = await r.json(); d = e.error?.message || ""; } catch {}
          throw new Error("API " + r.status + ": " + (d || "error"));
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
      if (s[i] === "{") { if (depth === 0) start = i; depth++; }
      if (s[i] === "}") { depth--; if (depth === 0 && start >= 0) { matches.push(s.substring(start, i + 1)); start = -1; } }
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
    } catch (e) { clearInterval(interval); setProgress(0); throw e; }
  };

  const fetchFreightRates = async () => {
    if (!apiKey) return;
    setFreightLoading(true);
    try {
      const result = await callClaude(
        'Search for current freight shipping rates from Indonesia (Jakarta/Surabaya) to UAE (Jebel Ali/Dubai) for both air and ocean freight in 2025-2026.\n\nReturn ONLY valid JSON:\n{"air":{"rate_per_kg":number,"min_kg":number,"transit":{"port_port":"X-Y days","port_door":"X-Y days","door_door":"X-Y days"}},"ocean":{"rate_20ft":number,"rate_40ft":number,"rate_per_cbm":number,"transit":{"port_port":"X-Y days","port_door":"X-Y days","door_door":"X-Y days"}},"source":"where found","notes":"market notes"}\nJSON only:',
        "claude-sonnet-4-20250514", true, 2, 4096);
      const data = parseJSON(result);
      const fr = { ...data, updated: Date.now(), source: "live" };
      setFreight(fr);
    } catch (e) { console.log("Freight fetch failed:", e); }
    setFreightLoading(false);
  };

  const runDryRun = async () => {
    const input = url.trim();
    if (!input) { setAutoError("Please enter a URL"); return; }
    if (!input.startsWith('http')) { setAutoError("Invalid URL: Must start with http"); return; }
    if (input.includes('"') || input.includes('{') || input.includes('<')) { setAutoError("Invalid characters in URL"); return; }
    const allowedDomains = ['amazon.ae', 'noon.com', 'noon.ae'];
    if (!allowedDomains.some(d => input.includes(d))) { setAutoError("Only Amazon.ae and Noon UAE allowed"); return; }
    if (!apiKey) { setApiKeyStatus("missing"); return; }
    if (input.includes("amzn.eu") || input.includes("amzn.to") || input.includes("a.co/")) {
      setAutoError("Shortened link. Open in browser first, copy full URL.");
      return;
    }
    setLoading(true); setAutoError(""); setDryRunData(null); setUaeSimilar(null);
    setIndoResults(null); setMarginData(null); setEditableQueries([]); setNewQueryInput(""); setActiveSection(0); setWaveStatus([]);

    const asinMatch = input.match(/\/dp\/([A-Z0-9]{10})/i) || input.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
    const asin = asinMatch ? asinMatch[1] : "";
    const isNoon = input.includes("noon.com");
    const marketplace = isNoon ? "Noon UAE" : "Amazon.ae";

    try {
      setStage("Searching for product... (~10s)");
      const rawInfo = await runWithProgress(() => callClaude(
        "I need to find the EXACT product details for this " + marketplace + " listing.\n\nURL: " + input + "\n" + (asin ? "ASIN/Product ID: " + asin + "\n" : "") + "\nDo these searches:\n1. Search: \"" + (asin ? asin + " amazon.ae" : input) + "\"\n2. Search: \"" + (asin ? asin + " price AED" : "") + "\"\n" + (isNoon ? "3. Search: the product URL on noon.com" : "3. Search the full product name if you find it") + "\n\nI MUST know:\n- The EXACT product name as shown on " + marketplace + "\n- The EXACT current price in AED\n- Brand name\n- Star rating and number of reviews\n- Key specs: size, material, weight, quantity/pack size, color\n\nIf you find the product, report ALL details. Include the price in AED.",
        "claude-haiku-4-5-20251001", true, 2, 4096), 12);

      setStage("Translating & formatting... (~5s)");
      await wait(2000);
      const formatted = await runWithProgress(() => callClaude(
        "You are a data formatting engine. Convert this product info to JSON.\n\nPRODUCT INFO FROM WEB SEARCH:\n" + rawInfo + "\n\nORIGINAL URL: " + input + "\nMARKETPLACE: " + marketplace + "\n" + (asin ? "ASIN: " + asin + "\n" : "") + "\nOutput ONLY this JSON:\n{\"product_name\":\"the exact full product name\",\"price_aed\":NUMBER,\"pack_quantity\":NUMBER,\"brand\":\"brand\",\"rating\":NUMBER,\"reviews\":NUMBER,\"source\":\"" + marketplace + "\",\"clean_name_en\":\"short generic English description\",\"clean_name_id\":\"Bahasa Indonesia translation\",\"category\":\"electronics/kitchen/beauty/fashion/home/toys/sports/baby/office/other\",\"weight_class\":\"light/medium/heavy\",\"key_specs\":\"specs\",\"search_queries_id\":[\"bahasa query 1\",\"bahasa query 2\",\"bahasa query 3\"],\"search_queries_en\":[\"english query 1\",\"english query 2\"]}\n\nCRITICAL RULES:\n- price_aed MUST be a number. If USD, multiply by 3.67.\n- pack_quantity MUST be an integer representing how many items are in the bundle/multipack (default to 1 if it's a single item).\n- search_queries_id MUST be Bahasa Indonesia\n- Generate 3-5 DIVERSE Bahasa queries\nJSON only:",
        "claude-haiku-4-5-20251001", false, 2, 2048), 6);

      let data;
      try { data = parseJSON(formatted); }
      catch (e) { throw new Error("Format failed. Try again."); }
      if (!data.product_name) throw new Error("Product name not found.");

      if (!data.price_aed || data.price_aed === 0) {
        const priceMatch = rawInfo.match(/AED\s*(\d+(?:\.\d+)?)/i) || rawInfo.match(/(\d+(?:\.\d+)?)\s*AED/i);
        if (priceMatch) data.price_aed = parseFloat(priceMatch[1]);
      }
      data.source = data.source || marketplace;
      data.url = input;
      setDryRunData(data);
      setEditableQueries([...(data.search_queries_id || [data.clean_name_id]), ...(data.search_queries_en || [])]);
      setStage("");
      if (!data.price_aed || data.price_aed === 0) setAutoError("Product found but price not detected. Enter it manually.");
    } catch (err) {
      setAutoError(err.message); setStage("");
      if (err.message.includes("429") || err.message.includes("Rate")) setCooldown(30);
    }
    setLoading(false);
  };

  // ══════════ 3-WAVE INDO SEARCH (FIXED) ══════════
  const runIndoSearch = async () => {
    if (!dryRunData || !apiKey) return;
    setLoading(true); setAutoError(""); setIndoResults(null); setMarginData(null); setWaveStatus([]);
    const allQueries = editableQueries.filter(q => q.trim());
    if (allQueries.length === 0) { setAutoError("Add at least one search query."); setLoading(false); return; }

    const bahasaQueries = allQueries.filter(q => /[^a-zA-Z0-9\s\-.]/.test(q) || /murah|terlaris|harga|bayi|kaki|wajan|anti|sabun|tas|baju|celana|sepatu|alat|mesin/i.test(q));
    const englishQueries = allQueries.filter(q => !bahasaQueries.includes(q));
    const mainBahasa = bahasaQueries[0] || allQueries[0];
    const mainEnglish = englishQueries[0] || dryRunData.clean_name_en || allQueries[0];

    // ── Per-platform search (IMPROVED) ──
    const doSearchPlatform = async (platform, queries, label) => {
      const isToko = platform === "Tokopedia";
      const site = isToko ? "tokopedia.com" : "shopee.co.id";

      // Multiple search strategies per platform
      const searchPrompts = [];
      // Strategy 1: Direct site search
      searchPrompts.push('"' + queries[0] + ' ' + site + '"');
      // Strategy 2: Platform name + product (works better for Shopee since Shopee blocks crawlers)
      searchPrompts.push('"' + queries[0] + ' ' + platform + ' Indonesia harga"');
      // Strategy 3: Different keyword if available
      if (queries[1]) searchPrompts.push('"' + queries[1] + ' ' + site + ' harga"');
      // Strategy 4: Brand + generic name on platform
      if (dryRunData.brand) searchPrompts.push('"' + dryRunData.brand + ' ' + (dryRunData.clean_name_id || queries[0]) + ' ' + platform + '"');
      // Strategy 5: English fallback for Shopee (Shopee indexes some English titles)
      if (!isToko && mainEnglish) searchPrompts.push('"' + mainEnglish + ' shopee indonesia price"');

      const searchLines = searchPrompts.slice(0, 5).map(q => '- Search: ' + q).join("\n");

      setStage(label + "Searching " + platform + "... (~20s)");
      const raw = await runWithProgress(() => callClaude(
        'You are a product researcher. I need to find "' + dryRunData.clean_name_id + '" (English: "' + dryRunData.clean_name_en + '") on ' + platform + ' Indonesia.\n\nDo ALL of these searches — this is critical:\n' + searchLines + '\n\nVERY IMPORTANT:\n- ONLY include results that are clearly from ' + platform + ' (' + site + ')\n- For EVERY listing found, include: product name, price in IDR (Indonesian Rupiah), seller name, sold count, link\n- Indonesian Rupiah uses dots as thousands separator: Rp 25.000 = 25000 IDR\n- Try to find 10-20 listings\n- If a search returns no ' + platform + ' results, move to the next search\n- Report what you found even if only a few results',
        "claude-sonnet-4-20250514", true, 2, 4096), 25);

      // ── Detect blocked/login-wall/CAPTCHA signals in raw response ──
      const rawLower = raw.toLowerCase();
      const blockedSignals = [
        { pattern: /login.{0,20}required|need.{0,10}log.?in|sign.?in.{0,10}to.{0,10}(view|access|see)/i, reason: "login wall detected" },
        { pattern: /captcha|verify.{0,10}(human|robot|not a bot)|security.{0,10}check/i, reason: "CAPTCHA/bot check" },
        { pattern: /access.{0,15}denied|forbidden|blocked|403/i, reason: "access denied/blocked" },
        { pattern: /no.{0,10}results?.{0,10}(found|available)|couldn.?t.{0,10}find.{0,15}(any|results)|did not (find|return)/i, reason: "search returned nothing" },
        { pattern: /unable to (access|search|find|retrieve).{0,20}(shopee|tokopedia)/i, reason: "platform unreachable" },
      ];
      let blockReason = null;
      for (const sig of blockedSignals) {
        if (sig.pattern.test(raw)) { blockReason = platform + ": " + sig.reason; break; }
      }
      // Also check: if raw response mentions the platform but has no prices at all
      if (!blockReason && rawLower.includes(platform.toLowerCase()) && !/\d{2,3}\.\d{3}|rp\s*\d|idr\s*\d|\d+\s*rupiah/i.test(raw)) {
        blockReason = platform + ": response mentions platform but contains no prices";
      }

      setStage(label + "Formatting " + platform + "..."); await wait(1500);
      const fmt = await runWithProgress(() => callClaude(
        'Convert these ' + platform + ' search results to JSON. Extract ONLY ' + platform + ' listings.\n\nRAW DATA:\n' + raw + '\n\nOutput ONLY this JSON:\n{"results":[{"name":"product name","price_idr":NUMBER,"source":"' + platform + '","seller":"seller name","sold":"sold count","url":"product url"}]}\n\nRULES:\n- price_idr must be an INTEGER in Rupiah. "Rp 25.000" = 25000. "Rp 1.500.000" = 1500000\n- source must be exactly "' + platform + '"\n- If no ' + platform + ' results found, return {"results":[]}\nJSON only:',
        "claude-haiku-4-5-20251001", false, 2, 4096), 8);

      try {
        const p = parseJSON(fmt);
        const results = (p.results || p.products || []).map(r => ({
          name: r.name || r.product_name || "",
          price_idr: sanitizeIDR(r.price_idr || r.price || 0),
          source: platform,
          seller: r.seller || r.shop || r.shop_name || "",
          sold: (() => {
            let s = r.sold || r.terjual || "";
            if (typeof s === "string" && /not visible|not available|n\/a|^0$/i.test(s)) return "";
            return s;
          })(),
          url: r.url || r.link || "",
        }));
        // If we detected a block and got 0 valid results, pass the reason through
        const validResults = results.filter(r => r.price_idr >= 1000);
        return { results, blockReason: validResults.length === 0 ? blockReason : null };
      } catch (e) {
        console.warn(platform + " parse failed:", e.message);
        return { results: [], blockReason: blockReason || (platform + ": JSON parse failed") };
      }
    };

    // ── Shopee-focused fallback search ──
    const doShopeeRetry = async (queries, label) => {
      setStage(label + "Shopee retry with different queries... (~20s)");
      const raw = await runWithProgress(() => callClaude(
        'I need to find products on Shopee Indonesia (shopee.co.id). The product is: "' + dryRunData.clean_name_en + '" / "' + dryRunData.clean_name_id + '".\n\nPlease do ALL of these searches:\n- Search: "shopee.co.id ' + queries[0] + '"\n- Search: "shopee ' + dryRunData.clean_name_en + ' indonesia"\n- Search: "' + queries[0] + ' beli di shopee"\n- Search: "shopee indonesia ' + (dryRunData.brand || queries[0]) + ' ' + (dryRunData.category || '') + '"\n' + (queries[1] ? '- Search: "' + queries[1] + ' shopee.co.id harga terbaru"\n' : '') + '\nI know Shopee can be hard to find — try every search above. Report ANY Shopee listing you find with: name, price IDR, seller, sold count, URL.',
        "claude-sonnet-4-20250514", true, 2, 4096), 25);

      setStage(label + "Formatting Shopee retry..."); await wait(1500);
      const fmt = await runWithProgress(() => callClaude(
        'Convert to JSON. ONLY Shopee listings:\n' + raw + '\n\n{"results":[{"name":"","price_idr":NUMBER,"source":"Shopee","seller":"","sold":"","url":""}]}\nprice_idr = INTEGER. "Rp 25.000" = 25000. JSON only:',
        "claude-haiku-4-5-20251001", false, 2, 4096), 8);

      try {
        const p = parseJSON(fmt);
        return (p.results || []).map(r => ({
          name: r.name || "", price_idr: sanitizeIDR(r.price_idr || r.price || 0),
          source: "Shopee", seller: r.seller || "",
          sold: (() => { let s = r.sold || ""; if (typeof s === "string" && /not visible|n\/a|^0$/i.test(s)) return ""; return s; })(),
          url: r.url || "",
        }));
      } catch { return []; }
    };

    // ── Broad search (both platforms) ──
    const doBroadSearch = async (queries, label, focusPlatform) => {
      const focusNote = focusPlatform
        ? '\nFOCUS especially on finding ' + focusPlatform + ' results — I have very few from there.'
        : '';
      setStage(label + (focusPlatform ? focusPlatform + "-focused" : "Broad") + " search... (~20s)");
      const raw = await runWithProgress(() => callClaude(
        'Search for "' + dryRunData.clean_name_id + '" on Indonesian e-commerce.\n\nDo ALL:\n- Search: "' + queries[0] + ' harga terbaru indonesia"\n- Search: "' + queries[0] + ' beli online murah"\n' + (queries[1] ? '- Search: "' + queries[1] + ' tokopedia shopee terlaris"\n' : '') + '- Search: "' + dryRunData.clean_name_en + ' buy online indonesia IDR"\n' + (focusPlatform === "Shopee" ? '- Search: "' + queries[0] + ' shopee.co.id"\n- Search: "shopee ' + dryRunData.clean_name_en + ' indonesia harga"\n' : '') + '\nInclude BOTH Tokopedia AND Shopee.' + focusNote + ' Each: name, price IDR, marketplace, seller, sold, URL. Aim 10-15.',
        "claude-sonnet-4-20250514", true, 2, 4096), 25);

      setStage(label + "Formatting..."); await wait(1500);
      const fmt = await runWithProgress(() => callClaude(
        'Convert to JSON:\n' + raw + '\n\n{"results":[{"name":"","price_idr":NUMBER,"source":"Tokopedia" or "Shopee","seller":"","sold":"","url":""}]}\nJSON only:',
        "claude-haiku-4-5-20251001", false, 2, 4096), 8);

      try {
        const p = parseJSON(fmt);
        return (p.results || p.products || []).map(r => ({
          name: r.name || "", price_idr: sanitizeIDR(r.price_idr || r.price || 0),
          source: r.source || "Tokopedia", seller: r.seller || "",
          sold: (() => { let s = r.sold || ""; if (typeof s === "string" && /not visible|n\/a|^0$/i.test(s)) return ""; return s; })(),
          url: r.url || "",
        }));
      } catch { return []; }
    };

    // ── Deduplication ──
    const dedup = (results) => {
      const seen = new Map();
      return results.filter(r => {
        if (!r.name || r.price_idr < 1000) return false;
        const key = r.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40) + "|" + r.price_idr;
        if (seen.has(key)) return false;
        seen.set(key, true);
        return true;
      });
    };

    try {
      let allResults = [];
      const waves = [];
      const sq = [mainBahasa, ...(bahasaQueries.length > 1 ? [bahasaQueries[1]] : []), mainEnglish].filter(Boolean);

      // WAVE 1: Tokopedia
      let tokoCount = 0;
      try {
        const { results: tokoResults, blockReason: tokoBlock } = await doSearchPlatform("Tokopedia", sq, "\u2460 ");
        tokoCount = tokoResults.filter(x => x.price_idr >= 1000).length;
        allResults.push(...tokoResults);
        waves.push({ name: "Tokopedia", status: tokoCount > 0 ? "ok" : "empty", count: tokoCount, reason: tokoBlock || "" });
        setWaveStatus([...waves]);
        setStage("Tokopedia: " + tokoCount + " results. Waiting before Shopee...");
        await wait(5000); // 5s gap instead of 2s to avoid rate limits
      } catch (e) {
        console.warn("Tokopedia:", e.message);
        const isRateLimit = e.message.includes("429") || e.message.includes("Rate");
        waves.push({ name: "Tokopedia", status: "fail", count: 0, reason: isRateLimit ? "Rate limited" : e.message });
        setWaveStatus([...waves]);
        if (isRateLimit) { setStage("Rate limited \u2014 waiting 18s..."); await wait(18000); }
        else await wait(5000);
      }

      // WAVE 2: Shopee
      let shopeeCount = 0;
      let shopeeBlockReason = null;
      try {
        const { results: shopeeResults, blockReason: shopeeBlock } = await doSearchPlatform("Shopee", sq, "\u2461 ");
        shopeeCount = shopeeResults.filter(x => x.price_idr >= 1000).length;
        allResults.push(...shopeeResults);
        shopeeBlockReason = shopeeBlock;
        // Smart detection: if Tokopedia got plenty but Shopee got 0, likely blocked
        let reason = shopeeBlock || "";
        if (shopeeCount === 0 && !shopeeBlock && tokoCount >= 10) {
          reason = "Shopee likely blocked — Tokopedia found " + tokoCount + " but Shopee returned 0";
        } else if (shopeeCount === 0 && !shopeeBlock) {
          reason = "Search returned 0 — Shopee may not be indexed by Google";
        }
        waves.push({ name: "Shopee", status: shopeeCount > 0 ? "ok" : "empty", count: shopeeCount, reason });
        setWaveStatus([...waves]);
        setStage("Shopee: " + shopeeCount + " results.");
        await wait(3000);
      } catch (e) {
        console.warn("Shopee:", e.message);
        const isRateLimit = e.message.includes("429") || e.message.includes("Rate");
        waves.push({ name: "Shopee", status: "fail", count: 0, reason: isRateLimit ? "Rate limited" : e.message });
        setWaveStatus([...waves]);
        if (isRateLimit) { setStage("Rate limited \u2014 waiting 18s..."); await wait(18000); }
        else await wait(5000);
      }

      // WAVE 2.5: Shopee RETRY if Wave 2 got 0 results
      if (shopeeCount === 0) {
        const retryNote = shopeeBlockReason ? " (Wave 2: " + shopeeBlockReason + ")" : "";
        setStage("Shopee had 0 results" + retryNote + " — retrying with different queries...");
        await wait(5000); // extra breathing room
        try {
          const r = await doShopeeRetry(sq, "\u2461b ");
          const retryCount = r.filter(x => x.price_idr >= 1000).length;
          allResults.push(...r);
          shopeeCount = retryCount;
          waves.push({ name: "Shopee retry", status: retryCount > 0 ? "ok" : "empty", count: retryCount, reason: retryCount === 0 ? "Retry also returned 0" + (shopeeBlockReason ? " — " + shopeeBlockReason : " — try Apify mode for direct scraping") : "Retry found results" });
          setWaveStatus([...waves]);
          await wait(3000);
        } catch (e) {
          console.warn("Shopee retry:", e.message);
          waves.push({ name: "Shopee retry", status: "fail", count: 0, reason: e.message });
          setWaveStatus([...waves]);
          if (e.message.includes("429")) { await wait(18000); }
          else await wait(5000);
        }
      }

      // WAVE 3: Broad (focus on Shopee if Shopee still has 0)
      const validSoFar = allResults.filter(r => r.price_idr >= 1000).length;
      if (validSoFar < 15 || shopeeCount === 0) {
        const focusPlatform = shopeeCount === 0 ? "Shopee" : null;
        try {
          const r = await doBroadSearch(sq, "\u2462 ", focusPlatform);
          const broadCount = r.filter(x => x.price_idr >= 1000).length;
          const broadShopee = r.filter(x => x.source === "Shopee" && x.price_idr >= 1000).length;
          allResults.push(...r);
          waves.push({ name: "Broad" + (focusPlatform ? " (" + focusPlatform + " focus)" : ""), status: broadCount > 0 ? "ok" : "empty", count: broadCount, reason: focusPlatform && broadShopee === 0 ? "Still no Shopee results found" : "" });
          setWaveStatus([...waves]);
        } catch (e) {
          console.warn("Broad:", e.message);
          waves.push({ name: "Broad", status: "fail", count: 0, reason: e.message });
          setWaveStatus([...waves]);
        }
      } else {
        waves.push({ name: "Broad", status: "skip", count: 0, reason: "Skipped — enough results (" + validSoFar + ")" });
        setWaveStatus([...waves]);
      }

      // Fallback
      if (allResults.filter(r => r.price_idr >= 1000).length === 0) {
        setStage("Last resort search...");
        try {
          const raw = await runWithProgress(() => callClaude(
            'Search "' + dryRunData.clean_name_en + '" indonesia tokopedia shopee harga',
            "claude-sonnet-4-20250514", true, 1, 4096), 20);
          const fmt = await callClaude(
            'Extract: ' + raw + '\n{"results":[{"name":"","price_idr":NUMBER,"source":"Tokopedia or Shopee","seller":"","sold":"","url":""}]} JSON only:',
            "claude-haiku-4-5-20251001", false, 1, 4096);
          const p = parseJSON(fmt);
          const fallbackResults = (p.results || []).map(r => ({
            name: r.name || "", price_idr: sanitizeIDR(r.price_idr || 0),
            source: r.source || "Tokopedia", seller: r.seller || "", sold: r.sold || "", url: r.url || "",
          }));
          allResults.push(...fallbackResults);
          waves.push({ name: "Fallback", status: fallbackResults.length > 0 ? "ok" : "empty", count: fallbackResults.filter(x => x.price_idr >= 1000).length });
          setWaveStatus([...waves]);
        } catch {
          waves.push({ name: "Fallback", status: "fail", count: 0 });
          setWaveStatus([...waves]);
        }
      }

      // Deduplicate
      allResults = dedup(allResults);
      if (allResults.length === 0) throw new Error("No Indonesian listings found. Try simpler Bahasa keywords.");

      // Outlier trimming
      if (allResults.length >= 5) {
        const sorted = [...allResults].sort((a, b) => a.price_idr - b.price_idr);
        const lo = sorted[0].price_idr, hi = sorted[sorted.length - 1].price_idr;
        if (hi / lo > 10) {
          const tc = Math.max(1, Math.floor(allResults.length * 0.1));
          const trimmed = sorted.slice(tc, sorted.length - tc);
          allResults = trimmed.length >= 3 ? trimmed : allResults;
        }
      }

      // Price stats
      const cleanPrices = allResults.map(r => r.price_idr).filter(x => x >= 1000).sort((a, b) => a - b);
      if (cleanPrices.length === 0) throw new Error("No valid prices found.");

      const tokoFinal = allResults.filter(r => r.source === "Tokopedia").length;
      const shopeeFinal = allResults.filter(r => r.source === "Shopee").length;

      const indo = {
        results: allResults,
        price_stats: {
          lowest_idr: cleanPrices[0],
          highest_idr: cleanPrices[cleanPrices.length - 1],
          median_idr: cleanPrices[Math.floor(cleanPrices.length / 2)],
          average_idr: Math.round(cleanPrices.reduce((s, x) => s + x, 0) / cleanPrices.length),
          num_results: cleanPrices.length,
        },
        search_notes: "3-wave: " + tokoFinal + " Tokopedia, " + shopeeFinal + " Shopee" + (shopeeFinal === 0 ? (shopeeBlockReason ? " (" + shopeeBlockReason + ")" : " (Shopee unavailable — try Apify mode)") : ""),
        wave_status: waves,
      };
      indo.confidence = computeConfidence(indo.results, indo.price_stats);
      setIndoResults(indo);

      // Margin calculation
      const wc = dryRunData.weight_class || "medium";
      const stats = indo.price_stats;
      const med = stats.median_idr;
      const low = stats.lowest_idr || med;
      const high = stats.highest_idr || med;

      const calcMargin = (indoIDR) => {
        const sourceQty = dryRunData.pack_quantity || 1;
        const uaeUnitAed = dryRunData.price_aed / sourceQty;
        const uaeUSD = uaeUnitAed * fx.AEDUSD;
        const indoUSD = indoIDR * fx.IDRUSD;
        const wkg = WEIGHT_KG[wc] || 1.0;
        const fr = (freight.air?.rate_per_kg || 4) * wkg;
        const duty = (indoUSD + fr) * CUSTOMS_DUTY;
        const lm = LAST_MILE_AED * fx.AEDUSD;
        const total = indoUSD + fr + duty + lm;
        const margin = uaeUSD > 0 ? ((uaeUSD - total) / uaeUSD) * 100 : 0;
        return {
          uaeUSD, uaeAED: uaeUnitAed, uaeIDR: uaeUnitAed * fx.AED_TO_IDR,
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
        uaeProduct: dryRunData, normalized: dryRunData, uaeSimilar,
        indoResults: indo,
        margins: { median: medianMargin, best: calcMargin(low), worst: calcMargin(high) },
        confidence: indo.confidence,
        medianPriceIDR: med, lowestPriceIDR: low, highestPriceIDR: high,
        weightClass: wc, timestamp: new Date().toISOString(),
        status: medianMargin.margin >= MARGIN_THRESHOLD.candidate ? "Candidate"
          : medianMargin.margin >= MARGIN_THRESHOLD.borderline ? "Investigated" : "Rejected",
      };
      setMarginData(mData);

      const newHistory = [mData, ...historyRef.current].slice(0, MAX_HISTORY);
      setHistory(newHistory);
      await saveHistoryNow(newHistory);

      setActiveSection(2);
      setStage("");
    } catch (err) {
      setAutoError(err.message); setStage("");
      if (err.message.includes("429") || err.message.includes("Rate")) setCooldown(30);
    }
    setLoading(false);
  };

  const runIndoSearchApify = async () => {
    if (!dryRunData || !apifyKey) return;
    if (!apiKey) { setAutoError("Claude API key still needed for translation."); return; }
    setLoading(true); setAutoError(""); setIndoResults(null); setMarginData(null); setWaveStatus([]);
    const allQueries = editableQueries.filter(q => q.trim());
    if (allQueries.length === 0) { setAutoError("Add at least one search query."); setLoading(false); return; }
    const bahasaQuery = allQueries.find(q => /[^a-zA-Z0-9\s\-.]/.test(q) || /murah|terlaris|harga/i.test(q)) || allQueries[0];

    // ── Apify Actor Runner ──
    const runApifyActor = async (actorId, input, label) => {
      setStage("Starting " + label + " scraper...");
      // Start the actor run
      const startRes = await fetch(
        "https://api.apify.com/v2/acts/" + encodeURIComponent(actorId) + "/runs?token=" + apifyKey,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
      );
      if (!startRes.ok) {
        const errText = await startRes.text();
        throw new Error(label + " actor failed to start: " + startRes.status + " " + errText);
      }
      const runData = await startRes.json();
      const runId = runData.data?.id;
      if (!runId) throw new Error(label + " no run ID returned");

      // Poll for completion
      let status = "RUNNING";
      let pollCount = 0;
      while (status === "RUNNING" || status === "READY") {
        if (pollCount > 60) throw new Error(label + " timed out after 5 minutes");
        await wait(5000);
        pollCount++;
        setStage(label + " running... (" + (pollCount * 5) + "s)");
        setProgress(Math.min(90, pollCount * 3));
        const pollRes = await fetch(
          "https://api.apify.com/v2/actor-runs/" + runId + "?token=" + apifyKey
        );
        if (!pollRes.ok) continue;
        const pollData = await pollRes.json();
        status = pollData.data?.status || "RUNNING";
      }

      if (status !== "SUCCEEDED") throw new Error(label + " ended with status: " + status);

      // Fetch results
      const datasetId = runData.data?.defaultDatasetId;
      if (!datasetId) throw new Error(label + " no dataset ID");
      const itemsRes = await fetch(
        "https://api.apify.com/v2/datasets/" + datasetId + "/items?token=" + apifyKey + "&limit=50"
      );
      if (!itemsRes.ok) throw new Error(label + " failed to fetch results");
      return await itemsRes.json();
    };

    // ── Normalize Apify results ──
    const normalizeApifyResults = (items, platform) => {
      if (!Array.isArray(items)) return [];
      return items.filter(item => item && (item.price || item.currentPrice || item.salePrice)).map(item => {
        let price = item.price || item.currentPrice || item.salePrice || 0;
        if (typeof price === "string") price = sanitizeIDR(price);
        if (typeof price === "number" && price < 500) price = Math.round(price * 1000);
        return {
          name: item.title || item.name || item.productName || "",
          price_idr: Math.round(price),
          source: platform,
          seller: item.shopName || item.sellerName || item.seller || item.shop?.name || "",
          sold: String(item.sold || item.totalSold || item.historicalSold || item.itemSold || ""),
          url: item.url || item.link || item.productUrl || "",
        };
      }).filter(r => r.price_idr >= 1000 && r.name);
    };

    try {
      let allResults = [];
      const waves = [];

      setStage("Scraping Tokopedia..."); setProgress(0);
      try {
        const tokoItems = await runApifyActor(tokoActorId, { keyword: bahasaQuery, maxItems: 30, sort: "best-selling" }, "Tokopedia");
        const tokoResults = normalizeApifyResults(tokoItems, "Tokopedia");
        allResults.push(...tokoResults);
        waves.push({ name: "Tokopedia (Apify)", status: tokoResults.length > 0 ? "ok" : "empty", count: tokoResults.length });
        setWaveStatus([...waves]);
      } catch (e) {
        console.warn("Tokopedia:", e.message);
        waves.push({ name: "Tokopedia (Apify)", status: "fail", count: 0, reason: e.message });
        setWaveStatus([...waves]);
        setAutoError(prev => prev ? prev + "\n" + e.message : "Tokopedia: " + e.message);
      }

      setStage("Scraping Shopee..."); setProgress(0);
      try {
        const shopeeItems = await runApifyActor(shopeeActorId, { keyword: bahasaQuery, maxItems: 30, sort: "top-sales" }, "Shopee");
        const shopeeResults = normalizeApifyResults(shopeeItems, "Shopee");
        allResults.push(...shopeeResults);
        waves.push({ name: "Shopee (Apify)", status: shopeeResults.length > 0 ? "ok" : "empty", count: shopeeResults.length, reason: shopeeResults.length === 0 ? "Actor returned no matching products" : "" });
        setWaveStatus([...waves]);
      } catch (e) {
        console.warn("Shopee:", e.message);
        waves.push({ name: "Shopee (Apify)", status: "fail", count: 0, reason: e.message });
        setWaveStatus([...waves]);
        setAutoError(prev => prev ? prev + "\n" + e.message : "Shopee: " + e.message);
      }

      if (allResults.length < 5 && allQueries.length > 1) {
        setStage("Trying second keyword...");
        try {
          const fallbackItems = await runApifyActor(tokoActorId, { keyword: allQueries[1], maxItems: 20, sort: "best-selling" }, "Retry Tokopedia");
          const fallbackResults = normalizeApifyResults(fallbackItems, "Tokopedia");
          allResults.push(...fallbackResults);
          waves.push({ name: "Retry (Apify)", status: fallbackResults.length > 0 ? "ok" : "empty", count: fallbackResults.length });
          setWaveStatus([...waves]);
        } catch {
          waves.push({ name: "Retry (Apify)", status: "fail", count: 0 });
          setWaveStatus([...waves]);
        }
      }

      if (allResults.length === 0) throw new Error("No products found from either marketplace.");

      if (allResults.length >= 5) {
        const sorted = [...allResults].sort((a, b) => a.price_idr - b.price_idr);
        const lo = sorted[0].price_idr, hi = sorted[sorted.length - 1].price_idr;
        if (hi / lo > 10) {
          const trimCount = Math.max(1, Math.floor(allResults.length * 0.1));
          const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
          if (trimmed.length >= 3) allResults = trimmed;
        }
      }

      const prices = allResults.map(r => r.price_idr).sort((a, b) => a - b);
      const indo = {
        results: allResults,
        price_stats: {
          lowest_idr: prices[0], highest_idr: prices[prices.length - 1],
          median_idr: prices[Math.floor(prices.length / 2)],
          average_idr: Math.round(prices.reduce((s, x) => s + x, 0) / prices.length),
          num_results: prices.length,
        },
        search_notes: "Apify scrape: " + allResults.filter(r => r.source === "Tokopedia").length + " Tokopedia, " + allResults.filter(r => r.source === "Shopee").length + " Shopee",
        source: "apify",
        wave_status: waves,
      };
      indo.confidence = computeConfidence(indo.results, indo.price_stats);
      setIndoResults(indo); setAutoError("");

      const wc = dryRunData.weight_class || "medium";
      const med = indo.price_stats.median_idr, low = indo.price_stats.lowest_idr, high = indo.price_stats.highest_idr;
      const calcMargin = (indoIDR) => {
        const sourceQty = dryRunData.pack_quantity || 1;
        const uaeUnitAed = dryRunData.price_aed / sourceQty;
        const uaeUSD = uaeUnitAed * fx.AEDUSD;
        const indoUSD = indoIDR * fx.IDRUSD;
        const wkg = WEIGHT_KG[wc] || 1.0;
        const fr = (freight.air?.rate_per_kg || 4) * wkg;
        const duty = (indoUSD + fr) * CUSTOMS_DUTY;
        const lm = LAST_MILE_AED * fx.AEDUSD;
        const total = indoUSD + fr + duty + lm;
        const margin = uaeUSD > 0 ? ((uaeUSD - total) / uaeUSD) * 100 : 0;
        return {
          uaeUSD, uaeAED: uaeUnitAed, uaeIDR: uaeUnitAed * fx.AED_TO_IDR,
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
        uaeProduct: dryRunData, normalized: dryRunData, uaeSimilar,
        indoResults: indo,
        margins: { median: medianMargin, best: calcMargin(low), worst: calcMargin(high) },
        confidence: indo.confidence,
        medianPriceIDR: med, lowestPriceIDR: low, highestPriceIDR: high,
        weightClass: wc, timestamp: new Date().toISOString(), source: "apify",
        status: medianMargin.margin >= MARGIN_THRESHOLD.candidate ? "Candidate"
          : medianMargin.margin >= MARGIN_THRESHOLD.borderline ? "Investigated" : "Rejected",
      };
      setMarginData(mData);
      const newHistory = [mData, ...historyRef.current].slice(0, MAX_HISTORY);
      setHistory(newHistory);
      await saveHistoryNow(newHistory);
      setActiveSection(2);
    } catch (err) { setAutoError(err.message); setStage(""); }
    setLoading(false);
  };

  const runUaeSimilar = async () => {
    if (!dryRunData || !apiKey) return;
    setLoading(true); setAutoError(""); setUaeSimilar(null);
    try {
      setStage("Finding similar UAE products... (~15s)");
      const rawSearch = await runWithProgress(() => callClaude(
        'Search Amazon.ae and Noon UAE for 8-10 products similar to "' + dryRunData.product_name + '".\nCategory: ' + dryRunData.category + ' | Price: ~AED ' + dryRunData.price_aed + '\n\nSearch: "' + dryRunData.clean_name_en + ' amazon.ae" and "' + dryRunData.clean_name_en + ' noon uae"\n\nFind best sellers. List each with name, AED price, marketplace, ratings.',
        "claude-sonnet-4-20250514", true, 2, 4096), 18);
      await wait(2000);
      setStage("Formatting results... (~5s)");
      const formatted = await runWithProgress(() => callClaude(
        'Convert to JSON:\n' + rawSearch + '\n\nOutput ONLY:\n{"similar":[{"name":"","price_aed":number,"source":"Amazon.ae or Noon","rating":0,"sold":"","url":""}],"price_stats":{"lowest_aed":0,"highest_aed":0,"median_aed":0,"average_aed":0,"num_results":0},"search_notes":""}\nAll prices in AED. JSON only:',
        "claude-haiku-4-5-20251001", false, 2, 4096), 6);
      const uaeData = parseJSON(formatted);
      if (!uaeData.similar) uaeData.similar = uaeData.results || [];
      if (!uaeData.price_stats && uaeData.similar.length > 0) {
        const p = uaeData.similar.map(x => x.price_aed || x.price || 0).filter(x => x > 0).sort((a, b) => a - b);
        uaeData.price_stats = {
          lowest_aed: p[0], highest_aed: p[p.length - 1],
          median_aed: p[Math.floor(p.length / 2)],
          average_aed: Math.round(p.reduce((s, x) => s + x, 0) / p.length * 100) / 100,
          num_results: p.length,
        };
      }
      setUaeSimilar(uaeData); setActiveSection(0); setStage("");
    } catch (err) {
      setAutoError(err.message); setStage("");
      if (err.message.includes("429") || err.message.includes("Rate")) setCooldown(30);
    }
    setLoading(false);
  };

  const exportBackup = async () => {
    const backup = {
      pin: currentPin, exportedAt: new Date().toISOString(),
      history: history.map(compressEntry), database,
      config: { apiKey: "***REDACTED***", scrapeMode, tokoActorId, shopeeActorId },
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gt-crosstrade-backup-" + currentPin + "-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
  };

  const importBackup = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        if (!backup.history || !Array.isArray(backup.history)) throw new Error("Invalid backup file");
        const expanded = backup.history.map(expandEntry);
        setHistory(expanded);
        if (backup.database) setDatabase(backup.database);
        await saveHistory(currentPin, expanded);
        if (backup.database) await storeSet(currentPin + ":database", backup.database);
        alert("Restored " + expanded.length + " lookups" + (backup.database ? " and " + backup.database.length + " database entries" : ""));
      } catch (err) { alert("Import failed: " + err.message); }
    };
    reader.readAsText(file);
  };
  const backupFileRef = useRef(null);

  const exportStructuredCSV = () => {
    if (!history.length) return;
    const headers = ["Date","Product Name EN","Product Name ID","Brand","Category","Weight Class","Source","UAE Price AED","UAE Price USD","UAE Price IDR","Indo Median IDR","Indo Lowest IDR","Indo Highest IDR","Indo Median USD","Freight USD","Customs USD","Last Mile USD","Total Cost USD","Total Cost AED","Total Cost IDR","Margin Best %","Margin Median %","Margin Worst %","Status"];
    const rows = history.map(h => {
      const m = h.margins?.median || {};
      return [h.timestamp?.slice(0,10)||"",'"'+(h.uaeProduct?.product_name||"")+'"','"'+(h.normalized?.clean_name_id||"")+'"','"'+(h.uaeProduct?.brand||"")+'"',h.normalized?.category||"",h.normalized?.weight_class||"",h.uaeProduct?.source||"",h.uaeProduct?.price_aed||0,(m.uaeUSD||0).toFixed(2),(m.uaeIDR||0).toFixed(0),h.medianPriceIDR||0,h.lowestPriceIDR||0,h.highestPriceIDR||0,(m.indoUSD||0).toFixed(2),(m.freightUSD||0).toFixed(2),(m.dutyUSD||0).toFixed(2),(m.lastMileUSD||0).toFixed(2),(m.totalUSD||0).toFixed(2),(m.totalAED||0).toFixed(2),(m.totalIDR||0).toFixed(0),(h.margins?.best?.margin||0).toFixed(1),(h.margins?.median?.margin||0).toFixed(1),(h.margins?.worst?.margin||0).toFixed(1),h.status||""].join(",");
    });
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gt-crosstrade-analysis-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
  };

  const exportHistory = () => {
    if (!history.length) return;
    const h = ["Product","AED","IDR","Bahasa","Category","Indo Median IDR","Margin %","Status","Date"];
    const r = history.map(x => ['"'+(x.uaeProduct?.product_name||"")+'"',x.uaeProduct?.price_aed||0,Math.round((x.uaeProduct?.price_aed||0)*fx.AED_TO_IDR),'"'+(x.normalized?.clean_name_id||"")+'"',x.normalized?.category||"",x.medianPriceIDR||0,x.margins?.median?.margin?.toFixed(1)||0,x.status||"",x.timestamp?.slice(0,10)||""].join(","));
    const blob = new Blob([[h.join(","), ...r].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lookups-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
  };

  const exportPDF = () => {
    if (!marginData) return;
    const m = marginData.margins.median;
    const q = getQty();
    const html = '<!DOCTYPE html><html><head><title>GT Cross-Trade Analysis</title><style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#1a1a1a}h1{font-size:20px;border-bottom:2px solid #1a7a3a;padding-bottom:8px}h2{font-size:14px;color:#8B6914;margin-top:24px}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{padding:8px 12px;border:1px solid #ddd;text-align:left;font-size:12px}th{background:#f5f2eb;font-weight:700}.green{color:#1a7a3a}.red{color:#dc2626}.gold{color:#8B6914}.big{font-size:28px;font-weight:700;text-align:center;padding:16px}.verdict{padding:12px;text-align:center;border-radius:4px;font-weight:700;margin-top:16px}@media print{body{padding:20px}}</style></head><body><h1>GT Cross-Trade Analysis</h1><p><strong>Date:</strong> '+new Date().toLocaleDateString()+' | <strong>FX:</strong> 1 AED = '+Math.round(fx.AED_TO_IDR)+' IDR</p><h2>Product</h2><table><tr><th>Name</th><td>'+escapeHtml(marginData.uaeProduct?.product_name)+'</td></tr><tr><th>Bahasa</th><td>'+escapeHtml(marginData.normalized?.clean_name_id)+'</td></tr><tr><th>Category</th><td>'+(marginData.normalized?.category)+'</td></tr><tr><th>Source</th><td>'+(marginData.uaeProduct?.source)+' | AED '+(marginData.uaeProduct?.price_aed)+'</td></tr></table><h2>Indonesia Market (Median of '+(marginData.indoResults?.price_stats?.num_results||0)+' listings)</h2><table><tr><th></th><th>Lowest</th><th>Median</th><th>Highest</th></tr><tr><th>IDR</th><td>'+fmtIDR(marginData.lowestPriceIDR)+'</td><td>'+fmtIDR(marginData.medianPriceIDR)+'</td><td>'+fmtIDR(marginData.highestPriceIDR)+'</td></tr></table><h2>Margin Analysis (\xd7'+q+' units)</h2><table><tr><th>Item</th><th>USD</th><th>AED</th><th>IDR</th></tr><tr><th>UAE Sell Price</th><td>'+fmtUSD(m.uaeUSD*q)+'</td><td>'+fmtAED(m.uaeAED*q)+'</td><td>'+fmtIDR(m.uaeIDR*q)+'</td></tr><tr><th>Indo Source</th><td>'+fmtUSD(m.indoUSD*q)+'</td><td>'+fmtAED(m.indoAED*q)+'</td><td>'+fmtIDR(m.indoIDR*q)+'</td></tr><tr><th>Air Freight</th><td>'+fmtUSD(m.freightUSD*q)+'</td><td>'+fmtAED(m.freightAED*q)+'</td><td>'+fmtIDR(m.freightIDR*q)+'</td></tr><tr><th>Customs 5%</th><td>'+fmtUSD(m.dutyUSD*q)+'</td><td>'+fmtAED(m.dutyAED*q)+'</td><td>'+fmtIDR(m.dutyIDR*q)+'</td></tr><tr><th>Last Mile</th><td>'+fmtUSD(m.lastMileUSD*q)+'</td><td>'+fmtAED(m.lastMileAED*q)+'</td><td>'+fmtIDR(m.lastMileIDR*q)+'</td></tr><tr style="font-weight:700;background:#fef2f2"><th class="red">Total Cost</th><td class="red">'+fmtUSD(m.totalUSD*q)+'</td><td class="red">'+fmtAED(m.totalAED*q)+'</td><td class="red">'+fmtIDR(m.totalIDR*q)+'</td></tr><tr style="font-weight:700;background:#e8f5ec"><th class="green">Profit</th><td class="green">'+fmtUSD((m.uaeUSD-m.totalUSD)*q)+'</td><td class="green">'+fmtAED((m.uaeAED-m.totalAED)*q)+'</td><td class="green">'+fmtIDR((m.uaeIDR-m.totalIDR)*q)+'</td></tr></table><div class="big">'+(m.margin>=MARGIN_THRESHOLD.candidate?'<span class="green">':'<span class="red">')+m.margin.toFixed(1)+'% Gross Margin</span></div><div class="verdict" style="background:'+(m.margin>=MARGIN_THRESHOLD.candidate?'#e8f5ec;color:#1a7a3a':m.margin>=MARGIN_THRESHOLD.borderline?'#fdf8ed;color:#8B6914':'#fef2f2;color:#dc2626')+'">'+(m.margin>=MARGIN_THRESHOLD.candidate?"\u2713 CANDIDATE":m.margin>=MARGIN_THRESHOLD.borderline?"\u25cb BORDERLINE":"\u2717 LOW MARGIN")+'</div><script>window.onload=()=>window.print()<\/script></body></html>';
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
  };

  const exportCurrentCSV = () => {
    if (!marginData) return;
    const m = marginData.margins.median;
    const q = getQty();
    const h = ["Item","USD","AED","IDR"];
    const rows = [
      ["UAE Sell",fmtUSD(m.uaeUSD*q),fmtAED(m.uaeAED*q),fmtIDR(m.uaeIDR*q)],
      ["Indo Source",fmtUSD(m.indoUSD*q),fmtAED(m.indoAED*q),fmtIDR(m.indoIDR*q)],
      ["Freight",fmtUSD(m.freightUSD*q),fmtAED(m.freightAED*q),fmtIDR(m.freightIDR*q)],
      ["Customs",fmtUSD(m.dutyUSD*q),fmtAED(m.dutyAED*q),fmtIDR(m.dutyIDR*q)],
      ["Last Mile",fmtUSD(m.lastMileUSD*q),fmtAED(m.lastMileAED*q),fmtIDR(m.lastMileIDR*q)],
      ["Total Cost",fmtUSD(m.totalUSD*q),fmtAED(m.totalAED*q),fmtIDR(m.totalIDR*q)],
      ["Profit",fmtUSD((m.uaeUSD-m.totalUSD)*q),fmtAED((m.uaeAED-m.totalAED)*q),fmtIDR((m.uaeIDR-m.totalIDR)*q)],
      ["Margin",m.margin.toFixed(1)+"%","",""],
    ];
    const csv = [h.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (dryRunData?.clean_name_en || "product") + "-analysis.csv";
    a.click();
  };

  const handleUAEUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target.result);
      const products = rows.map((r, i) => ({
        id: "uae-" + Date.now() + "-" + i,
        name: r.product_name || r.name || r.title || r["Product Name"] || Object.values(r)[0] || "",
        price: parseFloat(r.price || r.Price || r.selling_price || Object.values(r)[1] || "0"),
        source: r.source || (r.asin ? "Amazon.ae" : "Noon"),
        category: guessCategory(r.product_name || r.name || r.title || Object.values(r)[0] || ""),
      }));
      setUaeProducts(products);
    };
    reader.readAsText(file);
  }, []);

  const handleIndoUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows = parseCSV(e.target.result);
      setBulkIndoResults(rows.map((r, i) => ({
        id: "indo-" + Date.now() + "-" + i,
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
    setNormalizing(true); setNormProgress(0);
    const res = [];
    for (let i = 0; i < uaeProducts.length; i++) {
      const p = uaeProducts[i];
      try {
        const r = await callClaude(
          'Normalize. JSON only:\n{"clean_name_en":"","clean_name_id":"","category":"","search_query_tokopedia":""}\nProduct:"' + p.name + '" AED ' + p.price,
          "claude-haiku-4-5-20251001", false, 1, 1024);
        const d = parseJSON(r);
        res.push({ ...p, cleanNameEn: d.clean_name_en || p.name, cleanNameId: d.clean_name_id || "", detectedCategory: d.category || p.category, searchQuery: d.search_query_tokopedia || "", normalized: true });
      } catch {
        res.push({ ...p, cleanNameEn: p.name, cleanNameId: "", detectedCategory: p.category, searchQuery: "", normalized: false });
      }
      setNormProgress(((i + 1) / uaeProducts.length) * 100);
      await wait(500);
    }
    setNormalized(res);
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
        id: "db-" + u.id, nameEn: u.cleanNameEn || u.name, nameId: u.cleanNameId || "",
        category: u.detectedCategory || u.category, uaePriceAED: u.price,
        indoPriceIDR: ip, grossMarginPct: mg,
        status: mg >= MARGIN_THRESHOLD.candidate ? "Candidate" : "Rejected",
        notes: "", source: u.source,
      };
    });
    setDatabase(entries);
    setBulkTab(4);
  };

  const updateHistoryStatus = (i, s) => setHistory(prev => prev.map((x, idx) => idx === i ? { ...x, status: s } : x));

  const resetLookup = () => {
    setDryRunData(null); setUaeSimilar(null); setIndoResults(null); setMarginData(null);
    setAutoError(""); setUrl(""); setEditableQueries([]); setNewQueryInput(""); setActiveSection(0); setWaveStatus([]);
  };

  const inputStyle = { width: "100%", padding: "10px 12px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "13px", borderRadius: "3px", outline: "none" };
  const btnStyle = { padding: "10px 24px", background: c.gold, color: c.btnText, border: "none", cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", borderRadius: "3px" };
  const btnSec = { ...btnStyle, background: "transparent", color: c.gold, border: "1px solid " + c.gold };
  const btnGreen = { ...btnStyle, background: c.green, color: "#fff" };
  const secStyle = { padding: "24px", background: c.surface, border: "1px solid " + c.border2, borderTop: "none", minHeight: "420px", borderRadius: "0 0 4px 4px" };
  const candidates = history.filter(h => (h.margins?.median?.margin || 0) >= MARGIN_THRESHOLD.candidate);

  const dropZone = (isI, onDrop, onClick, label) => (
    <div onDragOver={e => { e.preventDefault(); isI ? setIndoDragOver(true) : setDragOver(true); }} onDragLeave={() => isI ? setIndoDragOver(false) : setDragOver(false)} onDrop={e => { e.preventDefault(); isI ? setIndoDragOver(false) : setDragOver(false); const f = e.dataTransfer.files[0]; if (f) onDrop(f); }} onClick={onClick} style={{ border: "2px dashed " + ((isI ? indoDragOver : dragOver) ? c.gold : c.border2), borderRadius: "4px", padding: "40px 24px", textAlign: "center", cursor: "pointer" }}>
      <div style={{ fontSize: "28px", marginBottom: "8px", opacity: 0.3 }}>{"\u2191"}</div>
      <div style={{ color: c.dim, fontSize: "12px", fontFamily: "monospace" }}>{label}</div>
    </div>
  );

  const SectionToggle = ({ index, title, icon, children, count }) => (
    <div style={{ marginBottom: "8px", border: "1px solid " + (activeSection === index ? c.gold + "44" : c.border), borderRadius: "6px", overflow: "hidden" }}>
      <button onClick={() => setActiveSection(activeSection === index ? -1 : index)} style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px", background: activeSection === index ? c.surface2 : c.surface, border: "none", cursor: "pointer", textAlign: "left", color: c.text, fontFamily: "'JetBrains Mono',monospace", fontSize: "12px" }}>
        <span style={{ fontSize: "16px" }}>{icon}</span>
        <span style={{ flex: 1, fontWeight: 600, color: activeSection === index ? c.gold : c.text }}>{title}</span>
        {count !== undefined && <span style={{ color: c.green, fontSize: "10px" }}>{count} items</span>}
        <span style={{ color: c.dimmer, fontSize: "14px" }}>{activeSection === index ? "\u25be" : "\u25b8"}</span>
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

  // Wave status indicator component
  const WaveStatusBar = () => {
    if (!waveStatus.length) return null;
    return (
      <div style={{ marginBottom: "12px", padding: "10px 12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px" }}>
        <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px", textTransform: "uppercase" }}>SEARCH WAVES</div>
        {waveStatus.map((w, i) => {
          const icon = w.status === "ok" ? "\u2713" : w.status === "skip" ? "\u2014" : w.status === "empty" ? "\u25cb" : "\u2717";
          const color = w.status === "ok" ? c.green : w.status === "skip" ? c.dimmer : w.status === "empty" ? c.darkGold : c.red;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", fontSize: "11px" }}>
              <span style={{ color, fontWeight: 700, width: "14px", textAlign: "center" }}>{icon}</span>
              <span style={{ color: c.text, minWidth: "120px" }}>{w.name}</span>
              <span style={{ color: w.count > 0 ? c.green : c.dimmer, fontWeight: 600 }}>{w.count} results</span>
              {w.reason && <span style={{ color: c.dim, fontSize: "10px", fontStyle: "italic" }}>{w.reason}</span>}
            </div>
          );
        })}
      </div>
    );
  };

  const getQty = () => qtyMode === "container" ? Math.floor(24000 / (WEIGHT_KG[dryRunData?.weight_class || "medium"] || 1)) : qtyMode === "custom" ? qty : 1;

  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "'JetBrains Mono','Fira Code',monospace", padding: "24px", transition: "background 0.3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Instrument+Serif&display=swap" rel="stylesheet" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {!unlocked ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh", position: "relative" }}>
          <button onClick={toggleTheme} style={{ position: "absolute", top: 0, right: 0, background: "transparent", border: "1px solid " + c.border2, color: c.dim, fontFamily: "monospace", fontSize: "11px", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}>{dark ? "\u2600" : "\ud83c\udf19"}</button>
          <div style={{ width: "340px", padding: "40px", background: c.surface, border: "1px solid " + c.border, borderRadius: "8px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "16px", opacity: 0.3 }}>{"\ud83d\udd12"}</div>
            <h2 style={{ fontFamily: "'Instrument Serif',serif", fontSize: "24px", fontWeight: 400, color: c.gold, marginBottom: "8px" }}>{lockedOut ? "Access Denied" : "Enter PIN"}</h2>
            {lockedOut ? (
              <div>
                <p style={{ fontSize: "13px", color: c.red }}>Too many wrong attempts.</p>
                <p style={{ fontSize: "12px", color: c.dim, marginTop: "8px" }}>Contact admin.</p>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: "12px", color: c.dimmer, marginBottom: "24px" }}>Restricted access</p>
                <input type="password" value={pinInput} onChange={e => { setPinInput(e.target.value); setPinError(""); }} onKeyDown={e => e.key === "Enter" && handleUnlock()} placeholder="Enter PIN" autoFocus style={{ width: "100%", padding: "14px", background: c.input, border: "1px solid " + (pinError ? c.red : c.border2), color: c.gold, fontFamily: "monospace", fontSize: "18px", borderRadius: "4px", textAlign: "center", letterSpacing: "8px", outline: "none", marginBottom: "12px" }} />
                {pinError && <div style={{ fontSize: "12px", color: c.red, marginBottom: "12px" }}>{pinError}</div>}
                <button onClick={handleUnlock} style={{ width: "100%", padding: "12px", background: c.gold, color: c.btnText, border: "none", borderRadius: "4px", fontFamily: "monospace", fontWeight: 700, letterSpacing: "1px", cursor: "pointer" }}>UNLOCK</button>
              </div>
            )}
          </div>
        </div>
      ) : !storageReady ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: "16px" }}>
          <Spinner />
          <div style={{ fontSize: "12px", color: c.dim }}>Loading your data...</div>
        </div>
      ) : (<>

      <div style={{ marginBottom: "16px", borderBottom: "1px solid " + c.border, paddingBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ fontFamily: "'Instrument Serif',serif", fontSize: "28px", fontWeight: 400, color: c.gold, margin: 0 }}>GT Cross-Trade</h1>
            <div style={{ fontSize: "10px", color: c.dimmer, marginTop: "4px", letterSpacing: "2px", textTransform: "uppercase" }}>
              {"UAE \u2190 Indonesia \u00b7 PIN "}{currentPin.slice(0, 2)}{"** \u00b7 "}{fxUpdated ? "FX " + fxUpdated.toLocaleDateString() : "FX: defaults"}
              {" \u00b7 "}<span style={{ color: supabaseReady ? c.green : c.darkGold }}>{supabaseReady ? "\u25cf DB" : "\u25cb local"}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "12px", fontSize: "11px", alignItems: "flex-end" }}>
            <div style={{ textAlign: "right" }}><div style={{ color: c.dimmer }}>LOOKUPS</div><div style={{ color: c.gold, fontSize: "16px", fontWeight: 700 }}>{history.length}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ color: c.dimmer }}>CANDIDATES</div><div style={{ color: c.green, fontSize: "16px", fontWeight: 700 }}>{candidates.length}</div></div>
            <button onClick={toggleTheme} style={{ background: c.surface2, border: "1px solid " + c.border2, color: c.dim, fontFamily: "monospace", fontSize: "10px", padding: "6px 10px", borderRadius: "4px", cursor: "pointer" }}>{dark ? "\u2600" : "\ud83c\udf19"}</button>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: "12px", padding: "10px 12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "9px", color: c.dim, letterSpacing: "1px", width: "50px" }}>CLAUDE</span>
          <input type={showKey ? "text" : "password"} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-ant-..." style={{ ...inputStyle, flex: 1, padding: "4px 8px", fontSize: "11px" }} />
          <button onClick={() => setShowKey(!showKey)} style={{ ...btnSec, padding: "4px 8px", fontSize: "9px" }}>{showKey ? "HIDE" : "SHOW"}</button>
          {apiKeyStatus && <span style={{ fontSize: "10px", color: apiKeyStatus === "missing" ? c.red : c.green }}>{"\u2713"}</span>}
        </div>
        {scrapeMode === "apify" && (
        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "9px", color: c.dim, letterSpacing: "1px", width: "50px" }}>APIFY</span>
          <input type={showApifyKey ? "text" : "password"} value={apifyKey} onChange={e => setApifyKey(e.target.value)} placeholder="apify_api_..." style={{ ...inputStyle, flex: 1, padding: "4px 8px", fontSize: "11px" }} />
          <button onClick={() => setShowApifyKey(!showApifyKey)} style={{ ...btnSec, padding: "4px 8px", fontSize: "9px" }}>{showApifyKey ? "HIDE" : "SHOW"}</button>
          {apifyStatus && <span style={{ fontSize: "10px", color: c.green }}>{"\u2713"}</span>}
        </div>
        )}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "9px", color: c.dim, letterSpacing: "1px", width: "50px" }}>INDO</span>
          {[
            { id: "legacy", label: "\ud83d\udd0d Legacy (Claude Search)", desc: "~$0.10/lookup" },
            { id: "apify", label: "\ud83d\udd77 Apify (Direct Scrape)", desc: "~$0.02/lookup" },
          ].map(m => (
            <button key={m.id} onClick={() => setScrapeMode(m.id)} style={{ padding: "4px 10px", fontSize: "10px", fontFamily: "monospace", cursor: "pointer", background: scrapeMode === m.id ? (m.id === "apify" ? c.green : c.gold) : "transparent", color: scrapeMode === m.id ? c.btnText : c.dim, border: "1px solid " + (scrapeMode === m.id ? (m.id === "apify" ? c.green : c.gold) : c.border2), borderRadius: "3px" }}>
              {m.label} <span style={{ opacity: 0.7 }}>{m.desc}</span>
            </button>
          ))}
          {scrapeMode === "apify" && (
            <button onClick={() => setShowActorConfig(!showActorConfig)} style={{ ...btnSec, padding: "3px 8px", fontSize: "8px" }}>{"\u2699"}</button>
          )}
        </div>
        {scrapeMode === "apify" && showActorConfig && (
          <div style={{ marginTop: "8px", padding: "8px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px" }}>
            <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px" }}>APIFY ACTOR IDS</div>
            <div style={{ display: "flex", gap: "6px", marginBottom: "4px", alignItems: "center" }}>
              <span style={{ fontSize: "9px", color: c.dim, width: "60px" }}>Tokopedia</span>
              <input value={tokoActorId} onChange={e => setTokoActorId(e.target.value)} style={{ ...inputStyle, flex: 1, padding: "3px 6px", fontSize: "10px" }} />
            </div>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <span style={{ fontSize: "9px", color: c.dim, width: "60px" }}>Shopee</span>
              <input value={shopeeActorId} onChange={e => setShopeeActorId(e.target.value)} style={{ ...inputStyle, flex: 1, padding: "3px 6px", fontSize: "10px" }} />
            </div>
          </div>
        )}
        {scrapeMode === "apify" && !apifyKey && (
          <div style={{ marginTop: "6px", fontSize: "10px", color: c.darkGold }}>{"\u26a0 Add Apify API token above"}</div>
        )}
      </div>

      <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid " + c.border2 }}>
        {[{ id: "auto", label: "\u26a1 LOOKUP" }, { id: "history", label: "\ud83d\udccb HISTORY" }, { id: "bulk", label: "\ud83d\udce6 BULK" }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: "10px 18px", background: mode === m.id ? c.surface : "transparent", color: mode === m.id ? c.gold : c.dimmest, border: mode === m.id ? "1px solid " + c.border2 : "1px solid transparent", borderBottom: mode === m.id ? "1px solid " + c.surface : "1px solid " + c.border2, cursor: "pointer", fontFamily: "monospace", fontSize: "11px", position: "relative", top: "1px", borderRadius: "4px 4px 0 0" }}>
            {m.label}
            {m.id === "history" && history.length > 0 && <span style={{ marginLeft: 4, color: c.green, fontSize: 9 }}>[{history.length}]</span>}
          </button>
        ))}
      </div>

      {mode === "auto" && (
        <div style={secStyle}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && runDryRun()} placeholder="Paste full Amazon.ae or Noon product URL..." style={{ ...inputStyle, flex: 1, fontSize: "13px", padding: "12px 14px" }} />
            <button onClick={runDryRun} disabled={loading || !url.trim() || cooldown > 0} style={{ ...btnStyle, padding: "12px 20px", fontSize: "11px", opacity: loading || !url.trim() || cooldown > 0 ? 0.4 : 1, whiteSpace: "nowrap" }}>
              {cooldown > 0 ? "WAIT " + cooldown + "s" : loading && !dryRunData ? "READING..." : "QUICK CHECK ~$0.02"}
            </button>
          </div>
          {loading && stage && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                <Spinner /><span style={{ fontSize: "12px", color: c.gold }}>{stage}</span>
              </div>
              <div style={{ width: "100%", height: "3px", background: c.border, borderRadius: "2px" }}>
                <div style={{ width: progress + "%", height: "100%", background: c.gold, borderRadius: "2px", transition: "width 0.3s" }} />
              </div>
              {waveStatus.length > 0 && <WaveStatusBar />}
            </div>
          )}
          {autoError && (
            <div style={{ padding: "12px", background: dark ? "#3a1a1a" : "#FEF2F2", border: "1px solid " + c.red + "44", borderRadius: "4px", marginBottom: "12px", fontSize: "12px", color: c.red }}>
              {"\u26a0 "}{autoError}
            </div>
          )}
          {!loading && !dryRunData && !autoError && (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: "36px", marginBottom: "10px", opacity: 0.15 }}>{"\u26a1"}</div>
              <div style={{ fontSize: "12px", color: c.dim }}>Paste a product URL and click Quick Check</div>
              <div style={{ marginTop: "16px", display: "inline-block", padding: "14px 20px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "6px", textAlign: "left", fontSize: "11px", lineHeight: 2 }}>
                <span style={{ color: c.green }}>{"\u2460 Quick Check"}</span> <span style={{ color: c.dimmer }}>{" \u2014 read + translate"}</span> <span style={{ color: c.dim }}>~$0.02</span><br />
                <span style={{ color: c.gold }}>{"\u2461 Indo Search & Margins"}</span> <span style={{ color: c.dimmer }}>{" \u2014 3-wave Tokopedia + Shopee + cost analysis"}</span> <span style={{ color: c.dim }}>~$0.15-0.20</span>
              </div>
            </div>
          )}
          {dryRunData && (<div>
            <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "10px" }}>
              <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>
                {"UAE PRODUCT "}{dryRunData.url && <a href={dryRunData.url} target="_blank" rel="noopener" style={{ color: c.dim, fontSize: "9px", marginLeft: "8px" }}>{"open link \u2197"}</a>}
              </div>
              <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>{dryRunData.product_name}</div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", fontSize: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ color: c.dim, fontSize: "10px" }}>AED</span>
                  <input type="number" value={dryRunData.price_aed || ""} onChange={e => setDryRunData({ ...dryRunData, price_aed: parseFloat(e.target.value) || 0 })} style={{ width: "80px", padding: "3px 6px", background: c.input, border: "1px solid " + (!dryRunData.price_aed ? c.red : c.border2), color: c.gold, fontFamily: "monospace", fontSize: "14px", fontWeight: 700, borderRadius: "3px", outline: "none", textAlign: "right" }} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ color: c.dim, fontSize: "10px" }}>QTY IN PACK:</span>
                  <input type="number" min="1" value={dryRunData.pack_quantity || 1} onChange={e => setDryRunData({ ...dryRunData, pack_quantity: parseInt(e.target.value) || 1 })} style={{ width: "50px", padding: "3px 6px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "12px", borderRadius: "3px", outline: "none", textAlign: "center" }} />
                </div>
                {dryRunData.price_aed > 0 && <span style={{ color: c.dim }}>{"\u2248 "}{fmtIDR((dryRunData.price_aed / (dryRunData.pack_quantity || 1)) * fx.AED_TO_IDR)}{" /unit"}</span>}
                {dryRunData.price_aed > 0 && <span style={{ color: c.dimmer }}>{"\u2248 "}{fmtUSD((dryRunData.price_aed / (dryRunData.pack_quantity || 1)) * fx.AEDUSD)}{" /unit"}</span>}
                <Badge text={dryRunData.source || "Amazon.ae"} />
                <Badge text={dryRunData.category} color={c.green} bg={c.sectionBg} />
                {dryRunData.rating > 0 && <span style={{ color: c.darkGold }}>{"\u2605 "}{dryRunData.rating}</span>}
              </div>
              {(!dryRunData.price_aed || dryRunData.price_aed === 0) && <div style={{ fontSize: "11px", color: c.darkGold, marginTop: "6px" }}>{"\u26a0 Price not detected \u2014 type the AED price above"}</div>}
            </div>
            <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "10px" }}>
              <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>TRANSLATION</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "12px", marginBottom: "10px" }}>
                <div><span style={{ color: c.dim }}>EN:</span> {dryRunData.clean_name_en}</div>
                <div><span style={{ color: c.dim }}>ID:</span> <span style={{ color: c.gold, fontWeight: 600 }}>{dryRunData.clean_name_id}</span></div>
              </div>
              {!indoResults && (<div>
                <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px" }}>{"SEARCH QUERIES \u2014 edit or add before searching"}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
                  {editableQueries.map((q, i) => (
                    <div key={i} style={{ display: "flex", gap: "4px" }}>
                      <input value={q} onChange={e => { const u = [...editableQueries]; u[i] = e.target.value; setEditableQueries(u); }} style={{ ...inputStyle, padding: "5px 8px", fontSize: "11px", flex: 1 }} />
                      <button onClick={() => setEditableQueries(editableQueries.filter((_, idx) => idx !== i))} style={{ background: "transparent", border: "1px solid " + c.red + "44", color: c.red, fontSize: "10px", padding: "4px 8px", borderRadius: "3px", cursor: "pointer" }}>{"\u2715"}</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  <input value={newQueryInput} onChange={e => setNewQueryInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newQueryInput.trim()) { setEditableQueries([...editableQueries, newQueryInput.trim()]); setNewQueryInput(""); } }} placeholder="Add keyword..." style={{ ...inputStyle, padding: "5px 8px", fontSize: "11px", flex: 1 }} />
                  <button onClick={() => { if (newQueryInput.trim()) { setEditableQueries([...editableQueries, newQueryInput.trim()]); setNewQueryInput(""); } }} style={{ ...btnSec, padding: "5px 12px", fontSize: "9px" }}>+ ADD</button>
                </div>
              </div>)}
            </div>
            {!indoResults && !loading && (
              <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + (scrapeMode === "apify" ? c.green : c.gold) + "44", borderRadius: "4px", marginBottom: "10px", textAlign: "center" }}>
                {scrapeMode === "apify" ? (
                  <>
                    <button onClick={runIndoSearchApify} disabled={!apifyKey || editableQueries.filter(q => q.trim()).length === 0} style={{ ...btnGreen, padding: "12px 36px", fontSize: "12px", opacity: !apifyKey || editableQueries.filter(q => q.trim()).length === 0 ? 0.4 : 1 }}>
                      {"\ud83d\udd77 SCRAPE TOKOPEDIA + SHOPEE \u2014 ~$0.02"}
                    </button>
                    {!apifyKey && <div style={{ fontSize: "10px", color: c.red, marginTop: "4px" }}>Add Apify token above</div>}
                  </>
                ) : (
                  <button onClick={runIndoSearch} disabled={cooldown > 0 || editableQueries.filter(q => q.trim()).length === 0} style={{ ...btnStyle, padding: "12px 36px", fontSize: "12px", opacity: cooldown > 0 ? 0.4 : 1 }}>
                    {cooldown > 0 ? "\u23f3 WAIT " + cooldown + "s" : "\ud83d\udd0d SEARCH INDONESIA + MARGINS \u2014 ~$0.15-0.20"}
                  </button>
                )}
              </div>
            )}
            {(uaeSimilar || indoResults || marginData) && (<div>
              <SectionToggle index={0} title={"UAE Market \u2014 Similar Products"} icon={"\ud83c\udde6\ud83c\uddea"} count={uaeSimilar?.similar?.length}>
                {!uaeSimilar && !loading && (
                  <div style={{ textAlign: "center", padding: "16px" }}>
                    <button onClick={runUaeSimilar} disabled={cooldown > 0 || loading} style={{ ...btnSec, padding: "10px 24px", fontSize: "11px", opacity: cooldown > 0 ? 0.4 : 1 }}>
                      {"\ud83c\udde6\ud83c\uddea FIND SIMILAR UAE PRODUCTS \u2014 ~$0.08-0.10"}
                    </button>
                  </div>
                )}
                {uaeSimilar?.price_stats && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "12px" }}>
                    {[{ l: "LOWEST", v: uaeSimilar.price_stats.lowest_aed, cl: c.green },{ l: "MEDIAN", v: uaeSimilar.price_stats.median_aed, cl: c.gold },{ l: "AVERAGE", v: uaeSimilar.price_stats.average_aed, cl: c.dim },{ l: "HIGHEST", v: uaeSimilar.price_stats.highest_aed, cl: c.red }].map(s => (
                      <div key={s.l} style={{ padding: "8px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                        <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "3px" }}>{s.l}</div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: s.cl }}>{fmtAED(s.v)}</div>
                        <div style={{ fontSize: "9px", color: c.dimmest }}>{fmtIDR(s.v * fx.AED_TO_IDR)}</div>
                      </div>
                    ))}
                  </div>
                )}
                {uaeSimilar?.similar?.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid " + c.border, fontSize: "11px" }}>
                    <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name} <span style={{ color: c.dimmest }}>{"\u00b7 "}{r.source}</span></div>
                    <div style={{ color: c.gold, fontWeight: 700, marginLeft: "10px", whiteSpace: "nowrap" }}>{fmtAED(r.price_aed)}</div>
                  </div>
                ))}
              </SectionToggle>
              <SectionToggle index={1} title={"Indonesia Market \u2014 " + (indoResults?.source === "apify" ? "Apify Scrape" : "Tokopedia & Shopee")} icon={"\ud83c\uddee\ud83c\udde9"} count={indoResults?.results?.length}>
                {/* Wave status summary inside results */}
                {indoResults?.wave_status && indoResults.wave_status.length > 0 && <WaveStatusBar />}
                {indoResults?.confidence && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", marginBottom: "12px", background: indoResults.confidence.level === "high" ? (dark ? "#0D2E1A" : "#E8F5EC") : indoResults.confidence.level === "medium" ? (dark ? "#2A2210" : "#FDF8ED") : (dark ? "#3a1a1a" : "#FEF2F2"), border: "1px solid " + (indoResults.confidence.level === "high" ? c.green + "44" : indoResults.confidence.level === "medium" ? c.gold + "44" : c.red + "44"), borderRadius: "4px" }}>
                    <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: indoResults.confidence.level === "high" ? c.green : indoResults.confidence.level === "medium" ? c.gold : c.red }}>
                      {"\u25cf "}{indoResults.confidence.level.toUpperCase()}{" CONFIDENCE"}
                    </div>
                    <div style={{ fontSize: "10px", color: c.dim, flex: 1 }}>
                      {indoResults.confidence.validCount || indoResults.results?.length}{" valid prices"}
                      {(indoResults.confidence.withSold || 0) > 0 && " \u00b7 " + indoResults.confidence.withSold + " with sold data"}
                    </div>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: c.dim }}>{indoResults.confidence.score}/100</div>
                  </div>
                )}
                {indoResults?.price_stats && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "12px" }}>
                    {[{ l: "LOWEST", v: indoResults.price_stats.lowest_idr, cl: c.green },{ l: "MEDIAN", v: indoResults.price_stats.median_idr, cl: c.gold },{ l: "AVERAGE", v: indoResults.price_stats.average_idr, cl: c.dim },{ l: "HIGHEST", v: indoResults.price_stats.highest_idr, cl: c.red }].map(s => (
                      <div key={s.l} style={{ padding: "8px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                        <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "3px" }}>{s.l}</div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: s.cl }}>{fmtIDR(s.v)}</div>
                        <div style={{ fontSize: "9px", color: c.dimmest }}>{fmtAED(s.v * fx.IDR_TO_AED)}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2.5fr 0.6fr 0.7fr 0.5fr", gap: "4px", padding: "5px 0", borderBottom: "1px solid " + c.border2, fontSize: "9px", color: c.dimmer, letterSpacing: "0.5px", textTransform: "uppercase", position: "sticky", top: 0, background: c.surface, zIndex: 1 }}>
                    <div>{"Product \u00b7 Seller"}</div><div>Source</div><div style={{ textAlign: "right" }}>Price</div><div style={{ textAlign: "right" }}>Sold</div>
                  </div>
                  {indoResults?.results?.map((r, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "2.5fr 0.6fr 0.7fr 0.5fr", gap: "4px", padding: "6px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", alignItems: "center", background: r.sold && r.sold.trim() ? (dark ? "#0D1F1522" : "#E8F5EC44") : "transparent" }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.url ? <a href={r.url} target="_blank" rel="noopener" style={{ color: c.text, textDecoration: "none" }} title={r.name}>{r.name}</a> : r.name}
                        {r.seller && <span style={{ color: c.dimmest }}>{" \u00b7 "}{r.seller}</span>}
                      </div>
                      <div><Badge text={r.source || "Tokopedia"} color={r.source === "Shopee" ? "#EE4D2D" : c.green} bg={r.source === "Shopee" ? (dark ? "#2D1508" : "#FFF0EC") : (dark ? "#0D2E1A" : "#E8F5EC")} /></div>
                      <div style={{ color: c.gold, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap" }}>{fmtIDR(r.price_idr)}</div>
                      <div style={{ color: r.sold ? c.darkGold : c.dimmest, textAlign: "right", fontSize: "10px" }}>{r.sold || "\u2014"}</div>
                    </div>
                  ))}
                </div>
              </SectionToggle>
              {marginData && (
                <SectionToggle index={2} title="Margin Analysis" icon={"\ud83d\udcca"}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "10px", color: c.dim }}>CALCULATE FOR:</span>
                    {[{ id: "unit", label: "Per Unit" }, { id: "custom", label: "Custom Qty" }, { id: "container", label: "Per Container (20ft)" }].map(m => (
                      <button key={m.id} onClick={() => setQtyMode(m.id)} style={{ padding: "4px 10px", background: qtyMode === m.id ? c.gold : "transparent", color: qtyMode === m.id ? c.btnText : c.dim, border: "1px solid " + (qtyMode === m.id ? c.gold : c.border2), borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "monospace" }}>{m.label}</button>
                    ))}
                    {qtyMode === "custom" && <input type="number" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} min="1" style={{ ...inputStyle, width: "80px", padding: "4px 8px", fontSize: "11px", textAlign: "center" }} />}
                    <span style={{ fontSize: "10px", color: c.dimmer }}>{"\u00d7 "}{getQty()}{" units"}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                    {[{ l: "BEST", m: marginData.margins.best },{ l: "MEDIAN", m: marginData.margins.median },{ l: "WORST", m: marginData.margins.worst }].map(x => (
                      <div key={x.l} style={{ padding: "12px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                        <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "4px" }}>{x.l}</div>
                        <div style={{ fontSize: "24px", fontWeight: 700, color: marginColor(x.m.margin) }}>{x.m.margin.toFixed(1)}%</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", padding: "12px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "10px", padding: "4px 0", borderBottom: "1px solid " + c.border2, color: c.dimmer, fontWeight: 700 }}>
                      <div>COST ITEM</div><div>USD</div><div>AED</div><div>IDR</div>
                    </div>
                    {(() => {
                      const m = marginData.margins.median;
                      const q = getQty();
                      return (<>
                        <PriceRow label={"UAE Sell \u00d7" + q} usd={m.uaeUSD * q} aed={m.uaeAED * q} idr={m.uaeIDR * q} />
                        <PriceRow label={"Indo Source \u00d7" + q} usd={m.indoUSD * q} aed={m.indoAED * q} idr={m.indoIDR * q} />
                        <PriceRow label={"Air Freight \u00d7" + q} usd={m.freightUSD * q} aed={m.freightAED * q} idr={m.freightIDR * q} />
                        <PriceRow label={"Customs 5% \u00d7" + q} usd={m.dutyUSD * q} aed={m.dutyAED * q} idr={m.dutyIDR * q} />
                        <PriceRow label={"Last Mile \u00d7" + q} usd={m.lastMileUSD * q} aed={m.lastMileAED * q} idr={m.lastMileIDR * q} />
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
                  <div style={{ marginTop: "10px", padding: "8px", borderRadius: "4px", textAlign: "center", fontSize: "12px", fontWeight: 600, background: marginData.margins.median.margin >= MARGIN_THRESHOLD.candidate ? STATUS_COLORS.Candidate.bg : marginData.margins.median.margin >= MARGIN_THRESHOLD.borderline ? STATUS_COLORS.Active.bg : STATUS_COLORS.Rejected.bg, border: "1px solid " + (marginData.margins.median.margin >= MARGIN_THRESHOLD.candidate ? STATUS_COLORS.Candidate.border : marginData.margins.median.margin >= MARGIN_THRESHOLD.borderline ? STATUS_COLORS.Active.border : STATUS_COLORS.Rejected.border), color: marginColor(marginData.margins.median.margin) }}>
                    {marginData.margins.median.margin >= MARGIN_THRESHOLD.candidate ? "\u2713 CANDIDATE" : marginData.margins.median.margin >= MARGIN_THRESHOLD.borderline ? "\u25cb BORDERLINE" : "\u2717 LOW MARGIN"}{" \u2014 "}{marginData.margins.median.margin.toFixed(1)}%
                  </div>
                </SectionToggle>
              )}
              <SectionToggle index={3} title={"Logistics \u2014 Freight & Transit"} icon={"\ud83d\udea2"}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <div style={{ fontSize: "10px", color: c.dimmer }}>
                    {freight.source === "live" ? "Live rates \u00b7 Updated " + new Date(freight.updated).toLocaleDateString() : "Using default estimates"}
                  </div>
                  <button onClick={fetchFreightRates} disabled={freightLoading} style={{ ...btnSec, padding: "5px 12px", fontSize: "9px", opacity: freightLoading ? 0.5 : 1 }}>
                    {freightLoading ? "Fetching..." : freight.source === "live" ? "\ud83d\udd04 Refresh" : "\ud83d\udce1 Fetch Live Rates ~$0.08"}
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div style={{ padding: "12px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px" }}>
                    <div style={{ fontSize: "10px", color: c.gold, fontWeight: 700, marginBottom: "8px" }}>{"\u2708 AIR FREIGHT"}</div>
                    <div style={{ fontSize: "12px", lineHeight: 1.8 }}>
                      <div><span style={{ color: c.dim }}>Rate:</span> <span style={{ color: c.gold, fontWeight: 700 }}>${freight.air?.rate_per_kg || 4}/kg</span></div>
                      <div><span style={{ color: c.dim }}>Min:</span> {freight.air?.min_kg || 100} kg</div>
                      <div style={{ marginTop: "6px", fontSize: "10px", color: c.dimmer, borderTop: "1px solid " + c.border, paddingTop: "6px" }}>
                        <div>{"Port\u2192Port: "}{freight.air?.transit?.port_port || "3-5 days"}</div>
                        <div>{"Port\u2192Door: "}{freight.air?.transit?.port_door || "5-7 days"}</div>
                        <div>{"Door\u2192Door: "}{freight.air?.transit?.door_door || "7-10 days"}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: "12px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px" }}>
                    <div style={{ fontSize: "10px", color: c.gold, fontWeight: 700, marginBottom: "8px" }}>{"\ud83d\udea2 OCEAN FREIGHT"}</div>
                    <div style={{ fontSize: "12px", lineHeight: 1.8 }}>
                      <div><span style={{ color: c.dim }}>20ft:</span> <span style={{ color: c.gold, fontWeight: 700 }}>${freight.ocean?.rate_20ft || 800}</span></div>
                      <div><span style={{ color: c.dim }}>40ft:</span> ${freight.ocean?.rate_40ft || 1400}</div>
                      <div><span style={{ color: c.dim }}>Per CBM:</span> ${freight.ocean?.rate_per_cbm || 45}</div>
                      <div style={{ marginTop: "6px", fontSize: "10px", color: c.dimmer, borderTop: "1px solid " + c.border, paddingTop: "6px" }}>
                        <div>{"Port\u2192Port: "}{freight.ocean?.transit?.port_port || "14-18 days"}</div>
                        <div>{"Port\u2192Door: "}{freight.ocean?.transit?.port_door || "18-25 days"}</div>
                        <div>{"Door\u2192Door: "}{freight.ocean?.transit?.door_door || "21-30 days"}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </SectionToggle>
            </div>)}
            {(indoResults || autoError) && !loading && (
              <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                <button onClick={resetLookup} style={{ ...btnSec, padding: "8px 20px", fontSize: "10px" }}>{"\u2190 NEW LOOKUP"}</button>
                {marginData && <button onClick={exportPDF} style={{ ...btnSec, padding: "8px 16px", fontSize: "10px" }}>{"\ud83d\udcc4 PDF"}</button>}
                {marginData && <button onClick={exportCurrentCSV} style={{ ...btnSec, padding: "8px 16px", fontSize: "10px" }}>{"\ud83d\udcca CSV"}</button>}
              </div>
            )}
          </div>)}
        </div>
      )}

      {mode === "history" && (
        <div style={secStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "6px" }}>
            <span style={{ fontSize: "10px", color: c.dim, letterSpacing: "1px" }}>{history.length}{" LOOKUPS \u00b7 PIN "}{currentPin.slice(0, 2)}**</span>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button style={btnSec} onClick={exportHistory}>QUICK CSV</button>
              <button style={btnSec} onClick={exportStructuredCSV}>{"\ud83d\udcca FULL CSV"}</button>
              <button style={btnSec} onClick={exportBackup}>{"\ud83d\udcbe BACKUP JSON"}</button>
              <input type="file" ref={backupFileRef} accept=".json" style={{ display: "none" }} onChange={e => e.target.files[0] && importBackup(e.target.files[0])} />
              <button style={btnSec} onClick={() => backupFileRef.current?.click()}>{"\ud83d\udcc2 RESTORE"}</button>
              <button style={{ ...btnSec, color: c.red, borderColor: c.red }} onClick={async () => { if (!confirm("Clear all history for PIN " + currentPin + "?")) return; setHistory([]); await saveHistory(currentPin, []); }}>CLEAR</button>
            </div>
          </div>
          {!history.length ? (
            <div style={{ textAlign: "center", padding: "40px", color: c.dimmer }}>No lookups yet for this PIN.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "550px", overflowY: "auto" }}>
              {history.map((h, i) => {
                const m = h.margins?.median?.margin || 0;
                const sc = STATUS_COLORS[h.status] || STATUS_COLORS.Candidate;
                const isExpanded = expandedHistoryIdx === i;
                const indoList = h.indoResults?.results || [];
                return (
                  <div key={i} style={{ background: c.surface2, border: "1px solid " + sc.border, borderRadius: "4px", borderLeft: "3px solid " + sc.text }}>
                    <div style={{ padding: "10px 12px", cursor: "pointer" }} onClick={() => setExpandedHistoryIdx(isExpanded ? -1 : i)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "12px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "3px" }}>{h.uaeProduct?.product_name}</div>
                          <div style={{ fontSize: "10px", color: c.dim, marginBottom: "3px" }}>{h.normalized?.clean_name_id}</div>
                          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                            <Badge text={"AED " + (h.uaeProduct?.price_aed || 0)} color={c.gold} bg={c.surface} />
                            <Badge text={fmtIDR(h.medianPriceIDR)} color={c.green} bg={c.surface} />
                            <Badge text={h.normalized?.category || ""} color={c.dim} bg={c.surface} />
                            {indoList.length > 0 && <Badge text={indoList.length + " listings"} color={c.dimmer} bg={c.surface} />}
                            <span style={{ fontSize: "9px", color: c.dimmest }}>{h.timestamp?.slice(0, 10)}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", marginLeft: "10px" }}>
                          <div style={{ fontSize: "18px", fontWeight: 700, color: marginColor(m) }}>{m.toFixed(1)}%</div>
                          <select value={h.status} onChange={e => { e.stopPropagation(); updateHistoryStatus(i, e.target.value); }} onClick={e => e.stopPropagation()} style={{ padding: "2px 4px", background: sc.bg, border: "1px solid " + sc.border, color: sc.text, fontFamily: "monospace", fontSize: "9px", borderRadius: "3px", marginTop: "2px" }}>
                            {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    {isExpanded && indoList.length > 0 && (
                      <div style={{ padding: "0 12px 12px", borderTop: "1px solid " + c.border }}>
                        <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", padding: "8px 0 4px", textTransform: "uppercase" }}>
                          {"INDONESIA LISTINGS ("}{indoList.length}{")"}
                        </div>
                        <div style={{ maxHeight: "250px", overflowY: "auto" }}>
                          {indoList.map((r, j) => (
                            <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid " + c.border, fontSize: "10px" }}>
                              <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {r.name} {r.seller && <span style={{ color: c.dimmest }}>{"\u00b7 "}{r.seller}</span>}
                              </div>
                              <div style={{ display: "flex", gap: "8px", marginLeft: "8px", whiteSpace: "nowrap" }}>
                                <span style={{ color: r.source === "Shopee" ? "#EE4D2D" : c.green, fontSize: "9px" }}>{r.source === "Shopee" ? "S" : "T"}</span>
                                <span style={{ color: c.gold, fontWeight: 700 }}>{fmtIDR(r.price_idr)}</span>
                                {r.sold && <span style={{ color: c.darkGold }}>{r.sold}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {isExpanded && indoList.length === 0 && (
                      <div style={{ padding: "8px 12px 12px", borderTop: "1px solid " + c.border, fontSize: "10px", color: c.dimmer }}>
                        No Indo listing data stored for this entry.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {mode === "bulk" && (
        <div style={secStyle}>
          <div style={{ display: "flex", gap: "2px", marginBottom: "14px", borderBottom: "1px solid " + c.border }}>
            {["\u2460 UAE", "\u2461 Norm", "\u2462 Indo", "\u2463 Calc", "\u2464 DB"].map((l, i) => (
              <button key={i} onClick={() => setBulkTab(i)} style={{ padding: "6px 12px", background: bulkTab === i ? c.surface2 : "transparent", color: bulkTab === i ? c.gold : c.dimmest, border: "none", cursor: "pointer", fontFamily: "monospace", fontSize: "10px", borderBottom: bulkTab === i ? "2px solid " + c.gold : "2px solid transparent" }}>{l}</button>
            ))}
          </div>
          {bulkTab === 0 && (
            <div>
              <input type="file" ref={fileRef} accept=".csv" style={{ display: "none" }} onChange={e => e.target.files[0] && handleUAEUpload(e.target.files[0])} />
              {!uaeProducts.length ? dropZone(false, handleUAEUpload, () => fileRef.current?.click(), "Drop UAE CSV") : (<div><span style={{ fontSize: "11px", color: c.green }}>{"\u2713 "}{uaeProducts.length}</span><button style={{ ...btnStyle, marginTop: "12px" }} onClick={() => setBulkTab(1)}>{"Next \u2192"}</button></div>)}
            </div>
          )}
          {bulkTab === 1 && (
            <div>
              {!uaeProducts.length ? <div style={{ color: c.dimmer, textAlign: "center", padding: "40px" }}>Upload first</div> : (<div>
                <button style={{ ...btnStyle, opacity: normalizing || !apiKey ? 0.5 : 1 }} onClick={runNormalization} disabled={normalizing || !apiKey}>{normalizing ? normProgress.toFixed(0) + "%" : "Normalize " + uaeProducts.length}</button>
                {normalized.length > 0 && <button style={{ ...btnStyle, marginTop: "12px" }} onClick={() => setBulkTab(2)}>{"Next \u2192"}</button>}
              </div>)}
            </div>
          )}
          {bulkTab === 2 && (
            <div>
              <input type="file" ref={indoFileRef} accept=".csv" style={{ display: "none" }} onChange={e => e.target.files[0] && handleIndoUpload(e.target.files[0])} />
              {!bulkIndoResults.length ? dropZone(true, handleIndoUpload, () => indoFileRef.current?.click(), "Drop Indo CSV") : (<div><span style={{ fontSize: "11px", color: c.green }}>{"\u2713 "}{bulkIndoResults.length}</span><button style={{ ...btnStyle, marginTop: "12px" }} onClick={() => setBulkTab(3)}>{"Next \u2192"}</button></div>)}
            </div>
          )}
          {bulkTab === 3 && (
            <button style={{ ...btnStyle, opacity: uaeProducts.length && bulkIndoResults.length ? 1 : 0.3 }} onClick={runMarginCalc} disabled={!uaeProducts.length || !bulkIndoResults.length}>Calculate Margins</button>
          )}
          {bulkTab === 4 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                <span style={{ fontSize: "10px", color: c.dim }}>{database.length} products</span>
                <button style={btnSec} onClick={() => {
                  const h = ["Name","Bahasa","AED","IDR","Margin%","Status"];
                  const r = database.map(p => ['"'+p.nameEn+'"','"'+p.nameId+'"',p.uaePriceAED,p.indoPriceIDR,p.grossMarginPct.toFixed(1),p.status].join(","));
                  const b = new Blob([[h.join(","),...r].join("\n")], { type: "text/csv" });
                  const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "bulk.csv"; a.click();
                }}>EXPORT</button>
              </div>
              {database.sort((a, b) => b.grossMarginPct - a.grossMarginPct).map(p => {
                const sc = STATUS_COLORS[p.status] || STATUS_COLORS.Candidate;
                return (
                  <div key={p.id} style={{ padding: "8px 10px", background: c.surface2, border: "1px solid " + sc.border, borderRadius: "4px", borderLeft: "3px solid " + sc.text, marginBottom: "4px", display: "flex", justifyContent: "space-between" }}>
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
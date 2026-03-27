import { useState, useEffect, useCallback, useRef } from "react";
// ══════════ SUPABASE CONFIG ══════════
const SUPABASE_URL = "https://cqpxzxafavqflnrilgjh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_f4N-v3Gs7qJsPW4jUe_fzw_u81VVIg3";
// ══════════ CONSTANTS ══════════
const DEFAULT_FX = { AEDUSD: 0.2723, IDRUSD: 0.0000613, AED_TO_IDR: 0.2723 / 0.0000613, IDR_TO_AED: 0.0000613 / 0.2723 };
const DEFAULT_FREIGHT = { air: { rate_per_kg: 4, min_kg: 100, transit: { port_port: "3-5 days", port_door: "5-7 days", door_door: "7-10 days" } }, ocean: { rate_20ft: 800, rate_40ft: 1400, rate_per_cbm: 45, transit: { port_port: "14-18 days", port_door: "18-25 days", door_door: "21-30 days" } }, source: "default", updated: null };
const CUSTOMS_DUTY = 0.05;
const LAST_MILE_AED = 20;
const MARGIN_THRESHOLD = { candidate: 40, borderline: 20 };
const WEIGHT_KG = { light: 0.3, medium: 1.0, heavy: 3.0 };
const STATUS_COLORS = { Candidate: { bg: "#0D2E1A", text: "#2EAA5A", border: "#1A5C32" }, Investigated: { bg: "#0D1F15", text: "#5BAD6E", border: "#1A4A2D" }, Rejected: { bg: "#3a1a1a", text: "#f87171", border: "#5a2d2d" }, Active: { bg: "#2A2210", text: "#D4A843", border: "#4A3D18" } };
const STATUS_COLORS_LIGHT = { Candidate: { bg: "#E8F5EC", text: "#1A7A3A", border: "#B6E2C4" }, Investigated: { bg: "#EDF7F0", text: "#3D8B56", border: "#C4E1CE" }, Rejected: { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" }, Active: { bg: "#FDF8ED", text: "#9A7A1C", border: "#E8D9A0" } };
const MAX_HISTORY = 2000;
const FX_CACHE_MS = 86400000;
const AMAZON_AE_DEPTS = [
  { slug: "electronics", label: "Electronics" }, { slug: "home", label: "Home" }, { slug: "kitchen", label: "Kitchen" },
  { slug: "fashion", label: "Fashion" }, { slug: "beauty", label: "Beauty" }, { slug: "books", label: "Books" },
  { slug: "automotive", label: "Automotive" }, { slug: "baby-products", label: "Baby" }, { slug: "sports", label: "Sports" },
  { slug: "toys", label: "Toys" }, { slug: "office-products", label: "Office" }, { slug: "garden", label: "Garden" },
  { slug: "pet-supplies", label: "Pets" }, { slug: "videogames", label: "Video Games" }, { slug: "computers", label: "Computers" },
  { slug: "health", label: "Health" }, { slug: "grocery", label: "Grocery" }, { slug: "tools", label: "Tools" },
  { slug: "luggage", label: "Luggage" }, { slug: "industrial", label: "Industrial" }, { slug: "musical-instruments", label: "Music" },
  { slug: "arts-crafts", label: "Arts & Crafts" }, { slug: "appliances", label: "Appliances" },
  { slug: "personal-care", label: "Personal Care" }, { slug: "watches", label: "Watches" },
];

// ══════════ v1 FEATURE: BLOCKED-SIGNAL DETECTION ══════════
const BLOCKED_SIGNALS = [
  { pattern: /login.{0,20}required|need.{0,10}log.?in|sign.?in.{0,10}to.{0,10}(view|access|see)/i, reason: "login wall detected" },
  { pattern: /captcha|verify.{0,10}(human|robot|not a bot)|security.{0,10}check/i, reason: "CAPTCHA/bot check" },
  { pattern: /access.{0,15}denied|forbidden|blocked|403/i, reason: "access denied/blocked" },
  { pattern: /no.{0,10}results?.{0,10}(found|available)|couldn.?t.{0,10}find.{0,15}(any|results)|did not (find|return)/i, reason: "search returned nothing" },
  { pattern: /unable to (access|search|find|retrieve).{0,20}(shopee|tokopedia)/i, reason: "platform unreachable" },
];

function detectBlockedSignals(rawText, platform) {
  for (const sig of BLOCKED_SIGNALS) {
    if (sig.pattern.test(rawText)) return platform + ": " + sig.reason;
  }
  // Check: response mentions the platform but has no prices at all
  if (rawText.toLowerCase().includes(platform.toLowerCase()) && !/\d{2,3}\.\d{3}|rp\s*\d|idr\s*\d|\d+\s*rupiah/i.test(rawText)) {
    return platform + ": response mentions platform but contains no prices";
  }
  return null;
}

// ══════════ HELPERS ══════════
function marginColor(m) { return isNaN(m) ? "#f87171" : m >= MARGIN_THRESHOLD.candidate ? "#2EAA5A" : m >= MARGIN_THRESHOLD.borderline ? "#D4A843" : "#f87171"; }
function fmtIDR(n) { return n != null && !isNaN(n) ? "IDR " + Math.round(n).toLocaleString() : "\u2014"; }
function fmtAED(n) { return n != null && !isNaN(n) ? "AED " + n.toFixed(2) : "\u2014"; }
function fmtUSD(n) { return n != null && !isNaN(n) ? "$" + n.toFixed(2) : "\u2014"; }
function escapeHtml(s) { return !s ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function sanitizeIDR(price) {
  if (typeof price === "string") { price = parseInt(price.replace(/^[Rr]p.?\s*/, "").replace(/\./g, "").replace(/,/g, "").trim(), 10) || 0; }
  if (typeof price !== "number" || isNaN(price)) return 0;
  if (price > 0 && price < 500) price = Math.round(price * 1000);
  if (price > 0 && price < 1000) price = Math.round(price * 1000);
  return Math.round(price);
}

function computeConfidence(results, priceStats) {
  const vp = results.filter(r => (r.price_idr || 0) >= 1000);
  const ws = results.filter(r => r.sold && r.sold.trim() && !/^-|^\u2014/.test(r.sold)).length;
  const spread = priceStats.highest_idr && priceStats.lowest_idr > 0 ? priceStats.highest_idr / priceStats.lowest_idr : 999;
  let score = 0, flags = [];
  if (vp.length >= 10) score += 40; else if (vp.length >= 5) score += 30; else if (vp.length >= 3) score += 20; else { score += 5; flags.push("Few valid prices"); }
  if (spread <= 3) score += 30; else if (spread <= 5) score += 20; else if (spread <= 10) score += 10; else flags.push("Wide spread (" + spread.toFixed(0) + "\u00d7)");
  if (ws >= 5) score += 20; else if (ws >= 2) score += 10; else flags.push("No sold data");
  const dr = results.length > 0 ? (results.length - vp.length) / results.length : 1;
  if (dr <= 0.1) score += 10; else if (dr <= 0.3) score += 5; else flags.push(Math.round(dr * 100) + "% discarded");
  return { score, level: score >= 70 ? "high" : score >= 40 ? "medium" : "low", flags, validCount: vp.length, totalCount: results.length, withSold: ws, spread: spread < 999 ? spread : null };
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

// ══════════ STORAGE LAYER ══════════
const supabaseReady = SUPABASE_URL !== "https://YOUR-PROJECT-ID.supabase.co" && SUPABASE_ANON_KEY !== "eyJ...your-anon-key-here...";
async function supabaseGet(key) { if (!supabaseReady) return null; const r = await fetch(SUPABASE_URL + "/rest/v1/kv_store?key=eq." + encodeURIComponent(key) + "&select=value", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } }); if (!r.ok) return null; const rows = await r.json(); return rows?.length ? JSON.parse(rows[0].value) : null; }
async function supabaseSet(key, val) { if (!supabaseReady) return false; const r = await fetch(SUPABASE_URL + "/rest/v1/kv_store", { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key, value: JSON.stringify(val), updated_at: new Date().toISOString() }) }); return r.ok; }
async function storeGet(key) { try { const v = await supabaseGet(key); if (v !== null) { try { localStorage.setItem("gt:" + key, JSON.stringify(v)); } catch {} return v; } } catch {} try { const v = localStorage.getItem("gt:" + key); return v ? JSON.parse(v) : null; } catch { return null; } }
async function storeSet(key, val) { try { localStorage.setItem("gt:" + key, JSON.stringify(val)); } catch {} try { return await supabaseSet(key, val); } catch { return false; } }

function compressEntry(h) {
  const mm = h.margins?.median || {};
  return { pn: h.uaeProduct?.product_name || "", pid: h.normalized?.clean_name_id || h.uaeProduct?.clean_name_id || "", pen: h.uaeProduct?.clean_name_en || h.normalized?.clean_name_en || "", br: h.uaeProduct?.brand || "", cat: h.normalized?.category || h.uaeProduct?.category || "", wc: h.weightClass || "medium", src: h.uaeProduct?.source || "", url: h.uaeProduct?.url || "", pa: h.uaeProduct?.price_aed || 0, pq: h.uaeProduct?.pack_quantity || 1, ir: (h.indoResults?.results || []).slice(0, 50).map(r => ({ n: r.name || "", p: r.price_idr || 0, s: r.source === "Shopee" ? "S" : "T", sl: r.seller || "", sd: r.sold || "" })), lo: h.lowestPriceIDR || 0, md: h.medianPriceIDR || 0, hi: h.highestPriceIDR || 0, nr: h.indoResults?.price_stats?.num_results || 0, mb: h.margins?.best?.margin || 0, mm: h.margins?.median?.margin || 0, mw: h.margins?.worst?.margin || 0, mc: { uU: mm.uaeUSD||0, uA: mm.uaeAED||0, uI: mm.uaeIDR||0, iU: mm.indoUSD||0, iA: mm.indoAED||0, iI: mm.indoIDR||0, fU: mm.freightUSD||0, fA: mm.freightAED||0, fI: mm.freightIDR||0, dU: mm.dutyUSD||0, dA: mm.dutyAED||0, dI: mm.dutyIDR||0, lU: mm.lastMileUSD||0, lA: mm.lastMileAED||0, lI: mm.lastMileIDR||0, tU: mm.totalUSD||0, tA: mm.totalAED||0, tI: mm.totalIDR||0 }, cs: h.confidence?.score || 0, cl: h.confidence?.level || "low", cf: h.confidence?.flags || [], st: h.status || "", ts: h.timestamp || "", ap: h.source === "apify" ? 1 : 0 };
}
function expandEntry(c) {
  if (c.uaeProduct) return c;
  const mc = c.mc || {};
  return { uaeProduct: { product_name: c.pn, clean_name_en: c.pen, clean_name_id: c.pid, brand: c.br, category: c.cat, weight_class: c.wc, source: c.src, url: c.url, price_aed: c.pa, pack_quantity: c.pq || 1 }, normalized: { clean_name_id: c.pid, clean_name_en: c.pen, category: c.cat, weight_class: c.wc }, indoResults: { results: (c.ir || []).map(r => ({ name: r.n, price_idr: r.p, source: r.s === "S" ? "Shopee" : "Tokopedia", seller: r.sl, sold: r.sd, url: "" })), price_stats: { lowest_idr: c.lo, median_idr: c.md, highest_idr: c.hi, num_results: c.nr }, confidence: { score: c.cs, level: c.cl, flags: c.cf } }, margins: { best: { margin: c.mb }, median: { margin: c.mm, uaeUSD: mc.uU, uaeAED: mc.uA, uaeIDR: mc.uI, indoUSD: mc.iU, indoAED: mc.iA, indoIDR: mc.iI, freightUSD: mc.fU, freightAED: mc.fA, freightIDR: mc.fI, dutyUSD: mc.dU, dutyAED: mc.dA, dutyIDR: mc.dI, lastMileUSD: mc.lU, lastMileAED: mc.lA, lastMileIDR: mc.lI, totalUSD: mc.tU, totalAED: mc.tA, totalIDR: mc.tI }, worst: { margin: c.mw } }, confidence: { score: c.cs, level: c.cl, flags: c.cf }, medianPriceIDR: c.md, lowestPriceIDR: c.lo, highestPriceIDR: c.hi, weightClass: c.wc, status: c.st, timestamp: c.ts, source: c.ap ? "apify" : "legacy" };
}
async function loadHistory(pin) { try { const d = await storeGet(pin + ":history"); return d?.length ? d.map(expandEntry) : []; } catch { return []; } }
async function saveHistory(pin, h) { try { return await storeSet(pin + ":history", h.map(compressEntry)); } catch { return false; } }
async function hashPin(pin) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin + "arb-salt-2026")); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join(""); }

const Badge = ({ text, color = "#2EAA5A", bg = "#0D2E1A" }) => <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "3px", fontSize: "10px", fontFamily: "monospace", background: bg, color, border: "1px solid " + color + "33" }}>{text}</span>;
const Spinner = () => <div style={{ width: "14px", height: "14px", border: "2px solid #C9A84C", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />;

// ══════════ v1 FEATURE: CONFIDENCE BADGE (reusable) ══════════
const ConfidenceBadge = ({ confidence, c }) => {
  if (!confidence) return null;
  const color = confidence.level === "high" ? c.green : confidence.level === "medium" ? c.darkGold : c.red;
  return <span style={{ fontSize: "9px", fontWeight: 700, color, padding: "1px 5px", borderRadius: "3px", border: "1px solid " + color + "44", fontFamily: "monospace" }}>{confidence.score}/100</span>;
};

// ══════════ v1 FEATURE: WAVE STATUS BAR (reusable) ══════════
const WaveStatusBar = ({ waves, c }) => {
  if (!waves?.length) return null;
  return (
    <div style={{ marginBottom: "12px", padding: "10px 12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px" }}>
      <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px", textTransform: "uppercase" }}>SEARCH WAVES</div>
      {waves.map((w, i) => {
        const icon = w.status === "ok" ? "\u2713" : w.status === "skip" ? "\u2014" : w.status === "empty" ? "\u25cb" : "\u2717";
        const wColor = w.status === "ok" ? c.green : w.status === "skip" ? c.dimmer : w.status === "empty" ? c.darkGold : c.red;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", fontSize: "11px" }}>
            <span style={{ color: wColor, fontWeight: 700, width: "14px", textAlign: "center" }}>{icon}</span>
            <span style={{ color: c.text, minWidth: "120px" }}>{w.name}</span>
            <span style={{ color: w.count > 0 ? c.green : c.dimmer, fontWeight: 600 }}>{w.count} results</span>
            {w.reason && <span style={{ color: c.dim, fontSize: "10px", fontStyle: "italic" }}>{w.reason}</span>}
          </div>
        );
      })}
    </div>
  );
};

// ══════════ COOKIE WIZARD ══════════
function CookieWizard({ c, onSave, onClose }) {
  const [step, setStep] = useState(0);
  const [pasted, setPasted] = useState("");
  const isValid = pasted.trim().startsWith("[") && pasted.trim().endsWith("]");
  const hasContent = pasted.trim().length > 5;
  const steps = [
    { title: "Open Shopee in Edge", body: "Open Microsoft Edge, go to shopee.co.id, and log in with your Shopee account. Make sure you can see your profile name at the top." },
    { title: "Open EditThisCookie", body: "Click the cookie icon in your Edge toolbar (top right). If you don\u2019t see it, install EditThisCookie v3 from Chrome Web Store \u2014 it works on Edge." },
    { title: "Export the Cookie", body: "In the EditThisCookie panel, look at the small icons at the top. Click the Export button \u2014 5th icon from the left, looks like an upload arrow. Your clipboard now has the cookie." },
    { title: "Paste it here", body: null },
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ width: "520px", maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", background: c.surface, border: "1px solid " + c.border2, borderRadius: "8px", padding: "28px" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ fontFamily: "'Instrument Serif',serif", fontSize: "20px", color: c.gold, margin: 0 }}>{"\ud83c\udf6a"} Shopee Cookie Setup</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: c.dim, fontSize: "18px", cursor: "pointer" }}>{"\u2715"}</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginBottom: "24px", gap: "4px" }}>
          {steps.map((_, i) => (<div key={i} style={{ display: "flex", alignItems: "center", flex: i < 3 ? 1 : 0 }}><div style={{ width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: i <= step ? c.gold : "transparent", color: i <= step ? c.btnText : c.dimmer, border: "2px solid " + (i <= step ? c.gold : c.border2), fontSize: "12px", fontWeight: 700, fontFamily: "monospace", flexShrink: 0 }}>{i + 1}</div>{i < 3 && <div style={{ flex: 1, height: "2px", background: i < step ? c.gold : c.border2, margin: "0 6px" }} />}</div>))}
        </div>
        <div style={{ padding: "16px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "6px", marginBottom: "20px", minHeight: "120px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: c.gold, marginBottom: "10px", fontFamily: "monospace" }}>{steps[step].title}</div>
          {step < 3 && <div style={{ fontSize: "13px", color: c.text, lineHeight: 1.7 }}>{steps[step].body}{step === 1 && <div style={{ marginTop: "10px" }}><a href="https://chromewebstore.google.com/detail/editthiscookie-v3/ojfpfkonmheifpbbmbaanpkgjhonbghc" target="_blank" rel="noopener" style={{ color: c.gold, fontSize: "11px", textDecoration: "underline" }}>{"\u2197 Install EditThisCookie v3"}</a></div>}</div>}
          {step === 3 && <div><textarea value={pasted} onChange={e => setPasted(e.target.value)} placeholder="Paste cookie JSON here..." style={{ width: "100%", minHeight: "120px", padding: "10px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "11px", borderRadius: "4px", outline: "none", resize: "vertical" }} />{hasContent && <div style={{ marginTop: "8px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>{isValid ? <><span style={{ color: c.green, fontSize: "16px" }}>{"\u2713"}</span><span style={{ color: c.green }}>Looks good</span></> : <><span style={{ color: c.red, fontSize: "16px" }}>{"\u2717"}</span><span style={{ color: c.red }}>Doesn't look right</span></>}</div>}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => step > 0 && setStep(step - 1)} style={{ padding: "8px 20px", background: "transparent", color: step > 0 ? c.dim : c.dimmest, border: "1px solid " + (step > 0 ? c.border2 : c.border), borderRadius: "4px", cursor: step > 0 ? "pointer" : "default", fontFamily: "monospace", fontSize: "11px" }}>{"< BACK"}</button>
          {step < 3 ? <button onClick={() => setStep(step + 1)} style={{ padding: "8px 24px", background: c.gold, color: c.btnText, border: "none", borderRadius: "4px", cursor: "pointer", fontFamily: "monospace", fontSize: "11px", fontWeight: 700 }}>{"NEXT >"}</button>
          : <button onClick={() => { if (isValid) { onSave(pasted.trim()); onClose(); } }} disabled={!isValid} style={{ padding: "8px 24px", background: isValid ? c.green : c.dimmest, color: "#fff", border: "none", borderRadius: "4px", cursor: isValid ? "pointer" : "default", fontFamily: "monospace", fontSize: "11px", fontWeight: 700, opacity: isValid ? 1 : 0.4 }}>{"\ud83c\udf6a SAVE COOKIE"}</button>}
        </div>
      </div>
    </div>
  );
}

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
  const toggleTheme = async () => { const n = !dark; setDark(n); await storeSet("global:theme", n ? "dark" : "light"); };

  const [mode, setMode] = useState("discovery");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState("");
  const [history, setHistory] = useState([]);
  const [fx, setFx] = useState(DEFAULT_FX);
  const [fxUpdated, setFxUpdated] = useState(null);
  const [freight, setFreight] = useState(DEFAULT_FREIGHT);

  // Config keys
  const [apifyKey, setApifyKey] = useState("");
  const [showApifyKey, setShowApifyKey] = useState(false);
  const [apifyStatus, setApifyStatus] = useState("");
  const [scrapingDogKey, setScrapingDogKey] = useState("");
  const [showSDKey, setShowSDKey] = useState(false);
  const [sdStatus, setSdStatus] = useState("");
  const [shopeeCookie, setShopeeCookie] = useState("");
  const [shopeeCookieUpdatedAt, setShopeeCookieUpdatedAt] = useState(null);
  const [showCookieWizard, setShowCookieWizard] = useState(false);
  const [indoMode, setIndoMode] = useState("apify");
  const [tokoActorId, setTokoActorId] = useState("jupri~tokopedia-scraper");
  const [shopeeActorId, setShopeeActorId] = useState("fatihtahta~shopee-scraper");
  const [noonActorId, setNoonActorId] = useState("buseta~noon-advanced-scraper");
  const [showActorConfig, setShowActorConfig] = useState(false);

  // Lookup state
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
  const [waveStatus, setWaveStatus] = useState([]);

  // Discovery state
  const [discSource, setDiscSource] = useState("amazon");
  const [discProducts, setDiscProducts] = useState([]);
  const [discScanning, setDiscScanning] = useState(false);
  const [discScanProgress, setDiscScanProgress] = useState({ done: 0, total: 0, current: "" });
  const [discLastScan, setDiscLastScan] = useState(null);
  const [discFilter, setDiscFilter] = useState({ dept: "all", minPrice: "", maxPrice: "", minReviews: "30", search: "" });
  const [discSort, setDiscSort] = useState("reviews");
  const [discError, setDiscError] = useState("");
  const [validatingIdx, setValidatingIdx] = useState(-1);
  const [validationResults, setValidationResults] = useState({});
  // v1 FEATURE: UAE Similar in Discovery
  const [discSimilarIdx, setDiscSimilarIdx] = useState(-1);
  const [discSimilarResults, setDiscSimilarResults] = useState({});
  // Noon discovery
  const [noonKeyword, setNoonKeyword] = useState("");
  const [noonLoading, setNoonLoading] = useState(false);
  const [noonResults, setNoonResults] = useState([]);

  const [expandedHistoryIdx, setExpandedHistoryIdx] = useState(-1);
  const saveTimerRef = useRef(null);
  const apiKeyLoaded = useRef(false);
  const apifyKeyLoaded = useRef(false);
  const sdKeyLoaded = useRef(false);
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

  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // v1 FEATURE: Progress bar helper
  const runWithProgress = async (fn, estimatedSec) => {
    setProgress(0);
    const interval = setInterval(() => { setProgress(p => { const next = p + (100 / estimatedSec / 4); return next > 95 ? 95 : next; }); }, 250);
    try { const result = await fn(); setProgress(100); clearInterval(interval); return result; } catch (e) { clearInterval(interval); setProgress(0); throw e; }
  };

  // ── Init ──
  useEffect(() => { (async () => { const h1 = await hashPin("766911"); const h2 = await hashPin("240996"); setPinHashes({ [h1]: "766911", [h2]: "240996" }); const t = await storeGet("global:theme"); if (t === "light") setDark(false); })(); }, []);
  const handleUnlock = async () => { if (lockedOut || !Object.keys(pinHashes).length) return; const h = await hashPin(pinInput); const mp = pinHashes[h]; if (mp) { setCurrentPin(mp); setUnlocked(true); setPinError(""); setPinInput(""); } else { const n = attempts + 1; setAttempts(n); setPinInput(""); if (n >= 5) setLockedOut(true); else setPinError("Wrong PIN (" + (5 - n) + " left)"); } };

  // ── Load data on unlock ──
  useEffect(() => {
    if (!unlocked || !currentPin) return;
    setStorageReady(false);
    (async () => {
      try {
        const cfg = await storeGet(currentPin + ":config");
        if (cfg) {
          if (cfg.apiKey) { apiKeyLoaded.current = true; setApiKey(cfg.apiKey); setApiKeyStatus("loaded"); }
          if (cfg.apifyKey) { apifyKeyLoaded.current = true; setApifyKey(cfg.apifyKey); setApifyStatus("loaded"); }
          if (cfg.scrapingDogKey) { sdKeyLoaded.current = true; setScrapingDogKey(cfg.scrapingDogKey); setSdStatus("loaded"); }
          if (cfg.tokoActorId) setTokoActorId(cfg.tokoActorId);
          if (cfg.shopeeActorId) setShopeeActorId(cfg.shopeeActorId);
          if (cfg.noonActorId) setNoonActorId(cfg.noonActorId);
          if (cfg.indoMode) setIndoMode(cfg.indoMode);
          if (cfg.freight) setFreight(cfg.freight);
          if (cfg.shopeeCookie) setShopeeCookie(cfg.shopeeCookie);
          if (cfg.shopeeCookieUpdatedAt) setShopeeCookieUpdatedAt(cfg.shopeeCookieUpdatedAt);
        }
        setHistory(await loadHistory(currentPin));
        const disc = await storeGet(currentPin + ":discovery");
        if (disc?.products?.length) { setDiscProducts(disc.products); setDiscLastScan(disc.scannedAt); }
      } catch (e) { console.warn("Load failed:", e); }
      setStorageReady(true);
    })();
  }, [unlocked, currentPin]);

  // ── Auto-save config ──
  useEffect(() => {
    if (!storageReady || !currentPin) return;
    const t = setTimeout(() => storeSet(currentPin + ":config", { apiKey, apifyKey, scrapingDogKey, tokoActorId, shopeeActorId, noonActorId, indoMode, freight: freight.source === "live" ? freight : null, shopeeCookie, shopeeCookieUpdatedAt }), 1500);
    return () => clearTimeout(t);
  }, [storageReady, currentPin, apiKey, apifyKey, scrapingDogKey, tokoActorId, shopeeActorId, noonActorId, indoMode, freight, shopeeCookie, shopeeCookieUpdatedAt]);

  // ── Auto-save history ──
  const saveHistoryNow = useCallback(async (h) => { if (currentPinRef.current) await saveHistory(currentPinRef.current, h); }, []);
  useEffect(() => { if (!storageReady || !currentPin) return; if (saveTimerRef.current) clearTimeout(saveTimerRef.current); saveTimerRef.current = setTimeout(() => saveHistory(currentPin, history), 2000); }, [history, storageReady, currentPin]);

  // ── Key status indicators ──
  useEffect(() => { if (!apiKey || apiKey.length < 10 || !storageReady) return; if (apiKeyLoaded.current) { apiKeyLoaded.current = false; return; } setApiKeyStatus("saved"); const t = setTimeout(() => setApiKeyStatus(""), 1500); return () => clearTimeout(t); }, [apiKey, storageReady]);
  useEffect(() => { if (!apifyKey || apifyKey.length < 5 || !storageReady) return; if (apifyKeyLoaded.current) { apifyKeyLoaded.current = false; return; } setApifyStatus("saved"); const t = setTimeout(() => setApifyStatus(""), 1500); return () => clearTimeout(t); }, [apifyKey, storageReady]);
  useEffect(() => { if (!scrapingDogKey || scrapingDogKey.length < 5 || !storageReady) return; if (sdKeyLoaded.current) { sdKeyLoaded.current = false; return; } setSdStatus("saved"); const t = setTimeout(() => setSdStatus(""), 1500); return () => clearTimeout(t); }, [scrapingDogKey, storageReady]);

  // ── Cooldown & FX ──
  useEffect(() => { if (cooldown <= 0) return; const t = setInterval(() => setCooldown(x => x <= 1 ? 0 : x - 1), 1000); return () => clearInterval(t); }, [cooldown]);
  useEffect(() => { if (!unlocked) return; (async () => { const cached = await storeGet("global:fx"); if (cached && Date.now() - cached.ts < FX_CACHE_MS) { const b = cached.rates; setFx({ AEDUSD: b.AEDUSD || 0.2723, IDRUSD: b.IDRUSD || 0.0000613, AED_TO_IDR: (b.AEDUSD || 0.2723) / (b.IDRUSD || 0.0000613), IDR_TO_AED: (b.IDRUSD || 0.0000613) / (b.AEDUSD || 0.2723) }); setFxUpdated(new Date(cached.ts)); return; } try { const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=AED,IDR"); const d = await r.json(); const aedusd = 1/d.rates.AED, idrusd = 1/d.rates.IDR; const rates = { AEDUSD: aedusd, IDRUSD: idrusd, AED_TO_IDR: aedusd/idrusd, IDR_TO_AED: idrusd/aedusd }; setFx(rates); setFxUpdated(new Date()); await storeSet("global:fx", { rates, ts: Date.now() }); } catch {} })(); }, [unlocked]);

  // ══════════ CORE: callClaude ══════════
  const callClaude = async (prompt, model, useSearch = false, retries = 2, maxTokens = 2048) => {
    const body = { action: "claude", data: { model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }], tools: useSearch ? [{ type: "web_search_20250305", name: "web_search" }] : undefined } };
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const r = await fetch("https://trades-proxy.sadewoahmadm.workers.dev", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (r.status === 429) { if (attempt < retries) { setStage(s => s.replace(/ \(retry.*/, "") + " (retry " + Math.round((attempt + 1) * (useSearch ? 15 : 8)) + "s...)"); await wait((attempt + 1) * (useSearch ? 15000 : 8000)); continue; } throw new Error("Rate limited. Wait 30s."); }
        if (!r.ok) { let d = ""; try { d = (await r.json()).error?.message || ""; } catch {} throw new Error("API " + r.status + ": " + (d || "error")); }
        const data = await r.json();
        return data.content?.map(b => b.text || "").filter(Boolean).join("\n") || "";
      } catch (err) { if (attempt === retries) throw err; await wait((attempt + 1) * 10000); }
    }
  };

  const parseJSON = (text) => {
    let s = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const matches = []; let depth = 0, start = -1;
    for (let i = 0; i < s.length; i++) { if (s[i] === "{") { if (depth === 0) start = i; depth++; } if (s[i] === "}") { depth--; if (depth === 0 && start >= 0) { matches.push(s.substring(start, i + 1)); start = -1; } } }
    for (const m of matches.sort((a, b) => b.length - a.length)) { try { const p = JSON.parse(m); if (p.product_name || p.results || p.clean_name_en || p.similar || p.products) return p; } catch {} }
    try { return JSON.parse(s); } catch {} throw new Error("No valid JSON");
  };

  // ══════════ MARGIN CALCULATOR (shared) ══════════
  const calcMargin = (uaePriceAed, packQty, indoIDR, weightClass) => {
    const uaeUnitAed = uaePriceAed / (packQty || 1);
    const uaeUSD = uaeUnitAed * fx.AEDUSD;
    const indoUSD = indoIDR * fx.IDRUSD;
    const wkg = WEIGHT_KG[weightClass] || 1.0;
    const fr = (freight.air?.rate_per_kg || 4) * wkg;
    const duty = (indoUSD + fr) * CUSTOMS_DUTY;
    const lm = LAST_MILE_AED * fx.AEDUSD;
    const total = indoUSD + fr + duty + lm;
    const margin = uaeUSD > 0 ? ((uaeUSD - total) / uaeUSD) * 100 : 0;
    return { uaeUSD, uaeAED: uaeUnitAed, uaeIDR: uaeUnitAed * fx.AED_TO_IDR, indoUSD, indoAED: indoUSD / fx.AEDUSD, indoIDR, freightUSD: fr, freightAED: fr / fx.AEDUSD, freightIDR: fr / fx.IDRUSD, dutyUSD: duty, dutyAED: duty / fx.AEDUSD, dutyIDR: duty / fx.IDRUSD, lastMileUSD: lm, lastMileAED: LAST_MILE_AED, lastMileIDR: LAST_MILE_AED * fx.AED_TO_IDR, totalUSD: total, totalAED: total / fx.AEDUSD, totalIDR: total / fx.IDRUSD, margin };
  };

  // ══════════ INDO SEARCH — APIFY MODE ══════════
  const runApifyActor = async (actorId, input, label) => {
    setStage("Starting " + label + "...");
    const sr = await fetch("https://api.apify.com/v2/acts/" + encodeURIComponent(actorId) + "/runs?token=" + apifyKey, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    if (!sr.ok) throw new Error(label + " failed: " + sr.status);
    const rd = await sr.json(); const runId = rd.data?.id; if (!runId) throw new Error(label + " no run ID");
    let status = "RUNNING", pc = 0;
    while (status === "RUNNING" || status === "READY") {
      if (pc > 60) throw new Error(label + " timeout"); await wait(5000); pc++;
      setStage(label + " (" + (pc * 5) + "s)"); setProgress(Math.min(90, pc * 3));
      try { const pr = await fetch("https://api.apify.com/v2/actor-runs/" + runId + "?token=" + apifyKey); if (pr.ok) { status = (await pr.json()).data?.status || "RUNNING"; } } catch {}
    }
    if (status !== "SUCCEEDED") throw new Error(label + " status: " + status);
    const dsId = rd.data?.defaultDatasetId; if (!dsId) throw new Error(label + " no dataset");
    const ir = await fetch("https://api.apify.com/v2/datasets/" + dsId + "/items?token=" + apifyKey + "&limit=50");
    return ir.ok ? await ir.json() : [];
  };

  const normalizeApifyResults = (items, platform) => {
    if (!Array.isArray(items)) return [];
    return items.filter(i => i && (i.price || i.currentPrice || i.salePrice || i.price_idr)).map(i => {
      let price = i.price || i.currentPrice || i.salePrice || i.price_idr || 0;
      if (typeof price === "string") price = sanitizeIDR(price);
      if (typeof price === "number" && price < 500) price = Math.round(price * 1000);
      return { name: i.title || i.name || i.productName || i.item_name || "", price_idr: Math.round(price), source: platform, seller: i.shopName || i.sellerName || i.seller || i.shop?.name || i.shop_name || "", sold: String(i.sold || i.totalSold || i.historicalSold || i.itemSold || i.historical_sold || ""), url: i.url || i.link || i.productUrl || i.item_url || "" };
    }).filter(r => r.price_idr >= 1000 && r.name);
  };

  const runIndoApify = async (bahasaQuery, allQueries) => {
    const waves = [];
    const tokoInput = { querystring: bahasaQuery, filters: { price_min: 10000, price_max: 800000, sort: "reviews" }, limit: 30 };
    const shopeeUrl = "https://shopee.co.id/search?keyword=" + encodeURIComponent(bahasaQuery) + "&price_min=10000&price_max=800000&sort=7";
    const shopeeInput = { searchUrls: [shopeeUrl], country: "ID", maxProducts: 30, scrapeMode: "fast" };
    if (shopeeCookie) shopeeInput.cookies = shopeeCookie;

    setStage("Scraping Toko + Shopee parallel..."); setProgress(10);
    const [tokoR, shopeeR] = await Promise.all([
      (async () => { try { return { items: await runApifyActor(tokoActorId, tokoInput, "Tokopedia"), err: null }; } catch (e) { return { items: [], err: e.message }; } })(),
      (async () => { try { return { items: await runApifyActor(shopeeActorId, shopeeInput, "Shopee"), err: null }; } catch (e) { return { items: [], err: e.message }; } })(),
    ]);
    const tokoResults = normalizeApifyResults(tokoR.items, "Tokopedia");
    const shopeeResults = normalizeApifyResults(shopeeR.items, "Shopee");
    waves.push({ name: "Tokopedia", status: tokoResults.length > 0 ? "ok" : tokoR.err ? "fail" : "empty", count: tokoResults.length, reason: tokoR.err || "" });
    // v1 FEATURE: Check Shopee blocked signals on raw Apify failure
    let shopeeReason = shopeeR.err || "";
    if (!shopeeReason && shopeeResults.length === 0 && !shopeeCookie) shopeeReason = "No cookie set \u2014 Shopee may block unauthenticated scrapes";
    if (!shopeeReason && shopeeResults.length === 0 && tokoResults.length >= 10) shopeeReason = "Shopee likely blocked \u2014 Tokopedia found " + tokoResults.length + " but Shopee returned 0";
    waves.push({ name: "Shopee", status: shopeeResults.length > 0 ? "ok" : shopeeR.err ? "fail" : "empty", count: shopeeResults.length, reason: shopeeReason });
    let allResults = [...tokoResults, ...shopeeResults];

    if (allResults.length < 5 && allQueries.length > 1) {
      try { const ri = await runApifyActor(tokoActorId, { querystring: allQueries[1], filters: { price_min: 10000, price_max: 800000, sort: "reviews" }, limit: 20 }, "Retry"); allResults.push(...normalizeApifyResults(ri, "Tokopedia")); waves.push({ name: "Retry", status: "ok", count: ri.length }); } catch { waves.push({ name: "Retry", status: "fail", count: 0 }); }
    }
    return { allResults, waves, source: "apify" };
  };

  // ══════════ INDO SEARCH — CLAUDE SEARCH MODE (with v1 blocked detection) ══════════
  const runIndoClaude = async (productData, queries) => {
    const waves = [];
    const mainQ = queries[0];
    const brandQ = productData.brand ? productData.brand + " " + (productData.clean_name_id || queries[0]) : null;

    const doSearch = async (platform, label) => {
      const site = platform === "Tokopedia" ? "tokopedia.com" : "shopee.co.id";
      setStage(label + " " + platform + "...");
      const searchLines = [
        '- Search: "' + mainQ + ' ' + site + '"',
        '- Search: "' + mainQ + ' ' + platform + ' Indonesia harga"',
        queries[1] ? '- Search: "' + queries[1] + ' ' + site + '"' : null,
        brandQ ? '- Search: "' + brandQ + ' ' + platform + '"' : null,
        platform === "Shopee" && productData.clean_name_en ? '- Search: "' + productData.clean_name_en + ' shopee indonesia price"' : null,
      ].filter(Boolean).join("\n");

      const raw = await runWithProgress(() => callClaude(
        'Find "' + productData.clean_name_id + '" (English: "' + (productData.clean_name_en || "") + '") on ' + platform + ' Indonesia.\n\n' + searchLines + '\n\nONLY ' + platform + ' (' + site + ') results. Include: name, price IDR, seller, sold count, link. Rp uses dots: Rp 25.000 = 25000. Try to find 10-20 listings.',
        "claude-sonnet-4-20250514", true, 2, 4096
      ), 25);

      // v1 FEATURE: Detect blocked signals in raw response
      const blockReason = detectBlockedSignals(raw, platform);

      await wait(1500);
      setStage(label + " Formatting...");
      const fmt = await runWithProgress(() => callClaude(
        'Convert to JSON. ONLY ' + platform + ':\n' + raw + '\n{"results":[{"name":"","price_idr":NUMBER,"source":"' + platform + '","seller":"","sold":"","url":""}]}\nprice_idr = INTEGER. JSON only:',
        "claude-haiku-4-5-20251001", false, 2, 4096
      ), 8);

      try {
        const p = parseJSON(fmt);
        const results = (p.results || []).map(r => ({
          name: r.name || "", price_idr: sanitizeIDR(r.price_idr || r.price || 0), source: platform, seller: r.seller || "",
          sold: (() => { let s = r.sold || ""; if (typeof s === "string" && /not visible|n\/a|^0$/i.test(s)) return ""; return s; })(),
          url: r.url || "",
        }));
        const validResults = results.filter(r => r.price_idr >= 1000);
        return { results, blockReason: validResults.length === 0 ? blockReason : null };
      } catch { return { results: [], blockReason: blockReason || (platform + ": JSON parse failed") }; }
    };

    let allResults = [];

    // Wave 1: Tokopedia
    try {
      const { results, blockReason } = await doSearch("Tokopedia", "\u2460");
      allResults.push(...results);
      const vc = results.filter(x => x.price_idr >= 1000).length;
      waves.push({ name: "Tokopedia", status: vc > 0 ? "ok" : "empty", count: vc, reason: blockReason || "" });
    } catch (e) { waves.push({ name: "Tokopedia", status: "fail", count: 0, reason: e.message }); }
    await wait(5000);

    // Wave 2: Shopee
    let shopeeCount = 0;
    try {
      const { results, blockReason } = await doSearch("Shopee", "\u2461");
      allResults.push(...results);
      shopeeCount = results.filter(x => x.price_idr >= 1000).length;
      let reason = blockReason || "";
      if (shopeeCount === 0 && !blockReason) reason = "Shopee may not be indexed by Google \u2014 try Apify mode";
      waves.push({ name: "Shopee", status: shopeeCount > 0 ? "ok" : "empty", count: shopeeCount, reason });
    } catch (e) { waves.push({ name: "Shopee", status: "fail", count: 0, reason: e.message }); }

    // Wave 3: Broad if needed
    if (allResults.filter(r => r.price_idr >= 1000).length < 10) {
      await wait(5000);
      const focusPlatform = shopeeCount === 0 ? "Shopee" : null;
      const focusNote = focusPlatform ? '\nFOCUS especially on ' + focusPlatform + ' results.' : '';
      setStage("\u2462 Broad search...");
      try {
        const raw = await runWithProgress(() => callClaude(
          'Search "' + mainQ + ' harga terbaru indonesia"\nSearch "' + (productData.clean_name_en || mainQ) + ' buy online indonesia IDR"\n' + (focusPlatform === "Shopee" ? 'Search "' + mainQ + ' shopee.co.id"\nSearch "shopee ' + (productData.clean_name_en || mainQ) + ' indonesia harga"\n' : '') + 'Both Tokopedia AND Shopee. Name, price IDR, marketplace, seller, sold, URL.' + focusNote,
          "claude-sonnet-4-20250514", true, 2, 4096
        ), 25);
        await wait(1500);
        const fmt = await callClaude('Convert:\n' + raw + '\n{"results":[{"name":"","price_idr":NUMBER,"source":"Tokopedia or Shopee","seller":"","sold":"","url":""}]} JSON only:', "claude-haiku-4-5-20251001", false, 2, 4096);
        try {
          const p = parseJSON(fmt);
          const r = (p.results || []).map(r => ({ name: r.name || "", price_idr: sanitizeIDR(r.price_idr || 0), source: r.source || "Tokopedia", seller: r.seller || "", sold: r.sold || "", url: r.url || "" }));
          allResults.push(...r);
          waves.push({ name: "Broad" + (focusPlatform ? " (" + focusPlatform + " focus)" : ""), status: r.length > 0 ? "ok" : "empty", count: r.filter(x => x.price_idr >= 1000).length });
        } catch {}
      } catch (e) { waves.push({ name: "Broad", status: "fail", count: 0, reason: e.message }); }
    }
    return { allResults, waves, source: "claude" };
  };

  // ══════════ SHARED: run Indo + build margin ══════════
  const runFullIndoSearch = async (productData, bahasaQueries) => {
    const { allResults: raw, waves, source } = indoMode === "apify"
      ? await runIndoApify(bahasaQueries[0], bahasaQueries)
      : await runIndoClaude(productData, bahasaQueries);

    // Dedup
    const seen = new Map();
    let allResults = raw.filter(r => { if (!r.name || r.price_idr < 1000) return false; const k = r.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40) + "|" + r.price_idr; if (seen.has(k)) return false; seen.set(k, true); return true; });
    if (allResults.length === 0) throw new Error("No Indonesian listings found.");

    // Outlier trim
    if (allResults.length >= 5) { const sorted = [...allResults].sort((a, b) => a.price_idr - b.price_idr); if (sorted[sorted.length - 1].price_idr / sorted[0].price_idr > 10) { const tc = Math.max(1, Math.floor(allResults.length * 0.1)); const trimmed = sorted.slice(tc, sorted.length - tc); if (trimmed.length >= 3) allResults = trimmed; } }

    const prices = allResults.map(r => r.price_idr).sort((a, b) => a - b);
    const indo = { results: allResults, price_stats: { lowest_idr: prices[0], highest_idr: prices[prices.length - 1], median_idr: prices[Math.floor(prices.length / 2)], average_idr: Math.round(prices.reduce((s, x) => s + x, 0) / prices.length), num_results: prices.length }, wave_status: waves, source };
    indo.confidence = computeConfidence(indo.results, indo.price_stats);

    const wc = productData.weight_class || "medium";
    const med = indo.price_stats.median_idr, low = indo.price_stats.lowest_idr, high = indo.price_stats.highest_idr;
    const margins = { median: calcMargin(productData.price_aed, productData.pack_quantity || 1, med, wc), best: calcMargin(productData.price_aed, productData.pack_quantity || 1, low, wc), worst: calcMargin(productData.price_aed, productData.pack_quantity || 1, high, wc) };
    const status = margins.median.margin >= MARGIN_THRESHOLD.candidate ? "Candidate" : margins.median.margin >= MARGIN_THRESHOLD.borderline ? "Investigated" : "Rejected";
    return { indo, margins, status, medianPriceIDR: med, lowestPriceIDR: low, highestPriceIDR: high, weightClass: wc };
  };

  // ══════════ DISCOVERY: Amazon.ae Bestseller Scan ══════════
  const runBestsellerScan = async () => {
    if (!scrapingDogKey || !apiKey) { setDiscError("Add ScrapingDog + Claude keys first."); return; }
    setDiscScanning(true); setDiscError(""); setDiscScanProgress({ done: 0, total: AMAZON_AE_DEPTS.length, current: "" });
    let allProducts = [];
    for (let i = 0; i < AMAZON_AE_DEPTS.length; i++) {
      const dept = AMAZON_AE_DEPTS[i];
      setDiscScanProgress({ done: i, total: AMAZON_AE_DEPTS.length, current: dept.label });
      try {
        const pageUrl = "https://www.amazon.ae/gp/bestsellers/" + dept.slug;
        const sdRes = await fetch("https://api.scrapingdog.com/scrape?api_key=" + encodeURIComponent(scrapingDogKey) + "&url=" + encodeURIComponent(pageUrl) + "&dynamic=true");
        if (!sdRes.ok) continue;
        const html = await sdRes.text();
        if (html.length < 500) continue;
        const parsed = await callClaude('Extract ALL products from this Amazon.ae Best Sellers HTML. Return ONLY JSON:\n{"products":[{"name":"product name","price_aed":NUMBER,"rating":NUMBER,"reviews":NUMBER,"asin":"ASIN if visible","url":"product URL if visible"}]}\nRULES:\n- price_aed must be NUMBER. "AED 49.00" = 49.\n- reviews must be INTEGER. "1,234" = 1234.\n- Extract ALL, aim 30-100.\nJSON only:\n' + html.slice(0, 60000), "claude-haiku-4-5-20251001", false, 1, 4096);
        try {
          const data = parseJSON(parsed);
          allProducts.push(...(data.products || data.results || []).map(p => ({ name: p.name || p.title || "", price_aed: parseFloat(p.price_aed || p.price || 0) || 0, rating: parseFloat(p.rating || 0) || 0, reviews: parseInt(p.reviews || 0) || 0, asin: p.asin || "", url: p.url || "", department: dept.label, source: "Amazon.ae" })).filter(p => p.name && p.name.length > 5));
        } catch {}
      } catch {}
      await wait(1500);
    }
    setDiscScanProgress({ done: AMAZON_AE_DEPTS.length, total: AMAZON_AE_DEPTS.length, current: "Done" });
    const ts = new Date().toISOString();
    setDiscProducts(allProducts); setDiscLastScan(ts);
    await storeSet(currentPin + ":discovery", { products: allProducts, scannedAt: ts });
    setDiscScanning(false);
  };

  // ══════════ DISCOVERY: Noon Search ══════════
  const runNoonDiscovery = async () => {
    if (!apifyKey || !noonKeyword.trim()) return;
    setNoonLoading(true); setDiscError("");
    try {
      setStage("Noon scraper...");
      const sr = await fetch("https://api.apify.com/v2/acts/" + encodeURIComponent(noonActorId) + "/runs?token=" + apifyKey + "&timeout=60", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scrape_type: "search", search_query: noonKeyword.trim() }) });
      if (!sr.ok) throw new Error("Noon actor failed: " + sr.status);
      const rd = await sr.json(); const runId = rd.data?.id, dsId = rd.data?.defaultDatasetId;
      let status = "RUNNING", pc = 0;
      while (status === "RUNNING" || status === "READY") { if (pc > 25) break; await wait(3000); pc++; setStage("Noon (" + (pc * 3) + "s)..."); try { const pr = await fetch("https://api.apify.com/v2/actor-runs/" + runId + "?token=" + apifyKey); if (pr.ok) status = (await pr.json()).data?.status || "RUNNING"; } catch {} }
      let items = [];
      if (dsId) { try { const ir = await fetch("https://api.apify.com/v2/datasets/" + dsId + "/items?token=" + apifyKey + "&limit=30"); if (ir.ok) items = await ir.json(); } catch {} }
      try { await fetch("https://api.apify.com/v2/actor-runs/" + runId + "/abort?token=" + apifyKey, { method: "POST" }); } catch {}
      setNoonResults(items.map(i => ({ name: i.title || i.name || "", price_aed: parseFloat(i.price || i.sale_price || i.now || 0) || 0, rating: parseFloat(i.rating || 0) || 0, reviews: parseInt(i.reviews || i.ratings_count || 0) || 0, source: "Noon.ae", url: i.url || i.link || "", department: "Noon" })).filter(p => p.name && p.price_aed > 0));
    } catch (e) { setDiscError(e.message); }
    setNoonLoading(false); setStage("");
  };

  // ══════════ DISCOVERY: Validate inline ══════════
  const validateProduct = async (product, idx) => {
    if (!apiKey) return;
    setValidatingIdx(idx);
    try {
      setStage("Translating...");
      const fmt = await callClaude('Translate for Indonesian marketplace. JSON only:\n{"clean_name_id":"Bahasa Indonesia","category":"electronics/kitchen/beauty/fashion/home/toys/sports/baby/office/other","weight_class":"light/medium/heavy","search_queries_id":["q1","q2","q3"]}\nProduct: "' + product.name + '" AED ' + product.price_aed + '\nJSON only:', "claude-haiku-4-5-20251001", false, 1, 1024);
      const parsed = parseJSON(fmt);
      const productData = { ...product, clean_name_id: parsed.clean_name_id || product.name, clean_name_en: product.name, category: parsed.category || guessCategory(product.name), weight_class: parsed.weight_class || "medium", pack_quantity: 1 };
      const queries = parsed.search_queries_id || [parsed.clean_name_id || product.name];
      const result = await runFullIndoSearch(productData, queries);
      const mData = { uaeProduct: productData, normalized: productData, indoResults: result.indo, margins: result.margins, confidence: result.indo.confidence, medianPriceIDR: result.medianPriceIDR, lowestPriceIDR: result.lowestPriceIDR, highestPriceIDR: result.highestPriceIDR, weightClass: result.weightClass, timestamp: new Date().toISOString(), source: result.indo.source, status: result.status };
      const newHistory = [mData, ...historyRef.current].slice(0, MAX_HISTORY);
      setHistory(newHistory); await saveHistoryNow(newHistory);
      // v1 FEATURE: Include confidence in validation results
      setValidationResults(prev => ({ ...prev, [idx]: { margin: result.margins.median.margin, status: result.status, indo: result.indo, confidence: result.indo.confidence } }));
    } catch (e) { setValidationResults(prev => ({ ...prev, [idx]: { margin: null, status: "Error", error: e.message } })); }
    setValidatingIdx(-1); setStage("");
  };

  // ══════════ v1 FEATURE: UAE SIMILAR PRODUCTS (in Discovery) ══════════
  const runUaeSimilar = async (product, idx) => {
    if (!apiKey) return;
    setDiscSimilarIdx(idx);
    try {
      setStage("Finding similar UAE products...");
      const rawSearch = await runWithProgress(() => callClaude(
        'Search Amazon.ae and Noon UAE for 8-10 products similar to "' + product.name + '".\nCategory: ' + (product.department || "general") + ' | Price: ~AED ' + product.price_aed + '\n\nSearch: "' + product.name + ' amazon.ae" and "' + product.name + ' noon uae"\n\nFind best sellers. List each with name, AED price, marketplace, ratings.',
        "claude-sonnet-4-20250514", true, 2, 4096
      ), 18);
      await wait(2000);
      setStage("Formatting...");
      const formatted = await runWithProgress(() => callClaude(
        'Convert to JSON:\n' + rawSearch + '\n\n{"similar":[{"name":"","price_aed":number,"source":"Amazon.ae or Noon","rating":0,"url":""}],"price_stats":{"lowest_aed":0,"highest_aed":0,"median_aed":0,"num_results":0}}\nAll prices AED. JSON only:',
        "claude-haiku-4-5-20251001", false, 2, 4096
      ), 6);
      const uaeData = parseJSON(formatted);
      if (!uaeData.similar) uaeData.similar = uaeData.results || [];
      if (!uaeData.price_stats && uaeData.similar.length > 0) {
        const p = uaeData.similar.map(x => x.price_aed || 0).filter(x => x > 0).sort((a, b) => a - b);
        uaeData.price_stats = { lowest_aed: p[0], highest_aed: p[p.length - 1], median_aed: p[Math.floor(p.length / 2)], num_results: p.length };
      }
      setDiscSimilarResults(prev => ({ ...prev, [idx]: uaeData }));
    } catch (e) { setDiscSimilarResults(prev => ({ ...prev, [idx]: { error: e.message } })); }
    setDiscSimilarIdx(-1); setStage("");
  };

  // ══════════ LOOKUP: Quick Check ══════════
  const runDryRun = async () => {
    const input = url.trim();
    if (!input || !input.startsWith("http")) { setAutoError("Invalid URL"); return; }
    if (!['amazon.ae','noon.com','noon.ae'].some(d => input.includes(d))) { setAutoError("Only Amazon.ae and Noon"); return; }
    if (!apiKey) { setApiKeyStatus("missing"); return; }
    setLoading(true); setAutoError(""); setDryRunData(null); setUaeSimilar(null); setIndoResults(null); setMarginData(null); setEditableQueries([]); setActiveSection(0); setWaveStatus([]);
    const isNoon = input.includes("noon.com"); const marketplace = isNoon ? "Noon UAE" : "Amazon.ae";
    const asinMatch = input.match(/\/dp\/([A-Z0-9]{10})/i) || input.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
    const asin = asinMatch ? asinMatch[1] : "";
    try {
      setStage("Reading product... (~10s)");
      const rawInfo = await runWithProgress(() => callClaude("Find EXACT product details for this " + marketplace + " listing.\nURL: " + input + "\n" + (asin ? "ASIN: " + asin + "\n" : "") + "Search the URL and product ID. I need: exact name, price AED, brand, rating, reviews, key specs, pack size/quantity.", "claude-haiku-4-5-20251001", true, 2, 4096), 12);
      setStage("Formatting... (~5s)"); await wait(2000);
      const formatted = await runWithProgress(() => callClaude("Convert to JSON:\n" + rawInfo + "\nURL: " + input + "\nMarketplace: " + marketplace + "\n\n{\"product_name\":\"\",\"price_aed\":NUMBER,\"pack_quantity\":NUMBER,\"brand\":\"\",\"rating\":NUMBER,\"reviews\":NUMBER,\"source\":\"" + marketplace + "\",\"clean_name_en\":\"\",\"clean_name_id\":\"Bahasa translation\",\"category\":\"\",\"weight_class\":\"light/medium/heavy\",\"search_queries_id\":[\"q1\",\"q2\",\"q3\"],\"search_queries_en\":[\"q1\",\"q2\"]}\n\nCRITICAL: price_aed=NUMBER. pack_quantity=INTEGER (how many items in bundle/multipack, default 1). search_queries_id=Bahasa. JSON only:", "claude-haiku-4-5-20251001", false, 2, 2048), 6);
      let data; try { data = parseJSON(formatted); } catch { throw new Error("Format failed."); }
      if (!data.product_name) throw new Error("Product not found.");
      if (!data.price_aed) { const pm = rawInfo.match(/AED\s*(\d+(?:\.\d+)?)/i); if (pm) data.price_aed = parseFloat(pm[1]); }
      data.source = data.source || marketplace; data.url = input;
      setDryRunData(data);
      setEditableQueries([...(data.search_queries_id || [data.clean_name_id]), ...(data.search_queries_en || [])]);
      setStage("");
      if (!data.price_aed) setAutoError("Product found but price not detected. Enter it manually.");
    } catch (err) { setAutoError(err.message); setStage(""); if (err.message.includes("429")) setCooldown(30); }
    setLoading(false);
  };

  // ══════════ LOOKUP: Indo Search ══════════
  const runLookupIndoSearch = async () => {
    if (!dryRunData) return;
    setLoading(true); setAutoError(""); setIndoResults(null); setMarginData(null); setWaveStatus([]);
    const queries = editableQueries.filter(q => q.trim());
    if (!queries.length) { setAutoError("Add at least one query."); setLoading(false); return; }
    try {
      const result = await runFullIndoSearch(dryRunData, queries);
      setIndoResults(result.indo); setWaveStatus(result.indo.wave_status || []);
      const mData = { uaeProduct: dryRunData, normalized: dryRunData, uaeSimilar, indoResults: result.indo, margins: result.margins, confidence: result.indo.confidence, medianPriceIDR: result.medianPriceIDR, lowestPriceIDR: result.lowestPriceIDR, highestPriceIDR: result.highestPriceIDR, weightClass: result.weightClass, timestamp: new Date().toISOString(), source: result.indo.source, status: result.status };
      setMarginData(mData);
      const nh = [mData, ...historyRef.current].slice(0, MAX_HISTORY);
      setHistory(nh); await saveHistoryNow(nh);
      setActiveSection(2);
    } catch (err) { setAutoError(err.message); if (err.message.includes("429")) setCooldown(30); }
    setLoading(false); setStage("");
  };

  const updateHistoryStatus = (i, s) => setHistory(prev => prev.map((x, idx) => idx === i ? { ...x, status: s } : x));
  const resetLookup = () => { setDryRunData(null); setUaeSimilar(null); setIndoResults(null); setMarginData(null); setAutoError(""); setUrl(""); setEditableQueries([]); setActiveSection(0); setWaveStatus([]); };

  // ══════════ EXPORTS ══════════
  const exportBackup = () => { const b = new Blob([JSON.stringify({ pin: currentPin, exportedAt: new Date().toISOString(), history: history.map(compressEntry) }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "gt-backup-" + new Date().toISOString().slice(0, 10) + ".json"; a.click(); };
  const importBackup = (file) => { const r = new FileReader(); r.onload = async (e) => { try { const b = JSON.parse(e.target.result); if (!b.history?.length) throw new Error("Invalid"); const exp = b.history.map(expandEntry); setHistory(exp); await saveHistory(currentPin, exp); alert("Restored " + exp.length + " lookups"); } catch (err) { alert("Import failed: " + err.message); } }; r.readAsText(file); };
  const backupFileRef = useRef(null);

  // v1 FEATURE: STRUCTURED CSV EXPORT (replaces v2 basic CSV)
  const exportStructuredCSV = () => {
    if (!history.length) return;
    const headers = ["Date","Product Name EN","Product Name ID","Brand","Category","Weight Class","Source","Pack Qty","UAE Price AED","UAE Price USD","UAE Price IDR","Indo Median IDR","Indo Lowest IDR","Indo Highest IDR","Indo Median USD","Freight USD","Customs USD","Last Mile USD","Total Cost USD","Total Cost AED","Total Cost IDR","Margin Best %","Margin Median %","Margin Worst %","Confidence Score","Confidence Level","Status"];
    const rows = history.map(h => {
      const m = h.margins?.median || {};
      return [
        h.timestamp?.slice(0,10)||"",
        '"'+(h.uaeProduct?.product_name||"").replace(/"/g,'""')+'"',
        '"'+(h.normalized?.clean_name_id||h.uaeProduct?.clean_name_id||"").replace(/"/g,'""')+'"',
        '"'+(h.uaeProduct?.brand||"")+'"',
        h.normalized?.category||h.uaeProduct?.category||"",
        h.weightClass||h.normalized?.weight_class||"",
        h.uaeProduct?.source||"",
        h.uaeProduct?.pack_quantity||1,
        h.uaeProduct?.price_aed||0,
        (m.uaeUSD||0).toFixed(2),
        (m.uaeIDR||0).toFixed(0),
        h.medianPriceIDR||0,
        h.lowestPriceIDR||0,
        h.highestPriceIDR||0,
        (m.indoUSD||0).toFixed(2),
        (m.freightUSD||0).toFixed(2),
        (m.dutyUSD||0).toFixed(2),
        (m.lastMileUSD||0).toFixed(2),
        (m.totalUSD||0).toFixed(2),
        (m.totalAED||0).toFixed(2),
        (m.totalIDR||0).toFixed(0),
        (h.margins?.best?.margin||0).toFixed(1),
        (h.margins?.median?.margin||0).toFixed(1),
        (h.margins?.worst?.margin||0).toFixed(1),
        h.confidence?.score||0,
        h.confidence?.level||"",
        h.status||""
      ].join(",");
    });
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gt-crosstrade-analysis-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
  };

  // Quick CSV (basic — kept for fast exports)
  const exportQuickCSV = () => { if (!history.length) return; const h = ["Date","Product","AED","Bahasa","Category","Indo Median IDR","Margin %","Status"]; const r = history.map(x => [x.timestamp?.slice(0,10)||"",'"'+(x.uaeProduct?.product_name||"")+'"',x.uaeProduct?.price_aed||0,'"'+(x.normalized?.clean_name_id||"")+'"',x.normalized?.category||"",x.medianPriceIDR||0,(x.margins?.median?.margin||0).toFixed(1),x.status||""].join(",")); const b = new Blob([[h.join(","),...r].join("\n")], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "gt-history-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); };

  // v1 FEATURE: PDF EXPORT
  const exportPDF = () => {
    if (!marginData) return;
    const m = marginData.margins.median;
    const q = getQty();
    const conf = marginData.confidence;
    const confLine = conf ? '<div style="padding:8px;background:' + (conf.level === "high" ? "#e8f5ec" : conf.level === "medium" ? "#fdf8ed" : "#fef2f2") + ';border-radius:4px;margin-top:12px;text-align:center;font-size:12px"><strong>Data Confidence:</strong> ' + conf.score + '/100 (' + conf.level.toUpperCase() + ')' + (conf.flags?.length ? ' &mdash; ' + conf.flags.join(', ') : '') + '</div>' : '';
    const html = '<!DOCTYPE html><html><head><title>GT Cross-Trade Analysis</title><style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#1a1a1a}h1{font-size:20px;border-bottom:2px solid #1a7a3a;padding-bottom:8px}h2{font-size:14px;color:#8B6914;margin-top:24px}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{padding:8px 12px;border:1px solid #ddd;text-align:left;font-size:12px}th{background:#f5f2eb;font-weight:700}.green{color:#1a7a3a}.red{color:#dc2626}.gold{color:#8B6914}.big{font-size:28px;font-weight:700;text-align:center;padding:16px}.verdict{padding:12px;text-align:center;border-radius:4px;font-weight:700;margin-top:16px}@media print{body{padding:20px}}</style></head><body>' +
      '<h1>GT Cross-Trade Analysis</h1>' +
      '<p><strong>Date:</strong> ' + new Date().toLocaleDateString() + ' | <strong>FX:</strong> 1 AED = ' + Math.round(fx.AED_TO_IDR) + ' IDR</p>' +
      '<h2>Product</h2><table>' +
      '<tr><th>Name</th><td>' + escapeHtml(marginData.uaeProduct?.product_name) + '</td></tr>' +
      '<tr><th>Bahasa</th><td>' + escapeHtml(marginData.normalized?.clean_name_id) + '</td></tr>' +
      '<tr><th>Category</th><td>' + (marginData.normalized?.category || "") + '</td></tr>' +
      '<tr><th>Source</th><td>' + (marginData.uaeProduct?.source || "") + ' | AED ' + (marginData.uaeProduct?.price_aed || 0) + (marginData.uaeProduct?.pack_quantity > 1 ? ' (' + marginData.uaeProduct.pack_quantity + '-pack)' : '') + '</td></tr></table>' +
      '<h2>Indonesia Market (Median of ' + (marginData.indoResults?.price_stats?.num_results || 0) + ' listings)</h2><table>' +
      '<tr><th></th><th>Lowest</th><th>Median</th><th>Highest</th></tr>' +
      '<tr><th>IDR</th><td>' + fmtIDR(marginData.lowestPriceIDR) + '</td><td>' + fmtIDR(marginData.medianPriceIDR) + '</td><td>' + fmtIDR(marginData.highestPriceIDR) + '</td></tr></table>' +
      confLine +
      '<h2>Margin Analysis (\u00d7' + q + ' units)</h2><table>' +
      '<tr><th>Item</th><th>USD</th><th>AED</th><th>IDR</th></tr>' +
      '<tr><th>UAE Sell</th><td>' + fmtUSD(m.uaeUSD*q) + '</td><td>' + fmtAED(m.uaeAED*q) + '</td><td>' + fmtIDR(m.uaeIDR*q) + '</td></tr>' +
      '<tr><th>Indo Source</th><td>' + fmtUSD(m.indoUSD*q) + '</td><td>' + fmtAED(m.indoAED*q) + '</td><td>' + fmtIDR(m.indoIDR*q) + '</td></tr>' +
      '<tr><th>Air Freight</th><td>' + fmtUSD(m.freightUSD*q) + '</td><td>' + fmtAED(m.freightAED*q) + '</td><td>' + fmtIDR(m.freightIDR*q) + '</td></tr>' +
      '<tr><th>Customs 5%</th><td>' + fmtUSD(m.dutyUSD*q) + '</td><td>' + fmtAED(m.dutyAED*q) + '</td><td>' + fmtIDR(m.dutyIDR*q) + '</td></tr>' +
      '<tr><th>Last Mile</th><td>' + fmtUSD(m.lastMileUSD*q) + '</td><td>' + fmtAED(m.lastMileAED*q) + '</td><td>' + fmtIDR(m.lastMileIDR*q) + '</td></tr>' +
      '<tr style="font-weight:700;background:#fef2f2"><th class="red">Total Cost</th><td class="red">' + fmtUSD(m.totalUSD*q) + '</td><td class="red">' + fmtAED(m.totalAED*q) + '</td><td class="red">' + fmtIDR(m.totalIDR*q) + '</td></tr>' +
      '<tr style="font-weight:700;background:#e8f5ec"><th class="green">Profit</th><td class="green">' + fmtUSD((m.uaeUSD-m.totalUSD)*q) + '</td><td class="green">' + fmtAED((m.uaeAED-m.totalAED)*q) + '</td><td class="green">' + fmtIDR((m.uaeIDR-m.totalIDR)*q) + '</td></tr></table>' +
      '<div class="big">' + (m.margin >= MARGIN_THRESHOLD.candidate ? '<span class="green">' : '<span class="red">') + m.margin.toFixed(1) + '% Gross Margin</span></div>' +
      '<div class="verdict" style="background:' + (m.margin >= MARGIN_THRESHOLD.candidate ? '#e8f5ec;color:#1a7a3a' : m.margin >= MARGIN_THRESHOLD.borderline ? '#fdf8ed;color:#8B6914' : '#fef2f2;color:#dc2626') + '">' + (m.margin >= MARGIN_THRESHOLD.candidate ? "\u2713 CANDIDATE" : m.margin >= MARGIN_THRESHOLD.borderline ? "\u25cb BORDERLINE" : "\u2717 LOW MARGIN") + '</div>' +
      '<script>window.onload=()=>window.print()<\/script></body></html>';
    const w = window.open("", "_blank"); w.document.write(html); w.document.close();
  };

  // ══════════ STYLES ══════════
  const inputStyle = { width: "100%", padding: "10px 12px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "13px", borderRadius: "3px", outline: "none" };
  const btnStyle = { padding: "10px 24px", background: c.gold, color: c.btnText, border: "none", cursor: "pointer", fontFamily: "'JetBrains Mono',monospace", fontSize: "12px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", borderRadius: "3px" };
  const btnSec = { ...btnStyle, background: "transparent", color: c.gold, border: "1px solid " + c.gold };
  const btnGreen = { ...btnStyle, background: c.green, color: "#fff" };
  const secStyle = { padding: "24px", background: c.surface, border: "1px solid " + c.border2, borderTop: "none", minHeight: "420px", borderRadius: "0 0 4px 4px" };
  const candidates = history.filter(h => (h.margins?.median?.margin || 0) >= MARGIN_THRESHOLD.candidate);

  // ── Discovery filtered/sorted products ──
  const filteredDisc = (discSource === "noon" ? noonResults : discProducts).filter(p => {
    const f = discFilter;
    if (f.dept !== "all" && p.department !== f.dept) return false;
    if (f.minPrice && p.price_aed < parseFloat(f.minPrice)) return false;
    if (f.maxPrice && p.price_aed > parseFloat(f.maxPrice)) return false;
    if (f.minReviews && p.reviews < parseInt(f.minReviews)) return false;
    if (f.search && !p.name.toLowerCase().includes(f.search.toLowerCase())) return false;
    return p.price_aed > 0;
  }).sort((a, b) => discSort === "reviews" ? b.reviews - a.reviews : discSort === "price_asc" ? a.price_aed - b.price_aed : discSort === "price_desc" ? b.price_aed - a.price_aed : b.rating - a.rating);

  const departments = [...new Set(discProducts.map(p => p.department))].sort();
  const cookieAgeDays = shopeeCookieUpdatedAt ? Math.floor((Date.now() - shopeeCookieUpdatedAt) / 86400000) : null;
  const cookieColor = cookieAgeDays === null ? c.dimmer : cookieAgeDays <= 10 ? c.green : cookieAgeDays <= 12 ? c.darkGold : c.red;

  const SectionToggle = ({ index, title, icon, children, count }) => (
    <div style={{ marginBottom: "8px", border: "1px solid " + (activeSection === index ? c.gold + "44" : c.border), borderRadius: "6px", overflow: "hidden" }}>
      <button onClick={() => setActiveSection(activeSection === index ? -1 : index)} style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px", background: activeSection === index ? c.surface2 : c.surface, border: "none", cursor: "pointer", textAlign: "left", color: c.text, fontFamily: "'JetBrains Mono',monospace", fontSize: "12px" }}>
        <span style={{ fontSize: "16px" }}>{icon}</span><span style={{ flex: 1, fontWeight: 600, color: activeSection === index ? c.gold : c.text }}>{title}</span>
        {count !== undefined && <span style={{ color: c.green, fontSize: "10px" }}>{count}</span>}
        <span style={{ color: c.dimmer }}>{activeSection === index ? "\u25be" : "\u25b8"}</span>
      </button>
      {activeSection === index && <div style={{ padding: "16px", borderTop: "1px solid " + c.border }}>{children}</div>}
    </div>
  );

  const PriceRow = ({ label, usd, aed, idr }) => <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "4px 0", borderBottom: "1px solid " + c.border }}><div style={{ color: c.dim }}>{label}</div><div style={{ color: c.gold }}>{fmtUSD(usd)}</div><div>{fmtAED(aed)}</div><div>{fmtIDR(idr)}</div></div>;

  const getQty = () => qtyMode === "container" ? Math.floor(24000 / (WEIGHT_KG[dryRunData?.weight_class || "medium"] || 1)) : qtyMode === "custom" ? qty : 1;

  // ══════════ RENDER ══════════
  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "'JetBrains Mono','Fira Code',monospace", padding: "24px", transition: "background 0.3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Instrument+Serif&display=swap" rel="stylesheet" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {showCookieWizard && <CookieWizard c={c} onClose={() => setShowCookieWizard(false)} onSave={ck => { setShopeeCookie(ck); setShopeeCookieUpdatedAt(Date.now()); }} />}

      {!unlocked ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh", position: "relative" }}>
          <button onClick={toggleTheme} style={{ position: "absolute", top: 0, right: 0, background: "transparent", border: "1px solid " + c.border2, color: c.dim, fontFamily: "monospace", fontSize: "11px", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}>{dark ? "\u2600" : "\ud83c\udf19"}</button>
          <div style={{ width: "340px", padding: "40px", background: c.surface, border: "1px solid " + c.border, borderRadius: "8px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "16px", opacity: 0.3 }}>{"\ud83d\udd12"}</div>
            <h2 style={{ fontFamily: "'Instrument Serif',serif", fontSize: "24px", fontWeight: 400, color: c.gold, marginBottom: "8px" }}>{lockedOut ? "Access Denied" : "Enter PIN"}</h2>
            {lockedOut ? <p style={{ fontSize: "13px", color: c.red }}>Too many attempts.</p> : <div>
              <p style={{ fontSize: "12px", color: c.dimmer, marginBottom: "24px" }}>Restricted access</p>
              <input type="password" value={pinInput} onChange={e => { setPinInput(e.target.value); setPinError(""); }} onKeyDown={e => e.key === "Enter" && handleUnlock()} placeholder="PIN" autoFocus style={{ width: "100%", padding: "14px", background: c.input, border: "1px solid " + (pinError ? c.red : c.border2), color: c.gold, fontFamily: "monospace", fontSize: "18px", borderRadius: "4px", textAlign: "center", letterSpacing: "8px", outline: "none", marginBottom: "12px" }} />
              {pinError && <div style={{ fontSize: "12px", color: c.red, marginBottom: "12px" }}>{pinError}</div>}
              <button onClick={handleUnlock} style={{ width: "100%", padding: "12px", background: c.gold, color: c.btnText, border: "none", borderRadius: "4px", fontFamily: "monospace", fontWeight: 700, letterSpacing: "1px", cursor: "pointer" }}>UNLOCK</button>
            </div>}
          </div>
        </div>
      ) : !storageReady ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: "16px" }}><Spinner /><div style={{ fontSize: "12px", color: c.dim }}>Loading...</div></div>
      ) : (<>

      {/* ══════════ HEADER ══════════ */}
      <div style={{ marginBottom: "16px", borderBottom: "1px solid " + c.border, paddingBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ fontFamily: "'Instrument Serif',serif", fontSize: "28px", fontWeight: 400, color: c.gold, margin: 0 }}>GT Cross-Trade <span style={{ fontSize: "12px", color: c.dimmer, fontFamily: "monospace" }}>v3.0</span></h1>
            <div style={{ fontSize: "10px", color: c.dimmer, marginTop: "4px", letterSpacing: "2px", textTransform: "uppercase" }}>UAE {"\u2190"} Indonesia {"\u00b7"} PIN {currentPin.slice(0,2)}** {"\u00b7"} {fxUpdated ? "FX " + fxUpdated.toLocaleDateString() : "FX: defaults"} {"\u00b7"} <span style={{ color: supabaseReady ? c.green : c.darkGold }}>{supabaseReady ? "\u25cf DB" : "\u25cb local"}</span></div>
          </div>
          <div style={{ display: "flex", gap: "12px", fontSize: "11px", alignItems: "flex-end" }}>
            <div style={{ textAlign: "right" }}><div style={{ color: c.dimmer }}>LOOKUPS</div><div style={{ color: c.gold, fontSize: "16px", fontWeight: 700 }}>{history.length}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ color: c.dimmer }}>CANDIDATES</div><div style={{ color: c.green, fontSize: "16px", fontWeight: 700 }}>{candidates.length}</div></div>
            <button onClick={toggleTheme} style={{ background: c.surface2, border: "1px solid " + c.border2, color: c.dim, fontFamily: "monospace", fontSize: "10px", padding: "6px 10px", borderRadius: "4px", cursor: "pointer" }}>{dark ? "\u2600" : "\ud83c\udf19"}</button>
          </div>
        </div>
      </div>

      {/* ══════════ CONFIG ══════════ */}
      <div style={{ marginBottom: "12px", padding: "10px 12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px" }}>
        {[
          { label: "CLAUDE", val: apiKey, set: setApiKey, show: showKey, toggle: () => setShowKey(!showKey), status: apiKeyStatus, ph: "sk-ant-..." },
          { label: "APIFY", val: apifyKey, set: setApifyKey, show: showApifyKey, toggle: () => setShowApifyKey(!showApifyKey), status: apifyStatus, ph: "apify_api_..." },
          { label: "SCRAPINGDOG", val: scrapingDogKey, set: setScrapingDogKey, show: showSDKey, toggle: () => setShowSDKey(!showSDKey), status: sdStatus, ph: "ScrapingDog key..." },
        ].map(k => (
          <div key={k.label} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "9px", color: c.dim, letterSpacing: "1px", width: "80px" }}>{k.label}</span>
            <input type={k.show ? "text" : "password"} value={k.val} onChange={e => k.set(e.target.value)} placeholder={k.ph} style={{ ...inputStyle, flex: 1, padding: "4px 8px", fontSize: "11px" }} />
            <button onClick={k.toggle} style={{ ...btnSec, padding: "4px 8px", fontSize: "9px" }}>{k.show ? "HIDE" : "SHOW"}</button>
            {k.status && <span style={{ fontSize: "10px", color: k.status === "missing" ? c.red : c.green }}>{"\u2713"}</span>}
          </div>
        ))}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "9px", color: c.dim, letterSpacing: "1px", width: "80px" }}>COOKIE</span>
          <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "10px", fontFamily: "monospace", background: cookieAgeDays === null ? c.surface : cookieAgeDays <= 10 ? (dark ? "#0D2E1A" : "#E8F5EC") : cookieAgeDays <= 12 ? (dark ? "#2A2210" : "#FDF8ED") : (dark ? "#3a1a1a" : "#FEF2F2"), color: cookieColor, border: "1px solid " + cookieColor + "44" }}>{cookieAgeDays === null ? "No cookie" : cookieAgeDays + " days ago"}</span>
          <button onClick={() => setShowCookieWizard(true)} style={{ ...btnSec, padding: "4px 10px", fontSize: "9px" }}>{"\ud83c\udf6a Update"}</button>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "8px" }}>
          <span style={{ fontSize: "9px", color: c.dim, letterSpacing: "1px", width: "80px" }}>INDO MODE</span>
          {[{ id: "apify", label: "Apify (~$0.02)" }, { id: "claude", label: "Claude Search (~$0.15)" }].map(m => (
            <button key={m.id} onClick={() => setIndoMode(m.id)} style={{ padding: "4px 10px", fontSize: "10px", fontFamily: "monospace", cursor: "pointer", background: indoMode === m.id ? (m.id === "apify" ? c.green : c.gold) : "transparent", color: indoMode === m.id ? (m.id === "apify" ? "#fff" : c.btnText) : c.dim, border: "1px solid " + (indoMode === m.id ? (m.id === "apify" ? c.green : c.gold) : c.border2), borderRadius: "3px" }}>{m.label}</button>
          ))}
          <button onClick={() => setShowActorConfig(!showActorConfig)} style={{ ...btnSec, padding: "3px 8px", fontSize: "8px" }}>{showActorConfig ? "\u25be" : "\u2699"}</button>
        </div>
        {showActorConfig && <div style={{ padding: "8px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "4px" }}>
          {[{ l: "Tokopedia", v: tokoActorId, s: setTokoActorId }, { l: "Shopee", v: shopeeActorId, s: setShopeeActorId }, { l: "Noon", v: noonActorId, s: setNoonActorId }].map(a => (
            <div key={a.l} style={{ display: "flex", gap: "6px", marginBottom: "4px", alignItems: "center" }}><span style={{ fontSize: "9px", color: c.dim, width: "60px" }}>{a.l}</span><input value={a.v} onChange={e => a.s(e.target.value)} style={{ ...inputStyle, flex: 1, padding: "3px 6px", fontSize: "10px" }} /></div>
          ))}
        </div>}
      </div>

      {/* ══════════ TAB BAR ══════════ */}
      <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid " + c.border2 }}>
        {[{ id: "discovery", label: "\ud83d\udd0d DISCOVERY" }, { id: "auto", label: "\u26a1 LOOKUP" }, { id: "history", label: "\ud83d\udccb HISTORY" }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: "10px 18px", background: mode === m.id ? c.surface : "transparent", color: mode === m.id ? c.gold : c.dimmest, border: mode === m.id ? "1px solid " + c.border2 : "1px solid transparent", borderBottom: mode === m.id ? "1px solid " + c.surface : "1px solid " + c.border2, cursor: "pointer", fontFamily: "monospace", fontSize: "11px", position: "relative", top: "1px", borderRadius: "4px 4px 0 0" }}>
            {m.label}{m.id === "history" && history.length > 0 && <span style={{ marginLeft: 4, color: c.green, fontSize: 9 }}>[{history.length}]</span>}
            {m.id === "discovery" && discProducts.length > 0 && <span style={{ marginLeft: 4, color: c.green, fontSize: 9 }}>[{discProducts.length}]</span>}
          </button>
        ))}
      </div>

      {/* ══════════ DISCOVERY TAB ══════════ */}
      {mode === "discovery" && <div style={secStyle}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", alignItems: "center" }}>
          {[{ id: "amazon", label: "Amazon.ae" }, { id: "noon", label: "Noon.ae" }].map(s => (
            <button key={s.id} onClick={() => setDiscSource(s.id)} style={{ padding: "6px 14px", fontSize: "11px", fontFamily: "monospace", cursor: "pointer", background: discSource === s.id ? c.gold : "transparent", color: discSource === s.id ? c.btnText : c.dim, border: "1px solid " + (discSource === s.id ? c.gold : c.border2), borderRadius: "3px" }}>{s.label}</button>
          ))}
          {discSource === "amazon" && discLastScan && <span style={{ fontSize: "10px", color: c.dimmer, marginLeft: "8px" }}>Last scan: {new Date(discLastScan).toLocaleDateString()}</span>}
        </div>

        {discSource === "amazon" && <div style={{ marginBottom: "16px" }}>
          <button onClick={runBestsellerScan} disabled={discScanning || !scrapingDogKey || !apiKey} style={{ ...btnGreen, padding: "12px 28px", fontSize: "12px", opacity: discScanning || !scrapingDogKey || !apiKey ? 0.4 : 1 }}>
            {discScanning ? "SCANNING " + discScanProgress.done + "/" + discScanProgress.total + " \u2014 " + discScanProgress.current + "..." : discProducts.length > 0 ? "\ud83d\udd04 RESCAN (~$0.30)" : "\ud83d\udd0d SCAN BESTSELLERS (~$0.30)"}
          </button>
          {!scrapingDogKey && <span style={{ fontSize: "10px", color: c.red, marginLeft: "8px" }}>Add ScrapingDog key</span>}
          {discScanning && <div style={{ marginTop: "8px", width: "100%", height: "3px", background: c.border, borderRadius: "2px" }}><div style={{ width: (discScanProgress.done / Math.max(1, discScanProgress.total) * 100) + "%", height: "100%", background: c.gold, borderRadius: "2px", transition: "width 0.5s" }} /></div>}
        </div>}

        {discSource === "noon" && <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <input value={noonKeyword} onChange={e => setNoonKeyword(e.target.value)} onKeyDown={e => e.key === "Enter" && !noonLoading && runNoonDiscovery()} placeholder="Search Noon..." style={{ ...inputStyle, flex: 1, padding: "10px 12px" }} />
          <button onClick={runNoonDiscovery} disabled={noonLoading || !noonKeyword.trim() || !apifyKey} style={{ ...btnStyle, opacity: noonLoading ? 0.4 : 1 }}>{noonLoading ? "SEARCHING..." : "\ud83d\udd0d SEARCH NOON"}</button>
        </div>}

        {discError && <div style={{ padding: "12px", background: dark ? "#3a1a1a" : "#FEF2F2", border: "1px solid " + c.red + "44", borderRadius: "4px", marginBottom: "12px", fontSize: "12px", color: c.red }}>{"\u26a0 "}{discError}</div>}
        {(loading || noonLoading) && stage && <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}><Spinner /><span style={{ fontSize: "12px", color: c.gold }}>{stage}</span></div>}

        {/* Filters */}
        {(discProducts.length > 0 || noonResults.length > 0) && <div style={{ display: "flex", gap: "6px", marginBottom: "12px", flexWrap: "wrap", alignItems: "center" }}>
          {discSource === "amazon" && <select value={discFilter.dept} onChange={e => setDiscFilter({ ...discFilter, dept: e.target.value })} style={{ ...inputStyle, width: "auto", padding: "5px 8px", fontSize: "10px" }}>
            <option value="all">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>}
          <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
            <span style={{ fontSize: "9px", color: c.dimmer }}>AED</span>
            <input value={discFilter.minPrice} onChange={e => setDiscFilter({ ...discFilter, minPrice: e.target.value })} placeholder="Min" style={{ ...inputStyle, width: "60px", padding: "5px 6px", fontSize: "10px", textAlign: "center" }} />
            <span style={{ color: c.dimmest }}>{"\u2014"}</span>
            <input value={discFilter.maxPrice} onChange={e => setDiscFilter({ ...discFilter, maxPrice: e.target.value })} placeholder="Max" style={{ ...inputStyle, width: "60px", padding: "5px 6px", fontSize: "10px", textAlign: "center" }} />
          </div>
          <div style={{ display: "flex", gap: "3px", alignItems: "center" }}>
            <span style={{ fontSize: "9px", color: c.dimmer }}>Reviews{"\u2265"}</span>
            <input value={discFilter.minReviews} onChange={e => setDiscFilter({ ...discFilter, minReviews: e.target.value })} style={{ ...inputStyle, width: "50px", padding: "5px 6px", fontSize: "10px", textAlign: "center" }} />
          </div>
          <input value={discFilter.search} onChange={e => setDiscFilter({ ...discFilter, search: e.target.value })} placeholder="Search names..." style={{ ...inputStyle, width: "150px", padding: "5px 8px", fontSize: "10px" }} />
          <div style={{ display: "flex", gap: "3px" }}>
            {[{ id: "reviews", label: "Reviews" }, { id: "price_asc", label: "Price \u2191" }, { id: "price_desc", label: "Price \u2193" }, { id: "rating", label: "Rating" }].map(s => (
              <button key={s.id} onClick={() => setDiscSort(s.id)} style={{ padding: "3px 8px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", background: discSort === s.id ? c.gold : "transparent", color: discSort === s.id ? c.btnText : c.dim, border: "1px solid " + (discSort === s.id ? c.gold : c.border2), borderRadius: "3px" }}>{s.label}</button>
            ))}
          </div>
          <span style={{ fontSize: "10px", color: c.green }}>{filteredDisc.length} products</span>
        </div>}

        {/* Results table — with v1 FEATURES: confidence display + UAE Similar (SIM) button */}
        {filteredDisc.length > 0 && <div style={{ maxHeight: "500px", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2.2fr 0.7fr 0.5fr 0.6fr 0.5fr 1fr", gap: "6px", padding: "6px 0", borderBottom: "1px solid " + c.border2, fontSize: "9px", color: c.dimmer, letterSpacing: "0.5px", textTransform: "uppercase", position: "sticky", top: 0, background: c.surface, zIndex: 1 }}>
            <div>Product</div><div style={{ textAlign: "right" }}>Price</div><div style={{ textAlign: "center" }}>Rating</div><div style={{ textAlign: "right" }}>Reviews</div><div style={{ textAlign: "center" }}>Dept</div><div style={{ textAlign: "center" }}>Actions</div>
          </div>
          {filteredDisc.slice(0, 200).map((p, i) => {
            const vr = validationResults[i];
            const sr = discSimilarResults[i];
            return (
              <div key={i}>
                <div style={{ display: "grid", gridTemplateColumns: "2.2fr 0.7fr 0.5fr 0.6fr 0.5fr 1fr", gap: "6px", padding: "8px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", alignItems: "center", background: vr?.status === "Candidate" ? (dark ? "#0D2E1A22" : "#E8F5EC44") : vr?.status === "Rejected" ? (dark ? "#3a1a1a22" : "#FEF2F244") : "transparent" }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.url ? <a href={p.url} target="_blank" rel="noopener" style={{ color: c.text, textDecoration: "none" }}>{p.name}</a> : p.name}
                  </div>
                  <div style={{ color: c.gold, fontWeight: 700, textAlign: "right" }}>{fmtAED(p.price_aed)}</div>
                  <div style={{ textAlign: "center", color: c.darkGold }}>{p.rating > 0 ? "\u2605" + p.rating.toFixed(1) : "\u2014"}</div>
                  <div style={{ textAlign: "right", color: c.dim }}>{p.reviews > 0 ? p.reviews.toLocaleString() : "\u2014"}</div>
                  <div style={{ textAlign: "center" }}><Badge text={p.department?.slice(0, 6) || "?"} color={c.dim} bg={c.surface2} /></div>
                  <div style={{ textAlign: "center", display: "flex", gap: "4px", justifyContent: "center", alignItems: "center" }}>
                    {/* VALIDATE button / result */}
                    {validatingIdx === i ? <Spinner /> : vr ? (
                      <span style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: marginColor(vr.margin) }}>{vr.margin != null ? vr.margin.toFixed(0) + "%" : "ERR"}</span>
                        {/* v1 FEATURE: Show confidence score alongside margin */}
                        {vr.confidence && <ConfidenceBadge confidence={vr.confidence} c={c} />}
                      </span>
                    ) : (
                      <button onClick={() => validateProduct(p, i)} style={{ padding: "3px 8px", background: c.green, color: "#fff", border: "none", borderRadius: "3px", fontSize: "9px", fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}>VALIDATE</button>
                    )}
                    {/* v1 FEATURE: SIM button for UAE Similar Products */}
                    {discSimilarIdx === i ? <Spinner /> : (
                      <button onClick={() => runUaeSimilar(p, i)} disabled={discSimilarIdx >= 0} style={{ padding: "3px 6px", background: "transparent", color: sr ? c.green : c.dim, border: "1px solid " + (sr ? c.green + "44" : c.border2), borderRadius: "3px", fontSize: "8px", fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }} title="Find similar UAE products">{sr ? "\u2713 SIM" : "SIM"}</button>
                    )}
                  </div>
                </div>
                {/* v1 FEATURE: Expanded UAE Similar results row */}
                {sr && !sr.error && sr.similar && (
                  <div style={{ padding: "8px 12px", background: c.surface2, borderBottom: "1px solid " + c.border, fontSize: "10px" }}>
                    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "6px" }}>
                      {sr.price_stats && <>
                        <span style={{ color: c.green }}>Lo: {fmtAED(sr.price_stats.lowest_aed)}</span>
                        <span style={{ color: c.gold }}>Med: {fmtAED(sr.price_stats.median_aed)}</span>
                        <span style={{ color: c.red }}>Hi: {fmtAED(sr.price_stats.highest_aed)}</span>
                        <span style={{ color: c.dimmer }}>{sr.price_stats.num_results} similar</span>
                      </>}
                    </div>
                    {sr.similar.slice(0, 5).map((s, j) => (
                      <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.name} <span style={{ color: c.dimmest }}>{s.source}</span></span>
                        <span style={{ color: c.gold, fontWeight: 700, marginLeft: "8px" }}>{fmtAED(s.price_aed)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {sr?.error && <div style={{ padding: "6px 12px", background: dark ? "#3a1a1a22" : "#FEF2F244", fontSize: "10px", color: c.red, borderBottom: "1px solid " + c.border }}>{sr.error}</div>}
              </div>
            );
          })}
        </div>}

        {discSource === "amazon" && !discScanning && discProducts.length === 0 && <div style={{ textAlign: "center", padding: "50px 20px" }}>
          <div style={{ fontSize: "36px", marginBottom: "10px", opacity: 0.15 }}>{"\ud83d\udd0d"}</div>
          <div style={{ fontSize: "12px", color: c.dim }}>Click "Scan Bestsellers" to load ~3,000 products from Amazon.ae</div>
          <div style={{ fontSize: "10px", color: c.dimmer, marginTop: "6px" }}>One-time scan ~$0.30 {"\u00b7"} Free to browse after</div>
        </div>}
      </div>}

      {/* ══════════ LOOKUP TAB ══════════ */}
      {mode === "auto" && <div style={secStyle}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <input type="text" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && runDryRun()} placeholder="Paste Amazon.ae or Noon URL..." style={{ ...inputStyle, flex: 1, padding: "12px 14px" }} />
          <button onClick={runDryRun} disabled={loading || !url.trim() || cooldown > 0} style={{ ...btnStyle, padding: "12px 20px", fontSize: "11px", opacity: loading || !url.trim() ? 0.4 : 1, whiteSpace: "nowrap" }}>{cooldown > 0 ? "WAIT " + cooldown + "s" : loading && !dryRunData ? "READING..." : "QUICK CHECK ~$0.02"}</button>
        </div>
        {loading && stage && <div style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}><Spinner /><span style={{ fontSize: "12px", color: c.gold }}>{stage}</span></div>
          {progress > 0 && <div style={{ width: "100%", height: "3px", background: c.border, borderRadius: "2px" }}><div style={{ width: progress + "%", height: "100%", background: c.gold, borderRadius: "2px", transition: "width 0.3s" }} /></div>}
          {waveStatus.length > 0 && <WaveStatusBar waves={waveStatus} c={c} />}
        </div>}
        {autoError && <div style={{ padding: "12px", background: dark ? "#3a1a1a" : "#FEF2F2", border: "1px solid " + c.red + "44", borderRadius: "4px", marginBottom: "12px", fontSize: "12px", color: c.red }}>{"\u26a0 "}{autoError}</div>}

        {!loading && !dryRunData && !autoError && <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: "36px", marginBottom: "10px", opacity: 0.15 }}>{"\u26a1"}</div>
          <div style={{ fontSize: "12px", color: c.dim }}>Paste a product URL and click Quick Check</div>
          <div style={{ marginTop: "16px", display: "inline-block", padding: "14px 20px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "6px", textAlign: "left", fontSize: "11px", lineHeight: 2 }}>
            <span style={{ color: c.green }}>{"\u2460 Quick Check"}</span> <span style={{ color: c.dimmer }}>{"\u2014 read + translate"}</span> <span style={{ color: c.dim }}>~$0.02</span><br />
            <span style={{ color: c.gold }}>{"\u2461 Indo Search"}</span> <span style={{ color: c.dimmer }}>{"\u2014 Toko + Shopee + margins"}</span> <span style={{ color: c.dim }}>~$0.02-0.15</span>
          </div>
        </div>}

        {dryRunData && <div>
          {/* Product card — v1 FEATURE: pack quantity UI */}
          <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "10px" }}>
            <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>UAE PRODUCT {dryRunData.url && <a href={dryRunData.url} target="_blank" rel="noopener" style={{ color: c.dim, fontSize: "9px", marginLeft: "8px" }}>open {"\u2197"}</a>}</div>
            <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>{dryRunData.product_name}</div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", fontSize: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ color: c.dim, fontSize: "10px" }}>AED</span>
                <input type="number" value={dryRunData.price_aed || ""} onChange={e => setDryRunData({ ...dryRunData, price_aed: parseFloat(e.target.value) || 0 })} style={{ width: "80px", padding: "3px 6px", background: c.input, border: "1px solid " + (!dryRunData.price_aed ? c.red : c.border2), color: c.gold, fontFamily: "monospace", fontSize: "14px", fontWeight: 700, borderRadius: "3px", outline: "none", textAlign: "right" }} />
              </div>
              {/* v1 FEATURE: Pack quantity input */}
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ color: c.dim, fontSize: "10px" }}>PACK:</span>
                <input type="number" min="1" value={dryRunData.pack_quantity || 1} onChange={e => setDryRunData({ ...dryRunData, pack_quantity: parseInt(e.target.value) || 1 })} style={{ width: "50px", padding: "3px 6px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "12px", borderRadius: "3px", outline: "none", textAlign: "center" }} />
              </div>
              {dryRunData.price_aed > 0 && <span style={{ color: c.dim, fontSize: "11px" }}>{"\u2248 "}{fmtIDR((dryRunData.price_aed / (dryRunData.pack_quantity || 1)) * fx.AED_TO_IDR)}{" /unit"}</span>}
              {dryRunData.price_aed > 0 && <span style={{ color: c.dimmer, fontSize: "10px" }}>{"\u2248 "}{fmtUSD((dryRunData.price_aed / (dryRunData.pack_quantity || 1)) * fx.AEDUSD)}{" /unit"}</span>}
              <Badge text={dryRunData.source || "Amazon.ae"} /> <Badge text={dryRunData.category} color={c.green} bg={c.sectionBg} />
              {dryRunData.rating > 0 && <span style={{ color: c.darkGold, fontSize: "11px" }}>{"\u2605 "}{dryRunData.rating}</span>}
            </div>
            {(!dryRunData.price_aed || dryRunData.price_aed === 0) && <div style={{ fontSize: "11px", color: c.darkGold, marginTop: "6px" }}>{"\u26a0 Price not detected \u2014 type the AED price above"}</div>}
          </div>
          {/* Translation + queries */}
          <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "10px" }}>
            <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>TRANSLATION</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "12px", marginBottom: "10px" }}>
              <div><span style={{ color: c.dim }}>EN:</span> {dryRunData.clean_name_en}</div>
              <div><span style={{ color: c.dim }}>ID:</span> <span style={{ color: c.gold, fontWeight: 600 }}>{dryRunData.clean_name_id}</span></div>
            </div>
            {!indoResults && <div>
              <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px" }}>SEARCH QUERIES {"\u2014"} edit or add before searching</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
                {editableQueries.map((q, i) => <div key={i} style={{ display: "flex", gap: "4px" }}><input value={q} onChange={e => { const u = [...editableQueries]; u[i] = e.target.value; setEditableQueries(u); }} style={{ ...inputStyle, padding: "5px 8px", fontSize: "11px", flex: 1 }} /><button onClick={() => setEditableQueries(editableQueries.filter((_, idx) => idx !== i))} style={{ background: "transparent", border: "1px solid " + c.red + "44", color: c.red, fontSize: "10px", padding: "4px 8px", borderRadius: "3px", cursor: "pointer" }}>{"\u2715"}</button></div>)}
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                <input value={newQueryInput} onChange={e => setNewQueryInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newQueryInput.trim()) { setEditableQueries([...editableQueries, newQueryInput.trim()]); setNewQueryInput(""); } }} placeholder="Add keyword..." style={{ ...inputStyle, padding: "5px 8px", fontSize: "11px", flex: 1 }} />
                <button onClick={() => { if (newQueryInput.trim()) { setEditableQueries([...editableQueries, newQueryInput.trim()]); setNewQueryInput(""); } }} style={{ ...btnSec, padding: "5px 12px", fontSize: "9px" }}>+ ADD</button>
              </div>
            </div>}
          </div>
          {/* Indo search button */}
          {!indoResults && !loading && <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + c.green + "44", borderRadius: "4px", marginBottom: "10px", textAlign: "center" }}>
            <button onClick={runLookupIndoSearch} disabled={editableQueries.filter(q => q.trim()).length === 0 || (indoMode === "apify" && !apifyKey)} style={{ ...btnGreen, padding: "12px 36px", fontSize: "12px", opacity: editableQueries.filter(q => q.trim()).length === 0 ? 0.4 : 1 }}>
              {"\ud83d\udd0d"} {indoMode === "apify" ? "SCRAPE TOKO + SHOPEE (~$0.02)" : "CLAUDE SEARCH (~$0.15)"}
            </button>
          </div>}

          {/* Indo Results section */}
          {indoResults && <SectionToggle index={1} title={"Indonesia Market \u2014 " + (indoResults.source === "apify" ? "Apify" : "Claude Search")} icon={"\ud83c\uddee\ud83c\udde9"} count={indoResults.results?.length}>
            {indoResults.wave_status && <WaveStatusBar waves={indoResults.wave_status} c={c} />}
            {indoResults.confidence && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", marginBottom: "12px", background: indoResults.confidence.level === "high" ? (dark ? "#0D2E1A" : "#E8F5EC") : indoResults.confidence.level === "medium" ? (dark ? "#2A2210" : "#FDF8ED") : (dark ? "#3a1a1a" : "#FEF2F2"), border: "1px solid " + (indoResults.confidence.level === "high" ? c.green : indoResults.confidence.level === "medium" ? c.gold : c.red) + "44", borderRadius: "4px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: indoResults.confidence.level === "high" ? c.green : indoResults.confidence.level === "medium" ? c.gold : c.red }}>{"\u25cf "}{indoResults.confidence.level} CONFIDENCE</div>
                <div style={{ fontSize: "10px", color: c.dim, flex: 1 }}>{indoResults.confidence.validCount} valid{indoResults.confidence.withSold > 0 && " \u00b7 " + indoResults.confidence.withSold + " sold data"}</div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: c.dim }}>{indoResults.confidence.score}/100</div>
              </div>
            )}
            {indoResults.price_stats && (
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
              <div style={{ display: "grid", gridTemplateColumns: "2.5fr 0.6fr 0.7fr 0.5fr", gap: "4px", padding: "5px 0", borderBottom: "1px solid " + c.border2, fontSize: "9px", color: c.dimmer, textTransform: "uppercase", position: "sticky", top: 0, background: c.surface, zIndex: 1 }}>
                <div>{"Product \u00b7 Seller"}</div><div>Source</div><div style={{ textAlign: "right" }}>Price</div><div style={{ textAlign: "right" }}>Sold</div>
              </div>
              {indoResults.results?.map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2.5fr 0.6fr 0.7fr 0.5fr", gap: "4px", padding: "6px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", alignItems: "center" }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.url ? <a href={r.url} target="_blank" rel="noopener" style={{ color: c.text, textDecoration: "none" }}>{r.name}</a> : r.name}
                    {r.seller && <span style={{ color: c.dimmest }}>{" \u00b7 "}{r.seller}</span>}
                  </div>
                  <div><Badge text={r.source || "Tokopedia"} color={r.source === "Shopee" ? "#EE4D2D" : c.green} bg={r.source === "Shopee" ? (dark ? "#2D1508" : "#FFF0EC") : (dark ? "#0D2E1A" : "#E8F5EC")} /></div>
                  <div style={{ color: c.gold, fontWeight: 700, textAlign: "right" }}>{fmtIDR(r.price_idr)}</div>
                  <div style={{ color: r.sold ? c.darkGold : c.dimmest, textAlign: "right", fontSize: "10px" }}>{r.sold || "\u2014"}</div>
                </div>
              ))}
            </div>
          </SectionToggle>}

          {/* Margin results */}
          {marginData && <SectionToggle index={2} title="Margin Analysis" icon={"\ud83d\udcca"}>
            {/* v1 FEATURE: Qty mode selector */}
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "10px", color: c.dim }}>FOR:</span>
              {[{ id: "unit", label: "Per Unit" }, { id: "custom", label: "Custom Qty" }, { id: "container", label: "Container (20ft)" }].map(m => (
                <button key={m.id} onClick={() => setQtyMode(m.id)} style={{ padding: "4px 10px", background: qtyMode === m.id ? c.gold : "transparent", color: qtyMode === m.id ? c.btnText : c.dim, border: "1px solid " + (qtyMode === m.id ? c.gold : c.border2), borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "monospace" }}>{m.label}</button>
              ))}
              {qtyMode === "custom" && <input type="number" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} min="1" style={{ ...inputStyle, width: "80px", padding: "4px 8px", fontSize: "11px", textAlign: "center" }} />}
              <span style={{ fontSize: "10px", color: c.dimmer }}>{"\u00d7 "}{getQty()} units</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "14px" }}>
              {[{ l: "BEST", m: marginData.margins.best }, { l: "MEDIAN", m: marginData.margins.median }, { l: "WORST", m: marginData.margins.worst }].map(x => (
                <div key={x.l} style={{ padding: "12px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                  <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "4px" }}>{x.l}</div>
                  <div style={{ fontSize: "24px", fontWeight: 700, color: marginColor(x.m.margin) }}>{x.m.margin.toFixed(1)}%</div>
                </div>
              ))}
            </div>
            <div style={{ background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", padding: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "10px", padding: "4px 0", borderBottom: "1px solid " + c.border2, color: c.dimmer, fontWeight: 700 }}><div>COST</div><div>USD</div><div>AED</div><div>IDR</div></div>
              {(() => { const m = marginData.margins.median, q = getQty(); return <>
                <PriceRow label={"UAE Sell \u00d7" + q} usd={m.uaeUSD*q} aed={m.uaeAED*q} idr={m.uaeIDR*q} />
                <PriceRow label={"Indo \u00d7" + q} usd={m.indoUSD*q} aed={m.indoAED*q} idr={m.indoIDR*q} />
                <PriceRow label={"Freight \u00d7" + q} usd={m.freightUSD*q} aed={m.freightAED*q} idr={m.freightIDR*q} />
                <PriceRow label={"Customs \u00d7" + q} usd={m.dutyUSD*q} aed={m.dutyAED*q} idr={m.dutyIDR*q} />
                <PriceRow label={"Last Mile \u00d7" + q} usd={m.lastMileUSD*q} aed={m.lastMileAED*q} idr={m.lastMileIDR*q} />
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "6px 0", fontWeight: 700 }}><div style={{ color: c.red }}>TOTAL</div><div style={{ color: c.red }}>{fmtUSD(m.totalUSD*q)}</div><div style={{ color: c.red }}>{fmtAED(m.totalAED*q)}</div><div style={{ color: c.red }}>{fmtIDR(m.totalIDR*q)}</div></div>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "6px 0", fontWeight: 700 }}><div style={{ color: c.green }}>PROFIT</div><div style={{ color: c.green }}>{fmtUSD((m.uaeUSD-m.totalUSD)*q)}</div><div style={{ color: c.green }}>{fmtAED((m.uaeAED-m.totalAED)*q)}</div><div style={{ color: c.green }}>{fmtIDR((m.uaeIDR-m.totalIDR)*q)}</div></div>
              </>; })()}
            </div>
            <div style={{ marginTop: "10px", padding: "8px", borderRadius: "4px", textAlign: "center", fontSize: "12px", fontWeight: 600, background: marginData.status === "Candidate" ? (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT).Candidate.bg : marginData.status === "Investigated" ? (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT).Active.bg : (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT).Rejected.bg, color: marginColor(marginData.margins.median.margin), border: "1px solid " + (marginData.status === "Candidate" ? STATUS_COLORS.Candidate.border : STATUS_COLORS.Rejected.border) }}>
              {marginData.margins.median.margin >= MARGIN_THRESHOLD.candidate ? "\u2713 CANDIDATE" : marginData.margins.median.margin >= MARGIN_THRESHOLD.borderline ? "\u25cb BORDERLINE" : "\u2717 LOW MARGIN"} {"\u2014"} {marginData.margins.median.margin.toFixed(1)}%
            </div>
          </SectionToggle>}

          {/* Action buttons — v1 FEATURE: PDF + CSV export */}
          {(indoResults || autoError) && !loading && <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
            <button onClick={resetLookup} style={{ ...btnSec, padding: "8px 20px", fontSize: "10px" }}>{"\u2190 NEW LOOKUP"}</button>
            {marginData && <button onClick={exportPDF} style={{ ...btnSec, padding: "8px 16px", fontSize: "10px" }}>{"\ud83d\udcc4 PDF"}</button>}
          </div>}
        </div>}
      </div>}

      {/* ══════════ HISTORY TAB ══════════ */}
      {mode === "history" && <div style={secStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "6px" }}>
          <span style={{ fontSize: "10px", color: c.dim, letterSpacing: "1px" }}>{history.length} LOOKUPS</span>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <button style={btnSec} onClick={exportQuickCSV}>QUICK CSV</button>
            <button style={btnSec} onClick={exportStructuredCSV}>{"\ud83d\udcca FULL CSV"}</button>
            <button style={btnSec} onClick={exportBackup}>{"\ud83d\udcbe BACKUP"}</button>
            <input type="file" ref={backupFileRef} accept=".json" style={{ display: "none" }} onChange={e => e.target.files[0] && importBackup(e.target.files[0])} />
            <button style={btnSec} onClick={() => backupFileRef.current?.click()}>{"\ud83d\udcc2 RESTORE"}</button>
            <button style={{ ...btnSec, color: c.red, borderColor: c.red }} onClick={async () => { if (!confirm("Clear all?")) return; setHistory([]); await saveHistory(currentPin, []); }}>CLEAR</button>
          </div>
        </div>
        {!history.length ? <div style={{ textAlign: "center", padding: "40px", color: c.dimmer }}>No lookups yet.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "550px", overflowY: "auto" }}>
            {history.map((h, i) => {
              const m = h.margins?.median?.margin || 0;
              const sc = (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT)[h.status] || (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT).Candidate;
              const isExp = expandedHistoryIdx === i;
              const indoList = h.indoResults?.results || [];
              return (
                <div key={i} style={{ background: c.surface2, border: "1px solid " + sc.border, borderRadius: "4px", borderLeft: "3px solid " + sc.text }}>
                  <div style={{ padding: "10px 12px", cursor: "pointer" }} onClick={() => setExpandedHistoryIdx(isExp ? -1 : i)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "3px" }}>{h.uaeProduct?.product_name}</div>
                        <div style={{ fontSize: "10px", color: c.dim, marginBottom: "3px" }}>{h.normalized?.clean_name_id}</div>
                        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
                          <Badge text={"AED " + (h.uaeProduct?.price_aed || 0)} color={c.gold} bg={c.surface} />
                          <Badge text={fmtIDR(h.medianPriceIDR)} color={c.green} bg={c.surface} />
                          {h.confidence && <ConfidenceBadge confidence={h.confidence} c={c} />}
                          <span style={{ fontSize: "9px", color: c.dimmest }}>{h.timestamp?.slice(0, 10)}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", marginLeft: "10px" }}>
                        <div style={{ fontSize: "18px", fontWeight: 700, color: marginColor(m) }}>{m.toFixed(1)}%</div>
                        <select value={h.status} onChange={e => { e.stopPropagation(); updateHistoryStatus(i, e.target.value); }} onClick={e => e.stopPropagation()} style={{ padding: "2px 4px", background: sc.bg, border: "1px solid " + sc.border, color: sc.text, fontFamily: "monospace", fontSize: "9px", borderRadius: "3px" }}>
                          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  {isExp && indoList.length > 0 && <div style={{ padding: "0 12px 12px", borderTop: "1px solid " + c.border }}>
                    <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", padding: "8px 0 4px", textTransform: "uppercase" }}>INDO LISTINGS ({indoList.length})</div>
                    <div style={{ maxHeight: "250px", overflowY: "auto" }}>
                      {indoList.map((r, j) => <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid " + c.border, fontSize: "10px" }}>
                        <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name} {r.seller && <span style={{ color: c.dimmest }}>{"\u00b7 "}{r.seller}</span>}</div>
                        <div style={{ display: "flex", gap: "8px", marginLeft: "8px", whiteSpace: "nowrap" }}>
                          <span style={{ color: r.source === "Shopee" ? "#EE4D2D" : c.green, fontSize: "9px" }}>{r.source === "Shopee" ? "S" : "T"}</span>
                          <span style={{ color: c.gold, fontWeight: 700 }}>{fmtIDR(r.price_idr)}</span>
                          {r.sold && <span style={{ color: c.darkGold }}>{r.sold}</span>}
                        </div>
                      </div>)}
                    </div>
                  </div>}
                </div>
              );
            })}
          </div>
        )}
      </div>}

      </>)}
    </div>
  );
}gi
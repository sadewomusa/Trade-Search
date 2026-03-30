import { MARGIN_THRESHOLD, INDO_SIGNAL_WORDS } from './constants.js';

// ══════════ BLOCKED-SIGNAL DETECTION ══════════
const BLOCKED_SIGNALS = [
  { pattern: /login.{0,20}required|need.{0,10}log.?in|sign.?in.{0,10}to.{0,10}(view|access|see)/i, reason: "login wall detected" },
  { pattern: /captcha|verify.{0,10}(human|robot|not a bot)|security.{0,10}check/i, reason: "CAPTCHA/bot check" },
  { pattern: /access.{0,15}denied|forbidden|blocked|403/i, reason: "access denied/blocked" },
  { pattern: /no.{0,10}results?.{0,10}(found|available)|couldn.?t.{0,10}find.{0,15}(any|results)|did not (find|return)/i, reason: "search returned nothing" },
  { pattern: /unable to (access|search|find|retrieve).{0,20}(shopee|tokopedia)/i, reason: "platform unreachable" },
];
function detectBlockedSignals(rawText, platform) { for (const sig of BLOCKED_SIGNALS) { if (sig.pattern.test(rawText)) return platform + ": " + sig.reason; } if (rawText.toLowerCase().includes(platform.toLowerCase()) && !/\d{2,3}\.\d{3}|rp\s*\d|idr\s*\d|\d+\s*rupiah/i.test(rawText)) { return platform + ": response mentions platform but contains no prices"; } return null; }
export { detectBlockedSignals };

// ══════════ HELPERS ══════════
export function marginColor(m) { return isNaN(m) ? "#f87171" : m >= MARGIN_THRESHOLD.candidate ? "#2EAA5A" : m >= MARGIN_THRESHOLD.borderline ? "#D4A843" : "#f87171"; }
export function fmtIDR(n) { return n != null && !isNaN(n) ? "IDR " + Math.round(n).toLocaleString() : "\u2014"; }
export function fmtAED(n) { return n != null && !isNaN(n) ? "AED " + n.toFixed(2) : "\u2014"; }
export function fmtUSD(n) { return n != null && !isNaN(n) ? "$" + n.toFixed(2) : "\u2014"; }
export function escapeHtml(s) { return !s ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
export function sanitizeIDR(price) { if (typeof price === "string") { price = parseInt(price.replace(/^[Rr]p.?\s*/, "").replace(/\./g, "").replace(/,/g, "").trim(), 10) || 0; } if (typeof price !== "number" || isNaN(price)) return 0; if (price > 0 && price < 500) price = Math.round(price * 1000); if (price > 0 && price < 1000) price = Math.round(price * 1000); return Math.round(price); }
export function computeConfidence(results, priceStats) { const vp = results.filter(r => (r.price_idr || 0) >= 1000); const ws = results.filter(r => r.sold && r.sold.trim() && !/^-|^\u2014/.test(r.sold)).length; const spread = priceStats.highest_idr && priceStats.lowest_idr > 0 ? priceStats.highest_idr / priceStats.lowest_idr : 999; let score = 0, flags = []; if (vp.length >= 10) score += 40; else if (vp.length >= 5) score += 30; else if (vp.length >= 3) score += 20; else { score += 5; flags.push("Few valid prices"); } if (spread <= 3) score += 30; else if (spread <= 5) score += 20; else if (spread <= 10) score += 10; else flags.push("Wide spread (" + spread.toFixed(0) + "\u00d7)"); if (ws >= 5) score += 20; else if (ws >= 2) score += 10; else flags.push("No sold data"); const dr = results.length > 0 ? (results.length - vp.length) / results.length : 1; if (dr <= 0.1) score += 10; else if (dr <= 0.3) score += 5; else flags.push(Math.round(dr * 100) + "% discarded"); return { score, level: score >= 70 ? "high" : score >= 40 ? "medium" : "low", flags, validCount: vp.length, totalCount: results.length, withSold: ws, spread: spread < 999 ? spread : null }; }
export function guessCategory(n) { const l = (n || "").toLowerCase(); if (/phone|charger|cable|headphone|speaker|power bank|usb|bluetooth|watch/i.test(l)) return "electronics"; if (/pan|pot|kitchen|cook|bake|knife|blender|mixer|plate|cutting.?board|talenan|chopping|peeler|grater|spatula|whisk|ladle|tong/i.test(l)) return "kitchen"; if (/cream|serum|lotion|shampoo|perfume|makeup|lipstick|skincare/i.test(l)) return "beauty"; if (/shirt|dress|shoe|bag|wallet|belt|hat|socks|jacket/i.test(l)) return "fashion"; if (/pillow|curtain|lamp|rug|mat|towel|organizer|shelf/i.test(l)) return "home"; if (/toy|game|puzzle|doll|lego|figure/i.test(l)) return "toys"; if (/ball|fitness|gym|yoga|exercise|bottle/i.test(l)) return "sports"; if (/baby|diaper|pacifier|stroller/i.test(l)) return "baby"; if (/pen|notebook|stapler|tape|folder|desk/i.test(l)) return "office"; return "other"; }
// Local fallback search queries when Claude API is unavailable
export const EN_TO_ID = { "cutting board":"talenan", "chopping board":"talenan", "wood":"kayu", "wooden":"kayu", "teak":"jati", "bamboo":"bambu", "coconut":"kelapa", "bowl":"mangkok", "spoon":"sendok", "fork":"garpu", "plate":"piring", "knife":"pisau", "mat":"alas", "rug":"karpet", "towel":"handuk", "candle":"lilin", "soap":"sabun", "oil":"minyak", "essential oil":"minyak atsiri", "basket":"keranjang", "box":"kotak", "bag":"tas", "cup":"gelas", "mug":"gelas", "jar":"toples", "tray":"nampan", "rack":"rak", "shelf":"rak", "organizer":"organizer", "holder":"tempat", "stand":"dudukan", "lamp":"lampu", "mirror":"cermin", "pillow":"bantal", "cushion":"bantal", "blanket":"selimut", "large":"besar", "small":"kecil", "set":"set" };
export function fallbackSearchQueries(productName, brand) {
  let clean = (productName || "").replace(/,.*$/, "");
  if (brand) clean = clean.replace(new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
  clean = clean.replace(/\b(for|with|and|the|a|an|in|of|by|from|on|to|is|it)\b/gi, "").replace(/\s{2,}/g, " ").trim();
  const specs = clean.match(/\d+(?:\.\d+)?\s*(?:ml|g|kg|oz|cm|mm|inch|qt|liter|litre|pc|pcs|pack|set|count)/gi) || [];
  const specStr = specs.join(" ");
  // Apply compound translations on full name (before truncating), handle plurals
  let idFull = clean.toLowerCase().replace(/(\w)s\b/g, "$1");
  Object.entries(EN_TO_ID).sort((a, b) => b[0].length - a[0].length).forEach(([en, id]) => { idFull = idFull.replace(new RegExp(en, "gi"), id); });
  const idWords = idFull.split(/\s+/).filter(w => w.length > 1);
  const enWords = clean.split(/\s+/).filter(w => w.length > 1);
  const idCore = idWords.slice(0, 8).join(" ");
  const enCore = enWords.slice(0, 6).join(" ");
  // Add specs only if not already in the core string
  const addSpec = specStr && !idCore.includes(specStr.split(" ")[0]) ? " " + specStr : "";
  // Short Bahasa-only query (max 3 meaningful translated words)
  const idShort = idWords.filter(w => !enWords.map(e => e.toLowerCase().replace(/s$/, "")).includes(w)).slice(0, 3);
  if (idShort.length < 2) idShort.push(...idWords.slice(0, 3 - idShort.length));
  const queries = [];
  if (idCore !== enCore.toLowerCase()) queries.push((idCore + addSpec).trim());
  queries.push((enCore + addSpec).trim());
  if (idShort.length >= 2) queries.push(([...new Set(idShort)].join(" ") + addSpec).trim());
  queries.push(enCore);
  return { queries: [...new Set(queries)].filter(Boolean).slice(0, 4), cleanId: idCore !== enCore.toLowerCase() ? idCore : idWords.slice(0, 4).join(" "), cleanEn: enCore };
}

// ══════════ BRAND FILTER ══════════
export function isBrandBlocked(productName, brandName, blocklist) {
  const name = (productName || "").toLowerCase();
  const brand = (brandName || "").toLowerCase();
  for (const b of blocklist) {
    const bl = b.toLowerCase();
    if (brand && brand.includes(bl)) return true;
    // Check product name — match as whole word boundary
    const re = new RegExp("(^|\\s|\\b)" + bl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(\\s|$|\\b|'s)", "i");
    if (re.test(name)) return true;
  }
  return false;
}
export function getIndoSignalScore(name) {
  const l = (name || "").toLowerCase();
  let score = 0, matched = [];
  for (const w of INDO_SIGNAL_WORDS) { if (l.includes(w.toLowerCase())) { score += w.split(" ").length > 1 ? 3 : 2; matched.push(w); } }
  return { score, matched };
}

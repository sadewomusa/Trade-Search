import { useState, useEffect, useCallback, useRef } from "react";
// ══════════ SUPABASE CONFIG ══════════
const SUPABASE_URL = "https://cqpxzxafavqflnrilgjh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNxcHh6eGFmYXZxZmxucmlsZ2poIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MDUyNzEsImV4cCI6MjA5MDA4MTI3MX0.tAK15mxTdofv5eymd9wJOxxA4vjVuS_QkpmKiqA5qCI";
// ══════════ CONSTANTS ══════════
const DEFAULT_FX = { AEDUSD: 0.2723, IDRUSD: 0.0000613, AED_TO_IDR: 0.2723 / 0.0000613, IDR_TO_AED: 0.0000613 / 0.2723 };
const DEFAULT_FREIGHT = { air: { rate_per_kg: 4, min_kg: 100, transit: { port_port: "3-5 days", port_door: "5-7 days", door_door: "7-10 days" } }, ocean: { rate_20ft: 800, rate_40ft: 1400, rate_per_cbm: 45, transit: { port_port: "14-18 days", port_door: "18-25 days", door_door: "21-30 days" } }, source: "default", updated: null };
const CUSTOMS_DUTY = 0.05;
const LAST_MILE_AED = 20;
const MARGIN_THRESHOLD = { candidate: 40, borderline: 20 };
const WEIGHT_KG = { light: 0.3, medium: 1.0, heavy: 3.0 };
const VOLUME_CBM = { light: 0.002, medium: 0.005, heavy: 0.015 };
const FREIGHT_MODES = {
  air:     { label: "Air Freight",    icon: "\u2708", transit: "5\u20137 days",  note: "Best for samples, urgent, <2kg items" },
  sea_lcl: { label: "Sea LCL",       icon: "\ud83d\udea2", transit: "14\u201328 days", note: "Small batches, testing (per CBM)" },
  sea_fcl: { label: "Sea FCL (20ft)", icon: "\ud83d\udce6", transit: "18\u201325 days", note: "500+ units, proven products" },
};
const ROUTES = [
  { id: "air_dxb", label: "Air Jakarta\u2192DXB", mode: "air", origin: "Jakarta (CGK)", dest: "Dubai (DXB)", transit: "5\u20137 days", rate: 4.25, unit: "USD/kg", bestFor: "Samples, urgent, <2kg items", icon: "\u2708" },
  { id: "sea_lcl_jea", label: "Sea LCL\u2192Jebel Ali", mode: "sea_lcl", origin: "Jakarta", dest: "Jebel Ali", transit: "21\u201328 days", rate: 47.5, unit: "USD/CBM", bestFor: "Small batches, testing", icon: "\ud83d\udea2" },
  { id: "sea_lcl_kct", label: "Sea LCL\u2192KCT \u2605", mode: "sea_lcl", origin: "Surabaya", dest: "Khorfakkan (KCT)", transit: "14\u201320 days", rate: 42, unit: "USD/CBM", bestFor: "Regular shipments, east coast", icon: "\ud83d\udea2", highlight: true },
  { id: "sea_fcl_jea", label: "Sea FCL 20ft\u2192Jebel Ali", mode: "sea_fcl", origin: "Jakarta", dest: "Jebel Ali", transit: "18\u201325 days", rate: 850, unit: "USD/ctr", bestFor: "500+ units, proven products", icon: "\ud83d\udce6" },
  { id: "sea_lcl_klf", label: "Sea LCL\u2192Khalifa Port", mode: "sea_lcl", origin: "Jakarta", dest: "Khalifa Port", transit: "20\u201328 days", rate: 46, unit: "USD/CBM", bestFor: "Abu Dhabi destination", icon: "\ud83d\udea2" },
];
const TIER_LIMITS = {
  free:       { lookups: 3,   margins: 1,  label: "Free" },
  registered: { lookups: 10,  margins: 3,  label: "Registered" },
  paid:       { lookups: 100, margins: 20, label: "Pro ($20/mo)" },
  admin:      { lookups: 99999, margins: 99999, label: "Admin" },
};
const DISPOSABLE_DOMAINS = ["tempmail.com","guerrillamail.com","mailinator.com","throwaway.email","yopmail.com","sharklasers.com","guerrillamailblock.com","grr.la","guerrillamail.info","guerrillamail.de","tempail.com","dispostable.com","trashmail.com","trashmail.me","trashmail.net","mailnesia.com","maildrop.cc","discard.email","temp-mail.org","fakeinbox.com","emailondeck.com","mohmal.com","tempmailo.com","temp-mail.io","burnermail.io","tmail.ws","tmpmail.net","tmpmail.org","getnada.com","inboxbear.com","mailsac.com","10minutemail.com","20minutemail.com","minutemail.com","tempmailaddress.com","crazymailing.com","mytemp.email","tempr.email","harakirimail.com","bupmail.com","mailcatch.com","mailscrap.com","spamgourmet.com","spamfree24.org","jetable.org","trashymail.com","klzlk.com","emltmp.com","tmpbox.net"];
const WORKER_URL = "https://trades-proxy.sadewoahmadm.workers.dev";
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

// ══════════ BRAND BLOCKLIST (~300 brands) ══════════
const BRAND_BLOCKLIST_DEFAULT = [
  // Electronics
  "Philips","Samsung","Sony","LG","Bosch","Braun","Panasonic","JBL","Bose","Apple","Huawei","Xiaomi","Anker","Logitech","Canon","Nikon","GoPro","DJI","Garmin","Fitbit","Dyson","Sharp","Toshiba","Hisense","TCL","Oppo","Realme","OnePlus","Google","Microsoft","Dell","HP","Lenovo","Asus","Acer","Intel","AMD","Corsair","Razer","SteelSeries","HyperX","Marshall","Sennheiser","Bang & Olufsen","Sonos","Harman Kardon","Ultimate Ears","Beats","AKG","Shure","Audio-Technica",
  // Kitchen & Appliances
  "Tefal","KitchenAid","Cuisinart","Ninja","NutriBullet","Le Creuset","Pyrex","Black+Decker","DeLonghi","Breville","Kenwood","Moulinex","Russell Hobbs","Smeg","Instant Pot","Lodge","Calphalon","All-Clad","Zwilling","Wusthof","Henckels","Global","Victorinox","WMF","Fissler","Staub","Emile Henry","Nespresso","Lavazza","Illy","Keurig","Bialetti","Hario","Chemex","Aeropress","Fellow","Vitamix","Blendtec","Hamilton Beach","Oster","Sunbeam","Zojirushi","Tiger","Thermos","Stanley","Yeti","Hydro Flask","Contigo","CamelBak","Klean Kanteen",
  // Home & Furniture
  "IKEA","Joseph Joseph","OXO","Rubbermaid","Simplehuman","Dyson","iRobot","Roomba","Shark","Bissell","Karcher","Hoover","Miele","Electrolux","Rowenta","Tefal","Brabantia","Fiskars","3M","Command","Scotch","Weber","Traeger","Big Green Egg","Coleman","Yeti",
  // Beauty & Personal Care
  "L'Oreal","Nivea","Dove","Olay","Neutrogena","Maybelline","MAC","Estee Lauder","Clinique","Lancome","Dior","Chanel","Tom Ford","Jo Malone","Guerlain","Shiseido","SK-II","La Mer","Kiehl's","Origins","Aveda","Moroccanoil","Kerastase","Redken","Pantene","Head & Shoulders","TRESemme","Garnier","Revlon","NYX","Urban Decay","Too Faced","Benefit","Charlotte Tilbury","NARS","Bobbi Brown","Fenty Beauty","Rare Beauty","Glossier","The Ordinary","CeraVe","La Roche-Posay","Vichy","Bioderma","Eucerin","Cetaphil","Aveeno","Vaseline","Gillette","Oral-B","Philips Sonicare","Waterpik","Braun","Foreo",
  // Fashion & Accessories
  "Nike","Adidas","Puma","New Balance","Reebok","Under Armour","Columbia","The North Face","Patagonia","Arc'teryx","Timberland","Dr Martens","Converse","Vans","Skechers","Crocs","Birkenstock","Havaianas","Ray-Ban","Oakley","Fossil","Casio","G-Shock","Seiko","Citizen","Tissot","Swatch","Michael Kors","Coach","Kate Spade","Tommy Hilfiger","Calvin Klein","Ralph Lauren","Lacoste","Hugo Boss","Zara","H&M","Uniqlo","Levi's","Wrangler","Lee","Guess","Diesel",
  // Baby & Kids
  "Pampers","Huggies","Johnson & Johnson","Chicco","Graco","Maxi-Cosi","Britax","BabyBjorn","Philips Avent","Tommee Tippee","NUK","MAM","Fisher-Price","VTech","LeapFrog","Melissa & Doug","LEGO","Playmobil","Hasbro","Mattel","Nerf","Hot Wheels","Barbie",
  // Sports & Fitness
  "Nike","Adidas","Reebok","Puma","Under Armour","Speedo","Arena","TYR","Wilson","Head","Babolat","Yonex","Prince","Callaway","TaylorMade","Titleist","Ping","Garmin","Polar","Suunto","Fitbit","Theragun","Hyperice","Bowflex","NordicTrack","Peloton","Manduka","Lululemon","Gaiam",
  // Office & Stationery
  "Staedtler","Faber-Castell","Pilot","Uni","Zebra","Parker","Waterman","Montblanc","Cross","Moleskine","Leuchtturm","Rhodia","Lamy","TWSBI","Fellowes","Swingline","Bostitch",
  // Tools & Hardware
  "DeWalt","Makita","Milwaukee","Bosch","Stanley","Black+Decker","Dremel","Festool","Hilti","Ryobi","Craftsman","Irwin","Klein","Knipex","Wera","Wiha","Leatherman","Gerber","Victorinox",
  // Automotive
  "Castrol","Mobil","Shell","3M","Meguiar's","Chemical Guys","Turtle Wax","Armor All","Rain-X","Bosch","Denso","NGK","Thule","Yakima",
  // Health & Supplements
  "Centrum","Nature Made","NOW Foods","Garden of Life","Optimum Nutrition","MuscleTech","BSN","Cellucor","GNC","Ensure","Boost","SlimFast",
  // Pet
  "Royal Canin","Purina","Hill's","Pedigree","Whiskas","Fancy Feast","Blue Buffalo","Orijen","Acana",
  // Premium/Luxury Kitchen
  "Cole & Mason","Jamie Oliver","Gordon Ramsay","Martha Stewart","Rachel Ray","Berghoff","Scanpan","Mauviel","de Buyer","Riedel","Waterford","Wedgwood","Royal Doulton","Villeroy & Boch","Noritake","Denby","Corelle","CorningWare","Anchor Hocking","Libbey","Bormioli","Luigi Bormioli","Spiegelau","Schott Zwiesel",
  // Other branded
  "MUJI","Daiso","Miniso","Crate & Barrel","Williams Sonoma","Pottery Barn","West Elm","Restoration Hardware","CB2","Anthropologie"
];

// ══════════ INDONESIA-SIGNAL KEYWORDS ══════════
const INDO_SIGNAL_WORDS = ["handmade","handcrafted","hand carved","hand woven","handwoven","wooden","wood","bamboo","rattan","coconut","teak","acacia","mango wood","mahogany","sono wood","natural","organic","artisan","traditional","rustic","woven","seagrass","palm","batik","ceramic","pottery","stone","volcanic","lava","mortar","pestle","cobek","ulekan","incense","frankincense","kemenyan","essential oil","herbal","jamu","luwak","toraja","arabica","robusta","pandan","sambal","tempeh","vanilla","clove","cinnamon","nutmeg","turmeric","ginger","galangal","lemongrass","eco-friendly","sustainable","zero waste","reusable","plant-based","fiber","sisal","abaca","kapok","horn","bone","shell","mother of pearl","batik","ikat","songket","tenun"];

// ══════════ DEFAULT KEYWORD BANK ══════════
const DEFAULT_KEYWORDS = [
  "coconut bowl","teak cutting board","rattan basket","bamboo organizer","essential oil diffuser","mortar pestle stone",
  "batik fabric","wooden spoon set","incense sticks natural","coffee beans arabica","herbal supplement",
  "coconut oil organic","spice grinder manual","woven placemat","ceramic handmade","wooden toy",
  "jamu herbal","sambal sauce","pandan extract","frankincense resin","wooden coffee dripper",
  "seagrass basket","bamboo straw","moringa powder","vanilla beans","clove oil",
  "teak serving bowl","banana leaf plate","tempeh starter","luwak coffee"
];


// ══════════ BLOCKED-SIGNAL DETECTION ══════════
const BLOCKED_SIGNALS = [
  { pattern: /login.{0,20}required|need.{0,10}log.?in|sign.?in.{0,10}to.{0,10}(view|access|see)/i, reason: "login wall detected" },
  { pattern: /captcha|verify.{0,10}(human|robot|not a bot)|security.{0,10}check/i, reason: "CAPTCHA/bot check" },
  { pattern: /access.{0,15}denied|forbidden|blocked|403/i, reason: "access denied/blocked" },
  { pattern: /no.{0,10}results?.{0,10}(found|available)|couldn.?t.{0,10}find.{0,15}(any|results)|did not (find|return)/i, reason: "search returned nothing" },
  { pattern: /unable to (access|search|find|retrieve).{0,20}(shopee|tokopedia)/i, reason: "platform unreachable" },
];
function detectBlockedSignals(rawText, platform) { for (const sig of BLOCKED_SIGNALS) { if (sig.pattern.test(rawText)) return platform + ": " + sig.reason; } if (rawText.toLowerCase().includes(platform.toLowerCase()) && !/\d{2,3}\.\d{3}|rp\s*\d|idr\s*\d|\d+\s*rupiah/i.test(rawText)) { return platform + ": response mentions platform but contains no prices"; } return null; }

// ══════════ HELPERS ══════════
function marginColor(m) { return isNaN(m) ? "#f87171" : m >= MARGIN_THRESHOLD.candidate ? "#2EAA5A" : m >= MARGIN_THRESHOLD.borderline ? "#D4A843" : "#f87171"; }
function fmtIDR(n) { return n != null && !isNaN(n) ? "IDR " + Math.round(n).toLocaleString() : "\u2014"; }
function fmtAED(n) { return n != null && !isNaN(n) ? "AED " + n.toFixed(2) : "\u2014"; }
function fmtUSD(n) { return n != null && !isNaN(n) ? "$" + n.toFixed(2) : "\u2014"; }
function escapeHtml(s) { return !s ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function sanitizeIDR(price) { if (typeof price === "string") { price = parseInt(price.replace(/^[Rr]p.?\s*/, "").replace(/\./g, "").replace(/,/g, "").trim(), 10) || 0; } if (typeof price !== "number" || isNaN(price)) return 0; if (price > 0 && price < 500) price = Math.round(price * 1000); if (price > 0 && price < 1000) price = Math.round(price * 1000); return Math.round(price); }
function computeConfidence(results, priceStats) { const vp = results.filter(r => (r.price_idr || 0) >= 1000); const ws = results.filter(r => r.sold && r.sold.trim() && !/^-|^\u2014/.test(r.sold)).length; const spread = priceStats.highest_idr && priceStats.lowest_idr > 0 ? priceStats.highest_idr / priceStats.lowest_idr : 999; let score = 0, flags = []; if (vp.length >= 10) score += 40; else if (vp.length >= 5) score += 30; else if (vp.length >= 3) score += 20; else { score += 5; flags.push("Few valid prices"); } if (spread <= 3) score += 30; else if (spread <= 5) score += 20; else if (spread <= 10) score += 10; else flags.push("Wide spread (" + spread.toFixed(0) + "\u00d7)"); if (ws >= 5) score += 20; else if (ws >= 2) score += 10; else flags.push("No sold data"); const dr = results.length > 0 ? (results.length - vp.length) / results.length : 1; if (dr <= 0.1) score += 10; else if (dr <= 0.3) score += 5; else flags.push(Math.round(dr * 100) + "% discarded"); return { score, level: score >= 70 ? "high" : score >= 40 ? "medium" : "low", flags, validCount: vp.length, totalCount: results.length, withSold: ws, spread: spread < 999 ? spread : null }; }
function guessCategory(n) { const l = (n || "").toLowerCase(); if (/phone|charger|cable|headphone|speaker|power bank|usb|bluetooth|watch/i.test(l)) return "electronics"; if (/pan|pot|kitchen|cook|bake|knife|blender|mixer|plate/i.test(l)) return "kitchen"; if (/cream|serum|lotion|shampoo|perfume|makeup|lipstick|skincare/i.test(l)) return "beauty"; if (/shirt|dress|shoe|bag|wallet|belt|hat|socks|jacket/i.test(l)) return "fashion"; if (/pillow|curtain|lamp|rug|mat|towel|organizer|shelf/i.test(l)) return "home"; if (/toy|game|puzzle|doll|lego|figure/i.test(l)) return "toys"; if (/ball|fitness|gym|yoga|exercise|bottle/i.test(l)) return "sports"; if (/baby|diaper|pacifier|stroller/i.test(l)) return "baby"; if (/pen|notebook|stapler|tape|folder|desk/i.test(l)) return "office"; return "other"; }

// ══════════ BRAND FILTER ══════════
function isBrandBlocked(productName, brandName, blocklist) {
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
function getIndoSignalScore(name) {
  const l = (name || "").toLowerCase();
  let score = 0, matched = [];
  for (const w of INDO_SIGNAL_WORDS) { if (l.includes(w.toLowerCase())) { score += w.split(" ").length > 1 ? 3 : 2; matched.push(w); } }
  return { score, matched };
}

// ══════════ STORAGE LAYER ══════════
const supabaseReady = SUPABASE_URL !== "https://YOUR-PROJECT-ID.supabase.co" && SUPABASE_ANON_KEY !== "eyJ...your-anon-key-here...";
// Storage uses user auth token when available, falls back to anon key
let _authTokenForStorage = "";
function setStorageAuthToken(token) { _authTokenForStorage = token; }
async function supabaseGet(key) { if (!supabaseReady) return null; const token = _authTokenForStorage || SUPABASE_ANON_KEY; const r = await fetch(SUPABASE_URL + "/rest/v1/kv_store?key=eq." + encodeURIComponent(key) + "&select=value", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token } }); if (!r.ok) return null; const rows = await r.json(); return rows?.length ? JSON.parse(rows[0].value) : null; }
async function supabaseSet(key, val) { if (!supabaseReady) return false; const token = _authTokenForStorage || SUPABASE_ANON_KEY; const r = await fetch(SUPABASE_URL + "/rest/v1/kv_store", { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key, value: JSON.stringify(val), updated_at: new Date().toISOString() }) }); return r.ok; }
async function storeGet(key) { try { const v = await supabaseGet(key); if (v !== null) { try { localStorage.setItem("gt:" + key, JSON.stringify(v)); } catch {} return v; } } catch {} try { const v = localStorage.getItem("gt:" + key); return v ? JSON.parse(v) : null; } catch { return null; } }
async function storeSet(key, val) { try { localStorage.setItem("gt:" + key, JSON.stringify(val)); } catch {} try { return await supabaseSet(key, val); } catch { return false; } }

function compressEntry(h) { const mm = h.margins?.median || {}; return { pn: h.uaeProduct?.product_name || "", pid: h.normalized?.clean_name_id || h.uaeProduct?.clean_name_id || "", pen: h.uaeProduct?.clean_name_en || h.normalized?.clean_name_en || "", br: h.uaeProduct?.brand || "", cat: h.normalized?.category || h.uaeProduct?.category || "", wc: h.weightClass || "medium", src: h.uaeProduct?.source || "", url: h.uaeProduct?.url || "", pa: h.uaeProduct?.price_aed || 0, pq: h.uaeProduct?.pack_quantity || 1, ir: (h.indoResults?.results || []).slice(0, 50).map(r => ({ n: r.name || "", p: r.price_idr || 0, s: r.source === "Shopee" ? "S" : "T", sl: r.seller || "", sd: r.sold || "" })), lo: h.lowestPriceIDR || 0, md: h.medianPriceIDR || 0, hi: h.highestPriceIDR || 0, nr: h.indoResults?.price_stats?.num_results || 0, mb: h.margins?.best?.margin || 0, mm: h.margins?.median?.margin || 0, mw: h.margins?.worst?.margin || 0, mc: { uU: mm.uaeUSD||0, uA: mm.uaeAED||0, uI: mm.uaeIDR||0, iU: mm.indoUSD||0, iA: mm.indoAED||0, iI: mm.indoIDR||0, fU: mm.freightUSD||0, fA: mm.freightAED||0, fI: mm.freightIDR||0, dU: mm.dutyUSD||0, dA: mm.dutyAED||0, dI: mm.dutyIDR||0, lU: mm.lastMileUSD||0, lA: mm.lastMileAED||0, lI: mm.lastMileIDR||0, tU: mm.totalUSD||0, tA: mm.totalAED||0, tI: mm.totalIDR||0 }, cs: h.confidence?.score || 0, cl: h.confidence?.level || "low", cf: h.confidence?.flags || [], st: h.status || "", ts: h.timestamp || "", ap: h.source === "apify" ? 1 : 0 }; }
function expandEntry(c) { if (c.uaeProduct) return c; const mc = c.mc || {}; return { uaeProduct: { product_name: c.pn, clean_name_en: c.pen, clean_name_id: c.pid, brand: c.br, category: c.cat, weight_class: c.wc, source: c.src, url: c.url, price_aed: c.pa, pack_quantity: c.pq || 1 }, normalized: { clean_name_id: c.pid, clean_name_en: c.pen, category: c.cat, weight_class: c.wc }, indoResults: { results: (c.ir || []).map(r => ({ name: r.n, price_idr: r.p, source: r.s === "S" ? "Shopee" : "Tokopedia", seller: r.sl, sold: r.sd, url: "" })), price_stats: { lowest_idr: c.lo, median_idr: c.md, highest_idr: c.hi, num_results: c.nr }, confidence: { score: c.cs, level: c.cl, flags: c.cf } }, margins: { best: { margin: c.mb }, median: { margin: c.mm, uaeUSD: mc.uU, uaeAED: mc.uA, uaeIDR: mc.uI, indoUSD: mc.iU, indoAED: mc.iA, indoIDR: mc.iI, freightUSD: mc.fU, freightAED: mc.fA, freightIDR: mc.fI, dutyUSD: mc.dU, dutyAED: mc.dA, dutyIDR: mc.dI, lastMileUSD: mc.lU, lastMileAED: mc.lA, lastMileIDR: mc.lI, totalUSD: mc.tU, totalAED: mc.tA, totalIDR: mc.tI }, worst: { margin: c.mw } }, confidence: { score: c.cs, level: c.cl, flags: c.cf }, medianPriceIDR: c.md, lowestPriceIDR: c.lo, highestPriceIDR: c.hi, weightClass: c.wc, status: c.st, timestamp: c.ts, source: c.ap ? "apify" : "legacy" }; }
async function loadHistory(pin) { try { const d = await storeGet(pin + ":history"); return d?.length ? d.map(expandEntry) : []; } catch { return []; } }
async function saveHistory(pin, h) { try { return await storeSet(pin + ":history", h.map(compressEntry)); } catch { return false; } }
// hashPin removed — replaced by Supabase Auth

const Badge = ({ text, color = "#2EAA5A", bg = "#0D2E1A" }) => <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "3px", fontSize: "10px", fontFamily: "monospace", background: bg, color, border: "1px solid " + color + "33" }}>{text}</span>;
const Spinner = () => <div style={{ width: "14px", height: "14px", border: "2px solid #C9A84C", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />;
const ConfidenceBadge = ({ confidence, c }) => { if (!confidence) return null; const color = confidence.level === "high" ? c.green : confidence.level === "medium" ? c.darkGold : c.red; return <span style={{ fontSize: "9px", fontWeight: 700, color, padding: "1px 5px", borderRadius: "3px", border: "1px solid " + color + "44", fontFamily: "monospace" }}>{confidence.score}/100</span>; };
const WaveStatusBar = ({ waves, c }) => { if (!waves?.length) return null; return (<div style={{ marginBottom: "12px", padding: "10px 12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px" }}><div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px", textTransform: "uppercase" }}>SEARCH WAVES</div>{waves.map((w, i) => { const icon = w.status === "ok" ? "\u2713" : w.status === "skip" ? "\u2014" : w.status === "empty" ? "\u25cb" : "\u2717"; const wColor = w.status === "ok" ? c.green : w.status === "skip" ? c.dimmer : w.status === "empty" ? c.darkGold : c.red; return (<div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", fontSize: "11px" }}><span style={{ color: wColor, fontWeight: 700, width: "14px", textAlign: "center" }}>{icon}</span><span style={{ color: c.text, minWidth: "120px" }}>{w.name}</span><span style={{ color: w.count > 0 ? c.green : c.dimmer, fontWeight: 600 }}>{w.count} results</span>{w.reason && <span style={{ color: c.dim, fontSize: "10px", fontStyle: "italic" }}>{w.reason}</span>}</div>); })}</div>); };

// ══════════ COOKIE WIZARD ══════════
function CookieWizard({ c, onSave, onClose }) { const [step, setStep] = useState(0); const [pasted, setPasted] = useState(""); const isValid = pasted.trim().startsWith("[") && pasted.trim().endsWith("]"); const hasContent = pasted.trim().length > 5; const steps = [ { title: "Open Shopee in Edge", body: "Open Microsoft Edge, go to shopee.co.id, and log in with your Shopee account." }, { title: "Open EditThisCookie", body: "Click the cookie icon in your Edge toolbar. Install EditThisCookie v3 from Chrome Web Store if needed." }, { title: "Export the Cookie", body: "Click the Export button (5th icon from left). Your clipboard now has the cookie." }, { title: "Paste it here", body: null } ]; return (<div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={onClose}><div style={{ width: "520px", maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", background: c.surface, border: "1px solid " + c.border2, borderRadius: "8px", padding: "28px" }} onClick={e => e.stopPropagation()}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}><h3 style={{ fontFamily: "'Lora',serif", fontSize: "20px", color: c.gold, margin: 0 }}>{"\ud83c\udf6a"} Shopee Cookie Setup</h3><button onClick={onClose} style={{ background: "transparent", border: "none", color: c.dim, fontSize: "18px", cursor: "pointer" }}>{"\u2715"}</button></div><div style={{ display: "flex", alignItems: "center", marginBottom: "24px", gap: "4px" }}>{steps.map((_, i) => (<div key={i} style={{ display: "flex", alignItems: "center", flex: i < 3 ? 1 : 0 }}><div style={{ width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: i <= step ? c.gold : "transparent", color: i <= step ? c.btnText : c.dimmer, border: "2px solid " + (i <= step ? c.gold : c.border2), fontSize: "12px", fontWeight: 700, fontFamily: "monospace", flexShrink: 0 }}>{i + 1}</div>{i < 3 && <div style={{ flex: 1, height: "2px", background: i < step ? c.gold : c.border2, margin: "0 6px" }} />}</div>))}</div><div style={{ padding: "16px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "6px", marginBottom: "20px", minHeight: "120px" }}><div style={{ fontSize: "14px", fontWeight: 600, color: c.gold, marginBottom: "10px", fontFamily: "monospace" }}>{steps[step].title}</div>{step < 3 && <div style={{ fontSize: "13px", color: c.text, lineHeight: 1.7 }}>{steps[step].body}</div>}{step === 3 && <div><textarea value={pasted} onChange={e => setPasted(e.target.value)} placeholder="Paste cookie JSON here..." style={{ width: "100%", minHeight: "120px", padding: "10px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "11px", borderRadius: "4px", outline: "none", resize: "vertical" }} />{hasContent && <div style={{ marginTop: "8px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>{isValid ? <><span style={{ color: c.green }}>{"\u2713"}</span><span style={{ color: c.green }}>Looks good</span></> : <><span style={{ color: c.red }}>{"\u2717"}</span><span style={{ color: c.red }}>Doesn't look right</span></>}</div>}</div>}</div><div style={{ display: "flex", justifyContent: "space-between" }}><button onClick={() => step > 0 && setStep(step - 1)} style={{ padding: "8px 20px", background: "transparent", color: step > 0 ? c.dim : c.dimmest, border: "1px solid " + (step > 0 ? c.border2 : c.border), borderRadius: "4px", cursor: step > 0 ? "pointer" : "default", fontFamily: "monospace", fontSize: "11px" }}>{"< BACK"}</button>{step < 3 ? <button onClick={() => setStep(step + 1)} style={{ padding: "8px 24px", background: c.gold, color: c.btnText, border: "none", borderRadius: "4px", cursor: "pointer", fontFamily: "monospace", fontSize: "11px", fontWeight: 700 }}>{"NEXT >"}</button> : <button onClick={() => { if (isValid) { onSave(pasted.trim()); onClose(); } }} disabled={!isValid} style={{ padding: "8px 24px", background: isValid ? c.green : c.dimmest, color: "#fff", border: "none", borderRadius: "4px", cursor: isValid ? "pointer" : "default", fontFamily: "monospace", fontSize: "11px", fontWeight: 700, opacity: isValid ? 1 : 0.4 }}>{"\ud83c\udf6a SAVE"}</button>}</div></div></div>); }

// ══════════ MAIN APP ══════════
export default function App() {
  // ── Auth State ──
  const [authUser, setAuthUser] = useState(null); // { id, email }
  const [authToken, setAuthToken] = useState("");
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [userProfile, setUserProfile] = useState(null); // { role, lookups_used, margins_used, ... }
  const [storageReady, setStorageReady] = useState(false);
  const [dark, setDark] = useState(true);
  const toggleTheme = async () => { const n = !dark; setDark(n); await storeSet("global:theme", n ? "dark" : "light"); };
  const userId = authUser?.id || "";
  const isAdmin = userProfile?.role === "admin";
  const unlocked = !!authUser;

  const [mode, setMode] = useState("discover");
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
  const tokoActorId = "jupri/tokopedia-scraper";
  const shopeeActorId = "fatihtahta/shopee-scraper";

  // Brand blocklist
  const [customBrands, setCustomBrands] = useState([]);
  const [showBrandList, setShowBrandList] = useState(false);
  const [newBrandInput, setNewBrandInput] = useState("");
  const allBrands = [...new Set([...BRAND_BLOCKLIST_DEFAULT, ...customBrands])];

  // Keyword bank
  const [keywords, setKeywords] = useState([...DEFAULT_KEYWORDS]);
  const [newKeywordInput, setNewKeywordInput] = useState("");

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
  const [freightMode, setFreightMode] = useState("air");
  const [qtyMode, setQtyMode] = useState("unit");
  const [waveStatus, setWaveStatus] = useState([]);
  const [lookupView, setLookupView] = useState("landing"); // "landing" | "scrape" | "results"

  // Discover state
  const [discSearchInput, setDiscSearchInput] = useState("");
  const [discAmazonResults, setDiscAmazonResults] = useState([]);
  const [discSearchingAmazon, setDiscSearchingAmazon] = useState(false);
  const [discError, setDiscError] = useState("");
  const [discValidatingIdx, setDiscValidatingIdx] = useState(null);
  const [discValidationResults, setDiscValidationResults] = useState({});
  // Discover history: array of { keyword, timestamp, results: [...], totalRaw: N }
  const [discHistory, setDiscHistory] = useState([]);
  const [discSelectedIdx, setDiscSelectedIdx] = useState(-1);
  const [discSort, setDiscSort] = useState("reviews");

  // Brainstorm state
  const [bsAmazonProducts, setBsAmazonProducts] = useState([]);
  const [bsLastScan, setBsLastScan] = useState(null);
  const [bsDept, setBsDept] = useState("kitchen");
  const [bsStep, setBsStep] = useState(0); // 0=idle, 1=extracting subcats, 2=reviewing subcats, 3=scraping, 4=filtering, 5=done
  const [bsSubcats, setBsSubcats] = useState([]);
  const [bsProgress, setBsProgress] = useState({ done: 0, total: 0, current: "" });
  const [bsError, setBsError] = useState("");
  const [bsHideBranded, setBsHideBranded] = useState(true);
  const [bsBoostIndo, setBsBoostIndo] = useState(true);
  const [bsFilter, setBsFilter] = useState({ search: "", minPrice: "", maxPrice: "", dept: "all" });
  const [bsSort, setBsSort] = useState("signal");
  const [bsValidatingIdx, setBsValidatingIdx] = useState(null);
  const [bsValidationResults, setBsValidationResults] = useState({});
  const bsAbortRef = useRef(false);

  // Admin state
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminSearches, setAdminSearches] = useState([]);
  const [adminRates, setAdminRates] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState("users"); // users | searches | rates

  // Diagnostic Log
  const [diagLogs, setDiagLogs] = useState([]);
  const [showDiag, setShowDiag] = useState(false);
  const [diagFilter, setDiagFilter] = useState("all");
  const diagRef = useRef([]);
  const addDiag = (level, label, message, data = null) => { const entry = { ts: new Date().toISOString().slice(11, 23), level, label, message, data: data != null ? (typeof data === "string" ? data.slice(0, 2000) : JSON.stringify(data).slice(0, 2000)) : null }; console.log(`[DIAG ${level}] ${label}: ${message}`, data != null ? data : ""); diagRef.current = [entry, ...diagRef.current].slice(0, 200); setDiagLogs([...diagRef.current]); };
  const clearDiag = () => { diagRef.current = []; setDiagLogs([]); };

  const [expandedHistoryIdx, setExpandedHistoryIdx] = useState(-1);
  const saveTimerRef = useRef(null);
  const apiKeyLoaded = useRef(false);
  const apifyKeyLoaded = useRef(false);
  const sdKeyLoaded = useRef(false);
  const historyRef = useRef(history);
  historyRef.current = history;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const c = dark ? { bg: "#0a0a0a", surface: "#0C0F0C", surface2: "#0E120E", input: "#1a1a1a", border: "#222", border2: "#333", text: "#d4d4d4", dim: "#888", dimmer: "#555", dimmest: "#444", gold: "#C9A84C", green: "#2EAA5A", red: "#f87171", darkGold: "#D4A843", cardBg: "#080808", btnText: "#0f0f0f", sectionBg: "#0D1F15" } : { bg: "#F5F2EB", surface: "#FFFFFF", surface2: "#F0EDE4", input: "#FFFFFF", border: "#D4CFC4", border2: "#C0BAB0", text: "#1A1A1A", dim: "#555", dimmer: "#888", dimmest: "#AAA", gold: "#8B6914", green: "#1A7A3A", red: "#DC2626", darkGold: "#9A7A1C", cardBg: "#F8F6F0", btnText: "#FFFFFF", sectionBg: "#E8F5EC" };

  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const runWithProgress = async (fn, estimatedSec) => { setProgress(0); const interval = setInterval(() => { setProgress(p => { const next = p + (100 / estimatedSec / 4); return next > 95 ? 95 : next; }); }, 250); try { const result = await fn(); setProgress(100); clearInterval(interval); return result; } catch (e) { clearInterval(interval); setProgress(0); throw e; } };

  // ── Auth Functions ──
  const supabaseAuth = async (endpoint, body, method = "POST") => {
    const r = await fetch(SUPABASE_URL + "/auth/v1/" + endpoint, {
      method, headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json", ...(body?.token ? { Authorization: "Bearer " + body.token } : {}) },
      ...(method !== "GET" ? { body: JSON.stringify(body) } : {})
    });
    return { ok: r.ok, status: r.status, data: await r.json() };
  };

  const handleSignUp = async () => {
    if (!authEmail || !authPassword) { setAuthError("Email and password required"); return; }
    if (authPassword.length < 6) { setAuthError("Password must be 6+ characters"); return; }
    if (isDisposableEmail(authEmail)) { setAuthError("Disposable email addresses are not allowed. Please use a real email."); return; }
    setAuthLoading(true); setAuthError("");
    try {
      const { ok, data } = await supabaseAuth("signup", { email: authEmail, password: authPassword });
      if (!ok) throw new Error(data.msg || data.error_description || data.message || "Signup failed");
      if (data.access_token) {
        // Auto-confirmed (Supabase setting)
        localStorage.setItem("gt_token", data.access_token);
        localStorage.setItem("gt_refresh", data.refresh_token || "");
        setAuthToken(data.access_token);
        setAuthUser(data.user);
        await loadProfile(data.user.id, data.access_token);
      } else {
        setAuthError("Check your email to confirm your account, then log in.");
        setAuthMode("login");
      }
    } catch (e) { setAuthError(e.message); }
    setAuthLoading(false);
  };

  const handleSignIn = async () => {
    if (!authEmail || !authPassword) { setAuthError("Email and password required"); return; }
    setAuthLoading(true); setAuthError("");
    try {
      const { ok, data } = await supabaseAuth("token?grant_type=password", { email: authEmail, password: authPassword });
      if (!ok) throw new Error(data.msg || data.error_description || data.message || "Login failed");
      localStorage.setItem("gt_token", data.access_token);
      localStorage.setItem("gt_refresh", data.refresh_token || "");
      setAuthToken(data.access_token);
      setAuthUser(data.user);
      await loadProfile(data.user.id, data.access_token);
    } catch (e) { setAuthError(e.message); }
    setAuthLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!authEmail) { setAuthError("Enter your email first"); return; }
    setAuthLoading(true); setAuthError("");
    try {
      const { ok, data } = await supabaseAuth("recover", { email: authEmail });
      if (!ok) throw new Error(data.msg || data.error_description || "Failed");
      setAuthError("Password reset email sent. Check your inbox.");
    } catch (e) { setAuthError(e.message); }
    setAuthLoading(false);
  };

  const handleSignOut = async () => {
    try { await fetch(SUPABASE_URL + "/auth/v1/logout", { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + authToken } }); } catch {}
    localStorage.removeItem("gt_token");
    localStorage.removeItem("gt_refresh");
    setAuthUser(null); setAuthToken(""); setUserProfile(null);
    setHistory([]); setStorageReady(false);
  };

  // Keep storage layer in sync with auth token
  useEffect(() => { setStorageAuthToken(authToken); }, [authToken]);

  const loadProfile = async (uid, token) => {
    try {
      const r = await fetch(SUPABASE_URL + "/rest/v1/profiles?id=eq." + uid + "&select=*", {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token }
      });
      if (r.ok) { const rows = await r.json(); if (rows?.[0]) setUserProfile(rows[0]); }
    } catch (e) { console.warn("Profile load failed:", e); }
  };

  const refreshProfile = async () => {
    if (userId && authToken) await loadProfile(userId, authToken);
  };

  // ── Admin data loaders ──
  const loadAdminUsers = async () => {
    if (!authToken || !isAdmin) return;
    try {
      const r = await fetch(SUPABASE_URL + "/rest/v1/profiles?select=id,email,display_name,company,role,lookups_used,margins_used,created_at&order=created_at.desc&limit=200", {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + authToken }
      });
      if (r.ok) setAdminUsers(await r.json());
    } catch (e) { addDiag("error", "admin", "Load users failed: " + e.message); }
  };

  const loadAdminSearches = async () => {
    if (!authToken || !isAdmin) return;
    try {
      const r = await fetch(SUPABASE_URL + "/rest/v1/searches?select=id,user_id,search_type,product_name,uae_price_aed,indo_median_idr,margin_pct,freight_mode,created_at&order=created_at.desc&limit=200", {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + authToken }
      });
      if (r.ok) setAdminSearches(await r.json());
    } catch (e) { addDiag("error", "admin", "Load searches failed: " + e.message); }
  };

  const loadAdminRates = async () => {
    if (!authToken) return;
    try {
      const r = await fetch(SUPABASE_URL + "/rest/v1/logistics_rates?select=*&order=route_name.asc", {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + authToken }
      });
      if (r.ok) setAdminRates(await r.json());
    } catch (e) { addDiag("error", "admin", "Load rates failed: " + e.message); }
  };

  const updateUserRole = async (uid, newRole) => {
    if (!authToken || !isAdmin) return;
    try {
      await fetch(SUPABASE_URL + "/rest/v1/profiles?id=eq." + uid, {
        method: "PATCH",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + authToken, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ role: newRole })
      });
      await loadAdminUsers();
    } catch (e) { addDiag("error", "admin", "Update role failed: " + e.message); }
  };

  // ── Init: restore session ──
  useEffect(() => { (async () => {
    const t = await storeGet("global:theme"); if (t === "light") setDark(false);
    const savedToken = localStorage.getItem("gt_token");
    if (savedToken) {
      try {
        const r = await fetch(SUPABASE_URL + "/auth/v1/user", {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + savedToken }
        });
        if (r.ok) {
          const user = await r.json();
          if (user?.id) {
            setAuthToken(savedToken);
            setAuthUser(user);
            await loadProfile(user.id, savedToken);
          } else { localStorage.removeItem("gt_token"); }
        } else {
          // Try refresh
          const refreshToken = localStorage.getItem("gt_refresh");
          if (refreshToken) {
            const rr = await supabaseAuth("token?grant_type=refresh_token", { refresh_token: refreshToken });
            if (rr.ok && rr.data.access_token) {
              localStorage.setItem("gt_token", rr.data.access_token);
              localStorage.setItem("gt_refresh", rr.data.refresh_token || refreshToken);
              setAuthToken(rr.data.access_token);
              setAuthUser(rr.data.user);
              await loadProfile(rr.data.user.id, rr.data.access_token);
            } else { localStorage.removeItem("gt_token"); localStorage.removeItem("gt_refresh"); }
          }
        }
      } catch { localStorage.removeItem("gt_token"); }
    }
  })(); }, []);

  // ── Load data on unlock (with legacy PIN migration) ──
  const LEGACY_PINS = ["766911", "240996"];
  useEffect(() => {
    if (!unlocked || !userId) return;
    setStorageReady(false);
    (async () => {
      try {
        // ── Check if user already has data ──
        let cfg = await storeGet(userId + ":config");
        let hist = await loadHistory(userId);

        // ── One-time migration: copy legacy PIN data to UUID (ADMIN ONLY) ──
        const profileForMigration = userProfile;
        if (!cfg && !hist.length && profileForMigration?.role === "admin") {
          const migrated = await storeGet(userId + ":migrated");
          if (!migrated) {
            addDiag("info", "migration", "Admin account — checking legacy PINs...");
            for (const pin of LEGACY_PINS) {
              const legacyCfg = await storeGet(pin + ":config");
              const legacyHist = await loadHistory(pin);
              if (legacyCfg || legacyHist.length) {
                addDiag("ok", "migration", `Found data under PIN ${pin}: config=${!!legacyCfg}, history=${legacyHist.length}`);
                // Copy config
                if (legacyCfg && !cfg) {
                  await storeSet(userId + ":config", legacyCfg);
                  cfg = legacyCfg;
                }
                // Copy history
                if (legacyHist.length && !hist.length) {
                  await saveHistory(userId, legacyHist);
                  hist = legacyHist;
                }
                // Copy keywords
                const legacyKw = await storeGet(pin + ":keywords");
                if (legacyKw?.length) await storeSet(userId + ":keywords", legacyKw);
                // Copy brandlist
                const legacyBl = await storeGet(pin + ":brandlist");
                if (legacyBl?.length) await storeSet(userId + ":brandlist", legacyBl);
                // Copy brainstorm data
                const legacyBs = await storeGet(pin + ":brainstorm:amazon");
                if (legacyBs?.products?.length) await storeSet(userId + ":brainstorm:amazon", legacyBs);
                // Copy discover history
                const legacyDisc = await storeGet(pin + ":discover:history");
                if (legacyDisc?.length) await storeSet(userId + ":discover:history", legacyDisc);
                addDiag("ok", "migration", `Migrated PIN ${pin} data to UUID ${userId.slice(0,8)}...`);
                break; // Only migrate from the first PIN that has data
              }
            }
            await storeSet(userId + ":migrated", { from: "pin", ts: new Date().toISOString() });
          }
        }

        // ── Load data (now includes migrated data if applicable) ──
        if (cfg) {
          if (cfg.apiKey) { apiKeyLoaded.current = true; setApiKey(cfg.apiKey); setApiKeyStatus("loaded"); }
          if (cfg.apifyKey) { apifyKeyLoaded.current = true; setApifyKey(cfg.apifyKey); setApifyStatus("loaded"); }
          if (cfg.scrapingDogKey) { sdKeyLoaded.current = true; setScrapingDogKey(cfg.scrapingDogKey); setSdStatus("loaded"); }
          if (cfg.indoMode) setIndoMode(cfg.indoMode);
          if (cfg.freight) setFreight(cfg.freight);
          if (cfg.shopeeCookie) setShopeeCookie(cfg.shopeeCookie);
          if (cfg.shopeeCookieUpdatedAt) setShopeeCookieUpdatedAt(cfg.shopeeCookieUpdatedAt);
        }
        setHistory(hist.length ? hist : await loadHistory(userId));
        const kw = await storeGet(userId + ":keywords");
        if (kw?.length) setKeywords(kw);
        const bl = await storeGet(userId + ":brandlist");
        if (bl?.length) setCustomBrands(bl);
        const bsA = await storeGet(userId + ":brainstorm:amazon");
        if (bsA?.products?.length) { setBsAmazonProducts(bsA.products); setBsLastScan(bsA.scannedAt); }
        const disc = await storeGet(userId + ":discover:history");
        if (disc?.length) { setDiscHistory(disc); setDiscAmazonResults(disc[0]?.results || []); setDiscSelectedIdx(0); }
      } catch (e) { console.warn("Load failed:", e); }
      setStorageReady(true);
    })();
  }, [unlocked, userId]);

  // ── Auto-save config ──
  useEffect(() => { if (!storageReady || !userId) return; const t = setTimeout(() => storeSet(userId + ":config", { apiKey, apifyKey, scrapingDogKey, indoMode, freight: freight.source === "live" ? freight : null, shopeeCookie, shopeeCookieUpdatedAt }), 1500); return () => clearTimeout(t); }, [storageReady, userId, apiKey, apifyKey, scrapingDogKey, indoMode, freight, shopeeCookie, shopeeCookieUpdatedAt]);
  // Auto-save history
  const saveHistoryNow = useCallback(async (h) => { if (userIdRef.current) await saveHistory(userIdRef.current, h); }, []);
  useEffect(() => { if (!storageReady || !userId) return; if (saveTimerRef.current) clearTimeout(saveTimerRef.current); saveTimerRef.current = setTimeout(() => saveHistory(userId, history), 2000); }, [history, storageReady, userId]);
  // Auto-save keywords
  useEffect(() => { if (!storageReady || !userId) return; const t = setTimeout(() => storeSet(userId + ":keywords", keywords), 1500); return () => clearTimeout(t); }, [keywords, storageReady, userId]);
  // Auto-save brand list
  useEffect(() => { if (!storageReady || !userId) return; const t = setTimeout(() => storeSet(userId + ":brandlist", customBrands), 1500); return () => clearTimeout(t); }, [customBrands, storageReady, userId]);
  // Auto-save discover history
  useEffect(() => { if (!storageReady || !userId || !discHistory.length) return; const t = setTimeout(() => storeSet(userId + ":discover:history", discHistory), 2000); return () => clearTimeout(t); }, [discHistory, storageReady, userId]);

  // Key status indicators
  useEffect(() => { if (!apiKey || apiKey.length < 10 || !storageReady) return; if (apiKeyLoaded.current) { apiKeyLoaded.current = false; return; } setApiKeyStatus("saved"); const t = setTimeout(() => setApiKeyStatus(""), 1500); return () => clearTimeout(t); }, [apiKey, storageReady]);
  useEffect(() => { if (!apifyKey || apifyKey.length < 5 || !storageReady) return; if (apifyKeyLoaded.current) { apifyKeyLoaded.current = false; return; } setApifyStatus("saved"); const t = setTimeout(() => setApifyStatus(""), 1500); return () => clearTimeout(t); }, [apifyKey, storageReady]);
  useEffect(() => { if (!scrapingDogKey || scrapingDogKey.length < 5 || !storageReady) return; if (sdKeyLoaded.current) { sdKeyLoaded.current = false; return; } setSdStatus("saved"); const t = setTimeout(() => setSdStatus(""), 1500); return () => clearTimeout(t); }, [scrapingDogKey, storageReady]);

  // Cooldown & FX
  useEffect(() => { if (cooldown <= 0) return; const t = setInterval(() => setCooldown(x => x <= 1 ? 0 : x - 1), 1000); return () => clearInterval(t); }, [cooldown]);
  useEffect(() => { if (!unlocked) return; (async () => { const cached = await storeGet("global:fx"); if (cached && Date.now() - cached.ts < FX_CACHE_MS) { const b = cached.rates; setFx({ AEDUSD: b.AEDUSD || 0.2723, IDRUSD: b.IDRUSD || 0.0000613, AED_TO_IDR: (b.AEDUSD || 0.2723) / (b.IDRUSD || 0.0000613), IDR_TO_AED: (b.IDRUSD || 0.0000613) / (b.AEDUSD || 0.2723) }); setFxUpdated(new Date(cached.ts)); return; } try { const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=AED,IDR"); const d = await r.json(); const aedusd = 1/d.rates.AED, idrusd = 1/d.rates.IDR; const rates = { AEDUSD: aedusd, IDRUSD: idrusd, AED_TO_IDR: aedusd/idrusd, IDR_TO_AED: idrusd/aedusd }; setFx(rates); setFxUpdated(new Date()); await storeSet("global:fx", { rates, ts: Date.now() }); } catch {} })(); }, [unlocked]);

  // ══════════ CORE: callClaude ══════════
  const callClaude = async (prompt, model, useSearch = false, retries = 2, maxTokens = 2048) => {
    addDiag("info", "callClaude", `model=${model} search=${useSearch}`, prompt.slice(0, 120));
    const body = { action: "claude", data: { model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }], tools: useSearch ? [{ type: "web_search_20250305", name: "web_search" }] : undefined } };
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const r = await fetch(WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (r.status === 429) { if (attempt < retries) { setStage(s => s.replace(/ \(retry.*/, "") + " (retry...)"); await wait((attempt + 1) * (useSearch ? 15000 : 8000)); continue; } throw new Error("Rate limited. Wait 30s."); }
        if (!r.ok) { let d = ""; try { d = (await r.json()).error?.message || ""; } catch {} throw new Error("API " + r.status + ": " + (d || "error")); }
        const data = await r.json();
        let text = data.content?.filter(b => b.type === "text").map(b => b.text || "").filter(Boolean).join("\n") || "";
        if (!text && data.content?.length) {
          addDiag("warn", "callClaude", `No text blocks among ${data.content.length} blocks: ${data.content.map(b => b.type).join(",")}`);
          const thinkText = data.content.filter(b => b.type === "thinking").map(b => b.thinking || "").filter(Boolean).join("\n");
          if (thinkText) addDiag("info", "callClaude", `Thinking block present (${thinkText.length} chars), but no text output`);
        }
        if (!text) {
          addDiag("error", "callClaude", "Empty response (no text blocks)", data.content ? JSON.stringify(data.content.map(b => b.type)) : "no content");
          throw new Error("Claude returned empty response");
        }
        return text;
      } catch (err) { if (attempt === retries) throw err; await wait((attempt + 1) * 10000); }
    }
  };

  const parseJSON = (text) => {
    let s = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const matches = []; let depth = 0, start = -1;
    for (let i = 0; i < s.length; i++) { if (s[i] === "{") { if (depth === 0) start = i; depth++; } if (s[i] === "}") { depth--; if (depth === 0 && start >= 0) { matches.push(s.substring(start, i + 1)); start = -1; } } }
    for (const m of matches.sort((a, b) => b.length - a.length)) { try { const p = JSON.parse(m); if (p.product_name || p.results || p.clean_name_en || p.similar || p.products || p.subcategories) return p; } catch {} }
    try { return JSON.parse(s); } catch {}
    throw new Error("No valid JSON");
  };

  // ══════════ MARGIN CALCULATOR ══════════
  const calcMargin = (uaePriceAed, packQty, indoIDR, weightClass, fMode = "air") => {
    const uaeUnitAed = uaePriceAed / (packQty || 1); const uaeUSD = uaeUnitAed * fx.AEDUSD; const indoUSD = indoIDR * fx.IDRUSD;
    const wkg = WEIGHT_KG[weightClass] || 1.0; const cbm = VOLUME_CBM[weightClass] || 0.005;
    let fr;
    if (fMode === "sea_lcl") { fr = (freight.ocean?.rate_per_cbm || 45) * cbm; }
    else if (fMode === "sea_fcl") { const upc = Math.floor(28 / cbm); fr = (freight.ocean?.rate_20ft || 800) / Math.max(1, upc); }
    else { fr = (freight.air?.rate_per_kg || 4) * wkg; }
    const duty = (indoUSD + fr) * CUSTOMS_DUTY; const lm = LAST_MILE_AED * fx.AEDUSD; const total = indoUSD + fr + duty + lm; const margin = uaeUSD > 0 ? ((uaeUSD - total) / uaeUSD) * 100 : 0;
    return { uaeUSD, uaeAED: uaeUnitAed, uaeIDR: uaeUnitAed * fx.AED_TO_IDR, indoUSD, indoAED: indoUSD / fx.AEDUSD, indoIDR, freightUSD: fr, freightAED: fr / fx.AEDUSD, freightIDR: fr / fx.IDRUSD, dutyUSD: duty, dutyAED: duty / fx.AEDUSD, dutyIDR: duty / fx.IDRUSD, lastMileUSD: lm, lastMileAED: LAST_MILE_AED, lastMileIDR: LAST_MILE_AED * fx.AED_TO_IDR, totalUSD: total, totalAED: total / fx.AEDUSD, totalIDR: total / fx.IDRUSD, margin, freightMode: fMode };
  };
  // Route-specific margin calc
  const calcRouteMargin = (uaePriceAed, packQty, indoIDR, weightClass, route) => {
    const uaeUnitAed = uaePriceAed / (packQty || 1); const uaeUSD = uaeUnitAed * fx.AEDUSD; const indoUSD = indoIDR * fx.IDRUSD;
    const wkg = WEIGHT_KG[weightClass] || 1.0; const cbm = VOLUME_CBM[weightClass] || 0.005;
    let fr;
    if (route.mode === "sea_lcl") { fr = (route.rate || 45) * cbm; }
    else if (route.mode === "sea_fcl") { const upc = Math.floor(28 / cbm); fr = (route.rate || 800) / Math.max(1, upc); }
    else { fr = (route.rate || 4) * wkg; }
    const duty = (indoUSD + fr) * CUSTOMS_DUTY; const lm = LAST_MILE_AED * fx.AEDUSD; const total = indoUSD + fr + duty + lm;
    const margin = uaeUSD > 0 ? ((uaeUSD - total) / uaeUSD) * 100 : 0;
    return { margin, freightUSD: fr, totalUSD: total, profitUSD: uaeUSD - total, profitAED: (uaeUSD - total) / fx.AEDUSD };
  };

  // All-route comparison (for logistics panel)
  const routeComparisons = marginData ? ROUTES.map(route => ({
    ...route,
    ...calcRouteMargin(marginData.uaeProduct?.price_aed||0, marginData.uaeProduct?.pack_quantity||1, marginData.medianPriceIDR||0, marginData.weightClass||"medium", route),
  })) : [];

  // Dynamic display margins (recalc when freight toggle changes)
  const displayMargins = marginData ? {
    median: calcMargin(marginData.uaeProduct?.price_aed||0, marginData.uaeProduct?.pack_quantity||1, marginData.medianPriceIDR||0, marginData.weightClass||"medium", freightMode),
    best: calcMargin(marginData.uaeProduct?.price_aed||0, marginData.uaeProduct?.pack_quantity||1, marginData.lowestPriceIDR||0, marginData.weightClass||"medium", freightMode),
    worst: calcMargin(marginData.uaeProduct?.price_aed||0, marginData.uaeProduct?.pack_quantity||1, marginData.highestPriceIDR||0, marginData.weightClass||"medium", freightMode),
  } : null;
  const displayStatus = displayMargins ? (displayMargins.median.margin >= MARGIN_THRESHOLD.candidate ? "Candidate" : displayMargins.median.margin >= MARGIN_THRESHOLD.borderline ? "Investigated" : "Rejected") : "";

  // ══════════ QUOTA + VALIDATION ══════════
  const [quotaError, setQuotaError] = useState("");

  const isDisposableEmail = (email) => {
    const domain = (email || "").split("@")[1]?.toLowerCase();
    return DISPOSABLE_DOMAINS.includes(domain);
  };

  const checkQuota = (type) => {
    if (isAdmin) return true;
    if (!userProfile) return false;
    const limits = TIER_LIMITS[userProfile.role] || TIER_LIMITS.free;
    if (type === "lookup" && userProfile.lookups_used >= limits.lookups) {
      setQuotaError("You\u2019ve used " + userProfile.lookups_used + "/" + limits.lookups + " lookups this month. Contact sadewoahmadm@gmail.com for more.");
      return false;
    }
    if (type === "margin" && userProfile.margins_used >= limits.margins) {
      setQuotaError("You\u2019ve used " + userProfile.margins_used + "/" + limits.margins + " margin analyses this month. Contact sadewoahmadm@gmail.com for more.");
      return false;
    }
    setQuotaError("");
    return true;
  };

  // ══════════ USAGE TRACKING ══════════
  const incrementUsage = async (field) => {
    try {
      await workerCall("increment_usage", { field });
      await refreshProfile();
    } catch (e) { addDiag("warn", "usage", "Increment failed: " + e.message); }
  };

  // ══════════ INDO SEARCH — APIFY ══════════
  const workerCall = async (action, data) => {
    const r = await fetch(WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json", ...(authToken ? { Authorization: "Bearer " + authToken } : {}) }, body: JSON.stringify({ action, authToken, ...data }) });
    if (r.status === 429) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Rate limit reached. Upgrade your plan."); }
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "Worker error " + r.status); }
    return r.json();
  };

  const runApifyActor = async (actorId, input, label) => {
    setStage("Starting " + label + "...");
    const rd = await workerCall("apify_run", { actorId, input });
    const runId = rd.data?.id; if (!runId) throw new Error(label + " no run ID");
    let status = "RUNNING", pc = 0;
    while (status === "RUNNING" || status === "READY") { if (pc > 60) throw new Error(label + " timeout"); await wait(5000); pc++; setStage(label + " (" + (pc * 5) + "s)"); setProgress(Math.min(90, pc * 3)); try { const pr = await workerCall("apify_status", { runId }); status = pr.data?.status || "RUNNING"; } catch {} }
    if (status !== "SUCCEEDED") throw new Error(label + " status: " + status);
    const dsId = rd.data?.defaultDatasetId; if (!dsId) throw new Error(label + " no dataset");
    const items = await workerCall("apify_dataset", { datasetId: dsId, limit: 50 });
    return Array.isArray(items) ? items : [];
  };

  const normalizeApifyResults = (items, platform) => {
    if (!Array.isArray(items)) return [];
    return items.filter(i => i).map(i => {
      let price = 0;
      // Tokopedia actor: price is { number: 650000, text: "Rp650.000" }
      if (typeof i.price === "object" && i.price !== null) {
        price = i.price.number || i.price.min || i.price.max || i.price.value || 0;
      } else {
        price = i.price || i.currentPrice || i.salePrice || i.price_idr || i.discountedPrice || i.promo_price || i.finalPrice || i.sale_price || i.normal_price || i.current_price || i.item_basic?.price || i.price_min || 0;
      }
      if (typeof price === "string") price = sanitizeIDR(price);
      if (typeof price === "number" && price > 0 && price < 500) price = Math.round(price * 1000);
      if (typeof price === "number" && price > 1000000000) price = Math.round(price / 100000);
      const soldRaw = i.stock?.sold || i.sold || i.totalSold || i.historicalSold || i.item_basic?.sold || "";
      return { name: i.title || i.name || i.productName || i.item_name || "", price_idr: Math.round(price), source: platform, seller: i.shopName || i.sellerName || i.seller || i.shop?.name || "", sold: String(soldRaw), url: i.url || i.link || i.productUrl || "", rating: i.rating || i.star || "" };
    }).filter(r => r.price_idr >= 1000 && r.name);
  };

  const runTokoApify = async (allQueries) => {
    const waves = [];
    // Filter to Bahasa-only queries (skip English-only strings)
    const bahasaQueries = allQueries.filter(q => /[a-z]/.test(q) && !/^[a-zA-Z0-9\s,.\-()]+$/.test(q) || /kopi|biji|bubuk|kayu|bambu|rotan|kelapa|batu|minyak|sabun|teh|gula|coklat|kain|tas|mangkok/i.test(q));
    const queryArray = bahasaQueries.length > 0 ? bahasaQueries : allQueries;
    const tokoInput = { query: queryArray.slice(0, 5), limit: 30 };
    addDiag("info", "toko_apify", `Sending ${tokoInput.query.length} queries`, JSON.stringify(tokoInput.query));
    setStage("Scraping Tokopedia..."); setProgress(10);
    try {
      const items = await runApifyActor(tokoActorId, tokoInput, "Tokopedia");
      const results = normalizeApifyResults(items, "Tokopedia");
      addDiag(results.length > 0 ? "ok" : "warn", "toko_apify", `${items.length} raw → ${results.length} valid`);
      waves.push({ name: "Tokopedia", status: results.length > 0 ? "ok" : "empty", count: results.length });
      return { allResults: results, waves, source: "apify" };
    } catch (e) {
      addDiag("error", "toko_apify", e.message);
      waves.push({ name: "Tokopedia", status: "fail", count: 0, reason: e.message });
      return { allResults: [], waves, source: "apify" };
    }
  };

  const runShopeeApify = async (allQueries) => {
    const waves = [];
    const mainQ = allQueries[0];
    const shopeeUrl = "https://shopee.co.id/search?keyword=" + encodeURIComponent(mainQ) + "&price_min=10000&price_max=800000&sort=7";
    const shopeeInput = { searchUrls: [shopeeUrl], country: "ID", maxProducts: 30, scrapeMode: "fast" };
    if (shopeeCookie) shopeeInput.cookies = shopeeCookie;
    addDiag("info", "shopee_apify", `Query: "${mainQ}"`);
    setStage("Scraping Shopee..."); setProgress(10);
    try {
      const items = await runApifyActor(shopeeActorId, shopeeInput, "Shopee");
      const results = normalizeApifyResults(items, "Shopee");
      addDiag(results.length > 0 ? "ok" : "warn", "shopee_apify", `${items.length} raw → ${results.length} valid`);
      waves.push({ name: "Shopee", status: results.length > 0 ? "ok" : "empty", count: results.length });
      return { allResults: results, waves, source: "apify" };
    } catch (e) {
      addDiag("error", "shopee_apify", e.message);
      waves.push({ name: "Shopee", status: "fail", count: 0, reason: e.message });
      return { allResults: [], waves, source: "apify" };
    }
  };

  const runIndoApify = async (bahasaQuery, allQueries) => {
    const toko = await runTokoApify(allQueries);
    const shopee = await runShopeeApify(allQueries);
    return { allResults: [...toko.allResults, ...shopee.allResults], waves: [...toko.waves, ...shopee.waves], source: "apify" };
  };

  // ══════════ INDO SEARCH — CLAUDE ══════════
  const runIndoClaude = async (productData, queries) => {
    const waves = []; const mainQ = queries[0];
    const doSearch = async (platform, label) => {
      const site = platform === "Tokopedia" ? "tokopedia.com" : "shopee.co.id";
      setStage(label + " " + platform + "...");
      const raw = await runWithProgress(() => callClaude('Find "' + productData.clean_name_id + '" on ' + platform + ' Indonesia.\nSearch: "' + mainQ + ' ' + site + '"\nSearch: "' + mainQ + ' ' + platform + ' Indonesia harga"\nONLY ' + platform + '. Include name, price IDR, seller, sold, link.', "claude-sonnet-4-20250514", true, 2, 4096), 25);
      const blockReason = detectBlockedSignals(raw, platform);
      await wait(1500); setStage(label + " Formatting...");
      const fmt = await runWithProgress(() => callClaude('Convert to JSON. ONLY ' + platform + ':\n' + raw + '\n{"results":[{"name":"","price_idr":NUMBER,"source":"' + platform + '","seller":"","sold":"","url":""}]}\nJSON only:', "claude-haiku-4-5-20251001", false, 2, 4096), 8);
      try { const p = parseJSON(fmt); const results = (p.results || []).map(r => ({ name: r.name || "", price_idr: sanitizeIDR(r.price_idr || r.price || 0), source: platform, seller: r.seller || "", sold: (() => { let s = r.sold || ""; if (typeof s === "string" && /not visible|n\/a|^0$/i.test(s)) return ""; return s; })(), url: r.url || "" })); const valid = results.filter(r => r.price_idr >= 1000); return { results, blockReason: valid.length === 0 ? blockReason : null }; } catch { return { results: [], blockReason }; }
    };
    let allResults = [];
    try { const { results, blockReason } = await doSearch("Tokopedia", "\u2460"); allResults.push(...results); waves.push({ name: "Tokopedia", status: results.filter(x => x.price_idr >= 1000).length > 0 ? "ok" : "empty", count: results.filter(x => x.price_idr >= 1000).length, reason: blockReason || "" }); } catch (e) { waves.push({ name: "Tokopedia", status: "fail", count: 0, reason: e.message }); }
    await wait(5000);
    try { const { results, blockReason } = await doSearch("Shopee", "\u2461"); allResults.push(...results); waves.push({ name: "Shopee", status: results.filter(x => x.price_idr >= 1000).length > 0 ? "ok" : "empty", count: results.filter(x => x.price_idr >= 1000).length, reason: blockReason || "" }); } catch (e) { waves.push({ name: "Shopee", status: "fail", count: 0, reason: e.message }); }
    if (allResults.filter(r => r.price_idr >= 1000).length < 10) {
      await wait(5000); setStage("\u2462 Broad search...");
      try { const raw = await runWithProgress(() => callClaude('Search "' + mainQ + ' harga terbaru indonesia"\nBoth Tokopedia AND Shopee. Name, price IDR, marketplace, seller, sold, URL.', "claude-sonnet-4-20250514", true, 2, 4096), 25); await wait(1500); const fmt = await callClaude('Convert:\n' + raw + '\n{"results":[{"name":"","price_idr":NUMBER,"source":"Tokopedia or Shopee","seller":"","sold":"","url":""}]} JSON only:', "claude-haiku-4-5-20251001", false, 2, 4096); try { const p = parseJSON(fmt); allResults.push(...(p.results || []).map(r => ({ name: r.name || "", price_idr: sanitizeIDR(r.price_idr || 0), source: r.source || "Tokopedia", seller: r.seller || "", sold: r.sold || "", url: r.url || "" }))); waves.push({ name: "Broad", status: "ok", count: (p.results || []).length }); } catch {} } catch (e) { waves.push({ name: "Broad", status: "fail", count: 0, reason: e.message }); }
    }
    return { allResults, waves, source: "claude" };
  };

  // ══════════ SHARED: run Indo + build margin ══════════
  const runFullIndoSearch = async (productData, bahasaQueries) => {
    const { allResults: raw, waves, source } = indoMode === "apify" ? await runIndoApify(bahasaQueries[0], bahasaQueries) : await runIndoClaude(productData, bahasaQueries);
    const seen = new Map();
    let allResults = raw.filter(r => { if (!r.name || r.price_idr < 1000) return false; const k = r.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40) + "|" + r.price_idr; if (seen.has(k)) return false; seen.set(k, true); return true; });
    if (allResults.length === 0) throw new Error("No Indonesian listings found.");
    if (allResults.length >= 5) { const sorted = [...allResults].sort((a, b) => a.price_idr - b.price_idr); if (sorted[sorted.length - 1].price_idr / sorted[0].price_idr > 10) { const tc = Math.max(1, Math.floor(allResults.length * 0.1)); const trimmed = sorted.slice(tc, sorted.length - tc); if (trimmed.length >= 3) allResults = trimmed; } }
    const prices = allResults.map(r => r.price_idr).sort((a, b) => a - b);
    const indo = { results: allResults, price_stats: { lowest_idr: prices[0], highest_idr: prices[prices.length - 1], median_idr: prices[Math.floor(prices.length / 2)], average_idr: Math.round(prices.reduce((s, x) => s + x, 0) / prices.length), num_results: prices.length }, wave_status: waves, source };
    indo.confidence = computeConfidence(indo.results, indo.price_stats);
    const wc = productData.weight_class || "medium"; const med = indo.price_stats.median_idr, low = indo.price_stats.lowest_idr, high = indo.price_stats.highest_idr;
    const margins = { median: calcMargin(productData.price_aed, productData.pack_quantity || 1, med, wc), best: calcMargin(productData.price_aed, productData.pack_quantity || 1, low, wc), worst: calcMargin(productData.price_aed, productData.pack_quantity || 1, high, wc) };
    const status = margins.median.margin >= MARGIN_THRESHOLD.candidate ? "Candidate" : margins.median.margin >= MARGIN_THRESHOLD.borderline ? "Investigated" : "Rejected";
    return { indo, margins, status, medianPriceIDR: med, lowestPriceIDR: low, highestPriceIDR: high, weightClass: wc };
  };

  // ══════════ VALIDATE (shared by Discover + Brainstorm) ══════════
  const validateProduct = async (product, setValidIdx, setResults) => {
    if (!authToken) return;
    if (!checkQuota("margin")) return;
    const pk = product.asin || product.url || `${product.name}_${product.price_aed}`;
    setValidIdx(pk);
    try {
      setStage("Translating...");
      const fmt = await callClaude('Translate for Indonesian marketplace. JSON only:\n{"clean_name_id":"Bahasa Indonesia","category":"electronics/kitchen/beauty/fashion/home/toys/sports/baby/office/other","weight_class":"light/medium/heavy","search_queries_id":["q1","q2","q3"]}\nProduct: "' + product.name + '" AED ' + product.price_aed + '\nJSON only:', "claude-sonnet-4-20250514", false, 1, 1024);
      const parsed = parseJSON(fmt);
      const productData = { ...product, clean_name_id: parsed.clean_name_id || product.name, clean_name_en: product.name, category: parsed.category || guessCategory(product.name), weight_class: parsed.weight_class || "medium", pack_quantity: 1 };
      const queries = parsed.search_queries_id || [parsed.clean_name_id || product.name];
      const result = await runFullIndoSearch(productData, queries);
      const mData = { uaeProduct: productData, normalized: productData, indoResults: result.indo, margins: result.margins, confidence: result.indo.confidence, medianPriceIDR: result.medianPriceIDR, lowestPriceIDR: result.lowestPriceIDR, highestPriceIDR: result.highestPriceIDR, weightClass: result.weightClass, timestamp: new Date().toISOString(), source: result.indo.source, status: result.status };
      const newHistory = [mData, ...historyRef.current].slice(0, MAX_HISTORY);
      setHistory(newHistory); await saveHistoryNow(newHistory);
      setResults(prev => ({ ...prev, [pk]: { margin: result.margins.median.margin, status: result.status, confidence: result.indo.confidence } }));
      await incrementUsage("margins_used");
    } catch (e) { setResults(prev => ({ ...prev, [pk]: { margin: null, status: "Error", error: e.message } })); }
    setValidIdx(null); setStage("");
  };

  // ══════════ DISCOVER: ScrapingDog Amazon Search ══════════
  const searchAmazonSD = async (keyword) => {
    if (!keyword.trim()) return;
    if (!checkQuota("lookup")) return;
    setDiscSearchingAmazon(true); setDiscError(""); setDiscSelectedIdx(-1);
    addDiag("info", "disc_amazon", `Searching Amazon.ae: "${keyword}" (3 pages)`);
    try {
      let allItems = [];
      const seenAsins = new Set();
      // Fetch up to 3 pages for broader results
      for (let page = 1; page <= 3; page++) {
        setStage(`Searching page ${page}/3...`);
        try {
          const r2 = await workerCall("scrapingdog_search", { query: keyword.trim(), domain: "ae", page });
          const r = { ok: true, json: async () => r2 }; // wrap for compat
          const data = r2;
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
          // Deduplicate by ASIN
          for (const item of items) {
            const key = item.asin || (item.name + "_" + item.price_aed);
            if (!seenAsins.has(key)) { seenAsins.add(key); allItems.push(item); }
          }
          addDiag("info", "disc_amazon", `Page ${page}: ${items.length} raw → ${allItems.length} total so far`);
          if (items.length < 5) break; // No more pages
          if (page < 3) await wait(800); // Brief pause between pages
        } catch (e) { addDiag("warn", "disc_amazon", `Page ${page}: ${e.message}`); break; }
      }
      const totalRaw = allItems.length;
      // Filter: MUST have reviews (prioritize proven sellers, not dead listings)
      const withReviews = allItems.filter(p => p.reviews > 0);
      addDiag("info", "disc_amazon", `${totalRaw} total → ${withReviews.length} with reviews (filtered ${totalRaw - withReviews.length} zero-review)`);
      // Sort by reviews descending (most popular/best-selling first)
      const sorted = withReviews.sort((a, b) => b.reviews - a.reviews);
      addDiag(sorted.length > 0 ? "ok" : "warn", "disc_amazon", `${sorted.length} products final (sorted by reviews)`);

      // Save to discover history
      const entry = { keyword: keyword.trim(), timestamp: new Date().toISOString(), results: sorted, totalRaw, filtered: totalRaw - sorted.length };
      const newHistory = [entry, ...discHistory].slice(0, 100);
      setDiscHistory(newHistory);
      setDiscAmazonResults(sorted);
      setDiscSelectedIdx(0);
      await incrementUsage("lookups_used");
    } catch (e) { addDiag("error", "disc_amazon", e.message); setDiscError(e.message); }
    setDiscSearchingAmazon(false); setStage("");
  };

  // ── Discover CSV export ──
  const exportDiscoverCSV = (results, keyword) => {
    if (!results?.length) return;
    const h = ["Name","AED","Rating","Reviews","ASIN","Brand","Source","URL"];
    const rows = results.map(p => [
      '"' + (p.name || "").replace(/"/g, '""') + '"',
      p.price_aed || 0,
      p.rating || 0,
      p.reviews || 0,
      p.asin || "",
      '"' + (p.brand || "") + '"',
      p.source || "",
      p.url || ""
    ].join(","));
    const blob = new Blob([[h.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gt-discover-" + (keyword || "search").replace(/[^a-z0-9]/gi, "-").slice(0, 40) + "-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
  };
  const deleteDiscHistory = (idx) => { const nh = discHistory.filter((_, i) => i !== idx); setDiscHistory(nh); if (discSelectedIdx === idx) { setDiscAmazonResults([]); setDiscSelectedIdx(-1); } else if (discSelectedIdx > idx) { setDiscSelectedIdx(discSelectedIdx - 1); } };


  // ══════════ BRAINSTORM: Amazon Pipeline ══════════
  const bsExtractSubcats = async () => {
    if (!authToken) { setBsError("Login required."); return; }
    setBsStep(1); setBsError(""); setBsSubcats([]);
    addDiag("info", "bs_subcats", `Extracting sub-categories for ${bsDept}`);
    try {
      setStage("Scraping main page...");
      const pageUrl = "https://www.amazon.ae/gp/bestsellers/" + bsDept;
      const sdRes = await workerCall("scrapingdog_scrape", { url: pageUrl, dynamic: true, premium: true });
      const html = sdRes.html || "";
      addDiag("info", "bs_subcats", `Got ${html.length} chars HTML`);
      if (html.length < 500) throw new Error("Page blocked or empty (" + html.length + " chars)");

      setStage("Extracting sub-categories...");
      const subcatRaw = await callClaude(
        'Extract ALL sub-category links from this Amazon.ae Best Sellers sidebar/navigation HTML. These are the child categories listed in the left sidebar.\n\nReturn ONLY JSON:\n{"subcategories":[{"name":"Sub-category Name","url":"/gp/bestsellers/kitchen/12345","slug":"12345"}]}\n\nExtract the name and full URL path. JSON only:\n\n' + html.slice(0, 40000),
        "claude-sonnet-4-20250514", false, 1, 2048
      );
      const parsed = parseJSON(subcatRaw);
      const subcats = (parsed.subcategories || []).filter(s => s.name && s.url);
      addDiag("info", "bs_subcats", `Found ${subcats.length} sub-categories`);
      if (subcats.length === 0) throw new Error("No sub-categories found. Try a different department.");

      setStage("Classifying sub-categories...");
      const classifyRaw = await callClaude(
        'Classify each Amazon sub-category. For each, decide if it likely contains generic/unbranded/artisan products sourceable from Southeast Asia.\n\nSub-categories:\n' + subcats.map((s, i) => (i + 1) + ". " + s.name).join("\n") + '\n\nReturn JSON:\n{"classified":[{"name":"...","action":"SCRAPE or SKIP","reason":"short reason"}]}\n\nSCRAPE = likely has generic/artisan/handmade/natural products.\nSKIP = likely all branded/appliance/electronics.\nJSON only:',
        "claude-sonnet-4-20250514", false, 1, 2048
      );
      const classified = parseJSON(classifyRaw);
      const merged = subcats.map((s, i) => {
        const cl = (classified.classified || [])[i] || (classified.classified || []).find(c => c.name?.toLowerCase() === s.name?.toLowerCase());
        return { ...s, action: cl?.action || "SCRAPE", reason: cl?.reason || "", enabled: (cl?.action || "SCRAPE") === "SCRAPE" };
      });
      setBsSubcats(merged);
      setBsStep(2); // Review step
      setStage("");
    } catch (e) { setBsError(e.message); setBsStep(0); setStage(""); }
  };

  const bsScrapeApproved = async () => {
    const approved = bsSubcats.filter(s => s.enabled);
    if (!approved.length) { setBsError("Enable at least one sub-category."); return; }
    bsAbortRef.current = false;
    setBsStep(3); setBsError("");
    setBsProgress({ done: 0, total: approved.length, current: "" });
    addDiag("info", "bs_scrape", `Scraping ${approved.length} sub-categories`);
    let allProducts = [];
    for (let i = 0; i < approved.length; i++) {
      if (bsAbortRef.current) { addDiag("warn", "bs_scrape", "Stopped"); break; }
      const sc = approved[i];
      setBsProgress({ done: i, total: approved.length, current: sc.name });
      try {
        setStage("Scraping " + sc.name + "...");
        const scUrl = sc.url.startsWith("http") ? sc.url : "https://www.amazon.ae" + sc.url;
        const sdRes = await workerCall("scrapingdog_scrape", { url: scUrl, dynamic: true, premium: true });
        const html = sdRes.html || "";
        if (html.length < 500) { addDiag("warn", "bs_scrape", `${sc.name}: blocked (${html.length} chars)`); continue; }
        setStage("Extracting " + sc.name + "...");
        const parsed = await callClaude('Extract ALL products from this Amazon.ae Best Sellers HTML. Return ONLY JSON:\n{"products":[{"name":"","price_aed":NUMBER,"rating":NUMBER,"reviews":NUMBER,"asin":"","url":"","brand":""}]}\nRULES: price_aed=NUMBER. reviews=INTEGER. Include brand if visible. Extract ALL.\nJSON only:\n' + html.slice(0, 60000), "claude-sonnet-4-20250514", false, 1, 4096);
        try {
          const data = parseJSON(parsed);
          const products = (data.products || []).map(p => ({
            name: p.name || p.title || "", price_aed: parseFloat(p.price_aed || p.price || 0) || 0, rating: parseFloat(p.rating || 0) || 0, reviews: parseInt(p.reviews || 0) || 0, asin: p.asin || "", url: p.url || "", brand: p.brand || "",
            department: AMAZON_AE_DEPTS.find(d => d.slug === bsDept)?.label || bsDept, subcategory: sc.name, source: "Amazon.ae",
            isBranded: isBrandBlocked(p.name || "", p.brand || "", allBrands),
            indoSignal: getIndoSignalScore(p.name || "")
          })).filter(p => p.name && p.name.length > 5 && p.price_aed > 0 && !/please wait|loading|sign.?in|robot|captcha|error|DOCTYPE/i.test(p.name));
          addDiag(products.length > 0 ? "ok" : "warn", "bs_scrape", `${sc.name}: ${products.length} products`);
          allProducts.push(...products);
          setBsAmazonProducts([...allProducts]);
        } catch (e) { addDiag("error", "bs_scrape", `${sc.name}: parse failed: ${e.message}`); }
      } catch (e) { addDiag("error", "bs_scrape", `${sc.name}: ${e.message}`); }
      await wait(1500);
    }

    // Step 5: Claude classify remaining non-blocklisted products
    const nonBranded = allProducts.filter(p => !p.isBranded);
    if (nonBranded.length > 0 && nonBranded.length <= 200) {
      setStage("Claude classifying...");
      try {
        const batch = nonBranded.map((p, i) => (i + 1) + ". " + p.name + (p.brand ? " [" + p.brand + "]" : "")).join("\n");
        const clRaw = await callClaude('Classify each product. Is it GENERIC (unbranded/artisan/sourceable from SE Asia) or BRANDED (known brand, not sourceable)?\n\n' + batch + '\n\n{"classified":[{"index":1,"type":"GENERIC or BRANDED"}]}\nJSON only:', "claude-haiku-4-5-20251001", false, 1, 4096);
        try {
          const clData = parseJSON(clRaw);
          (clData.classified || []).forEach(cl => {
            const idx = (cl.index || 0) - 1;
            if (idx >= 0 && idx < nonBranded.length && cl.type === "BRANDED") {
              const p = nonBranded[idx];
              const realIdx = allProducts.findIndex(ap => ap === p);
              if (realIdx >= 0) allProducts[realIdx].isBranded = true;
            }
          });
        } catch {}
      } catch (e) { addDiag("warn", "bs_classify", `Classification failed: ${e.message}`); }
    }

    setBsAmazonProducts(allProducts);
    setBsProgress({ done: approved.length, total: approved.length, current: "Done" });
    setBsStep(5);
    setStage("");
    const ts = new Date().toISOString();
    setBsLastScan(ts);
    await storeSet(userId + ":brainstorm:amazon", { products: allProducts, scannedAt: ts });
  };


  // ══════════ LOOKUP ══════════
  const runDryRun = async () => {
    const input = url.trim();
    if (!input || !input.startsWith("http")) { setAutoError("Invalid URL"); return; }
    if (!input.includes('amazon.ae')) { setAutoError("Only Amazon.ae URLs supported"); return; }
    if (!checkQuota("lookup")) return;
    setLoading(true); setAutoError(""); setDryRunData(null); setUaeSimilar(null); setIndoResults(null); setMarginData(null); setEditableQueries([]); setActiveSection(0); setWaveStatus([]);
    const marketplace = "Amazon.ae";
    const asinMatch = input.match(/\/dp\/([A-Z0-9]{10})/i) || input.match(/\/([A-Z0-9]{10})(?:[/?]|$)/i);
    const asin = asinMatch ? asinMatch[1] : "";
    try {
      let sdParsed = null;
      let rawInfo = "";

      // ── Part A: Try ScrapingDog → direct structured mapping ──
      if (asin) {
        setStage("ScrapingDog Product API...");
        try {
          addDiag("info", "lookup", `SD product API: domain=ae, asin=${asin}`);
          const sdData = await workerCall("scrapingdog_product", { asin, domain: "ae" });
          if (sdData && !sdData.error) {
            addDiag("ok", "lookup", `SD product OK, title: ${(sdData.title || "").slice(0, 60)}`);
            let priceAed = 0;
            for (const f of [sdData.price, sdData.sale_price, sdData.mrp, sdData.buybox_price, sdData.pricing, sdData.current_price]) { if (f) { const pm = String(f).match(/[\d,.]+/); if (pm) { priceAed = parseFloat(pm[0].replace(/,/g, "")); if (priceAed) break; } } }
            if (!priceAed) addDiag("warn", "lookup", `SD price=0, keys: ${Object.keys(sdData).filter(k => /price|cost|mrp/i.test(k)).join(",") || "none"}`);
            if (sdData.title && priceAed > 0) {
              sdParsed = {
                product_name: sdData.title,
                price_aed: priceAed,
                brand: sdData.product_information?.Brand || sdData.product_information?.Manufacturer || "",
                rating: parseFloat(sdData.average_rating) || 0,
                reviews: parseInt(sdData.total_ratings) || 0,
                pack_quantity: 1,
                source: marketplace,
                asin: asin
              };
              addDiag("ok", "lookup", `SD direct parse: "${sdParsed.product_name.slice(0, 50)}" AED ${sdParsed.price_aed}`);
            } else {
              // SD returned but missing critical fields, fall back to text path
              rawInfo = "Title: " + (sdData.title || "") + "\nPrice: AED " + priceAed + "\nBrand: " + (sdData.product_information?.Brand || sdData.product_information?.Manufacturer || "") + "\nRating: " + (sdData.average_rating || "") + "\nReviews: " + (sdData.total_ratings || "") + "\nASIN: " + asin;
              addDiag("warn", "lookup", "SD data incomplete, using text fallback");
            }
          } else {
            addDiag("warn", "lookup", `SD product returned error or empty, falling back to Claude`);
          }
        } catch (e) { addDiag("warn", "lookup", `SD product error: ${e.message}`); }
      }

      let data = null;

      if (sdParsed) {
        // ── Part B: SD succeeded → only call Haiku for translation + classification ──
        setStage("Translating...");
        addDiag("info", "lookup", "SD path: Haiku translate only");
        const transPrompt = 'Translate this product name to Bahasa Indonesia for marketplace search. Also classify it.\nProduct: "' + sdParsed.product_name + '"\nBrand: "' + sdParsed.brand + '"\nReturn ONLY valid JSON (no text before/after):\n{"clean_name_en":"short English name","clean_name_id":"Bahasa Indonesia translation","category":"electronics/kitchen/beauty/fashion/home/toys/sports/baby/office/other","weight_class":"light/medium/heavy","search_queries_id":["q1","q2","q3"],"search_queries_en":["q1"]}\nJSON only:';
        const transModels = ["claude-haiku-4-5-20251001", "claude-sonnet-4-20250514"];
        for (let attempt = 0; attempt < transModels.length && !data; attempt++) {
          const mdl = transModels[attempt];
          if (attempt > 0) { addDiag("info", "lookup", "Haiku translate failed, trying Sonnet"); setStage("Retrying translate..."); }
          try {
            const translated = await runWithProgress(() => callClaude(transPrompt, mdl, false, 1, 1024), 3);
            addDiag("info", "lookup", `Translate attempt ${attempt + 1} (${mdl.includes("haiku") ? "Haiku" : "Sonnet"}), len=${translated.length}`, translated.slice(0, 400));
            const trans = parseJSON(translated);
            data = { ...sdParsed, ...trans, product_name: sdParsed.product_name, price_aed: sdParsed.price_aed, brand: sdParsed.brand, rating: sdParsed.rating, reviews: sdParsed.reviews, pack_quantity: sdParsed.pack_quantity };
          } catch (e) {
            addDiag("warn", "lookup", `Translate attempt ${attempt + 1} failed: ${e.message}`);
            if (attempt < transModels.length - 1) await wait(1500);
          }
        }
        // If translation completely fails, still use SD data with basic defaults
        if (!data) {
          addDiag("warn", "lookup", "All translate attempts failed, using SD data with defaults");
          const fallbackId = sdParsed.product_name;
          data = { ...sdParsed, clean_name_en: sdParsed.product_name, clean_name_id: fallbackId, category: guessCategory(sdParsed.product_name), weight_class: "medium", search_queries_id: [fallbackId], search_queries_en: [sdParsed.product_name] };
        }
      } else {
        // ── Legacy path: No SD data → full Claude format (existing flow) ──
        if (!rawInfo) { setStage("Reading product..."); rawInfo = await runWithProgress(() => callClaude("Find product details for " + marketplace + " listing.\nURL: " + input + (asin ? "\nASIN: " + asin : "") + "\nI need: name, price AED, brand, rating, reviews, pack size.", "claude-sonnet-4-20250514", true, 2, 4096), 12); }
        addDiag("info", "lookup", `rawInfo length: ${rawInfo.length}`, rawInfo.slice(0, 200));
        setStage("Formatting...");
        const fmtPrompt = "Convert:\n" + rawInfo + "\nURL: " + input + "\nMarketplace: " + marketplace + '\n\nReturn ONLY valid JSON (no text before/after):\n{"product_name":"","price_aed":NUMBER,"pack_quantity":NUMBER,"brand":"","rating":NUMBER,"reviews":NUMBER,"source":"' + marketplace + '","clean_name_en":"","clean_name_id":"Bahasa Indonesia translation","category":"electronics/kitchen/beauty/fashion/home/toys/sports/baby/office/other","weight_class":"light/medium/heavy","search_queries_id":["q1","q2","q3"],"search_queries_en":["q1"]}\nJSON only:';
        const fmtModels = ["claude-sonnet-4-20250514", "claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"];
        for (let attempt = 0; attempt < fmtModels.length && !data; attempt++) {
          const mdl = fmtModels[attempt];
          if (attempt === 2) { setStage("Fallback format (Haiku)..."); addDiag("info", "lookup", "Sonnet failed twice, falling back to Haiku"); }
          const formatted = await runWithProgress(() => callClaude(fmtPrompt, mdl, false, 1, 2048), 6);
          addDiag("info", "lookup", `Format attempt ${attempt + 1} (${mdl.includes("haiku") ? "Haiku" : "Sonnet"}), len=${formatted.length}`, formatted.slice(0, 400));
          try { data = parseJSON(formatted); } catch (e) {
            addDiag("warn", "lookup", `Parse attempt ${attempt + 1} failed: ${e.message}`);
            if (attempt < fmtModels.length - 1) { await wait(2000); setStage(attempt === 0 ? "Retrying format..." : "Retrying format (last)..."); }
          }
        }
        if (!data) throw new Error("Format failed — check DIAG log for details.");
      }
      if (!data.product_name) throw new Error("Product not found.");
      if (!data.price_aed) { const pm = rawInfo.match(/AED\s*(\d+(?:[.,]\d+)?)/i); if (pm) data.price_aed = parseFloat(pm[1].replace(/,/g, "")); }
      data.source = data.source || marketplace; data.url = input;
      setDryRunData(data);
      setEditableQueries([...(data.search_queries_id || [data.clean_name_id]), ...(data.search_queries_en || [])].filter(Boolean));
      setLookupView("scrape");
      setStage("");
    } catch (err) { setAutoError(err.message); setStage(""); if (err.message.includes("429")) setCooldown(30); }
    setLoading(false);
  };

  const buildMarginData = (dryRun, raw, existingResults, waves) => {
    // Merge with any existing results
    const prevResults = existingResults?.results || [];
    const allRaw = [...prevResults, ...raw];
    const seen = new Map();
    let allResults = allRaw.filter(r => { if (!r.name || r.price_idr < 1000) return false; const k = r.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40) + "|" + r.price_idr; if (seen.has(k)) return false; seen.set(k, true); return true; });
    if (allResults.length === 0) throw new Error("No Indonesian listings found.");
    if (allResults.length >= 5) { const sorted = [...allResults].sort((a, b) => a.price_idr - b.price_idr); if (sorted[sorted.length - 1].price_idr / sorted[0].price_idr > 10) { const tc = Math.max(1, Math.floor(allResults.length * 0.1)); const trimmed = sorted.slice(tc, sorted.length - tc); if (trimmed.length >= 3) allResults = trimmed; } }
    const prices = allResults.map(r => r.price_idr).sort((a, b) => a - b);
    const allWaves = [...(existingResults?.wave_status || []), ...waves];
    const indo = { results: allResults, price_stats: { lowest_idr: prices[0], highest_idr: prices[prices.length - 1], median_idr: prices[Math.floor(prices.length / 2)], average_idr: Math.round(prices.reduce((s, x) => s + x, 0) / prices.length), num_results: prices.length }, wave_status: allWaves, source: "apify" };
    indo.confidence = computeConfidence(indo.results, indo.price_stats);
    const wc = dryRun.weight_class || "medium"; const med = indo.price_stats.median_idr, low = indo.price_stats.lowest_idr, high = indo.price_stats.highest_idr;
    const margins = { median: calcMargin(dryRun.price_aed, dryRun.pack_quantity || 1, med, wc), best: calcMargin(dryRun.price_aed, dryRun.pack_quantity || 1, low, wc), worst: calcMargin(dryRun.price_aed, dryRun.pack_quantity || 1, high, wc) };
    const status = margins.median.margin >= MARGIN_THRESHOLD.candidate ? "Candidate" : margins.median.margin >= MARGIN_THRESHOLD.borderline ? "Investigated" : "Rejected";
    return { indo, margins, status, medianPriceIDR: med, lowestPriceIDR: low, highestPriceIDR: high, weightClass: wc };
  };

  const runLookupToko = async () => {
    if (!dryRunData || !authToken) return;
    if (!checkQuota("lookup")) return;
    setLoading(true); setAutoError("");
    const queries = editableQueries.filter(q => q.trim());
    if (!queries.length) { setAutoError("Add at least one query."); setLoading(false); return; }
    try {
      const { allResults, waves } = await runTokoApify(queries);
      if (allResults.length === 0) { setAutoError("Tokopedia returned 0 results. Try different queries."); setLoading(false); setStage(""); return; }
      const result = buildMarginData(dryRunData, allResults, indoResults, waves);
      setIndoResults(result.indo); setWaveStatus(result.indo.wave_status || []);
      const mData = { uaeProduct: dryRunData, normalized: dryRunData, indoResults: result.indo, margins: result.margins, confidence: result.indo.confidence, medianPriceIDR: result.medianPriceIDR, lowestPriceIDR: result.lowestPriceIDR, highestPriceIDR: result.highestPriceIDR, weightClass: result.weightClass, timestamp: new Date().toISOString(), source: "apify", status: result.status };
      setMarginData(mData);
      const nh = [mData, ...historyRef.current].slice(0, MAX_HISTORY);
      setHistory(nh); await saveHistoryNow(nh);
      setLookupView("results");
      await incrementUsage("lookups_used");
    } catch (err) { setAutoError(err.message); if (err.message.includes("429")) setCooldown(30); }
    setLoading(false); setStage("");
  };

  const runLookupShopee = async () => {
    if (!dryRunData || !authToken) return;
    if (!checkQuota("lookup")) return;
    setLoading(true); setAutoError("");
    const queries = editableQueries.filter(q => q.trim());
    if (!queries.length) { setAutoError("Add at least one query."); setLoading(false); return; }
    try {
      const { allResults, waves } = await runShopeeApify(queries);
      if (allResults.length === 0) { setAutoError("Shopee returned 0 results. Check if actor is rented."); setLoading(false); setStage(""); return; }
      const result = buildMarginData(dryRunData, allResults, indoResults, waves);
      setIndoResults(result.indo); setWaveStatus(result.indo.wave_status || []);
      const mData = { uaeProduct: dryRunData, normalized: dryRunData, indoResults: result.indo, margins: result.margins, confidence: result.indo.confidence, medianPriceIDR: result.medianPriceIDR, lowestPriceIDR: result.lowestPriceIDR, highestPriceIDR: result.highestPriceIDR, weightClass: result.weightClass, timestamp: new Date().toISOString(), source: "apify", status: result.status };
      setMarginData(mData);
      const nh = [mData, ...historyRef.current].slice(0, MAX_HISTORY);
      setHistory(nh); await saveHistoryNow(nh);
      setLookupView("results");
      await incrementUsage("lookups_used");
    } catch (err) { setAutoError(err.message); if (err.message.includes("429")) setCooldown(30); }
    setLoading(false); setStage("");
  };

  const runLookupIndoSearch = async () => {
    if (!dryRunData) return;
    if (!checkQuota("lookup")) return;
    if (indoMode === "apify") { await runLookupToko(); return; }
    setLoading(true); setAutoError(""); setIndoResults(null); setMarginData(null); setWaveStatus([]);
    const queries = editableQueries.filter(q => q.trim());
    if (!queries.length) { setAutoError("Add at least one query."); setLoading(false); return; }
    try {
      const result = await runFullIndoSearch(dryRunData, queries);
      setIndoResults(result.indo); setWaveStatus(result.indo.wave_status || []);
      const mData = { uaeProduct: dryRunData, normalized: dryRunData, indoResults: result.indo, margins: result.margins, confidence: result.indo.confidence, medianPriceIDR: result.medianPriceIDR, lowestPriceIDR: result.lowestPriceIDR, highestPriceIDR: result.highestPriceIDR, weightClass: result.weightClass, timestamp: new Date().toISOString(), source: result.indo.source, status: result.status };
      setMarginData(mData);
      const nh = [mData, ...historyRef.current].slice(0, MAX_HISTORY);
      setHistory(nh); await saveHistoryNow(nh);
      setLookupView("results");
      await incrementUsage("lookups_used");
    } catch (err) { setAutoError(err.message); if (err.message.includes("429")) setCooldown(30); }
    setLoading(false); setStage("");
  };

  const updateHistoryStatus = (i, s) => setHistory(prev => prev.map((x, idx) => idx === i ? { ...x, status: s } : x));
  const resetLookup = () => { setDryRunData(null); setUaeSimilar(null); setIndoResults(null); setMarginData(null); setAutoError(""); setUrl(""); setEditableQueries([]); setActiveSection(0); setWaveStatus([]); setLookupView("landing"); };

  const restoreFromHistory = (entry) => {
    const product = entry.uaeProduct || {};
    setDryRunData(product);
    setUrl(product.url || "");
    setEditableQueries([...(product.search_queries_id || [product.clean_name_id || entry.normalized?.clean_name_id]), ...(product.search_queries_en || [])].filter(Boolean));
    setIndoResults(entry.indoResults || null);
    setMarginData(entry.indoResults ? entry : null);
    setWaveStatus(entry.indoResults?.wave_status || []);
    setAutoError("");
    setLookupView(entry.indoResults ? "results" : "scrape");
  };

  // ══════════ EXPORTS ══════════
  const exportBackup = () => { const b = new Blob([JSON.stringify({ userId, exportedAt: new Date().toISOString(), history: history.map(compressEntry) }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "gt-backup-" + new Date().toISOString().slice(0, 10) + ".json"; a.click(); };
  const importBackup = (file) => { const r = new FileReader(); r.onload = async (e) => { try { const b = JSON.parse(e.target.result); if (!b.history?.length) throw new Error("Invalid"); const exp = b.history.map(expandEntry); setHistory(exp); await saveHistory(userId, exp); alert("Restored " + exp.length + " lookups"); } catch (err) { alert("Import failed: " + err.message); } }; r.readAsText(file); };
  const backupFileRef = useRef(null);

  const exportPDF = () => {
    if (!marginData) return;
    const m = marginData.margins.median; const q = getQty(); const conf = marginData.confidence;
    const confLine = conf ? '<div style="padding:8px;background:' + (conf.level === "high" ? "#e8f5ec" : conf.level === "medium" ? "#fdf8ed" : "#fef2f2") + ';border-radius:4px;margin-top:12px;text-align:center;font-size:12px"><strong>Confidence:</strong> ' + conf.score + '/100 (' + conf.level.toUpperCase() + ')' + (conf.flags?.length ? ' — ' + conf.flags.join(', ') : '') + '</div>' : '';
    const html = '<!DOCTYPE html><html><head><title>GT Cross-Trade Analysis</title><style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#1a1a1a}h1{font-size:20px;border-bottom:2px solid #1a7a3a;padding-bottom:8px}h2{font-size:14px;color:#8B6914;margin-top:24px}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{padding:8px 12px;border:1px solid #ddd;text-align:left;font-size:12px}th{background:#f5f2eb;font-weight:700}.green{color:#1a7a3a}.red{color:#dc2626}.big{font-size:28px;font-weight:700;text-align:center;padding:16px}.verdict{padding:12px;text-align:center;border-radius:4px;font-weight:700;margin-top:16px}@media print{body{padding:20px}}</style></head><body>' +
      '<h1>GT Cross-Trade Analysis</h1><p><strong>Date:</strong> ' + new Date().toLocaleDateString() + ' | <strong>FX:</strong> 1 AED = ' + Math.round(fx.AED_TO_IDR) + ' IDR</p>' +
      '<h2>Product</h2><table><tr><th>Name</th><td>' + escapeHtml(marginData.uaeProduct?.product_name) + '</td></tr><tr><th>Bahasa</th><td>' + escapeHtml(marginData.normalized?.clean_name_id) + '</td></tr><tr><th>Source</th><td>' + (marginData.uaeProduct?.source || "") + ' | AED ' + (marginData.uaeProduct?.price_aed || 0) + (marginData.uaeProduct?.pack_quantity > 1 ? ' (' + marginData.uaeProduct.pack_quantity + '-pack)' : '') + '</td></tr></table>' +
      '<h2>Indonesia Market (Median of ' + (marginData.indoResults?.price_stats?.num_results || 0) + ' listings)</h2><table><tr><th></th><th>Lowest</th><th>Median</th><th>Highest</th></tr><tr><th>IDR</th><td>' + fmtIDR(marginData.lowestPriceIDR) + '</td><td>' + fmtIDR(marginData.medianPriceIDR) + '</td><td>' + fmtIDR(marginData.highestPriceIDR) + '</td></tr></table>' + confLine +
      '<h2>Margin (\u00d7' + q + ')</h2><table><tr><th>Item</th><th>USD</th><th>AED</th><th>IDR</th></tr>' +
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
  const exportQuickCSV = () => { if (!history.length) return; const h = ["Date","Product","AED","Bahasa","Category","Indo Median IDR","Margin %","Status"]; const r = history.map(x => [x.timestamp?.slice(0,10)||"",'"'+(x.uaeProduct?.product_name||"")+'"',x.uaeProduct?.price_aed||0,'"'+(x.normalized?.clean_name_id||"")+'"',x.normalized?.category||"",x.medianPriceIDR||0,(x.margins?.median?.margin||0).toFixed(1),x.status||""].join(",")); const b = new Blob([[h.join(","),...r].join("\n")], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "gt-quick-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); };
  const exportStructuredCSV = () => { if (!history.length) return; const headers = ["Date","Product EN","Product ID","Brand","Category","Weight","Source","Pack","AED","USD","Indo Med IDR","Indo Low IDR","Indo Hi IDR","Freight USD","Customs USD","Last Mile USD","Total Cost USD","Margin Best%","Margin Med%","Margin Worst%","Conf Score","Status"]; const rows = history.map(h => { const m = h.margins?.median || {}; return [h.timestamp?.slice(0,10)||"",'"'+(h.uaeProduct?.product_name||"").replace(/"/g,'""')+'"','"'+(h.normalized?.clean_name_id||"").replace(/"/g,'""')+'"','"'+(h.uaeProduct?.brand||"")+'"',h.normalized?.category||"",h.weightClass||"",h.uaeProduct?.source||"",h.uaeProduct?.pack_quantity||1,h.uaeProduct?.price_aed||0,(m.uaeUSD||0).toFixed(2),h.medianPriceIDR||0,h.lowestPriceIDR||0,h.highestPriceIDR||0,(m.freightUSD||0).toFixed(2),(m.dutyUSD||0).toFixed(2),(m.lastMileUSD||0).toFixed(2),(m.totalUSD||0).toFixed(2),(h.margins?.best?.margin||0).toFixed(1),(h.margins?.median?.margin||0).toFixed(1),(h.margins?.worst?.margin||0).toFixed(1),h.confidence?.score||0,h.status||""].join(","); }); const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gt-analysis-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); };
  const exportBrainstormCSV = (products, label) => { if (!products.length) return; const h = ["Name","AED","Rating","Reviews","Brand","Department","Sub-cat","Source","Branded","Indo Signal","Signal Words"]; const rows = products.map(p => ['"'+(p.name||"").replace(/"/g,'""')+'"',p.price_aed||0,p.rating||0,p.reviews||0,'"'+(p.brand||"")+'"','"'+(p.department||"")+'"','"'+(p.subcategory||"")+'"',p.source||"",p.isBranded?"Y":"N",p.indoSignal?.score||0,'"'+(p.indoSignal?.matched||[]).join("; ")+'"'].join(",")); const blob = new Blob([[h.join(","),...rows].join("\n")], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gt-brainstorm-" + label + "-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); };

  // ══════════ STYLES ══════════
  const inputStyle = { width: "100%", padding: "10px 12px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "13px", borderRadius: "3px", outline: "none" };
  const btnStyle = { padding: "10px 24px", background: c.gold, color: c.btnText, border: "none", cursor: "pointer", fontFamily: "'Inconsolata',monospace", fontSize: "12px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", borderRadius: "3px" };
  const btnSec = { ...btnStyle, background: "transparent", color: c.gold, border: "1px solid " + c.gold };
  const btnGreen = { ...btnStyle, background: c.green, color: "#fff" };
  const secStyle = { padding: "24px", background: c.surface, border: "1px solid " + c.border2, borderTop: "none", minHeight: "420px", borderRadius: "0 0 4px 4px" };
  const candidates = history.filter(h => (h.margins?.median?.margin || 0) >= MARGIN_THRESHOLD.candidate);

  // Brainstorm filtered products
  const bsAllProducts = [...bsAmazonProducts];
  const bsFiltered = bsAllProducts.filter(p => {
    if (bsHideBranded && p.isBranded) return false;
    if (bsFilter.search && !p.name.toLowerCase().includes(bsFilter.search.toLowerCase())) return false;
    if (bsFilter.minPrice && p.price_aed < parseFloat(bsFilter.minPrice)) return false;
    if (bsFilter.maxPrice && p.price_aed > parseFloat(bsFilter.maxPrice)) return false;
    if (bsFilter.dept !== "all" && p.department !== bsFilter.dept && p.subcategory !== bsFilter.dept) return false;
    return p.price_aed > 0;
  }).sort((a, b) => {
    if (bsSort === "signal") return (b.indoSignal?.score || 0) - (a.indoSignal?.score || 0);
    if (bsSort === "price_asc") return a.price_aed - b.price_aed;
    if (bsSort === "price_desc") return b.price_aed - a.price_aed;
    if (bsSort === "reviews") return (b.reviews || 0) - (a.reviews || 0);
    return 0;
  });

  const discAllProducts = [...discAmazonResults].sort((a, b) => {
    if (discSort === "reviews") return (b.reviews || 0) - (a.reviews || 0);
    if (discSort === "price_asc") return a.price_aed - b.price_aed;
    if (discSort === "price_desc") return b.price_aed - a.price_aed;
    if (discSort === "rating") return (b.rating || 0) - (a.rating || 0);
    return 0;
  });
  const getQty = () => qtyMode === "container" ? Math.floor(24000 / (WEIGHT_KG[dryRunData?.weight_class || "medium"] || 1)) : qtyMode === "custom" ? qty : 1;
  const cookieAgeDays = shopeeCookieUpdatedAt ? Math.floor((Date.now() - shopeeCookieUpdatedAt) / 86400000) : null;
  const cookieColor = cookieAgeDays === null ? c.dimmer : cookieAgeDays <= 10 ? c.green : cookieAgeDays <= 12 ? c.darkGold : c.red;

  const SectionToggle = ({ index, title, icon, children, count }) => (<div style={{ marginBottom: "8px", border: "1px solid " + (activeSection === index ? c.gold + "44" : c.border), borderRadius: "6px", overflow: "hidden" }}><button onClick={() => setActiveSection(activeSection === index ? -1 : index)} style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "14px 16px", background: activeSection === index ? c.surface2 : c.surface, border: "none", cursor: "pointer", textAlign: "left", color: c.text, fontFamily: "'Inconsolata',monospace", fontSize: "12px" }}><span style={{ fontSize: "16px" }}>{icon}</span><span style={{ flex: 1, fontWeight: 600, color: activeSection === index ? c.gold : c.text }}>{title}</span>{count !== undefined && <span style={{ color: c.green, fontSize: "10px" }}>{count}</span>}<span style={{ color: c.dimmer }}>{activeSection === index ? "\u25be" : "\u25b8"}</span></button>{activeSection === index && <div style={{ padding: "16px", borderTop: "1px solid " + c.border }}>{children}</div>}</div>);
  const PriceRow = ({ label, usd, aed, idr }) => <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "4px 0", borderBottom: "1px solid " + c.border }}><div style={{ color: c.dim }}>{label}</div><div style={{ color: c.gold }}>{fmtUSD(usd)}</div><div>{fmtAED(aed)}</div><div>{fmtIDR(idr)}</div></div>;

  // ══════════ PRODUCT TABLE (reused in Brainstorm + Discover) ══════════
  const ProductTable = ({ products, validatingIdx, validationResults, onValidate, showSubcat, showSignal, maxRows = 200 }) => (
    <div style={{ maxHeight: "500px", overflowY: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: showSubcat ? "2fr 0.6fr 0.4fr 0.5fr" + (showSignal ? " 0.7fr" : "") + " 0.7fr" : "2.2fr 0.6fr 0.4fr 0.5fr 0.7fr", gap: "6px", padding: "6px 0", borderBottom: "1px solid " + c.border2, fontSize: "9px", color: c.dimmer, letterSpacing: "0.5px", textTransform: "uppercase", position: "sticky", top: 0, background: c.surface, zIndex: 1 }}>
        <div>Product</div><div style={{ textAlign: "right" }}>Price</div><div style={{ textAlign: "center" }}>{"\u2605"}</div><div style={{ textAlign: "right" }}>Reviews</div>{showSignal && <div style={{ textAlign: "center" }}>{"\ud83c\uddee\ud83c\udde9"} Signal</div>}<div style={{ textAlign: "center" }}>Action</div>
      </div>
      {products.slice(0, maxRows).map((p, i) => {
        const pk = p.asin || p.url || `${p.name}_${p.price_aed}`;
        const vr = validationResults[pk];
        return (
          <div key={pk + i} style={{ display: "grid", gridTemplateColumns: showSubcat ? "2fr 0.6fr 0.4fr 0.5fr" + (showSignal ? " 0.7fr" : "") + " 0.7fr" : "2.2fr 0.6fr 0.4fr 0.5fr 0.7fr", gap: "6px", padding: "8px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", alignItems: "center", background: vr?.status === "Candidate" ? (dark ? "#0D2E1A22" : "#E8F5EC44") : vr?.status === "Rejected" ? (dark ? "#3a1a1a22" : "#FEF2F244") : (p.indoSignal?.score >= 4 && showSignal ? (dark ? "#0D2E1A11" : "#E8F5EC22") : "transparent") }}>
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {p.url ? <a href={p.url} target="_blank" rel="noopener" style={{ color: c.text, textDecoration: "none" }}>{p.name}</a> : p.name}
              {showSubcat && p.subcategory && <span style={{ color: c.dimmest, fontSize: "9px" }}>{" \u00b7 "}{p.subcategory}</span>}
            </div>
            <div style={{ color: c.gold, fontWeight: 700, textAlign: "right" }}>{fmtAED(p.price_aed)}</div>
            <div style={{ textAlign: "center", color: c.darkGold, fontSize: "10px" }}>{p.rating > 0 ? "\u2605" + p.rating.toFixed(1) : "\u2014"}</div>
            <div style={{ textAlign: "right", color: c.dim, fontSize: "10px" }}>{p.reviews > 0 ? p.reviews.toLocaleString() : "\u2014"}</div>
            {showSignal && <div style={{ textAlign: "center" }}>
              {p.indoSignal?.score > 0 ? <span style={{ fontSize: "9px", color: p.indoSignal.score >= 4 ? c.green : c.darkGold, fontWeight: 700 }}>{"\ud83c\uddee\ud83c\udde9 "}{p.indoSignal.score}</span> : <span style={{ color: c.dimmest, fontSize: "9px" }}>{"\u2014"}</span>}
            </div>}
            <div style={{ textAlign: "center" }}>
              {validatingIdx === pk ? <Spinner /> : vr ? (
                <span style={{ fontSize: "11px", fontWeight: 700, color: marginColor(vr.margin) }}>{vr.margin != null ? vr.margin.toFixed(0) + "%" : "ERR"}</span>
              ) : (
                <button onClick={() => onValidate(p)} style={{ padding: "3px 8px", background: c.green, color: "#fff", border: "none", borderRadius: "3px", fontSize: "9px", fontWeight: 700, fontFamily: "monospace", cursor: "pointer" }}>VALIDATE</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  // ══════════ RENDER ══════════
  return (
    <div style={{ minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "'Inconsolata',monospace", padding: "24px", transition: "background 0.3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Inconsolata:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {showCookieWizard && <CookieWizard c={c} onClose={() => setShowCookieWizard(false)} onSave={ck => { setShopeeCookie(ck); setShopeeCookieUpdatedAt(Date.now()); }} />}

      {!unlocked ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh", position: "relative" }}>
          <button onClick={toggleTheme} style={{ position: "absolute", top: 0, right: 0, background: "transparent", border: "1px solid " + c.border2, color: c.dim, fontFamily: "monospace", fontSize: "11px", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}>{dark ? "\u2600" : "\ud83c\udf19"}</button>
          <div style={{ width: "380px", padding: "40px", background: c.surface, border: "1px solid " + c.border, borderRadius: "8px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.3 }}>{"\ud83d\udd12"}</div>
            <h2 style={{ fontFamily: "'Lora',serif", fontSize: "24px", fontWeight: 500, color: c.gold, marginBottom: "4px" }}>GT Cross-Trade</h2>
            <p style={{ fontSize: "11px", color: c.dimmer, marginBottom: "24px" }}>UAE {"\u2190"} Indonesia Trade Intelligence</p>
            <div style={{ display: "flex", gap: "0", marginBottom: "20px", border: "1px solid " + c.border2, borderRadius: "4px", overflow: "hidden" }}>
              <button onClick={() => { setAuthMode("login"); setAuthError(""); }} style={{ flex: 1, padding: "8px", background: authMode === "login" ? c.gold : "transparent", color: authMode === "login" ? c.btnText : c.dim, border: "none", fontFamily: "monospace", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>LOG IN</button>
              <button onClick={() => { setAuthMode("register"); setAuthError(""); }} style={{ flex: 1, padding: "8px", background: authMode === "register" ? c.gold : "transparent", color: authMode === "register" ? c.btnText : c.dim, border: "none", fontFamily: "monospace", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>REGISTER</button>
            </div>
            {authMode === "register" && <input type="text" value={authDisplayName} onChange={e => setAuthDisplayName(e.target.value)} placeholder="Display name (optional)" style={{ width: "100%", padding: "10px 14px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "12px", borderRadius: "4px", outline: "none", marginBottom: "8px" }} />}
            <input type="email" value={authEmail} onChange={e => { setAuthEmail(e.target.value); setAuthError(""); }} placeholder="Email" autoFocus style={{ width: "100%", padding: "10px 14px", background: c.input, border: "1px solid " + (authError ? c.red : c.border2), color: c.text, fontFamily: "monospace", fontSize: "12px", borderRadius: "4px", outline: "none", marginBottom: "8px" }} />
            <input type="password" value={authPassword} onChange={e => { setAuthPassword(e.target.value); setAuthError(""); }} onKeyDown={e => e.key === "Enter" && (authMode === "login" ? handleSignIn() : handleSignUp())} placeholder="Password" style={{ width: "100%", padding: "10px 14px", background: c.input, border: "1px solid " + (authError ? c.red : c.border2), color: c.text, fontFamily: "monospace", fontSize: "12px", borderRadius: "4px", outline: "none", marginBottom: "12px" }} />
            {authError && <div style={{ fontSize: "11px", color: authError.includes("confirm") || authError.includes("Check") ? c.green : c.red, marginBottom: "12px", lineHeight: 1.5 }}>{authError}</div>}
            <button onClick={authMode === "login" ? handleSignIn : handleSignUp} disabled={authLoading} style={{ width: "100%", padding: "12px", background: authLoading ? c.dimmest : c.gold, color: c.btnText, border: "none", borderRadius: "4px", fontFamily: "monospace", fontWeight: 700, letterSpacing: "1px", cursor: authLoading ? "default" : "pointer", opacity: authLoading ? 0.6 : 1 }}>{authLoading ? "..." : authMode === "login" ? "LOG IN" : "CREATE ACCOUNT"}</button>
            {authMode === "login" && <button onClick={handleForgotPassword} disabled={authLoading} style={{ width: "100%", marginTop: "8px", padding: "8px", background: "transparent", color: c.dim, border: "none", fontFamily: "monospace", fontSize: "10px", cursor: "pointer", textDecoration: "underline" }}>Forgot password?</button>}
          </div>
        </div>
      ) : !storageReady ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: "16px" }}><Spinner /><div style={{ fontSize: "12px", color: c.dim }}>Loading...</div></div>
      ) : (<>

      {/* ══════════ HEADER ══════════ */}
      <div style={{ marginBottom: "16px", borderBottom: "1px solid " + c.border, paddingBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ fontFamily: "'Lora',serif", fontSize: "28px", fontWeight: 500, color: c.gold, margin: 0 }}>GT Cross-Trade <span style={{ fontSize: "12px", color: c.dimmer, fontFamily: "monospace" }}>v5.1</span></h1>
            <div style={{ fontSize: "10px", color: c.dimmer, marginTop: "4px", letterSpacing: "2px", textTransform: "uppercase" }}>UAE {"\u2190"} Indonesia {"\u00b7"} {authUser?.email?.split("@")[0]} {isAdmin && <span style={{ color: c.red }}>{"\u00b7 ADMIN"}</span>} {"\u00b7"} {userProfile ? (TIER_LIMITS[userProfile.role]?.label || userProfile.role) : ""}{isAdmin && <>{" \u00b7 "}{fxUpdated ? "FX " + fxUpdated.toLocaleDateString() : "FX: defaults"}{" \u00b7 "}<span style={{ color: supabaseReady ? c.green : c.darkGold }}>{supabaseReady ? "\u25cf DB" : "\u25cb local"}</span></>}</div>
          </div>
          <div style={{ display: "flex", gap: "12px", fontSize: "11px", alignItems: "flex-end" }}>
            <div style={{ textAlign: "right" }}><div style={{ color: c.dimmer }}>LOOKUPS</div><div style={{ color: c.gold, fontSize: "16px", fontWeight: 700 }}>{history.length}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ color: c.dimmer }}>CANDIDATES</div><div style={{ color: c.green, fontSize: "16px", fontWeight: 700 }}>{candidates.length}</div></div>
            {userProfile && !isAdmin && <div style={{ textAlign: "right" }}><div style={{ color: c.dimmer }}>QUOTA</div><div style={{ color: c.gold, fontSize: "11px", fontWeight: 600 }}>{userProfile.lookups_used}/{TIER_LIMITS[userProfile.role]?.lookups || "?"}</div></div>}
            <button onClick={toggleTheme} style={{ background: c.surface2, border: "1px solid " + c.border2, color: c.dim, fontFamily: "monospace", fontSize: "10px", padding: "6px 10px", borderRadius: "4px", cursor: "pointer" }}>{dark ? "\u2600" : "\ud83c\udf19"}</button>
            {isAdmin && <button onClick={() => setShowDiag(!showDiag)} style={{ background: showDiag ? c.gold : c.surface2, border: "1px solid " + (showDiag ? c.gold : c.border2), color: showDiag ? c.btnText : c.dim, fontFamily: "monospace", fontSize: "10px", padding: "6px 10px", borderRadius: "4px", cursor: "pointer" }}>DIAG</button>}
            <button onClick={handleSignOut} style={{ background: "transparent", border: "1px solid " + c.red + "44", color: c.red, fontFamily: "monospace", fontSize: "9px", padding: "6px 10px", borderRadius: "4px", cursor: "pointer" }}>LOGOUT</button>
          </div>
        </div>
      </div>

      {/* ══════════ QUOTA WARNING ══════════ */}
      {quotaError && <div style={{ marginBottom: "12px", padding: "14px 16px", background: dark ? "#2A1A10" : "#FEF3E2", border: "1px solid " + c.darkGold + "66", borderRadius: "6px", display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ fontSize: "20px" }}>{"\ud83d\udeab"}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "12px", color: c.text, fontWeight: 600, marginBottom: "2px" }}>Monthly Limit Reached</div>
          <div style={{ fontSize: "11px", color: c.dim }}>{quotaError}</div>
        </div>
        <button onClick={() => setQuotaError("")} style={{ background: "transparent", border: "none", color: c.dimmest, fontSize: "14px", cursor: "pointer" }}>{"\u2715"}</button>
      </div>}

      {/* ══════════ CONFIG (admin only) ══════════ */}
      {isAdmin && <div style={{ marginBottom: "12px", padding: "10px 12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px" }}>
        {[
          { label: "CLAUDE", val: apiKey, set: setApiKey, show: showKey, toggle: () => setShowKey(!showKey), status: apiKeyStatus, ph: "sk-ant-..." },
          { label: "APIFY", val: apifyKey, set: setApifyKey, show: showApifyKey, toggle: () => setShowApifyKey(!showApifyKey), status: apifyStatus, ph: "apify_api_..." },
          { label: "SD", val: scrapingDogKey, set: setScrapingDogKey, show: showSDKey, toggle: () => setShowSDKey(!showSDKey), status: sdStatus, ph: "ScrapingDog key..." },
        ].map(k => (
          <div key={k.label} style={{ display: "flex", gap: "6px", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "9px", color: c.dim, letterSpacing: "1px", width: "50px" }}>{k.label}</span>
            <input type={k.show ? "text" : "password"} value={k.val} onChange={e => k.set(e.target.value)} placeholder={k.ph} style={{ ...inputStyle, flex: 1, padding: "4px 8px", fontSize: "11px" }} />
            <button onClick={k.toggle} style={{ ...btnSec, padding: "4px 8px", fontSize: "9px" }}>{k.show ? "HIDE" : "SHOW"}</button>
            {k.status && <span style={{ fontSize: "10px", color: k.status === "missing" ? c.red : c.green }}>{"\u2713"}</span>}
          </div>
        ))}
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "9px", color: c.dim, letterSpacing: "1px", width: "50px" }}>INDO</span>
          {[{ id: "apify", label: "\ud83d\udd17 Apify" }, { id: "claude", label: "\ud83d\udd0d Claude" }].map(m => (
            <button key={m.id} onClick={() => setIndoMode(m.id)} style={{ padding: "3px 8px", fontSize: "9px", fontFamily: "monospace", cursor: "pointer", background: indoMode === m.id ? (m.id === "apify" ? c.green : c.gold) : "transparent", color: indoMode === m.id ? "#fff" : c.dim, border: "1px solid " + (indoMode === m.id ? (m.id === "apify" ? c.green : c.gold) : c.border2), borderRadius: "3px" }}>{m.label}</button>
          ))}
          <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "9px", background: cookieAgeDays === null ? c.surface : cookieAgeDays <= 10 ? (dark ? "#0D2E1A" : "#E8F5EC") : (dark ? "#3a1a1a" : "#FEF2F2"), color: cookieColor, border: "1px solid " + cookieColor + "44" }}>{"\ud83c\udf6a "}{cookieAgeDays === null ? "No cookie" : cookieAgeDays + "d"}</span>
          <button onClick={() => setShowCookieWizard(true)} style={{ ...btnSec, padding: "3px 8px", fontSize: "8px" }}>Update</button>
        </div>
      </div>}

      {/* ══════════ TAB BAR ══════════ */}
      <div style={{ display: "flex", gap: "2px", borderBottom: "1px solid " + c.border2 }}>
        {[
          ...(isAdmin ? [{ id: "brainstorm", label: "\ud83e\udde0 BRAINSTORM" }] : []),
          { id: "discover", label: "\ud83d\udd0d DISCOVER" },
          { id: "auto", label: "\u26a1 LOOKUP" },
          { id: "history", label: "\ud83d\udccb HISTORY" },
          ...(isAdmin ? [{ id: "admin", label: "\u2699 ADMIN" }] : [])
        ].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: "10px 16px", background: mode === m.id ? c.surface : "transparent", color: mode === m.id ? c.gold : c.dimmest, border: mode === m.id ? "1px solid " + c.border2 : "1px solid transparent", borderBottom: mode === m.id ? "1px solid " + c.surface : "1px solid " + c.border2, cursor: "pointer", fontFamily: "monospace", fontSize: "11px", position: "relative", top: "1px", borderRadius: "4px 4px 0 0" }}>
            {m.label}
            {m.id === "history" && history.length > 0 && <span style={{ marginLeft: 4, color: c.green, fontSize: 9 }}>[{history.length}]</span>}
            {m.id === "brainstorm" && bsAllProducts.length > 0 && <span style={{ marginLeft: 4, color: c.green, fontSize: 9 }}>[{bsAllProducts.length}]</span>}
          </button>
        ))}
      </div>

      {/* ══════════ BRAINSTORM TAB ══════════ */}
      {mode === "brainstorm" && isAdmin && <div style={secStyle}>

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
            <span>{"\ud83d\udeab"} Brand Blocklist ({allBrands.length} total, {customBrands.length} custom)</span>
            <span>{showBrandList ? "\u25be" : "\u25b8"}</span>
          </button>
          {showBrandList && <div style={{ padding: "12px", background: c.surface2, border: "1px solid " + c.border, borderTop: "none", borderRadius: "0 0 4px 4px" }}>
            <div style={{ display: "flex", gap: "4px", marginBottom: "8px" }}>
              <input value={newBrandInput} onChange={e => setNewBrandInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newBrandInput.trim()) { setCustomBrands([...customBrands, newBrandInput.trim()]); setNewBrandInput(""); } }} placeholder="Add brand..." style={{ ...inputStyle, flex: 1, padding: "4px 8px", fontSize: "10px" }} />
              <button onClick={() => { if (newBrandInput.trim()) { setCustomBrands([...customBrands, newBrandInput.trim()]); setNewBrandInput(""); } }} style={{ ...btnSec, padding: "4px 10px", fontSize: "9px" }}>+ ADD</button>
            </div>
            {customBrands.length > 0 && <div style={{ marginBottom: "8px" }}>
              <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "4px" }}>CUSTOM BRANDS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                {customBrands.map((b, i) => <span key={i} style={{ padding: "2px 6px", background: dark ? "#2A2210" : "#FDF8ED", border: "1px solid " + c.darkGold + "44", borderRadius: "3px", fontSize: "9px", color: c.darkGold, cursor: "pointer" }} onClick={() => setCustomBrands(customBrands.filter((_, idx) => idx !== i))}>{b} {"\u2715"}</span>)}
              </div>
            </div>}
            <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "4px" }}>HARDCODED ({BRAND_BLOCKLIST_DEFAULT.length})</div>
            <div style={{ maxHeight: "100px", overflowY: "auto", display: "flex", flexWrap: "wrap", gap: "2px" }}>
              {BRAND_BLOCKLIST_DEFAULT.slice(0, 50).map((b, i) => <span key={i} style={{ padding: "1px 5px", background: dark ? "#3a1a1a" : "#FEF2F2", border: "1px solid " + c.red + "22", borderRadius: "2px", fontSize: "8px", color: c.dimmest }}>{b}</span>)}
              {BRAND_BLOCKLIST_DEFAULT.length > 50 && <span style={{ fontSize: "8px", color: c.dimmest }}>...+{BRAND_BLOCKLIST_DEFAULT.length - 50} more</span>}
            </div>
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
      </div>}

      {/* ══════════ DISCOVER TAB ══════════ */}
      {mode === "discover" && <div style={secStyle}>

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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "10px" }}>
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
      </div>}

      {/* ══════════ LOOKUP TAB ══════════ */}
      {mode === "auto" && <div style={secStyle}>
        {loading && stage && <div style={{ marginBottom: "12px" }}><div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}><Spinner /><span style={{ fontSize: "12px", color: c.gold }}>{stage}</span></div>{progress > 0 && <div style={{ width: "100%", height: "3px", background: c.border, borderRadius: "2px" }}><div style={{ width: progress + "%", height: "100%", background: c.gold, borderRadius: "2px", transition: "width 0.3s" }} /></div>}</div>}
        {autoError && <div style={{ padding: "12px", background: dark ? "#3a1a1a" : "#FEF2F2", border: "1px solid " + c.red + "44", borderRadius: "4px", marginBottom: "12px", fontSize: "12px", color: c.red }}>{autoError}</div>}

        {/* ── LANDING VIEW ── */}
        {lookupView === "landing" && <>
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            <input type="text" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && !loading && runDryRun()} placeholder="Paste Amazon.ae product URL..." style={{ ...inputStyle, flex: 1, padding: "12px 14px" }} />
            <button onClick={runDryRun} disabled={loading || !url.trim() || cooldown > 0} style={{ ...btnStyle, padding: "12px 20px", fontSize: "11px", opacity: loading || !url.trim() ? 0.4 : 1, whiteSpace: "nowrap" }}>{cooldown > 0 ? "WAIT " + cooldown + "s" : loading ? "READING..." : "QUICK CHECK"}</button>
          </div>

          {!loading && !autoError && <div style={{ textAlign: "center", padding: "30px 20px" }}>
            <div style={{ fontSize: "36px", marginBottom: "10px", opacity: 0.15 }}>{"\u26a1"}</div>
            <div style={{ fontSize: "12px", color: c.dim }}>Paste an Amazon.ae product URL to analyze trade potential</div>
            <div style={{ fontSize: "10px", color: c.dimmer, marginTop: "6px" }}>Extracts price, translates to Bahasa, searches Indonesian marketplaces, calculates margins</div>
          </div>}

          {/* ── RECENT SEARCHES ── */}
          {(() => {
            const seen = new Set();
            const recent = history.filter(h => {
              const key = h.uaeProduct?.asin || h.uaeProduct?.url || h.uaeProduct?.product_name;
              if (!key || seen.has(key)) return false;
              seen.add(key); return true;
            }).slice(0, 8);
            if (!recent.length) return null;
            return <div style={{ marginTop: "8px" }}>
              <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>RECENT SEARCHES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {recent.map((h, i) => {
                  const m = h.margins?.median?.margin || 0;
                  const tokoCount = (h.indoResults?.results || []).filter(r => r.source === "Tokopedia").length;
                  const shopeeCount = (h.indoResults?.results || []).filter(r => r.source === "Shopee").length;
                  return <div key={i} onClick={() => restoreFromHistory(h)} style={{ padding: "10px 12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "11px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.uaeProduct?.product_name}</div>
                      <div style={{ display: "flex", gap: "6px", marginTop: "4px", fontSize: "9px", color: c.dimmer }}>
                        <span style={{ color: c.gold }}>AED {h.uaeProduct?.price_aed}</span>
                        {tokoCount > 0 && <span style={{ color: c.green }}>T:{tokoCount}</span>}
                        {shopeeCount > 0 && <span style={{ color: "#EE4D2D" }}>S:{shopeeCount}</span>}
                        <span>{h.timestamp?.slice(0, 10)}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", marginLeft: "10px" }}>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: marginColor(m) }}>{m.toFixed(1)}%</div>
                    </div>
                  </div>;
                })}
              </div>
            </div>;
          })()}
        </>}

        {/* ── SCRAPE VIEW ── */}
        {lookupView === "scrape" && dryRunData && <div>
          <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "10px" }}>
            <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>UAE PRODUCT {dryRunData.url && <a href={dryRunData.url} target="_blank" rel="noopener" style={{ color: c.dim, fontSize: "9px", marginLeft: "8px" }}>open {"\u2197"}</a>}</div>
            <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>{dryRunData.product_name}</div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", fontSize: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ color: c.dim, fontSize: "10px" }}>AED</span>
                <input type="number" value={dryRunData.price_aed || ""} onChange={e => setDryRunData({ ...dryRunData, price_aed: parseFloat(e.target.value) || 0 })} style={{ width: "80px", padding: "3px 6px", background: c.input, border: "1px solid " + (!dryRunData.price_aed ? c.red : c.border2), color: c.gold, fontFamily: "monospace", fontSize: "14px", fontWeight: 700, borderRadius: "3px", outline: "none", textAlign: "right" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ color: c.dim, fontSize: "10px" }}>PACK:</span>
                <input type="number" min="1" value={dryRunData.pack_quantity || 1} onChange={e => setDryRunData({ ...dryRunData, pack_quantity: parseInt(e.target.value) || 1 })} style={{ width: "50px", padding: "3px 6px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "12px", borderRadius: "3px", outline: "none", textAlign: "center" }} />
              </div>
              <Badge text={dryRunData.source || "Amazon.ae"} /> <Badge text={dryRunData.category} color={c.green} bg={c.sectionBg} />
            </div>
          </div>
          <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "10px" }}>
            <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "6px" }}>TRANSLATION</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "12px", marginBottom: "10px" }}><div><span style={{ color: c.dim }}>EN:</span> {dryRunData.clean_name_en}</div><div><span style={{ color: c.dim }}>ID:</span> <span style={{ color: c.gold, fontWeight: 600 }}>{dryRunData.clean_name_id}</span></div></div>
            <div>
              <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px" }}>SEARCH QUERIES</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>{editableQueries.map((q, i) => <div key={i} style={{ display: "flex", gap: "4px" }}><input value={q} onChange={e => { const u = [...editableQueries]; u[i] = e.target.value; setEditableQueries(u); }} style={{ ...inputStyle, padding: "5px 8px", fontSize: "11px", flex: 1 }} /><button onClick={() => setEditableQueries(editableQueries.filter((_, idx) => idx !== i))} style={{ background: "transparent", border: "1px solid " + c.red + "44", color: c.red, fontSize: "10px", padding: "4px 8px", borderRadius: "3px", cursor: "pointer" }}>{"\u2715"}</button></div>)}</div>
              <div style={{ display: "flex", gap: "4px" }}><input value={newQueryInput} onChange={e => setNewQueryInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newQueryInput.trim()) { setEditableQueries([...editableQueries, newQueryInput.trim()]); setNewQueryInput(""); } }} placeholder="Add keyword..." style={{ ...inputStyle, padding: "5px 8px", fontSize: "11px", flex: 1 }} /><button onClick={() => { if (newQueryInput.trim()) { setEditableQueries([...editableQueries, newQueryInput.trim()]); setNewQueryInput(""); } }} style={{ ...btnSec, padding: "5px 12px", fontSize: "9px" }}>+ ADD</button></div>
            </div>
          </div>
          {!loading && <div style={{ padding: "14px", background: c.surface2, border: "1px solid " + c.green + "44", borderRadius: "4px", marginBottom: "10px" }}>
            {indoResults?.results?.length > 0 && <div style={{ fontSize: "10px", color: c.green, fontFamily: "monospace", marginBottom: "10px" }}>{"\u2713"} {indoResults.results.length} listings loaded{indoResults.results.filter(r => r.source === "Tokopedia").length > 0 && " | Toko: " + indoResults.results.filter(r => r.source === "Tokopedia").length}{indoResults.results.filter(r => r.source === "Shopee").length > 0 && " | Shopee: " + indoResults.results.filter(r => r.source === "Shopee").length}</div>}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              {(isAdmin ? indoMode : "apify") === "apify" ? <>
                <button onClick={runLookupToko} disabled={editableQueries.filter(q => q.trim()).length === 0 || loading} style={{ ...btnGreen, padding: "12px 24px", fontSize: "12px", opacity: (editableQueries.filter(q => q.trim()).length === 0 || loading) ? 0.4 : 1 }}>{"\ud83d\udd0d"} SCRAPE TOKOPEDIA</button>
                <button onClick={runLookupShopee} disabled={editableQueries.filter(q => q.trim()).length === 0 || loading} style={{ ...btnGreen, padding: "12px 24px", fontSize: "12px", background: "#EE4D2D", opacity: (editableQueries.filter(q => q.trim()).length === 0 || loading) ? 0.4 : 1 }}>{"\ud83d\udd0d"} SCRAPE SHOPEE</button>
              </> : <button onClick={runLookupIndoSearch} disabled={editableQueries.filter(q => q.trim()).length === 0 || loading} style={{ ...btnGreen, padding: "12px 36px", fontSize: "12px", opacity: (editableQueries.filter(q => q.trim()).length === 0 || loading) ? 0.4 : 1 }}>{"\ud83d\udd0d"} SEARCH INDONESIA</button>}
              {indoResults && <button onClick={() => setLookupView("results")} style={{ ...btnStyle, padding: "12px 24px", fontSize: "12px" }}>VIEW RESULTS {"\u2192"}</button>}
            </div>
          </div>}
          <div style={{ display: "flex", justifyContent: "center", marginTop: "8px" }}>
            <button onClick={resetLookup} style={{ ...btnSec, padding: "6px 16px", fontSize: "9px" }}>{"\u2190"} NEW SEARCH</button>
          </div>
        </div>}

        {/* ── RESULTS VIEW ── */}
        {lookupView === "results" && dryRunData && <div>
          {/* Product summary bar */}
          <div style={{ padding: "10px 12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "12px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dryRunData.product_name}</div>
              <div style={{ fontSize: "10px", color: c.dim, marginTop: "2px" }}>{dryRunData.clean_name_id} {"\u00b7"} <span style={{ color: c.gold }}>AED {dryRunData.price_aed}</span></div>
            </div>
          </div>

          {indoResults && <SectionToggle index={1} title={"Indonesia Market" + (isAdmin ? " \u2014 " + (indoResults.source === "apify" ? "Apify" : "Claude") : "")} icon={"\ud83c\uddee\ud83c\udde9"} count={indoResults.results?.length}>
            {isAdmin && indoResults.wave_status && <WaveStatusBar waves={indoResults.wave_status} c={c} />}
            {indoResults.confidence && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", marginBottom: "12px", background: indoResults.confidence.level === "high" ? (dark ? "#0D2E1A" : "#E8F5EC") : indoResults.confidence.level === "medium" ? (dark ? "#2A2210" : "#FDF8ED") : (dark ? "#3a1a1a" : "#FEF2F2"), border: "1px solid " + (indoResults.confidence.level === "high" ? c.green : indoResults.confidence.level === "medium" ? c.gold : c.red) + "44", borderRadius: "4px" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", color: indoResults.confidence.level === "high" ? c.green : indoResults.confidence.level === "medium" ? c.gold : c.red }}>{"\u25cf "}{indoResults.confidence.level} CONFIDENCE</div>
                <div style={{ fontSize: "10px", color: c.dim, flex: 1 }}>{indoResults.confidence.validCount} valid{indoResults.confidence.withSold > 0 && " \u00b7 " + indoResults.confidence.withSold + " sold data"}{indoResults.confidence.flags?.length > 0 && " \u00b7 " + indoResults.confidence.flags.join(", ")}</div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: c.dim }}>{indoResults.confidence.score}/100</div>
              </div>
            )}
            {indoResults.price_stats && <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px", marginBottom: "12px" }}>
              {[{ l: "LOWEST", v: indoResults.price_stats.lowest_idr, cl: c.green },{ l: "MEDIAN", v: indoResults.price_stats.median_idr, cl: c.gold },{ l: "AVERAGE", v: indoResults.price_stats.average_idr, cl: c.dim },{ l: "HIGHEST", v: indoResults.price_stats.highest_idr, cl: c.red }].map(s => (
                <div key={s.l} style={{ padding: "8px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}><div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px", marginBottom: "3px" }}>{s.l}</div><div style={{ fontSize: "13px", fontWeight: 700, color: s.cl }}>{fmtIDR(s.v)}</div><div style={{ fontSize: "9px", color: c.dimmest }}>{fmtAED(s.v * fx.IDR_TO_AED)}</div></div>
              ))}
            </div>}
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

          {marginData && displayMargins && <SectionToggle index={2} title="Margin Analysis" icon={"\ud83d\udcca"}>
            {/* Freight mode toggle */}
            <div style={{ marginBottom: "14px", padding: "10px 12px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px" }}>
              <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "8px", textTransform: "uppercase" }}>FREIGHT MODE</div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {Object.entries(FREIGHT_MODES).map(([id, info]) => (
                  <button key={id} onClick={() => setFreightMode(id)} style={{ padding: "6px 12px", background: freightMode === id ? c.gold : "transparent", color: freightMode === id ? c.btnText : c.dim, border: "1px solid " + (freightMode === id ? c.gold : c.border2), borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "monospace", flex: "1 1 auto", textAlign: "center" }}>
                    {info.icon} {info.label}
                    <div style={{ fontSize: "8px", color: freightMode === id ? c.btnText + "cc" : c.dimmest, marginTop: "2px" }}>{info.transit}</div>
                  </button>
                ))}
              </div>
              <div style={{ fontSize: "9px", color: c.dimmer, marginTop: "6px", fontStyle: "italic" }}>{FREIGHT_MODES[freightMode]?.note || ""}</div>
            </div>
            {/* Route comparison table */}
            {routeComparisons.length > 0 && <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "8px", textTransform: "uppercase" }}>ROUTE COMPARISON (MEDIAN PRICE)</div>
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.8fr 0.8fr 0.6fr 0.6fr 0.7fr 0.7fr", gap: "4px", padding: "6px 0", borderBottom: "1px solid " + c.border2, fontSize: "8px", color: c.dimmer, textTransform: "uppercase", minWidth: "550px" }}>
                  <div>Route</div><div>Transit</div><div>Rate</div><div>Freight</div><div>Margin</div><div>Profit/unit</div>
                </div>
                {routeComparisons.map(rt => {
                  const isActive = freightMode === rt.mode;
                  const mColor = marginColor(rt.margin);
                  return (
                    <div key={rt.id} onClick={() => setFreightMode(rt.mode)} style={{ display: "grid", gridTemplateColumns: "1.8fr 0.8fr 0.6fr 0.6fr 0.7fr 0.7fr", gap: "4px", padding: "7px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", cursor: "pointer", background: isActive ? (dark ? "#1A1A10" : "#FFFBF0") : "transparent", minWidth: "550px", borderLeft: rt.highlight ? "3px solid " + c.gold : "3px solid transparent", paddingLeft: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <span>{rt.icon}</span>
                        <span style={{ fontSize: "10px", fontWeight: rt.highlight ? 600 : 400, color: rt.highlight ? c.gold : c.text }}>{rt.label}</span>
                        {rt.highlight && <span style={{ fontSize: "7px", color: c.gold, background: dark ? "#2A2210" : "#FDF8ED", padding: "1px 4px", borderRadius: "2px", border: "1px solid " + c.gold + "44" }}>KCT</span>}
                      </div>
                      <div style={{ fontSize: "10px", color: c.dim }}>{rt.transit}</div>
                      <div style={{ fontSize: "10px", color: c.dim }}>${rt.rate}{rt.unit.includes("CBM") ? "/cbm" : rt.unit.includes("ctr") ? "/ctr" : "/kg"}</div>
                      <div style={{ fontSize: "10px", color: c.dim }}>{fmtUSD(rt.freightUSD)}</div>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: mColor }}>{rt.margin.toFixed(1)}%</div>
                      <div style={{ fontSize: "10px", color: rt.profitUSD > 0 ? c.green : c.red }}>{fmtAED(rt.profitAED)}</div>
                    </div>
                  );
                })}
              </div>
            </div>}
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "14px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "10px", color: c.dim }}>FOR:</span>
              {[{ id: "unit", label: "Per Unit" }, { id: "custom", label: "Custom Qty" }, { id: "container", label: "Container (20ft)" }].map(m => (
                <button key={m.id} onClick={() => setQtyMode(m.id)} style={{ padding: "4px 10px", background: qtyMode === m.id ? c.gold : "transparent", color: qtyMode === m.id ? c.btnText : c.dim, border: "1px solid " + (qtyMode === m.id ? c.gold : c.border2), borderRadius: "3px", fontSize: "10px", cursor: "pointer", fontFamily: "monospace" }}>{m.label}</button>
              ))}
              {qtyMode === "custom" && <input type="number" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} min="1" style={{ ...inputStyle, width: "80px", padding: "4px 8px", fontSize: "11px", textAlign: "center" }} />}
              <span style={{ fontSize: "10px", color: c.dimmer }}>{"\u00d7 "}{getQty()} units</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginBottom: "14px" }}>
              {[{ l: "BEST", m: displayMargins.best }, { l: "MEDIAN", m: displayMargins.median }, { l: "WORST", m: displayMargins.worst }].map(x => (
                <div key={x.l} style={{ padding: "12px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}><div style={{ fontSize: "8px", color: c.dimmer }}>{x.l}</div><div style={{ fontSize: "24px", fontWeight: 700, color: marginColor(x.m.margin) }}>{x.m.margin.toFixed(1)}%</div></div>
              ))}
            </div>
            <div style={{ background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", padding: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "10px", padding: "4px 0", borderBottom: "1px solid " + c.border2, color: c.dimmer, fontWeight: 700 }}><div>COST</div><div>USD</div><div>AED</div><div>IDR</div></div>
              {(() => { const m = displayMargins.median, q = getQty(); return <>
                <PriceRow label={"UAE Sell"} usd={m.uaeUSD*q} aed={m.uaeAED*q} idr={m.uaeIDR*q} />
                <PriceRow label={"Indo"} usd={m.indoUSD*q} aed={m.indoAED*q} idr={m.indoIDR*q} />
                <PriceRow label={"Freight"} usd={m.freightUSD*q} aed={m.freightAED*q} idr={m.freightIDR*q} />
                <PriceRow label={"Customs"} usd={m.dutyUSD*q} aed={m.dutyAED*q} idr={m.dutyIDR*q} />
                <PriceRow label={"Last Mile"} usd={m.lastMileUSD*q} aed={m.lastMileAED*q} idr={m.lastMileIDR*q} />
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "6px 0", fontWeight: 700 }}><div style={{ color: c.red }}>TOTAL</div><div style={{ color: c.red }}>{fmtUSD(m.totalUSD*q)}</div><div style={{ color: c.red }}>{fmtAED(m.totalAED*q)}</div><div style={{ color: c.red }}>{fmtIDR(m.totalIDR*q)}</div></div>
                <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "6px", fontSize: "11px", padding: "6px 0", fontWeight: 700 }}><div style={{ color: c.green }}>PROFIT</div><div style={{ color: c.green }}>{fmtUSD((m.uaeUSD-m.totalUSD)*q)}</div><div style={{ color: c.green }}>{fmtAED((m.uaeAED-m.totalAED)*q)}</div><div style={{ color: c.green }}>{fmtIDR((m.uaeIDR-m.totalIDR)*q)}</div></div>
              </>; })()}
            </div>
            <div style={{ marginTop: "10px", padding: "8px", borderRadius: "4px", textAlign: "center", fontSize: "12px", fontWeight: 600, background: displayStatus === "Candidate" ? (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT).Candidate.bg : displayStatus === "Investigated" ? (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT).Active.bg : (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT).Rejected.bg, color: marginColor(displayMargins.median.margin), border: "1px solid " + (displayStatus === "Candidate" ? STATUS_COLORS.Candidate.border : STATUS_COLORS.Rejected.border) }}>
              {displayMargins.median.margin >= MARGIN_THRESHOLD.candidate ? "\u2713 CANDIDATE" : displayMargins.median.margin >= MARGIN_THRESHOLD.borderline ? "\u25cb BORDERLINE" : "\u2717 LOW MARGIN"} {"\u2014"} {displayMargins.median.margin.toFixed(1)}%
            </div>
          </SectionToggle>}

          {!loading && <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "12px" }}>
            <button onClick={() => setLookupView("scrape")} style={{ ...btnSec, padding: "8px 20px", fontSize: "10px" }}>{"\u2190"} EDIT QUERIES</button>
            <button onClick={resetLookup} style={{ ...btnSec, padding: "8px 20px", fontSize: "10px" }}>{"\u2190"} NEW SEARCH</button>
            {marginData && <button onClick={exportPDF} style={{ ...btnSec, padding: "8px 16px", fontSize: "10px" }}>{"\ud83d\udcc4"} PDF</button>}
          </div>}
        </div>}
      </div>}

      {/* ══════════ HISTORY TAB ══════════ */}
      {mode === "history" && <div style={secStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "6px" }}>
          <span style={{ fontSize: "10px", color: c.dim, letterSpacing: "1px" }}>{history.length} LOOKUPS</span>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            <button style={btnSec} onClick={exportQuickCSV}>{"\ud83d\udcca"} EXPORT CSV</button>
            {isAdmin && <>
              <button style={btnSec} onClick={exportStructuredCSV}>FULL CSV</button>
              <button style={btnSec} onClick={exportBackup}>{"\ud83d\udcbe BACKUP"}</button>
              <input type="file" ref={backupFileRef} accept=".json" style={{ display: "none" }} onChange={e => e.target.files[0] && importBackup(e.target.files[0])} />
              <button style={btnSec} onClick={() => backupFileRef.current?.click()}>{"\ud83d\udcc2 RESTORE"}</button>
              <button style={{ ...btnSec, color: c.red, borderColor: c.red }} onClick={async () => { if (!confirm("Clear all?")) return; setHistory([]); await saveHistory(userId, []); }}>CLEAR</button>
            </>}
          </div>
        </div>
        {!history.length ? <div style={{ textAlign: "center", padding: "40px", color: c.dimmer }}>No lookups yet.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "550px", overflowY: "auto" }}>
            {history.map((h, i) => {
              const m = h.margins?.median?.margin || 0;
              const sc = (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT)[h.status] || (dark ? STATUS_COLORS : STATUS_COLORS_LIGHT).Candidate;
              const isExp = expandedHistoryIdx === i;
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
                  {isExp && (h.indoResults?.results || []).length > 0 && <div style={{ padding: "0 12px 12px", borderTop: "1px solid " + c.border }}>
                    <div style={{ fontSize: "9px", color: c.dimmer, padding: "8px 0 4px", textTransform: "uppercase" }}>INDO LISTINGS ({(h.indoResults?.results || []).length})</div>
                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                      {(h.indoResults?.results || []).map((r, j) => <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid " + c.border, fontSize: "10px" }}>
                        <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                        <div style={{ display: "flex", gap: "8px", marginLeft: "8px" }}>
                          <span style={{ color: r.source === "Shopee" ? "#EE4D2D" : c.green, fontSize: "9px" }}>{r.source === "Shopee" ? "S" : "T"}</span>
                          <span style={{ color: c.gold, fontWeight: 700 }}>{fmtIDR(r.price_idr)}</span>
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


      {/* ══════════ ADMIN TAB ══════════ */}
      {mode === "admin" && isAdmin && <div style={secStyle}>
        {/* Sub-tab bar */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
          {[{ id: "users", label: "\ud83d\udc65 Users" }, { id: "searches", label: "\ud83d\udd0d Harvest" }, { id: "rates", label: "\ud83d\udea2 Rates" }].map(t => (
            <button key={t.id} onClick={() => { setAdminSubTab(t.id); if (t.id === "users" && !adminUsers.length) loadAdminUsers(); if (t.id === "searches" && !adminSearches.length) loadAdminSearches(); if (t.id === "rates" && !adminRates.length) loadAdminRates(); }} style={{ padding: "8px 14px", background: adminSubTab === t.id ? c.gold : "transparent", color: adminSubTab === t.id ? c.btnText : c.dim, border: "1px solid " + (adminSubTab === t.id ? c.gold : c.border2), borderRadius: "4px", cursor: "pointer", fontFamily: "monospace", fontSize: "11px", fontWeight: adminSubTab === t.id ? 700 : 400 }}>{t.label}</button>
          ))}
          <button onClick={() => { loadAdminUsers(); loadAdminSearches(); loadAdminRates(); }} style={{ ...btnSec, padding: "8px 12px", fontSize: "9px", marginLeft: "auto" }}>{"\u21bb"} REFRESH</button>
        </div>

        {/* Users sub-tab */}
        {adminSubTab === "users" && <div>
          <div style={{ fontSize: "10px", color: c.dimmer, marginBottom: "8px" }}>{adminUsers.length} users</div>
          {adminUsers.length === 0 && <button onClick={loadAdminUsers} style={{ ...btnGreen, padding: "8px 16px", fontSize: "10px" }}>LOAD USERS</button>}
          {adminUsers.length > 0 && <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.6fr 0.6fr 1fr", gap: "6px", padding: "6px 0", borderBottom: "1px solid " + c.border2, fontSize: "9px", color: c.dimmer, textTransform: "uppercase", minWidth: "500px" }}>
              <div>Email</div><div>Role</div><div>Lookups</div><div>Margins</div><div>Joined</div>
            </div>
            {adminUsers.map(u => (
              <div key={u.id} style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.6fr 0.6fr 1fr", gap: "6px", padding: "8px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", alignItems: "center", minWidth: "500px" }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.email}
                  {u.display_name && <span style={{ color: c.dimmest }}>{" \u00b7 "}{u.display_name}</span>}
                </div>
                <div>
                  <select value={u.role} onChange={e => updateUserRole(u.id, e.target.value)} style={{ background: c.input, color: u.role === "admin" ? c.red : u.role === "paid" ? c.gold : c.text, border: "1px solid " + c.border2, borderRadius: "3px", padding: "2px 4px", fontSize: "10px", fontFamily: "monospace", cursor: "pointer" }}>
                    <option value="free">Free</option>
                    <option value="registered">Registered</option>
                    <option value="paid">Paid</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div style={{ color: c.gold, fontSize: "10px" }}>{u.lookups_used || 0}</div>
                <div style={{ color: c.gold, fontSize: "10px" }}>{u.margins_used || 0}</div>
                <div style={{ color: c.dimmest, fontSize: "9px" }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "\u2014"}</div>
              </div>
            ))}
          </div>}
        </div>}

        {/* Search Harvest sub-tab */}
        {adminSubTab === "searches" && <div>
          <div style={{ fontSize: "10px", color: c.dimmer, marginBottom: "8px" }}>{adminSearches.length} searches logged</div>
          {adminSearches.length === 0 && <div>
            <button onClick={loadAdminSearches} style={{ ...btnGreen, padding: "8px 16px", fontSize: "10px" }}>LOAD SEARCHES</button>
            <div style={{ fontSize: "9px", color: c.dimmest, marginTop: "8px" }}>Searches are logged when users perform lookups. The searches table may be empty if no lookups have been done since the table was created.</div>
          </div>}
          {adminSearches.length > 0 && <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 0.6fr 0.6fr 0.6fr 1fr", gap: "6px", padding: "6px 0", borderBottom: "1px solid " + c.border2, fontSize: "9px", color: c.dimmer, textTransform: "uppercase", minWidth: "500px" }}>
              <div>Product</div><div>UAE</div><div>Indo</div><div>Margin</div><div>Date</div>
            </div>
            {adminSearches.map(s => (
              <div key={s.id} style={{ display: "grid", gridTemplateColumns: "2fr 0.6fr 0.6fr 0.6fr 1fr", gap: "6px", padding: "7px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", minWidth: "500px" }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: c.text }}>{s.product_name || "\u2014"}</div>
                <div style={{ color: c.gold, fontSize: "10px" }}>{s.uae_price_aed ? "AED " + s.uae_price_aed : "\u2014"}</div>
                <div style={{ color: c.dim, fontSize: "10px" }}>{s.indo_median_idr ? fmtIDR(s.indo_median_idr) : "\u2014"}</div>
                <div style={{ color: s.margin_pct >= 40 ? c.green : s.margin_pct >= 20 ? c.gold : c.red, fontWeight: 700, fontSize: "10px" }}>{s.margin_pct != null ? s.margin_pct.toFixed(1) + "%" : "\u2014"}</div>
                <div style={{ color: c.dimmest, fontSize: "9px" }}>{s.created_at ? new Date(s.created_at).toLocaleString() : "\u2014"}</div>
              </div>
            ))}
          </div>}
          {/* Quick stats */}
          {adminSearches.length > 0 && <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
            {[
              { l: "TOTAL", v: adminSearches.length, cl: c.gold },
              { l: "CANDIDATES", v: adminSearches.filter(s => s.margin_pct >= 40).length, cl: c.green },
              { l: "AVG MARGIN", v: (adminSearches.filter(s => s.margin_pct != null).reduce((a, s) => a + (s.margin_pct || 0), 0) / Math.max(1, adminSearches.filter(s => s.margin_pct != null).length)).toFixed(1) + "%", cl: c.gold },
            ].map(s => (
              <div key={s.l} style={{ padding: "10px", background: c.cardBg, border: "1px solid " + c.border, borderRadius: "4px", textAlign: "center" }}>
                <div style={{ fontSize: "8px", color: c.dimmer, letterSpacing: "1px" }}>{s.l}</div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: s.cl }}>{s.v}</div>
              </div>
            ))}
          </div>}
        </div>}

        {/* Rates sub-tab */}
        {adminSubTab === "rates" && <div>
          <div style={{ fontSize: "10px", color: c.dimmer, marginBottom: "8px" }}>Logistics rates from database</div>
          {adminRates.length === 0 && <button onClick={loadAdminRates} style={{ ...btnGreen, padding: "8px 16px", fontSize: "10px" }}>LOAD RATES</button>}
          {adminRates.length > 0 && <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.6fr 0.6fr 0.7fr 0.6fr 0.7fr", gap: "6px", padding: "6px 0", borderBottom: "1px solid " + c.border2, fontSize: "9px", color: c.dimmer, textTransform: "uppercase", minWidth: "500px" }}>
              <div>Route</div><div>Mode</div><div>Rate</div><div>Transit</div><div>Congestion</div><div>Valid Until</div>
            </div>
            {adminRates.map(r => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.6fr 0.6fr 0.7fr 0.6fr 0.7fr", gap: "6px", padding: "7px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", minWidth: "500px" }}>
                <div style={{ color: c.text }}>{r.route_name}</div>
                <div><Badge text={r.freight_mode || ""} color={r.freight_mode === "air" ? c.gold : c.green} bg={r.freight_mode === "air" ? (dark ? "#2A2210" : "#FDF8ED") : (dark ? "#0D2E1A" : "#E8F5EC")} /></div>
                <div style={{ color: c.gold, fontWeight: 600 }}>{r.rate_amount} {r.rate_unit}</div>
                <div style={{ color: c.dim, fontSize: "10px" }}>{r.transit_days_min}\u2013{r.transit_days_max}d</div>
                <div style={{ color: r.congestion_factor > 1 ? c.red : c.green, fontSize: "10px" }}>{r.congestion_factor}x</div>
                <div style={{ color: c.dimmest, fontSize: "9px" }}>{r.valid_until || "\u2014"}</div>
              </div>
            ))}
          </div>}
          <div style={{ marginTop: "12px", padding: "10px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", fontSize: "10px", color: c.dim }}>
            {"\u2139\ufe0f"} Rate updates are managed directly in Supabase Dashboard {"\u2192"} Table Editor {"\u2192"} logistics_rates. Update rates weekly from GT operational data.
          </div>
        </div>}
      </div>}

      {/* ══════════ DIAGNOSTIC PANEL ══════════ */}
      {showDiag && <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxHeight: "40vh", background: dark ? "#0a0a0a" : "#1a1a1a", borderTop: "2px solid " + c.gold, zIndex: 9998, display: "flex", flexDirection: "column", fontFamily: "'Inconsolata',monospace" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 14px", borderBottom: "1px solid #333", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: c.gold, fontWeight: 700 }}>DIAG</span>
            <span style={{ fontSize: "10px", color: "#888" }}>{diagLogs.length}</span>
          </div>
          <div style={{ display: "flex", gap: "4px" }}>
            {["all", "error", "warn", "ok"].map(f => <button key={f} onClick={() => setDiagFilter(f)} style={{ padding: "2px 6px", fontSize: "8px", fontFamily: "monospace", cursor: "pointer", background: diagFilter === f ? c.gold : "transparent", color: diagFilter === f ? "#0a0a0a" : "#888", border: "1px solid " + (diagFilter === f ? c.gold : "#333"), borderRadius: "3px", textTransform: "uppercase" }}>{f}</button>)}
            <button onClick={clearDiag} style={{ padding: "2px 6px", fontSize: "8px", fontFamily: "monospace", cursor: "pointer", background: "transparent", color: "#f87171", border: "1px solid #5a2d2d", borderRadius: "3px" }}>CLR</button>
            <button onClick={() => { const lines = diagRef.current.map(l => `${l.ts} [${l.level}] ${l.label}: ${l.message}${l.data ? "\n  " + l.data : ""}`).join("\n"); const blob = new Blob([lines], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gt-diag-" + new Date().toISOString().slice(0, 19).replace(/:/g, "") + ".txt"; a.click(); }} style={{ padding: "2px 6px", fontSize: "8px", fontFamily: "monospace", cursor: "pointer", background: "transparent", color: "#C9A84C", border: "1px solid #C9A84C66", borderRadius: "3px" }}>EXPORT</button>
            <button onClick={() => setShowDiag(false)} style={{ padding: "2px 6px", fontSize: "8px", fontFamily: "monospace", cursor: "pointer", background: "transparent", color: "#888", border: "1px solid #333", borderRadius: "3px" }}>{"\u2715"}</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {diagLogs.filter(l => diagFilter === "all" || l.level === diagFilter).map((l, i) => {
            const lc = l.level === "error" ? "#f87171" : l.level === "warn" ? "#D4A843" : l.level === "ok" ? "#2EAA5A" : "#666";
            return (<div key={i} style={{ padding: "2px 14px", borderBottom: "1px solid #1a1a1a", fontSize: "10px", lineHeight: 1.4 }}><span style={{ color: "#555", marginRight: "6px" }}>{l.ts}</span><span style={{ color: lc, fontWeight: 700, marginRight: "4px" }}>{l.level}</span><span style={{ color: c.gold, marginRight: "6px" }}>{l.label}</span><span style={{ color: "#ccc" }}>{l.message}</span>{l.data && <div style={{ color: "#777", marginLeft: "60px", fontSize: "9px", maxHeight: "60px", overflowY: "auto", background: "#111", padding: "2px 6px", borderRadius: "2px" }}>{l.data}</div>}</div>);
          })}
        </div>
      </div>}

      </>)}
    </div>
  );
}
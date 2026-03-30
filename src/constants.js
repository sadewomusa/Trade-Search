// ══════════ SUPABASE CONFIG ══════════
export const SUPABASE_URL = "https://cqpxzxafavqflnrilgjh.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_f4N-v3Gs7qJsPW4jUe_fzw_u81VVIg3";

// ══════════ CONSTANTS ══════════
export const DEFAULT_FX = { AEDUSD: 0.2723, IDRUSD: 0.0000613, AED_TO_IDR: 0.2723 / 0.0000613, IDR_TO_AED: 0.0000613 / 0.2723 };
export const DEFAULT_FREIGHT = { air: { rate_per_kg: 4, min_kg: 100, transit: { port_port: "3-5 days", port_door: "5-7 days", door_door: "7-10 days" } }, ocean: { rate_20ft: 800, rate_40ft: 1400, rate_per_cbm: 45, transit: { port_port: "14-18 days", port_door: "18-25 days", door_door: "21-30 days" } }, source: "default", updated: null };
export const CUSTOMS_DUTY = 0.05;
export const LAST_MILE_AED = 20;
export const MARGIN_THRESHOLD = { candidate: 40, borderline: 20 };
export const WEIGHT_KG = { light: 0.3, medium: 1.0, heavy: 3.0 };
export const VOLUME_CBM = { light: 0.002, medium: 0.005, heavy: 0.015 };
export const FREIGHT_MODES = {
  air:     { label: "Air Freight",    icon: "\u2708", transit: "5\u20137 days",  note: "Best for samples, urgent, <2kg items" },
  sea_lcl: { label: "Sea LCL",       icon: "\ud83d\udea2", transit: "14\u201328 days", note: "Small batches, testing (per CBM)" },
  sea_fcl: { label: "Sea FCL (20ft)", icon: "\ud83d\udce6", transit: "18\u201325 days", note: "500+ units, proven products" },
};
export const ROUTES = [
  { id: "air_dxb", label: "Air via Dubai (DXB)", mode: "air", origin: "Jakarta (CGK)", dest: "Dubai (DXB)", transit: "5\u20137 days", rate: 4.25, unit: "USD/kg", bestFor: "Samples, urgent, <2kg items", icon: "\u2708" },
  { id: "sea_lcl_jea", label: "Sea LCL via Jebel Ali (Dubai)", mode: "sea_lcl", origin: "Jakarta", dest: "Jebel Ali, Dubai", transit: "21\u201328 days", rate: 47.5, unit: "USD/CBM", bestFor: "Small batches, testing", icon: "\ud83d\udea2" },
  { id: "sea_lcl_kct", label: "Sea LCL via Khorfakkan (Sharjah) \u2605", mode: "sea_lcl", origin: "Surabaya", dest: "Khorfakkan, Sharjah", transit: "14\u201320 days", rate: 42, unit: "USD/CBM", bestFor: "Regular shipments, east coast", icon: "\ud83d\udea2", highlight: true },
  { id: "sea_fcl_jea", label: "Sea FCL 20ft via Jebel Ali (Dubai)", mode: "sea_fcl", origin: "Jakarta", dest: "Jebel Ali, Dubai", transit: "18\u201325 days", rate: 850, unit: "USD/ctr", bestFor: "500+ units, proven products", icon: "\ud83d\udce6" },
  { id: "sea_fcl_kct", label: "Sea FCL 20ft via Khorfakkan (Sharjah) \u2605", mode: "sea_fcl", origin: "Surabaya", dest: "Khorfakkan, Sharjah", transit: "14\u201322 days", rate: 780, unit: "USD/ctr", bestFor: "Bulk via east coast, fastest sea", icon: "\ud83d\udce6", highlight: true },
  { id: "sea_lcl_klf", label: "Sea LCL via Khalifa (Abu Dhabi)", mode: "sea_lcl", origin: "Jakarta", dest: "Khalifa Port, Abu Dhabi", transit: "20\u201328 days", rate: 46, unit: "USD/CBM", bestFor: "Abu Dhabi destination", icon: "\ud83d\udea2" },
];
export const TIER_LIMITS = {
  free:       { lookups: 3,   margins: 3,  label: "Free" },
  registered: { lookups: 10,  margins: 10, label: "Registered" },
  vip:        { lookups: 30,  margins: 30, label: "VIP" },
  paid:       { lookups: 100, margins: 100, label: "Pro ($20/mo)" },
  admin:      { lookups: 99999, margins: 99999, label: "Admin" },
};
export const DISPOSABLE_DOMAINS = ["tempmail.com","guerrillamail.com","mailinator.com","throwaway.email","yopmail.com","sharklasers.com","guerrillamailblock.com","grr.la","guerrillamail.info","guerrillamail.de","tempail.com","dispostable.com","trashmail.com","trashmail.me","trashmail.net","mailnesia.com","maildrop.cc","discard.email","temp-mail.org","fakeinbox.com","emailondeck.com","mohmal.com","tempmailo.com","temp-mail.io","burnermail.io","tmail.ws","tmpmail.net","tmpmail.org","getnada.com","inboxbear.com","mailsac.com","10minutemail.com","20minutemail.com","minutemail.com","tempmailaddress.com","crazymailing.com","mytemp.email","tempr.email","harakirimail.com","bupmail.com","mailcatch.com","mailscrap.com","spamgourmet.com","spamfree24.org","jetable.org","trashymail.com","klzlk.com","emltmp.com","tmpbox.net"];
export const WORKER_URL = "https://trades-proxy.sadewoahmadm.workers.dev";
export const STATUS_COLORS = { Candidate: { bg: "#0D2E1A", text: "#2EAA5A", border: "#1A5C32" }, Investigated: { bg: "#0D1F15", text: "#5BAD6E", border: "#1A4A2D" }, Rejected: { bg: "#3a1a1a", text: "#f87171", border: "#5a2d2d" }, Active: { bg: "#2A2210", text: "#D4A843", border: "#4A3D18" } };
export const STATUS_COLORS_LIGHT = { Candidate: { bg: "#E8F5EC", text: "#1A7A3A", border: "#B6E2C4" }, Investigated: { bg: "#EDF7F0", text: "#3D8B56", border: "#C4E1CE" }, Rejected: { bg: "#FEF2F2", text: "#DC2626", border: "#FECACA" }, Active: { bg: "#FDF8ED", text: "#9A7A1C", border: "#E8D9A0" } };
export const MAX_HISTORY = 2000;
export const FX_CACHE_MS = 86400000;
export const AMAZON_AE_DEPTS = [
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
export const BRAND_BLOCKLIST_DEFAULT = [
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
export const INDO_SIGNAL_WORDS = ["handmade","handcrafted","hand carved","hand woven","handwoven","wooden","wood","bamboo","rattan","coconut","teak","acacia","mango wood","mahogany","sono wood","natural","organic","artisan","traditional","rustic","woven","seagrass","palm","batik","ceramic","pottery","stone","volcanic","lava","mortar","pestle","cobek","ulekan","incense","frankincense","kemenyan","essential oil","herbal","jamu","luwak","toraja","arabica","robusta","pandan","sambal","tempeh","vanilla","clove","cinnamon","nutmeg","turmeric","ginger","galangal","lemongrass","eco-friendly","sustainable","zero waste","reusable","plant-based","fiber","sisal","abaca","kapok","horn","bone","shell","mother of pearl","batik","ikat","songket","tenun"];

// ══════════ DEFAULT KEYWORD BANK ══════════
export const DEFAULT_KEYWORDS = [
  "coconut bowl","teak cutting board","rattan basket","bamboo organizer","essential oil diffuser","mortar pestle stone",
  "batik fabric","wooden spoon set","incense sticks natural","coffee beans arabica","herbal supplement",
  "coconut oil organic","spice grinder manual","woven placemat","ceramic handmade","wooden toy",
  "jamu herbal","sambal sauce","pandan extract","frankincense resin","wooden coffee dripper",
  "seagrass basket","bamboo straw","moringa powder","vanilla beans","clove oil",
  "teak serving bowl","banana leaf plate","tempeh starter","luwak coffee"
];

// ══════════ BLOCKED-SIGNAL DETECTION ══════════
export const BLOCKED_SIGNALS = [
  { pattern: /sorry.*i.*(?:can't|cannot|unable)/i, reason: "Claude refusal" },
  { pattern: /as an ai/i, reason: "AI identity disclosure" },
  { pattern: /i don't have.*(?:access|ability|capability)/i, reason: "Capability limitation" },
  { pattern: /captcha|blocked|denied|forbidden/i, reason: "Access blocked" },
  { pattern: /unfortunately.*(?:no|not|cannot)/i, reason: "Negative response" },
  { pattern: /please note.*(?:real|actual|live)/i, reason: "Fabrication warning" },
  { pattern: /(?:hypothetical|fictional|imagin(?:ary|ed))\s+(?:product|listing|price|result)/i, reason: "Fabricated results" },
];

export const AMAZON_URL_PATTERN = /^https?:\/\/(www\.)?(amazon\.(ae|com|co\.uk|de|fr|it|es|ca|com\.au|in|sg|sa|com\.br|co\.jp|nl|pl|se|com\.mx|com\.tr|eg)|amzn\.(to|eu|asia|com))\//i;

// ══════════ THEME COLORS ══════════
export function getThemeColors(dark) {
  return dark
    ? { bg: "#0a0a0a", surface: "#0C0F0C", surface2: "#0E120E", input: "#1a1a1a", border: "#222", border2: "#333", text: "#d4d4d4", dim: "#888", dimmer: "#555", dimmest: "#444", gold: "#C9A84C", green: "#2EAA5A", red: "#f87171", darkGold: "#D4A843", cardBg: "#080808", btnText: "#0f0f0f", sectionBg: "#0D1F15", greenBg: "#0D2E1A", goldBg: "#2A2210" }
    : { bg: "#F5F2EB", surface: "#FFFFFF", surface2: "#F0EDE4", input: "#FFFFFF", border: "#D4CFC4", border2: "#C0BAB0", text: "#1A1A1A", dim: "#555", dimmer: "#888", dimmest: "#AAA", gold: "#8B6914", green: "#1A7A3A", red: "#DC2626", darkGold: "#9A7A1C", cardBg: "#F8F6F0", btnText: "#FFFFFF", sectionBg: "#E8F5EC", greenBg: "#E8F5EC", goldBg: "#FDF8ED" };
}

// ══════════ SHARED STYLES (factory) ══════════
export function getStyles(c) {
  const inputStyle = { width: "100%", padding: "10px 12px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "13px", borderRadius: "3px", outline: "none" };
  const btnStyle = { padding: "10px 24px", background: c.gold, color: c.btnText, border: "none", cursor: "pointer", fontFamily: "'Inconsolata',monospace", fontSize: "12px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", borderRadius: "3px" };
  const btnSec = { ...btnStyle, background: "transparent", color: c.gold, border: "1px solid " + c.gold };
  const btnGreen = { ...btnStyle, background: c.green, color: "#fff" };
  const secStyle = { padding: "20px", background: c.surface, border: "1px solid " + c.border2, borderTop: "none", minHeight: "420px", borderRadius: "0 0 4px 4px" };
  return { inputStyle, btnStyle, btnSec, btnGreen, secStyle };
}

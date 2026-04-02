import { useState } from "react";

// ══════════ BANDAR USER GUIDE ══════════
const GUIDE_STEPS = [
  { id: "welcome", icon: "\ud83c\udfea", badge: "START HERE", title: "Welcome to Bandar", subtitle: "Your trade opportunity finder", body: "Bandar helps you find products selling at high prices in the UAE \u2014 that can be sourced cheaply from Indonesia.", tip: "Think of it as your personal trade scout. It does the price comparison legwork for you.", visual: "flow" },
  { id: "discover", icon: "\ud83d\udd0d", badge: "TAB 1", title: "Discover", subtitle: "Search for products on Amazon UAE", body: "Type any product keyword \u2014 like \"coconut bowl\" or \"rattan basket\" \u2014 and hit Search. Bandar fetches real Amazon.ae listings with prices and reviews.", steps: ["Type a product keyword in the search box", "Tap SEARCH AMAZON", "Browse results \u2014 sorted by popularity", "Switch to list view (\u2630) to select products for Deep Dive", "Tap VALIDATE on any product to check its Indonesia margin"], tip: "High review count = proven demand. Start there!", visual: "discover" },
  { id: "lookup", icon: "\u26a1", badge: "TAB 2", title: "Lookup", subtitle: "Deep-dive any specific product", body: "Found a product link on Amazon? Paste it here. Bandar reads the product, translates it to Indonesian, and searches Tokopedia & Shopee for you.", steps: ["Paste any Amazon product URL", "Tap QUICK CHECK \u2014 Bandar reads the product", "Review the auto-generated search queries", "Tap Explore Source 1 and/or Source 2", "Tap RUN MARGIN ANALYSIS to calculate profitability (A + B)", "Tap \"\ud83c\udfaf Deep Dive from this product\" to find similar bestsellers + Indonesian suppliers"], tip: "You can edit the search queries before exploring \u2014 add your own keywords for better results.", visual: "lookup" },
  { id: "deepdive", icon: "\ud83c\udfaf", badge: "TAB 3", title: "Deep Dive", subtitle: "Full sourcing intelligence pipeline", body: "Deep Dive analyzes Amazon.ae bestsellers in a category, extracts the \u201cgolden thread\u201d (what makes them sell), then finds and scores Indonesian suppliers against that profile.", steps: ["Start from Discover (select 5\u201315 products in list view) or Lookup (tap the Deep Dive button)", "Bandar scrapes full product details from Amazon", "AI analyzes patterns across bestsellers \u2014 specs, pricing, certifications", "Review the golden thread brief and edit Indonesian search keywords", "Bandar searches Tokopedia + Shopee, translates results, ranks by similarity", "AI scores top 15 candidates from 1\u20135 with reasoning"], highlights: [{ color: "#22c55e", label: "Score 5", desc: "Near-identical \u2014 contact this supplier immediately" }, { color: "#86efac", label: "Score 4", desc: "Strong match, minor differences \u2014 worth reaching out" }, { color: "#eab308", label: "Score 3", desc: "Decent match, needs customization \u2014 backup option" }], tip: "High sold count on Indonesian marketplaces signals manufacturing capability \u2014 a seller moving 5,000+ units can likely produce to your specs.", visual: "deepdive" },
  { id: "margins", icon: "\ud83d\udcca", badge: "THE GOOD STUFF", title: "Reading Your Margins", subtitle: "Is this product worth trading?", body: "After exploring Indonesian prices, Bandar calculates your profit margin \u2014 including freight, customs, and last-mile delivery costs.", highlights: [{ color: "#2EAA5A", label: "40%+", desc: "Strong candidate \u2014 worth pursuing" }, { color: "#D4A843", label: "20\u201340%", desc: "Borderline \u2014 needs volume or negotiation" }, { color: "#f87171", label: "Below 20%", desc: "Likely not profitable after costs" }], tip: "Compare routes! Khorfakkan (Sharjah) routes are often cheaper and faster than Dubai.", visual: "margins" },
  { id: "scenarios", icon: "\ud83c\udfaf", badge: "PRO MOVE", title: "Scenario A vs B", subtitle: "Two ways to check viability", body: "One click runs both scenarios. Scenario A uses the exact product link price. Scenario B finds similar products on Amazon and uses their average \u2014 giving you a market-wide view. Each run costs 1 margin analysis quota.", highlights: [{ color: "#C9A84C", label: "Scenario A", desc: "Your link price vs Indonesia median" }, { color: "#2EAA5A", label: "Scenario B", desc: "Market average vs Indonesia \u2014 broader view" }], tip: "Use Scenario A for a specific deal. Use Scenario B to validate the whole category.", visual: "scenarios" },
  { id: "history", icon: "\ud83d\udccb", badge: "TAB 4", title: "History", subtitle: "Track everything you\u2019ve researched", body: "Every product you look up is saved automatically. Come back anytime to review, compare, or export your findings.", steps: ["All lookups are saved with margins and status", "Set status: Candidate \u2192 Investigated \u2192 Active or Rejected", "Export to CSV for spreadsheets and reporting", "Tap any entry to see full Indonesia listings"], tip: "Use the status labels to build your pipeline \u2014 from research to action.", visual: "history" },
  { id: "freight", icon: "\ud83d\udea2", badge: "LOGISTICS", title: "Freight Modes", subtitle: "How your goods get here", routes: [{ icon: "\u2708", name: "Air Freight", time: "5\u20137 days", best: "Samples, urgent, light items (<2kg)" }, { icon: "\ud83d\udea2", name: "Sea LCL", time: "14\u201328 days", best: "Small batches, testing the market" }, { icon: "\ud83d\udce6", name: "Sea FCL (20ft)", time: "18\u201325 days", best: "500+ units, proven products" }], tip: "Start with Air for samples. Scale to Sea once you\u2019ve validated demand.", visual: "freight" },
  { id: "tips", icon: "\u2728", badge: "VOIL\u00c0!", title: "You\u2019re Ready", subtitle: "Quick tips before you go", quickTips: [{ emoji: "\ud83c\udfaf", text: "Use Deep Dive for serious categories \u2014 it\u2019s your full sourcing pipeline" }, { emoji: "\ud83d\udcc8", text: "High reviews on Amazon = proven demand = lower risk" }, { emoji: "\ud83d\udca1", text: "Look for 40%+ margins \u2014 gives you room for unexpected costs" }, { emoji: "\ud83d\udd04", text: "Validate on both Source 1 (Tokopedia) and Source 2 (Shopee)" }, { emoji: "\ud83d\udcca", text: "Export your best candidates to CSV and track them" }, { emoji: "\ud83d\udea2", text: "Khorfakkan routes (marked with \u2605) are often best value" }], tip: null, visual: "tips" },
];

function BandarGuide({ dark }) {
  const [guideStep, setGuideStep] = useState(0);
  const [guideAnimating, setGuideAnimating] = useState(false);
  const [guideHovered, setGuideHovered] = useState(-1);
  const [guideDone, setGuideDone] = useState(new Set());

  const c = dark
    ? { bg: "#0a0a0a", surface: "#0C0F0C", surface2: "#0E120E", input: "#1a1a1a", border: "#222", border2: "#333", text: "#d4d4d4", dim: "#888", dimmer: "#555", dimmest: "#444", gold: "#C9A84C", green: "#2EAA5A", red: "#f87171", cardBg: "#080808", btnText: "#0f0f0f", greenBg: "#0D2E1A", goldBg: "#2A2210" }
    : { bg: "#F5F2EB", surface: "#FFFFFF", surface2: "#F0EDE4", input: "#FFFFFF", border: "#D4CFC4", border2: "#C0BAB0", text: "#1A1A1A", dim: "#555", dimmer: "#888", dimmest: "#AAA", gold: "#8B6914", green: "#1A7A3A", red: "#DC2626", cardBg: "#F8F6F0", btnText: "#FFFFFF", greenBg: "#E8F5EC", goldBg: "#FDF8ED" };

  const goTo = (i) => {
    if (i === guideStep || guideAnimating) return;
    setGuideDone(prev => new Set([...prev, guideStep]));
    setGuideAnimating(true);
    setTimeout(() => { setGuideStep(i); setGuideAnimating(false); }, 200);
  };
  const next = () => guideStep < GUIDE_STEPS.length - 1 && goTo(guideStep + 1);
  const prev = () => guideStep > 0 && goTo(guideStep - 1);
  const cur = GUIDE_STEPS[guideStep];

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      <style>{`@keyframes guideFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes guidePulse{0%,100%{box-shadow:0 0 0 0 rgba(201,168,76,0.3)}50%{box-shadow:0 0 0 6px rgba(201,168,76,0)}}.guide-card-anim{animation:guideFadeIn 0.35s ease-out}.guide-dot:hover{transform:scale(1.15)}@media(max-width:640px){.guide-tips-grid{grid-template-columns:1fr !important}.guide-flow-row{flex-direction:column !important}.guide-flow-row>div:nth-child(even){transform:rotate(90deg)}}`}</style>

      {/* Header */}
      <div style={{ marginBottom: "24px", textAlign: "center" }}>
        <div style={{ fontSize: "10px", color: c.gold, letterSpacing: "3px", textTransform: "uppercase", marginBottom: "6px" }}>BANDAR GUIDE</div>
        <h2 style={{ fontFamily: "'Lora',serif", fontSize: "26px", fontWeight: 500, color: c.gold, margin: "0 0 4px" }}>How to Find Profitable Products</h2>
        <p style={{ fontSize: "11px", color: c.dimmer, margin: 0 }}>{GUIDE_STEPS.length} steps {"\u00b7"} 3 min read {"\u00b7"} no technical knowledge needed</p>
      </div>

      {/* Step nav dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: "6px", marginBottom: "28px", flexWrap: "wrap" }}>
        {GUIDE_STEPS.map((s, i) => {
          const isActive = i === guideStep, isDone = guideDone.has(i), isHov = guideHovered === i;
          return (<button key={s.id} onClick={() => goTo(i)} onMouseEnter={() => setGuideHovered(i)} onMouseLeave={() => setGuideHovered(-1)} className="guide-dot" style={{ display: "flex", alignItems: "center", gap: "5px", padding: isActive ? "6px 14px" : "6px 10px", background: isActive ? c.gold : isDone ? c.greenBg : isHov ? c.surface2 : "transparent", color: isActive ? c.btnText : isDone ? c.green : isHov ? c.text : c.dimmest, border: "1px solid " + (isActive ? c.gold : isDone ? c.green + "44" : c.border), borderRadius: "20px", cursor: "pointer", fontFamily: "'Inconsolata',monospace", fontSize: "10px", fontWeight: isActive ? 700 : 400, transition: "all 0.2s ease", ...(isActive ? { animation: "guidePulse 2s infinite" } : {}) }}>
            <span style={{ fontSize: "13px" }}>{s.icon}</span>
            {(isActive || isHov) && <span>{s.badge}</span>}
            {isDone && !isActive && <span style={{ fontSize: "9px" }}>{"\u2713"}</span>}
          </button>);
        })}
      </div>

      {/* Main card */}
      <div className="guide-card-anim" key={cur.id} style={{ background: c.surface, border: "1px solid " + c.border, borderRadius: "10px", overflow: "hidden", opacity: guideAnimating ? 0 : 1, transition: "opacity 0.2s ease" }}>
        {/* Card header */}
        <div style={{ padding: "24px 28px 16px", borderBottom: "1px solid " + c.border }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <span style={{ fontSize: "28px" }}>{cur.icon}</span>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "8px", letterSpacing: "1.5px", color: c.gold, padding: "2px 8px", background: c.goldBg, border: "1px solid " + c.gold + "33", borderRadius: "3px", fontWeight: 700 }}>{cur.badge}</span>
                <span style={{ fontSize: "9px", color: c.dimmest }}>{guideStep + 1} / {GUIDE_STEPS.length}</span>
              </div>
              <h3 style={{ fontFamily: "'Lora',serif", fontSize: "22px", fontWeight: 600, color: c.text, margin: "4px 0 0" }}>{cur.title}</h3>
            </div>
          </div>
          <div style={{ fontSize: "12px", color: c.gold, fontWeight: 500, marginBottom: "6px" }}>{cur.subtitle}</div>
          {cur.body && <p style={{ fontSize: "13px", color: c.dim, lineHeight: 1.6, margin: 0 }}>{cur.body}</p>}
        </div>

        {/* Card body */}
        <div style={{ padding: "16px 28px 20px" }}>
          {/* Flow visual */}
          {cur.visual === "flow" && <div className="guide-flow-row" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "20px 0", flexWrap: "wrap" }}>
            {[{ emoji: "\ud83d\udd0d", label: "Discover", sub: "Find products" }, null, { emoji: "\u26a1", label: "Lookup", sub: "Check margins" }, null, { emoji: "\ud83c\udfaf", label: "Deep Dive", sub: "Score suppliers" }, null, { emoji: "\ud83d\udccb", label: "History", sub: "Track & export" }].map((item, i) =>
              item === null ? <div key={i} style={{ color: c.gold, fontSize: "18px", fontWeight: 700 }}>{"\u2192"}</div> :
              <div key={i} style={{ textAlign: "center", padding: "14px 16px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "8px", minWidth: "80px" }}>
                <div style={{ fontSize: "24px", marginBottom: "4px" }}>{item.emoji}</div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: c.gold }}>{item.label}</div>
                <div style={{ fontSize: "9px", color: c.dimmer, marginTop: "2px" }}>{item.sub}</div>
              </div>
            )}
          </div>}

          {/* Steps list */}
          {cur.steps && <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px 0" }}>
            {cur.steps.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "8px 12px", background: c.surface2, borderRadius: "6px", border: "1px solid " + c.border }}>
                <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: c.gold, color: c.btnText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, fontFamily: "'Inconsolata',monospace", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ fontSize: "12px", color: c.text, lineHeight: 1.5, paddingTop: "2px" }}>{s}</div>
              </div>
            ))}
          </div>}

          {/* Highlights (margins / scenarios) */}
          {cur.highlights && <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 0" }}>
            {cur.highlights.map((h, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "6px", borderLeft: "4px solid " + h.color }}>
                <div style={{ fontSize: "18px", fontWeight: 800, color: h.color, fontFamily: "'Inconsolata',monospace", minWidth: "60px" }}>{h.label}</div>
                <div style={{ fontSize: "12px", color: c.text }}>{h.desc}</div>
              </div>
            ))}
          </div>}

          {/* Freight routes */}
          {cur.routes && <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 0" }}>
            {cur.routes.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "6px" }}>
                <div style={{ fontSize: "28px", width: "40px", textAlign: "center" }}>{r.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: c.text }}>{r.name}</div>
                  <div style={{ fontSize: "10px", color: c.dim, marginTop: "2px" }}>{r.best}</div>
                </div>
                <div style={{ padding: "4px 10px", background: c.goldBg, border: "1px solid " + c.gold + "44", borderRadius: "4px", fontSize: "10px", color: c.gold, fontWeight: 600, fontFamily: "'Inconsolata',monospace", whiteSpace: "nowrap" }}>{r.time}</div>
              </div>
            ))}
          </div>}

          {/* Quick tips grid */}
          {cur.quickTips && <div className="guide-tips-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", padding: "8px 0" }}>
            {cur.quickTips.map((t, i) => (
              <div key={i} style={{ padding: "12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "6px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
                <div style={{ fontSize: "18px", flexShrink: 0 }}>{t.emoji}</div>
                <div style={{ fontSize: "11px", color: c.text, lineHeight: 1.5 }}>{t.text}</div>
              </div>
            ))}
          </div>}

          {/* Tip callout */}
          {cur.tip && <div style={{ marginTop: "16px", padding: "12px 16px", background: c.greenBg, border: "1px solid " + c.green + "33", borderRadius: "6px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <span style={{ fontSize: "14px", flexShrink: 0 }}>{"\ud83d\udca1"}</span>
            <div style={{ fontSize: "11px", color: c.green, lineHeight: 1.5 }}>{cur.tip}</div>
          </div>}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px", padding: "0 4px" }}>
        <button onClick={prev} disabled={guideStep === 0} style={{ padding: "10px 20px", borderRadius: "6px", cursor: guideStep === 0 ? "default" : "pointer", background: "transparent", border: "1px solid " + (guideStep === 0 ? c.border : c.border2), color: guideStep === 0 ? c.dimmest : c.dim, fontFamily: "'Inconsolata',monospace", fontSize: "11px", fontWeight: 600, transition: "all 0.2s" }}>{"\u2190"} BACK</button>
        <div style={{ display: "flex", gap: "4px" }}>
          {GUIDE_STEPS.map((_, i) => (<div key={i} onClick={() => goTo(i)} style={{ width: i === guideStep ? "20px" : "6px", height: "6px", borderRadius: "3px", cursor: "pointer", background: i === guideStep ? c.gold : guideDone.has(i) ? c.green : c.border2, transition: "all 0.3s ease" }} />))}
        </div>
        <button onClick={next} disabled={guideStep === GUIDE_STEPS.length - 1} style={{ padding: "10px 20px", borderRadius: "6px", cursor: guideStep === GUIDE_STEPS.length - 1 ? "default" : "pointer", background: guideStep === GUIDE_STEPS.length - 1 ? c.border : c.gold, border: "none", color: guideStep === GUIDE_STEPS.length - 1 ? c.dimmest : c.btnText, fontFamily: "'Inconsolata',monospace", fontSize: "11px", fontWeight: 700, transition: "all 0.2s", letterSpacing: "0.5px" }}>{guideStep === GUIDE_STEPS.length - 1 ? "YOU'RE SET! \u2728" : "NEXT \u2192"}</button>
      </div>

      {/* Quick jump */}
      <div style={{ marginTop: "28px", padding: "16px 20px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "8px" }}>
        <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1.5px", marginBottom: "10px" }}>JUMP TO</div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {GUIDE_STEPS.map((s, i) => (<button key={s.id} onClick={() => goTo(i)} style={{ padding: "6px 12px", borderRadius: "4px", cursor: "pointer", background: i === guideStep ? c.gold : "transparent", color: i === guideStep ? c.btnText : c.dim, border: "1px solid " + (i === guideStep ? c.gold : c.border2), fontFamily: "'Inconsolata',monospace", fontSize: "10px", transition: "all 0.15s" }}>{s.icon} {s.title}</button>))}
        </div>
      </div>
    </div>
  );
}

export { GUIDE_STEPS, BandarGuide };

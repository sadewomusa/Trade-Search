import { marginColor, fmtAED } from "../helpers";

export const Badge = ({ text, color = "#2EAA5A", bg = "#0D2E1A" }) => <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "3px", fontSize: "10px", fontFamily: "monospace", background: bg, color, border: "1px solid " + color + "33" }}>{text}</span>;

export const Spinner = () => <div style={{ width: "14px", height: "14px", border: "2px solid #C9A84C", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />;

export const ConfidenceBadge = ({ confidence, c }) => {
  if (!confidence) return null;
  const color = confidence.level === "high" ? c.green : confidence.level === "medium" ? c.darkGold : c.red;
  return <span style={{ fontSize: "9px", fontWeight: 700, color, padding: "1px 5px", borderRadius: "3px", border: "1px solid " + color + "44", fontFamily: "monospace" }}>{confidence.score}/100</span>;
};

export const WaveStatusBar = ({ waves, c }) => {
  if (!waves?.length) return null;
  return (<div style={{ marginBottom: "12px", padding: "10px 12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px" }}>
    <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "6px", textTransform: "uppercase" }}>SEARCH WAVES</div>
    {waves.map((w, i) => {
      const icon = w.status === "ok" ? "\u2713" : w.status === "skip" ? "\u2014" : w.status === "empty" ? "\u25cb" : "\u2717";
      const wColor = w.status === "ok" ? c.green : w.status === "skip" ? c.dimmer : w.status === "empty" ? c.darkGold : c.red;
      return (<div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", fontSize: "11px" }}>
        <span style={{ color: wColor, fontWeight: 700, width: "14px", textAlign: "center" }}>{icon}</span>
        <span style={{ color: c.text, minWidth: "120px" }}>{w.name}</span>
        <span style={{ color: w.count > 0 ? c.green : c.dimmer, fontWeight: 600 }}>{w.count} results</span>
        {w.reason && <span style={{ color: c.dim, fontSize: "10px", fontStyle: "italic" }}>{w.reason}</span>}
      </div>);
    })}
  </div>);
};

export const ProductTable = ({ products, validatingIdx, validationResults, onValidate, showSubcat, showSignal, maxRows = 200, c, dark }) => (
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

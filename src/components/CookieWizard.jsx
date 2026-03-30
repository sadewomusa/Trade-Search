import { useState } from "react";

export default function CookieWizard({ c, onSave, onClose }) {
  const [step, setStep] = useState(0);
  const [pasted, setPasted] = useState("");
  const isValid = pasted.trim().startsWith("[") && pasted.trim().endsWith("]");
  const hasContent = pasted.trim().length > 5;
  const steps = [
    { title: "Open Shopee in Edge", body: "Open Microsoft Edge, go to shopee.co.id, and log in with your Shopee account." },
    { title: "Open EditThisCookie", body: "Click the cookie icon in your Edge toolbar. Install EditThisCookie v3 from Chrome Web Store if needed." },
    { title: "Export the Cookie", body: "Click the Export button (5th icon from left). Your clipboard now has the cookie." },
    { title: "Paste it here", body: null }
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ width: "520px", maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto", background: c.surface, border: "1px solid " + c.border2, borderRadius: "8px", padding: "28px" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ fontFamily: "'Lora',serif", fontSize: "20px", color: c.gold, margin: 0 }}>{"\ud83c\udf6a"} Shopee Cookie Setup</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: c.dim, fontSize: "18px", cursor: "pointer" }}>{"\u2715"}</button>
        </div>
        {/* Step indicators */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "24px", gap: "4px" }}>
          {steps.map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", flex: i < 3 ? 1 : 0 }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: i <= step ? c.gold : "transparent", color: i <= step ? c.btnText : c.dimmer, border: "2px solid " + (i <= step ? c.gold : c.border2), fontSize: "12px", fontWeight: 700, fontFamily: "monospace", flexShrink: 0 }}>{i + 1}</div>
              {i < 3 && <div style={{ flex: 1, height: "2px", background: i < step ? c.gold : c.border2, margin: "0 6px" }} />}
            </div>
          ))}
        </div>
        {/* Step content */}
        <div style={{ padding: "16px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "6px", marginBottom: "20px", minHeight: "120px" }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: c.gold, marginBottom: "10px", fontFamily: "monospace" }}>{steps[step].title}</div>
          {step < 3 && <div style={{ fontSize: "13px", color: c.text, lineHeight: 1.7 }}>{steps[step].body}</div>}
          {step === 3 && <div>
            <textarea value={pasted} onChange={e => setPasted(e.target.value)} placeholder="Paste cookie JSON here..." style={{ width: "100%", minHeight: "120px", padding: "10px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "11px", borderRadius: "4px", outline: "none", resize: "vertical" }} />
            {hasContent && <div style={{ marginTop: "8px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
              {isValid ? <><span style={{ color: c.green }}>{"\u2713"}</span><span style={{ color: c.green }}>Looks good</span></> : <><span style={{ color: c.red }}>{"\u2717"}</span><span style={{ color: c.red }}>Doesn't look right</span></>}
            </div>}
          </div>}
        </div>
        {/* Navigation */}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button onClick={() => step > 0 && setStep(step - 1)} style={{ padding: "8px 20px", background: "transparent", color: step > 0 ? c.dim : c.dimmest, border: "1px solid " + (step > 0 ? c.border2 : c.border), borderRadius: "4px", cursor: step > 0 ? "pointer" : "default", fontFamily: "monospace", fontSize: "11px" }}>{"< BACK"}</button>
          {step < 3 ? (
            <button onClick={() => setStep(step + 1)} style={{ padding: "8px 24px", background: c.gold, color: c.btnText, border: "none", borderRadius: "4px", cursor: "pointer", fontFamily: "monospace", fontSize: "11px", fontWeight: 700 }}>{"NEXT >"}</button>
          ) : (
            <button onClick={() => { if (isValid) { onSave(pasted.trim()); onClose(); } }} disabled={!isValid} style={{ padding: "8px 24px", background: isValid ? c.green : c.dimmest, color: "#fff", border: "none", borderRadius: "4px", cursor: isValid ? "pointer" : "default", fontFamily: "monospace", fontSize: "11px", fontWeight: 700, opacity: isValid ? 1 : 0.4 }}>{"\ud83c\udf6a SAVE"}</button>
          )}
        </div>
      </div>
    </div>
  );
}

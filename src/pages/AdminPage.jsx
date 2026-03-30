import { Badge } from "../components/SharedUI";
import { TIER_LIMITS, getStyles } from "../constants";

export default function AdminPage({
  c, dark,
  adminUsers, adminSearches, adminRates, adminLoading,
  adminSubTab, setAdminSubTab,
  inviteEmail, setInviteEmail, invitePassword, setInvitePassword,
  inviteRole, setInviteRole, inviteMsg, setInviteMsg,
  loadAdminUsers, loadAdminSearches, loadAdminRates,
  updateUserRole, createInviteAccount, deleteUser,
  userId,
}) {
  const { secStyle, btnStyle, btnGreen, inputStyle } = getStyles(c);

  return (
    <div style={secStyle}>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
        {["users", "searches", "rates"].map(t => (
          <button key={t} onClick={() => setAdminSubTab(t)} style={{ padding: "6px 14px", background: adminSubTab === t ? c.gold : "transparent", color: adminSubTab === t ? c.btnText : c.dim, border: "1px solid " + (adminSubTab === t ? c.gold : c.border2), borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "10px", textTransform: "uppercase" }}>{t}</button>
        ))}
      </div>

      {/* Users sub-tab */}
      {adminSubTab === "users" && <div>
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", flexWrap: "wrap" }}>
          <button onClick={loadAdminUsers} style={{ ...btnGreen, padding: "8px 16px", fontSize: "10px" }}>LOAD USERS</button>
          <span style={{ fontSize: "10px", color: c.dim, paddingTop: "10px" }}>{adminUsers.length} users</span>
        </div>

        {/* Invite new user */}
        <div style={{ padding: "12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px", marginBottom: "12px" }}>
          <div style={{ fontSize: "9px", color: c.dimmer, letterSpacing: "1px", marginBottom: "8px" }}>INVITE NEW USER</div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Email" style={{ ...inputStyle, width: "200px", padding: "6px 8px", fontSize: "11px" }} />
            <input value={invitePassword} onChange={e => setInvitePassword(e.target.value)} placeholder="Password" type="text" style={{ ...inputStyle, width: "120px", padding: "6px 8px", fontSize: "11px" }} />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ ...inputStyle, width: "100px", padding: "6px 8px", fontSize: "11px" }}>
              {Object.entries(TIER_LIMITS).filter(([k]) => k !== "free").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button onClick={createInviteAccount} style={{ ...btnGreen, padding: "6px 14px", fontSize: "10px" }}>CREATE</button>
          </div>
          {inviteMsg && <div style={{ marginTop: "6px", fontSize: "10px", color: inviteMsg.startsWith("Error") ? c.red : c.green }}>{inviteMsg}</div>}
        </div>

        {/* User list */}
        {adminUsers.length > 0 && <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.5fr 0.5fr 0.8fr 0.6fr", gap: "6px", padding: "6px 0", borderBottom: "1px solid " + c.border2, fontSize: "9px", color: c.dimmer, textTransform: "uppercase", minWidth: "600px" }}>
            <div>Email</div><div>Role</div><div>Lookups</div><div>Margins</div><div>Joined</div><div>Actions</div>
          </div>
          {adminUsers.map(u => {
            const limits = TIER_LIMITS[u.role] || TIER_LIMITS.free;
            return (
              <div key={u.id} style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.5fr 0.5fr 0.8fr 0.6fr", gap: "6px", padding: "7px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", alignItems: "center", minWidth: "600px" }}>
                <div style={{ color: c.text, overflow: "hidden", textOverflow: "ellipsis" }}>{u.email}</div>
                <div>
                  <select value={u.role || "registered"} onChange={e => updateUserRole(u.id, e.target.value)} style={{ background: c.input, color: c.text, border: "1px solid " + c.border2, borderRadius: "3px", padding: "2px 4px", fontSize: "10px", fontFamily: "monospace" }}>
                    {Object.entries(TIER_LIMITS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div style={{ color: c.dim, fontSize: "10px" }}>{u.lookups_used || 0}/{limits.lookups}</div>
                <div style={{ color: c.dim, fontSize: "10px" }}>{u.margins_used || 0}/{limits.margins}</div>
                <div style={{ color: c.dimmest, fontSize: "9px" }}>{u.created_at?.slice(0, 10) || ""}</div>
                <div>{u.id !== userId && <button onClick={() => deleteUser(u.id, u.email)} style={{ padding: "2px 6px", background: "transparent", color: c.red, border: "1px solid " + c.red + "44", borderRadius: "3px", cursor: "pointer", fontFamily: "monospace", fontSize: "8px" }}>DEL</button>}</div>
              </div>
            );
          })}
        </div>}
      </div>}

      {/* Searches sub-tab */}
      {adminSubTab === "searches" && <div>
        <button onClick={loadAdminSearches} style={{ ...btnGreen, padding: "8px 16px", fontSize: "10px", marginBottom: "12px" }}>LOAD SEARCHES</button>
        {adminSearches.length > 0 && <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 0.6fr 0.5fr 0.6fr 0.8fr", gap: "6px", padding: "6px 0", borderBottom: "1px solid " + c.border2, fontSize: "9px", color: c.dimmer, textTransform: "uppercase", minWidth: "500px" }}>
            <div>Product</div><div>Type</div><div>AED</div><div>Margin</div><div>Date</div>
          </div>
          {adminSearches.map(s => (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: "2fr 0.6fr 0.5fr 0.6fr 0.8fr", gap: "6px", padding: "7px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", minWidth: "500px" }}>
              <div style={{ color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.product_name || "—"}</div>
              <div><Badge text={s.search_type || ""} color={c.gold} bg={dark ? "#2A2210" : "#FDF8ED"} /></div>
              <div style={{ color: c.gold }}>{s.uae_price_aed ? "AED " + s.uae_price_aed : "—"}</div>
              <div style={{ color: s.margin_pct >= 40 ? c.green : s.margin_pct >= 20 ? c.gold : c.red, fontWeight: 700 }}>{s.margin_pct != null ? s.margin_pct.toFixed(0) + "%" : "—"}</div>
              <div style={{ color: c.dimmest, fontSize: "9px" }}>{s.created_at?.slice(0, 10) || ""}</div>
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
    </div>
  );
}

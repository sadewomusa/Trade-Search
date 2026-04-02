import { Badge } from '../components/SharedUI.jsx';
import { marginColor, fmtIDR } from '../helpers.js';

export default function AdminPage({
  c, dark, secStyle, inputStyle, btnStyle, btnSec, btnGreen,
  isAdmin,
  adminSubTab, setAdminSubTab,
  adminUsers, loadAdminUsers,
  adminSearches, loadAdminSearches,
  adminRates, loadAdminRates,
  updateUserRole, deleteUser,
  inviteEmail, setInviteEmail,
  invitePassword, setInvitePassword,
  inviteRole, setInviteRole,
  inviteMsg, setInviteMsg,
  createInviteAccount,
  resetUserQuota,
}) {
  return <div style={secStyle}>
        {/* Sub-tab bar */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "16px" }}>
          {[{ id: "users", label: "\ud83d\udc65 Users" }, { id: "searches", label: "\ud83d\udd0d Harvest" }, { id: "rates", label: "\ud83d\udea2 Rates" }].map(t => (
            <button key={t.id} onClick={() => { setAdminSubTab(t.id); if (t.id === "users" && !adminUsers.length) loadAdminUsers(); if (t.id === "searches" && !adminSearches.length) loadAdminSearches(); if (t.id === "rates" && !adminRates.length) loadAdminRates(); }} style={{ padding: "8px 14px", background: adminSubTab === t.id ? c.gold : "transparent", color: adminSubTab === t.id ? c.btnText : c.dim, border: "1px solid " + (adminSubTab === t.id ? c.gold : c.border2), borderRadius: "4px", cursor: "pointer", fontFamily: "monospace", fontSize: "11px", fontWeight: adminSubTab === t.id ? 700 : 400 }}>{t.label}</button>
          ))}
          <button onClick={() => { loadAdminUsers(); loadAdminSearches(); loadAdminRates(); }} style={{ ...btnSec, padding: "8px 12px", fontSize: "9px", marginLeft: "auto" }}>{"\u21bb"} REFRESH</button>
        </div>

        {/* Users sub-tab */}
        {adminSubTab === "users" && <div>
          {/* ── Create Account ── */}
          <div style={{ marginBottom: "16px", padding: "12px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "4px" }}>
            <div style={{ fontSize: "9px", color: c.gold, letterSpacing: "1px", fontWeight: 700, marginBottom: "8px" }}>{"\ud83d\udc64"} CREATE ACCOUNT</div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "8px" }}>
              <input type="email" value={inviteEmail} onChange={e => { setInviteEmail(e.target.value); setInviteMsg(""); }} placeholder="Email" style={{ ...inputStyle, flex: "1 1 140px", padding: "6px 8px", fontSize: "11px" }} />
              <input type="text" value={invitePassword} onChange={e => { setInvitePassword(e.target.value); setInviteMsg(""); }} placeholder="Password (6+)" style={{ ...inputStyle, flex: "1 1 100px", padding: "6px 8px", fontSize: "11px" }} />
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ ...inputStyle, width: "auto", padding: "6px 8px", fontSize: "11px" }}>
                <option value="free">Free</option>
                <option value="registered">Registered</option>
                <option value="vip">VIP (30/30)</option>
                <option value="paid">Paid</option>
              </select>
              <button onClick={createInviteAccount} style={{ ...btnGreen, padding: "6px 14px", fontSize: "10px" }}>CREATE</button>
            </div>
            {inviteMsg && <div style={{ fontSize: "10px", color: inviteMsg.startsWith("Error") || inviteMsg.startsWith("Email") || inviteMsg.startsWith("Password") ? c.red : inviteMsg.startsWith("Creating") ? c.gold : c.green, lineHeight: 1.5 }}>{inviteMsg}</div>}
            <div style={{ fontSize: "8px", color: c.dimmest, marginTop: "4px" }}>Create an account for someone — share the email/password with them. You can change or revoke their role anytime.</div>
          </div>

          <div style={{ fontSize: "10px", color: c.dimmer, marginBottom: "8px" }}>{adminUsers.length} users</div>
          {adminUsers.length === 0 && <button onClick={loadAdminUsers} style={{ ...btnGreen, padding: "8px 16px", fontSize: "10px" }}>LOAD USERS</button>}
          {adminUsers.length > 0 && <div style={{ overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.6fr 0.6fr 0.8fr 0.6fr", gap: "6px", padding: "6px 0", borderBottom: "1px solid " + c.border2, fontSize: "9px", color: c.dimmer, textTransform: "uppercase", minWidth: "550px" }}>
              <div>Email</div><div>Role</div><div>Lookups</div><div>Margins</div><div>Joined</div><div></div>
            </div>
            {adminUsers.map(u => (
              <div key={u.id} style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.6fr 0.6fr 0.8fr 0.6fr", gap: "6px", padding: "8px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", alignItems: "center", minWidth: "550px" }}>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.email}
                  {u.display_name && <span style={{ color: c.dimmest }}>{" \u00b7 "}{u.display_name}</span>}
                </div>
                <div>
                  <select value={u.role} onChange={e => updateUserRole(u.id, e.target.value)} style={{ background: c.input, color: u.role === "admin" ? c.red : u.role === "paid" ? c.gold : u.role === "vip" ? "#9333EA" : c.text, border: "1px solid " + c.border2, borderRadius: "3px", padding: "2px 4px", fontSize: "10px", fontFamily: "monospace", cursor: "pointer" }}>
                    <option value="free">Free</option>
                    <option value="registered">Registered</option>
                    <option value="vip">VIP</option>
                    <option value="paid">Paid</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div style={{ color: c.gold, fontSize: "10px" }}>{u.lookups_used || 0}</div>
                <div style={{ color: c.gold, fontSize: "10px" }}>{u.margins_used || 0}</div>
                <div style={{ color: c.dimmest, fontSize: "9px" }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "\u2014"}</div>
                <div style={{ display: "flex", gap: "3px" }}>{u.role !== "admin" && <><button onClick={() => resetUserQuota(u.id, u.email)} title="Reset quota" style={{ padding: "2px 6px", fontSize: "8px", fontFamily: "monospace", cursor: "pointer", background: "transparent", color: c.gold, border: "1px solid " + c.gold + "44", borderRadius: "2px" }}>{"\u21bb"}</button><button onClick={() => deleteUser(u.id, u.email)} style={{ padding: "2px 6px", fontSize: "8px", fontFamily: "monospace", cursor: "pointer", background: "transparent", color: c.red, border: "1px solid " + c.red + "44", borderRadius: "2px" }}>{"\u2715"}</button></>}</div>
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
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.6fr 0.7fr 0.8fr 0.7fr 0.8fr", gap: "6px", padding: "6px 0", borderBottom: "1px solid " + c.border2, fontSize: "9px", color: c.dimmer, textTransform: "uppercase", minWidth: "550px" }}>
              <div>Route</div><div>Mode</div><div>Rate</div><div>Transit</div><div>Congestion</div><div>Valid Until</div>
            </div>
            {adminRates.map(r => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.6fr 0.7fr 0.8fr 0.7fr 0.8fr", gap: "6px", padding: "7px 0", borderBottom: "1px solid " + c.border, fontSize: "11px", minWidth: "550px" }}>
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
  </div>;
}

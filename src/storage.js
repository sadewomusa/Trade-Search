import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants";
import { compressEntry, expandEntry } from "./helpers";

const supabaseReady = SUPABASE_URL !== "https://YOUR-PROJECT-ID.supabase.co" && SUPABASE_ANON_KEY !== "eyJ...your-anon-key-here...";
let _authTokenForStorage = "";

export function setStorageAuthToken(token) { _authTokenForStorage = token; }

export async function supabaseGet(key) {
  if (!supabaseReady) return null;
  const token = _authTokenForStorage || SUPABASE_ANON_KEY;
  const r = await fetch(SUPABASE_URL + "/rest/v1/kv_store?key=eq." + encodeURIComponent(key) + "&select=value", { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token } });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.length ? JSON.parse(rows[0].value) : null;
}

export async function supabaseSet(key, val) {
  if (!supabaseReady) return false;
  const token = _authTokenForStorage || SUPABASE_ANON_KEY;
  const r = await fetch(SUPABASE_URL + "/rest/v1/kv_store", { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key, value: JSON.stringify(val), updated_at: new Date().toISOString() }) });
  return r.ok;
}

export async function storeGet(key) {
  try { const v = await supabaseGet(key); if (v !== null) { try { localStorage.setItem("gt:" + key, JSON.stringify(v)); } catch {} return v; } } catch {}
  try { const v = localStorage.getItem("gt:" + key); return v ? JSON.parse(v) : null; } catch { return null; }
}

export async function storeSet(key, val) {
  try { localStorage.setItem("gt:" + key, JSON.stringify(val)); } catch {}
  try { return await supabaseSet(key, val); } catch { return false; }
}

export async function loadHistory(pin) {
  try { const d = await storeGet(pin + ":history"); return d?.length ? d.map(expandEntry) : []; } catch { return []; }
}

export async function saveHistory(pin, h) {
  try { return await storeSet(pin + ":history", h.map(compressEntry)); } catch { return false; }
}

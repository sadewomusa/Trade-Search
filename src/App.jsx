import { useState, useEffect, useCallback, useRef } from "react";
import {
  SUPABASE_URL, SUPABASE_ANON_KEY, DEFAULT_FX, DEFAULT_FREIGHT, CUSTOMS_DUTY, LAST_MILE_AED,
  MARGIN_THRESHOLD, WEIGHT_KG, VOLUME_CBM, FREIGHT_MODES, ROUTES, TIER_LIMITS, DISPOSABLE_DOMAINS,
  WORKER_URL, STATUS_COLORS, STATUS_COLORS_LIGHT, MAX_HISTORY, FX_CACHE_MS, AMAZON_AE_DEPTS,
  BRAND_BLOCKLIST_DEFAULT, INDO_SIGNAL_WORDS, DEFAULT_KEYWORDS
} from './constants.js';
import {
  marginColor, fmtIDR, fmtAED, fmtUSD, escapeHtml, sanitizeIDR, computeConfidence,
  guessCategory, fallbackSearchQueries, isBrandBlocked, getIndoSignalScore,
  detectBlockedSignals, EN_TO_ID
} from './helpers.js';
import {
  supabaseReady, setStorageAuthToken, storeGet, storeSet,
  compressEntry, expandEntry, loadHistory, saveHistory
} from './storage.js';
import { Badge, Spinner, ConfidenceBadge, WaveStatusBar } from './components/SharedUI.jsx';
import CookieWizard from './components/CookieWizard.jsx';
import { GUIDE_STEPS, BandarGuide } from './pages/GuidePage.jsx';
import BrainstormPage from './pages/BrainstormPage.jsx';
import DiscoverPage from './pages/DiscoverPage.jsx';
import LookupPage from './pages/LookupPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import DeepDivePage from './pages/DeepDivePage.jsx';

// ══════════ MAIN APP ══════════
export default function App() {
  // ── Auth State ──
  const [authUser, setAuthUser] = useState(null); // { id, email }
  const [authToken, setAuthToken] = useState("");
  const [authMode, setAuthMode] = useState("login"); // "login" | "register" | "reset"
  const [authEmail, setAuthEmail] = useState(() => localStorage.getItem("gt_remember_email") || "");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem("gt_remember_email"));
  const [authNewPassword, setAuthNewPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
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
  const [baseBrands, setBaseBrands] = useState([...BRAND_BLOCKLIST_DEFAULT]);
  const [customBrands, setCustomBrands] = useState([]);
  const [showBrandList, setShowBrandList] = useState(false);
  const [newBrandInput, setNewBrandInput] = useState("");
  const [brandSearchFilter, setBrandSearchFilter] = useState("");
  const allBrands = [...new Set([...baseBrands, ...customBrands])];

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
  const [marginScenario, setMarginScenario] = useState("A"); // "A" = link price vs indo, "B" = regional similar avg/med vs indo
  const [scenarioBData, setScenarioBData] = useState(null); // { uaeMedian, uaeAverage, source, count }
  const [scenarioBLoading, setScenarioBLoading] = useState(false);

  // Deep Dive shared state (passed from Discover or Lookup)
  const [deepDiveEntry, setDeepDiveEntry] = useState(null);
  // { source: "discover", selectedProducts: [...] }
  // { source: "lookup", anchorProduct: {...}, indonesianResults: [...] | null }
  // null = standalone mode

  const [qty, setQty] = useState(1);
  const [freightMode, setFreightMode] = useState("air");
  const [qtyMode, setQtyMode] = useState("unit");
  const [waveStatus, setWaveStatus] = useState([]);
  const [lookupView, setLookupView] = useState("landing"); // "landing" | "scrape" | "results"
  const [marginAnalysisLoading, setMarginAnalysisLoading] = useState(false);

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
  const [discViewMode, setDiscViewMode] = useState("card"); // "card" | "list"
  const [discSelected, setDiscSelected] = useState(new Set()); // Set of ASIN strings
  const [discQuickFilter, setDiscQuickFilter] = useState("");
  const [discPriceMin, setDiscPriceMin] = useState("");
  const [discPriceMax, setDiscPriceMax] = useState("");
  const [discPreviewCache, setDiscPreviewCache] = useState({}); // { asin: productData }
  const [discPreviewOpen, setDiscPreviewOpen] = useState(null); // asin or null
  const [discPreviewLoading, setDiscPreviewLoading] = useState(false);

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
  const apifyAbortRef = useRef(false);
  const apifyPauseRef = useRef(false);
  const [apifyPaused, setApifyPaused] = useState(false);
  const [streamingResults, setStreamingResults] = useState([]);
  const streamingResultsRef = useRef([]);

  // Admin state
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminSearches, setAdminSearches] = useState([]);
  const [adminRates, setAdminRates] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState("users"); // users | searches | rates
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState("vip");
  const [inviteMsg, setInviteMsg] = useState("");

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
      if (rememberMe) { localStorage.setItem("gt_remember_email", authEmail); } else { localStorage.removeItem("gt_remember_email"); }
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

  const handleResetPassword = async () => {
    if (!authNewPassword || authNewPassword.length < 6) { setAuthError("New password must be 6+ characters"); return; }
    setAuthLoading(true); setAuthError("");
    try {
      const r = await fetch(SUPABASE_URL + "/auth/v1/user", {
        method: "PUT",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + resetToken, "Content-Type": "application/json" },
        body: JSON.stringify({ password: authNewPassword })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.msg || data.error_description || "Reset failed");
      setAuthError("Password updated! You can now log in.");
      setAuthMode("login");
      setResetToken("");
      setAuthNewPassword("");
    } catch (e) { setAuthError(e.message); }
    setAuthLoading(false);
  };

  const handleSignOut = async () => {
    try { await fetch(SUPABASE_URL + "/auth/v1/logout", { method: "POST", headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + authToken } }); } catch {}
    localStorage.removeItem("gt_token");
    localStorage.removeItem("gt_refresh");
    // Clear all user-specific cached data
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("gt:") && !k.startsWith("gt:global:")) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    setAuthUser(null); setAuthToken(""); setUserProfile(null);
    setHistory([]); setStorageReady(false);
    window.location.reload();
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
      // Try PATCH first (normal case)
      const r = await fetch(SUPABASE_URL + "/rest/v1/profiles?id=eq." + uid, {
        method: "PATCH",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + authToken, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ role: newRole })
      });
      // If PATCH didn't match any rows, try upsert (profile row might not exist yet)
      if (!r.ok || r.status === 404) {
        const user = adminUsers.find(u => u.id === uid);
        await fetch(SUPABASE_URL + "/rest/v1/profiles", {
          method: "POST",
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + authToken, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ id: uid, email: user?.email || "", role: newRole, lookups_used: 0, margins_used: 0 })
        });
      }
      await loadAdminUsers();
    } catch (e) { addDiag("error", "admin", "Update role failed: " + e.message); }
  };

  const createInviteAccount = async () => {
    if (!inviteEmail || !invitePassword) { setInviteMsg("Email and password required"); return; }
    if (invitePassword.length < 6) { setInviteMsg("Password must be 6+ characters"); return; }
    setInviteMsg("Creating...");
    try {
      // Use worker to create user via Supabase Admin API (service_role key, auto-confirms email)
      const result = await workerCall("admin_create_user", { email: inviteEmail, password: invitePassword, role: inviteRole });
      const newUserId = result.user?.id || result.id;
      if (!newUserId) throw new Error("No user ID returned. Check worker logs.");
      // Ensure profile row exists with correct role
      await fetch(SUPABASE_URL + "/rest/v1/profiles", {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + authToken, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ id: newUserId, email: inviteEmail, role: inviteRole, lookups_used: 0, margins_used: 0 })
      });
      setInviteMsg("Account created: " + inviteEmail + " (" + inviteRole.toUpperCase() + "). No confirmation needed — share credentials directly.");
      setInviteEmail(""); setInvitePassword("");
      await loadAdminUsers();
    } catch (e) { setInviteMsg("Error: " + e.message); }
  };

  const deleteUser = async (uid, email) => {
    if (!authToken || !isAdmin) return;
    if (uid === userId) { alert("You cannot delete your own account."); return; }
    if (!confirm("Permanently delete " + email + "?\n\nThis removes their account, profile, and all stored data. This cannot be undone.")) return;
    try {
      await workerCall("admin_delete_user", { userId: uid });
      addDiag("ok", "admin", "Deleted user: " + email);
      await loadAdminUsers();
    } catch (e) {
      addDiag("error", "admin", "Delete user failed: " + e.message);
      alert("Delete failed: " + e.message);
    }
  };

  const resetUserQuota = async (uid, email) => {
    if (!authToken || !isAdmin) return;
    if (!confirm("Reset quota for " + email + "?\n\nThis sets lookups_used and margins_used back to 0.")) return;
    try {
      const r = await fetch(SUPABASE_URL + "/rest/v1/profiles?id=eq." + uid, {
        method: "PATCH",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + authToken, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ lookups_used: 0, margins_used: 0 })
      });
      if (!r.ok) throw new Error("PATCH failed: " + r.status);
      addDiag("ok", "admin", "Reset quota for: " + email);
      await loadAdminUsers();
    } catch (e) {
      addDiag("error", "admin", "Reset quota failed: " + e.message);
      alert("Reset failed: " + e.message);
    }
  };

  // ── Init: restore session from stored tokens, only clear on explicit logout ──
  useEffect(() => { (async () => {
    const t = await storeGet("global:theme"); if (t === "light") setDark(false);
    // BUG FIX: Restore session from stored tokens instead of clearing them
    const storedToken = localStorage.getItem("gt_token");
    const storedRefresh = localStorage.getItem("gt_refresh");
    if (storedToken) {
      try {
        // Verify the token is still valid by fetching user info
        const r = await fetch(SUPABASE_URL + "/auth/v1/user", {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + storedToken }
        });
        if (r.ok) {
          const user = await r.json();
          if (user?.id) {
            setAuthToken(storedToken);
            setAuthUser(user);
            setStorageAuthToken(storedToken);
            await loadProfile(user.id, storedToken);
          } else {
            // Token returned but no user — clear
            localStorage.removeItem("gt_token");
            localStorage.removeItem("gt_refresh");
          }
        } else if (storedRefresh) {
          // Token expired — try refresh
          const rr = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=refresh_token", {
            method: "POST",
            headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: storedRefresh })
          });
          if (rr.ok) {
            const data = await rr.json();
            if (data.access_token) {
              localStorage.setItem("gt_token", data.access_token);
              localStorage.setItem("gt_refresh", data.refresh_token || storedRefresh);
              setAuthToken(data.access_token);
              setAuthUser(data.user);
              setStorageAuthToken(data.access_token);
              await loadProfile(data.user.id, data.access_token);
            }
          } else {
            localStorage.removeItem("gt_token");
            localStorage.removeItem("gt_refresh");
          }
        } else {
          localStorage.removeItem("gt_token");
          localStorage.removeItem("gt_refresh");
        }
      } catch (e) {
        console.warn("Session restore failed:", e);
        localStorage.removeItem("gt_token");
        localStorage.removeItem("gt_refresh");
      }
    }
    // Check for password reset token in URL
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      const params = new URLSearchParams(hash.replace("#", ""));
      const token = params.get("access_token");
      if (token) {
        setResetToken(token);
        setAuthMode("reset");
        // Clean the URL
        window.history.replaceState(null, "", window.location.pathname);
      }
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
        // Load admin-managed base brand blocklist (shared)
        const baseBl = await storeGet("global:brandlist_base");
        if (baseBl?.length) setBaseBrands(baseBl);
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
  // Auto-save base brand blocklist (admin-managed, shared globally)
  useEffect(() => { if (!storageReady || !isAdmin) return; const t = setTimeout(() => storeSet("global:brandlist_base", baseBrands), 1500); return () => clearTimeout(t); }, [baseBrands, storageReady, isAdmin]);
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

  // ══════════ GOOGLE TRANSLATE (via Worker) ══════════
  const translateProduct = async (productName, brand) => {
    try {
      // Strip brand from name for cleaner translation
      let cleanName = productName;
      if (brand) cleanName = cleanName.replace(new RegExp(brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "").trim();
      // Remove filler words but keep specs
      cleanName = cleanName.replace(/\b(for|with|and|the|a|an|in|of|by|from|on|to|is|it)\b/gi, "").replace(/\s{2,}/g, " ").replace(/,\s*$/, "").trim();
      addDiag("info", "translate", `Google Translate: "${cleanName.slice(0, 80)}"`);
      const res = await workerCall("translate", { text: cleanName, from: "en", to: "id" });
      if (res.translated) {
        addDiag("ok", "translate", `Result: "${res.translated.slice(0, 80)}"${res.source ? " (via " + res.source + ")" : ""}`);
        return res.translated;
      }
      addDiag("warn", "translate", "Empty translation result");
      return null;
    } catch (e) {
      addDiag("warn", "translate", `Google Translate failed: ${e.message}`);
      return null;
    }
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


  // Scenario B computed margins
  const scenarioBMargins = (scenarioBData && scenarioBData.uaeMedian > 0 && marginData) ? {
    medianVsMedIndo: calcMargin(scenarioBData.uaeMedian, 1, marginData.medianPriceIDR || 0, marginData.weightClass || "medium", freightMode),
    medianVsAvgIndo: calcMargin(scenarioBData.uaeMedian, 1, marginData.indoResults?.price_stats?.average_idr || 0, marginData.weightClass || "medium", freightMode),
    avgVsMedIndo: calcMargin(scenarioBData.uaeAverage, 1, marginData.medianPriceIDR || 0, marginData.weightClass || "medium", freightMode),
    avgVsAvgIndo: calcMargin(scenarioBData.uaeAverage, 1, marginData.indoResults?.price_stats?.average_idr || 0, marginData.weightClass || "medium", freightMode),
  } : null;

  // Dynamic display margins (recalc when freight toggle changes)
  const displayMargins = marginData ? {
    median: calcMargin(marginData.uaeProduct?.price_aed||0, marginData.uaeProduct?.pack_quantity||1, marginData.medianPriceIDR||0, marginData.weightClass||"medium", freightMode),
    best: calcMargin(marginData.uaeProduct?.price_aed||0, marginData.uaeProduct?.pack_quantity||1, marginData.lowestPriceIDR||0, marginData.weightClass||"medium", freightMode),
    worst: calcMargin(marginData.uaeProduct?.price_aed||0, marginData.uaeProduct?.pack_quantity||1, marginData.highestPriceIDR||0, marginData.weightClass||"medium", freightMode),
    average: calcMargin(marginData.uaeProduct?.price_aed||0, marginData.uaeProduct?.pack_quantity||1, marginData.indoResults?.price_stats?.average_idr||marginData.medianPriceIDR||0, marginData.weightClass||"medium", freightMode),
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
    if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(typeof d.error === "string" ? d.error : JSON.stringify(d).slice(0, 300) || "Worker error " + r.status); }
    return r.json();
  };

  // ── Launch Deep Dive from Discover ──
  const launchDeepDiveFromDiscover = () => {
    const selected = discAllProducts.filter(p => discSelected.has(p.asin));
    if (selected.length < 5) return;
    setDeepDiveEntry({
      source: "discover",
      selectedProducts: selected.map(p => ({
        asin: p.asin,
        title: p.title || p.name || "",
        price: p.price_aed || p.price || 0,
        rating: p.rating,
        image: p.image || p.thumbnail || "",
        sizeTag: extractSizeTag(p.title || p.name || ""),
      })),
    });
    setMode("deepdive");
  };

  // ── Launch Deep Dive from Lookup ──
  const launchDeepDiveFromLookup = () => {
    if (!dryRunData) return;
    setDeepDiveEntry({
      source: "lookup",
      anchorProduct: dryRunData,
      indonesianResults: indoResults || null,
    });
    setMode("deepdive");
  };

  // Size tag extractor (shared between Discover and Deep Dive)
  const extractSizeTag = (title) => {
    if (!title) return null;
    const match = title.match(/(\d+\.?\d*)\s*(ml|oz|fl\.?\s*oz|g|kg|mg|l|count|pack|pcs|capsules?|pods?|pieces?|ct)/i);
    return match ? `${match[1]}${match[2].toLowerCase().replace(/\s/g, '')}` : null;
  };

  // Inline preview fetcher for Discover/Deep Dive compact list
  const fetchProductPreview = async (asin) => {
    if (discPreviewCache[asin]) {
      setDiscPreviewOpen(discPreviewOpen === asin ? null : asin);
      return;
    }
    setDiscPreviewLoading(true);
    setDiscPreviewOpen(asin);
    try {
      const data = await workerCall("scrapingdog_product", { asin, domain: "ae" });
      setDiscPreviewCache(prev => ({ ...prev, [asin]: data }));
    } catch (e) {
      addDiag("error", "preview", "Failed to fetch " + asin + ": " + e.message);
    }
    setDiscPreviewLoading(false);
  };

  const runApifyActor = async (actorId, input, label, onPartialResults) => {
    setStage("Starting " + label + "...");
    addDiag("info", "apify", label + " input: " + JSON.stringify(input).slice(0, 300));
    const rd = await workerCall("apify_run", { actorId, input });
    addDiag("info", "apify", label + " run response: " + JSON.stringify(rd).slice(0, 300));
    const runId = rd.data?.id; if (!runId) throw new Error(label + " no run ID — response: " + JSON.stringify(rd).slice(0, 200));
    const dsId = rd.data?.defaultDatasetId;
    let status = "RUNNING", pc = 0, lastItemCount = 0;
    while (status === "RUNNING" || status === "READY") {
      if (pc > 60) throw new Error(label + " timeout");
      if (apifyAbortRef.current) { apifyAbortRef.current = false; break; }
      // Pause loop
      while (apifyPauseRef.current) {
        await wait(1000);
        if (apifyAbortRef.current) { apifyAbortRef.current = false; apifyPauseRef.current = false; break; }
      }
      await wait(5000); pc++;
      setStage(label + " (" + (pc * 5) + "s)"); setProgress(Math.min(90, pc * 3));
      // Stream partial results every 3 polls
      if (dsId && onPartialResults && pc % 3 === 0) {
        try {
          const partialItems = await workerCall("apify_dataset", { datasetId: dsId, limit: 150 });
          if (Array.isArray(partialItems) && partialItems.length > lastItemCount) {
            lastItemCount = partialItems.length;
            onPartialResults(partialItems);
          }
        } catch {}
      }
      try { const pr = await workerCall("apify_status", { runId }); status = pr.data?.status || "RUNNING"; } catch {}
    }
    if (!dsId) throw new Error(label + " no dataset");
    const items = await workerCall("apify_dataset", { datasetId: dsId, limit: 150 });
    addDiag("info", "apify", label + " dataset: " + (Array.isArray(items) ? items.length + " items" : "NOT array: " + JSON.stringify(items).slice(0, 200)));
    if (!Array.isArray(items)) { addDiag("warn", "apify", label + " unexpected response type: " + typeof items); return []; }
    return items;
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
      // Sold: Shopee actor uses salesCount, Toko uses stock.sold
      const soldRaw = i.salesCount || i.stock?.sold || i.sold || i.totalSold || i.historicalSold || i.item_basic?.sold || "";
      // Rating: Shopee actor uses rating directly
      const ratingRaw = i.rating || i.ratingAverage || i.star || i.item_rating?.rating_star || "";
      // Name: Shopee actor uses name, Toko uses title
      const nameRaw = i.name || i.title || i.productName || i.item_name || "";
      // Seller: Shopee actor uses location, Toko uses shopName
      const sellerRaw = i.shopName || i.sellerName || i.seller || i.shop?.name || i.location || "";
      // URL: both use url/link
      const urlRaw = i.url || i.link || i.productUrl || i.itemUrl || "";
      return { name: nameRaw, price_idr: Math.round(price), source: platform, seller: sellerRaw, sold: String(soldRaw), url: urlRaw, rating: ratingRaw };
    }).filter(r => r.price_idr >= 1000 && r.name)
      .filter(r => { const s = parseInt(r.sold) || 0; const rt = parseFloat(r.rating) || 0; return s > 0 || rt > 0; }) // Quality: must have sold OR rating
      .sort((a, b) => (parseInt(b.sold) || 0) - (parseInt(a.sold) || 0)) // Best sellers first
      .slice(0, 100); // Cap at 100 quality results
  };

  const runTokoApify = async (allQueries) => {
    const waves = [];
    const bahasaQueries = allQueries.filter(q => /[a-z]/.test(q) && !/^[a-zA-Z0-9\s,.\-()]+$/.test(q) || /kopi|biji|bubuk|kayu|bambu|rotan|kelapa|batu|minyak|sabun|teh|gula|coklat|kain|tas|mangkok/i.test(q));
    const queryArray = bahasaQueries.length > 0 ? bahasaQueries : allQueries;
    const tokoInput = { query: queryArray.slice(0, 5), limit: 30 };
    addDiag("info", "toko_apify", `Sending ${tokoInput.query.length} queries`, JSON.stringify(tokoInput.query));
    setStage("Exploring Source 1..."); setProgress(10);
    try {
      const onPartial = (partialItems) => {
        const partial = normalizeApifyResults(partialItems, "Tokopedia");
        if (partial.length > 0) setStreamingResults(prev => { const merged = [...prev]; partial.forEach(p => { if (!merged.find(m => m.name === p.name && m.price_idr === p.price_idr)) merged.push(p); }); streamingResultsRef.current = merged; return merged; });
      };
      const items = await runApifyActor(tokoActorId, tokoInput, "Source 1", onPartial);
      const results = normalizeApifyResults(items, "Tokopedia");
      addDiag(results.length > 0 ? "ok" : "warn", "toko_apify", `${items.length} raw → ${results.length} valid`);
      waves.push({ name: "Source 1", status: results.length > 0 ? "ok" : "empty", count: results.length });
      return { allResults: results, waves, source: "apify" };
    } catch (e) {
      addDiag("error", "toko_apify", typeof e === "object" ? (e.message || JSON.stringify(e)) : String(e));
      // Return streaming results if we have any (stopped early)
      const currentStreaming = streamingResultsRef.current;
      if (currentStreaming.length > 0) {
        const partial = currentStreaming.filter(r => r.source === "Tokopedia");
        waves.push({ name: "Source 1", status: partial.length > 0 ? "ok" : "fail", count: partial.length, reason: "Stopped early" });
        return { allResults: partial, waves, source: "apify" };
      }
      waves.push({ name: "Source 1", status: "fail", count: 0, reason: e.message });
      return { allResults: [], waves, source: "apify" };
    }
  };

  const runShopeeApify = async (allQueries) => {
    const waves = [];
    const mainQ = allQueries[0];

    const onPartial = (partialItems) => {
      const partial = normalizeApifyResults(partialItems, "Shopee");
      if (partial.length > 0) setStreamingResults(prev => { const merged = [...prev]; partial.forEach(p => { if (!merged.find(m => m.name === p.name && m.price_idr === p.price_idr)) merged.push(p); }); streamingResultsRef.current = merged; return merged; });
    };

    // Attempt 1: Apify actor (relevancy sort, moderate batch)
    const shopeeInput = { searchKeywords: allQueries.slice(0, 2), country: "ID", maxProducts: 30, scrapeMode: "fast", sortBy: "relevancy", shopeeCookies: shopeeCookie || "[]", proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "ID" } };
    addDiag("info", "shopee_apify", `Query: "${mainQ}" (attempt 1: relevancy, max30)`);
    setStage("Exploring Source 2..."); setProgress(10);
    try {
      const items = await runApifyActor(shopeeActorId, shopeeInput, "Source 2", onPartial);
      const results = normalizeApifyResults(items, "Shopee");
      if (results.length > 0) {
        addDiag("ok", "shopee_apify", `Attempt 1: ${items.length} raw → ${results.length} valid`);
        waves.push({ name: "Source 2", status: "ok", count: results.length });
        return { allResults: results, waves, source: "apify" };
      }
      addDiag("warn", "shopee_apify", `Attempt 1: 0 valid, retrying with sales sort + full mode...`);
    } catch (e) {
      addDiag("warn", "shopee_apify", `Attempt 1 failed: ${typeof e === "object" ? (e.message || JSON.stringify(e)) : String(e)}`);
      // Return streaming results if stopped early
      const currentStreaming = streamingResultsRef.current;
      if (currentStreaming.length > 0) {
        const partial = currentStreaming.filter(r => r.source === "Shopee");
        if (partial.length > 0) {
          waves.push({ name: "Source 2", status: "ok", count: partial.length, reason: "Stopped early" });
          return { allResults: partial, waves, source: "apify" };
        }
      }
    }

    // Attempt 2: Retry with sales sort, full scrape mode, simplified query
    if (!apifyAbortRef.current) {
      const simpleQ = mainQ.split(/\s+/).slice(0, 3).join(" ");
      const retryInput = { searchKeywords: [simpleQ], country: "ID", maxProducts: 20, scrapeMode: "full", sortBy: "sales", shopeeCookies: shopeeCookie || "[]", proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: "ID" } };
      addDiag("info", "shopee_apify", `Attempt 2: sortBy=sales, mode=full, q="${simpleQ}"`);
      setStage("Retrying Source 2 (best sellers)..."); setProgress(10);
      try {
        const items = await runApifyActor(shopeeActorId, retryInput, "Source 2 retry", onPartial);
        const results = normalizeApifyResults(items, "Shopee");
        if (results.length > 0) {
          addDiag("ok", "shopee_apify", `Attempt 2: ${items.length} raw → ${results.length} valid`);
          waves.push({ name: "Source 2 (retry)", status: "ok", count: results.length });
          return { allResults: results, waves, source: "apify" };
        }
        addDiag("warn", "shopee_apify", `Attempt 2: still 0. Source may be blocking.`);
      } catch (e) {
        addDiag("warn", "shopee_apify", `Attempt 2 failed: ${typeof e === "object" ? (e.message || JSON.stringify(e)) : String(e)}`);
      }
    }

    waves.push({ name: "Source 2", status: "fail", count: 0, reason: "Blocked by anti-bot. Try again in a few minutes." });
    return { allResults: [], waves, source: "apify" };
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
      const displayPlatform = isAdmin ? platform : (platform === "Tokopedia" ? "Source 1" : "Source 2");
      setStage(label + " " + displayPlatform + "...");
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
      const fmt = await callClaude('Generate search queries for finding this product on Indonesian marketplaces.\n\nRULES:\n1. Strip brand names but KEEP specs (size, volume, weight, ml, gram)\n2. Mix Bahasa Indonesia AND English — Indonesian buyers search both\n3. Include specific size/volume in at least 2 queries\n4. Each query 2-5 words, specific to THIS product\n\nExamples:\n"Vanilla Roller On Essential Oil 10ml" → ["roller oil vanilla 10ml","minyak vanilla roll on 10ml","essential oil vanilla roller"]\n"Coconut Bowl Set of 4 with Spoons" → ["mangkok kelapa set 4","coconut bowl spoon set","bowl kelapa kayu"]\n\nProduct: "' + product.name + '" (AED ' + (product.price_aed || "") + ')\n\n{"clean_name_id":"2-4 word Bahasa name","category":"electronics/kitchen/beauty/fashion/home/toys/sports/baby/office/other","weight_class":"light/medium/heavy","search_queries_id":["mixed query with specs","bahasa query","english query","variant"]}\nJSON only:', "claude-sonnet-4-20250514", false, 1, 1024);
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
            title: p.title || p.name || "",
            price_aed: parseFloat(String(p.price || p.extracted_price || "0").replace(/[^0-9.]/g, "")) || 0,
            rating: parseFloat(p.rating || p.stars || 0) || 0,
            reviews: parseInt(String(p.reviews || p.total_reviews || p.ratings_total || "0").replace(/[^0-9]/g, "")) || 0,
            asin: p.asin || "",
            url: p.link || p.url || (p.asin ? "https://www.amazon.ae/dp/" + p.asin : ""),
            image: p.thumbnail || p.image || "",
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
    a.download = "bandar-discover-" + (keyword || "search").replace(/[^a-z0-9]/gi, "-").slice(0, 40) + "-" + new Date().toISOString().slice(0, 10) + ".csv";
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
      setStage(isAdmin ? "Claude classifying..." : "Classifying...");
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
  const AMAZON_URL_PATTERN = /^https?:\/\/(www\.)?(amazon\.(ae|com|co\.uk|de|fr|it|es|ca|com\.au|in|sg|sa|com\.br|co\.jp|nl|pl|se|com\.mx|com\.tr|eg)|amzn\.(to|eu|asia|com))\//i;
  const extractAmazonDomain = (u) => { const m = u.match(/amazon\.([a-z.]+)/i); return m ? "Amazon." + m[1] : "Amazon"; };
  const isAmazonUrl = (u) => AMAZON_URL_PATTERN.test(u);
  const extractAsin = (u) => { const m = u.match(/\/dp\/([A-Z0-9]{10})/i) || u.match(/\/gp\/product\/([A-Z0-9]{10})/i) || u.match(/\/([A-Z0-9]{10})(?:[/?#]|$)/i); return m ? m[1] : ""; };
  const extractDomainCode = (u) => { const m = u.match(/amazon\.([a-z.]+)/i); if (!m) return "ae"; const d = m[1]; if (d === "ae") return "ae"; if (d === "com") return "com"; if (d === "co.uk") return "co.uk"; if (d === "de") return "de"; if (d === "sa") return "sa"; return d.replace(/^com\./, ""); };

  const isShortLink = (u) => /^https?:\/\/(amzn\.(to|eu|asia|com))\//i.test(u);

  const runDryRun = async () => {
    let input = url.trim();
    // ── Mobile paste cleanup: extract URL from shared text ──
    // Amazon app share often includes text like "Check out this product on Amazon https://amzn.to/xxx"
    if (input && !input.startsWith("http")) {
      const urlMatch = input.match(/(https?:\/\/[^\s]+)/i);
      if (urlMatch) {
        input = urlMatch[1].replace(/[.,;!?)]+$/, ""); // strip trailing punctuation
        setUrl(input);
        addDiag("info", "lookup", `Extracted URL from pasted text: ${input}`);
      }
    }
    if (!input || !input.startsWith("http")) { setAutoError("Invalid URL — paste an Amazon product link"); return; }
    if (!isAmazonUrl(input)) { setAutoError("Supported: Amazon (.ae, .com, .co.uk, .de, etc.) and amzn.to/amzn.eu short links"); return; }
    setLoading(true); setAutoError(""); setDryRunData(null); setUaeSimilar(null); setIndoResults(null); setMarginData(null); setEditableQueries([]); setActiveSection(0); setWaveStatus([]);

    // ── Resolve short links (amzn.to, amzn.eu) → real Amazon URL ──
    if (isShortLink(input)) {
      setStage("Resolving short link...");
      addDiag("info", "lookup", `Short link detected: ${input}`);
      let resolved = false;

      // Attempt 1: Worker redirect resolver (fastest — just follows redirects server-side)
      try {
        addDiag("info", "lookup", "Attempt 1: Worker redirect resolver");
        const resolveRes = await workerCall("resolve_redirect", { url: input });
        const finalUrl = resolveRes.url || resolveRes.finalUrl || resolveRes.resolved || "";
        if (finalUrl && /amazon\.[a-z.]+/i.test(finalUrl)) {
          addDiag("ok", "lookup", `Worker resolved → ${finalUrl.slice(0, 80)}`);
          input = finalUrl;
          setUrl(finalUrl);
          resolved = true;
        } else {
          addDiag("warn", "lookup", `Worker resolver returned: ${JSON.stringify(resolveRes).slice(0, 200)}`);
        }
      } catch (e) { addDiag("warn", "lookup", `Worker resolve_redirect not available: ${e.message}`); }

      // Attempt 2: ScrapingDog scrape (non-dynamic)
      if (!resolved) {
        try {
          addDiag("info", "lookup", "Attempt 2: ScrapingDog scrape");
          setStage("Resolving link (attempt 2)...");
          const sdRes = await workerCall("scrapingdog_scrape", { url: input, dynamic: false, premium: false });
          const html = sdRes.html || "";
          const canonicalMatch = html.match(/(?:canonical|og:url)[^>]*href=["']([^"']*amazon\.[^"']+)["']/i)
            || html.match(/(https?:\/\/www\.amazon\.[a-z.]+\/[^"'\s]+\/dp\/[A-Z0-9]{10}[^"'\s]*)/i)
            || html.match(/(https?:\/\/www\.amazon\.[a-z.]+\/dp\/[A-Z0-9]{10})/i);
          if (canonicalMatch) {
            addDiag("ok", "lookup", `SD resolved → ${canonicalMatch[1].slice(0, 80)}`);
            input = canonicalMatch[1]; setUrl(canonicalMatch[1]); resolved = true;
          } else {
            const asinInHtml = html.match(/\/dp\/([A-Z0-9]{10})/i);
            const domainInHtml = html.match(/amazon\.([a-z.]+)/i);
            if (asinInHtml) {
              const domain = domainInHtml ? domainInHtml[1] : "ae";
              const reconstructed = "https://www.amazon." + domain + "/dp/" + asinInHtml[1];
              addDiag("ok", "lookup", `Reconstructed from HTML: ${reconstructed}`);
              input = reconstructed; setUrl(reconstructed); resolved = true;
            } else {
              addDiag("warn", "lookup", `SD scrape: no ASIN found (HTML ${html.length} chars)`);
            }
          }
        } catch (e) { addDiag("warn", "lookup", `SD scrape failed: ${e.message}`); }
      }

      // Attempt 3: ScrapingDog scrape (dynamic + premium)
      if (!resolved) {
        try {
          addDiag("info", "lookup", "Attempt 3: ScrapingDog dynamic scrape");
          setStage("Resolving link (attempt 3)...");
          const sdRes = await workerCall("scrapingdog_scrape", { url: input, dynamic: true, premium: true });
          const html = sdRes.html || "";
          const canonicalMatch = html.match(/(?:canonical|og:url)[^>]*href=["']([^"']*amazon\.[^"']+)["']/i)
            || html.match(/(https?:\/\/www\.amazon\.[a-z.]+\/[^"'\s]+\/dp\/[A-Z0-9]{10}[^"'\s]*)/i)
            || html.match(/(https?:\/\/www\.amazon\.[a-z.]+\/dp\/[A-Z0-9]{10})/i);
          if (canonicalMatch) {
            addDiag("ok", "lookup", `SD dynamic resolved → ${canonicalMatch[1].slice(0, 80)}`);
            input = canonicalMatch[1]; setUrl(canonicalMatch[1]); resolved = true;
          } else {
            const asinInHtml = html.match(/\/dp\/([A-Z0-9]{10})/i);
            const domainInHtml = html.match(/amazon\.([a-z.]+)/i);
            if (asinInHtml) {
              const domain = domainInHtml ? domainInHtml[1] : "ae";
              const reconstructed = "https://www.amazon." + domain + "/dp/" + asinInHtml[1];
              addDiag("ok", "lookup", `Reconstructed from dynamic HTML: ${reconstructed}`);
              input = reconstructed; setUrl(reconstructed); resolved = true;
            }
          }
        } catch (e) { addDiag("warn", "lookup", `SD dynamic scrape failed: ${e.message}`); }
      }

      if (!resolved) {
        addDiag("error", "lookup", "All 3 resolve attempts failed");
        setAutoError("Couldn't resolve this short link. Try opening it in your browser, wait for the page to load, then copy the URL from the address bar.");
        setLoading(false); setStage(""); return;
      }
    }

    const marketplace = extractAmazonDomain(input);
    const domainCode = extractDomainCode(input);
    const asin = extractAsin(input);
    try {
      let sdParsed = null;
      let rawInfo = "";

      // ── Part A: Try ScrapingDog → direct structured mapping ──
      if (asin) {
        setStage(isAdmin ? "ScrapingDog Product API..." : "Reading product...");
        try {
          addDiag("info", "lookup", `SD product API: domain=${domainCode}, asin=${asin}`);
          const sdData = await workerCall("scrapingdog_product", { asin, domain: domainCode });
          if (sdData && !sdData.error) {
            addDiag("ok", "lookup", `SD product OK, title: ${(sdData.title || "").slice(0, 60)}`);
            let priceAed = 0;
            // Log all price fields for debugging
            const priceFields = { price: sdData.price, sale_price: sdData.sale_price, mrp: sdData.mrp, buybox_price: sdData.buybox_price, pricing: sdData.pricing, current_price: sdData.current_price, extracted_price: sdData.extracted_price, buybox: sdData.buybox };
            addDiag("info", "lookup", "SD price fields: " + JSON.stringify(priceFields));
            // Priority: buybox > current > extracted > mrp > pricing > price > sale
            for (const f of [sdData.buybox_price, sdData.current_price, sdData.extracted_price, sdData.mrp, sdData.pricing, sdData.price, sdData.sale_price]) { if (f) { const pm = String(f).match(/[\d,.]+/); if (pm) { priceAed = parseFloat(pm[0].replace(/,/g, "")); if (priceAed) break; } } }
            if (!priceAed) addDiag("warn", "lookup", `SD price=0, keys: ${Object.keys(sdData).filter(k => /price|cost|mrp/i.test(k)).join(",") || "none"}`);
            if (sdData.title && priceAed > 0) {
              // Extract product specs from SD product_information
              const pi = sdData.product_information || {};
              const specFields = ["Size", "Item Volume", "Volume", "Net Content Volume", "Item Weight", "Product Dimensions", "Capacity", "Number of Items", "Package Information", "Item Form", "Unit Count", "Colour", "Material", "Scent"];
              const specs = {};
              for (const f of specFields) { if (pi[f]) specs[f.toLowerCase().replace(/\s+/g, "_")] = pi[f]; }
              // Build concise summary
              const specSummary = Object.entries(specs).map(([k, v]) => k.replace(/_/g, " ") + ": " + v).join(" | ");
              sdParsed = {
                product_name: sdData.title,
                price_aed: priceAed,
                brand: pi.Brand || pi.Manufacturer || "",
                rating: parseFloat(sdData.average_rating) || 0,
                reviews: parseInt(sdData.total_ratings) || 0,
                pack_quantity: 1,
                source: marketplace,
                asin: asin,
                specs: specs,
                spec_summary: specSummary || ""
              };
              addDiag("ok", "lookup", `SD direct parse: "${sdParsed.product_name.slice(0, 50)}" AED ${sdParsed.price_aed} specs: ${specSummary.slice(0, 100) || "none"}`);
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
        // ── Part B: SD succeeded → Google Translate + Claude for classification ──
        setStage("Translating...");
        addDiag("info", "lookup", "SD path: Google Translate + Haiku classify");
        const specInfo = sdParsed.spec_summary ? "\nProduct specs: " + sdParsed.spec_summary : "";

        // Layer 1: Google Translate (fast, guaranteed) — runs in parallel with Claude
        const gTranslateP = translateProduct(sdParsed.product_name, sdParsed.brand);

        // Layer 2: Claude for smart search queries + classification
        const transPrompt = 'Generate search queries for finding this product on Indonesian marketplaces (Tokopedia/Shopee).\n\nRULES:\n1. Strip ALL brand names but KEEP product specs (size, volume, weight, ml, gram, count)\n2. Mix of Bahasa Indonesia AND English queries — Indonesian buyers often search in English too\n3. Include the specific size/volume in at least 2 queries (e.g. "10ml", "500g", "1 liter")\n4. Each query 2-5 words, specific enough to find THIS product, not just the category\n\nExamples:\n"Gya Labs Vanilla Roller On Essential Oil 10ml" → queries=["roller oil vanilla 10ml","minyak vanilla roll on 10ml","essential oil vanilla roller","minyak atsiri vanilla 10ml"]\n"Nielsen-Massey Madagascar Bourbon Vanilla Bean Paste 32oz" → queries=["vanilla bean paste 32oz","pasta vanilla 900ml","vanilla extract pure"]\n"KitchenAid Artisan Stand Mixer 5Qt" → queries=["stand mixer 5 quart","mixer berdiri adonan","mixer kue besar"]\n\nProduct: "' + sdParsed.product_name + '"' + specInfo + '\nBrand to REMOVE: "' + (sdParsed.brand || "") + '"\n\n{"clean_name_en":"2-4 word generic English name with size if applicable","clean_name_id":"2-4 word Bahasa name","product_summary":"one-line: what it is + size/volume + key feature (max 15 words)","category":"electronics/kitchen/beauty/fashion/home/toys/sports/baby/office/other","weight_class":"light/medium/heavy","search_queries_id":["mixed lang query with specs","bahasa query with specs","english query with specs","variant query"],"search_queries_en":["short english query with specs"]}\nJSON only:';
        const transModels = ["claude-haiku-4-5-20251001", "claude-sonnet-4-20250514"];
        for (let attempt = 0; attempt < transModels.length && !data; attempt++) {
          const mdl = transModels[attempt];
          if (attempt > 0) { addDiag("info", "lookup", "Haiku translate failed, trying Sonnet"); setStage("Retrying translate..."); }
          try {
            const translated = await runWithProgress(() => callClaude(transPrompt, mdl, false, 1, 1024), 3);
            addDiag("info", "lookup", `Translate attempt ${attempt + 1} (${mdl.includes("haiku") ? "Haiku" : "Sonnet"}), len=${translated.length}`, translated.slice(0, 400));
            const trans = parseJSON(translated);
            data = { ...sdParsed, ...trans, product_name: sdParsed.product_name, price_aed: sdParsed.price_aed, brand: sdParsed.brand, rating: sdParsed.rating, reviews: sdParsed.reviews, pack_quantity: sdParsed.pack_quantity, specs: sdParsed.specs, spec_summary: sdParsed.spec_summary, product_summary: trans.product_summary || sdParsed.spec_summary || "" };
          } catch (e) {
            addDiag("warn", "lookup", `Translate attempt ${attempt + 1} failed: ${e.message}`);
            if (attempt < transModels.length - 1) await wait(1500);
          }
        }

        // Await Google Translate result (should be done by now — it's ~200ms)
        const gTranslated = await gTranslateP;

        // If Claude completely fails, use Google Translate for everything
        if (!data) {
          addDiag("warn", "lookup", "All Claude attempts failed, using Google Translate + local fallback");
          const fb = fallbackSearchQueries(sdParsed.product_name, sdParsed.brand);
          // Build queries from Google-translated name if available
          const gtQueries = gTranslated ? gTranslated.split(/\s+/).filter(w => w.length > 1).slice(0, 6).join(" ") : null;
          const queries = gtQueries ? [gtQueries, ...fb.queries].slice(0, 5) : fb.queries;
          addDiag("info", "lookup", `Fallback queries: ${JSON.stringify(queries)}`);
          data = { ...sdParsed, clean_name_en: fb.cleanEn, clean_name_id: gTranslated || fb.cleanId, category: guessCategory(sdParsed.product_name), weight_class: "medium", search_queries_id: [...new Set(queries)], search_queries_en: [fb.cleanEn], specs: sdParsed.specs, spec_summary: sdParsed.spec_summary, product_summary: sdParsed.spec_summary || "" };
        }

        // Always attach Google-translated full product name (independent of Claude)
        if (gTranslated) data.product_name_id = gTranslated;
      } else {
        // ── Legacy path: No SD data → full Claude format (existing flow) ──
        if (!rawInfo) { setStage("Reading product..."); rawInfo = await runWithProgress(() => callClaude("Find product details for " + marketplace + " listing.\nURL: " + input + (asin ? "\nASIN: " + asin : "") + "\nI need: name, price AED, brand, rating, reviews, pack size.", "claude-sonnet-4-20250514", true, 2, 4096), 12); }
        addDiag("info", "lookup", `rawInfo length: ${rawInfo.length}`, rawInfo.slice(0, 200));
        setStage("Formatting...");
        const fmtPrompt = "Convert to JSON. For search_queries_id: give 4 search queries mixing Bahasa Indonesia AND English that an Indonesian marketplace buyer would type. KEEP product specs (size, volume, weight, ml, gram) in queries. Strip brand names only. Example: 'Gya Labs Vanilla Roller Oil 10ml' → ['roller oil vanilla 10ml','minyak vanilla roll on 10ml','essential oil vanilla roller','minyak atsiri vanilla 10ml']. clean_name_en = short generic name WITH size (e.g. 'vanilla roller oil 10ml').\n\n" + rawInfo + "\nURL: " + input + "\nMarketplace: " + marketplace + '\n\nReturn ONLY valid JSON:\n{"product_name":"full original name","price_aed":NUMBER,"pack_quantity":NUMBER,"brand":"","rating":NUMBER,"reviews":NUMBER,"source":"' + marketplace + '","clean_name_en":"short generic English name with size","clean_name_id":"short Bahasa name","product_summary":"one-line: what + size + key feature (max 15 words)","category":"electronics/kitchen/beauty/fashion/home/toys/sports/baby/office/other","weight_class":"light/medium/heavy","search_queries_id":["mixed lang query with specs","bahasa query","english query","variant"],"search_queries_en":["english query with specs"]}\nJSON only:';
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
        // Legacy path: also get Google Translate for the product name
        if (data.product_name && !data.product_name_id) {
          const gt = await translateProduct(data.product_name, data.brand);
          if (gt) data.product_name_id = gt;
        }
      }
      if (!data.product_name) throw new Error("Product not found.");
      if (!data.price_aed) { const pm = rawInfo.match(/AED\s*(\d+(?:[.,]\d+)?)/i); if (pm) data.price_aed = parseFloat(pm[1].replace(/,/g, "")); }
      // Ensure product_name_id exists (fallback to clean_name_id if Google Translate wasn't available)
      if (!data.product_name_id) data.product_name_id = data.clean_name_id || "";
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
    setLoading(true); setAutoError(""); setStreamingResults([]); streamingResultsRef.current = []; setApifyPaused(false); apifyPauseRef.current = false; apifyAbortRef.current = false;
    const queries = editableQueries.filter(q => q.trim());
    if (!queries.length) { setAutoError("Add at least one query."); setLoading(false); return; }
    try {
      const { allResults, waves } = await runTokoApify(queries);
      if (allResults.length === 0) { setAutoError("Source 1 returned 0 results. Try different queries."); setLoading(false); setStage(""); return; }
      const result = buildMarginData(dryRunData, allResults, indoResults, waves);
      setIndoResults(result.indo); setWaveStatus(result.indo.wave_status || []);
      // Don't auto-calculate margins — user triggers separately
      setMarginData(null); setScenarioBData(null);
      setLookupView("results");
      await incrementUsage("lookups_used");
    } catch (err) { setAutoError(err.message); if (err.message.includes("429")) setCooldown(30); }
    setLoading(false); setStage(""); setStreamingResults([]); streamingResultsRef.current = [];
  };

  const runLookupShopee = async () => {
    if (!dryRunData || !authToken) return;
    if (!checkQuota("lookup")) return;
    setLoading(true); setAutoError(""); setStreamingResults([]); streamingResultsRef.current = []; setApifyPaused(false); apifyPauseRef.current = false; apifyAbortRef.current = false;
    const queries = editableQueries.filter(q => q.trim());
    if (!queries.length) { setAutoError("Add at least one query."); setLoading(false); return; }
    try {
      const { allResults, waves } = await runShopeeApify(queries);
      if (allResults.length === 0) { setAutoError("Source 2 returned 0 results. Check if actor is rented."); setLoading(false); setStage(""); return; }
      const result = buildMarginData(dryRunData, allResults, indoResults, waves);
      setIndoResults(result.indo); setWaveStatus(result.indo.wave_status || []);
      // Don't auto-calculate margins — user triggers separately
      setMarginData(null); setScenarioBData(null);
      setLookupView("results");
      await incrementUsage("lookups_used");
    } catch (err) { setAutoError(err.message); if (err.message.includes("429")) setCooldown(30); }
    setLoading(false); setStage(""); setStreamingResults([]); streamingResultsRef.current = [];
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
      // Don't auto-calculate margins — user triggers separately
      setMarginData(null); setScenarioBData(null);
      setLookupView("results");
      await incrementUsage("lookups_used");
    } catch (err) { setAutoError(err.message); if (err.message.includes("429")) setCooldown(30); }
    setLoading(false); setStage("");
  };

  const updateHistoryStatus = (i, s) => setHistory(prev => prev.map((x, idx) => idx === i ? { ...x, status: s } : x));
  const resetLookup = () => { setDryRunData(null); setUaeSimilar(null); setIndoResults(null); setMarginData(null); setAutoError(""); setUrl(""); setEditableQueries([]); setActiveSection(0); setWaveStatus([]); setLookupView("landing"); setScenarioBData(null); setMarginScenario("A"); setStreamingResults([]); streamingResultsRef.current = []; setMarginAnalysisLoading(false); };

  // ══════════ RUN MARGIN ANALYSIS (manual trigger, 1 quota) ══════════
  const runMarginAnalysis = async () => {
    if (!dryRunData || !indoResults?.results?.length || !authToken) return;
    if (!checkQuota("margin")) return;
    setMarginAnalysisLoading(true); setAutoError("");
    try {
      // ── Scenario A: Link price vs Indo ──
      const wc = dryRunData.weight_class || "medium";
      const med = indoResults.price_stats.median_idr;
      const low = indoResults.price_stats.lowest_idr;
      const high = indoResults.price_stats.highest_idr;
      const margins = {
        median: calcMargin(dryRunData.price_aed, dryRunData.pack_quantity || 1, med, wc),
        best: calcMargin(dryRunData.price_aed, dryRunData.pack_quantity || 1, low, wc),
        worst: calcMargin(dryRunData.price_aed, dryRunData.pack_quantity || 1, high, wc),
      };
      const status = margins.median.margin >= MARGIN_THRESHOLD.candidate ? "Candidate" : margins.median.margin >= MARGIN_THRESHOLD.borderline ? "Investigated" : "Rejected";
      const mData = { uaeProduct: dryRunData, normalized: dryRunData, indoResults, margins, confidence: indoResults.confidence, medianPriceIDR: med, lowestPriceIDR: low, highestPriceIDR: high, weightClass: wc, timestamp: new Date().toISOString(), source: indoResults.source || "apify", status };
      setMarginData(mData);
      const nh = [mData, ...historyRef.current].slice(0, MAX_HISTORY);
      setHistory(nh); await saveHistoryNow(nh);

      // ── Scenario B: Auto-trigger similar item search ──
      setScenarioBData(null); setScenarioBLoading(true);
      try {
        const productKeywords = (dryRunData.clean_name_en || dryRunData.product_name || "").toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 3);
        const source = dryRunData.source || "Amazon.ae";
        let similarPrices = [];
        for (const dh of discHistory) {
          const kwMatch = productKeywords.some(kw => dh.keyword.toLowerCase().includes(kw));
          if (kwMatch && dh.results?.length) {
            const sameSrc = dh.results.filter(r => r.source === source && r.price_aed > 0);
            similarPrices.push(...sameSrc.map(r => r.price_aed));
          }
        }
        if (similarPrices.length < 3) {
          const searchQ = (dryRunData.clean_name_en || dryRunData.product_name || "").replace(/[^a-zA-Z0-9\s]/g, "").trim().split(/\s+/).slice(0, 4).join(" ");
          if (searchQ.length >= 3) {
            addDiag("info", "marginAnalysis", `Scenario B: Searching similar "${searchQ}" on ${source}`);
            setStage("Finding similar items for Scenario B...");
            try {
              const domainCode = (source.match(/\.([a-z.]+)$/i) || [, "ae"])[1] || "ae";
              const sdRes = await workerCall("scrapingdog_search", { query: searchQ, domain: domainCode, page: 1 });
              const products = (sdRes.results || sdRes.organic_results || sdRes.search_results || sdRes || []);
              const items = (Array.isArray(products) ? products : []).map(p => parseFloat(String(p.price || p.extracted_price || "0").replace(/[^0-9.]/g, "")) || 0).filter(p => p > 0);
              similarPrices.push(...items);
              addDiag("info", "marginAnalysis", `Scenario B: ${items.length} similar prices found`);
            } catch (e) { addDiag("warn", "marginAnalysis", `Scenario B search failed: ${e.message}`); }
          }
        }
        if (similarPrices.length > 0) {
          const sorted = similarPrices.sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];
          const average = Math.round((sorted.reduce((s, x) => s + x, 0) / sorted.length) * 100) / 100;
          setScenarioBData({ uaeMedian: median, uaeAverage: average, source, count: sorted.length, lowest: sorted[0], highest: sorted[sorted.length - 1] });
        } else {
          setScenarioBData({ uaeMedian: 0, uaeAverage: 0, source: dryRunData.source || "Amazon.ae", count: 0 });
        }
      } catch (e) { addDiag("warn", "marginAnalysis", `Scenario B error: ${e.message}`); }
      setScenarioBLoading(false);

      await incrementUsage("margins_used");
      addDiag("ok", "marginAnalysis", `Margin analysis complete: A=${margins.median.margin.toFixed(1)}%`);
    } catch (err) { setAutoError("Margin analysis failed: " + err.message); }
    setMarginAnalysisLoading(false); setStage("");
  };

  const restoreFromHistory = (entry) => {
    const product = entry.uaeProduct || {};
    setDryRunData(product);
    setUrl(product.url || "");
    setEditableQueries([...(product.search_queries_id || [product.clean_name_id || entry.normalized?.clean_name_id]), ...(product.search_queries_en || [])].filter(Boolean));
    setIndoResults(entry.indoResults || null);
    setMarginData(entry.indoResults ? entry : null);
    setWaveStatus(entry.indoResults?.wave_status || []);
    setAutoError("");
    // Always go to scrape view so user can edit queries and explore missing sources
    setLookupView("scrape");
  };

  // ══════════ EXPORTS ══════════
  const exportBackup = () => { const b = new Blob([JSON.stringify({ userId, exportedAt: new Date().toISOString(), history: history.map(compressEntry) }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "bandar-backup-" + new Date().toISOString().slice(0, 10) + ".json"; a.click(); };
  const importBackup = (file) => { const r = new FileReader(); r.onload = async (e) => { try { const b = JSON.parse(e.target.result); if (!b.history?.length) throw new Error("Invalid"); const exp = b.history.map(expandEntry); setHistory(exp); await saveHistory(userId, exp); alert("Restored " + exp.length + " lookups"); } catch (err) { alert("Import failed: " + err.message); } }; r.readAsText(file); };
  const backupFileRef = useRef(null);

  const exportPDF = () => {
    if (!marginData) return;
    const m = marginData.margins.median; const q = getQty(); const conf = marginData.confidence;
    const confLine = conf ? '<div style="padding:8px;background:' + (conf.level === "high" ? "#e8f5ec" : conf.level === "medium" ? "#fdf8ed" : "#fef2f2") + ';border-radius:4px;margin-top:12px;text-align:center;font-size:12px"><strong>Confidence:</strong> ' + conf.score + '/100 (' + conf.level.toUpperCase() + ')' + (conf.flags?.length ? ' — ' + conf.flags.join(', ') : '') + '</div>' : '';
    const html = '<!DOCTYPE html><html><head><title>Bandar Analysis</title><style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#1a1a1a}h1{font-size:20px;border-bottom:2px solid #1a7a3a;padding-bottom:8px}h2{font-size:14px;color:#8B6914;margin-top:24px}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{padding:8px 12px;border:1px solid #ddd;text-align:left;font-size:12px}th{background:#f5f2eb;font-weight:700}.green{color:#1a7a3a}.red{color:#dc2626}.big{font-size:28px;font-weight:700;text-align:center;padding:16px}.verdict{padding:12px;text-align:center;border-radius:4px;font-weight:700;margin-top:16px}@media print{body{padding:20px}}</style></head><body>' +
      '<h1>Bandar Analysis</h1><p><strong>Date:</strong> ' + new Date().toLocaleDateString() + ' | <strong>FX:</strong> 1 AED = ' + Math.round(fx.AED_TO_IDR) + ' IDR</p>' +
      '<h2>Product</h2><table><tr><th>Name</th><td>' + escapeHtml(marginData.uaeProduct?.product_name) + '</td></tr>' + (marginData.uaeProduct?.product_name_id ? '<tr><th>Nama (ID)</th><td>' + escapeHtml(marginData.uaeProduct.product_name_id) + '</td></tr>' : '') + '<tr><th>Bahasa</th><td>' + escapeHtml(marginData.normalized?.clean_name_id) + '</td></tr><tr><th>Source</th><td>' + (marginData.uaeProduct?.source || "") + ' | AED ' + (marginData.uaeProduct?.price_aed || 0) + (marginData.uaeProduct?.pack_quantity > 1 ? ' (' + marginData.uaeProduct.pack_quantity + '-pack)' : '') + '</td></tr></table>' +
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
  const exportQuickCSV = () => { if (!history.length) return; const h = ["Date","Product","AED","Bahasa","Category","Indo Median IDR","Margin %","Status"]; const r = history.map(x => [x.timestamp?.slice(0,10)||"",'"'+(x.uaeProduct?.product_name||"")+'"',x.uaeProduct?.price_aed||0,'"'+(x.normalized?.clean_name_id||"")+'"',x.normalized?.category||"",x.medianPriceIDR||0,(x.margins?.median?.margin||0).toFixed(1),x.status||""].join(",")); const b = new Blob([[h.join(","),...r].join("\n")], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "bandar-quick-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); };
  const exportStructuredCSV = () => { if (!history.length) return; const headers = ["Date","Product EN","Product ID (Full)","Product ID (Short)","Brand","Category","Weight","Source","Pack","AED","USD","Indo Med IDR","Indo Low IDR","Indo Hi IDR","Freight USD","Customs USD","Last Mile USD","Total Cost USD","Margin Best%","Margin Med%","Margin Worst%","Conf Score","Status"]; const rows = history.map(h => { const m = h.margins?.median || {}; return [h.timestamp?.slice(0,10)||"",'"'+(h.uaeProduct?.product_name||"").replace(/"/g,'""')+'"','"'+(h.uaeProduct?.product_name_id||"").replace(/"/g,'""')+'"','"'+(h.normalized?.clean_name_id||"").replace(/"/g,'""')+'"','"'+(h.uaeProduct?.brand||"")+'"',h.normalized?.category||"",h.weightClass||"",h.uaeProduct?.source||"",h.uaeProduct?.pack_quantity||1,h.uaeProduct?.price_aed||0,(m.uaeUSD||0).toFixed(2),h.medianPriceIDR||0,h.lowestPriceIDR||0,h.highestPriceIDR||0,(m.freightUSD||0).toFixed(2),(m.dutyUSD||0).toFixed(2),(m.lastMileUSD||0).toFixed(2),(m.totalUSD||0).toFixed(2),(h.margins?.best?.margin||0).toFixed(1),(h.margins?.median?.margin||0).toFixed(1),(h.margins?.worst?.margin||0).toFixed(1),h.confidence?.score||0,h.status||""].join(","); }); const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "bandar-analysis-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); };
  const exportBrainstormCSV = (products, label) => { if (!products.length) return; const h = ["Name","AED","Rating","Reviews","Brand","Department","Sub-cat","Source","Branded","Indo Signal","Signal Words"]; const rows = products.map(p => ['"'+(p.name||"").replace(/"/g,'""')+'"',p.price_aed||0,p.rating||0,p.reviews||0,'"'+(p.brand||"")+'"','"'+(p.department||"")+'"','"'+(p.subcategory||"")+'"',p.source||"",p.isBranded?"Y":"N",p.indoSignal?.score||0,'"'+(p.indoSignal?.matched||[]).join("; ")+'"'].join(",")); const blob = new Blob([[h.join(","),...rows].join("\n")], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "bandar-brainstorm-" + label + "-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click(); };

  // ══════════ STYLES ══════════
  // ══════════ STYLES ══════════
  const inputStyle = { width: "100%", padding: "10px 12px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "13px", borderRadius: "3px", outline: "none" };
  const btnStyle = { padding: "10px 24px", background: c.gold, color: c.btnText, border: "none", cursor: "pointer", fontFamily: "'Inconsolata',monospace", fontSize: "12px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", borderRadius: "3px" };
  const btnSec = { ...btnStyle, background: "transparent", color: c.gold, border: "1px solid " + c.gold };
  const btnGreen = { ...btnStyle, background: c.green, color: "#fff" };
  const secStyle = { padding: "20px", background: c.surface, border: "1px solid " + c.border2, borderTop: "none", minHeight: "420px", borderRadius: "0 0 4px 4px" };
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
    <div className="bandar-root" style={{ minHeight: "100vh", background: c.bg, color: c.text, fontFamily: "'Inconsolata',monospace", padding: "24px", transition: "background 0.3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Inconsolata:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:640px){
          .bandar-root{padding:12px !important}
          .bandar-header{flex-direction:column !important; align-items:flex-start !important; gap:10px !important}
          .bandar-header-stats{flex-wrap:wrap !important; gap:8px !important}
          .bandar-tabs{overflow-x:auto !important; -webkit-overflow-scrolling:touch}
          .bandar-tabs button{font-size:10px !important; padding:8px 10px !important; white-space:nowrap}
          .bandar-grid4{grid-template-columns:repeat(2,1fr) !important}
          .bandar-grid3{grid-template-columns:1fr !important}
          .bandar-price-grid{grid-template-columns:1.5fr 1fr 1fr !important}
          .bandar-route-grid{grid-template-columns:1.5fr 0.7fr 0.7fr !important; min-width:0 !important}
        }
      `}</style>
      {showCookieWizard && <CookieWizard c={c} onClose={() => setShowCookieWizard(false)} onSave={ck => { setShopeeCookie(ck); setShopeeCookieUpdatedAt(Date.now()); }} />}

      {!unlocked ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "80vh", position: "relative" }}>
          <button onClick={toggleTheme} style={{ position: "absolute", top: 0, right: 0, background: "transparent", border: "1px solid " + c.border2, color: c.dim, fontFamily: "monospace", fontSize: "11px", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}>{dark ? "\u2600" : "\ud83c\udf19"}</button>
          <div style={{ width: "380px", padding: "40px", background: c.surface, border: "1px solid " + c.border, borderRadius: "8px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.3 }}>{"\ud83d\udd12"}</div>
            <h2 style={{ fontFamily: "'Lora',serif", fontSize: "24px", fontWeight: 500, color: c.gold, marginBottom: "4px" }}>Bandar</h2>
            <p style={{ fontSize: "11px", color: c.dimmer, marginBottom: "24px" }}>{authMode === "reset" ? "Set your new password" : "World\u2013Indonesia Trade Intelligence"}</p>
            {authMode === "reset" ? <>
              <input type="password" value={authNewPassword} onChange={e => { setAuthNewPassword(e.target.value); setAuthError(""); }} onKeyDown={e => e.key === "Enter" && handleResetPassword()} placeholder="New password (6+ characters)" autoFocus style={{ width: "100%", padding: "10px 14px", background: c.input, border: "1px solid " + (authError && !authError.includes("updated") ? c.red : c.border2), color: c.text, fontFamily: "monospace", fontSize: "12px", borderRadius: "4px", outline: "none", marginBottom: "12px" }} />
              {authError && <div style={{ fontSize: "11px", color: authError.includes("updated") ? c.green : c.red, marginBottom: "12px", lineHeight: 1.5 }}>{authError}</div>}
              <button onClick={handleResetPassword} disabled={authLoading} style={{ width: "100%", padding: "12px", background: authLoading ? c.dimmest : c.gold, color: c.btnText, border: "none", borderRadius: "4px", fontFamily: "monospace", fontWeight: 700, letterSpacing: "1px", cursor: authLoading ? "default" : "pointer", opacity: authLoading ? 0.6 : 1 }}>{authLoading ? "..." : "SET NEW PASSWORD"}</button>
              <button onClick={() => { setAuthMode("login"); setAuthError(""); setResetToken(""); }} style={{ width: "100%", marginTop: "8px", padding: "8px", background: "transparent", color: c.dim, border: "none", fontFamily: "monospace", fontSize: "10px", cursor: "pointer", textDecoration: "underline" }}>Back to login</button>
            </> : <>
            <div style={{ display: "flex", gap: "0", marginBottom: "20px", border: "1px solid " + c.border2, borderRadius: "4px", overflow: "hidden" }}>
              <button onClick={() => { setAuthMode("login"); setAuthError(""); }} style={{ flex: 1, padding: "8px", background: authMode === "login" ? c.gold : "transparent", color: authMode === "login" ? c.btnText : c.dim, border: "none", fontFamily: "monospace", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>LOG IN</button>
              <button onClick={() => { setAuthMode("register"); setAuthError(""); }} style={{ flex: 1, padding: "8px", background: authMode === "register" ? c.gold : "transparent", color: authMode === "register" ? c.btnText : c.dim, border: "none", fontFamily: "monospace", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>REGISTER</button>
            </div>
            {authMode === "register" && <input type="text" value={authDisplayName} onChange={e => setAuthDisplayName(e.target.value)} placeholder="Display name (optional)" style={{ width: "100%", padding: "10px 14px", background: c.input, border: "1px solid " + c.border2, color: c.text, fontFamily: "monospace", fontSize: "12px", borderRadius: "4px", outline: "none", marginBottom: "8px" }} />}
            <input type="email" value={authEmail} onChange={e => { setAuthEmail(e.target.value); setAuthError(""); }} placeholder="Email" autoFocus style={{ width: "100%", padding: "10px 14px", background: c.input, border: "1px solid " + (authError ? c.red : c.border2), color: c.text, fontFamily: "monospace", fontSize: "12px", borderRadius: "4px", outline: "none", marginBottom: "8px" }} />
            <input type="password" value={authPassword} onChange={e => { setAuthPassword(e.target.value); setAuthError(""); }} onKeyDown={e => e.key === "Enter" && (authMode === "login" ? handleSignIn() : handleSignUp())} placeholder="Password" style={{ width: "100%", padding: "10px 14px", background: c.input, border: "1px solid " + (authError ? c.red : c.border2), color: c.text, fontFamily: "monospace", fontSize: "12px", borderRadius: "4px", outline: "none", marginBottom: "12px" }} />
            {authMode === "login" && <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", cursor: "pointer", justifyContent: "flex-start" }}><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} style={{ accentColor: c.gold, cursor: "pointer" }} /><span style={{ fontSize: "11px", color: c.dim }}>Remember me</span></label>}
            {authError && <div style={{ fontSize: "11px", color: authError.includes("confirm") || authError.includes("Check") || authError.includes("sent") || authError.includes("updated") ? c.green : c.red, marginBottom: "12px", lineHeight: 1.5 }}>{authError}</div>}
            <button onClick={authMode === "login" ? handleSignIn : handleSignUp} disabled={authLoading} style={{ width: "100%", padding: "12px", background: authLoading ? c.dimmest : c.gold, color: c.btnText, border: "none", borderRadius: "4px", fontFamily: "monospace", fontWeight: 700, letterSpacing: "1px", cursor: authLoading ? "default" : "pointer", opacity: authLoading ? 0.6 : 1 }}>{authLoading ? "..." : authMode === "login" ? "LOG IN" : "CREATE ACCOUNT"}</button>
            {authMode === "login" && <button onClick={handleForgotPassword} disabled={authLoading} style={{ width: "100%", marginTop: "8px", padding: "8px", background: "transparent", color: c.dim, border: "none", fontFamily: "monospace", fontSize: "10px", cursor: "pointer", textDecoration: "underline" }}>Forgot password?</button>}
            </>}
          </div>
        </div>
      ) : !storageReady ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", flexDirection: "column", gap: "16px" }}><Spinner /><div style={{ fontSize: "12px", color: c.dim }}>Loading...</div></div>
      ) : (<>

      {/* ══════════ HEADER ══════════ */}
      <div style={{ marginBottom: "16px", borderBottom: "1px solid " + c.border, paddingBottom: "12px" }}>
        <div className="bandar-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ fontFamily: "'Lora',serif", fontSize: "28px", fontWeight: 500, color: c.gold, margin: 0 }}>Bandar <span style={{ fontSize: "12px", color: c.dimmer, fontFamily: "monospace" }}>v5.3</span></h1>
            <div style={{ fontSize: "10px", color: c.dimmer, marginTop: "4px", letterSpacing: "2px", textTransform: "uppercase" }}>World {"\u2192"} Indonesia {"\u00b7"} {authUser?.email?.split("@")[0]} {isAdmin && <span style={{ color: c.red }}>{"\u00b7 ADMIN"}</span>} {"\u00b7"} {userProfile ? (TIER_LIMITS[userProfile.role]?.label || userProfile.role) : ""}{isAdmin && <>{" \u00b7 "}{fxUpdated ? "FX " + fxUpdated.toLocaleDateString() : "FX: defaults"}{" \u00b7 "}<span style={{ color: supabaseReady ? c.green : c.darkGold }}>{supabaseReady ? "\u25cf DB" : "\u25cb local"}</span></>}</div>
          </div>
          <div className="bandar-header-stats" style={{ display: "flex", gap: "12px", fontSize: "11px", alignItems: "flex-end" }}>
            <div style={{ textAlign: "right" }}><div style={{ color: c.dimmer }}>LOOKUPS</div><div style={{ color: c.gold, fontSize: "16px", fontWeight: 700 }}>{history.length}</div></div>
            <div style={{ textAlign: "right" }}><div style={{ color: c.dimmer }}>CANDIDATES</div><div style={{ color: c.green, fontSize: "16px", fontWeight: 700 }}>{candidates.length}</div></div>
            {userProfile && !isAdmin && (() => { const used = userProfile.lookups_used || 0; const limit = TIER_LIMITS[userProfile.role]?.lookups || 1; const pct = used / limit; const col = pct >= 1 ? c.red : pct >= 0.8 ? c.darkGold : c.green; return <div style={{ textAlign: "right" }}><div style={{ color: c.dimmer }}>SCRAPES</div><div style={{ color: col, fontSize: "11px", fontWeight: 600 }}>{used}/{limit}</div></div>; })()}
            {userProfile && !isAdmin && (() => { const used = userProfile.margins_used || 0; const limit = TIER_LIMITS[userProfile.role]?.margins || 1; const pct = used / limit; const col = pct >= 1 ? c.red : pct >= 0.8 ? c.darkGold : c.green; return <div style={{ textAlign: "right" }}><div style={{ color: c.dimmer }}>ANALYSES</div><div style={{ color: col, fontSize: "11px", fontWeight: 600 }}>{used}/{limit}</div></div>; })()}
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
          <div style={{ fontSize: "12px", color: c.text, fontWeight: 600, marginBottom: "2px" }}>Quota Limit Reached</div>
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
      <div className="bandar-tabs" style={{ display: "flex", gap: "2px", borderBottom: "1px solid " + c.border2 }}>
        {[
          { id: "guide", label: "\ud83d\udcd6 GUIDE" },
          ...(isAdmin ? [{ id: "brainstorm", label: "\ud83e\udde0 BRAINSTORM" }] : []),
          { id: "discover", label: "\ud83d\udd0d DISCOVER" },
          { id: "auto", label: "\u26a1 LOOKUP" },
          { id: "deepdive", label: "\ud83c\udfaf DEEP DIVE" },
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
      {mode === "brainstorm" && isAdmin && <BrainstormPage
        c={c} dark={dark} secStyle={secStyle} inputStyle={inputStyle} btnStyle={btnStyle} btnSec={btnSec} btnGreen={btnGreen}
        isAdmin={isAdmin} authToken={authToken}
        loading={loading} stage={stage} progress={progress}
        bsStep={bsStep} setBsStep={setBsStep} bsError={bsError} bsSubcats={bsSubcats} setBsSubcats={setBsSubcats}
        bsProgress={bsProgress} bsDept={bsDept} setBsDept={setBsDept}
        bsExtractSubcats={bsExtractSubcats} bsScrapeApproved={bsScrapeApproved} bsAbortRef={bsAbortRef}
        bsAmazonProducts={bsAmazonProducts} bsAllProducts={bsAllProducts} bsLastScan={bsLastScan}
        bsHideBranded={bsHideBranded} setBsHideBranded={setBsHideBranded}
        bsBoostIndo={bsBoostIndo} setBsBoostIndo={setBsBoostIndo}
        bsFilter={bsFilter} setBsFilter={setBsFilter}
        bsSort={bsSort} setBsSort={setBsSort}
        bsFiltered={bsFiltered}
        bsValidatingIdx={bsValidatingIdx} bsValidationResults={bsValidationResults}
        validateProduct={validateProduct} setBsValidatingIdx={setBsValidatingIdx} setBsValidationResults={setBsValidationResults}
        showBrandList={showBrandList} setShowBrandList={setShowBrandList}
        allBrands={allBrands} baseBrands={baseBrands} setBaseBrands={setBaseBrands} customBrands={customBrands} setCustomBrands={setCustomBrands}
        newBrandInput={newBrandInput} setNewBrandInput={setNewBrandInput}
        brandSearchFilter={brandSearchFilter} setBrandSearchFilter={setBrandSearchFilter}
        exportBrainstormCSV={exportBrainstormCSV}
        ProductTable={ProductTable}
      />}

      {/* ══════════ DISCOVER TAB ══════════ */}
      {mode === "discover" && <DiscoverPage
        c={c} dark={dark} secStyle={secStyle} inputStyle={inputStyle} btnStyle={btnStyle} btnSec={btnSec} btnGreen={btnGreen}
        isAdmin={isAdmin}
        keywords={keywords} setKeywords={setKeywords} newKeywordInput={newKeywordInput} setNewKeywordInput={setNewKeywordInput}
        discSearchInput={discSearchInput} setDiscSearchInput={setDiscSearchInput}
        discSearchingAmazon={discSearchingAmazon} searchAmazonSD={searchAmazonSD}
        discAllProducts={discAllProducts} discError={discError}
        discHistory={discHistory} discSelectedIdx={discSelectedIdx} setDiscSelectedIdx={setDiscSelectedIdx} setDiscAmazonResults={setDiscAmazonResults}
        setDiscValidationResults={setDiscValidationResults}
        discSort={discSort} setDiscSort={setDiscSort}
        discValidatingIdx={discValidatingIdx} discValidationResults={discValidationResults}
        validateProduct={validateProduct} setDiscValidatingIdx={setDiscValidatingIdx} setDiscValidationResults={setDiscValidationResults}
        exportDiscoverCSV={exportDiscoverCSV} deleteDiscHistory={deleteDiscHistory}
        stage={stage}
        fmtAED={fmtAED}
        ProductTable={ProductTable}
        discViewMode={discViewMode} setDiscViewMode={setDiscViewMode}
        discSelected={discSelected} setDiscSelected={setDiscSelected}
        discQuickFilter={discQuickFilter} setDiscQuickFilter={setDiscQuickFilter}
        discPriceMin={discPriceMin} setDiscPriceMin={setDiscPriceMin}
        discPriceMax={discPriceMax} setDiscPriceMax={setDiscPriceMax}
        discPreviewOpen={discPreviewOpen} setDiscPreviewOpen={setDiscPreviewOpen}
        discPreviewLoading={discPreviewLoading}
        discPreviewCache={discPreviewCache}
        fetchProductPreview={fetchProductPreview}
        extractSizeTag={extractSizeTag}
        launchDeepDiveFromDiscover={launchDeepDiveFromDiscover}
      />}

      {/* ══════════ DEEP DIVE TAB ══════════ */}
      {mode === "deepdive" && <DeepDivePage
        c={c} dark={dark} secStyle={secStyle} inputStyle={inputStyle} btnStyle={btnStyle} btnSec={btnSec} btnGreen={btnGreen}
        isAdmin={isAdmin} authToken={authToken}
        workerCall={workerCall} addDiag={addDiag}
        deepDiveEntry={deepDiveEntry} setDeepDiveEntry={setDeepDiveEntry}
        extractSizeTag={extractSizeTag}
        shopeeCookie={shopeeCookie}
        fetchProductPreview={fetchProductPreview}
        discPreviewCache={discPreviewCache} setDiscPreviewCache={setDiscPreviewCache}
        discHistory={discHistory}
        lookupHistory={history}
        setMode={setMode}
      />}

      {/* ══════════ LOOKUP TAB ══════════ */}
      {mode === "auto" && <LookupPage
        c={c} dark={dark} secStyle={secStyle} inputStyle={inputStyle} btnStyle={btnStyle} btnSec={btnSec} btnGreen={btnGreen}
        isAdmin={isAdmin} loading={loading} stage={stage} progress={progress} autoError={autoError}
        apifyPaused={apifyPaused} setApifyPaused={setApifyPaused} apifyPauseRef={apifyPauseRef} apifyAbortRef={apifyAbortRef}
        streamingResults={streamingResults}
        lookupView={lookupView} setLookupView={setLookupView}
        url={url} setUrl={setUrl} runDryRun={runDryRun} cooldown={cooldown}
        history={history} restoreFromHistory={restoreFromHistory}
        dryRunData={dryRunData} setDryRunData={setDryRunData}
        editableQueries={editableQueries} setEditableQueries={setEditableQueries} newQueryInput={newQueryInput} setNewQueryInput={setNewQueryInput}
        indoResults={indoResults} marginData={marginData}
        indoMode={indoMode}
        runLookupToko={runLookupToko} runLookupShopee={runLookupShopee} runLookupIndoSearch={runLookupIndoSearch}
        runMarginAnalysis={runMarginAnalysis} marginAnalysisLoading={marginAnalysisLoading}
        resetLookup={resetLookup}
        marginScenario={marginScenario} setMarginScenario={setMarginScenario}
        scenarioBData={scenarioBData} scenarioBLoading={scenarioBLoading}
        scenarioBMargins={scenarioBMargins}
        displayMargins={displayMargins} displayStatus={displayStatus}
        freightMode={freightMode} setFreightMode={setFreightMode}
        qtyMode={qtyMode} setQtyMode={setQtyMode} qty={qty} setQty={setQty} getQty={getQty}
        routeComparisons={routeComparisons}
        fx={fx}
        exportPDF={exportPDF}
        waveStatus={waveStatus}
        activeSection={activeSection} setActiveSection={setActiveSection}
        SectionToggle={SectionToggle} PriceRow={PriceRow}
        launchDeepDiveFromLookup={launchDeepDiveFromLookup}
      />}

      {/* ══════════ HISTORY TAB ══════════ */}
      {mode === "history" && <HistoryPage
        c={c} dark={dark} secStyle={secStyle} btnSec={btnSec}
        isAdmin={isAdmin} userId={userId}
        history={history} setHistory={setHistory}
        expandedHistoryIdx={expandedHistoryIdx} setExpandedHistoryIdx={setExpandedHistoryIdx}
        updateHistoryStatus={updateHistoryStatus}
        exportQuickCSV={exportQuickCSV} exportStructuredCSV={exportStructuredCSV} exportBackup={exportBackup} importBackup={importBackup} backupFileRef={backupFileRef}
        saveHistory={saveHistory}
      />}

      {/* ══════════ GUIDE TAB ══════════ */}
      {mode === "guide" && <div style={secStyle}><BandarGuide dark={dark} /></div>}

      {/* ══════════ ADMIN TAB ══════════ */}
      {mode === "admin" && isAdmin && <AdminPage
        c={c} dark={dark} secStyle={secStyle} inputStyle={inputStyle} btnStyle={btnStyle} btnSec={btnSec} btnGreen={btnGreen}
        isAdmin={isAdmin}
        adminSubTab={adminSubTab} setAdminSubTab={setAdminSubTab}
        adminUsers={adminUsers} loadAdminUsers={loadAdminUsers}
        adminSearches={adminSearches} loadAdminSearches={loadAdminSearches}
        adminRates={adminRates} loadAdminRates={loadAdminRates}
        updateUserRole={updateUserRole} deleteUser={deleteUser}
        inviteEmail={inviteEmail} setInviteEmail={setInviteEmail}
        invitePassword={invitePassword} setInvitePassword={setInvitePassword}
        inviteRole={inviteRole} setInviteRole={setInviteRole}
        inviteMsg={inviteMsg} setInviteMsg={setInviteMsg}
        createInviteAccount={createInviteAccount}
        resetUserQuota={resetUserQuota}
      />}

      {/* ══════════ DIAGNOSTIC PANEL ══════════ */}
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
            <button onClick={() => { const lines = diagRef.current.map(l => `${l.ts} [${l.level}] ${l.label}: ${l.message}${l.data ? "\n  " + l.data : ""}`).join("\n"); const blob = new Blob([lines], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "bandar-diag-" + new Date().toISOString().slice(0, 19).replace(/:/g, "") + ".txt"; a.click(); }} style={{ padding: "2px 6px", fontSize: "8px", fontFamily: "monospace", cursor: "pointer", background: "transparent", color: "#C9A84C", border: "1px solid #C9A84C66", borderRadius: "3px" }}>EXPORT</button>
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

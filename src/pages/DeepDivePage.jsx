import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════
// DEEP DIVE PAGE — Multi-step sourcing pipeline
// ═══════════════════════════════════════

const SCORE_COLORS = { 5: "#22c55e", 4: "#86efac", 3: "#eab308", 2: "#f97316", 1: "#ef4444" };
const IDR_PER_AED = 4300;

const extractSize = (title) => {
  if (!title) return null;
  const m = title.match(/(\d+\.?\d*)\s*(ml|oz|fl\.?\s*oz|g|kg|mg|l|count|pack|pcs|capsules?|pods?|pieces?|ct)/i);
  return m ? `${m[1]}${m[2].toLowerCase().replace(/\s/g, "")}` : null;
};

// Strip heavy fields before sending to Claude
const stripForClaude = (product) => {
  const copy = { ...product };
  delete copy.customer_reviews;
  delete copy.images;
  delete copy.images_of_specified_asin;
  delete copy.brand_images;
  return copy;
};

export default function DeepDivePage({
  c, dark, secStyle, inputStyle, btnStyle, btnSec, btnGreen,
  isAdmin, authToken, workerCall, addDiag,
  deepDiveEntry, setDeepDiveEntry,
  shopeeCookie,
  fetchProductPreview, discPreviewCache, setDiscPreviewCache,
}) {
  // ── Pipeline state ──
  const [step, setStep] = useState(0); // 0=entry, 1.5=selection, 2=scraping, 3=golden, 4=indoSearch, 4.5=translate, 5=scoring, 6=done
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ message: "", pct: 0 });

  // Step 1 / 1.5: search + selection
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [previewOpen, setPreviewOpen] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewCache, setPreviewCache] = useState({});

  // Step 2: deep scrape
  const [scrapedProducts, setScrapedProducts] = useState([]);
  const [scrapeErrors, setScrapeErrors] = useState([]);
  const [expandedScrape, setExpandedScrape] = useState(null);

  // Step 3: golden thread
  const [goldenThread, setGoldenThread] = useState(null);
  const [indoKeywords, setIndoKeywords] = useState("");
  const [goldenExpanded, setGoldenExpanded] = useState(false);

  // Step 4: Indonesian search
  const [useExistingLookup, setUseExistingLookup] = useState(false);
  const [indoProducts, setIndoProducts] = useState([]);
  const [indoSearchProgress, setIndoSearchProgress] = useState("");

  // Step 5: final scored results
  const [translatedProducts, setTranslatedProducts] = useState([]);
  const [embeddingFiltered, setEmbeddingFiltered] = useState([]);
  const [scoredResults, setScoredResults] = useState([]);
  const [expandedScore, setExpandedScore] = useState(null);

  // Ref to anchor product (from Lookup entry)
  const anchorRef = useRef(null);
  const existingIndoRef = useRef(null);

  // ── Detect entry point on mount ──
  useEffect(() => {
    if (!deepDiveEntry) {
      setStep(0); // standalone
      return;
    }
    if (deepDiveEntry.source === "discover" && deepDiveEntry.selectedProducts?.length >= 5) {
      // From Discover: skip to Step 2 with pre-selected ASINs
      addDiag("info", "deepdive", "Entry from Discover with " + deepDiveEntry.selectedProducts.length + " products");
      runDeepScrape(deepDiveEntry.selectedProducts.map(p => p.asin));
    } else if (deepDiveEntry.source === "lookup" && deepDiveEntry.anchorProduct) {
      // From Lookup: go to Step 1.5 (search + selection)
      anchorRef.current = deepDiveEntry.anchorProduct;
      existingIndoRef.current = deepDiveEntry.indonesianResults;
      addDiag("info", "deepdive", "Entry from Lookup — anchor: " + (deepDiveEntry.anchorProduct.title || deepDiveEntry.anchorProduct.product_name || "").slice(0, 60));
      runSearchFromAnchor(deepDiveEntry.anchorProduct);
    }
    // Don't clear entry yet — we may need existingIndoRef later
  }, []);

  // ══════════ STEP 0: No standalone — Deep Dive is entry from Discover or Lookup only ══════════

  // Helper: parse ScrapingDog search response (returns various field names)
  const parseSearchResponse = (res) => {
    const raw = res?.results || res?.organic_results || res?.search_results || (Array.isArray(res) ? res : []);
    if (!Array.isArray(raw)) return [];
    return raw.map(p => ({
      title: p.title || p.name || "",
      asin: p.asin || "",
      price: parseFloat(String(p.price || p.extracted_price || "0").replace(/[^0-9.]/g, "")) || 0,
      rating: parseFloat(p.rating || p.stars || 0) || 0,
      reviews: parseInt(String(p.reviews || p.total_reviews || p.ratings_total || "0").replace(/[^0-9]/g, "")) || 0,
      image: p.thumbnail || p.image || "",
      url: p.link || p.url || (p.asin ? "https://www.amazon.ae/dp/" + p.asin : ""),
    })).filter(p => p.title && p.title.length > 3 && p.asin);
  };

  // ══════════ STEP 1.5: Search from Lookup anchor ══════════

  const runSearchFromAnchor = async (anchor) => {
    setStep(1.5);
    setSearchLoading(true);
    setError("");
    try {
      // Build search query from anchor title — take first 5-6 meaningful words
      const anchorTitle = anchor.title || anchor.product_name || "";
      const words = anchorTitle.replace(/[^a-zA-Z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2).slice(0, 6);
      const query = words.join(" ");
      setSearchKeyword(query);
      addDiag("info", "deepdive", "Anchor search query: " + query);

      const res = await workerCall("scrapingdog_search", { query, domain: "ae" });
      let products = parseSearchResponse(res);

      // Try to embed-rank by similarity to anchor
      if (products.length > 3) {
        try {
          const anchorText = anchorTitle + " " + (anchor.feature_bullets || []).join(" ");
          const candidates = products.map((p, i) => ({ id: i, text: p.title || "" }));
          const rankRes = await workerCall("embed_and_rank", { anchor_text: anchorText, candidates, top_n: products.length });
          if (rankRes.ranked?.length) {
            // Reorder products by similarity
            const idOrder = rankRes.ranked.map(r => r.id);
            const reordered = idOrder.map(id => ({ ...products[id], _similarity: rankRes.ranked.find(r => r.id === id)?.similarity })).filter(Boolean);
            products = reordered;
            addDiag("ok", "deepdive", "Ranked by similarity — top: " + (products[0]?.title || "").slice(0, 40));
          }
        } catch (e) {
          addDiag("warn", "deepdive", "Embedding rank failed, using default order: " + e.message);
        }
      }

      setSearchResults(products);

      // Pre-check the anchor ASIN if it appears in results
      const anchorAsin = anchor.asin || anchor._asin || "";
      if (anchorAsin) {
        setSelected(new Set([anchorAsin]));
      }
    } catch (e) {
      setError("Search failed: " + e.message);
      addDiag("error", "deepdive", "Anchor search failed: " + e.message);
    }
    setSearchLoading(false);
  };

  // ══════════ STEP 2: Deep Scrape ══════════

  const runDeepScrape = async (asins) => {
    setStep(2);
    setError("");
    setScrapedProducts([]);
    setScrapeErrors([]);

    const totalAsins = asins.length;
    addDiag("info", "deepdive", "Deep scrape starting for " + totalAsins + " ASINs");

    try {
      // Batch in groups of 4
      const batchSize = 4;
      const allProducts = [];
      const allErrors = [];

      for (let i = 0; i < totalAsins; i += batchSize) {
        const batch = asins.slice(i, i + batchSize);
        setProgress({ message: `Scraping products ${i + 1}-${Math.min(i + batchSize, totalAsins)} of ${totalAsins}...`, pct: Math.round((i / totalAsins) * 80) });

        const res = await workerCall("amazon_product_batch", { asins: batch, domain: "ae" });
        if (res.products) allProducts.push(...res.products);
        if (res.errors) allErrors.push(...res.errors);

        // Update live
        setScrapedProducts([...allProducts]);
        setScrapeErrors([...allErrors]);
      }

      setProgress({ message: `${allProducts.length} of ${totalAsins} products scraped successfully`, pct: 100 });
      addDiag("ok", "deepdive", `Scrape complete: ${allProducts.length}/${totalAsins} success, ${allErrors.length} errors`);

      if (allProducts.length < 5) {
        setError(`Only ${allProducts.length} products scraped (minimum 5 required). Try selecting more products.`);
        return;
      }

      // Auto-proceed to Step 3
      setTimeout(() => runGoldenThread(allProducts), 500);
    } catch (e) {
      setError("Deep scrape failed: " + e.message);
      addDiag("error", "deepdive", "Deep scrape failed: " + e.message);
    }
  };

  // ══════════ STEP 3: Golden Thread ══════════

  const runGoldenThread = async (products) => {
    setStep(3);
    setProgress({ message: `Analyzing patterns across ${products.length} products...`, pct: 10 });
    addDiag("info", "deepdive", "Golden thread analysis starting with " + products.length + " products");

    const stripped = products.map(stripForClaude);

    const prompt = `You are a product sourcing analyst. I have scraped the top products from Amazon.ae for a specific category. Analyze ALL products below and extract the "golden thread" — the common patterns that make these products successful in the UAE market.

PRIORITY: Analyze feature_bullets first (most reliable), then product_information fields, then description (ignore description entirely if it's just SEO keyword spam with no real product info).

PRICE NORMALIZATION: Identify the natural unit for this product category (per ml, per oz, per capsule, per gram, per piece, etc.) and normalize all prices to per-unit cost. If products have slightly different sizes (e.g., 27ml vs 30ml), treat them as equivalent and average the size for normalization. If unit data is unavailable for some products, report their raw price and note that per-unit comparison was not possible for those items.

If the selected products span multiple size variants of the same product type, group your analysis by size segment and note which specs are consistent across ALL sizes vs. which vary by size.

Products:
${JSON.stringify(stripped, null, 1)}

Respond ONLY in this exact JSON format with no other text:
{
  "category": "Short category name",
  "must_have_specs": ["spec 1 present in majority of products", "spec 2"],
  "winning_attributes": ["attribute that top-rated products share"],
  "price_band": {
    "raw": { "min": 0, "max": 0, "median": 0, "currency": "AED" },
    "per_unit": { "min": 0, "max": 0, "median": 0, "unit": "AED/ml or AED/piece etc" }
  },
  "certifications": ["certification 1", "certification 2"],
  "packaging": "Common packaging description",
  "red_flags": ["Thing to avoid based on negative reviews or low-rated products"],
  "indonesian_keywords": ["keyword phrase 1 in Bahasa Indonesia", "keyword 2", "keyword 3"],
  "summary": "2-3 sentence executive summary of what a manufacturer needs to know to compete in this category"
}`;

    try {
      const res = await workerCall("claude", {
        data: {
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        },
      });

      setProgress({ message: "Parsing golden thread...", pct: 90 });

      const text = res.content?.map(b => b.text || "").join("") || "";
      // Extract JSON from response (may be wrapped in markdown)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Claude returned non-JSON response");

      const golden = JSON.parse(jsonMatch[0]);
      setGoldenThread(golden);
      setIndoKeywords((golden.indonesian_keywords || []).join("\n"));
      setProgress({ message: "Golden thread analysis complete", pct: 100 });
      addDiag("ok", "deepdive", "Golden thread: " + golden.category + " — " + (golden.must_have_specs?.length || 0) + " specs");
    } catch (e) {
      setError("Golden thread analysis failed: " + e.message);
      addDiag("error", "deepdive", "Golden thread failed: " + e.message);
    }
  };

  // ══════════ STEP 4: Indonesian Source Search ══════════

  const runIndoSearch = async () => {
    setStep(4);
    setError("");
    setIndoProducts([]);

    // If using existing Lookup results
    if (useExistingLookup && existingIndoRef.current?.length) {
      addDiag("info", "deepdive", "Using existing Lookup indo results: " + existingIndoRef.current.length);
      setIndoProducts(existingIndoRef.current);
      setIndoSearchProgress("Using " + existingIndoRef.current.length + " existing results from Lookup");
      // Auto-proceed to translation
      setTimeout(() => runTranslation(existingIndoRef.current), 500);
      return;
    }

    // Fresh search with golden thread keywords
    const kws = indoKeywords.split("\n").map(k => k.trim()).filter(Boolean);
    if (kws.length === 0) {
      setError("No Indonesian keywords. Add at least one keyword.");
      return;
    }

    addDiag("info", "deepdive", "Indo search with " + kws.length + " keywords: " + kws.join(", "));
    const allResults = [];
    const seenUrls = new Set();

    for (let ki = 0; ki < kws.length; ki++) {
      const kw = kws[ki];
      setIndoSearchProgress(`Searching "${kw}" (${ki + 1}/${kws.length})...`);
      setProgress({ message: `Searching Indonesian marketplaces for "${kw}"...`, pct: Math.round((ki / kws.length) * 70) });

      // Tokopedia
      try {
        const tokoInput = { keyword: kw, maxItems: 20 };
        const rd = await workerCall("apify_run", { actorId: "jupri/tokopedia-scraper", input: tokoInput });
        const runId = rd.data?.id;
        const dsId = rd.data?.defaultDatasetId;
        if (runId) {
          // Poll for completion (max 60s)
          let status = "RUNNING", polls = 0;
          while ((status === "RUNNING" || status === "READY") && polls < 12) {
            await new Promise(r => setTimeout(r, 5000));
            polls++;
            try {
              const pr = await workerCall("apify_status", { runId });
              status = pr.data?.status || "RUNNING";
            } catch {}
          }
          if (dsId) {
            const items = await workerCall("apify_dataset", { datasetId: dsId, limit: 30 });
            if (Array.isArray(items)) {
              items.forEach(item => {
                const url = item.url || item.link || "";
                if (!seenUrls.has(url)) {
                  seenUrls.add(url);
                  allResults.push(normalizeIndoProduct(item, "tokopedia", kw));
                }
              });
              addDiag("ok", "deepdive", `Tokopedia "${kw}": ${items.length} results`);
            }
          }
        }
      } catch (e) {
        addDiag("warn", "deepdive", `Tokopedia "${kw}" failed: ${e.message}`);
      }

      // Shopee
      try {
        const shopeeInput = { keyword: kw, maxItems: 20 };
        if (shopeeCookie) shopeeInput.shopeeCookies = shopeeCookie;
        const rd = await workerCall("apify_run", { actorId: "fatihtahta/shopee-scraper", input: shopeeInput });
        const runId = rd.data?.id;
        const dsId = rd.data?.defaultDatasetId;
        if (runId) {
          let status = "RUNNING", polls = 0;
          while ((status === "RUNNING" || status === "READY") && polls < 12) {
            await new Promise(r => setTimeout(r, 5000));
            polls++;
            try {
              const pr = await workerCall("apify_status", { runId });
              status = pr.data?.status || "RUNNING";
            } catch {}
          }
          if (dsId) {
            const items = await workerCall("apify_dataset", { datasetId: dsId, limit: 30 });
            if (Array.isArray(items)) {
              items.forEach(item => {
                const url = item.url || item.link || "";
                if (!seenUrls.has(url)) {
                  seenUrls.add(url);
                  allResults.push(normalizeIndoProduct(item, "shopee", kw));
                }
              });
              addDiag("ok", "deepdive", `Shopee "${kw}": ${items.length} results`);
            }
          }
        }
      } catch (e) {
        addDiag("warn", "deepdive", `Shopee "${kw}" failed: ${e.message}`);
      }

      setIndoProducts([...allResults]);
    }

    setIndoSearchProgress(`Total: ${allResults.length} unique products found`);
    setProgress({ message: `Found ${allResults.length} Indonesian products`, pct: 100 });
    addDiag("ok", "deepdive", "Indo search complete: " + allResults.length + " products");

    if (allResults.length === 0) {
      setError("No Indonesian products found. Try different keywords.");
      return;
    }

    // Auto-proceed to translation
    setTimeout(() => runTranslation(allResults), 500);
  };

  const normalizeIndoProduct = (item, marketplace, keyword) => {
    let price = 0;
    if (marketplace === "tokopedia") {
      price = item.price?.number || item.price || 0;
    } else {
      price = item.price || 0;
    }
    const name = item.name || item.title || item.productName || "";
    return {
      original_name: name,
      price_idr: typeof price === "number" ? price : parseInt(String(price).replace(/\D/g, "")) || 0,
      seller: item.shop?.name || item.seller || item.shopName || item.storeName || "",
      sold_count: item.sold || item.sold_count || item.historicalSold || item.totalSold || "0",
      marketplace,
      url: item.url || item.link || "",
      image: item.image || item.thumbnail || item.imageUrl || "",
      description: item.description || "",
      keyword,
    };
  };

  // ══════════ STEP 4.5: Translation ══════════

  const runTranslation = async (products) => {
    setStep(4.5);
    setProgress({ message: `Translating ${products.length} products...`, pct: 10 });
    addDiag("info", "deepdive", "Translation starting for " + products.length + " products");

    try {
      const texts = products.map(p => {
        const desc = (p.description || "").slice(0, 200);
        return desc ? `${p.original_name} — ${desc}` : p.original_name;
      });

      const res = await workerCall("translate_batch", { texts, source: "id", target: "en" });

      if (!res.translations?.length) throw new Error("No translations returned");

      const withTranslation = products.map((p, i) => ({
        ...p,
        translated_name: res.translations[i] || p.original_name,
      }));

      setTranslatedProducts(withTranslation);
      setProgress({ message: "Translation complete", pct: 100 });
      addDiag("ok", "deepdive", "Translation complete: " + withTranslation.length + " products");

      // Auto-proceed to embedding
      setTimeout(() => runEmbeddingFilter(withTranslation), 500);
    } catch (e) {
      setError("Translation failed: " + e.message);
      addDiag("error", "deepdive", "Translation failed: " + e.message);
    }
  };

  // ══════════ STEP 5a: Embedding Pre-filter ══════════

  const runEmbeddingFilter = async (products) => {
    setStep(5);
    setProgress({ message: `Ranking ${products.length} products by similarity...`, pct: 20 });
    addDiag("info", "deepdive", "Embedding filter starting for " + products.length + " products");

    try {
      // Build anchor text from golden thread
      const gt = goldenThread || {};
      const anchorParts = [
        gt.summary || "",
        ...(gt.must_have_specs || []),
        ...(gt.winning_attributes || []),
      ];
      const anchor_text = anchorParts.join(". ");

      const candidates = products.map((p, i) => ({
        id: i,
        text: p.translated_name || p.original_name,
      }));

      const res = await workerCall("embed_and_rank", { anchor_text, candidates, top_n: 15 });

      if (!res.ranked?.length) throw new Error("No ranked results returned");

      const top15 = res.ranked.map(r => ({
        ...products[r.id],
        _similarity: r.similarity,
        _rank_id: r.id,
      }));

      setEmbeddingFiltered(top15);
      setProgress({ message: `Top ${top15.length} candidates identified`, pct: 80 });
      addDiag("ok", "deepdive", "Embedding filter: top " + top15.length + " from " + products.length);

      // Auto-proceed to scoring
      setTimeout(() => runScoring(top15), 500);
    } catch (e) {
      setError("Embedding filter failed: " + e.message);
      addDiag("error", "deepdive", "Embedding failed: " + e.message);
    }
  };

  // ══════════ STEP 5b: Similarity Scoring ══════════

  const runScoring = async (top15) => {
    setProgress({ message: "Scoring top candidates with AI...", pct: 30 });
    addDiag("info", "deepdive", "Scoring " + top15.length + " candidates");

    const candidatesForPrompt = top15.map(p => ({
      original_name: p.original_name,
      translated_name: p.translated_name,
      price_idr: p.price_idr,
      seller: p.seller,
      sold_count: String(p.sold_count),
      marketplace: p.marketplace,
      url: p.url,
    }));

    const prompt = `You are a product sourcing analyst comparing Indonesian supplier products against a target product profile for the UAE market.

TARGET PROFILE (Golden Thread from Amazon.ae bestsellers):
${JSON.stringify(goldenThread, null, 1)}

INDONESIAN PRODUCTS TO SCORE (top 15 candidates, pre-filtered by embedding similarity):
${JSON.stringify(candidatesForPrompt, null, 1)}

Score each Indonesian product on a 1-5 scale:
5 = Near-identical to Amazon bestsellers. Contact this supplier immediately.
4 = Strong match, minor spec differences. Worth reaching out.
3 = Decent match, would need customization. Backup option.
2 = Same category but wrong spec. Skip unless desperate.
1 = Not relevant.

IMPORTANT SCORING GUIDELINES:
- Product type match is the highest priority factor
- Size differences are informational, NOT disqualifying. An Indonesian seller listing 100g jars who sells at high volume can likely produce 250g jars. Score based on manufacturing capability, note size difference in reasoning.
- Convert prices for comparison: 1 AED ≈ 4,300 IDR
- High sold_count signals manufacturing capability — a seller moving 5,000+ units is likely a producer, not just a reseller
- Consider: product type match, material/ingredient similarity, size/quantity relevance, price competitiveness, manufacturing capability signals, certification potential, packaging similarity

Respond ONLY in this exact JSON format with no other text:
{
  "scored_products": [
    {
      "original_name": "original Bahasa product name",
      "translated_name": "English translation",
      "marketplace": "tokopedia or shopee",
      "price_idr": 0,
      "seller": "seller name",
      "sold_count": "as string from source",
      "score": 5,
      "reasoning": "1-2 sentence explanation of why this score",
      "url": "original product URL"
    }
  ]
}

Sort by score descending, then by sold_count descending within same score.`;

    try {
      const res = await workerCall("claude", {
        data: {
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        },
      });

      const text = res.content?.map(b => b.text || "").join("") || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Scoring returned non-JSON");

      const parsed = JSON.parse(jsonMatch[0]);
      const scored = parsed.scored_products || [];

      // Merge similarity scores back
      scored.forEach(s => {
        const match = top15.find(p => p.original_name === s.original_name || p.url === s.url);
        if (match) s._similarity = match._similarity;
      });

      setScoredResults(scored);
      setStep(6);
      setProgress({ message: "Deep Dive complete!", pct: 100 });
      addDiag("ok", "deepdive", "Scoring complete: " + scored.length + " products scored");
    } catch (e) {
      setError("Scoring failed: " + e.message);
      addDiag("error", "deepdive", "Scoring failed: " + e.message);
    }
  };

  // ── Inline preview fetcher (reuses discPreviewCache) ──
  const fetchPreview = async (asin) => {
    if (previewCache[asin]) {
      setPreviewOpen(previewOpen === asin ? null : asin);
      return;
    }
    setPreviewLoading(true);
    setPreviewOpen(asin);
    try {
      const data = await workerCall("scrapingdog_product", { asin, domain: "ae" });
      setPreviewCache(prev => ({ ...prev, [asin]: data }));
    } catch (e) {
      addDiag("error", "deepdive", "Preview failed: " + asin + ": " + e.message);
    }
    setPreviewLoading(false);
  };

  // ══════════ RENDER HELPERS ══════════

  const pill = { display: "inline-block", padding: "2px 6px", borderRadius: "8px", fontSize: "9px", fontFamily: "monospace" };
  const cardStyle = { background: c.surface, border: "1px solid " + c.border, borderRadius: "6px", padding: "14px", marginBottom: "10px" };
  const labelStyle = { fontSize: "9px", color: c.dim, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px", fontFamily: "monospace" };
  const mono = { fontFamily: "'Inconsolata',monospace" };

  // ── Compact product row (used in Step 1.5 selection) ──
  const CompactRow = ({ product, idx, isSelected, onToggle, isAnchor }) => {
    const asin = product.asin;
    const size = extractSize(product.title || "");
    const isOpen = previewOpen === asin;
    const prevData = previewCache[asin];

    return (
      <div style={{ borderBottom: "1px solid " + c.border, background: isAnchor ? (dark ? "#1a2a1a" : "#f0faf0") : "transparent" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", cursor: "pointer" }} onClick={() => onToggle(asin)}>
          <input type="checkbox" checked={isSelected} onChange={() => onToggle(asin)} onClick={e => e.stopPropagation()} style={{ width: 16, height: 16, accentColor: c.gold }} />
          {product.image && <img src={product.image || product.thumbnail} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 3, background: "#fff" }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "11px", color: c.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...mono }}>{product.title || "—"}</div>
          </div>
          <div style={{ fontSize: "11px", color: c.gold, fontWeight: 600, whiteSpace: "nowrap", ...mono }}>{product.price ? ("AED " + parseFloat(product.price).toFixed(0)) : "—"}</div>
          <div style={{ fontSize: "10px", color: c.dim, whiteSpace: "nowrap" }}>{"⭐" + (product.rating || "—")}</div>
          {size && <span style={{ ...pill, background: dark ? "#1a2a2a" : "#e0f0f0", color: dark ? "#6dd" : "#077" }}>{size}</span>}
          {product._similarity != null && <span style={{ ...pill, background: dark ? "#2a2a1a" : "#faf0e0", color: c.gold }}>{(product._similarity * 100).toFixed(0)}%</span>}
          <button onClick={e => { e.stopPropagation(); fetchPreview(asin); }} style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "14px", color: c.dim, padding: "2px 4px" }} title="Preview">👁</button>
          {isAnchor && <span style={{ ...pill, background: c.gold + "22", color: c.gold, fontWeight: 700 }}>ANCHOR</span>}
        </div>

        {/* Inline preview */}
        {isOpen && (
          <div style={{ padding: "8px 16px 12px 60px", background: dark ? "#111" : "#fafafa", borderTop: "1px solid " + c.border }}>
            {previewLoading && !prevData ? <span style={{ fontSize: "10px", color: c.dim }}>Loading preview...</span> : prevData ? (
              <div style={{ fontSize: "10px", color: c.text }}>
                {prevData.feature_bullets?.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={labelStyle}>Key Features</span>
                    <ul style={{ margin: "2px 0 0 16px", padding: 0 }}>
                      {prevData.feature_bullets.slice(0, 5).map((b, i) => <li key={i} style={{ marginBottom: 2, lineHeight: 1.3 }}>{b}</li>)}
                    </ul>
                  </div>
                )}
                {prevData.product_information && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
                    {Object.entries(prevData.product_information).slice(0, 8).map(([k, v]) => (
                      <span key={k}><span style={{ color: c.dim }}>{k}:</span> {v}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : <span style={{ fontSize: "10px", color: c.dim }}>No preview data</span>}
          </div>
        )}
      </div>
    );
  };

  // ── Progress bar ──
  const ProgressBar = () => (
    progress.message ? (
      <div style={{ margin: "12px 0" }}>
        <div style={{ fontSize: "11px", color: c.dim, marginBottom: 4, ...mono }}>{progress.message}</div>
        <div style={{ height: 4, background: c.border, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: progress.pct + "%", background: c.gold, transition: "width 0.5s ease", borderRadius: 2 }} />
        </div>
      </div>
    ) : null
  );

  // ── Step indicator ──
  const StepIndicator = () => {
    const steps = [
      { n: 0, label: "Entry" },
      { n: 1.5, label: "Select" },
      { n: 2, label: "Scrape" },
      { n: 3, label: "Golden Thread" },
      { n: 4, label: "Indo Search" },
      { n: 4.5, label: "Translate" },
      { n: 5, label: "Score" },
      { n: 6, label: "Done" },
    ];
    return (
      <div style={{ display: "flex", gap: "2px", marginBottom: 16, flexWrap: "wrap" }}>
        {steps.map(s => {
          const active = step >= s.n;
          const current = step === s.n;
          return (
            <div key={s.n} style={{
              padding: "3px 8px", fontSize: "9px", fontFamily: "monospace", borderRadius: "3px",
              background: current ? c.gold : active ? (dark ? "#1a2a1a" : "#e0f0e0") : "transparent",
              color: current ? c.btnText : active ? c.green : c.dimmest,
              border: "1px solid " + (current ? c.gold : active ? c.green + "44" : c.border),
              fontWeight: current ? 700 : 400,
            }}>
              {s.label}
            </div>
          );
        })}
      </div>
    );
  };

  // ══════════ MAIN RENDER ══════════

  const toggleSelect = (asin) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(asin)) next.delete(asin);
      else next.add(asin);
      return next;
    });
  };

  const selectedCount = selected.size;
  const canProceed = selectedCount >= 5 && selectedCount <= 15;

  return (
    <div style={secStyle}>
      <h2 style={{ fontFamily: "'Lora',serif", fontWeight: 500, fontSize: "20px", color: c.text, margin: "0 0 4px" }}>🎯 Deep Dive</h2>
      <p style={{ fontSize: "11px", color: c.dim, margin: "0 0 16px", ...mono }}>Multi-step sourcing intelligence pipeline</p>

      <StepIndicator />
      <ProgressBar />

      {error && <div style={{ padding: "10px 12px", background: dark ? "#2a1a1a" : "#fef2f2", border: "1px solid " + c.red + "44", borderRadius: "4px", color: c.red, fontSize: "11px", marginBottom: 12, ...mono }}>{error}</div>}

      {/* ══════════ STEP 0: Empty State — Start from Discover or Lookup ══════════ */}
      {step === 0 && !deepDiveEntry && (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px", opacity: 0.15 }}>{"\ud83c\udfaf"}</div>
          <div style={{ fontSize: "14px", color: c.text, fontWeight: 500, marginBottom: "8px" }}>Start a Deep Dive from Discover or Lookup</div>
          <div style={{ fontSize: "11px", color: c.dim, lineHeight: 1.6, maxWidth: "380px", margin: "0 auto 20px" }}>
            Deep Dive analyzes Amazon bestsellers, extracts what makes them sell, and finds matching Indonesian suppliers scored 1{"\u2013"}5.
          </div>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <div style={{ padding: "14px 18px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "8px", maxWidth: "220px", textAlign: "left" }}>
              <div style={{ fontSize: "16px", marginBottom: "4px" }}>{"\ud83d\udd0d"}</div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: c.gold, marginBottom: "4px" }}>From Discover</div>
              <div style={{ fontSize: "10px", color: c.dim, lineHeight: 1.4 }}>Switch to list view {"\u2192"} check 5{"\u2013"}15 products {"\u2192"} tap the floating Deep Dive button</div>
            </div>
            <div style={{ padding: "14px 18px", background: c.surface2, border: "1px solid " + c.border, borderRadius: "8px", maxWidth: "220px", textAlign: "left" }}>
              <div style={{ fontSize: "16px", marginBottom: "4px" }}>{"\u26a1"}</div>
              <div style={{ fontSize: "11px", fontWeight: 600, color: c.gold, marginBottom: "4px" }}>From Lookup</div>
              <div style={{ fontSize: "10px", color: c.dim, lineHeight: 1.4 }}>Run a product lookup {"\u2192"} go to results {"\u2192"} tap "Deep Dive from this product"</div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ STEP 1.5: Product Selection ══════════ */}
      {step === 1.5 && (
        <div style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div>
              <div style={labelStyle}>Select Products for Deep Dive</div>
              <span style={{ fontSize: "10px", color: c.dim, ...mono }}>{searchResults.length} results — select 5-15 products</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                ...pill, fontSize: "10px", fontWeight: 600,
                background: canProceed ? c.green + "22" : c.gold + "22",
                color: canProceed ? c.green : c.gold,
              }}>
                {selectedCount} selected
              </span>
              <button
                onClick={() => {
                  const asins = [...selected];
                  // Clear entry to avoid re-triggering
                  setDeepDiveEntry(null);
                  runDeepScrape(asins);
                }}
                disabled={!canProceed}
                style={{
                  ...btnGreen, padding: "6px 16px", fontSize: "11px",
                  opacity: canProceed ? 1 : 0.4, cursor: canProceed ? "pointer" : "not-allowed",
                }}
              >
                Proceed →
              </button>
            </div>
          </div>

          {searchLoading && <div style={{ textAlign: "center", padding: "20px", color: c.dim, fontSize: "11px" }}>Searching Amazon.ae...</div>}

          <div style={{ border: "1px solid " + c.border, borderRadius: "4px", maxHeight: "400px", overflowY: "auto" }}>
            {searchResults.map((p, i) => {
              const anchorAsin = anchorRef.current?.asin || anchorRef.current?._asin;
              return (
                <CompactRow
                  key={p.asin || i}
                  product={p}
                  idx={i}
                  isSelected={selected.has(p.asin)}
                  onToggle={toggleSelect}
                  isAnchor={p.asin === anchorAsin}
                />
              );
            })}
          </div>

          {!canProceed && selectedCount > 0 && selectedCount < 5 && (
            <div style={{ fontSize: "10px", color: c.gold, marginTop: 6, ...mono }}>Select at least 5 products to proceed ({5 - selectedCount} more needed)</div>
          )}
        </div>
      )}

      {/* ══════════ STEP 2: Scrape Summary ══════════ */}
      {step >= 2 && scrapedProducts.length > 0 && (
        <div style={{ ...cardStyle, borderColor: step === 2 ? c.gold + "66" : c.border }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: step === 2 ? 8 : 0 }}
            onClick={() => setExpandedScrape(expandedScrape === "all" ? null : "all")}>
            <div style={labelStyle}>Step 2 — Products Scraped ({scrapedProducts.length}){scrapeErrors.length > 0 && <span style={{ color: c.red, marginLeft: 6 }}>{scrapeErrors.length} failed</span>}</div>
            <span style={{ fontSize: "10px", color: c.dim }}>{expandedScrape === "all" ? "▼" : "▶"}</span>
          </div>

          {expandedScrape === "all" && (
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", ...mono }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid " + c.border }}>
                    <th style={{ textAlign: "left", padding: "4px 6px", color: c.dim }}>#</th>
                    <th style={{ textAlign: "left", padding: "4px 6px", color: c.dim }}>Title</th>
                    <th style={{ textAlign: "right", padding: "4px 6px", color: c.dim }}>Price</th>
                    <th style={{ textAlign: "center", padding: "4px 6px", color: c.dim }}>Rating</th>
                    <th style={{ textAlign: "right", padding: "4px 6px", color: c.dim }}>Reviews</th>
                  </tr>
                </thead>
                <tbody>
                  {scrapedProducts.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid " + c.border + "44" }}>
                      <td style={{ padding: "4px 6px", color: c.dim }}>{i + 1}</td>
                      <td style={{ padding: "4px 6px", color: c.text, maxWidth: "300px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title || "—"}</td>
                      <td style={{ padding: "4px 6px", color: c.gold, textAlign: "right" }}>{p.price || "—"}</td>
                      <td style={{ padding: "4px 6px", textAlign: "center" }}>{"⭐" + (p.average_rating || "—")}</td>
                      <td style={{ padding: "4px 6px", textAlign: "right", color: c.dim }}>{p.total_reviews || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════ STEP 3: Golden Thread ══════════ */}
      {step >= 3 && goldenThread && (
        <div style={{ ...cardStyle, borderColor: step === 3 ? c.gold + "66" : c.border }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
            onClick={() => setGoldenExpanded(!goldenExpanded)}>
            <div>
              <div style={labelStyle}>Step 3 — Golden Thread</div>
              <span style={{ fontSize: "12px", color: c.text, fontFamily: "'Lora',serif" }}>{goldenThread.category}</span>
            </div>
            <span style={{ fontSize: "10px", color: c.dim }}>{goldenExpanded ? "▼" : "▶"}</span>
          </div>

          {goldenExpanded && (
            <div style={{ marginTop: 12, fontSize: "11px", lineHeight: 1.5 }}>
              {/* Summary */}
              <div style={{ padding: "10px", background: dark ? "#0a1a0a" : "#f0faf0", borderRadius: 4, marginBottom: 10, color: c.text }}>
                {goldenThread.summary}
              </div>

              {/* Price Band */}
              {goldenThread.price_band && (
                <div style={{ display: "flex", gap: "12px", marginBottom: 10, flexWrap: "wrap" }}>
                  <div>
                    <span style={{ ...labelStyle, display: "block" }}>Raw Price</span>
                    <span style={{ color: c.gold, ...mono }}>
                      {goldenThread.price_band.raw.min}–{goldenThread.price_band.raw.max} {goldenThread.price_band.raw.currency} (med: {goldenThread.price_band.raw.median})
                    </span>
                  </div>
                  {goldenThread.price_band.per_unit && (
                    <div>
                      <span style={{ ...labelStyle, display: "block" }}>Per Unit</span>
                      <span style={{ color: c.green, ...mono }}>
                        {goldenThread.price_band.per_unit.min}–{goldenThread.price_band.per_unit.max} ({goldenThread.price_band.per_unit.unit})
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Specs */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: 10 }}>
                {goldenThread.must_have_specs?.length > 0 && (
                  <div>
                    <span style={labelStyle}>Must-Have Specs</span>
                    <ul style={{ margin: "4px 0 0 16px", padding: 0, color: c.text }}>
                      {goldenThread.must_have_specs.map((s, i) => <li key={i} style={{ marginBottom: 2 }}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {goldenThread.winning_attributes?.length > 0 && (
                  <div>
                    <span style={labelStyle}>Winning Attributes</span>
                    <ul style={{ margin: "4px 0 0 16px", padding: 0, color: c.text }}>
                      {goldenThread.winning_attributes.map((a, i) => <li key={i} style={{ marginBottom: 2 }}>{a}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {/* Certs, Packaging, Red Flags */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: 10 }}>
                {goldenThread.certifications?.map((cert, i) => <span key={i} style={{ ...pill, background: dark ? "#1a2a1a" : "#e0f0e0", color: c.green }}>✓ {cert}</span>)}
              </div>
              {goldenThread.packaging && <div style={{ fontSize: "10px", color: c.dim, marginBottom: 6 }}>📦 {goldenThread.packaging}</div>}
              {goldenThread.red_flags?.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <span style={labelStyle}>Red Flags</span>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: 4 }}>
                    {goldenThread.red_flags.map((rf, i) => <span key={i} style={{ ...pill, background: dark ? "#2a1a1a" : "#fef2f2", color: c.red }}>⚠ {rf}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Editable Keywords */}
          {step === 3 && (
            <div style={{ marginTop: 12 }}>
              <div style={labelStyle}>Indonesian Search Keywords (edit, then proceed)</div>
              <textarea
                value={indoKeywords}
                onChange={e => setIndoKeywords(e.target.value)}
                rows={Math.min(8, (indoKeywords.split("\n").length || 3) + 1)}
                style={{ ...inputStyle, width: "100%", padding: "8px 10px", fontSize: "11px", fontFamily: "'Inconsolata',monospace", resize: "vertical", lineHeight: 1.6 }}
                placeholder="One keyword per line..."
              />

              {/* Use existing Lookup results toggle */}
              {deepDiveEntry?.source === "lookup" && existingIndoRef.current?.length > 0 && (
                <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: 8, fontSize: "11px", color: c.dim, cursor: "pointer" }}>
                  <input type="checkbox" checked={useExistingLookup} onChange={e => setUseExistingLookup(e.target.checked)} style={{ accentColor: c.gold }} />
                  Use existing Lookup results ({existingIndoRef.current.length} products) instead of fresh search
                </label>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button onClick={runIndoSearch} style={{ ...btnStyle, padding: "8px 24px", fontSize: "12px" }}>
                  Find Indonesian Sources →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ STEP 4: Indo Search Progress ══════════ */}
      {step >= 4 && step < 6 && indoSearchProgress && (
        <div style={{ ...cardStyle, borderColor: step === 4 ? c.gold + "66" : c.border }}>
          <div style={labelStyle}>Step 4 — Indonesian Sources</div>
          <div style={{ fontSize: "11px", color: c.text, ...mono }}>{indoSearchProgress}</div>
          {indoProducts.length > 0 && (
            <div style={{ fontSize: "10px", color: c.dim, marginTop: 4 }}>{indoProducts.length} products found across Tokopedia + Shopee</div>
          )}
        </div>
      )}

      {/* ══════════ STEP 6: Final Scored Results ══════════ */}
      {step === 6 && scoredResults.length > 0 && (
        <div style={cardStyle}>
          <div style={labelStyle}>Results — Scored Indonesian Suppliers</div>
          <p style={{ fontSize: "10px", color: c.dim, margin: "0 0 12px" }}>
            {scoredResults.length} products scored from {indoProducts.length} candidates
          </p>

          {scoredResults.map((item, i) => {
            const scoreColor = SCORE_COLORS[item.score] || "#888";
            const priceAed = item.price_idr ? (item.price_idr / IDR_PER_AED).toFixed(1) : "—";
            const isExpanded = expandedScore === i;

            return (
              <div key={i} style={{
                border: "1px solid " + scoreColor + "44",
                borderRadius: "6px",
                marginBottom: "8px",
                background: dark ? scoreColor + "08" : scoreColor + "06",
                overflow: "hidden",
              }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", cursor: "pointer" }}
                  onClick={() => setExpandedScore(isExpanded ? null : i)}
                >
                  {/* Score badge */}
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    background: scoreColor, color: item.score >= 3 ? "#000" : "#fff", fontWeight: 800, fontSize: "14px", fontFamily: "monospace", flexShrink: 0,
                  }}>
                    {item.score}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12px", color: c.text, fontWeight: 500 }}>{item.translated_name || item.original_name}</div>
                    <div style={{ fontSize: "10px", color: c.dim, marginTop: 2, ...mono }}>
                      <span style={{ ...pill, background: item.marketplace === "tokopedia" ? "#0b8" + "22" : "#f60" + "22", color: item.marketplace === "tokopedia" ? "#0b8" : "#f60" }}>
                        {item.marketplace}
                      </span>
                      <span style={{ marginLeft: 8 }}>{item.seller}</span>
                      {item.sold_count && item.sold_count !== "0" && <span style={{ marginLeft: 8, color: c.green }}>🔥 {item.sold_count} sold</span>}
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: "12px", color: c.gold, fontWeight: 600, ...mono }}>
                      IDR {(item.price_idr || 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: "9px", color: c.dim, ...mono }}>≈ AED {priceAed}</div>
                  </div>

                  <span style={{ fontSize: "10px", color: c.dim }}>{isExpanded ? "▼" : "▶"}</span>
                </div>

                {isExpanded && (
                  <div style={{ padding: "0 12px 12px 54px", fontSize: "11px" }}>
                    {/* Original name */}
                    <div style={{ color: c.dim, marginBottom: 6, fontStyle: "italic" }}>{item.original_name}</div>

                    {/* Reasoning */}
                    <div style={{ color: c.text, lineHeight: 1.5, marginBottom: 8, padding: "8px 10px", background: dark ? "#111" : "#fafafa", borderRadius: 4 }}>
                      {item.reasoning}
                    </div>

                    {/* Similarity score if available */}
                    {item._similarity != null && (
                      <span style={{ ...pill, background: c.gold + "22", color: c.gold, marginRight: 8 }}>Similarity: {(item._similarity * 100).toFixed(1)}%</span>
                    )}

                    {/* Link */}
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "10px", color: c.gold, textDecoration: "none" }}>
                        View on {item.marketplace === "tokopedia" ? "Tokopedia" : "Shopee"} ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════ RESET / START OVER ══════════ */}
      {step > 0 && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button onClick={() => {
            setStep(0);
            setError("");
            setProgress({ message: "", pct: 0 });
            setSearchResults([]);
            setSelected(new Set());
            setScrapedProducts([]);
            setScrapeErrors([]);
            setGoldenThread(null);
            setIndoKeywords("");
            setIndoProducts([]);
            setTranslatedProducts([]);
            setEmbeddingFiltered([]);
            setScoredResults([]);
            setDeepDiveEntry(null);
            anchorRef.current = null;
            existingIndoRef.current = null;
          }} style={{ ...btnSec, padding: "6px 20px", fontSize: "10px" }}>
            ↺ Start New Deep Dive
          </button>
        </div>
      )}
    </div>
  );
}

const { XMLParser } = require("fast-xml-parser");

const DEFAULT_SITEMAP_INDEX_URL =
  "https://cellphones.com.vn/sitemap/sitemap_index.xml?v=google";
const SITE_ORIGIN = "https://cellphones.com.vn";
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function isBotChallenge(text) {
  const sample = String(text || "").slice(0, 20_000).toLowerCase();
  return sample.includes("<html")
    && (sample.includes("captcha") || sample.includes("cloudflare"))
    && (sample.includes("verify") || sample.includes("security"));
}

async function fetchText(url, {
  timeoutMs = 30_000,
  retries = 2,
  retryDelayMs = 800,
  userAgent = process.env.SCRAPER_USER_AGENT
    || "Mozilla/5.0 (compatible; cosarii-cellphones-route-audit/1.0)",
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/xml,text/xml,text/html,*/*",
          "accept-language": "vi,en;q=0.8",
          "user-agent": userAgent,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      if (isBotChallenge(text)) throw new Error("anti-bot challenge");
      return { response, text };
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelayMs * (attempt + 1))
        );
      }
    }
  }
  throw new Error(`${lastError?.message || "request failed"} for ${url}`);
}

function parseSitemapIndex(xml) {
  const parsed = xmlParser.parse(xml);
  return asArray(parsed.sitemapindex?.sitemap)
    .map((node) => ({
      loc: node?.loc,
      lastmod: node?.lastmod || null,
      type: classifySitemap(node?.loc),
    }))
    .filter((entry) => entry.loc);
}

function classifySitemap(url = "") {
  const filename = String(url).split("/").pop()?.split("?")[0] || "";
  if (filename.startsWith("product-sitemap")) return "product";
  if (filename.startsWith("category-sitemap")) return "category";
  if (filename.startsWith("page-filter-sitemap")) return "filter";
  if (filename.startsWith("page-sitemap")) return "page";
  return "other";
}

function parseUrlSitemap(xml, sitemap) {
  const parsed = xmlParser.parse(xml);
  return asArray(parsed.urlset?.url)
    .map((node) => ({
      url: node?.loc,
      lastmod: node?.lastmod || null,
      sitemapUrl: sitemap.loc,
      sitemapType: sitemap.type,
    }))
    .filter((entry) => entry.url?.startsWith(`${SITE_ORIGIN}/`));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, worker)
  );
  return results;
}

async function collectSitemapInventory({
  indexUrl = DEFAULT_SITEMAP_INDEX_URL,
  types = ["page", "category", "filter", "product"],
  concurrency = 3,
  timeoutMs = 30_000,
  onSitemap,
} = {}) {
  const { text: indexXml } = await fetchText(indexUrl, { timeoutMs });
  const sitemaps = parseSitemapIndex(indexXml).filter((item) => types.includes(item.type));
  const details = await mapWithConcurrency(sitemaps, concurrency, async (sitemap, index) => {
    try {
      const { text } = await fetchText(sitemap.loc, { timeoutMs });
      const urls = parseUrlSitemap(text, sitemap);
      onSitemap?.({ ...sitemap, index, count: urls.length, status: "ok" });
      return { ...sitemap, index, status: "ok", urls };
    } catch (error) {
      onSitemap?.({
        ...sitemap,
        index,
        count: 0,
        status: error.message.includes("anti-bot") ? "anti-bot" : "error",
        error: error.message,
      });
      return {
        ...sitemap,
        index,
        status: error.message.includes("anti-bot") ? "anti-bot" : "error",
        error: error.message,
        urls: [],
      };
    }
  });

  const urlMap = new Map();
  for (const detail of details) {
    for (const entry of detail.urls) {
      if (!urlMap.has(entry.url)) urlMap.set(entry.url, entry);
    }
  }

  return {
    indexUrl,
    collectedAt: new Date().toISOString(),
    sitemaps: details,
    urls: [...urlMap.values()],
  };
}

module.exports = {
  DEFAULT_SITEMAP_INDEX_URL,
  SITE_ORIGIN,
  asArray,
  classifySitemap,
  collectSitemapInventory,
  fetchText,
  isBotChallenge,
  mapWithConcurrency,
  parseSitemapIndex,
  parseUrlSitemap,
};

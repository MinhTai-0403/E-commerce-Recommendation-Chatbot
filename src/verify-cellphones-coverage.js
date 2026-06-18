const { XMLParser } = require("fast-xml-parser");
const { createMongoClient, getMongoConfig } = require("./mongodb");

const SITEMAP_INDEX_URL =
  "https://cellphones.com.vn/sitemap/sitemap_index.xml?v=google";
const SITE_ORIGIN = "https://cellphones.com.vn";
const SOURCE_SITE = "cellphones";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function parseArgs(argv) {
  const args = {
    sitemapStart: 0,
    sitemapLimit: null,
    sampleMissing: 20,
  };

  for (const arg of argv) {
    const [name, value] = arg.split("=");
    if (name === "--sitemap-start") args.sitemapStart = Number(value || 0);
    else if (name === "--sitemap-limit") args.sitemapLimit = numberOrNull(value);
    else if (name === "--sample-missing") args.sampleMissing = Number(value || 20);
  }

  args.sitemapStart = Math.max(0, args.sitemapStart || 0);
  args.sampleMissing = Math.max(0, args.sampleMissing || 0);
  return args;
}

function numberOrNull(value) {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/xml,text/xml,*/*",
      "user-agent":
        process.env.SCRAPER_USER_AGENT ||
        "Mozilla/5.0 (compatible; cosarii-cellphones-verifier/1.0)",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
  }

  const text = await response.text();

  if (isBotChallenge(text)) {
    throw new Error(
      `Bot protection challenge returned for ${url}. Pause and retry verification later.`
    );
  }

  return text;
}

function isBotChallenge(text) {
  const sample = String(text || "").slice(0, 12000).toLowerCase();

  return (
    sample.includes("<html") &&
    sample.includes("captcha") &&
    sample.includes("verify") &&
    sample.includes("security")
  );
}

function parseSitemapIndex(xml) {
  const parsed = xmlParser.parse(xml);

  return asArray(parsed.sitemapindex && parsed.sitemapindex.sitemap)
    .map((sitemap) => sitemap.loc)
    .filter((url) =>
      /^https:\/\/cellphones\.com\.vn\/sitemap\/product-sitemap/.test(url)
    );
}

function parseProductSitemap(xml) {
  const parsed = xmlParser.parse(xml);

  return asArray(parsed.urlset && parsed.urlset.url)
    .map((node) => node.loc)
    .filter(
      (url) => url && url.startsWith(`${SITE_ORIGIN}/`) && url.endsWith(".html")
    );
}

async function collectSitemapUrls(args) {
  const indexXml = await fetchText(SITEMAP_INDEX_URL);
  const selectedSitemaps = parseSitemapIndex(indexXml).slice(
    args.sitemapStart,
    args.sitemapLimit ? args.sitemapStart + args.sitemapLimit : undefined
  );
  const urls = [];

  if (selectedSitemaps.length === 0) {
    throw new Error(
      "No product sitemaps parsed from sitemap index. The site may have returned a challenge page."
    );
  }

  for (const sitemap of selectedSitemaps) {
    const xml = await fetchText(sitemap);
    const productUrls = parseProductSitemap(xml);

    if (productUrls.length === 0) {
      throw new Error(
        `No product URLs parsed from ${sitemap}. The site may have returned a challenge page.`
      );
    }

    urls.push(...productUrls);
    console.log(`[sitemap] ${sitemap} -> ${productUrls.length} URLs`);
  }

  return [...new Set(urls)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sitemapUrls = await collectSitemapUrls(args);
  const sitemapUrlSet = new Set(sitemapUrls);
  const client = createMongoClient();
  const { dbName, productsCollection } = getMongoConfig();

  try {
    await client.connect();
    const db = client.db(dbName);
    const products = db.collection(productsCollection);
    const errors = db.collection(`${productsCollection}_errors`);
    const docs = await products
      .find(
        { source: SOURCE_SITE },
        { projection: { _id: 0, url: 1, sourceUrls: 1 } }
      )
      .toArray();
    const covered = new Set();

    for (const doc of docs) {
      if (sitemapUrlSet.has(doc.url)) covered.add(doc.url);
      for (const sourceUrl of asArray(doc.sourceUrls)) {
        if (sitemapUrlSet.has(sourceUrl)) covered.add(sourceUrl);
      }
    }

    const missing = sitemapUrls.filter((url) => !covered.has(url));
    const [productCount, errorCount] = await Promise.all([
      products.countDocuments({ source: SOURCE_SITE }),
      errors.countDocuments({ source: SOURCE_SITE }),
    ]);

    console.log(
      JSON.stringify(
        {
          dbName,
          productsCollection,
          sitemapUrls: sitemapUrls.length,
          coveredUrls: covered.size,
          missingUrls: missing.length,
          productDocuments: productCount,
          scrapeErrors: errorCount,
          sampleMissing: missing.slice(0, args.sampleMissing),
        },
        null,
        2
      )
    );

    if (missing.length > 0 || errorCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

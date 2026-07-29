const cheerio = require("cheerio");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const {
  SITE_ORIGIN,
  collectSitemapInventory,
  fetchText,
  mapWithConcurrency,
} = require("../cellphones/sitemap-inventory");
const { normalizePublicPath } = require("../cellphones/public-route-registry");
const {
  PAGE_SNAPSHOTS_COLLECTION,
  sanitizeHtml,
  sanitizeLinkHref,
} = require("../server/content-api");

function parseArgs(argv) {
  const args = {
    concurrency: 3,
    limit: 0,
    timeoutMs: 30_000,
    types: ["page", "category", "filter"],
    paths: [],
    dryRun: false,
  };
  for (const arg of argv) {
    const [name, value = ""] = arg.split("=");
    if (name === "--concurrency") args.concurrency = Math.max(1, Math.min(8, Number(value) || 3));
    else if (name === "--limit") args.limit = Math.max(0, Number(value) || 0);
    else if (name === "--timeout-ms") args.timeoutMs = Math.max(5000, Number(value) || 30_000);
    else if (name === "--types") args.types = value.split(",").map((item) => item.trim()).filter(Boolean);
    else if (name === "--paths") args.paths = value.split(",").map((item) => normalizePublicPath(item.trim())).filter(Boolean);
    else if (name === "--dry-run") args.dryRun = true;
  }
  return args;
}

function text($, selector, max = 5000) {
  return $(selector).first().text().replace(/\s+/g, " ").trim().slice(0, max);
}

function contentSections($) {
  const sections = [];
  $("main h1, main h2, main h3").slice(0, 60).each((index, element) => {
    const heading = $(element);
    const body = heading.nextUntil("h1,h2,h3").find("p").addBack("p")
      .map((_, node) => $(node).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean)
      .slice(0, 8)
      .join("\n");
    sections.push({
      id: heading.attr("id") || `section-${index + 1}`,
      type: "content",
      title: heading.text().replace(/\s+/g, " ").trim().slice(0, 500),
      text: body.slice(0, 20_000),
      html: sanitizeHtml(heading.nextUntil("h1,h2,h3").slice(0, 12).toString()),
      links: heading.nextUntil("h1,h2,h3").find("a[href]").slice(0, 30)
        .map((_, anchor) => ({
          label: $(anchor).text().replace(/\s+/g, " ").trim().slice(0, 500),
          href: sanitizeLinkHref($(anchor).attr("href") || ""),
        })).get(),
    });
  });
  return sections;
}

function buildSnapshot(entry, html, finalUrl, version) {
  const $ = cheerio.load(html);
  const canonical = $('link[rel="canonical"]').attr("href") || finalUrl || entry.url;
  const canonicalUrl = new URL(canonical, SITE_ORIGIN);
  const title = text($, "title", 1000) || text($, "h1", 1000);
  const description = $('meta[name="description"]').attr("content") || "";
  return {
    path: normalizePublicPath(canonicalUrl.pathname),
    pageType: entry.sitemapType,
    sourceUrl: entry.url,
    finalUrl: finalUrl || entry.url,
    status: "published",
    capturedAt: new Date(),
    lastModified: entry.lastmod ? new Date(entry.lastmod) : null,
    version,
    title,
    description,
    seo: {
      title,
      description,
      canonical: canonicalUrl.href,
      robots: $('meta[name="robots"]').attr("content") || "index,follow",
      image: $('meta[property="og:image"]').attr("content") || "",
    },
    sections: contentSections($),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = new Date().toISOString().replace(/[:.]/g, "-");
  const inventory = args.paths.length
    ? {
      urls: args.paths.map((pathname) => ({
        url: new URL(pathname, SITE_ORIGIN).href,
        sitemapType: "page",
        lastmod: null,
      })),
    }
    : await collectSitemapInventory({
      types: args.types,
      concurrency: args.concurrency,
      timeoutMs: args.timeoutMs,
      onSitemap: (item) => console.log(`[sitemap] ${item.type} ${item.count} ${item.loc}`),
    });
  const entries = args.limit ? inventory.urls.slice(0, args.limit) : inventory.urls;
  console.log(`[snapshot] ${entries.length} pages, version=${version}, dryRun=${args.dryRun}`);

  const snapshots = await mapWithConcurrency(entries, args.concurrency, async (entry, index) => {
    try {
      const { response, text: html } = await fetchText(entry.url, {
        timeoutMs: args.timeoutMs,
        retries: 2,
      });
      const snapshot = buildSnapshot(entry, html, response.url, version);
      if ((index + 1) % 25 === 0 || index === entries.length - 1) {
        console.log(`[snapshot] ${index + 1}/${entries.length}`);
      }
      return snapshot;
    } catch (error) {
      console.warn(`[snapshot:error] ${entry.url}: ${error.message}`);
      return null;
    }
  });
  const valid = snapshots.filter(Boolean);
  if (args.dryRun) {
    console.log(JSON.stringify({
      version,
      discovered: inventory.urls.length,
      attempted: entries.length,
      captured: valid.length,
      sample: valid.slice(0, 3).map(({ path, pageType, title }) => ({ path, pageType, title })),
    }, null, 2));
    return;
  }

  const client = createMongoClient();
  const { dbName } = getMongoConfig();
  await client.connect();
  try {
    const collection = client.db(dbName).collection(PAGE_SNAPSHOTS_COLLECTION);
    await Promise.all([
      collection.createIndex({ path: 1, version: -1 }),
      collection.createIndex({ sourceUrl: 1, version: -1 }),
      collection.createIndex({ pageType: 1, capturedAt: -1 }),
    ]);
    for (let index = 0; index < valid.length; index += 500) {
      const chunk = valid.slice(index, index + 500);
      await collection.bulkWrite(chunk.map((snapshot) => ({
        updateOne: {
          filter: { path: snapshot.path, version: snapshot.version },
          update: { $set: snapshot, $setOnInsert: { createdAt: new Date() } },
          upsert: true,
        },
      })), { ordered: false });
    }
    console.log(`[snapshot] stored=${valid.length} collection=${PAGE_SNAPSHOTS_COLLECTION}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

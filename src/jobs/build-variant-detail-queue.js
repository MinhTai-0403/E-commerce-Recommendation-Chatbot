const fs = require("fs/promises");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const { hydrateProductDetail } = require("../storage/product-detail-storage");

function parseArgs(argv = []) {
  const args = {
    output: "logs/variant-detail-queue.txt",
    minSourceJsonBytes: 5000,
    minTargetJsonBytes: 5000,
    updatedSince: "",
    limit: 0,
  };

  for (const arg of argv) {
    if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg.startsWith("--min-source-json-bytes=")) args.minSourceJsonBytes = Number(arg.slice("--min-source-json-bytes=".length)) || 0;
    else if (arg.startsWith("--min-target-json-bytes=")) args.minTargetJsonBytes = Number(arg.slice("--min-target-json-bytes=".length)) || 0;
    else if (arg.startsWith("--updated-since=")) args.updatedSince = arg.slice("--updated-since=".length);
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length)) || 0;
  }

  return args;
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function getSlugFromUrl(url = "") {
  const match = String(url || "").match(/\/([^/?#]+?)(?:\.html)?(?:[?#].*)?$/i);
  return match ? match[1].replace(/\.html$/i, "") : "";
}

function normalizeCellphonesUrl(url = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(raw, "https://cellphones.com.vn");
    if (!/cellphones\.com\.vn$/i.test(parsed.hostname)) return "";
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function isWeakManifest(manifest, minTargetJsonBytes) {
  if (!manifest) return { weak: true, reason: "missing" };
  if (!manifest.name && !manifest.productName) return { weak: true, reason: "missing-name" };
  if (!Number(manifest.currentPrice)) return { weak: true, reason: "missing-price" };
  if (!manifest.thumbnail && !manifest.image && !manifest.primaryImage && !(manifest.images || []).length) {
    return { weak: true, reason: "missing-image" };
  }
  if ((manifest.storage?.jsonBytes || 0) < minTargetJsonBytes) {
    return { weak: true, reason: "small-detail" };
  }
  if ((manifest.counts?.media || 0) === 0 && (manifest.counts?.specifications || 0) === 0) {
    return { weak: true, reason: "empty-counts" };
  }

  return { weak: false, reason: "" };
}

function detailLookupForVariant(variant = {}) {
  const url = normalizeCellphonesUrl(variant.url || variant.href || variant.sourceUrl || "");
  const slug = variant.slug || getSlugFromUrl(url);
  const or = [];

  if (slug) {
    or.push({ slug });
    or.push({ sku: slug });
  }

  if (url) {
    or.push({ url });
    or.push({ inputUrl: url });
    or.push({ sourceUrl: url });
    or.push({ sourceUrls: url });
  }

  return or.length ? { $or: or } : null;
}

function rememberVariantManifest(index, manifest) {
  const remember = (key) => {
    if (key && !index.has(key)) index.set(key, manifest);
  };

  remember(`slug:${manifest.slug}`);
  remember(`slug:${manifest.sku}`);
  remember(`slug:${getSlugFromUrl(manifest.url)}`);
  remember(`slug:${getSlugFromUrl(manifest.inputUrl)}`);
  remember(`slug:${getSlugFromUrl(manifest.sourceUrl)}`);
  remember(`url:${normalizeCellphonesUrl(manifest.url)}`);
  remember(`url:${normalizeCellphonesUrl(manifest.inputUrl)}`);
  remember(`url:${normalizeCellphonesUrl(manifest.sourceUrl)}`);

  for (const sourceUrl of manifest.sourceUrls || []) {
    remember(`slug:${getSlugFromUrl(sourceUrl)}`);
    remember(`url:${normalizeCellphonesUrl(sourceUrl)}`);
  }
}

function findVariantManifestInIndex(index, variant) {
  const url = normalizeCellphonesUrl(variant.url || variant.href || variant.sourceUrl || "");
  const slug = variant.slug || getSlugFromUrl(url);

  return (
    index.get(`slug:${slug}`) ||
    index.get(`url:${url}`) ||
    null
  );
}

async function loadVariantManifestIndex(productDetails, variants) {
  const index = new Map();
  const slugs = uniqueStrings(variants.map((variant) => variant.slug || getSlugFromUrl(variant.url)));
  const urls = uniqueStrings(variants.map((variant) => normalizeCellphonesUrl(variant.url || variant.href || variant.sourceUrl || "")));
  const projection = {
    slug: 1,
    sku: 1,
    url: 1,
    sourceUrl: 1,
    inputUrl: 1,
    sourceUrls: 1,
    name: 1,
    productName: 1,
    currentPrice: 1,
    thumbnail: 1,
    image: 1,
    primaryImage: 1,
    images: { $slice: 1 },
    storage: 1,
    counts: 1,
    updatedAt: 1,
    scrapedAt: 1,
  };

  for (let indexStart = 0; indexStart < Math.max(slugs.length, urls.length); indexStart += 500) {
    const slugChunk = slugs.slice(indexStart, indexStart + 500);
    const urlChunk = urls.slice(indexStart, indexStart + 500);
    const or = [];

    if (slugChunk.length) {
      or.push({ slug: { $in: slugChunk } });
      or.push({ sku: { $in: slugChunk } });
    }

    if (urlChunk.length) {
      or.push({ url: { $in: urlChunk } });
      or.push({ inputUrl: { $in: urlChunk } });
      or.push({ sourceUrl: { $in: urlChunk } });
      or.push({ sourceUrls: { $in: urlChunk } });
    }

    if (!or.length) continue;

    const manifests = await productDetails
      .find({ $or: or }, { projection })
      .sort({ updatedAt: -1, scrapedAt: -1 })
      .toArray();

    for (const manifest of manifests) {
      rememberVariantManifest(index, manifest);
    }
  }

  return index;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = createMongoClient();
  const { dbName, productDetailsCollection } = getMongoConfig();
  await client.connect();

  try {
    const db = client.db(dbName);
    const productDetails = db.collection(productDetailsCollection);
    const sourceQuery = {
      source: "cellphones",
      "storage.type": { $in: ["local-gzip", "inline-gzip"] },
      "storage.jsonBytes": { $gte: args.minSourceJsonBytes },
      "counts.variants": { $gt: 0 },
    };

    if (args.updatedSince) {
      sourceQuery.updatedAt = { $gte: new Date(args.updatedSince) };
    }

    const cursor = productDetails
      .find(sourceQuery, {
        projection: {
          slug: 1,
          name: 1,
          url: 1,
          storage: 1,
          counts: 1,
          updatedAt: 1,
        },
      })
      .sort({ updatedAt: -1, scrapedAt: -1 })
      .batchSize(100);
    const variants = [];
    const queued = [];
    const seenUrls = new Set();
    const reasonCounts = {};
    let scannedSources = 0;

    for await (const manifest of cursor) {
      scannedSources += 1;

      const detail = await hydrateProductDetail(manifest);
      const detailVariants = Array.isArray(detail?.variants) ? detail.variants : [];

      for (const variant of detailVariants) {
        const url = normalizeCellphonesUrl(variant.url || variant.href || variant.sourceUrl || "");
        if (!url || seenUrls.has(url)) continue;
        seenUrls.add(url);
        variants.push({
          ...variant,
          url,
          slug: variant.slug || getSlugFromUrl(url),
        });
      }
    }

    const manifestIndex = await loadVariantManifestIndex(productDetails, variants);

    for (const variant of variants) {
      if (args.limit && queued.length >= args.limit) break;
      const variantManifest = findVariantManifestInIndex(manifestIndex, variant);
      const check = isWeakManifest(variantManifest, args.minTargetJsonBytes);
      if (!check.weak) continue;

      reasonCounts[check.reason] = (reasonCounts[check.reason] || 0) + 1;
      queued.push(variant.url);
    }

    await fs.mkdir(args.output.replace(/[\\/][^\\/]+$/, "") || ".", { recursive: true });
    await fs.writeFile(args.output, `${uniqueStrings(queued).join("\n")}\n`, "utf8");
    const summary = {
      db: dbName,
      productDetailsCollection,
      output: args.output,
      minSourceJsonBytes: args.minSourceJsonBytes,
      minTargetJsonBytes: args.minTargetJsonBytes,
      updatedSince: args.updatedSince || null,
      scannedSources,
      variantCandidates: variants.length,
      queued: queued.length,
      reasonCounts,
      firstUrl: queued[0] || null,
      lastUrl: queued[queued.length - 1] || null,
    };
    await fs.writeFile(`${args.output}.summary.json`, JSON.stringify(summary, null, 2), "utf8");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[fatal]", error);
  process.exit(1);
});

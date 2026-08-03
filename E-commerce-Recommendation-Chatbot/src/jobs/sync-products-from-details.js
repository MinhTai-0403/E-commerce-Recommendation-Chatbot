const { ObjectId } = require("mongodb");
const { createMongoClient, getMongoConfig } = require("../config/mongodb");
const { buildRealWorldRecency } = require("../cellphones/realworld-product-recency");

function parseArgs(argv = []) {
  const args = {
    dryRun: false,
    limit: 0,
    minJsonBytes: 5000,
    updatedSince: "",
  };

  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length)) || 0;
    else if (arg.startsWith("--min-json-bytes=")) args.minJsonBytes = Number(arg.slice("--min-json-bytes=".length)) || 0;
    else if (arg.startsWith("--updated-since=")) args.updatedSince = arg.slice("--updated-since=".length);
  }

  return args;
}

function uniqueStrings(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

function normalizeComparableText(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isOutOfStockLabel(value = "") {
  return /h[ếe]t\s*h[aà]ng|ng[uư]ng|out\s*of\s*stock|t[aạ]m\s*h[ếe]t/i.test(String(value || ""));
}

function buildAvailability(detail = {}) {
  const label = String(detail.statusLabel || "").trim();

  if (isOutOfStockLabel(label)) {
    return { status: "OutOfStock", raw: label || "OutOfStock" };
  }

  if (Number(detail.currentPrice) > 0) {
    return { status: "InStock", raw: label || "InStock" };
  }

  return { status: label || "Unknown", raw: label || "Unknown" };
}

function buildCategories(detail = {}) {
  const productNameKey = normalizeComparableText(detail.name || detail.productName || "");
  const categories = Array.isArray(detail.categoryTrail)
    ? detail.categoryTrail
        .map((item) => item?.name || item?.label)
        .filter((name) => {
          if (!name) return false;
          const key = normalizeComparableText(name);
          if (["trang chu", "cellphones"].includes(key)) return false;
          return key !== productNameKey;
        })
    : [];

  return uniqueStrings([detail.category, ...categories]);
}

function buildBreadcrumbs(detail = {}) {
  return Array.isArray(detail.categoryTrail)
    ? detail.categoryTrail
        .filter((item) => item?.name || item?.label)
        .map((item, index) => ({
          position: index + 1,
          name: item.name || item.label,
          url: item.href || item.url || "",
        }))
    : [];
}

function buildProductSummaryFromDetail(detail = {}) {
  const slug = detail.slug || detail.sku;
  const sourceUrls = uniqueStrings([
    detail.url,
    detail.sourceUrl,
    detail.inputUrl,
    ...(detail.sourceUrls || []),
  ]);
  const images = uniqueStrings([
    detail.primaryImage,
    detail.thumbnail,
    detail.image,
    ...(detail.images || []),
  ]);

  const currentPrice = Number(detail.currentPrice || detail.salePrice || detail.price || 0) || 0;
  const originalPrice = Number(detail.originalPrice || detail.regularPrice || currentPrice || 0) || 0;
  const statusLabel = detail.statusLabel || (currentPrice > 0 ? "Còn hàng" : "Liên hệ");
  const availability = buildAvailability({ ...detail, currentPrice, statusLabel });
  const category = detail.category || detail.categoryName || "";
  const categoryList = buildCategories({ ...detail, category });
  const primaryImage = detail.primaryImage || detail.thumbnail || detail.image || images[0] || "";
  const now = new Date();
  const summary = {
    source: detail.source || "cellphones",
    url: detail.url || detail.sourceUrl || sourceUrls[0] || "",
    productUrl: detail.url || detail.sourceUrl || sourceUrls[0] || "",
    sourceUrls,
    id: slug,
    slug,
    sku: detail.sku || slug,
    name: detail.name || detail.productName,
    productName: detail.productName || detail.name,
    title: detail.title || detail.name || detail.productName,
    brand: detail.brand,
    brandName: detail.brandName || detail.brand,
    brandKey: detail.brandKey,
    price: currentPrice,
    currentPrice,
    salePrice: currentPrice,
    originalPrice,
    regularPrice: originalPrice,
    priceCurrency: "VND",
    availability,
    stockStatus: availability.status,
    statusLabel,
    category,
    categoryName: categoryList[0] || category,
    categories: categoryList,
    breadcrumbs: buildBreadcrumbs(detail),
    categoryTrail: detail.categoryTrail || [],
    primaryImage,
    thumbnail: detail.thumbnail || primaryImage,
    image: detail.image || primaryImage,
    images: images.slice(0, 8),
    description: detail.meta?.description || detail.description || "",
    rating: detail.rating,
    ratingCount: detail.ratingCount,
    discount: detail.discount,
    installment: detail.installment,
    city: detail.city,
    detailAvailable: true,
    detailBacked: true,
    detailSlug: slug,
    detailUrl: detail.url || detail.sourceUrl || "",
    detailStorage: detail.storage?.type || "local-gzip",
    storageStatus: detail.storageStatus,
    sourceCapturedAt: detail.sourceCapturedAt,
    scrapedAt: detail.scrapedAt,
    sitemapRank: detail.sitemapRank ?? detail.sitemap?.rank ?? null,
    sitemapProductRank: detail.sitemapProductRank ?? detail.sitemap?.productRank ?? null,
    sitemapSortRank: detail.sitemapSortRank ?? detail.sitemap?.sortRank ?? null,
    sitemapLastmod: detail.sitemapLastmod || detail.sitemap?.lastmod || null,
    webFreshnessScore: detail.webFreshnessScore || 0,
    webFreshnessReason: detail.webFreshnessReason || [],
    realWorldYear: detail.realWorldYear || null,
    effectiveRealWorldYear: detail.effectiveRealWorldYear || null,
    latestDateMs: detail.latestDateMs || null,
    detailSyncedAt: new Date(),
    updatedAt: now,
  };

  const recency = buildRealWorldRecency(summary);
  summary.webFreshnessScore = recency.webFreshnessScore;
  summary.webFreshnessReason = recency.webFreshnessReason;
  summary.realWorldYear = recency.realWorldYear;
  summary.effectiveRealWorldYear = recency.effectiveYear;
  summary.latestDateMs = recency.latestDateMs;

  return summary;
}

function productDetailFieldUnset() {
  return {
    media: "",
    highlights: "",
    variants: "",
    colors: "",
    promotions: "",
    policies: "",
    specifications: "",
    relatedProducts: "",
    articleSections: "",
    articleHtml: "",
    faqs: "",
  };
}

function buildUsableDetailQuery(args) {
  const query = {
    source: "cellphones",
    slug: { $exists: true, $ne: "" },
    name: { $exists: true, $ne: "" },
    currentPrice: { $gt: 0 },
    "storage.type": { $in: ["local-gzip", "inline-gzip"] },
    "storage.jsonBytes": { $gte: args.minJsonBytes },
    $or: [
      { thumbnail: { $exists: true, $ne: "" } },
      { image: { $exists: true, $ne: "" } },
      { primaryImage: { $exists: true, $ne: "" } },
      { images: { $exists: true, $ne: [] } },
    ],
  };

  if (args.updatedSince) {
    query.updatedAt = { $gte: new Date(args.updatedSince) };
  }

  return query;
}

async function findExistingProduct(products, summary) {
  const sourceUrls = summary.sourceUrls || [];
  const lookup = {
    $or: [
      ...(ObjectId.isValid(summary.slug) ? [{ _id: new ObjectId(summary.slug) }] : []),
      { source: summary.source, slug: summary.slug },
      { source: summary.source, sku: summary.sku },
      ...(summary.url ? [{ url: summary.url }] : []),
      ...(sourceUrls.length ? [{ url: { $in: sourceUrls } }, { sourceUrls: { $in: sourceUrls } }] : []),
    ],
  };

  return products.findOne(lookup, { projection: { _id: 1 } });
}

async function syncOne(products, detail, dryRun = false) {
  let summary = buildProductSummaryFromDetail(detail);
  if (!summary.slug || !summary.name || !summary.currentPrice || !summary.primaryImage) {
    return { skipped: 1, inserted: 0, updated: 0 };
  }

  if (dryRun) return { skipped: 0, inserted: 0, updated: 1 };

  const existing = await findExistingProduct(products, summary);
  const update = {
    $set: summary,
    $unset: productDetailFieldUnset(),
    $setOnInsert: { createdAt: new Date() },
  };

  try {
    if (existing?._id) {
      const result = await products.updateOne({ _id: existing._id }, update);
      return { skipped: 0, inserted: 0, updated: result.modifiedCount || result.matchedCount || 0 };
    }

    const result = await products.updateOne(
      { source: summary.source, slug: summary.slug },
      update,
      { upsert: true }
    );

    return {
      skipped: 0,
      inserted: result.upsertedCount || 0,
      updated: result.upsertedCount ? 0 : result.modifiedCount || result.matchedCount || 0,
    };
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;

    const duplicate = await findDuplicateProduct(products, summary, error);
    if (!duplicate?._id) throw error;

    if (duplicate.slug && duplicate.slug !== summary.slug) {
      summary = {
        ...summary,
        detailSlug: summary.slug,
        slug: duplicate.slug,
        sku: duplicate.sku || duplicate.slug,
      };
    }

    const result = await products.updateOne(
      { _id: duplicate._id },
      {
        $set: summary,
        $unset: productDetailFieldUnset(),
      }
    );
    return { skipped: 0, inserted: 0, updated: result.modifiedCount || result.matchedCount || 0 };
  }
}

function isDuplicateKeyError(error) {
  return error?.code === 11000 || /E11000|duplicate key/i.test(error?.message || "");
}

async function findDuplicateProduct(products, summary, error) {
  const keyValue = error?.keyValue || {};
  const lookups = [
    keyValue.url ? { url: keyValue.url } : null,
    keyValue.slug && keyValue.source ? { source: keyValue.source, slug: keyValue.slug } : null,
    summary.url ? { url: summary.url } : null,
    summary.sourceUrls?.length ? { sourceUrls: { $in: summary.sourceUrls } } : null,
    { source: summary.source, slug: summary.slug },
  ].filter(Boolean);

  for (const lookup of lookups) {
    const duplicate = await products.findOne(lookup, { projection: { _id: 1, slug: 1, sku: 1 } });
    if (duplicate) return duplicate;
  }

  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = createMongoClient();
  const { dbName, productsCollection, productDetailsCollection } = getMongoConfig();

  await client.connect();
  try {
    const db = client.db(dbName);
    const products = db.collection(productsCollection);
    const productDetails = db.collection(productDetailsCollection);
    const query = buildUsableDetailQuery(args);
    const projection = {
      source: 1,
      sourceUrl: 1,
      inputUrl: 1,
      url: 1,
      sourceUrls: 1,
      slug: 1,
      sku: 1,
      name: 1,
      productName: 1,
      brand: 1,
      brandKey: 1,
      category: 1,
      categoryTrail: 1,
      currentPrice: 1,
      salePrice: 1,
      price: 1,
      originalPrice: 1,
      regularPrice: 1,
      discount: 1,
      rating: 1,
      ratingCount: 1,
      installment: 1,
      statusLabel: 1,
      city: 1,
      thumbnail: 1,
      image: 1,
      primaryImage: 1,
      images: { $slice: 8 },
      meta: 1,
      description: 1,
      storageStatus: 1,
      sourceCapturedAt: 1,
      scrapedAt: 1,
      updatedAt: 1,
      storage: 1,
      sitemapRank: 1,
      sitemapProductRank: 1,
      sitemapSortRank: 1,
      sitemapLastmod: 1,
      sitemap: 1,
      webFreshnessScore: 1,
      webFreshnessReason: 1,
      realWorldYear: 1,
      effectiveRealWorldYear: 1,
      latestDateMs: 1,
    };
    const cursor = productDetails
      .find(query, { projection })
      .sort({
        webFreshnessScore: -1,
        realWorldYear: -1,
        effectiveRealWorldYear: -1,
        updatedAt: -1,
        scrapedAt: -1,
      })
      .batchSize(250);
    const totals = {
      scanned: 0,
      skipped: 0,
      inserted: 0,
      updated: 0,
    };

    for await (const detail of cursor) {
      if (args.limit && totals.scanned >= args.limit) break;
      totals.scanned += 1;
      const delta = await syncOne(products, detail, args.dryRun);
      totals.skipped += delta.skipped;
      totals.inserted += delta.inserted;
      totals.updated += delta.updated;

      if (totals.scanned % 500 === 0) {
        console.log(`[progress] ${totals.scanned} scanned, ${totals.updated} updated, ${totals.inserted} inserted, ${totals.skipped} skipped`);
      }
    }

    console.log(JSON.stringify({
      db: dbName,
      productsCollection,
      productDetailsCollection,
      dryRun: args.dryRun,
      minJsonBytes: args.minJsonBytes,
      updatedSince: args.updatedSince || null,
      ...totals,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[fatal]", error);
  process.exit(1);
});

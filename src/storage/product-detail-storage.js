const fs = require("fs/promises");
const path = require("path");
const zlib = require("zlib");
const { promisify } = require("util");
const { Binary } = require("mongodb");

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const STORAGE_VERSION = 1;

function getDetailStorageRoot() {
  return path.resolve(process.env.PRODUCT_DETAILS_DIR || "data/product-details");
}

function normalizePathForMongo(filePath) {
  return filePath.split(path.sep).join("/");
}

function safeSegment(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function detailRelativePath(detail = {}) {
  const source = safeSegment(detail.source || "cellphones");
  const slug = safeSegment(detail.slug || detail.sku || detail.productId || detail.name);
  const bucket = slug.slice(0, 2) || "__";
  return normalizePathForMongo(path.join(source, bucket, `${slug}.json.gz`));
}

function detailAbsolutePath(relativePath) {
  const root = getDetailStorageRoot();
  const cleanRelative = String(relativePath || "").replace(/[\\/]+/g, path.sep);
  const resolved = path.resolve(root, cleanRelative);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Invalid storage path.");
  }
  return resolved;
}

function getBinaryBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value.buffer) return Buffer.from(value.buffer);
  if (value.value) return Buffer.from(value.value);
  if (value.data) return Buffer.from(value.data);
  return null;
}

function stripMongoOnlyFields(detail = {}) {
  const {
    _id,
    createdAt,
    updatedAt,
    storage,
    storageStatus,
    storageVersion,
    storagePath,
    detailBlob,
    ...rest
  } = detail;
  return rest;
}

async function writeProductDetailFile(detail) {
  const payload = stripMongoOnlyFields(detail);
  const relativePath = detailRelativePath(payload);
  const absolutePath = detailAbsolutePath(relativePath);
  const json = JSON.stringify(payload);
  const compressed = await gzip(Buffer.from(json, "utf8"), { level: 9 });

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, compressed);

  return {
    type: "local-gzip",
    version: STORAGE_VERSION,
    path: relativePath,
    bytes: compressed.length,
    jsonBytes: Buffer.byteLength(json, "utf8"),
    updatedAt: new Date(),
  };
}

async function readProductDetailFile(storage = {}) {
  if (!storage.path) return null;

  try {
    const compressed = await fs.readFile(detailAbsolutePath(storage.path));
    const json = await gunzip(compressed);
    return JSON.parse(json.toString("utf8"));
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) return null;
    throw error;
  }
}

async function buildProductDetailInlineStorage(detail) {
  const payload = stripMongoOnlyFields(detail);
  const relativePath = detailRelativePath(payload);
  const json = JSON.stringify(payload);
  const compressed = await gzip(Buffer.from(json, "utf8"), { level: 9 });

  return {
    detailBlob: new Binary(compressed),
    storage: {
      type: "inline-gzip",
      version: STORAGE_VERSION,
      path: relativePath,
      bytes: compressed.length,
      jsonBytes: Buffer.byteLength(json, "utf8"),
      updatedAt: new Date(),
    },
  };
}

async function readProductDetailInline(manifest = {}) {
  const compressed = getBinaryBuffer(manifest.detailBlob || manifest.storage?.blob);
  if (!compressed) return null;

  const json = await gunzip(compressed);
  return JSON.parse(json.toString("utf8"));
}

async function hydrateProductDetail(manifest) {
  if (!manifest) return null;

  if (manifest.storage?.type === "inline-gzip") {
    const detail = await readProductDetailInline(manifest);
    if (detail) return detail;
  }

  if (manifest.storage?.type === "local-gzip") {
    const detail = await readProductDetailFile(manifest.storage);
    if (detail) return detail;
  }

  if (manifest.articleHtml || manifest.media || manifest.specifications || manifest.promotions) {
    return stripMongoOnlyFields(manifest);
  }

  return null;
}

function buildProductDetailManifest(detail, storage) {
  const sourceUrls = [
    detail.url,
    detail.sourceUrl,
    detail.inputUrl,
    ...(Array.isArray(detail.sourceUrls) ? detail.sourceUrls : []),
  ].filter(Boolean);

  return {
    source: detail.source || "cellphones",
    sourceUrl: detail.sourceUrl || detail.url,
    inputUrl: detail.inputUrl,
    url: detail.url || detail.sourceUrl,
    sourceUrls: [...new Set(sourceUrls)],
    slug: detail.slug,
    sku: detail.sku || detail.slug,
    productId: detail.productId,
    name: detail.name || detail.productName,
    productName: detail.productName || detail.name,
    title: detail.title,
    brand: detail.brand,
    brandKey: detail.brandKey,
    category: detail.category,
    categoryTrail: detail.categoryTrail || [],
    currentPrice: detail.currentPrice,
    originalPrice: detail.originalPrice,
    discount: detail.discount,
    rating: detail.rating,
    ratingCount: detail.ratingCount,
    installment: detail.installment,
    statusLabel: detail.statusLabel,
    city: detail.city,
    thumbnail: detail.thumbnail || detail.image,
    image: detail.image || detail.thumbnail,
    primaryImage: detail.primaryImage || detail.thumbnail || detail.image,
    images: Array.isArray(detail.images) ? detail.images.slice(0, 8) : [],
    storage,
    storageStatus: storage?.type === "inline-gzip" ? "inline-backed" : "file-backed",
    storageVersion: STORAGE_VERSION,
    hasArticleHtml: Boolean(detail.articleHtml),
    counts: {
      media: detail.media?.length || 0,
      highlights: detail.highlights?.length || 0,
      variants: detail.variants?.length || 0,
      colors: detail.colors?.length || 0,
      promotions: detail.promotions?.length || 0,
      privileges: detail.privileges?.length || 0,
      policies: detail.policies?.length || 0,
      paymentOffers: detail.paymentOffers?.length || 0,
      specifications: detail.specifications?.length || 0,
      relatedProducts: detail.relatedProducts?.length || 0,
      news: detail.news?.length || 0,
      faqs: detail.faqs?.length || 0,
    },
    sourceCapturedAt: detail.sourceCapturedAt,
    scrapedAt: detail.scrapedAt || new Date(),
  };
}

module.exports = {
  buildProductDetailInlineStorage,
  buildProductDetailManifest,
  detailAbsolutePath,
  detailRelativePath,
  getDetailStorageRoot,
  hydrateProductDetail,
  readProductDetailInline,
  readProductDetailFile,
  writeProductDetailFile,
};

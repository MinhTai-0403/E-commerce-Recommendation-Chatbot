const http = require("http");
const { ObjectId } = require("mongodb");
const { handleAdminRequest, isAdminAuthorized } = require("./admin-service");
const { handleAuthRequest } = require("./auth-service");
const { createMongoClient, getMongoConfig } = require("./mongodb");

const API_PORT = Number(process.env.API_PORT || 5050);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

let mongoClient;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Api-Key",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendError(res, statusCode, message, details) {
  sendJson(res, statusCode, {
    ok: false,
    message,
    error: {
      message,
      ...(details ? { details } : {}),
    },
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPositiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function slugify(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "san-pham-moi";
}

function stripHtmlExtension(value = "") {
  return decodeURIComponent(String(value))
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.html$/i, "");
}

function getSlugFromUrl(url) {
  if (!url) return "";

  try {
    return stripHtmlExtension(new URL(url).pathname.split("/").pop());
  } catch {
    return stripHtmlExtension(String(url).split("/").pop());
  }
}

function getProductSlug(product) {
  return (
    product.slug ||
    product.sku ||
    getSlugFromUrl(product.sourceUrls?.[0]) ||
    getSlugFromUrl(product.url) ||
    slugify(product.name)
  );
}

function normalizeAvailability(availability) {
  if (!availability) return null;
  if (typeof availability === "string") return availability;
  return availability.status || availability.raw || null;
}

function normalizeSpecifications(specifications = []) {
  if (!Array.isArray(specifications)) return [];

  return [
    {
      id: "specifications",
      groupName: "Thông số kỹ thuật",
      rows: specifications
        .filter((item) => item?.name && item?.value)
        .map((item) => ({
          id: slugify(item.name),
          label: item.name,
          value: item.value,
        })),
    },
  ];
}

function normalizeBreadcrumbs(product) {
  if (Array.isArray(product.breadcrumbs) && product.breadcrumbs.length > 0) {
    return product.breadcrumbs.map((item) => ({
      id: slugify(`${item.position || ""}-${item.name || ""}`),
      name: item.name,
      href: item.url || "#",
    }));
  }

  const categories = Array.isArray(product.categories) ? product.categories : [];
  return [
    { id: "home", name: "Trang chủ", href: "/" },
    ...categories.map((category) => ({
      id: slugify(category),
      name: category,
      href: "#",
    })),
  ];
}

function normalizeProduct(product) {
  if (!product) return null;

  const slug = getProductSlug(product);
  const images = Array.isArray(product.images)
    ? product.images.filter(Boolean)
    : [];
  const primaryImage = product.primaryImage || images[0] || product.image || "";
  const price = product.price ?? product.currentPrice ?? null;

  return {
    id: String(product._id || product.id || product.sku || slug),
    mongoId: product._id ? String(product._id) : null,
    source: product.source || "admin",
    sku: product.sku || slug,
    slug,
    name: product.name,
    brand: product.brand,
    currentPrice: typeof price === "number" ? price : null,
    originalPrice: product.originalPrice ?? null,
    priceCurrency: product.priceCurrency || "VND",
    availability: normalizeAvailability(product.availability),
    categories: product.categories || [],
    categoryTrail: normalizeBreadcrumbs(product),
    thumbnail: primaryImage,
    primaryImage,
    images,
    media: images.map((src, index) => ({
      id: `${slug}-image-${index + 1}`,
      type: "image",
      label: index === 0 ? "Ảnh chính" : `Ảnh ${index + 1}`,
      src,
      alt: product.name,
    })),
    variants: product.variants || [],
    colors: product.colors || [],
    promotions: product.promotions || [],
    policies: product.policies || [],
    relatedProducts: product.relatedProducts || [],
    articleSections: product.articleSections || [],
    faqs: product.faqs || [],
    specifications: normalizeSpecifications(product.specifications),
    description: product.description || "",
    sourceUrls: product.sourceUrls || [],
    scrapedAt: product.scrapedAt,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

function buildListQuery(searchParams) {
  const query = {};
  const source = searchParams.get("source") || "cellphones";
  const q = searchParams.get("q");
  const category = searchParams.get("category");
  const brand = searchParams.get("brand");
  const inStock = searchParams.get("inStock");

  if (source !== "all") query.source = source;

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    query.$or = [
      { name: regex },
      { sku: regex },
      { brand: regex },
      { categories: regex },
      { sourceUrls: regex },
      { url: regex },
    ];
  }

  if (category) query.categories = new RegExp(escapeRegex(category), "i");
  if (brand) query.brand = new RegExp(escapeRegex(brand), "i");

  if (inStock === "true") query["availability.status"] = "InStock";
  if (inStock === "false") query["availability.status"] = { $ne: "InStock" };

  return query;
}

function buildSort(sortKey) {
  switch (sortKey) {
    case "price_asc":
      return { price: 1, name: 1 };
    case "price_desc":
      return { price: -1, name: 1 };
    case "name":
      return { name: 1 };
    case "oldest":
      return { scrapedAt: 1, name: 1 };
    case "latest":
    default:
      return { scrapedAt: -1, updatedAt: -1, name: 1 };
  }
}

function buildProductLookup(identifier) {
  const clean = stripHtmlExtension(identifier);
  const escaped = escapeRegex(clean);
  const or = [
    { sku: clean },
    { slug: clean },
    { url: clean },
    { sourceUrls: clean },
    { url: { $regex: `${escaped}\\.html$`, $options: "i" } },
    { sourceUrls: { $elemMatch: { $regex: `${escaped}\\.html$`, $options: "i" } } },
  ];

  if (ObjectId.isValid(clean)) or.unshift({ _id: new ObjectId(clean) });

  return { $or: or };
}

function sanitizeProductInput(input, { isCreate = false } = {}) {
  const allowed = [
    "source",
    "url",
    "sourceUrls",
    "name",
    "brand",
    "sku",
    "slug",
    "price",
    "currentPrice",
    "originalPrice",
    "priceCurrency",
    "availability",
    "categories",
    "breadcrumbs",
    "primaryImage",
    "images",
    "specifications",
    "description",
    "variants",
    "colors",
    "promotions",
    "policies",
    "relatedProducts",
    "articleSections",
    "faqs",
  ];

  const product = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(input, key)) product[key] = input[key];
  }

  if (typeof product.name === "string") product.name = product.name.trim();
  if (typeof product.brand === "string") product.brand = product.brand.trim();
  if (product.currentPrice !== undefined && product.price === undefined) product.price = product.currentPrice;
  if (product.price !== undefined) product.price = Number(product.price);
  if (product.originalPrice !== undefined) product.originalPrice = Number(product.originalPrice);
  if (!product.slug && (product.sku || product.name)) product.slug = slugify(product.sku || product.name);
  if (!product.sku && product.slug) product.sku = product.slug;
  if (!product.source) product.source = "admin";
  if (!product.priceCurrency) product.priceCurrency = "VND";

  if (isCreate && !product.name) {
    throw new Error("Product name is required.");
  }

  if (product.price !== undefined && !Number.isFinite(product.price)) {
    throw new Error("Product price must be a number.");
  }

  delete product._id;
  delete product.id;
  delete product.mongoId;

  return product;
}

function isWriteAuthorized(req) {
  return isAdminAuthorized(req);
}

async function getDb() {
  if (!mongoClient) {
    mongoClient = createMongoClient();
    await mongoClient.connect();
  }

  const { dbName, productsCollection } = getMongoConfig();
  return {
    db: mongoClient.db(dbName),
    dbName,
    productsCollection,
    products: mongoClient.db(dbName).collection(productsCollection),
  };
}

async function handleHealth(_req, res) {
  const { db, dbName, productsCollection, products } = await getDb();
  await db.command({ ping: 1 });
  const totalProducts = await products.estimatedDocumentCount();
  sendJson(res, 200, {
    ok: true,
    database: dbName,
    productsCollection,
    totalProducts,
  });
}

async function handleApiIndex(_req, res) {
  const { dbName, productsCollection } = getMongoConfig();
  sendJson(res, 200, {
    ok: true,
    message: "CellphoneS clone API is running.",
    database: dbName,
    productsCollection,
    endpoints: {
      health: "/api/health",
      products: "/api/products",
      productDetail: "/api/products/:slug",
      requestRegisterOtp: "/api/auth/request-register-otp",
      verifyRegisterOtp: "/api/auth/verify-register-otp",
      login: "/api/auth/login",
      me: "/api/auth/me",
      adminSummary: "/api/admin/summary",
      adminUsers: "/api/admin/users",
    },
  });
}

async function handleListProducts(req, res) {
  const { products } = await getDb();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const page = toPositiveInt(url.searchParams.get("page"), 1);
  const limit = toPositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
  const skip = (page - 1) * limit;
  const query = buildListQuery(url.searchParams);
  const sort = buildSort(url.searchParams.get("sort"));
  const includeRaw = url.searchParams.get("raw") === "true";
  const includeDetails = url.searchParams.get("include") === "details";

  const projection = includeRaw
    ? undefined
    : {
        name: 1,
        brand: 1,
        sku: 1,
        slug: 1,
        price: 1,
        originalPrice: 1,
        priceCurrency: 1,
        availability: 1,
        categories: 1,
        breadcrumbs: 1,
        primaryImage: 1,
        images: { $slice: 5 },
        source: 1,
        sourceUrls: 1,
        scrapedAt: 1,
        updatedAt: 1,
        ...(includeDetails
          ? {
              description: 1,
              specifications: 1,
              variants: 1,
              colors: 1,
              promotions: 1,
              policies: 1,
              relatedProducts: 1,
              articleSections: 1,
              faqs: 1,
            }
          : {}),
      };

  const [total, docs] = await Promise.all([
    products.countDocuments(query),
    products.find(query, { projection }).sort(sort).skip(skip).limit(limit).toArray(),
  ]);

  sendJson(res, 200, {
    ok: true,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: includeRaw ? docs : docs.map(normalizeProduct),
  });
}

async function handleGetProduct(_req, res, identifier) {
  const { products } = await getDb();
  const doc = await products.findOne(buildProductLookup(identifier));

  if (!doc) {
    sendError(res, 404, "Product not found.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    data: normalizeProduct(doc),
    raw: doc,
  });
}

async function handleRelatedProducts(req, res, identifier) {
  const { products } = await getDb();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const limit = toPositiveInt(url.searchParams.get("limit"), 8, 20);
  const product = await products.findOne(buildProductLookup(identifier));

  if (!product) {
    sendError(res, 404, "Product not found.");
    return;
  }

  const relatedQuery = {
    _id: { $ne: product._id },
    source: product.source || "cellphones",
    $or: [
      ...(product.categories || []).map((category) => ({ categories: category })),
      ...(product.brand ? [{ brand: product.brand }] : []),
    ],
  };

  if (relatedQuery.$or.length === 0) delete relatedQuery.$or;

  const docs = await products
    .find(relatedQuery, {
      projection: {
        name: 1,
        brand: 1,
        sku: 1,
        slug: 1,
        price: 1,
        priceCurrency: 1,
        availability: 1,
        categories: 1,
        primaryImage: 1,
        images: { $slice: 3 },
        source: 1,
        sourceUrls: 1,
        scrapedAt: 1,
      },
    })
    .sort({ scrapedAt: -1, name: 1 })
    .limit(limit)
    .toArray();

  sendJson(res, 200, {
    ok: true,
    baseProduct: normalizeProduct(product),
    data: docs.map(normalizeProduct),
  });
}

async function handleCreateProduct(req, res) {
  if (!isWriteAuthorized(req)) {
    sendError(res, 401, "Unauthorized.");
    return;
  }

  const { products } = await getDb();
  const body = await parseJsonBody(req);
  const product = sanitizeProductInput(body, { isCreate: true });
  const now = new Date();
  product.createdAt = now;
  product.updatedAt = now;

  const result = await products.insertOne(product);
  const inserted = await products.findOne({ _id: result.insertedId });

  sendJson(res, 201, {
    ok: true,
    data: normalizeProduct(inserted),
    raw: inserted,
  });
}

async function handleUpdateProduct(req, res, identifier) {
  if (!isWriteAuthorized(req)) {
    sendError(res, 401, "Unauthorized.");
    return;
  }

  const { products } = await getDb();
  const body = await parseJsonBody(req);
  const update = sanitizeProductInput(body);
  update.updatedAt = new Date();

  const result = await products.findOneAndUpdate(
    buildProductLookup(identifier),
    { $set: update },
    { returnDocument: "after" }
  );

  if (!result) {
    sendError(res, 404, "Product not found.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    data: normalizeProduct(result),
    raw: result,
  });
}

async function handleDeleteProduct(_req, res, identifier) {
  if (!isWriteAuthorized(_req)) {
    sendError(res, 401, "Unauthorized.");
    return;
  }

  const { products } = await getDb();
  const result = await products.findOneAndDelete(buildProductLookup(identifier));

  if (!result) {
    sendError(res, 404, "Product not found.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    deleted: normalizeProduct(result),
  });
}

async function routeRequest(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (pathParts.length === 0 && req.method === "GET") {
    await handleApiIndex(req, res);
    return;
  }

  if (pathParts[0] !== "api") {
    sendError(res, 404, "Route not found.");
    return;
  }

  if (!pathParts[1] && req.method === "GET") {
    await handleApiIndex(req, res);
    return;
  }

  if (pathParts[1] === "health" && req.method === "GET") {
    await handleHealth(req, res);
    return;
  }

  if (pathParts[1] === "auth") {
    await handleAuthRequest({
      req,
      res,
      pathParts,
      parseJsonBody,
      sendJson,
      sendError,
      getDb,
    });
    return;
  }

  if (pathParts[1] === "admin") {
    await handleAdminRequest({
      req,
      res,
      pathParts,
      parseJsonBody,
      sendJson,
      sendError,
      getDb,
    });
    return;
  }

  if (pathParts[1] !== "products") {
    sendError(res, 404, "Route not found.");
    return;
  }

  const identifier = pathParts[2];
  const subresource = pathParts[3];

  if (!identifier && req.method === "GET") {
    await handleListProducts(req, res);
    return;
  }

  if (!identifier && req.method === "POST") {
    await handleCreateProduct(req, res);
    return;
  }

  if (identifier && !subresource && req.method === "GET") {
    await handleGetProduct(req, res, identifier);
    return;
  }

  if (identifier && !subresource && ["PUT", "PATCH"].includes(req.method)) {
    await handleUpdateProduct(req, res, identifier);
    return;
  }

  if (identifier && !subresource && req.method === "DELETE") {
    await handleDeleteProduct(req, res, identifier);
    return;
  }

  if (identifier && subresource === "related" && req.method === "GET") {
    await handleRelatedProducts(req, res, identifier);
    return;
  }

  sendError(res, 405, "Method not allowed.");
}

const server = http.createServer((req, res) => {
  routeRequest(req, res).catch((error) => {
    console.error("[api]", error);
    sendError(res, 500, "Internal server error.", error.message);
  });
});

server.listen(API_PORT, () => {
  const { dbName, productsCollection } = getMongoConfig();
  console.log(`API server listening on http://localhost:${API_PORT}`);
  console.log(`MongoDB source: ${dbName}.${productsCollection}`);
});

async function shutdown() {
  if (mongoClient) await mongoClient.close();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

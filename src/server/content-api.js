const {
  normalizePublicPath,
  registry,
  registeredRoutes,
  resolveRegisteredRoute,
} = require("../cellphones/public-route-registry");

const PAGE_SNAPSHOTS_COLLECTION =
  process.env.CELLPHONES_PAGE_SNAPSHOTS_COLLECTION || "cellphones_page_snapshots";
let pageSnapshotIndexesReady = false;

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanText(value, maxLength = 5000) {
  return String(value ?? "")
    .replace(/\0/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeHtml(value = "") {
  return String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, "")
    .slice(0, 500_000);
}

function sanitizeLinkHref(value = "") {
  const href = cleanText(value, 2000);
  if (!href || href.startsWith("#") || href.startsWith("/")) return href;
  try {
    const parsed = new URL(href);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function sanitizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.slice(0, 100).map((section) => ({
    id: cleanText(section?.id, 120),
    type: cleanText(section?.type || "content", 60),
    title: cleanText(section?.title, 500),
    text: cleanText(section?.text, 20_000),
    html: sanitizeHtml(section?.html),
    links: Array.isArray(section?.links)
      ? section.links.slice(0, 100).map((link) => ({
        label: cleanText(link?.label, 500),
        href: sanitizeLinkHref(link?.href),
      }))
      : [],
  }));
}

function sanitizeSnapshotForPublic(snapshot) {
  if (!snapshot) return null;
  return {
    path: normalizePublicPath(snapshot.path),
    pageType: cleanText(snapshot.pageType || "content", 80),
    sourceUrl: cleanText(snapshot.sourceUrl, 2000),
    capturedAt: snapshot.capturedAt || null,
    lastModified: snapshot.lastModified || null,
    version: cleanText(snapshot.version, 120),
    title: cleanText(snapshot.title, 1000),
    description: cleanText(snapshot.description, 5000),
    seo: {
      title: cleanText(snapshot.seo?.title || snapshot.title, 1000),
      description: cleanText(snapshot.seo?.description || snapshot.description, 5000),
      canonical: cleanText(snapshot.seo?.canonical, 2000),
      robots: cleanText(snapshot.seo?.robots || "index,follow", 80),
      image: cleanText(snapshot.seo?.image, 2000),
    },
    sections: sanitizeSections(snapshot.sections),
  };
}

async function getPageSnapshots(getDb) {
  const { db } = await getDb();
  const collection = db.collection(PAGE_SNAPSHOTS_COLLECTION);
  if (!pageSnapshotIndexesReady) {
    await Promise.all([
      collection.createIndex({ path: 1, version: -1 }),
      collection.createIndex({ pageType: 1, capturedAt: -1 }),
      collection.createIndex({ sourceUrl: 1, version: -1 }),
    ]);
    pageSnapshotIndexesReady = true;
  }
  return collection;
}

async function findLatestPageSnapshot(getDb, pathname) {
  const collection = await getPageSnapshots(getDb);
  return collection.findOne(
    { path: normalizePublicPath(pathname), status: { $ne: "removed" } },
    { sort: { capturedAt: -1, version: -1 } }
  );
}

async function handleContentRoutes(_req, res, { sendJson, getDb }) {
  const snapshots = await getPageSnapshots(getDb);
  const snapshotCount = await snapshots.countDocuments({ status: { $ne: "removed" } });
  const latest = await snapshots.findOne(
    { status: { $ne: "removed" } },
    { sort: { capturedAt: -1 }, projection: { _id: 0, version: 1, capturedAt: 1 } }
  );

  sendJson(res, 200, {
    ok: true,
    meta: {
      version: registry.version,
      snapshotVersion: latest?.version || null,
      capturedAt: latest?.capturedAt || null,
      snapshotCount,
    },
    data: registeredRoutes.map((route) => ({
      id: route.id,
      path: route.path,
      pageType: route.pageType,
      handling: route.handling,
      aliases: route.aliases || [],
      ...(route.targetKey ? { target: registry.external[route.targetKey] || null } : {}),
    })),
  });
}

async function handleContentPage(req, res, { sendJson, sendError, getDb }) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const rawPath = url.searchParams.get("path");
  if (!rawPath || !rawPath.startsWith("/") || rawPath.length > 2000) {
    sendError(res, 400, "A valid absolute page path is required.");
    return;
  }

  const pathname = normalizePublicPath(rawPath);
  const route = resolveRegisteredRoute(pathname);
  const contentPath = route?.canonicalPath || pathname;
  const snapshot = await findLatestPageSnapshot(getDb, contentPath);
  if (snapshot) {
    const publicSnapshot = sanitizeSnapshotForPublic(snapshot);
    sendJson(res, 200, {
      ok: true,
      data: {
        ...publicSnapshot,
        path: contentPath,
        pageType: route?.pageType || publicSnapshot.pageType,
      },
      meta: { source: "snapshot" },
    });
    return;
  }

  if (!route || route.handling === "external") {
    sendError(res, 404, "Content page not found.");
    return;
  }

  sendJson(res, 200, {
    ok: true,
    data: {
      path: route.canonicalPath,
      pageType: route.pageType,
      sourceUrl: `${registry.siteOrigin}${route.canonicalPath}`,
      capturedAt: null,
      lastModified: null,
      version: registry.version,
      title: route.title,
      description: route.description,
      seo: {
        title: route.title,
        description: route.description,
        canonical: `${registry.siteOrigin}${route.canonicalPath}`,
        robots: route.robots || "index,follow",
        image: "",
      },
      sections: [],
    },
    meta: { source: "registry-fallback" },
  });
}

function formatPrice(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? `${new Intl.NumberFormat("vi-VN").format(amount)}đ`
    : "";
}

async function handleSearchSuggestions(req, res, { sendJson, sendError, getDb }) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const query = cleanText(url.searchParams.get("q"), 120);
  const limit = Math.max(1, Math.min(10, Number(url.searchParams.get("limit") || 5)));
  const location = cleanText(url.searchParams.get("location"), 120);
  if (query.length < 2) {
    sendError(res, 400, "Search query must contain at least 2 characters.");
    return;
  }

  const escaped = escapeRegex(query);
  const regex = new RegExp(escaped, "i");
  const { productDetails } = await getDb();
  const snapshots = await getPageSnapshots(getDb);
  const [productDocs, articleDocs] = await Promise.all([
    productDetails.find(
      {
        $or: [
          { name: regex },
          { productName: regex },
          { title: regex },
          { slug: regex },
          { brand: regex },
          { brandName: regex },
        ],
      },
      {
        projection: {
          _id: 1,
          name: 1,
          productName: 1,
          title: 1,
          slug: 1,
          url: 1,
          primaryImage: 1,
          image: 1,
          thumbnail: 1,
          effectivePrice: 1,
          currentPrice: 1,
          price: 1,
        },
      }
    ).limit(limit).toArray(),
    snapshots.find(
      {
        pageType: { $in: ["news", "news-article", "article"] },
        $or: [{ title: regex }, { description: regex }],
        status: { $ne: "removed" },
      },
      { projection: { _id: 0, path: 1, title: 1 } }
    ).limit(limit).toArray(),
  ]);

  const categories = registeredRoutes
    .filter((route) =>
      ["category", "filter"].includes(route.pageType)
      && [route.keyword, route.category, route.title].some((value) => regex.test(String(value || "")))
    )
    .slice(0, limit)
    .map((route) => ({ id: route.id, label: route.keyword || route.title, path: route.path }));

  const products = productDocs.map((product) => {
    const slug = product.slug || String(product.url || "").split("/").pop()?.replace(/\.html$/i, "");
    const price = product.effectivePrice || product.currentPrice || product.price;
    return {
      id: String(product._id),
      label: product.name || product.productName || product.title || slug,
      path: slug ? `/${slug}.html` : `/catalogsearch/result?q=${encodeURIComponent(query)}`,
      image: product.primaryImage || product.image || product.thumbnail || "",
      priceLabel: formatPrice(price),
    };
  });

  const normalizedQuery = query.toLowerCase();
  const intents = [
    { id: "all", label: query, path: `/catalogsearch/result?q=${encodeURIComponent(query)}` },
    ...(normalizedQuery.includes("cũ")
      ? [{ id: "used", label: `${query} giá tốt`, path: "/hang-cu.html" }]
      : []),
    ...(normalizedQuery.includes("trả góp")
      ? [{ id: "installment", label: `${query} trả góp 0%`, path: "/tra-gop" }]
      : []),
  ].slice(0, limit);

  sendJson(res, 200, {
    ok: true,
    data: {
      query,
      location,
      intents,
      categories,
      products,
      articles: articleDocs.map((article, index) => ({
        id: `article-${index}`,
        label: article.title,
        path: article.path,
      })),
    },
  });
}

module.exports = {
  PAGE_SNAPSHOTS_COLLECTION,
  findLatestPageSnapshot,
  handleContentPage,
  handleContentRoutes,
  handleSearchSuggestions,
  sanitizeHtml,
  sanitizeLinkHref,
  sanitizeSnapshotForPublic,
};

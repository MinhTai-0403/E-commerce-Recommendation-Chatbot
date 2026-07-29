const fs = require("node:fs");
const path = require("node:path");
const {
  getExternalTarget,
  normalizePublicPath,
  registry,
  resolveRegisteredRoute,
  titleFromPath,
} = require("../cellphones/public-route-registry");

const DEFAULT_FRONTEND_DIST_DIR = path.resolve(__dirname, "../../cellphones-clone/dist");
const FRONTEND_DIST_DIR = path.resolve(
  process.env.FRONTEND_DIST_DIR || DEFAULT_FRONTEND_DIST_DIR
);
const PUBLIC_SITE_URL = String(process.env.PUBLIC_SITE_URL || registry.siteOrigin)
  .replace(/\/+$/, "");

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function isInsideDist(filePath) {
  const relative = path.relative(FRONTEND_DIST_DIR, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function getAssetPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = path.resolve(FRONTEND_DIST_DIR, `.${decoded}`);
  return isInsideDist(candidate) ? candidate : null;
}

async function sendFile(req, res, filePath) {
  const stat = await fs.promises.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return false;

  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()]
    || "application/octet-stream";
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Cache-Control": filePath.includes(`${path.sep}assets${path.sep}`)
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300",
  });
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function buildMetadata(route, pathname, search, snapshot, product) {
  const canonicalPath = snapshot?.path || route?.canonicalPath || pathname;
  const canonical = `${PUBLIC_SITE_URL}${canonicalPath}${route?.pageType === "search" ? search : ""}`;
  const productName = product?.name || product?.productName || product?.title || "";
  const title = productName
    ? `${productName} | CellphoneS`
    : snapshot?.seo?.title || snapshot?.title || route?.title || titleFromPath(pathname);
  const description = snapshot?.seo?.description
    || snapshot?.description
    || product?.description
    || route?.description
    || "Sản phẩm, dịch vụ và thông tin mới nhất tại CellphoneS.";
  const image = snapshot?.seo?.image
    || product?.primaryImage
    || product?.image
    || product?.thumbnail
    || "https://cdn2.cellphones.com.vn/x/media/wysiwyg/Web/Logo/Logo_CPS.png";
  const robots = snapshot?.seo?.robots || route?.robots || "index,follow";
  const pageType = route?.pageType || snapshot?.pageType || "content";

  return {
    canonical,
    description,
    image,
    pageType,
    robots,
    title,
  };
}

function injectMetadata(indexHtml, metadata, statusCode) {
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const canonical = escapeHtml(metadata.canonical);
  const image = escapeHtml(metadata.image);
  const robots = statusCode === 404 ? "noindex,nofollow" : escapeHtml(metadata.robots);
  const type = metadata.pageType === "product" ? "product" : "website";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": metadata.pageType === "product" ? "Product" : "WebPage",
    name: metadata.title,
    description: metadata.description,
    url: metadata.canonical,
    ...(metadata.image ? { image: metadata.image } : {}),
  };
  const head = [
    `<meta name="description" content="${description}">`,
    `<meta name="robots" content="${robots}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${image}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<script type="application/ld+json" data-route-jsonld>${safeJsonLd(jsonLd)}</script>`,
  ].join("\n    ");

  return indexHtml
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
    .replace("</head>", `    ${head}\n  </head>`);
}

async function handleFrontendRequest(req, res, {
  findPageSnapshot,
  findProduct,
} = {}) {
  if (!["GET", "HEAD"].includes(req.method)) return false;

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = normalizePublicPath(url.pathname);
  const assetPath = getAssetPath(url.pathname);
  if (assetPath && path.extname(assetPath) && pathname !== "/") {
    const sent = await sendFile(req, res, assetPath);
    if (sent) return true;
  }

  const indexPath = path.join(FRONTEND_DIST_DIR, "index.html");
  const indexHtml = await fs.promises.readFile(indexPath, "utf8").catch(() => "");
  if (!indexHtml) {
    const body = "Frontend build not found. Run `npm --prefix cellphones-clone run build`.";
    res.writeHead(503, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
    });
    res.end(req.method === "HEAD" ? undefined : body);
    return true;
  }

  let route = resolveRegisteredRoute(pathname);
  if (route?.handling === "external") {
    const target = getExternalTarget(route);
    if (target) {
      res.writeHead(302, { Location: target, "Cache-Control": "no-store" });
      res.end();
      return true;
    }
  }

  if (route?.handling === "legacy-redirect") {
    res.writeHead(308, {
      Location: `${route.canonicalPath}${url.search}`,
      "Cache-Control": "public, max-age=300",
    });
    res.end();
    return true;
  }

  const snapshot = typeof findPageSnapshot === "function"
    ? await findPageSnapshot(pathname)
    : null;
  if (!route && snapshot) {
    route = {
      pageType: snapshot.pageType || "content",
      canonicalPath: snapshot.path || pathname,
      title: snapshot.title,
      description: snapshot.description,
      robots: snapshot.seo?.robots,
    };
  }

  let product = null;
  if (route?.pageType === "product" && typeof findProduct === "function") {
    product = await findProduct(route.productSlug);
    if (!product) route = null;
  }

  const statusCode = route ? 200 : 404;
  const metadata = buildMetadata(
    route || {
      pageType: "not-found",
      title: "Trang không tồn tại",
      description: "Đường dẫn bạn truy cập không tồn tại hoặc đã được thay đổi.",
      robots: "noindex,nofollow",
      canonicalPath: pathname,
    },
    pathname,
    url.search,
    snapshot,
    product
  );
  const body = injectMetadata(indexHtml, metadata, statusCode);
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": statusCode === 404 ? "no-store" : "public, max-age=60",
    "X-Route-Type": metadata.pageType,
  });
  res.end(req.method === "HEAD" ? undefined : body);
  return true;
}

module.exports = {
  FRONTEND_DIST_DIR,
  handleFrontendRequest,
  injectMetadata,
};

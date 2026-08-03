const path = require("node:path");

const REGISTRY_PATH = path.resolve(
  __dirname,
  "../../cellphones-clone/src/data/public-routes.json"
);

const registry = require(REGISTRY_PATH);

function normalizePublicPath(pathname = "/") {
  const cleaned = String(pathname || "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/g, "");
  return cleaned || "/";
}

const exactRoutes = new Map();
const aliasRoutes = new Map();
const phoneLandingRoutes = Object.entries(registry.phoneLandings || {}).map(
  ([routePath, title]) => ({
    id: `phone-landing:${routePath}`,
    path: routePath,
    pageType: "filter",
    handling: "internal",
    appPage: "info",
    keyword: title.split("|")[0].trim(),
    category: "Điện thoại",
    title,
    description: `Khám phá ${title.split("|")[0].trim()} với ưu đãi, trả góp 0% và giao hàng nhanh tại CellphoneS.`,
    robots: "index,follow",
  })
);
const registeredRoutes = [...registry.routes, ...phoneLandingRoutes];

for (const route of registeredRoutes) {
  exactRoutes.set(normalizePublicPath(route.path), route);
  for (const alias of route.aliases || []) {
    aliasRoutes.set(normalizePublicPath(alias), route);
  }
}

function resolveRegisteredRoute(pathname = "/") {
  const requestedPath = normalizePublicPath(pathname);
  const exact = exactRoutes.get(requestedPath);
  if (exact) {
    return {
      ...exact,
      requestedPath,
      canonicalPath: exact.path,
      isAlias: false,
    };
  }

  const aliased = aliasRoutes.get(requestedPath);
  if (aliased) {
    return {
      ...aliased,
      requestedPath,
      canonicalPath: aliased.path,
      isAlias: true,
      handling: aliased.handling === "external" ? "external" : "legacy-redirect",
    };
  }

  const internalPrefix = registry.internalPrefixes.some((prefix) =>
    requestedPath.startsWith(prefix)
  );
  const internalExact = registry.internalExact.includes(requestedPath);
  const categoryExact = (registry.categoryExact || []).includes(requestedPath);

  if (internalPrefix || internalExact || categoryExact) {
    return {
      id: `dynamic:${requestedPath}`,
      path: requestedPath,
      requestedPath,
      canonicalPath: requestedPath,
      pageType: categoryExact
        ? "category"
        : (requestedPath.startsWith("/sforum/") ? "news-article" : (
          internalPrefix && /\.html$/i.test(requestedPath) ? "filter" : "content"
        )),
      handling: "internal",
      appPage: "info",
      dynamic: true,
      title: titleFromPath(requestedPath),
      description: "Thông tin sản phẩm, dịch vụ và chính sách tại CellphoneS.",
      robots: "index,follow",
    };
  }

  if (/^\/[^/]+\.html(?:-\d+)?$/i.test(requestedPath)) {
    return {
      id: `product:${requestedPath}`,
      path: requestedPath,
      requestedPath,
      canonicalPath: requestedPath,
      pageType: "product",
      handling: "internal",
      appPage: "product",
      productSlug: requestedPath.slice(1).replace(/\.html$/i, ""),
      dynamic: true,
      title: `${titleFromPath(requestedPath)} | CellphoneS`,
      description: `Thông tin, giá bán và ưu đãi ${titleFromPath(requestedPath)} tại CellphoneS.`,
      robots: "index,follow",
    };
  }

  return null;
}

function titleFromPath(pathname = "") {
  const segment = normalizePublicPath(pathname).split("/").pop() || "CellphoneS";
  return decodeURIComponent(segment)
    .replace(/\.html$/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getExternalTarget(route) {
  return route?.targetKey ? registry.external[route.targetKey] || "" : "";
}

module.exports = {
  REGISTRY_PATH,
  getExternalTarget,
  normalizePublicPath,
  registry,
  registeredRoutes,
  resolveRegisteredRoute,
  titleFromPath,
};

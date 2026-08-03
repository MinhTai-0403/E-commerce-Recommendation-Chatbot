#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(SCRIPT_DIR, '..');
const ROOT = path.resolve(FRONTEND_ROOT, '..');
const require = createRequire(import.meta.url);
const { collectSitemapInventory } = require('../../src/cellphones/sitemap-inventory.js');

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...valueParts] = argument.replace(/^--/, '').split('=');
    return [key, valueParts.length ? valueParts.join('=') : true];
  }),
);

const API_BASE_URL = String(args.get('base-url') || 'http://localhost:5050').replace(/\/+$/, '');
const CONCURRENCY = Math.max(1, Math.min(30, Number(args.get('concurrency') || 8)));
const PRODUCT_LIMIT = Math.max(8, Math.min(60, Number(args.get('limit') || 20)));
const SKIP_SITEMAP = args.has('skip-sitemap');
const STRICT = args.has('strict');
const INVENTORY_GAP_ROUTES = new Set([
  '/mobile/samsung/galaxy-z/z8-series.html',
]);
const RUN_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const REPORT_DIR = path.join(ROOT, 'reports', 'catalog-audit', RUN_ID);

const normalizeText = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const summarizeCategories = (products = []) => Object.entries(
  products.reduce((counts, product) => {
    const category = product.category || '(trống)';
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {}),
)
  .sort((left, right) => right[1] - left[1])
  .map(([category, count]) => `${category}: ${count}`);

const unique = (values = []) => [...new Set(values.filter(Boolean))];

function normalizeLocalUrl(href = '') {
  if (!String(href).startsWith('/')) return '';
  const url = new URL(href, 'http://catalog.local');
  return `${url.pathname}${url.search}`;
}

function getApiCategory(page = {}) {
  const category = page.category || '';
  const key = normalizeText(category);
  if (key.includes('dien thoai')) return 'Điện thoại';
  if (key.includes('tablet') || key.includes('may tinh bang')) return 'Máy tính bảng';
  return category;
}

function buildListingQuery(page = {}, overrides = {}) {
  const apiCategory = getApiCategory(page);
  const normalizedApiCategory = normalizeText(apiCategory);
  const normalizedKeyword = normalizeText(page.keyword || page.q || page.title);
  const canonicalApiCategory = normalizedApiCategory.replace(/[^a-z0-9]+/g, ' ').trim();
  const canonicalKeyword = normalizedKeyword.replace(/[^a-z0-9]+/g, ' ').trim();
  const applianceEditorialKeys = new Set([
    'cham nha chuan hien dai',
    'cham soc chuan chuyen gia',
    'tu lanh',
    'tu lanh tu dong',
  ]);
  const applianceEditorialKey = applianceEditorialKeys.has(canonicalApiCategory)
    ? canonicalApiCategory
    : (applianceEditorialKeys.has(canonicalKeyword) ? canonicalKeyword : '');
  const isApplianceEditorialLanding = Boolean(applianceEditorialKey);
  const isRefrigeratorLanding = applianceEditorialKey === 'tu lanh'
    || applianceEditorialKey === 'tu lanh tu dong';
  const listingApiCategory = isRefrigeratorLanding
    ? 'Tủ lạnh'
    : (isApplianceEditorialLanding ? 'Đồ gia dụng' : apiCategory);
  const normalizedListingCategory = normalizeText(listingApiCategory);
  const isTradeInLanding = normalizedApiCategory === 'hang cu'
    && normalizedKeyword.includes('thu cu doi moi');
  const isPromotionLanding = normalizedApiCategory === 'khuyen mai';
  const shouldSuppressLooseKeyword = isTradeInLanding
    || isPromotionLanding
    || isApplianceEditorialLanding;
  const flexibleTopicCategories = new Set([
    'phu kien',
    'thiet bi mang',
    'camera',
    'do gia dung',
    'linh kien may tinh',
    'gaming gear',
    'thiet bi van phong',
  ]);
  const strictTopicCategories = new Set([
    'phu kien',
    'thiet bi mang',
    'camera',
    'do gia dung',
    'linh kien may tinh',
    'gaming gear',
    'thiet bi van phong',
  ]);
  const isFlexibleTopicSearch = flexibleTopicCategories.has(normalizedListingCategory)
    && Boolean(page.q);
  const query = {
    source: 'all',
    sort: page.sort || 'latest',
    limit: PRODUCT_LIMIT,
  };

  if (
    page.root === 'category'
    && listingApiCategory
    && !isPromotionLanding
    && (!isFlexibleTopicSearch || strictTopicCategories.has(normalizedListingCategory))
  ) {
    query.category = listingApiCategory;
  }
  if (page.brand) query.brand = page.brand;
  if (page.q && !shouldSuppressLooseKeyword) query.q = page.q;
  if (page.segment) query.segment = page.segment;
  if (page.series) query.series = page.series;
  if (page.filter) query.filter = page.filter;
  if (page.facet) query.facet = page.facet;
  if (page.inStock !== '') query.inStock = page.inStock;
  for (const key of [
    'priceMin', 'priceMax', 'ram', 'storage', 'screenSize', 'usage', 'display',
    'camera', 'refreshRate', 'special', 'chip', 'nfc', 'categoryMode',
  ]) {
    if (page[key] !== undefined && page[key] !== '') query[key] = page[key];
  }
  if (isPromotionLanding) {
    query.filter = 'hot-deal';
    query.sort = 'hot_deal';
  }
  if (applianceEditorialKey === 'cham nha chuan hien dai') query.q = 'Robot hút bụi';
  if (applianceEditorialKey === 'cham soc chuan chuyen gia') query.q = 'Máy massage';
  if (isRefrigeratorLanding) query.q = 'Tủ lạnh';

  return { ...query, ...overrides, limit: overrides.limit || PRODUCT_LIMIT };
}

const requestCache = new Map();

async function fetchProducts(query) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  const url = `${API_BASE_URL}/api/products?${params.toString()}`;
  if (!requestCache.has(url)) {
    requestCache.set(url, (async () => {
      const startedAt = performance.now();
      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(60_000),
        });
        const payload = await response.json().catch(() => ({}));
        return {
          ok: response.ok && payload.ok !== false,
          status: response.status,
          products: Array.isArray(payload.data) ? payload.data : [],
          error: response.ok ? '' : (payload.message || payload.error?.message || `HTTP ${response.status}`),
          durationMs: Math.round(performance.now() - startedAt),
          url,
        };
      } catch (error) {
        return {
          ok: false,
          status: 0,
          products: [],
          error: error.message,
          durationMs: Math.round(performance.now() - startedAt),
          url,
        };
      }
    })());
  }
  return requestCache.get(url);
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
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, worker));
  return results;
}

const categoryAliases = {
  'dien thoai': ['dien thoai'],
  'may tinh bang': ['may tinh bang'],
  laptop: ['laptop'],
  'am thanh': ['am thanh'],
  'tai nghe': ['tai nghe'],
  loa: ['loa'],
  'dong ho thong minh': ['dong ho thong minh'],
  'do gia dung': ['do gia dung', 'nha thong minh', 'apple tv'],
  pc: ['pc', 'may tinh de ban'],
  'linh kien may tinh': ['linh kien may tinh'],
  'man hinh': ['man hinh'],
  tivi: ['tivi'],
  'tu lanh': ['tu lanh'],
  'may giat': ['may giat'],
  'may say quan ao': ['may say quan ao'],
  'may rua bat': ['may rua bat'],
  'may lanh': ['dieu hoa may lanh'],
  'dieu hoa may lanh': ['dieu hoa may lanh'],
};

function categoryMatches(query, product) {
  const requested = String(query.category || '').split('|').map(normalizeText).filter(Boolean);
  if (!requested.length) return true;
  const actual = normalizeText(product.category);
  if (normalizeText(query.categoryMode) === 'primary') {
    return requested.includes(actual);
  }
  const accepted = unique(requested.flatMap((category) => categoryAliases[category] || []));
  if (accepted.length === 0 || accepted.includes(actual)) return true;

  const identity = normalizeText([product.name, product.slug, product.sku].filter(Boolean).join(' '));
  const semanticRules = {
    'tai nghe': /(?:^| )(?:tai nghe|headphone|headset|earbud|airpods|freebuds|galaxy buds)(?: |$)/,
    loa: /(?:^| )(?:loa|speaker|soundbar|homepod|partybox)(?: |$)/,
    'man hinh': /(?:^| )(?:man hinh|monitor)(?: |$)/,
    'may anh': /^(?:may anh|may chup anh|bo kit)(?: |$)/,
  };
  return requested.some((category) => semanticRules[category]?.test(identity));
}

const brandAliases = {
  apple: ['apple', 'iphone', 'ipad'],
  macbook: ['apple', 'macbook'],
  microsoft: ['microsoft', 'surface'],
  nothing: ['nothing'],
};

function brandMatches(brand, product) {
  if (!brand) return true;
  const expected = brandAliases[normalizeText(brand)] || [normalizeText(brand)];
  const identity = normalizeText([
    product.brand,
    product.brandKey,
    product.name,
    product.slug,
  ].filter(Boolean).join(' '));
  return expected.some((candidate) => identity.includes(candidate));
}

const topicStopWords = new Set([
  'san', 'pham', 'thiet', 'bi', 'phu', 'kien', 'chinh', 'hang', 'gia', 'tot',
  'moi', 'cho', 'theo', 'va', 'cac', 'dong', 'loai', 'cham', 'soc',
]);

function topicMatches(q, product) {
  if (!q) return true;
  const identity = normalizeText([
    product.name,
    product.slug,
    product.sku,
    product.brand,
    product.category,
    ...(product.categoryTrail || []).map((item) => item.name || item.label),
  ].filter(Boolean).join(' '));
  return String(q).split('|').some((alternative) => {
    const phrase = normalizeText(alternative);
    if (phrase === 'mic cai ao') {
      return /(?:^| )(?:mic|micro|microphone)(?: |$)/.test(identity)
        && /(?:^| )(?:khong day|wireless|lavalier|cai ao)(?: |$)/.test(identity);
    }
    if (phrase === 'phu kien apple') {
      return /(?:^| )(?:apple|iphone|ipad|macbook|magsafe)(?: |$)/.test(identity);
    }
    if (phrase === 'day deo cheo dien thoai') {
      return /(?:^| )(?:day deo|crossbody strap)(?: |$)/.test(identity);
    }
    if (phrase === 'build pc') {
      return /^(?:pc cps|pc gaming cps|pc do hoa cps|pc workstation)(?: |$)/.test(identity);
    }
    if (phrase === 'hub switch') {
      return /(?:^| )(?:hub|switch|bo chia mang)(?: |$)/.test(identity);
    }
    if (phrase === 'thiet bi mang doanh nghiep') {
      return /(?:^| )(?:access point|switch|bo chia tin hieu|poe)(?: |$)/.test(identity);
    }
    if (phrase && identity.includes(phrase)) return true;
    const tokens = phrase.split(' ').filter((token) => token.length >= 2 && !topicStopWords.has(token));
    return tokens.length > 0 && tokens.every((token) => identity.includes(token));
  });
}

function isExplicitlyOutOfStock(product) {
  const status = normalizeText(`${product.availability || ''} ${product.statusLabel || ''}`);
  return status.includes('outofstock') || status.includes('het hang');
}

function isLikelyInStock(product) {
  const status = normalizeText(`${product.availability || ''} ${product.statusLabel || ''}`);
  return status.includes('instock')
    || status.includes('con hang')
    || status.includes('san hang')
    || Number(product.stock || 0) > 0
    || Number(product.inventory || 0) > 0;
}

function isRecentProduct(product) {
  const cutoff = Date.now() - (45 * 24 * 60 * 60 * 1000);
  return [product.firstSeenAt, product.createdAt, product.updatedAt, product.scrapedAt]
    .map((value) => Date.parse(value || ''))
    .some((date) => Number.isFinite(date) && date >= cutoff);
}

function pricesAreSorted(products, direction) {
  const prices = products.map((product) => Number(product.currentPrice || 0)).filter((price) => price > 0);
  return prices.every((price, index) => (
    index === 0 || (direction === 'asc' ? prices[index - 1] <= price : prices[index - 1] >= price)
  ));
}

function findFacetCandidate(filterId, products, page) {
  if (filterId === 'in-stock') {
    if (!products.some(isLikelyInStock)) return null;
    return {
      params: { inStock: true },
      validate: (items) => items.every((product) => !isExplicitlyOutOfStock(product)),
      label: 'inStock=true',
    };
  }
  if (filterId === 'new') {
    return {
      params: { filter: 'new', sort: 'latest' },
      validate: (items) => items.every(isRecentProduct),
      label: 'Hàng mới về',
    };
  }
  if (filterId === 'price') {
    const prices = products
      .map((product) => Number(product.currentPrice || 0))
      .filter((price) => price > 0)
      .sort((left, right) => left - right);
    if (!prices.length) return null;
    const max = prices[Math.floor(prices.length / 2)];
    return {
      params: { priceMax: max },
      validate: (items) => items.every((product) => Number(product.currentPrice || 0) <= max),
      label: `priceMax=${max}`,
    };
  }
  if (filterId === 'product-line') {
    const q = page.path.includes('/tu-lanh')
      ? 'Tủ lạnh Side By Side'
      : page.path.includes('/may-giat')
        ? 'Máy giặt cửa ngang'
        : page.path.includes('/may-lanh')
          ? 'Máy lạnh 1.0HP'
          : '';
    return q ? { params: { q }, validate: () => true, label: q } : null;
  }

  const facetConfig = {
    ram: ['ram', 'ramGb', (value) => `${value}GB`],
    storage: ['storage', 'storageGb', (value) => `${value}GB`],
    'screen-size': ['screenSize', 'screenSizeInch', (value) => `${value} inch`],
    'refresh-rate': ['refreshRate', 'refreshRateHz', (value) => `${value}Hz`],
    display: ['display', 'display', (value) => value],
    camera: ['camera', 'camera', (value) => value],
    usage: ['usage', 'usage', (value) => value],
    special: ['special', 'special', (value) => value],
    chip: ['chip', 'chipset', (value) => value],
    nfc: ['nfc', 'special', () => 'true'],
  }[filterId];
  if (!facetConfig) return null;
  const [param, facetKey, format] = facetConfig;
  for (const product of products) {
    const raw = product.facets?.[facetKey];
    const values = Array.isArray(raw) ? raw : [raw];
    const value = filterId === 'nfc'
      ? values.find((candidate) => normalizeText(candidate) === 'nfc')
      : values.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');
    if (value !== undefined) {
      return {
        params: { [param]: format(value) },
        validate: () => true,
        label: `${param}=${format(value)}`,
      };
    }
  }
  return null;
}

function markdownCell(value = '') {
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

async function main() {
  const health = await fetch(`${API_BASE_URL}/api/health`, { signal: AbortSignal.timeout(10_000) });
  if (!health.ok) throw new Error(`API health trả HTTP ${health.status}.`);

  const vite = await createServer({
    root: FRONTEND_ROOT,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true },
  });

  let catalogModule;
  let categoryModule;
  let linkModule;
  try {
    [catalogModule, categoryModule, linkModule] = await Promise.all([
      vite.ssrLoadModule('/src/data/catalogLandingProfiles.js'),
      vite.ssrLoadModule('/src/data/categoryLandingProfiles.js'),
      vite.ssrLoadModule('/src/utils/linkRoutes.js'),
    ]);
  } finally {
    await vite.close();
  }

  const publicRoutesPayload = JSON.parse(
    await readFile(path.join(FRONTEND_ROOT, 'src', 'data', 'public-routes.json'), 'utf8'),
  );
  const routeMap = new Map();
  const addRoute = (href, source) => {
    const localUrl = normalizeLocalUrl(href);
    if (!localUrl) return;
    const existing = routeMap.get(localUrl) || { url: localUrl, sources: [] };
    existing.sources = unique([...existing.sources, source]);
    routeMap.set(localUrl, existing);
  };

  publicRoutesPayload.routes
    .filter((route) => route.pageType === 'category')
    .forEach((route) => addRoute(route.path, 'public-route'));

  const catalogProfiles = catalogModule.CATALOG_LANDING_PROFILES || [];
  const categoryProfiles = categoryModule.CATEGORY_LANDING_PROFILES || [];
  for (const profile of [...catalogProfiles, ...categoryProfiles]) {
    addRoute(profile.path, 'profile');
    for (const item of [
      ...(profile.quickLinks || []),
      ...(profile.brandLinks || []),
      ...(profile.featureSection?.items || []),
    ]) {
      addRoute(item.href, 'profile-link');
    }
  }

  const routes = [...routeMap.values()]
    .map((route) => {
      const url = new URL(route.url, 'http://catalog.local');
      const page = linkModule.buildInfoPageModel(url.pathname, url.search);
      return { ...route, page };
    })
    .filter((route) => route.page.isListing);

  const baselineResults = await mapWithConcurrency(routes, CONCURRENCY, async (route) => {
    const query = buildListingQuery(route.page);
    const response = await fetchProducts(query);
    const categoryMismatches = response.products.filter((product) => !categoryMatches(query, product));
    const brandMismatches = response.products.filter((product) => !brandMatches(query.brand, product));
    const topicMismatches = response.products.filter((product) => !topicMatches(query.q, product));
    const issues = [];
    if (!response.ok) issues.push({ severity: 'fail', code: 'api-error', message: response.error });
    if (response.ok && response.products.length === 0) {
      const hasKnownInventoryGap = INVENTORY_GAP_ROUTES.has(route.url);
      issues.push({
        severity: hasKnownInventoryGap ? 'warn' : 'fail',
        code: hasKnownInventoryGap ? 'inventory-gap' : 'empty-listing',
        message: hasKnownInventoryGap
          ? 'Route hợp lệ nhưng MongoDB chưa có sản phẩm thuộc dòng này.'
          : 'Trang không trả sản phẩm.',
      });
    }
    if (categoryMismatches.length) {
      issues.push({ severity: 'fail', code: 'category-mismatch', message: `${categoryMismatches.length} sản phẩm sai category.` });
    }
    if (brandMismatches.length) {
      issues.push({ severity: 'fail', code: 'brand-mismatch', message: `${brandMismatches.length} sản phẩm sai brand.` });
    }
    if (response.products.length && topicMismatches.length > response.products.length / 2) {
      issues.push({ severity: 'warn', code: 'topic-mismatch', message: `${topicMismatches.length}/${response.products.length} tên sản phẩm không thể hiện topic.` });
    }
    return {
      url: route.url,
      sources: route.sources,
      title: route.page.title,
      query,
      status: response.status,
      count: response.products.length,
      durationMs: response.durationMs,
      categories: summarizeCategories(response.products),
      issues,
      samples: response.products.slice(0, 5).map((product) => `${product.name} [${product.category || 'trống'}]`),
      mismatchSamples: unique([
        ...categoryMismatches,
        ...brandMismatches,
        ...topicMismatches,
      ]).slice(0, 5).map((product) => `${product.name} [${product.category || 'trống'}]`),
      products: response.products,
    };
  });

  const controlSpecs = [];
  for (const profile of categoryProfiles) {
    const baseline = baselineResults.find((result) => result.url === profile.path);
    if (!baseline?.products.length) continue;
    const page = linkModule.buildInfoPageModel(profile.path, '');
    const baseQuery = buildListingQuery(page);
    for (const filterId of profile.filterIds || []) {
      if (filterId === 'all') continue;
      const candidate = findFacetCandidate(filterId, baseline.products, page);
      controlSpecs.push({ profile, page, baseQuery, filterId, candidate });
    }
    controlSpecs.push({
      profile,
      page,
      baseQuery,
      filterId: 'sort-price-asc',
      candidate: { params: { sort: 'price_asc' }, validate: (items) => pricesAreSorted(items, 'asc'), label: 'Giá thấp - cao' },
    });
    controlSpecs.push({
      profile,
      page,
      baseQuery,
      filterId: 'sort-price-desc',
      candidate: { params: { sort: 'price_desc' }, validate: (items) => pricesAreSorted(items, 'desc'), label: 'Giá cao - thấp' },
    });
    controlSpecs.push({
      profile,
      page,
      baseQuery,
      filterId: 'hot-deal',
      candidate: baseline.products.some((product) => Number(product.discount || 0) > 0)
        ? {
          params: { sort: 'hot_deal', filter: 'hot-deal' },
          validate: (items) => items.every((product) => Number(product.discount || 0) > 0),
          label: 'Khuyến mãi HOT',
        }
        : null,
    });
  }

  const controlResults = await mapWithConcurrency(controlSpecs, CONCURRENCY, async (spec) => {
    if (!spec.candidate) {
      return {
        path: spec.profile.path,
        title: spec.profile.title,
        control: spec.filterId,
        status: 'skip',
        count: 0,
        detail: 'Không có facet mẫu trong các sản phẩm nền.',
      };
    }
    const response = await fetchProducts({ ...spec.baseQuery, ...spec.candidate.params });
    let status = 'pass';
    let detail = spec.candidate.label;
    if (!response.ok) {
      status = 'fail';
      detail = response.error;
    } else if (response.products.length === 0) {
      status = 'fail';
      detail = `${spec.candidate.label}: trả 0 sản phẩm dù facet lấy từ danh sách nền.`;
    } else if (!spec.candidate.validate(response.products)) {
      status = 'fail';
      detail = `${spec.candidate.label}: dữ liệu trả về không thỏa điều kiện.`;
    }
    return {
      path: spec.profile.path,
      title: spec.profile.title,
      control: spec.filterId,
      status,
      count: response.products.length,
      detail,
      samples: response.products.slice(0, 3).map((product) => product.name),
    };
  });

  let sitemap = {
    skipped: true,
    urlCount: 0,
    byType: {},
    failures: [],
    implementedMatches: 0,
  };
  if (!SKIP_SITEMAP) {
    const inventory = await collectSitemapInventory({
      types: ['category', 'filter'],
      concurrency: 3,
      timeoutMs: 30_000,
    });
    const officialPaths = new Set(inventory.urls.map((entry) => {
      const url = new URL(entry.url);
      return url.pathname;
    }));
    const localPaths = new Set(routes.map((route) => new URL(route.url, 'http://catalog.local').pathname));
    sitemap = {
      skipped: false,
      urlCount: inventory.urls.length,
      byType: inventory.urls.reduce((counts, entry) => {
        counts[entry.sitemapType] = (counts[entry.sitemapType] || 0) + 1;
        return counts;
      }, {}),
      failures: inventory.sitemaps
        .filter((entry) => entry.status !== 'ok')
        .map((entry) => ({ url: entry.loc, status: entry.status, error: entry.error })),
      implementedMatches: [...localPaths].filter((pathname) => officialPaths.has(pathname)).length,
    };
  }

  const baselineFailures = baselineResults.filter((result) => result.issues.some((issue) => issue.severity === 'fail'));
  const baselineWarnings = baselineResults.filter((result) => result.issues.some((issue) => issue.severity === 'warn'));
  const controlFailures = controlResults.filter((result) => result.status === 'fail');
  const summary = {
    generatedAt: new Date().toISOString(),
    apiBaseUrl: API_BASE_URL,
    sitemap,
    listingRoutes: routes.length,
    listingPassed: baselineResults.length - baselineFailures.length,
    listingFailed: baselineFailures.length,
    listingWarnings: baselineWarnings.length,
    controlsTested: controlResults.filter((result) => result.status !== 'skip').length,
    controlsPassed: controlResults.filter((result) => result.status === 'pass').length,
    controlsFailed: controlFailures.length,
    controlsSkipped: controlResults.filter((result) => result.status === 'skip').length,
    uniqueApiRequests: requestCache.size,
  };

  const report = {
    summary,
    baselineResults: baselineResults.map(({ products, ...result }) => result),
    controlResults,
  };
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(path.join(REPORT_DIR, 'catalog-audit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const markdown = [
    '# Catalog and filter audit',
    '',
    `- Generated: ${summary.generatedAt}`,
    `- Official sitemap URLs: ${sitemap.urlCount} (${Object.entries(sitemap.byType).map(([key, value]) => `${key}: ${value}`).join(', ') || 'skipped'})`,
    `- Local listing routes checked: ${summary.listingRoutes}`,
    `- Listings: ${summary.listingPassed} passed, ${summary.listingFailed} failed, ${summary.listingWarnings} warnings`,
    `- Controls: ${summary.controlsPassed} passed, ${summary.controlsFailed} failed, ${summary.controlsSkipped} skipped`,
    `- Unique API requests: ${summary.uniqueApiRequests}`,
    '',
    '## Listing findings',
    '',
    '| Route | Count | Categories | Findings |',
    '| --- | ---: | --- | --- |',
    ...baselineResults
      .filter((result) => result.issues.length)
      .map((result) => `| ${markdownCell(result.url)} | ${result.count} | ${markdownCell(result.categories.join(', '))} | ${markdownCell(result.issues.map((issue) => `${issue.severity}: ${issue.message}`).join('; '))} |`),
    '',
    '## Filter findings',
    '',
    '| Route | Control | Status | Count | Detail |',
    '| --- | --- | --- | ---: | --- |',
    ...controlResults
      .filter((result) => result.status !== 'pass')
      .map((result) => `| ${markdownCell(result.path)} | ${markdownCell(result.control)} | ${result.status} | ${result.count} | ${markdownCell(result.detail)} |`),
    '',
  ].join('\n');
  await writeFile(path.join(REPORT_DIR, 'CATALOG-AUDIT.md'), markdown, 'utf8');

  console.log(JSON.stringify({ summary, reportDir: REPORT_DIR }, null, 2));
  if (STRICT && (baselineFailures.length || controlFailures.length || sitemap.failures.length)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

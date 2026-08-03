import { createProductSlug, extractProductSlug } from '../data/productCatalog';
import { buildCategoryPath } from '../utils/linkRoutes';

const DEFAULT_API_BASE_URL = import.meta.env.DEV ? 'http://localhost:5050' : '';
const API_REQUEST_TIMEOUT_MS = Math.max(
  3_000,
  Number(import.meta.env.VITE_API_REQUEST_TIMEOUT_MS || 15_000),
);
const API_GET_CACHE_MAX_ENTRIES = Math.max(
  20,
  Number(import.meta.env.VITE_API_GET_CACHE_MAX_ENTRIES || 300),
);
const apiGetCache = new Map();
const apiGetInflight = new Map();
const PRODUCT_IMAGE_FALLBACK =
  'https://cdn2.cellphones.com.vn/insecure/rs:fill:300:300/q:90/plain/https://cellphones.com.vn/media/wysiwyg/no-product.png';
const DEAD_PRODUCT_IMAGE_PATHS = new Set([
  '/x/media/catalog/product/s/d/sder54_3__1.jpg',
]);

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/+$/, '');

const normalizeText = (value = '') => (
  String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
);

export const createBrandKey = (brand = '') => {
  const normalized = normalizeText(brand);

  if (normalized.includes('apple') || normalized.includes('iphone') || normalized.includes('ipad') || normalized.includes('mac')) return 'apple';
  if (normalized.includes('samsung')) return 'samsung';
  if (normalized.includes('xiaomi')) return 'xiaomi';
  if (normalized.includes('oppo')) return 'oppo';
  if (normalized.includes('honor')) return 'honor';
  if (normalized.includes('asus')) return 'asus';
  if (normalized.includes('lenovo')) return 'lenovo';
  if (normalized.includes('hp')) return 'hp';
  if (normalized.includes('lg')) return 'lg';
  if (normalized.includes('panasonic')) return 'panasonic';
  if (normalized.includes('coocaa')) return 'coocaa';
  if (normalized.includes('garmin')) return 'garmin';
  if (normalized.includes('sharp')) return 'sharp';
  if (normalized.includes('roborock')) return 'roborock';
  if (normalized.includes('dreame')) return 'dreame';
  if (normalized.includes('tineco')) return 'tineco';

  return createProductSlug(brand || 'hang-khac');
};

const compactVnd = (value) => {
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Number.isInteger(millions) ? millions : millions.toFixed(1)} triệu`;
  }

  return `${Math.round(value / 1000)}K`;
};

const cleanPrice = (value) => {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
};

const stripHtml = (value = '') => (
  String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const getImagePath = (src = '') => {
  try {
    return new URL(String(src), 'https://cellphones.local').pathname;
  } catch {
    return String(src).split('?')[0];
  }
};

const hasUsableImage = (src) => (
  Boolean(src) &&
  !DEAD_PRODUCT_IMAGE_PATHS.has(getImagePath(src)) &&
  !String(src).toLowerCase().includes('no_selection') &&
  !String(src).toLowerCase().includes('no-product') &&
  !String(src).toLowerCase().includes('placeholder') &&
  !/\/(?:\d+x\/)?media\/catalog\/product\/?(?:\?.*)?$/i.test(String(src))
);

const getProductImage = (product = {}) => {
  const candidates = [
    product.image,
    product.thumbnail,
    product.primaryImage,
    ...(Array.isArray(product.images) ? product.images : []),
    ...(Array.isArray(product.media) ? product.media.map((item) => item.src || item.thumbnail) : []),
  ];

  return candidates.find(hasUsableImage) || PRODUCT_IMAGE_FALLBACK;
};

const normalizeSpecificationGroups = (groups = []) => (
  Array.isArray(groups)
    ? groups
      .map((group, groupIndex) => ({
        id: group.id || `spec-group-${groupIndex + 1}`,
        groupName: group.groupName || group.name || 'Thông số kỹ thuật',
        rows: Array.isArray(group.rows)
          ? group.rows.map((row, rowIndex) => ({
            id: row.id || `${group.id || 'spec'}-${rowIndex + 1}`,
            label: row.label || row.name || row.key || '',
            value: row.value || row.values || '',
          })).filter((row) => row.label && row.value !== '')
          : [],
      }))
      .filter((group) => group.rows.length > 0)
    : []
);

const normalizeMedia = (product, image) => {
  if (Array.isArray(product.media) && product.media.length > 0) {
    return product.media
      .map((item, index) => ({
        id: item.id || `${product.slug || product.sku || 'product'}-media-${index + 1}`,
        type: item.type || 'image',
        label: item.label || (index === 0 ? 'Ảnh chính' : `Ảnh ${index + 1}`),
        src: item.src || item.image || item.thumbnail,
        thumbnail: item.thumbnail || item.src || item.image,
        alt: item.alt || product.name,
      }))
      .filter((item) => hasUsableImage(item.src || item.thumbnail));
  }

  const images = [
    ...(Array.isArray(product.images) ? product.images : []),
  ].filter(hasUsableImage);

  const uniqueImages = Array.from(new Set(images.length ? images : [image]));

  return uniqueImages.map((src, index) => ({
    id: `${product.slug || product.sku || 'product'}-image-${index + 1}`,
    type: 'image',
    label: index === 0 ? 'Ảnh chính' : `Ảnh ${index + 1}`,
    src,
    thumbnail: src,
    alt: product.name,
  }));
};

const normalizeCategoryTrail = (product) => {
  if (Array.isArray(product.categoryTrail) && product.categoryTrail.length > 0) {
    return product.categoryTrail.map((item, index) => ({
      id: item.id || `breadcrumb-${index + 1}`,
      name: item.name || item.label || 'Danh mục',
      href: item.href || buildCategoryPath(item.name || item.label || 'Danh mục'),
    }));
  }

  return [
    { id: 'home', name: 'Trang chủ', href: '/' },
    ...(Array.isArray(product.categories) ? product.categories : []).map((category) => ({
      id: createProductSlug(category),
      name: category,
      href: buildCategoryPath(category),
    })),
  ];
};

const buildHighlights = (product, specifications) => {
  if (Array.isArray(product.highlights) && product.highlights.length > 0) {
    return product.highlights;
  }

  const specHighlights = specifications
    .flatMap((group) => group.rows)
    .slice(0, 5)
    .map((row) => `${row.label}: ${Array.isArray(row.value) ? row.value.join(', ') : row.value}`);

  if (specHighlights.length > 0) return specHighlights;

  const description = stripHtml(product.description);
  if (description) {
    return description
      .split(/\. |\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  return [];
};

const buildArticleSections = (product) => {
  if (Array.isArray(product.articleSections) && product.articleSections.length > 0) {
    return product.articleSections;
  }

  const description = stripHtml(product.description);
  if (!description) return [];

  const paragraphs = description
    .split(/\n{2,}|\. (?=[A-ZÀ-Ỵ])/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

  return [
    {
      id: 'mo-ta-san-pham',
      heading: 'Đặc điểm nổi bật',
      paragraphs: paragraphs.length ? paragraphs : [description],
    },
  ];
};

const buildPromotions = (product) => {
  if (Array.isArray(product.promotions) && product.promotions.length > 0) {
    return product.promotions.map((promotion, index) => ({
      id: promotion.id || `promotion-${index + 1}`,
      title: promotion.title || `Ưu đãi ${index + 1}`,
      description: promotion.description || promotion.content || String(promotion),
    }));
  }

  return [
    {
      id: 'online-payment',
      title: 'Ưu đãi thanh toán',
      description: 'Hỗ trợ thanh toán online, trả góp và nhận hàng tại cửa hàng.',
    },
    {
      id: 'fast-delivery',
      title: 'Giao nhanh',
      description: 'Giao nhanh nội thành, miễn phí theo chính sách đơn hàng.',
    },
  ];
};

const buildPolicies = (product) => {
  if (Array.isArray(product.policies) && product.policies.length > 0) {
    return product.policies.map((policy, index) => ({
      id: policy.id || `policy-${index + 1}`,
      title: policy.title || policy.name || 'Chính sách',
      description: policy.description || policy.content || String(policy),
    }));
  }

  return [
    { id: 'official', title: 'Sản phẩm chính hãng', description: 'Thông tin sản phẩm được kiểm tra trước khi bán.' },
    { id: 'warranty', title: 'Bảo hành rõ ràng', description: 'Áp dụng theo chính sách của từng sản phẩm và thương hiệu.' },
    { id: 'support', title: 'Hỗ trợ khách hàng', description: 'Hỗ trợ mua hàng, giao nhận và bảo hành khi cần.' },
  ];
};

export const toProductCardProduct = (product = {}) => {
  const currentPrice = cleanPrice(product.currentPrice ?? product.price);
  const originalPrice = cleanPrice(product.originalPrice);
  const image = getProductImage(product);
  const slug = extractProductSlug(product.slug || product.sku || createProductSlug(product.name || product.id));
  const brandName = product.brandName || product.brand || '';
  const brandKey = product.brandKey || createBrandKey(brandName);
  const discount = originalPrice && currentPrice && originalPrice > currentPrice
    ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
    : Number(product.discount || 0);
  const memberDiscount = currentPrice ? Math.min(Math.round(currentPrice * 0.02 / 1000) * 1000, 1_000_000) : 0;

  return {
    ...product,
    id: String(product.id || product.mongoId || product.sku || slug),
    mongoId: product.mongoId,
    source: product.source || 'cellphones',
    sku: product.sku || slug,
    slug,
    name: product.name || 'Sản phẩm CellphoneS',
    brand: brandKey,
    brandKey,
    brandName,
    image,
    thumbnail: image,
    currentPrice,
    originalPrice: originalPrice || currentPrice,
    discount,
    rating: Number(product.rating || 5),
    ratingCount: Number(product.ratingCount || product.reviewCount || 0),
    installment: product.installment ?? Boolean(currentPrice && currentPrice >= 1_000_000),
    smember: product.smember || (memberDiscount ? `Smember giảm thêm ${compactVnd(memberDiscount)}` : ''),
    sstudent: product.sstudent || '',
    city: product.city || 'Hồ Chí Minh',
    availability: product.availability,
  };
};

export const isSellableApiProduct = (product) => (
  Boolean(product?.name) &&
  Number.isFinite(product.currentPrice) &&
  product.currentPrice > 0 &&
  hasUsableImage(product.image || product.thumbnail)
);

export const isUsableApiProductDetail = (product) => {
  if (!product) return false;
  const name = String(product.name || '').trim();
  const media = Array.isArray(product.media) ? product.media : [];
  const specifications = Array.isArray(product.specifications) ? product.specifications : [];
  const specRows = specifications.reduce((total, group) => total + (group.rows?.length || 0), 0);
  const hasImage = hasUsableImage(product.image || product.thumbnail || product.primaryImage) ||
    media.some((item) => hasUsableImage(item?.src || item?.thumbnail));
  const hasContent = Number(product.currentPrice) > 0 ||
    specRows > 0 ||
    Boolean(product.articleHtml || product.description);

  return Boolean(name && name !== 'Sản phẩm CellphoneS' && hasImage && hasContent);
};

export const toProductDetailProduct = (product = {}, relatedProducts = []) => {
  const cardProduct = toProductCardProduct(product);
  const specifications = normalizeSpecificationGroups(product.specifications);
  const media = normalizeMedia(product, cardProduct.image);
  const availabilityStatus = product.availability?.status || product.availability;

  return {
    ...product,
    ...cardProduct,
    categoryTrail: normalizeCategoryTrail(product),
    media,
    highlights: buildHighlights(product, specifications),
    variants: Array.isArray(product.variants) ? product.variants : [],
    colors: Array.isArray(product.colors) ? product.colors : [],
    promotions: buildPromotions(product),
    policies: buildPolicies(product),
    privileges: Array.isArray(product.privileges) ? product.privileges : [],
    paymentOffers: Array.isArray(product.paymentOffers) ? product.paymentOffers : [],
    priceBenefits: Array.isArray(product.priceBenefits) ? product.priceBenefits : [],
    specifications,
    articleHtml: product.articleHtml || '',
    articleTitle: product.articleTitle,
    articleSections: buildArticleSections(product),
    faqs: Array.isArray(product.faqs) ? product.faqs : [],
    news: Array.isArray(product.news) ? product.news : [],
    reviewSummary: product.reviewSummary,
    stockNote: product.stockNote,
    shortNotice: product.shortNotice,
    relatedProducts,
    statusLabel: product.statusLabel || (availabilityStatus === 'InStock' ? 'Còn hàng' : 'Liên hệ'),
  };
};

export const buildApiUrl = (path, params = {}) => {
  const url = new URL(path, API_BASE_URL || window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  return url.toString();
};

const getApiCacheTtl = (path = '') => {
  if (/\/reviews(?:\/|$)|\/questions(?:\/|$)/.test(path)) return 0;
  if (/\/details(?:\/|$)/.test(path)) return 5 * 60_000;
  if (/\/related(?:\/|$)/.test(path)) return 2 * 60_000;
  if (/^\/api\/products(?:\/|$)/.test(path)) return 60_000;
  return 0;
};

const getCachedApiPayload = (key) => {
  const entry = apiGetCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    apiGetCache.delete(key);
    return null;
  }

  apiGetCache.delete(key);
  apiGetCache.set(key, entry);
  return entry.payload;
};

const cacheApiPayload = (key, payload, ttlMs) => {
  if (!ttlMs) return payload;
  apiGetCache.delete(key);
  apiGetCache.set(key, {
    payload,
    expiresAt: Date.now() + ttlMs,
  });

  while (apiGetCache.size > API_GET_CACHE_MAX_ENTRIES) {
    const oldestKey = apiGetCache.keys().next().value;
    if (!oldestKey) break;
    apiGetCache.delete(oldestKey);
  }
  return payload;
};

const waitForApiPayload = (promise, signal) => {
  if (!signal) return promise;
  if (signal.aborted) {
    return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
  }

  return new Promise((resolve, reject) => {
    const handleAbort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    const cleanup = () => signal.removeEventListener('abort', handleAbort);
    signal.addEventListener('abort', handleAbort, { once: true });
    promise.then(
      (payload) => {
        cleanup();
        resolve(payload);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
};

export async function fetchApiJson(path, params = {}, signal) {
  const requestUrl = buildApiUrl(path, params);
  const cacheTtl = getApiCacheTtl(path);
  const cached = cacheTtl ? getCachedApiPayload(requestUrl) : null;
  if (cached) return waitForApiPayload(Promise.resolve(cached), signal);

  let request = cacheTtl ? apiGetInflight.get(requestUrl) : null;
  if (!request) {
    request = (async () => {
      const timeoutController = new AbortController();
      const timeoutId = window.setTimeout(
        () => timeoutController.abort(),
        API_REQUEST_TIMEOUT_MS,
      );

      try {
        const response = await fetch(requestUrl, {
          credentials: 'include',
          headers: { Accept: 'application/json' },
          signal: timeoutController.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
          const message = payload.message || payload.error?.message || payload.error;
          throw new Error(message || `API request failed: ${response.status}`);
        }
        return cacheApiPayload(requestUrl, payload, cacheTtl);
      } finally {
        window.clearTimeout(timeoutId);
        if (cacheTtl) apiGetInflight.delete(requestUrl);
      }
    })();

    if (cacheTtl) apiGetInflight.set(requestUrl, request);
  }

  return waitForApiPayload(request, signal);
}

export async function fetchProducts(params = {}, signal) {
  const payload = await fetchApiJson('/api/products', params, signal);
  return payload.data || [];
}

export async function fetchProductDetail(slug, signal) {
  const payload = await fetchApiJson(`/api/products/${encodeURIComponent(slug)}/details`, {}, signal);
  return {
    ...(payload.product || {}),
    ...(payload.data || {}),
  };
}

export async function fetchRelatedProducts(slug, limit = 8, signal) {
  const payload = await fetchApiJson(`/api/products/${encodeURIComponent(slug)}/related`, { limit }, signal);
  return payload.data || [];
}

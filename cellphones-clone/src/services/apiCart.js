import { buildApiUrl } from './apiProducts';
import { getAuthToken } from './apiAuth';

const CART_STORAGE_KEY = 'cellphones_cart_v1';

const clampQuantity = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(99, Math.max(1, Math.round(parsed)));
};

const cleanText = (value = '', maxLength = 300) => (
  String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
);

const cleanPrice = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
};

const slugify = (value = '') => (
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'san-pham'
);

const stripHtmlExtension = (value = '') => (
  decodeURIComponent(String(value || ''))
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html$/i, '')
);

const getSlugFromUrl = (url = '') => {
  try {
    const parsed = new URL(url, window.location.origin);
    return stripHtmlExtension(parsed.pathname.split('/').pop());
  } catch {
    return stripHtmlExtension(String(url).split('/').pop());
  }
};

const uniqueStrings = (values = []) => (
  [...new Set(values.map((value) => cleanText(value, 120)).filter(Boolean))]
);

const getProductImage = (product = {}) => {
  const media = Array.isArray(product.media) ? product.media : [];
  const images = Array.isArray(product.images) ? product.images : [];
  const firstMedia = media.find((item) => item?.src || item?.thumbnail) || {};

  return cleanText(
    product.image ||
      product.thumbnail ||
      product.primaryImage ||
      firstMedia.src ||
      firstMedia.thumbnail ||
      images[0],
    700
  );
};

const normalizeSelectedOptions = (product = {}, options = {}) => {
  const selectedOptions = options.selectedOptions || product.selectedOptions || {};
  const selectedColor = options.selectedColor || product.selectedColor || product.color || {};
  const selectedVariant = options.selectedVariant || product.selectedVariant || product.variant || {};
  const normalized = {
    variantId: cleanText(selectedOptions.variantId || selectedVariant.id || product.variantId, 80),
    variantName: cleanText(selectedOptions.variantName || selectedVariant.name || product.variantName, 120),
    colorId: cleanText(selectedOptions.colorId || selectedColor.id || product.colorId, 80),
    colorName: cleanText(selectedOptions.colorName || selectedColor.name || product.colorName, 120),
  };

  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => Boolean(value)));
};

const buildCartItemId = (item = {}) => {
  const base = cleanText(
    item.productId ||
      item.mongoId ||
      item.sku ||
      item.slug ||
      getSlugFromUrl(item.url) ||
      item.name,
    160
  );
  const optionSuffix = uniqueStrings([
    item.selectedOptions?.variantId,
    item.selectedOptions?.variantName,
    item.selectedOptions?.colorId,
    item.selectedOptions?.colorName,
  ])
    .map(slugify)
    .filter(Boolean)
    .join('-');

  return [slugify(base), optionSuffix].filter(Boolean).join('--').slice(0, 220);
};

export const summarizeCart = (items = []) => {
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const subtotal = items.reduce(
    (sum, item) => sum + cleanPrice(item.currentPrice || item.price) * Number(item.quantity || 0),
    0
  );
  const originalSubtotal = items.reduce(
    (sum, item) =>
      sum + cleanPrice(item.originalPrice || item.currentPrice || item.price) * Number(item.quantity || 0),
    0
  );

  return {
    totalItems: items.length,
    totalQuantity,
    subtotal,
    originalSubtotal,
    discount: Math.max(0, originalSubtotal - subtotal),
  };
};

export const normalizeCartItem = (input = {}, options = {}) => {
  const product = input.product || input.item || input;
  const name = cleanText(product.name);
  const slug = stripHtmlExtension(
    product.slug ||
      product.detailSlug ||
      getSlugFromUrl(product.url || product.productUrl) ||
      slugify(name)
  );
  const selectedOptions = normalizeSelectedOptions(product, options);
  const item = {
    productId: cleanText(product.productId || product.id || product.mongoId || product._id || slug, 180),
    mongoId: cleanText(product.mongoId || product._id, 80),
    sku: cleanText(product.sku || slug, 180),
    slug,
    name: name || 'Sản phẩm CellphoneS',
    image: getProductImage(product),
    url: cleanText(product.url || product.productUrl || (slug ? `/${slug}.html` : ''), 700),
    price: cleanPrice(product.price ?? product.currentPrice),
    currentPrice: cleanPrice(product.currentPrice ?? product.price),
    originalPrice: cleanPrice(product.originalPrice),
    brand: cleanText(product.brandName || product.brand || product.brandKey, 120),
    selectedOptions,
    quantity: clampQuantity(options.quantity ?? input.quantity ?? product.quantity ?? 1),
  };

  item.id = cleanText(input.itemId || input.cartItemId || product.cartItemId || buildCartItemId(item), 240);
  return item;
};

export const normalizeCart = (cart = {}) => {
  const items = Array.isArray(cart.items) ? cart.items.map((item) => normalizeCartItem(item)) : [];
  const calculatedSummary = summarizeCart(items);

  return {
    id: cart.id || '',
    userId: cart.userId || '',
    email: cart.email || '',
    items,
    summary: {
      ...(cart.summary || {}),
      ...calculatedSummary,
    },
    createdAt: cart.createdAt || null,
    updatedAt: cart.updatedAt || null,
  };
};

export const emptyCart = () => normalizeCart({ items: [] });

export const mergeCartItems = (existingItems = [], incomingItems = []) => {
  const byId = new Map();

  [...existingItems, ...incomingItems].forEach((rawItem) => {
    const item = normalizeCartItem(rawItem);
    const previous = byId.get(item.id);

    if (previous) {
      byId.set(item.id, {
        ...previous,
        ...item,
        quantity: Math.min(99, Number(previous.quantity || 1) + Number(item.quantity || 1)),
        addedAt: previous.addedAt || item.addedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    byId.set(item.id, {
      ...item,
      addedAt: item.addedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  return [...byId.values()].slice(0, 100);
};

export const getLocalCart = () => {
  try {
    const rawCart = localStorage.getItem(CART_STORAGE_KEY);
    return rawCart ? normalizeCart(JSON.parse(rawCart)) : emptyCart();
  } catch {
    return emptyCart();
  }
};

export const saveLocalCart = (cart) => {
  const normalized = normalizeCart(cart);
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
};

export const clearLocalCart = () => {
  localStorage.removeItem(CART_STORAGE_KEY);
  return emptyCart();
};

export const addLocalCartItem = (product, options = {}) => {
  const cart = getLocalCart();
  const nextItems = mergeCartItems(cart.items, [normalizeCartItem(product, options)]);
  return saveLocalCart({ ...cart, items: nextItems, updatedAt: new Date().toISOString() });
};

export const updateLocalCartItem = (itemId, quantity) => {
  const cart = getLocalCart();
  const nextItems = cart.items
    .map((item) => (
      item.id === itemId
        ? { ...item, quantity: clampQuantity(quantity), updatedAt: new Date().toISOString() }
        : item
    ))
    .filter((item) => Number(item.quantity || 0) > 0);
  return saveLocalCart({ ...cart, items: nextItems, updatedAt: new Date().toISOString() });
};

export const removeLocalCartItem = (itemId) => {
  const cart = getLocalCart();
  return saveLocalCart({
    ...cart,
    items: cart.items.filter((item) => item.id !== itemId),
    updatedAt: new Date().toISOString(),
  });
};

async function cartRequest(path, { method = 'GET', body, signal } = {}) {
  const token = getAuthToken();

  const response = await fetch(buildApiUrl(path), {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || payload.error?.message || 'Không thể cập nhật giỏ hàng.');
  }

  return normalizeCart(payload.data || payload.cart || {});
}

export const fetchServerCart = (signal) => cartRequest('/api/cart', { signal });

export const replaceServerCart = (items, mode = 'replace', signal) => (
  cartRequest('/api/cart', {
    method: 'PUT',
    body: { items, mode },
    signal,
  })
);

export const addServerCartItem = (item, signal) => (
  cartRequest('/api/cart/items', {
    method: 'POST',
    body: { item },
    signal,
  })
);

export const updateServerCartItem = (itemId, quantity, signal) => (
  cartRequest(`/api/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: { quantity },
    signal,
  })
);

export const removeServerCartItem = (itemId, signal) => (
  cartRequest(`/api/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    signal,
  })
);

export const clearServerCart = (signal) => (
  cartRequest('/api/cart', {
    method: 'DELETE',
    signal,
  })
);

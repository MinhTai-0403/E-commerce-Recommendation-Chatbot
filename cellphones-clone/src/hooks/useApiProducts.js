import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchProductDetail,
  fetchProducts,
  fetchRelatedProducts,
  isUsableApiProductDetail,
  isSellableApiProduct,
  toProductCardProduct,
  toProductDetailProduct,
} from '../services/apiProducts';

const DEFAULT_FETCH_MULTIPLIER = 4;
const MAX_FETCH_LIMIT = 300;

const normalizeProductList = (items, displayLimit) => {
  const normalized = items
    .map(toProductCardProduct)
    .filter(isSellableApiProduct);

  return typeof displayLimit === 'number'
    ? normalized.slice(0, displayLimit)
    : normalized;
};

const normalizeText = (value = '') => (
  String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
);

const isGeneratedDescriptionArticle = (product) => {
  if (!product || product.articleHtml) return false;
  const sections = Array.isArray(product.articleSections) ? product.articleSections : [];
  if (sections.length === 0) return true;

  return sections.every((section) => (
    section.id === 'mo-ta-san-pham' ||
    normalizeText(section.heading).startsWith('danh gia ')
  ));
};

const hasItems = (value) => Array.isArray(value) && value.length > 0;

const shouldKeepFallbackDetail = (apiProduct, fallbackProduct) => (
  Boolean(fallbackProduct?.preferLocalDetail) ||
  String(apiProduct?.detailCompleteness || '').includes('summary-fallback')
);

const mergeApiProductWithFallback = (apiProduct, fallbackProduct) => {
  if (!fallbackProduct) return apiProduct;

  const merged = { ...fallbackProduct, ...apiProduct };
  const keepFallbackDetail = shouldKeepFallbackDetail(apiProduct, fallbackProduct);
  const fallbackHasArticle = Boolean(
    fallbackProduct.articleHtml ||
    fallbackProduct.articleSections?.length
  );

  [
    'categoryTrail',
    'media',
    'variants',
    'colors',
    'priceBenefits',
    'promotions',
    'privileges',
    'policies',
    'paymentOffers',
    'specifications',
    'articleSections',
    'faqs',
    'news',
  ].forEach((field) => {
    if (hasItems(fallbackProduct[field]) && (keepFallbackDetail || !hasItems(apiProduct[field]))) {
      merged[field] = fallbackProduct[field];
    }
  });

  if (fallbackHasArticle && (keepFallbackDetail || isGeneratedDescriptionArticle(apiProduct))) {
    merged.articleHtml = fallbackProduct.articleHtml || '';
    merged.articleTitle = fallbackProduct.articleTitle || apiProduct.articleTitle;
    merged.articleSections = fallbackProduct.articleSections || [];
  }

  if (
    fallbackProduct.highlights?.length &&
    (!apiProduct.highlights?.length || keepFallbackDetail)
  ) {
    merged.highlights = fallbackProduct.highlights;
  }

  [
    'stockNote',
    'shortNotice',
    'statusLabel',
  ].forEach((field) => {
    if (fallbackProduct[field] && (keepFallbackDetail || !apiProduct[field])) {
      merged[field] = fallbackProduct[field];
    }
  });

  if (fallbackProduct.preferLocalDetail) {
    merged.name = fallbackProduct.name || merged.name;
    merged.brand = fallbackProduct.brand || merged.brand;
    merged.brandKey = fallbackProduct.brandKey || merged.brandKey;
    merged.category = fallbackProduct.category || merged.category;
    merged.rating = fallbackProduct.rating ?? merged.rating;
    merged.ratingCount = fallbackProduct.ratingCount ?? merged.ratingCount;
    merged.reviewSummary = fallbackProduct.reviewSummary || merged.reviewSummary;
    merged.currentPrice = fallbackProduct.currentPrice || merged.currentPrice;
    merged.originalPrice = fallbackProduct.originalPrice || merged.originalPrice;
  }

  return merged;
};

export function useApiProducts(query, fallbackProducts = []) {
  const queryEnabled = Boolean(query);
  const queryKey = useMemo(() => JSON.stringify(query || {}), [query]);
  const fallback = useMemo(() => (
    Array.isArray(fallbackProducts) ? fallbackProducts : []
  ), [fallbackProducts]);
  const fallbackRef = useRef(fallback);
  const fallbackKey = useMemo(() => (
    fallback
      .map((product) => product?.id || product?.slug || product?.sku || product?.name || '')
      .join('|')
  ), [fallback]);
  const [state, setState] = useState({
    products: fallback,
    loading: false,
    error: null,
    source: 'fallback',
  });

  useEffect(() => {
    fallbackRef.current = fallback;
  }, [fallback, fallbackKey]);

  useEffect(() => {
    if (!queryEnabled) {
      return undefined;
    }

    const controller = new AbortController();
    const parsedQuery = JSON.parse(queryKey);
    const currentFallback = fallbackRef.current;
    const displayLimit = Number(parsedQuery.displayLimit || parsedQuery.limit || 10);
    const fetchLimit = Math.min(
      Number(parsedQuery.fetchLimit || displayLimit * DEFAULT_FETCH_MULTIPLIER),
      MAX_FETCH_LIMIT,
    );
    const requestQuery = {
      sort: 'latest',
      inStock: true,
      ...parsedQuery,
      limit: fetchLimit,
    };
    const canUseFallback = !parsedQuery.brand && !parsedQuery.segment && !parsedQuery.q;

    delete requestQuery.displayLimit;
    delete requestQuery.fetchLimit;

    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setState({
        products: canUseFallback ? currentFallback : [],
        loading: true,
        error: null,
        source: canUseFallback ? 'fallback' : 'api',
      });
    });

    fetchProducts(requestQuery, controller.signal)
      .then((items) => {
        const products = normalizeProductList(items, displayLimit);
        setState({
          products: products.length ? products : (canUseFallback ? currentFallback : []),
          loading: false,
          error: null,
          source: products.length ? 'api' : (canUseFallback ? 'fallback' : 'api'),
        });
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState({
          products: canUseFallback ? currentFallback : [],
          loading: false,
          error,
          source: canUseFallback ? 'fallback' : 'api',
        });
      });

    return () => controller.abort();
  }, [fallbackKey, queryEnabled, queryKey]);

  return state;
}

export function useApiProductDetail(slug, fallbackProduct = null) {
  const [state, setState] = useState({
    product: fallbackProduct,
    loading: Boolean(slug),
    error: null,
    source: fallbackProduct ? 'fallback' : 'api',
  });

  useEffect(() => {
    if (!slug) {
      return undefined;
    }

    const controller = new AbortController();

    Promise.all([
      fetchProductDetail(slug, controller.signal),
      fetchRelatedProducts(slug, 20, controller.signal).catch(() => []),
    ])
      .then(([product, related]) => {
        const relatedProducts = normalizeProductList(related, 8);
        const apiProduct = toProductDetailProduct(product, relatedProducts);
        const mergedProduct = mergeApiProductWithFallback(apiProduct, fallbackProduct);

        if (!isUsableApiProductDetail(mergedProduct)) {
          throw new Error('API product detail is missing core data.');
        }

        setState({
          product: mergedProduct,
          loading: false,
          error: null,
          source: 'api',
        });
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState({
          product: fallbackProduct,
          loading: false,
          error,
          source: 'fallback',
        });
      });

    return () => controller.abort();
  }, [fallbackProduct, slug]);

  return state;
}

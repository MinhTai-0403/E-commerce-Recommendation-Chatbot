import { useEffect, useMemo, useState } from 'react';
import {
  fetchProductDetail,
  fetchProducts,
  fetchRelatedProducts,
  isSellableApiProduct,
  toProductCardProduct,
  toProductDetailProduct,
} from '../services/apiProducts';

const DEFAULT_FETCH_MULTIPLIER = 4;

const normalizeProductList = (items, displayLimit) => {
  const normalized = items
    .map(toProductCardProduct)
    .filter(isSellableApiProduct);

  return typeof displayLimit === 'number'
    ? normalized.slice(0, displayLimit)
    : normalized;
};

export function useApiProducts(query, fallbackProducts = []) {
  const queryKey = useMemo(() => JSON.stringify(query || {}), [query]);
  const fallback = useMemo(() => fallbackProducts || [], [fallbackProducts]);
  const [state, setState] = useState({
    products: fallback,
    loading: false,
    error: null,
    source: 'fallback',
  });

  useEffect(() => {
    if (!query) {
      return undefined;
    }

    const controller = new AbortController();
    const parsedQuery = JSON.parse(queryKey);
    const displayLimit = Number(parsedQuery.displayLimit || parsedQuery.limit || 10);
    const fetchLimit = Math.min(
      Number(parsedQuery.fetchLimit || displayLimit * DEFAULT_FETCH_MULTIPLIER),
      100,
    );
    const requestQuery = {
      sort: 'price_desc',
      inStock: true,
      ...parsedQuery,
      limit: fetchLimit,
    };

    delete requestQuery.displayLimit;
    delete requestQuery.fetchLimit;

    fetchProducts(requestQuery, controller.signal)
      .then((items) => {
        const products = normalizeProductList(items, displayLimit);
        setState({
          products: products.length ? products : fallback,
          loading: false,
          error: null,
          source: products.length ? 'api' : 'fallback',
        });
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState({
          products: fallback,
          loading: false,
          error,
          source: 'fallback',
        });
      });

    return () => controller.abort();
  }, [fallback, query, queryKey]);

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
        setState({
          product: toProductDetailProduct(product, relatedProducts),
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

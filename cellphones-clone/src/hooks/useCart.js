import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAuthToken } from '../services/apiAuth';
import {
  addLocalCartItem,
  addServerCartItem,
  clearLocalCart,
  clearServerCart,
  emptyCart,
  fetchServerCart,
  getLocalCart,
  mergeCartItems,
  normalizeCart,
  normalizeCartItem,
  removeLocalCartItem,
  removeServerCartItem,
  replaceServerCart,
  saveLocalCart,
  summarizeCart,
  updateLocalCartItem,
  updateServerCartItem,
} from '../services/apiCart';

export const CART_ADD_EVENT = 'cellphones:add-to-cart';

const hasToken = () => Boolean(getAuthToken());

export default function useCart(currentUser) {
  const [cart, setCart] = useState(() => getLocalCart());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isAuthenticated = Boolean(currentUser?.id && hasToken());

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();

    async function loadCart() {
      setError('');

      if (!isAuthenticated) {
        setCart(getLocalCart());
        return;
      }

      setLoading(true);
      try {
        const localCart = getLocalCart();
        const serverCart = await fetchServerCart(controller.signal);
        let nextCart = serverCart;

        if (localCart.items.length > 0) {
          const mergedItems = mergeCartItems(serverCart.items, localCart.items);
          nextCart = await replaceServerCart(mergedItems, 'replace', controller.signal);
          clearLocalCart();
        }

        if (!ignore) setCart(nextCart);
      } catch (cartError) {
        if (!ignore) {
          setError(cartError.message || 'Không thể tải giỏ hàng.');
          setCart(getLocalCart());
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadCart();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [isAuthenticated, currentUser?.id]);

  const refreshCartSummary = useCallback((items) => ({
    ...cart,
    items,
    summary: summarizeCart(items),
    updatedAt: new Date().toISOString(),
  }), [cart]);

  const addItem = useCallback(async (product, options = {}) => {
    const item = normalizeCartItem(product, options);
    setError('');

    if (!isAuthenticated) {
      const nextCart = addLocalCartItem(item, { quantity: item.quantity });
      setCart(nextCart);
      return nextCart;
    }

    const optimisticItems = mergeCartItems(cart.items, [item]);
    setCart(refreshCartSummary(optimisticItems));

    try {
      const nextCart = await addServerCartItem(item);
      setCart(nextCart);
      return nextCart;
    } catch (cartError) {
      const fallbackCart = addLocalCartItem(item, { quantity: item.quantity });
      setCart(fallbackCart);
      setError(cartError.message || 'Không thể đồng bộ giỏ hàng, đã lưu tạm trên máy.');
      return fallbackCart;
    }
  }, [cart.items, isAuthenticated, refreshCartSummary]);

  const removeItem = useCallback(async (itemId) => {
    setError('');

    if (!isAuthenticated) {
      const nextCart = removeLocalCartItem(itemId);
      setCart(nextCart);
      return nextCart;
    }

    const optimisticItems = cart.items.filter((item) => item.id !== itemId);
    setCart(refreshCartSummary(optimisticItems));

    try {
      const nextCart = await removeServerCartItem(itemId);
      setCart(nextCart);
      return nextCart;
    } catch (cartError) {
      setError(cartError.message || 'Không thể xoá sản phẩm khỏi giỏ.');
      return cart;
    }
  }, [cart, isAuthenticated, refreshCartSummary]);

  const updateItem = useCallback(async (itemId, quantity) => {
    const nextQuantity = Number(quantity);
    setError('');

    if (nextQuantity <= 0) {
      return removeItem(itemId);
    }

    if (!isAuthenticated) {
      const nextCart = updateLocalCartItem(itemId, nextQuantity);
      setCart(nextCart);
      return nextCart;
    }

    const optimisticItems = cart.items.map((item) => (
      item.id === itemId ? { ...item, quantity: nextQuantity, updatedAt: new Date().toISOString() } : item
    ));
    setCart(refreshCartSummary(optimisticItems));

    try {
      const nextCart = await updateServerCartItem(itemId, nextQuantity);
      setCart(nextCart);
      return nextCart;
    } catch (cartError) {
      setError(cartError.message || 'Không thể cập nhật số lượng.');
      return cart;
    }
  }, [cart, isAuthenticated, refreshCartSummary, removeItem]);

  const clearCart = useCallback(async () => {
    setError('');

    if (!isAuthenticated) {
      const nextCart = clearLocalCart();
      setCart(nextCart);
      return nextCart;
    }

    const previousCart = cart;
    setCart(emptyCart());

    try {
      const nextCart = await clearServerCart();
      setCart(nextCart);
      return nextCart;
    } catch (cartError) {
      setCart(previousCart);
      setError(cartError.message || 'Không thể xoá giỏ hàng.');
      return previousCart;
    }
  }, [cart, isAuthenticated]);

  useEffect(() => {
    const handleAddToCart = (event) => {
      const detail = event.detail || {};
      const product = detail.product || detail.item || detail;
      if (!product?.name && !product?.slug) return;
      addItem(product, detail.options || detail);
    };

    window.addEventListener(CART_ADD_EVENT, handleAddToCart);
    return () => window.removeEventListener(CART_ADD_EVENT, handleAddToCart);
  }, [addItem]);

  useEffect(() => {
    if (isAuthenticated) return;
    saveLocalCart(normalizeCart(cart));
  }, [cart, isAuthenticated]);

  const count = useMemo(() => (
    cart.summary?.totalQuantity ?? cart.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  ), [cart.items, cart.summary?.totalQuantity]);

  return {
    cart,
    count,
    loading,
    error,
    isAuthenticated,
    addItem,
    updateItem,
    removeItem,
    clearCart,
  };
}

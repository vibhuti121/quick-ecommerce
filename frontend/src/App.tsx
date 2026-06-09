import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import ProductGrid from './components/ProductGrid';
import CartDrawer from './components/CartDrawer';
import {
  addToCart,
  getCart,
  getProducts,
  placeOrder,
  removeFromCart,
} from './api';
import type { Cart, DeliveryDetails, Order, Product } from './types';

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [cart, setCart] = useState<Cart | null>(null);
  const [cartOpen, setCartOpen] = useState<boolean>(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([getProducts(), getCart()])
      .then(([fetchedProducts, fetchedCart]) => {
        if (!active) return;
        setProducts(fetchedProducts);
        setCart(fetchedCart);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load products.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const itemCount = useMemo(
    () => (cart?.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const handleAdd = useCallback(async (product: Product) => {
    setAddingId(product.id);
    try {
      const updated = await addToCart(product.id, 1);
      setCart(updated);
      setCartOpen(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add item.');
    } finally {
      setAddingId(null);
    }
  }, []);

  const handleChangeQuantity = useCallback(
    async (productId: number, delta: number) => {
      setBusy(true);
      try {
        const updated = await addToCart(productId, delta);
        setCart(updated);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to update cart.');
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const handleRemove = useCallback(async (productId: number) => {
    setBusy(true);
    try {
      const updated = await removeFromCart(productId);
      setCart(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to remove item.');
    } finally {
      setBusy(false);
    }
  }, []);

  const handleCheckout = useCallback(async (delivery: DeliveryDetails) => {
    setBusy(true);
    try {
      const placed = await placeOrder(delivery);
      setOrder(placed);
      setCart({ items: [], total: 0 });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to place order.');
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDismissOrder = useCallback(() => {
    setOrder(null);
    setCartOpen(false);
  }, []);

  return (
    <div className="app">
      <Header itemCount={itemCount} onOpenCart={() => setCartOpen(true)} />

      <main className="main">
        <section className="hero">
          <h1>Everything you need, delivered quick.</h1>
          <p>Browse our curated picks and check out in seconds.</p>
        </section>

        {error && (
          <div className="banner banner-error">
            <span>{error}</span>
            <button className="icon-button" onClick={() => setError(null)}>
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <div className="state-message">
            <div className="spinner" />
            <p>Loading products…</p>
          </div>
        ) : products.length === 0 && !error ? (
          <div className="state-message">
            <p>No products available right now.</p>
          </div>
        ) : (
          <ProductGrid
            products={products}
            onAdd={handleAdd}
            addingId={addingId}
          />
        )}
      </main>

      <CartDrawer
        open={cartOpen}
        cart={cart}
        busy={busy}
        order={order}
        onClose={() => setCartOpen(false)}
        onChangeQuantity={handleChangeQuantity}
        onRemove={handleRemove}
        onCheckout={handleCheckout}
        onDismissOrder={handleDismissOrder}
      />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import ProductGrid from './components/ProductGrid';
import CartDrawer from './components/CartDrawer';
import ProductDetail from './components/ProductDetail';
import {
  addToCart,
  getCart,
  getProductById,
  getProducts,
  placeOrder,
  removeFromCart,
  searchProducts,
} from './api';
import type { Cart, DeliveryDetails, Order, Product } from './types';

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search: the input updates `query` immediately (responsive box); a debounced effect calls the
  // search endpoint and stores hits in `searchResults`. A blank query falls back to the full catalog.
  const [query, setQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  const [cart, setCart] = useState<Cart | null>(null);
  const [cartOpen, setCartOpen] = useState<boolean>(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [order, setOrder] = useState<Order | null>(null);

  // Product-detail overlay (no router — mirrors the CartDrawer slide-over).
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState<boolean>(false);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

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

  // Debounced search: wait 300ms after the last keystroke, then query. An empty term short-circuits
  // (no request) and the grid shows the full catalog. `active` guards against an out-of-order response
  // from a stale query overwriting a newer one.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const handle = setTimeout(() => {
      searchProducts(term)
        .then((hits) => {
          if (active) setSearchResults(hits);
        })
        .catch((err: unknown) => {
          if (active) setError(err instanceof Error ? err.message : 'Search failed.');
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  const isSearching = query.trim().length > 0;
  const displayed = isSearching ? searchResults : products;

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

  // Open the overlay immediately with the card's product (it already carries provenance from
  // the browse fetch), then refresh from getProductById for the authoritative full record.
  const handleView = useCallback(async (product: Product) => {
    setDetailProduct(product);
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const full = await getProductById(product.id);
      setDetailProduct(full);
    } catch {
      // Keep the browse product already shown; surface nothing fatal for a detail refresh.
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailOpen(false);
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
      <Header
        itemCount={itemCount}
        onOpenCart={() => setCartOpen(true)}
        query={query}
        onQueryChange={setQuery}
        onClearQuery={() => setQuery('')}
      />

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
        ) : isSearching && searching && displayed.length === 0 ? (
          <div className="state-message">
            <div className="spinner" />
            <p>Searching…</p>
          </div>
        ) : isSearching && !searching && displayed.length === 0 && !error ? (
          <div className="state-message">
            <p>No products match “{query.trim()}”.</p>
          </div>
        ) : !isSearching && products.length === 0 && !error ? (
          <div className="state-message">
            <p>No products available right now.</p>
          </div>
        ) : (
          <ProductGrid
            products={displayed}
            onAdd={handleAdd}
            onView={handleView}
            addingId={addingId}
          />
        )}
      </main>

      <ProductDetail
        open={detailOpen}
        product={detailProduct}
        loading={detailLoading}
        adding={detailProduct != null && addingId === detailProduct.id}
        onClose={handleCloseDetail}
        onAdd={handleAdd}
        onViewProduct={handleView}
      />

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

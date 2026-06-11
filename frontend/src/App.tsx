import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import ProductGrid from './components/ProductGrid';
import ProductCard from './components/ProductCard';
import FilterSidebar from './components/FilterSidebar';
import CartDrawer from './components/CartDrawer';
import ProductDetail from './components/ProductDetail';
import ProfileDrawer from './components/ProfileDrawer';
import UpdatesCarousel from './components/UpdatesCarousel';
import ComingSoonModal from './components/ComingSoonModal';
import NotifyModal from './components/NotifyModal';
import RainOverlay from './components/RainOverlay';
import type { ProfileSection } from './components/ProfileDrawer';
import type { NotifyTopic } from './lib/updates';
import {
  addToCart,
  getCart,
  getOrders,
  getProductById,
  getProducts,
  getProfile,
  notify,
  placeOrder,
  removeFromCart,
  searchProducts,
} from './api';
import type {
  Cart,
  DeliveryDetails,
  Order,
  OrderSummary,
  Product,
  UserProfile,
  WishlistItem,
} from './types';
import { getWishlist, removeWishlist, toggleWishlist } from './lib/wishlist';
import { isComingSoon, saveNotify } from './lib/comingSoon';
import {
  COLLECTIONS,
  DEFAULT_FILTERS,
  filterAndSort,
  isBrandProduct,
  isGiCertified,
} from './lib/filters';
import type { Filters } from './lib/filters';

// Iteration 1: shimmer placeholders shown while the catalog/search loads. Reuses the real
// .product-grid + .product-card box so the layout doesn't shift when products arrive. Purely
// presentational — no props/state.
const SKELETON_COUNT = 10;

function SkeletonGrid() {
  return (
    <div className="product-grid" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
        <div className="product-card skeleton-card" key={i} aria-hidden="true">
          <div className="skeleton skeleton-image" />
          <div className="product-body">
            <div className="skeleton skeleton-line skeleton-line--title" />
            <div className="skeleton skeleton-line" />
            <div className="skeleton skeleton-line skeleton-line--short" />
            <div className="product-footer">
              <div className="skeleton skeleton-price" />
              <div className="skeleton skeleton-btn" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Collection Experience (Iteration 7) — a horizontal-scroll merchandising row that reuses the
// real ProductCard (and the grid's handlers), so cards stay identical everywhere. Renders only
// when it has products. Mirrors the inline-component pattern of SkeletonGrid above.
function CollectionRow({
  title,
  subtitle,
  products,
  onAdd,
  onView,
  addingId,
  wishedIds,
  onToggleWishlist,
}: {
  title: string;
  subtitle: string;
  products: Product[];
  onAdd: (product: Product) => void;
  onView: (product: Product) => void;
  addingId: number | null;
  wishedIds: Set<number>;
  onToggleWishlist: (product: Product) => void;
}) {
  if (products.length === 0) return null;
  return (
    <section className="collection-section reveal">
      <div className="collection-head">
        <h2 className="collection-title">{title}</h2>
        <p className="collection-sub">{subtitle}</p>
      </div>
      <div className="collection-row">
        {products.map((p) => (
          <div className="collection-item" key={p.id}>
            <ProductCard
              product={p}
              onAdd={onAdd}
              onView={onView}
              adding={addingId === p.id}
              wished={wishedIds.has(p.id)}
              onToggleWishlist={onToggleWishlist}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// Combos / Gift Packs have no bundle SKU or price in the catalog, so we never fake a purchasable
// bundle — they show as an honest "coming soon" teaser instead.
function CollectionTeaser({
  title,
  subtitle,
  blurb,
}: {
  title: string;
  subtitle: string;
  blurb: string;
}) {
  return (
    <section className="collection-section reveal">
      <div className="collection-head">
        <h2 className="collection-title">{title}</h2>
        <p className="collection-sub">{subtitle}</p>
      </div>
      <div className="collection-teaser">
        <span className="collection-teaser-badge">Coming soon</span>
        <p className="collection-teaser-blurb">{blurb}</p>
      </div>
    </section>
  );
}

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

  // "Coming soon" teaser popup (honey is not launched yet — see lib/comingSoon.ts). Intercepts the
  // view action so honey never opens the buyable detail drawer, from any entry point.
  const [comingSoonProduct, setComingSoonProduct] = useState<Product | null>(null);
  const [comingSoonOpen, setComingSoonOpen] = useState<boolean>(false);

  // Per-banner "notify me" popup opened from the carousel. Driven by the clicked banner's NotifyTopic
  // (honey launch, litchi season, …) — separate from the honey product popup above.
  const [notifyTopic, setNotifyTopic] = useState<NotifyTopic | null>(null);

  // My Profile drawer (a third slide-over): identity, order history, derived addresses, wishlist.
  const [profileOpen, setProfileOpen] = useState<boolean>(false);
  const [profileSection, setProfileSection] = useState<ProfileSection>('orders');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(false);
  // Wishlist is client-side (localStorage) — seed from storage on mount so hearts render correctly.
  const [wishlist, setWishlist] = useState<WishlistItem[]>(() => getWishlist());

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

  // Iteration 9 — scope the storefront to brand products (honey + fruit); hide the generic demo
  // SKUs client-side (the backend still has them). Everything the UI shows derives from this.
  const brandProducts = useMemo(() => products.filter(isBrandProduct), [products]);
  const displayed = useMemo(
    () => (isSearching ? searchResults.filter(isBrandProduct) : brandProducts),
    [isSearching, searchResults, brandProducts],
  );

  // Sidebar filter/sort state + derived grid. Collection counts feed the sidebar "N / Soon" tags.
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const visibleProducts = useMemo(() => filterAndSort(displayed, filters), [displayed, filters]);
  const collectionCounts = useMemo(() => {
    const m: Record<string, number> = { '': brandProducts.length };
    for (const c of COLLECTIONS) m[c.key] = brandProducts.filter(c.match).length;
    return m;
  }, [brandProducts]);
  const selectedCollectionEmpty =
    filters.collection !== '' && (collectionCounts[filters.collection] ?? 0) === 0;

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
    // Honey is not launched — route it to the teaser popup instead of the buyable detail drawer.
    // This single branch covers grid cards, search results, and recommendation clicks (all call here).
    if (isComingSoon(product)) {
      setComingSoonProduct(product);
      setComingSoonOpen(true);
      return;
    }
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

  const handleCloseComingSoon = useCallback(() => {
    setComingSoonOpen(false);
  }, []);

  // Fetch the user's order history (newest-first). Used on profile-open, on Refresh, after checkout,
  // and by the auto-poll. Errors are non-fatal — the panel just keeps whatever it had.
  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      setOrders(await getOrders());
    } catch {
      // history fetch is best-effort; don't hijack the global error banner for the drawer
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const handleOpenProfile = useCallback(() => {
    setProfileOpen(true);
    void loadOrders();
    getProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [loadOrders]);

  const handleToggleWishlist = useCallback((product: Product) => {
    setWishlist(
      toggleWishlist({
        id: product.id,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
      }),
    );
  }, []);

  const handleRemoveWishlist = useCallback((id: number) => {
    setWishlist(removeWishlist(id));
  }, []);

  const wishedIds = useMemo(() => new Set(wishlist.map((w) => w.id)), [wishlist]);

  // Homepage merchandising rows (Iteration 9) — curated from brand products (no fake items).
  // Rows that resolve to [] won't render; the always-empty taxonomy rows (Exotic/Juices) are
  // shown as "coming soon" teasers in the markup instead.
  const merch = useMemo(() => {
    const fruits = brandProducts.filter((p) => p.category?.toLowerCase() === 'fruit');
    const honey = brandProducts.filter((p) => p.category?.toLowerCase() === 'honey');
    const giFruits = fruits.filter(isGiCertified);
    const premium = [...brandProducts].filter((p) => p.price >= 999).sort((a, b) => b.price - a.price);
    const seen = new Set<number>();
    const featured = [...giFruits, ...premium]
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      .slice(0, 8);
    return { featured, seasonal: fruits, giFruits, honey };
  }, [brandProducts]);

  // Auto-poll order status while the drawer is open and any order is still PENDING (the saga settles
  // it to CONFIRMED/FAILED a moment after checkout). The interval clears the instant nothing is
  // pending, the drawer closes, or the component unmounts — no runaway timers. `active` guards a stale
  // response from overwriting a newer one, mirroring the search effect above.
  const hasPendingOrder = orders.some((o) => o.status === 'PENDING');
  useEffect(() => {
    if (!profileOpen || !hasPendingOrder) return;
    let active = true;
    const handle = setInterval(() => {
      getOrders()
        .then((list) => {
          if (active) setOrders(list);
        })
        .catch(() => {
          /* transient — keep polling on the next tick */
        });
    }, 4000);
    return () => {
      active = false;
      clearInterval(handle);
    };
  }, [profileOpen, hasPendingOrder]);

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
      // Refresh history so the just-placed PENDING order is present for the profile drawer to poll.
      void loadOrders();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to place order.');
    } finally {
      setBusy(false);
    }
  }, [loadOrders]);

  const handleDismissOrder = useCallback(() => {
    setOrder(null);
    setCartOpen(false);
  }, []);

  return (
    <div className="app">
      <Header
        itemCount={itemCount}
        onOpenCart={() => setCartOpen(true)}
        onOpenProfile={handleOpenProfile}
        query={query}
        onQueryChange={setQuery}
        onClearQuery={() => setQuery('')}
      />

      <main className="main">
        <UpdatesCarousel onNotify={setNotifyTopic} />

        <section className="hero">
          <div className="hero-content">
            <p className="hero-eyebrow">
              <span aria-hidden="true">🌿</span> GI-tagged · Lab-tested
            </p>
            <h1 className="hero-title">
              Pure honey &amp; GI-tagged fruit,{' '}
              <span className="hero-title-accent">traced to the source.</span>
            </h1>
            <p className="hero-subtitle">
              Lab-tested honey and GI-certified produce — quality you can verify, delivered to your door.
            </p>
            <div className="hero-actions">
              <a href="#products" className="btn btn-primary hero-cta">Shop now</a>
              <a href="#products" className="hero-cta-secondary">Explore the collection →</a>
            </div>
            <ul className="hero-trust">
              <li><span aria-hidden="true">🌿</span> GI-certified</li>
              <li><span aria-hidden="true">🔬</span> Lab-tested purity</li>
              <li><span aria-hidden="true">🚚</span> Cash on delivery</li>
            </ul>
          </div>
          <span className="hero-float hero-float--honey" aria-hidden="true">🍯</span>
          <span className="hero-float hero-float--leaf" aria-hidden="true">🌿</span>
          <a href="#products" className="hero-scroll-cue" aria-label="Scroll to products">
            <span className="hero-scroll-dot" aria-hidden="true" />
          </a>
        </section>

        {error && (
          <div className="toast toast-error" role="alert">
            <span>{error}</span>
            <button className="toast-close" onClick={() => setError(null)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}

        <div id="products" className="products-anchor" aria-hidden="true" />

        <header className="section-head reveal">
          <div className="section-head-row">
            <h2 className="section-title">The collection</h2>
            {!loading && brandProducts.length > 0 && (
              <span className="filter-count">
                {visibleProducts.length} {visibleProducts.length === 1 ? 'product' : 'products'}
              </span>
            )}
          </div>
          <p className="section-sub">Traceable honey &amp; GI-tagged fruit — pick yours.</p>
        </header>

        {loading ? (
          <SkeletonGrid />
        ) : (
          <div className="shop-layout">
            <FilterSidebar filters={filters} onChange={setFilters} counts={collectionCounts} />
            <div className="shop-main">
              {isSearching && searching && displayed.length === 0 ? (
                <SkeletonGrid />
              ) : isSearching && !searching && displayed.length === 0 && !error ? (
                <div className="state-message">
                  <p>No products match “{query.trim()}”.</p>
                </div>
              ) : !isSearching && brandProducts.length === 0 && !error ? (
                <div className="state-message">
                  <p>No products available right now.</p>
                </div>
              ) : selectedCollectionEmpty ? (
                <div className="shop-coming-soon">
                  <span className="collection-teaser-badge">Coming soon</span>
                  <h3>This collection is on its way</h3>
                  <p>We're sourcing traceable picks for this collection — check back soon.</p>
                  <button className="btn btn-secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>
                    Browse all
                  </button>
                </div>
              ) : visibleProducts.length === 0 ? (
                <div className="state-message">
                  <p>No products match these filters.</p>
                  <button className="btn btn-secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>
                    Clear filters
                  </button>
                </div>
              ) : (
                <ProductGrid
                  products={visibleProducts}
                  onAdd={handleAdd}
                  onView={handleView}
                  addingId={addingId}
                  wishedIds={wishedIds}
                  onToggleWishlist={handleToggleWishlist}
                />
              )}
            </div>
          </div>
        )}

        {!isSearching && !loading && brandProducts.length > 0 && (
          <div className="collections">
            <CollectionRow
              title="Featured Collection"
              subtitle="Hand-picked — certified &amp; premium"
              products={merch.featured}
              onAdd={handleAdd}
              onView={handleView}
              addingId={addingId}
              wishedIds={wishedIds}
              onToggleWishlist={handleToggleWishlist}
            />
            <CollectionRow
              title="Seasonal Picks"
              subtitle="Peak-season fruit, cold-chained"
              products={merch.seasonal}
              onAdd={handleAdd}
              onView={handleView}
              addingId={addingId}
              wishedIds={wishedIds}
              onToggleWishlist={handleToggleWishlist}
            />
            <CollectionRow
              title="GI Certified Fruits"
              subtitle="Geographical-Indication tagged"
              products={merch.giFruits}
              onAdd={handleAdd}
              onView={handleView}
              addingId={addingId}
              wishedIds={wishedIds}
              onToggleWishlist={handleToggleWishlist}
            />
            <CollectionRow
              title="Honey Collection"
              subtitle="Raw, single-origin — launching soon"
              products={merch.honey}
              onAdd={handleAdd}
              onView={handleView}
              addingId={addingId}
              wishedIds={wishedIds}
              onToggleWishlist={handleToggleWishlist}
            />
            <CollectionTeaser
              title="Exotic Fruits"
              subtitle="Rare &amp; seasonal imports"
              blurb="Hand-sourced exotic fruit are coming soon."
            />
            <CollectionTeaser
              title="Fruit Juices"
              subtitle="Cold-pressed, nothing added"
              blurb="Cold-pressed juices are launching soon."
            />
          </div>
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
        wished={detailProduct != null && wishedIds.has(detailProduct.id)}
        onToggleWishlist={handleToggleWishlist}
      />

      <ComingSoonModal
        open={comingSoonOpen}
        product={comingSoonProduct}
        onClose={handleCloseComingSoon}
        onNotify={(phone, email) => {
          // Honey is the only isComingSoon category — store all honey-card signups under one topic so
          // they dedupe with the honey carousel banner's signups into a single launch list. Persist to
          // the backend (source of truth) AND localStorage (offline fallback); the POST is best-effort
          // so a backend outage never surfaces an error — the form already showed its confirmation.
          if (comingSoonProduct) {
            saveNotify('honey', phone, email);
            void notify('honey', phone, email).catch(() => {});
          }
        }}
      />

      <NotifyModal
        open={notifyTopic != null}
        topic={notifyTopic}
        onClose={() => setNotifyTopic(null)}
        onNotify={(phone, email) => {
          // Backend (source of truth) + localStorage (offline fallback); POST is best-effort.
          if (notifyTopic) {
            saveNotify(notifyTopic.key, phone, email);
            void notify(notifyTopic.key, phone, email).catch(() => {});
          }
        }}
      />

      <ProfileDrawer
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        activeSection={profileSection}
        onSection={setProfileSection}
        profile={profile}
        orders={orders}
        ordersLoading={ordersLoading}
        onRefreshOrders={loadOrders}
        wishlist={wishlist}
        onRemoveWishlist={handleRemoveWishlist}
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

      <RainOverlay />
    </div>
  );
}

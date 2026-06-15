import { useCallback, useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import Hero from './components/Hero';
import TrustBand from './components/TrustBand';
import FruitQuiz from './components/FruitQuiz';
import TasteMatch from './components/TasteMatch';
import HoneyTeaser from './components/HoneyTeaser';
import GamesHub from './components/GamesHub';
import GameTeaser from './components/GameTeaser';
import SocialProof from './components/SocialProof';
import ProductGrid from './components/ProductGrid';
import CatalogControls from './components/CatalogControls';
import type { SortKey } from './components/CatalogControls';
import RecommendedRow from './components/RecommendedRow';
import CartDrawer from './components/CartDrawer';
import ProductDetail from './components/ProductDetail';
import ProfileDrawer from './components/ProfileDrawer';
import UpdatesCarousel from './components/UpdatesCarousel';
import ComingSoonModal from './components/ComingSoonModal';
import NotifyModal from './components/NotifyModal';
import AuthModal from './components/AuthModal';
import VideoCallGateModal from './components/VideoCall/VideoCallGateModal';
import type { CallStart } from './components/VideoCall/VideoCallGateModal';
import CallRoom from './components/VideoCall/CallRoom';
import type { ProfileSection } from './components/ProfileDrawer';
import type { NotifyTopic } from './lib/updates';
import {
  addToCart,
  getCart,
  getOrders,
  getProductById,
  getProducts,
  getProfile,
  logout,
  notify,
  placeOrder,
  removeFromCart,
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
import { deriveQuizFruitsOrFallback } from './lib/quizFruits';
import { isGiTagged, isLabTested } from './lib/provenance';
import { getLastViewedId, setLastViewedId } from './lib/recentlyViewed';

// LOCAL-ONLY prototype gate. "Taste Match" is a founder-score artifact reachable ONLY at ?taste-match
// (or #taste-match) — it renders a standalone app that never appears in the production nav / on
// mallde.in. Read once at module load (no router); frontend-only, capture is STUBBED (see TasteMatch).
const IS_TASTE_MATCH =
  typeof window !== 'undefined' &&
  (window.location.search.includes('taste-match') || window.location.hash.includes('taste-match'));

// The standalone prototype shell — kept out of the main App tree so it pulls in no catalogue/cart/auth
// hooks at all (true local preview). Rendered by App only when the local-only gate is set.
function TasteMatchApp() {
  return (
    <div className="app tm-standalone">
      <TasteMatch />
    </div>
  );
}

// Top-level shell: pick the standalone prototype OR the full storefront. Branching HERE (rather than
// early-returning inside Storefront) keeps the storefront's hooks unconditional — no Rules-of-Hooks
// violation — while the prototype mounts nothing of the catalogue/cart/auth tree.
export default function App() {
  return IS_TASTE_MATCH ? <TasteMatchApp /> : <Storefront />;
}

function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Catalogue v2 discovery state (all client-side over the already-fetched `products` — no backend
  // call). `query` is now an INLINE LIVE FILTER (substring over the visible grid), not a server search;
  // the OpenSearch `searchProducts` endpoint is retained in api.ts but no longer wired to the grid.
  const [query, setQuery] = useState<string>('');
  const [category, setCategory] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [giOnly, setGiOnly] = useState<boolean>(false);
  const [labOnly, setLabOnly] = useState<boolean>(false);
  // Price ceiling cap. 0 = "no cap set yet" → treated as the catalogue's max (no filtering).
  const [maxPrice, setMaxPrice] = useState<number>(0);
  // Seeds the home "Recommended for you" row; rehydrated from localStorage, updated on each detail open.
  const [lastViewedId, setLastViewedIdState] = useState<number | null>(() => getLastViewedId());

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
  // Our own sign-in (email/phone+password or phone-OTP), opened from the profile drawer's guest note
  // AND from the cart when a guest tries to check out (placing an order requires a real account).
  const [authOpen, setAuthOpen] = useState<boolean>(false);
  // When a guest hits "place order" we stash their delivery details here, open the auth modal, and
  // resume the checkout automatically once they've signed in — so signing in feels like one step, not two.
  const [pendingDelivery, setPendingDelivery] = useState<DeliveryDetails | null>(null);
  // Wishlist is client-side (localStorage) — seed from storage on mount so hearts render correctly.
  const [wishlist, setWishlist] = useState<WishlistItem[]>(() => getWishlist());

  // "Taste Arcade" Games Hub — an OVERLAY rendered INSIDE the storefront (NOT a separate app), so
  // opening/closing it never re-mounts the catalogue/cart/auth tree (auth + cart state persist). Routed
  // by a ?games URL param via pushState/popstate so the browser Back button returns home cleanly.
  const [gamesOpen, setGamesOpen] = useState<boolean>(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('games'),
  );

  // Gated live video call (reuses the FamilyCall WebRTC stack). The gate modal resolves eligibility
  // and asks videocall-service for a short-lived grant; on success it hands back a CallStart and we
  // mount the full-screen CallRoom. `joinRoomId` is set when arriving via a shared invite link
  // (?call=<roomId>) so the gate requests a grant bound to THAT room instead of a fresh one.
  const [videoCallOpen, setVideoCallOpen] = useState<boolean>(false);
  const [activeCall, setActiveCall] = useState<CallStart | null>(null);
  const [joinRoomId, setJoinRoomId] = useState<string | undefined>(undefined);

  // Invite-link entry: if the URL carries ?call=<roomId>, open the gate bound to that room, then
  // strip the param so a reload/leave doesn't re-trigger it. Every joiner is still independently gated.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const call = params.get('call');
    if (call) {
      setJoinRoomId(call);
      setVideoCallOpen(true);
      params.delete('call');
      const qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);

  // ── GAMES HUB ROUTING (?games overlay) ──────────────────────────────────────────────────────────
  // Open the hub by PUSHING a ?games history entry (so Back pops it), and keep React state in sync with
  // the URL via popstate — that's what makes the browser Back button return home WITHOUT re-mounting the
  // storefront (auth/cart/profile state all survive because Storefront never unmounts). Closing from the
  // in-hub "Back to shop" button uses history.back() when we pushed the entry, else strips the param.
  const openGames = useCallback(() => {
    if (gamesOpen) return;
    const params = new URLSearchParams(window.location.search);
    params.set('games', '1');
    const qs = params.toString();
    window.history.pushState({ games: true }, '', window.location.pathname + (qs ? `?${qs}` : ''));
    setGamesOpen(true);
  }, [gamesOpen]);

  const closeGames = useCallback(() => {
    if (!gamesOpen) return;
    // If we pushed a ?games entry, popping it (Back) is the cleanest close — it restores the prior URL
    // and our popstate handler flips the state. Guard against an empty history by also clearing state.
    if (window.history.state && (window.history.state as { games?: boolean }).games) {
      window.history.back();
    } else {
      const params = new URLSearchParams(window.location.search);
      params.delete('games');
      const qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
      setGamesOpen(false);
    }
  }, [gamesOpen]);

  useEffect(() => {
    const onPop = () => {
      setGamesOpen(new URLSearchParams(window.location.search).has('games'));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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

  // Load identity eagerly on mount so the cart knows whether the shopper is a guest BEFORE they reach
  // checkout (ordering requires a real account). Guests resolve to {isGuest:true} via /auth/me's 404.
  useEffect(() => {
    let active = true;
    getProfile()
      .then((p) => { if (active) setProfile(p); })
      .catch(() => { if (active) setProfile(null); });
    return () => { active = false; };
  }, []);

  // Distinct categories for the toolbar pills (lowercase keys, original order of first appearance).
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of products) {
      const key = (p.category ?? '').toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
    return out;
  }, [products]);

  // "Find your MaLLADE match" quiz options — DERIVED from the live catalogue (falls back to the brand's
  // three families on a cold/empty load). Honey options carry isComingSoon so the quiz routes a honey
  // pick to the notify list only, never a cart (honey-not-buyable §4 untouched).
  const quizFruits = useMemo(() => deriveQuizFruitsOrFallback(products), [products]);

  // Slider bound = the most expensive buyable (non-coming-soon) product, rounded up a little.
  const priceCeiling = useMemo(() => {
    const prices = products.filter((p) => !isComingSoon(p)).map((p) => p.price);
    return prices.length ? Math.ceil(Math.max(...prices)) : 0;
  }, [products]);

  // The single client-side pipeline: category → live-query substring → GI/Lab facets → price cap, then
  // sort. Coming-soon (honey) items are exempt from the price cap (they aren't priced for sale) but
  // still obey category/query/GI/Lab so honey can be filtered out like anything else.
  const priceCapActive = maxPrice > 0 && maxPrice < priceCeiling;
  const displayed = useMemo(() => {
    const term = query.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (category !== 'all' && (p.category ?? '').toLowerCase() !== category) return false;
      if (term) {
        const hay = `${p.name} ${p.description} ${p.provenance?.origin ?? ''} ${p.category ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (giOnly && !isGiTagged(p)) return false;
      if (labOnly && !isLabTested(p)) return false;
      if (priceCapActive && !isComingSoon(p) && p.price > maxPrice) return false;
      return true;
    });
    const sorted = [...filtered];
    if (sort === 'price-asc') sorted.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') sorted.sort((a, b) => b.price - a.price);
    else sorted.sort((a, b) => b.id - a.id); // newest = highest id first
    return sorted;
  }, [products, category, query, giOnly, labOnly, priceCapActive, maxPrice, sort]);

  const hasActiveFilters =
    category !== 'all' || query.trim().length > 0 || giOnly || labOnly || priceCapActive;

  const resetFilters = useCallback(() => {
    setCategory('all');
    setQuery('');
    setGiOnly(false);
    setLabOnly(false);
    setMaxPrice(0);
  }, []);

  const itemCount = useMemo(
    () => (cart?.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const handleAdd = useCallback(async (product: Product, quantity: number = 1) => {
    setAddingId(product.id);
    try {
      const updated = await addToCart(product.id, Math.max(1, quantity));
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
    // Remember the opened SKU so the home "Recommended for you" row can seed from it next render.
    setLastViewedId(product.id);
    setLastViewedIdState(product.id);
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

  // Hero "Shop Litchi" CTA — smooth-scroll to the product catalogue anchor.
  const handleScrollToCatalog = useCallback(() => {
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Hero "Honey — coming soon" CTA — jump to the honey teaser section if it's mounted; otherwise
  // fall back to the honey product's coming-soon popup (reuses the existing notify path). This keeps
  // the CTA live regardless of which storefront sections are present.
  const handleHoneyCta = useCallback(() => {
    const teaser = document.getElementById('honey-teaser');
    if (teaser) {
      teaser.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const honey = products.find(isComingSoon);
    if (honey) {
      setComingSoonProduct(honey);
      setComingSoonOpen(true);
    }
  }, [products]);

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

  // Place the order against the live cart. Assumes the caller has already confirmed a real (non-guest)
  // account — the guest gate lives in handleCheckout / handleAuthed, not here.
  const doPlaceOrder = useCallback(async (delivery: DeliveryDetails) => {
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

  // A real (non-guest) JWT is now stored. Close the auth modal, carry the guest cart over to the new
  // identity, refresh the profile + orders, and — if the shopper was mid-checkout — resume placing
  // the order they originally intended.
  const handleAuthed = useCallback(async () => {
    setAuthOpen(false);
    // Carts are keyed on X-User-Id server-side; signing in changes identity (guest-… → usr-…), so the
    // account's server cart won't hold the lines the guest just built. Re-add them under the new token
    // (a best-effort merge) so the cart carries over instead of silently emptying.
    const guestLines = cart?.items ?? [];
    let merged: Cart | null = null;
    for (const line of guestLines) {
      try {
        merged = await addToCart(line.product.id, line.quantity);
      } catch {
        /* a line that fails to re-add just isn't carried over — never block sign-in on it */
      }
    }
    try {
      setCart(merged ?? (await getCart()));
    } catch {
      /* keep whatever cart we already have */
    }
    const fresh = await getProfile().catch(() => null);
    setProfile(fresh);
    void loadOrders();
    // Resume the checkout the guest was attempting before we asked them to sign in.
    if (pendingDelivery && fresh && !fresh.isGuest) {
      const delivery = pendingDelivery;
      setPendingDelivery(null);
      await doPlaceOrder(delivery);
    }
  }, [cart, loadOrders, pendingDelivery, doPlaceOrder]);

  // Drop the stored token; the next API call mints a fresh guest. Refresh the profile so the drawer
  // flips back to the guest view.
  const handleSignOut = useCallback(() => {
    logout();
    getProfile()
      .then(setProfile)
      .catch(() => setProfile(null));
    void loadOrders();
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

  // Placing an order requires a real (signed-in) account — order-service rejects guest tokens with 403.
  // So if the shopper is still a guest, stash their delivery details, open sign-in, and let handleAuthed
  // resume the checkout once they're authenticated. Otherwise place the order directly.
  const handleCheckout = useCallback(async (delivery: DeliveryDetails) => {
    if (!profile || profile.isGuest) {
      setPendingDelivery(delivery);
      setAuthOpen(true);
      return;
    }
    await doPlaceOrder(delivery);
  }, [profile, doPlaceOrder]);

  const handleDismissOrder = useCallback(() => {
    setOrder(null);
    setCartOpen(false);
  }, []);

  // Launch the Taste Match game. It lives behind the module-load gate IS_TASTE_MATCH (?taste-match) so it
  // mounts the standalone prototype shell — navigating there is the cleanest entry (and keeps the game's
  // PROTOTYPE_MODE stub intact). A real hard nav is intentional: the game is a separate render tree.
  const handlePlayGame = useCallback(() => {
    window.location.assign(window.location.pathname + '?taste-match');
  }, []);

  return (
    <div className="app">
      <Header
        itemCount={itemCount}
        onOpenCart={() => setCartOpen(true)}
        onOpenProfile={handleOpenProfile}
        onOpenGames={openGames}
      />

      <Hero onShopClick={handleScrollToCatalog} onHoneyClick={handleHoneyCta} />

      <TrustBand />

      {/* "Find your MaLLADE match" — the Phase-0 waitlist centerpiece. Placed HIGH (right after the
          trust strip, before the catalogue) so it greets the visitor first. No money/cart/checkout:
          ONE notify POST fans out server-side (topic='quiz' + one row per fruit slug, incl. honey as a
          demand signal). saveNotify mirrors locally; the POST is best-effort so a backend outage never
          surfaces an error — the form shows its own confirmation regardless. */}
      <FruitQuiz
        fruits={quizFruits}
        onSubmit={(name, phone, email, pincode, city, state, fruits) => {
          saveNotify('quiz', phone, email, pincode, city, state);
          void notify('quiz', phone, email || undefined, pincode, city, state, {
            name,
            source: 'quiz',
            fruits,
          }).catch(() => {});
        }}
      />

      <main className="main" id="catalog">
        <UpdatesCarousel onNotify={setNotifyTopic} onPlayGames={openGames} />

        {error && (
          <div className="banner banner-error">
            <span>{error}</span>
            <button className="icon-button" onClick={() => setError(null)}>
              ✕
            </button>
          </div>
        )}

        {!loading && products.length > 0 && (
          <CatalogControls
            categories={categories}
            category={category}
            onCategory={setCategory}
            sort={sort}
            onSort={setSort}
            query={query}
            onQuery={setQuery}
            onClearQuery={() => setQuery('')}
            giOnly={giOnly}
            onGiOnly={setGiOnly}
            labOnly={labOnly}
            onLabOnly={setLabOnly}
            priceCeiling={priceCeiling}
            maxPrice={maxPrice}
            onMaxPrice={setMaxPrice}
            onResetFilters={resetFilters}
            resultCount={displayed.length}
            total={products.length}
          />
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
        ) : displayed.length === 0 ? (
          <div className="state-message">
            <p>
              {hasActiveFilters
                ? 'No products match your filters.'
                : 'No products available right now.'}
            </p>
            {hasActiveFilters && (
              <button className="btn btn-secondary" onClick={resetFilters}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <ProductGrid
            products={displayed}
            onAdd={handleAdd}
            onView={handleView}
            addingId={addingId}
            wishedIds={wishedIds}
            onToggleWishlist={handleToggleWishlist}
          />
        )}
      </main>

      {/* Taste Arcade home teaser — a light editorial block that opens the Games Hub overlay. Placed
          beside the honey hook (both are "what's new" desire-builders). No cart/checkout/notify here:
          it only routes to the hub (?games overlay). */}
      <GameTeaser onOpenGames={openGames} onPlay={handlePlayGame} />

      {/* The honey hook lives below the catalogue: the storefront sells litchi today and teases the
          honey launch. Same launch list as the card/carousel/modal — saveNotify('honey') + notify. */}
      <HoneyTeaser
        onNotify={(phone, email, pincode, city, state) => {
          saveNotify('honey', phone, email, pincode, city, state);
          void notify('honey', phone, email, pincode, city, state).catch(() => {});
        }}
      />

      <SocialProof />

      {/* Seeded by the last-viewed SKU (localStorage) over the PUBLIC recommendations endpoint.
          Hides itself entirely on a first visit or when nothing relates — no empty band. */}
      <RecommendedRow seedId={lastViewedId} onView={handleView} />

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
        onNotify={(phone, email, pincode, city, state) => {
          // Honey is the only isComingSoon category — store all honey-card signups under one topic so
          // they dedupe with the honey carousel banner's signups into a single launch list. Persist to
          // the backend (source of truth) AND localStorage (offline fallback); the POST is best-effort
          // so a backend outage never surfaces an error — the form already showed its confirmation.
          if (comingSoonProduct) {
            saveNotify('honey', phone, email, pincode, city, state);
            void notify('honey', phone, email, pincode, city, state).catch(() => {});
          }
        }}
      />

      <NotifyModal
        open={notifyTopic != null}
        topic={notifyTopic}
        onClose={() => setNotifyTopic(null)}
        onNotify={(phone, email, pincode, city, state) => {
          // Backend (source of truth) + localStorage (offline fallback); POST is best-effort.
          if (notifyTopic) {
            saveNotify(notifyTopic.key, phone, email, pincode, city, state);
            void notify(notifyTopic.key, phone, email, pincode, city, state).catch(() => {});
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
        onSignIn={() => setAuthOpen(true)}
        onSignOut={handleSignOut}
      />

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onAuthed={handleAuthed} />

      <CartDrawer
        open={cartOpen}
        cart={cart}
        busy={busy}
        order={order}
        isGuest={!profile || profile.isGuest}
        onClose={() => setCartOpen(false)}
        onChangeQuantity={handleChangeQuantity}
        onRemove={handleRemove}
        onCheckout={handleCheckout}
        onRequireSignIn={() => setAuthOpen(true)}
        onDismissOrder={handleDismissOrder}
      />

      {/* Floating entry point for the gated live call. Open to everyone here; the gate modal handles
          guests (prompts login) and ineligible users (Tally form) — entry never leaks call access. */}
      <button
        className="videocall-fab"
        onClick={() => { setJoinRoomId(undefined); setVideoCallOpen(true); }}
        aria-label="Talk to us live"
      >
        📹 Talk to us live
      </button>

      <VideoCallGateModal
        open={videoCallOpen}
        joinRoomId={joinRoomId}
        onClose={() => setVideoCallOpen(false)}
        onStartCall={(call) => { setActiveCall(call); setVideoCallOpen(false); }}
      />

      {activeCall && (
        <CallRoom
          roomId={activeCall.roomId}
          grant={activeCall.grant}
          iceServers={activeCall.iceServers}
          onLeave={() => { setActiveCall(null); setJoinRoomId(undefined); }}
        />
      )}

      {/* Games Hub overlay — full-screen dark "Taste Arcade" rendered ON TOP of the storefront (which
          stays mounted underneath, preserving auth/cart). Closed via the in-hub Back button (history
          pop) or the browser Back button (popstate). */}
      {gamesOpen && (
        <div className="games-hub-overlay" role="dialog" aria-modal="true" aria-label="Taste Arcade">
          <GamesHub
            onBack={closeGames}
            onPlay={handlePlayGame}
            onSignIn={() => setAuthOpen(true)}
            displayName={profile && !profile.isGuest ? (profile.displayName || profile.email || null) : null}
          />
        </div>
      )}
    </div>
  );
}

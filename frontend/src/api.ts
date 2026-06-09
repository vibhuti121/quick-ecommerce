import type { Cart, CartItem, Order, Product, ProductType } from './types';

// Everything goes through the API gateway (the real edge), not the individual services. In production
// the frontend is served from the same origin as the gateway (behind Caddy), so the empty-string
// default means "same origin". For local dev the gateway is on a separate port, so set VITE_API_BASE
// (e.g. http://localhost:8088) — see frontend/.env.example.
const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

// ---- guest auth -------------------------------------------------------------
// The gateway validates the JWT once and injects X-User-Id downstream; the browser only needs a token.
// We mint a guest token on first use and cache it so the same browser keeps the same cart/identity.
const TOKEN_KEY = 'qe.guestToken';

async function fetchGuestToken(): Promise<string> {
  const res = await fetch(`${BASE}/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Guest Shopper' }),
  });
  if (!res.ok) throw new Error(`Could not start a guest session (${res.status})`);
  const { token } = (await res.json()) as { token: string };
  localStorage.setItem(TOKEN_KEY, token);
  return token;
}

async function getToken(): Promise<string> {
  return localStorage.getItem(TOKEN_KEY) ?? (await fetchGuestToken());
}

async function call<T>(path: string, options: RequestInit, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = new Error(`Request failed: ${res.status} ${res.statusText}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  // 204/empty bodies (e.g. clear-cart) return nothing to parse.
  return (res.status === 204 ? undefined : await res.json()) as T;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  try {
    return await call<T>(path, options, token);
  } catch (e) {
    // A stale/expired guest token → drop it, mint a fresh one, retry exactly once.
    if ((e as { status?: number }).status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      return call<T>(path, options, await fetchGuestToken());
    }
    throw e;
  }
}

// ---- backend wire shapes (only the fields we read) --------------------------
interface CatalogProduct {
  id: number;
  name: string;
  description: string | null;
  basePrice: number;
  imageUrl: string | null;
  category: string | null;
  productType: ProductType;
}
interface CartLine {
  productId: number;
  sku: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
}
interface ServerCart {
  items: Record<string, CartLine>; // keyed by productId
  total: number;
}
// catalog browse is a Spring Data Page, not a bare array — products live under `content`.
interface CatalogPage {
  content: CatalogProduct[];
}
interface OrderItem {
  productId: number;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
}
interface OrderResponse {
  orderId: string;
  totalAmount: number;
  createdAt: string;
  items: OrderItem[];
}

const PLACEHOLDER_IMG = 'https://placehold.co/600x600?text=Product';

function toProduct(p: CatalogProduct): Product {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    price: p.basePrice,
    imageUrl: p.imageUrl ?? PLACEHOLDER_IMG,
    category: p.category ?? 'General',
    productType: p.productType,
  };
}

function lineToCartItem(line: CartLine | OrderItem): CartItem {
  return {
    product: {
      id: line.productId,
      name: line.name,
      description: '',
      price: line.unitPrice,
      imageUrl: ('imageUrl' in line ? line.imageUrl : null) ?? PLACEHOLDER_IMG,
      category: '',
      // Cart/order lines don't carry the product type (the catalog does); this view of the
      // product is only used by the cart UI, which never reads productType. Placeholder only.
      productType: 'PHYSICAL',
    },
    quantity: line.quantity,
  };
}

function toCart(c: ServerCart): Cart {
  return {
    items: Object.values(c.items ?? {}).map(lineToCartItem),
    total: c.total ?? 0,
  };
}

// ---- public API (signatures unchanged so App/CartDrawer/ProductCard are untouched) -----

export async function getProducts(): Promise<Product[]> {
  // size=200 keeps the storefront a single call; paginated browsing is a later phase.
  const page = await request<CatalogPage>('/api/catalog/products?size=200');
  return (page.content ?? []).map(toProduct);
}

export async function getCart(): Promise<Cart> {
  return toCart(await request<ServerCart>('/api/cart'));
}

// quantity is a signed delta at the cart-service (+1 add, -1 decrement; a line ≤0 is removed).
export async function addToCart(productId: number, quantity: number): Promise<Cart> {
  return toCart(
    await request<ServerCart>('/api/cart/items', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity }),
    }),
  );
}

export async function removeFromCart(productId: number): Promise<Cart> {
  return toCart(
    await request<ServerCart>(`/api/cart/items/${productId}`, { method: 'DELETE' }),
  );
}

// Checkout reads the live cart, builds the order lines, and posts with an Idempotency-Key so a retry
// (network blip, double-click) never creates or charges twice. The saga settles asynchronously; the
// returned order starts PENDING and the backend confirms it shortly after via the outbox→saga.
export async function placeOrder(): Promise<Order> {
  const server = await request<ServerCart>('/api/cart');
  const lines = Object.values(server.items ?? {});
  if (lines.length === 0) throw new Error('Your cart is empty.');

  const idempotencyKey =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `co-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const res = await request<OrderResponse>('/api/orders/checkout', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      currency: 'INR',
      items: lines.map((l) => ({
        productId: l.productId,
        sku: l.sku,
        name: l.name,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
      })),
    }),
  });

  // Empty the cart now that the order is placed (non-fatal if it fails — the order already exists).
  try {
    await request('/api/cart', { method: 'DELETE' });
  } catch {
    /* ignore */
  }

  return {
    orderId: res.orderId,
    items: res.items.map(lineToCartItem),
    total: res.totalAmount,
    placedAt: res.createdAt,
  };
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(value);
}

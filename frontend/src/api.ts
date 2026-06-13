import type {
  Cart,
  CartItem,
  DeliveryDetails,
  DeliveryStatus,
  Order,
  OrderStatus,
  OrderSummary,
  Product,
  Provenance,
  UserProfile,
  Variant,
} from './types';

// Everything goes through the API gateway (the real edge), not the individual services. In production
// the frontend is served from the same origin as the gateway, so the empty-string default means
// "same origin". For local dev leave VITE_API_BASE empty too: the Vite dev server proxies /api and
// /auth to the HTTPS gateway (https://localhost:8443, self-signed) — see frontend/.env.example.
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
    // Surface the server's ProblemDetail when present (e.g. the checkout 409 carries `detail`
    // "Out of stock: SKU" and a `sku` property) so callers can show a real message, not a bare code.
    let detail: string | undefined;
    let sku: string | undefined;
    try {
      const body = (await res.clone().json()) as { detail?: string; sku?: string };
      detail = body?.detail;
      sku = body?.sku;
    } catch {
      /* non-JSON / empty error body — fall back to the status line */
    }
    const err = new Error(detail ?? `Request failed: ${res.status} ${res.statusText}`);
    (err as Error & { status?: number; sku?: string }).status = res.status;
    if (sku) (err as Error & { sku?: string }).sku = sku;
    throw err;
  }
  // 204/empty bodies (e.g. clear-cart) return nothing to parse.
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// During a cold start (or a service restart) an upstream behind the gateway can still be warming
// up, so the gateway answers 503/502/504 for a few seconds — and a TCP connect can be refused
// outright (fetch rejects with no .status). The storefront's first paint (home grid, recs) is all
// safe GETs, so we retry those a few times with backoff to let the stack self-heal, instead of
// leaving a dead error grid until the user manually reloads. Only idempotent GETs are retried;
// cart/checkout mutations are never auto-replayed.
const TRANSIENT_STATUS = new Set([502, 503, 504]);
const MAX_RETRIES = 4; // total attempts = 1 + 4; backoff 0.4s,0.8s,1.6s,3.2s ≈ 6s of self-heal

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const isIdempotent = (options.method ?? 'GET').toUpperCase() === 'GET';
  for (let attempt = 0; ; attempt++) {
    try {
      return await call<T>(path, options, token);
    } catch (e) {
      const status = (e as { status?: number }).status;
      // A stale/expired guest token → drop it, mint a fresh one, retry exactly once.
      if (status === 401) {
        localStorage.removeItem(TOKEN_KEY);
        return call<T>(path, options, await fetchGuestToken());
      }
      // Transient upstream-not-ready: a 5xx from the gateway, or a connect failure (status
      // undefined). Retry idempotent GETs with backoff so the cold-start window heals itself.
      const transient = status === undefined || TRANSIENT_STATUS.has(status);
      if (isIdempotent && transient && attempt < MAX_RETRIES) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      throw e;
    }
  }
}

// ---- backend wire shapes (only the fields we read) --------------------------
interface WireVariant {
  sku: string;
  name: string;
  priceDelta: number | null;
  attributes: Record<string, unknown> | null;
}
interface CatalogProduct {
  id: number;
  sku?: string | null;
  name: string;
  description: string | null;
  basePrice: number;
  imageUrl: string | null;
  category: string | null;
  // The list AND by-id endpoints both return the full ProductResponse, so attributes
  // (carrying provenance) and variants are available on the browse path too.
  attributes?: Record<string, unknown> | null;
  variants?: WireVariant[] | null;
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
  status: OrderStatus;
  totalAmount: number;
  currency: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryStatus: DeliveryStatus;
  createdAt: string;
  items: OrderItem[];
}

const PLACEHOLDER_IMG = 'https://placehold.co/600x600?text=Product';

// Pull the typed provenance sub-object out of the loose attributes JSONB. Lenient: any missing
// or malformed piece just yields undefined, so a legacy product (no provenance) maps cleanly.
function extractProvenance(attributes: Record<string, unknown> | null | undefined): Provenance | undefined {
  const prov = attributes?.['provenance'];
  if (!prov || typeof prov !== 'object') return undefined;
  return prov as Provenance;
}

function toVariant(v: WireVariant): Variant {
  return {
    sku: v.sku,
    name: v.name,
    priceDelta: v.priceDelta ?? 0,
    attributes: v.attributes ?? undefined,
  };
}

function toProduct(p: CatalogProduct): Product {
  const provenance = extractProvenance(p.attributes);
  const variants = (p.variants ?? []).map(toVariant);
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? '',
    price: p.basePrice,
    imageUrl: p.imageUrl ?? PLACEHOLDER_IMG,
    category: p.category ?? 'General',
    sku: p.sku ?? undefined,
    ...(provenance ? { provenance } : {}),
    ...(variants.length ? { variants } : {}),
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

// Full-text search (OpenSearch-backed, typo-tolerant; degrades to a Postgres scan if search is down).
// Same Page<ProductResponse> shape as browse, so the result maps through the same toProduct.
export async function searchProducts(q: string): Promise<Product[]> {
  const page = await request<CatalogPage>(
    `/api/catalog/products/search?q=${encodeURIComponent(q)}&size=50`,
  );
  return (page.content ?? []).map(toProduct);
}

// Hybrid "you may also like" recommendations for a product (co-purchase first, content-based fills,
// same-category fallback). Public + best-effort on the backend — it never 503s, so an empty array
// simply means "no related products to show". NOTE: unlike browse/search this returns a BARE array
// (List<ProductResponse>), not a Spring Page — so we map the array directly, not `.content`.
export async function getRecommendations(productId: number): Promise<Product[]> {
  const list = await request<CatalogProduct[]>(
    `/api/catalog/products/${productId}/recommendations?size=8`,
  );
  return (list ?? []).map(toProduct);
}

// Detail fetch: the full ProductResponse for one product, mapped with provenance + variants.
// Used by the product-detail overlay (the browse cards already carry provenance from getProducts).
export async function getProductById(id: number): Promise<Product> {
  return toProduct(await request<CatalogProduct>(`/api/catalog/products/${id}`));
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
export async function placeOrder(delivery: DeliveryDetails): Promise<Order> {
  const server = await request<ServerCart>('/api/cart');
  const lines = Object.values(server.items ?? {});
  if (lines.length === 0) throw new Error('Your cart is empty.');

  const idempotencyKey =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `co-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let res: OrderResponse;
  try {
    res = await request<OrderResponse>('/api/orders/checkout', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        currency: 'INR',
        customerName: delivery.customerName.trim(),
        customerPhone: delivery.customerPhone.trim(),
        deliveryAddress: delivery.deliveryAddress.trim(),
        pincode: delivery.pincode.trim(),
        city: delivery.city.trim(),
        state: delivery.state.trim(),
        items: lines.map((l) => ({
          productId: l.productId,
          sku: l.sku,
          name: l.name,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
        })),
      }),
    });
  } catch (e) {
    // The Redis ATP guard rejects an out-of-stock checkout instantly with 409 (no order created).
    // Translate the SKU into the product name the shopper recognizes; the cart is left intact so
    // they can adjust quantities and retry.
    const err = e as { status?: number; sku?: string };
    if (err.status === 409) {
      const short = err.sku ? lines.find((l) => l.sku === err.sku) : undefined;
      throw new Error(
        short
          ? `Sorry, "${short.name}" just went out of stock. Please reduce the quantity or remove it to continue.`
          : 'Sorry, one of your items just went out of stock. Please review your cart and try again.',
      );
    }
    throw e;
  }

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

// ---- order history (My Profile → My Orders) ---------------------------------
// GET /api/orders is gateway-gated and scoped to the token's X-User-Id (newest-first). It returns the
// full OrderResponse list, so a single call backs the whole history view. Maps the loose wire shape
// into the strict OrderSummary the UI renders; status/deliveryStatus drive the two badges + the poll.
function toOrderSummary(o: OrderResponse): OrderSummary {
  return {
    orderId: o.orderId,
    status: o.status,
    deliveryStatus: o.deliveryStatus,
    total: o.totalAmount,
    currency: o.currency ?? 'INR',
    placedAt: o.createdAt,
    customerName: o.customerName ?? '',
    customerPhone: o.customerPhone ?? '',
    deliveryAddress: o.deliveryAddress ?? '',
    items: (o.items ?? []).map((i) => ({
      productId: i.productId,
      sku: i.sku,
      name: i.name,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
    })),
  };
}

export async function getOrders(): Promise<OrderSummary[]> {
  const list = await request<OrderResponse[]>('/api/orders');
  return (list ?? []).map(toOrderSummary);
}

// ---- identity (My Profile → My Profile) -------------------------------------
// The JWT payload carries the base identity (sub/displayName/email/role) and is decodable client-side
// with no network call, so a guest always has a profile. /auth/me is then a best-effort enrichment for
// a logged-in (OAuth) account — it is DB-backed and 404s for guests, which we treat as "isGuest:true".
interface JwtClaims {
  sub?: string;
  userId?: string;
  displayName?: string;
  name?: string;
  email?: string;
  role?: string;
  picture?: string;
}

// Decode a JWT payload (middle segment) without verifying — we only read display claims, and the
// gateway is the real verifier. base64url-safe; returns {} on any malformed token so callers degrade.
function decodeJwt(token: string): JwtClaims {
  try {
    const payload = token.split('.')[1];
    if (!payload) return {};
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json) as JwtClaims;
  } catch {
    return {};
  }
}

interface MeResponse {
  userId?: string;
  displayName?: string;
  email?: string;
  picture?: string | null;
  role?: string;
}

export async function getProfile(): Promise<UserProfile> {
  const claims = decodeJwt(await getToken());
  const base: UserProfile = {
    userId: claims.userId ?? claims.sub ?? '',
    displayName: claims.displayName ?? claims.name ?? 'Guest Shopper',
    email: claims.email,
    picture: claims.picture,
    role: claims.role ?? 'GUEST',
    isGuest: true, // assume guest until /auth/me confirms a persisted account
  };
  try {
    const me = await request<MeResponse>('/auth/me');
    return {
      userId: me.userId ?? base.userId,
      displayName: me.displayName ?? base.displayName,
      email: me.email ?? base.email,
      picture: me.picture ?? base.picture,
      role: me.role ?? base.role,
      isGuest: false, // a 200 from the DB-backed endpoint means a real account
    };
  } catch {
    // 404 (guest, no DB row) or any failure → keep the token-derived guest identity.
    return base;
  }
}

// ---- self-service auth (email/phone + password, and phone OTP) --------------
// These mint a REAL (non-guest) JWT and store it under the SAME TOKEN_KEY as the guest token, so the
// rest of the app (cart, orders, profile, the videocall non-guest gate) immediately treats the browser
// as logged in and getProfile() reflects the real identity. Unlike request(), they do NOT attach a
// bearer or auto-mint a guest token — they ARE the login. The backend keeps failures generic
// (anti-enumeration): we surface whatever {error} message it returns verbatim.
interface AuthTokenResponse {
  token: string;
  displayName: string;
}

async function postAuth<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = (text ? JSON.parse(text) : {}) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data.error === 'string' ? data.error : `Request failed (${res.status})`;
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function register(
  identifier: string,
  password: string,
  displayName?: string,
): Promise<void> {
  const { token } = await postAuth<AuthTokenResponse>('/auth/register', {
    identifier: identifier.trim(),
    password,
    displayName: displayName?.trim() ? displayName.trim() : undefined,
  });
  localStorage.setItem(TOKEN_KEY, token);
}

export async function login(identifier: string, password: string): Promise<void> {
  const { token } = await postAuth<AuthTokenResponse>('/auth/login', {
    identifier: identifier.trim(),
    password,
  });
  localStorage.setItem(TOKEN_KEY, token);
}

export interface OtpRequestResult {
  sent: boolean;
  devCode?: string; // present ONLY when the backend runs with OTP_DEV_ECHO=true (dev/CI)
}

export async function requestOtp(phone: string): Promise<OtpRequestResult> {
  return postAuth<OtpRequestResult>('/auth/otp/request', { phone: phone.trim() });
}

export async function verifyOtp(phone: string, code: string): Promise<void> {
  const { token } = await postAuth<AuthTokenResponse>('/auth/otp/verify', {
    phone: phone.trim(),
    code: code.trim(),
  });
  localStorage.setItem(TOKEN_KEY, token);
}

// Drop the stored token; the next API call mints a fresh guest session. Used by "Sign out".
export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ---- gated video calling (Phase 3) ------------------------------------------
// Two endpoints on videocall-service, both under /api/videocall so the gateway requires a logged-in
// token (guests are rejected server-side). The browser only sends its token via the shared request()
// helper — all real enforcement (eligibility, 5h cooldown, 10-min grant, max-3) is server-side.
export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

// The gate's answer. `available:false` is the SILENT block — it carries no reason and no countdown,
// so cooldown and "no capacity" look identical to the client by design.
export interface GrantResult {
  available: boolean;
  grant?: string;
  roomId?: string;
  expiresInSeconds?: number;
  iceServers?: IceServerConfig[];
}

interface EligibilityResult {
  eligible: boolean;
  created: boolean;
}

// Records Tally completion server-side (idempotent upsert keyed on the token's user). 200/201 both
// mean "recorded"; a guest/missing-identity token is rejected with 401/403 (the caller treats any
// throw as "not eligible yet").
export async function recordEligibility(): Promise<EligibilityResult> {
  return request<EligibilityResult>('/api/videocall/eligibility', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

// Requests a call grant. Pass an existing roomId to JOIN that room (invitee); omit it to START a new
// room (host) — the server generates the roomId. Every participant is independently gated.
export async function requestGrant(roomId?: string): Promise<GrantResult> {
  return request<GrantResult>('/api/videocall/grant', {
    method: 'POST',
    body: JSON.stringify(roomId ? { roomId } : {}),
  });
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(value);
}

// ---- launch-interest signup ("Notify me") -----------------------------------
// POST /api/catalog/notify is the public, gateway-whitelisted endpoint that persists a signup to
// Postgres (the source of truth the founder reads). The storefront ALSO writes localStorage as an
// offline fallback (see lib/comingSoon.saveNotify), so callers fire this best-effort: a backend outage
// must not surface an error to the visitor, who already saw the form's own confirmation.
interface NotifyResponse {
  id: number;
  topic: string;
  phone: string;
  email?: string;
  createdAt: string;
}

// Optional extras carried ONLY by the quiz path ("Find your MaLLADE match"). The backend (migration
// V6) added `name`/`source` columns to notify_signups and fans out server-side: one row per fruit
// slug (topic=<slug>) plus the umbrella topic="quiz" row, deduped on (topic, phone). The honey
// callers (HoneyTeaser/ComingSoonModal/NotifyModal) pass NONE of these, so their JSON body stays
// byte-identical to before. fruits[] = lowercase fruit SLUGS [a-z0-9-]{1,32}, max 24 — sent ONCE as
// an array; never loop client-side.
export interface NotifyExtra {
  name?: string;
  source?: string;
  fruits?: string[];
}

// pincode/city/state are required by the backend (the serviceability pilot — see lib/pincode). They
// arrive resolved+editable from NotifyForm; pass them through verbatim. `extra` is optional and only
// the quiz supplies it — when omitted, the request body is identical to the 6-arg honey contract.
export async function notify(
  topic: string,
  phone: string,
  email: string | undefined,
  pincode: string,
  city: string,
  state: string,
  extra?: NotifyExtra,
): Promise<void> {
  // Base body is exactly the legacy honey shape — do NOT add name/source/fruits keys unless the quiz
  // actually supplied them, so the honey payload remains byte-for-byte unchanged.
  const body: Record<string, unknown> = {
    topic,
    phone,
    email: email ?? null,
    pincode: pincode.trim(),
    city: city.trim(),
    state: state.trim(),
  };
  if (extra) {
    if (extra.name?.trim()) body.name = extra.name.trim();
    if (extra.source?.trim()) body.source = extra.source.trim();
    // Normalize + cap defensively even though the helper already produces clean slugs: lowercase,
    // slug charset, dedupe, max 24. An empty array is omitted so we never send fruits:[] noise.
    if (extra.fruits && extra.fruits.length) {
      const fruits = Array.from(
        new Set(
          extra.fruits
            .map((f) => f.trim().toLowerCase())
            .filter((f) => /^[a-z0-9-]{1,32}$/.test(f)),
        ),
      ).slice(0, 24);
      if (fruits.length) body.fruits = fruits;
    }
  }
  await request<NotifyResponse>('/api/catalog/notify', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

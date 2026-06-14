// ---- MaLLADE provenance (lives under the catalog product's attributes.provenance JSONB) ----
// The brand's value proposition: every unit is traceable. These mirror the seed shape in
// V3__seed_mallade_provenance.sql. All optional/lenient so a product without provenance
// (the legacy demo SKUs) still type-checks.
export interface LabCert {
  ref: string; // e.g. "NABL-TC-9921/26"
  test: string; // what was tested, e.g. "C4 sugar + NMR adulteration panel"
  status: string; // "passed" | "pending" | ...
}

// GI = Geographical Indication. status "authorized" is the ONLY value that earns the GI badge;
// "pending"/"none" render as plain text — never an unearned GI claim (compliance rule).
export interface GiInfo {
  status: 'authorized' | 'pending' | 'none' | string;
  name?: string;
  authNo?: string;
}

export interface Provenance {
  farm?: string;
  origin?: string;
  harvest?: string;
  batch?: string;
  labCert?: LabCert;
  gi?: GiInfo;
}

// Informational only (e.g. fruit grades / honey sizes shown on the detail page). Add-to-cart
// stays product-level, so a variant is never a cart line key — see api.ts / the per-SKU decision.
export interface Variant {
  sku: string;
  name: string;
  priceDelta: number;
  attributes?: Record<string, unknown>;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  category: string;
  // Optional richer fields, populated by getProductById (detail) and carried on browse cards
  // when present. Kept optional so the lean browse mapping and legacy consumers stay valid.
  sku?: string;
  provenance?: Provenance;
  variants?: Variant[];
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Cart {
  items: CartItem[];
  total: number;
}

export interface Order {
  orderId: string;
  items: CartItem[];
  total: number;
  placedAt: string;
}

// ---- profile / order-history (My Profile drawer) --------------------------------------------
// Saga state on the backend: PENDING settles to CONFIRMED (or FAILED) a moment after checkout.
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';
// COD fulfilment state, advanced by the admin platform.
export type DeliveryStatus = 'AWAITING_DELIVERY' | 'DELIVERED' | 'CANCELLED';

// One line of a historical order (lighter than CartItem — no nested Product needed to render).
export interface OrderLine {
  productId: number;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

// A past order as shown in My Orders. Mirrors the backend OrderResponse (order-service Dtos.java).
export interface OrderSummary {
  orderId: string;
  status: OrderStatus;
  deliveryStatus: DeliveryStatus;
  total: number;
  currency: string;
  items: OrderLine[];
  placedAt: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
}

// Identity for the My Profile panel. Derived from the JWT (guest-safe); enriched by /auth/me for
// logged-in users. isGuest = no persisted account behind the token (the storefront default today).
export interface UserProfile {
  userId: string;
  displayName: string;
  email?: string;
  picture?: string;
  role: string;
  isGuest: boolean;
}

// ---- Taste Match conversion layer (the ?taste-match game's go-live persistence) -------------
// The server-side mirror of the game's per-device progression (XP/tier/passport/badges/streak +
// the persona & the demand-footprint state/pincode). Returned by GET /api/catalog/taste/profile
// (auth) and POST .../merge. ALL fields optional/lenient so a partial or stub server response, or a
// 404 in local dev, degrades cleanly to the localStorage state (same resilience as getProfile()).
export interface TasteProfile {
  xp?: number;
  tier?: string;            // tier id (e.g. 'gourmand')
  rank?: number;            // optional leaderboard rank (server-computed; unused locally)
  discoveredFruits?: string[]; // collectible slugs the account has WANT-IT'd
  badges?: string[];        // unlocked badge ids
  streak?: number;          // current consecutive-day streak (server-truth)
  persona?: string;         // last persona id
  state?: string;           // demand-footprint: Indian state
  pincode?: string;         // demand-footprint: 6-digit PIN
}

// The device-side progression we send up on login so nothing earned as a guest is lost (mirrors the
// guest-cart carry-over invariant). Read straight off the localStorage libs at merge time.
export interface DeviceTasteProgress {
  xp: number;
  plays: number;
  discoveredFruits: string[];
  bestStreak: number;
  currentStreak: number;
  lastPlayDay: number;      // localEpochDay of the last run (-1 = never)
  badges: string[];
  persona?: string;
  state?: string;
  pincode?: string;
}

// A wishlisted product — client-side only (localStorage). Stores just enough to render the tab.
export interface WishlistItem {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
}

// Cash-on-Delivery pilot: where the order goes. Collected at checkout and required before placing.
// pincode/city/state were added for the serviceability pilot — pincode is the 6-digit key, city/state
// auto-fill from it (lib/pincode) but stay editable, so all three are required at submit.
export interface DeliveryDetails {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  pincode: string;
  city: string;
  state: string;
}

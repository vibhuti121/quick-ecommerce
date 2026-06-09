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

// Cash-on-Delivery pilot: where the order goes. Collected at checkout and required before placing.
export interface DeliveryDetails {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
}

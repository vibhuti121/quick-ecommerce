// Mirror of order-service's OrderResponse (only the fields the admin console reads/displays).
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';
export type DeliveryStatus = 'AWAITING_DELIVERY' | 'DELIVERED' | 'CANCELLED';

export interface AdminOrderItem {
  productId: number;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface AdminOrder {
  orderId: string;
  userId: string;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  failureReason: string | null;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryStatus: DeliveryStatus;
  items: AdminOrderItem[];
  createdAt: string;
  updatedAt: string;
}

// --- Catalog (mirror of catalog-service ProductResponse / ProductRequest) ---
export type ProductType =
  | 'PHYSICAL'
  | 'DIGITAL'
  | 'SERVICE'
  | 'SUBSCRIPTION'
  | 'RENTAL';

export const PRODUCT_TYPES: ProductType[] = [
  'PHYSICAL',
  'DIGITAL',
  'SERVICE',
  'SUBSCRIPTION',
  'RENTAL',
];

export interface ProductVariant {
  sku: string;
  name: string;
  priceDelta: number;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  productType: ProductType;
  category: string | null;
  basePrice: number;
  currency: string;
  imageUrl: string | null;
  attributes: Record<string, unknown> | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  variants: ProductVariant[];
}

// What the admin form sends to POST/PUT /api/catalog/admin/products.
export interface ProductWriteRequest {
  sku: string;
  name: string;
  description: string | null;
  productType: ProductType;
  category: string | null;
  basePrice: number;
  currency: string;
  imageUrl: string | null;
  active: boolean;
}

// --- Inventory (mirror of inventory-service Dtos.StockListItem) ---
export interface StockItem {
  sku: string;
  availableQty: number;
  reservedQty: number;
  updatedAt: string;
}

// --- Notify / Demand (mirror of catalog-service NotifyResponse + DemandResponse) ---
// One launch-interest lead row. The fruit quiz fans a single submit out to one row per chosen fruit
// (topic = fruit slug) plus an umbrella `topic: 'quiz'` row, all sharing the same phone/contact.
export interface NotifyLead {
  id: number;
  topic: string;
  name: string | null;
  source: string | null;
  phone: string;
  email: string | null;
  pincode: string | null;
  city: string | null;
  state: string | null;
  createdAt: string;
}

// Demand per topic (a fruit slug, or an umbrella key like 'quiz'/'honey'). `people` is distinct phones.
export interface TopicDemand {
  topic: string;
  signups: number;
  people: number;
}

// Signups per state/UT (rows with no resolved state are omitted server-side).
export interface StateDemand {
  state: string;
  signups: number;
}

// GET /api/catalog/admin/notify/demand — the founder's aggregated waitlist view.
export interface DemandResponse {
  totalRows: number;
  distinctPeople: number;
  byFruit: TopicDemand[];
  byState: StateDemand[];
  recent: NotifyLead[];
}

// Spring Page envelope (GET /api/catalog/products?size=N).
export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

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

// Spring Page envelope (GET /api/catalog/products?size=N).
export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

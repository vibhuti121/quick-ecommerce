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

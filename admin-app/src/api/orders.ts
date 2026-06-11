import { api } from '@/lib/axios';
import type { AdminOrder, DeliveryStatus, OrderStatus } from '@/types';

// Orders are served by nginx's existing /admin/orders proxy → order-service (off the gateway; nginx
// injects X-User-Role: ADMIN). Same-origin, so the same axios client works.
export interface OrderFilter {
  status?: OrderStatus;
  deliveryStatus?: DeliveryStatus;
}

export async function getOrders(filter: OrderFilter = {}): Promise<AdminOrder[]> {
  const { data } = await api.get<AdminOrder[]>('/admin/orders', {
    params: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.deliveryStatus ? { deliveryStatus: filter.deliveryStatus } : {}),
    },
  });
  return data;
}

export async function markDelivered(orderId: string): Promise<AdminOrder> {
  const { data } = await api.post<AdminOrder>(
    `/admin/orders/${encodeURIComponent(orderId)}/mark-delivered`,
  );
  return data;
}

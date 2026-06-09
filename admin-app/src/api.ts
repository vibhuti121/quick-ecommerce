import type { AdminOrder, DeliveryStatus, OrderStatus } from './types';

// All calls are same-origin relative paths. nginx (this app's own server) reverse-proxies /admin/orders
// to order-service on the docker network and injects the X-User-Role: ADMIN header — the browser only
// supplies the basic-auth credential nginx already prompted for, so there are no secrets in this code.

async function http<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface OrderFilter {
  status?: OrderStatus;
  deliveryStatus?: DeliveryStatus;
}

export async function getOrders(filter: OrderFilter = {}): Promise<AdminOrder[]> {
  const params = new URLSearchParams();
  if (filter.status) params.set('status', filter.status);
  if (filter.deliveryStatus) params.set('deliveryStatus', filter.deliveryStatus);
  const qs = params.toString();
  return http<AdminOrder[]>(`/admin/orders${qs ? `?${qs}` : ''}`);
}

export async function markDelivered(orderId: string): Promise<AdminOrder> {
  return http<AdminOrder>(`/admin/orders/${encodeURIComponent(orderId)}/mark-delivered`, {
    method: 'POST',
  });
}

export function formatPrice(value: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(value);
}

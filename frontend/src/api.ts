import type { Cart, Order, Product } from './types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function getProducts(): Promise<Product[]> {
  return request<Product[]>('/api/products');
}

export function getCart(): Promise<Cart> {
  return request<Cart>('/api/cart');
}

export function addToCart(productId: number, quantity: number): Promise<Cart> {
  return request<Cart>('/api/cart', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity }),
  });
}

export function removeFromCart(productId: number): Promise<Cart> {
  return request<Cart>(`/api/cart/${productId}`, { method: 'DELETE' });
}

export function placeOrder(): Promise<Order> {
  return request<Order>('/api/orders', { method: 'POST' });
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

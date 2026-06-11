import { api } from '@/lib/axios';
import type { Product, ProductWriteRequest } from '@/types';

// Admin list: the ADMIN-gated endpoint returns EVERY product (active and inactive), sorted
// active-first, as a bare array (not a Spring Page). The public /products browse hides inactive
// products, so the console must use this to see and re-enable disabled ones.
export async function listProductsAdmin(): Promise<Product[]> {
  const { data } = await api.get<Product[]>('/api/catalog/admin/products');
  return data;
}

// Bulk (and single-row) enable/disable: flip `active` for the given product ids in one call.
export async function setProductsActive(
  ids: number[],
  active: boolean,
): Promise<Product[]> {
  const { data } = await api.patch<Product[]>('/api/catalog/admin/products/active', {
    ids,
    active,
  });
  return data;
}

// Writes hit the ADMIN-gated paths — the gateway enforces role=ADMIN; the bearer is attached by the
// axios interceptor. This round manages base product fields only; variant editing is deferred, so we
// send `variants: []` (the form never surfaces variants).
export async function createProduct(body: ProductWriteRequest): Promise<Product> {
  const { data } = await api.post<Product>('/api/catalog/admin/products', {
    ...body,
    variants: [],
  });
  return data;
}

export async function updateProduct(
  id: number,
  body: ProductWriteRequest,
): Promise<Product> {
  const { data } = await api.put<Product>(`/api/catalog/admin/products/${id}`, {
    ...body,
    variants: [],
  });
  return data;
}

export async function deleteProduct(id: number): Promise<void> {
  await api.delete(`/api/catalog/admin/products/${id}`);
}

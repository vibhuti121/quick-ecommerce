import { api } from '@/lib/axios';
import type { Page, Product, ProductWriteRequest } from '@/types';

// The list is the PUBLIC browse endpoint (not an admin path) so it loads without 401; default page
// size is 20, so request a big page to show the full catalog in one table (known size=200 gotcha).
export async function listProducts(size = 200): Promise<Product[]> {
  const { data } = await api.get<Page<Product>>('/api/catalog/products', {
    params: { size },
  });
  return data.content;
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

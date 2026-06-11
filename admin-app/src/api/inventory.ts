import { api } from '@/lib/axios';
import type { StockItem } from '@/types';

// Admin-gated (gateway forces role=ADMIN). Lists every SKU's available/reserved stock for the
// inventory visibility page.
export async function listStock(): Promise<StockItem[]> {
  const { data } = await api.get<StockItem[]>('/api/inventory/admin/stock');
  return data;
}

// Additive restock only (+N) — there is no absolute "set to N" by design. Creates the stock row
// if the SKU has none yet. Caller refetches the list, so the (updatedAt-less) response is ignored.
export async function addStock(sku: string, quantity: number): Promise<void> {
  await api.post('/api/inventory/admin/stock', { sku, quantity });
}

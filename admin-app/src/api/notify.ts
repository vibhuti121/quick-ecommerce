import { api } from '@/lib/axios';
import type { DemandResponse } from '@/types';

// Admin-gated (the gateway forces role=ADMIN on /api/catalog/admin/**). The aggregated launch-interest
// view for the founder's Demand dashboard: headcount, per-topic (fruit) demand, per-state, recent leads.
// All counts are computed in-DB (GROUP BY) so the endpoint stays cheap as signups grow.
export async function getDemand(): Promise<DemandResponse> {
  const { data } = await api.get<DemandResponse>('/api/catalog/admin/notify/demand');
  return data;
}

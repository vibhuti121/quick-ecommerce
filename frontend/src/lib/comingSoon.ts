// "Coming soon" gating + a browser-local notify-me list — no backend.
//
// Litchi-honey is the brand's hero product but is NOT launched yet (gated on lab-testing /
// compliance, per the MaLLADE go-live plan). So honey must render in the catalog WITH its image
// but never be purchasable — clicking it opens a teaser popup instead of the buy flow.
//
// The only reliable client-side signal is the product CATEGORY (the frontend Product type drops
// productType/active — see api.ts toProduct). Centralizing the predicate here keeps the grid,
// search results, and recommendation clicks all agreeing on what's "coming soon".

import type { Product } from '../types';

export function isComingSoon(product: Pick<Product, 'category'>): boolean {
  return product.category?.toLowerCase() === 'honey';
}

// The real MaLLADE honey jar shot, bundled under public/updates/ (served at /updates/honey.jpg).
// Used for BOTH the carousel honey slide (lib/updates.ts) and the honey "Coming Soon" cards
// (ProductCard) so the two never drift. Honey's catalog imageUrl is a placeholder until launch.
export const HONEY_IMAGE = '/updates/honey.jpg';

// ---- notify-me list (localStorage only) -----------------------------------------------------
// Mirrors lib/wishlist.ts: pure, synchronous, defensive read, never throws. The captured emails
// live only in this browser under localStorage['qe.notify'] — there is no /api/notify yet, so
// this is a best-effort "we heard you" until the launch mailing list exists. Lost on clear-site-data.

const NOTIFY_KEY = 'qe.notify';

export interface NotifyEntry {
  productId: number;
  email: string;
}

export function getNotifyList(): NotifyEntry[] {
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is NotifyEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as NotifyEntry).productId === 'number' &&
        typeof (e as NotifyEntry).email === 'string',
    );
  } catch {
    return [];
  }
}

// Record interest. Dedupes on (productId, email) so re-submitting is idempotent. Returns the new list.
export function saveNotify(productId: number, email: string): NotifyEntry[] {
  const normalized = email.trim().toLowerCase();
  const current = getNotifyList();
  if (current.some((e) => e.productId === productId && e.email === normalized)) {
    return current;
  }
  const next = [{ productId, email: normalized }, ...current];
  try {
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(next));
  } catch {
    /* quota / disabled storage — submission still "succeeds" for this session */
  }
  return next;
}

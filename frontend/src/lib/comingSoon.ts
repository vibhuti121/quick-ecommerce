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

// ---- phone validation (Indian 10-digit mobile) ----------------------------------------------
// Phone is the compulsory contact for the launch list (email is optional). Strip everything but
// digits, drop a leading +91 / 91 country code or a 0 trunk prefix, then require a 10-digit number
// starting 6–9. Shared by the modal (to validate before submit) and saveNotify (to normalize what's
// stored) so the two never disagree on what counts as valid.
export function normalizeMobile(raw: string): string {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export function isValidIndianMobile(raw: string): boolean {
  return /^[6-9]\d{9}$/.test(normalizeMobile(raw));
}

// ---- notify-me list (localStorage only) -----------------------------------------------------
// Mirrors lib/wishlist.ts: pure, synchronous, defensive read, never throws. The captured contacts
// live only in this browser under localStorage['qe.notify'] — there is no /api/notify yet, so this
// is a best-effort "we heard you" until the launch list exists. Lost on clear-site-data.

const NOTIFY_KEY = 'qe.notify';

// Interest is keyed on a TOPIC string, not a productId — so the carousel banners (litchi/gi/delivery,
// which aren't catalog products) and the honey product cards can all feed one unified list. Honey
// signups land under the fixed topic 'honey' from both the card popup and the honey banner.
export interface NotifyEntry {
  topic: string; // stable subject id: 'honey' | 'litchi' | 'gi' | 'delivery' (see lib/updates NotifyTopic)
  phone: string; // normalized 10-digit Indian mobile — the required contact
  email?: string; // optional secondary contact
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
        typeof (e as NotifyEntry).topic === 'string' &&
        typeof (e as NotifyEntry).phone === 'string' &&
        ((e as NotifyEntry).email === undefined || typeof (e as NotifyEntry).email === 'string'),
    );
  } catch {
    return [];
  }
}

// Record interest. Phone is required (normalized to 10 digits); email is optional. Dedupes on
// (topic, phone) so re-submitting the same number for the same subject is idempotent. Returns the new
// list. (Older productId-keyed entries from a returning browser fail the topic guard above and are
// dropped — acceptable; this is best-effort browser-local interest, not a system of record.)
export function saveNotify(topic: string, phone: string, email?: string): NotifyEntry[] {
  const normalizedPhone = normalizeMobile(phone);
  const normalizedEmail = email?.trim().toLowerCase() || undefined;
  const current = getNotifyList();
  if (current.some((e) => e.topic === topic && e.phone === normalizedPhone)) {
    return current;
  }
  const entry: NotifyEntry = { topic, phone: normalizedPhone };
  if (normalizedEmail) entry.email = normalizedEmail;
  const next = [entry, ...current];
  try {
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(next));
  } catch {
    /* quota / disabled storage — submission still "succeeds" for this session */
  }
  return next;
}

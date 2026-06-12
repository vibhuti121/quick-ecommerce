// Last-viewed product id, persisted in localStorage — seeds the home "Recommended for you" row so a
// returning shopper is greeted with picks related to what they last opened (over the PUBLIC
// recommendations endpoint, no backend change). Pure, synchronous, defensive; mirrors the house style
// of lib/comingSoon.ts (never throws — storage being unavailable just means the row won't seed).
const KEY = 'qe.lastViewed';

export function getLastViewedId(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function setLastViewedId(id: number): void {
  try {
    if (Number.isFinite(id) && id > 0) localStorage.setItem(KEY, String(id));
  } catch {
    /* quota exceeded / storage disabled — non-fatal */
  }
}

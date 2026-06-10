// Client-side wishlist — localStorage only, no backend.
//
// This is deliberately a browser-local feature (My Profile → My Wishlist). There is no wishlist
// service, so the list lives entirely under localStorage['qe.wishlist'] and is scoped to this
// browser. It does NOT sync across devices and is lost if the user clears site data. A future
// `/api/wishlist` is the upgrade path; until then every helper here is pure + synchronous and
// returns the new list so the caller (App) can hold it in React state.

import type { WishlistItem } from '../types';

const WISHLIST_KEY = 'qe.wishlist';

// Read + parse defensively: a malformed/absent value yields an empty list rather than throwing,
// so a corrupted entry can never break the storefront. We also filter to well-formed items.
export function getWishlist(): WishlistItem[] {
  try {
    const raw = localStorage.getItem(WISHLIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is WishlistItem =>
        !!i && typeof i === 'object' && typeof (i as WishlistItem).id === 'number',
    );
  } catch {
    return [];
  }
}

function save(items: WishlistItem[]): WishlistItem[] {
  try {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(items));
  } catch {
    /* quota / disabled storage — the in-memory list still works for this session */
  }
  return items;
}

export function isWished(id: number): boolean {
  return getWishlist().some((i) => i.id === id);
}

// Toggle membership: add when absent, remove when present. Returns the new list either way.
export function toggleWishlist(item: WishlistItem): WishlistItem[] {
  const current = getWishlist();
  return current.some((i) => i.id === item.id)
    ? save(current.filter((i) => i.id !== item.id))
    : save([item, ...current]);
}

export function removeWishlist(id: number): WishlistItem[] {
  return save(getWishlist().filter((i) => i.id !== id));
}

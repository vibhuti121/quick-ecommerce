// Client-side collection taxonomy + filter/sort for the shop sidebar (Iteration 9). Pure UI
// logic over the already-loaded catalog — NOT a data contract (that's src/types.ts). No API/
// backend touch. Collections that have no inventory yet are real, intentionally-empty entries
// (rendered as "Coming soon") — never faked with invented products.
import type { Product } from '../types';
import { isComingSoon } from './comingSoon';

export type SortKey = 'featured' | 'price-asc' | 'price-desc' | 'newest';
export type PriceKey = 'any' | 'lt500' | '500to1000' | 'gt1000';

export interface Filters {
  collection: string; // '' = all; else a COLLECTIONS key
  gi: boolean;
  lab: boolean;
  inStock: boolean;
  comingSoon: boolean;
  price: PriceKey;
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  collection: '',
  gi: false,
  lab: false,
  inStock: false,
  comingSoon: false,
  price: 'any',
  sort: 'featured',
};

const cat = (p: Product): string => (p.category ?? '').toLowerCase();

// The brand only sells honey & fruit; everything else in the catalog is generic demo data
// that we hide from the storefront (client-side; the backend still has it).
export function isBrandProduct(p: Product): boolean {
  const c = cat(p);
  return c === 'honey' || c === 'fruit';
}

export function isGiCertified(p: Product): boolean {
  return p.provenance?.gi?.status === 'authorized';
}

export function isLabTested(p: Product): boolean {
  return p.provenance?.labCert?.status?.toLowerCase() === 'passed';
}

// Forward-looking collection taxonomy. Real ones map to current data; the not-yet-stocked ones
// (Exotic Fruits, Fruit Juices, Gift Boxes) match nothing → they show "Coming soon" until a
// backend catalog seed adds those SKUs.
export interface CollectionDef {
  key: string;
  label: string;
  match: (p: Product) => boolean;
}

export const COLLECTIONS: CollectionDef[] = [
  { key: 'fresh-fruits', label: 'Fresh Fruits', match: (p) => cat(p) === 'fruit' },
  { key: 'seasonal-fruits', label: 'Seasonal Fruits', match: (p) => cat(p) === 'fruit' },
  { key: 'exotic-fruits', label: 'Exotic Fruits', match: () => false },
  { key: 'juices', label: 'Fruit Juices', match: () => false },
  { key: 'honey', label: 'Honey', match: (p) => cat(p) === 'honey' },
  { key: 'gift-boxes', label: 'Gift Boxes', match: () => false },
];

export function collectionCount(products: Product[], key: string): number {
  const def = COLLECTIONS.find((c) => c.key === key);
  return def ? products.filter(def.match).length : 0;
}

export const PRICE_OPTIONS: { value: PriceKey; label: string }[] = [
  { value: 'any', label: 'Any price' },
  { value: 'lt500', label: '₹0 – ₹500' },
  { value: '500to1000', label: '₹500 – ₹1000' },
  { value: 'gt1000', label: '₹1000+' },
];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
];

function inPrice(price: number, key: PriceKey): boolean {
  switch (key) {
    case 'lt500':
      return price < 500;
    case '500to1000':
      return price >= 500 && price <= 1000;
    case 'gt1000':
      return price > 1000;
    default:
      return true;
  }
}

// Count of non-default facets (drives the mobile "Filters ⓷" badge); sort is excluded.
export function countActiveFilters(f: Filters): number {
  let n = 0;
  if (f.collection) n += 1;
  if (f.gi) n += 1;
  if (f.lab) n += 1;
  if (f.inStock) n += 1;
  if (f.comingSoon) n += 1;
  if (f.price !== 'any') n += 1;
  return n;
}

export function filterAndSort(products: Product[], f: Filters): Product[] {
  const def = f.collection ? COLLECTIONS.find((c) => c.key === f.collection) : undefined;
  const filtered = products.filter((p) => {
    if (def && !def.match(p)) return false;
    if (f.gi && !isGiCertified(p)) return false;
    if (f.lab && !isLabTested(p)) return false;
    // Availability: both off OR both on → no constraint; otherwise the chosen one wins.
    if (f.inStock !== f.comingSoon) {
      const soon = isComingSoon(p);
      if (f.inStock && soon) return false;
      if (f.comingSoon && !soon) return false;
    }
    if (!inPrice(p.price, f.price)) return false;
    return true;
  });

  if (f.sort === 'featured') return filtered; // keep catalog order
  const sorted = [...filtered];
  switch (f.sort) {
    case 'price-asc':
      sorted.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      sorted.sort((a, b) => b.price - a.price);
      break;
    case 'newest':
      sorted.sort((a, b) => b.id - a.id);
      break;
  }
  return sorted;
}

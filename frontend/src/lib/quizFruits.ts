// "Find your MaLLADE match" — quiz fruit-set derivation (Phase 0 waitlist + browse, no money).
//
// The quiz options are DERIVED from the live catalogue (getProducts() → /api/catalog/products),
// NOT hardcoded — so when a new fruit SKU is seeded the quiz picks it up for free. The catalogue's
// `category` field is coarse (real seeds are `fruit` for Shahi Litchi + the two mangoes, `honey` for
// Coorg/Nilgiri), so we derive a per-fruit SLUG (litchi / mango / honey / …) from the product
// name/SKU. Slugs are the groupable key the notify backend fans out on (one notify_signups row per
// fruit slug), so they MUST be stable + lowercase [a-z0-9-].
//
// Honey stays flagged isComingSoon (via lib/comingSoon) so the quiz can surface it as a DEMAND
// SIGNAL only — fe-build routes a honey pick to the honey notify list, NEVER a cart add. The quiz
// touches neither cart nor checkout; both invariants (honey-not-buyable §4, checkout-gate §4b) are
// untouched by this path.

import type { Product } from '../types';
import { isComingSoon, HONEY_IMAGE } from './comingSoon';

export interface QuizFruit {
  slug: string; // groupable notify topic key, e.g. 'litchi' | 'mango' | 'honey'
  label: string; // human label for the quiz card, e.g. 'Litchi'
  category: string; // the product's coarse category, e.g. 'fruit' | 'honey'
  imageUrl: string; // honey forces HONEY_IMAGE; others use the product image
  isComingSoon: boolean; // true ⇒ honey ⇒ notify-only (never buyable)
}

// Known fruit/honey families, matched against the product name + SKU (case-insensitive). Order is
// the display priority when several products collapse onto one slug. The `match` terms are generous
// so seed-name drift (e.g. "Shahi Litchi Muzaffarpur", "Ratnagiri Alphonso") still resolves. Honey
// is included here too so a honey product reliably maps to slug 'honey' (it ALSO matches isComingSoon
// by category, which is the authoritative coming-soon signal — see deriveQuizFruits).
interface SlugRule {
  slug: string;
  label: string;
  match: string[]; // lowercase substrings tried against `${name} ${sku}`
}
const SLUG_RULES: SlugRule[] = [
  { slug: 'litchi', label: 'Litchi', match: ['litchi', 'lichi', 'lychee'] },
  { slug: 'mango', label: 'Mango', match: ['mango', 'alphonso', 'banaganapalle', 'banganapalli'] },
  { slug: 'honey', label: 'Honey', match: ['honey'] },
];

// SAFE FALLBACK: if the catalogue fetch yields nothing usable (cold start, outage, empty seed), the
// quiz still renders with the brand's three families. Honey carries isComingSoon so the not-buyable
// routing holds even on the fallback path.
export const FALLBACK_QUIZ_FRUITS: QuizFruit[] = [
  { slug: 'litchi', label: 'Litchi', category: 'fruit', imageUrl: '', isComingSoon: false },
  { slug: 'mango', label: 'Mango', category: 'fruit', imageUrl: '', isComingSoon: false },
  { slug: 'honey', label: 'Honey', category: 'honey', imageUrl: HONEY_IMAGE, isComingSoon: true },
];

// Derive the slug for a single product from its name/SKU. Returns undefined when nothing matches
// (e.g. a non-fruit SKU we don't want in the quiz) so the caller can skip it.
function slugForProduct(p: Pick<Product, 'name' | 'sku' | 'category'>): SlugRule | undefined {
  const hay = `${p.name ?? ''} ${p.sku ?? ''}`.toLowerCase();
  // Honey is authoritative by category — if it's coming-soon honey, force the honey slug regardless
  // of name wording, so a honey product never leaks in as a buyable fruit.
  if (isComingSoon(p)) return SLUG_RULES.find((r) => r.slug === 'honey');
  return SLUG_RULES.find((r) => r.match.some((m) => hay.includes(m)));
}

// Map the live products array → a deduped, stable-ordered list of quiz fruit options. Pure: no
// fetch, no side effects, never throws. Pass the result of getProducts(). When it yields nothing,
// the caller should fall back to FALLBACK_QUIZ_FRUITS (see deriveQuizFruitsOrFallback).
export function deriveQuizFruits(products: Product[]): QuizFruit[] {
  const bySlug = new Map<string, QuizFruit>();
  for (const p of products ?? []) {
    const rule = slugForProduct(p);
    if (!rule) continue;
    if (bySlug.has(rule.slug)) continue; // first product per slug wins the image/label
    const honey = isComingSoon(p);
    bySlug.set(rule.slug, {
      slug: rule.slug,
      label: rule.label,
      category: p.category ?? (honey ? 'honey' : 'fruit'),
      // Honey must ALWAYS show the real jar shot (its catalog imageUrl is a placeholder, §4).
      imageUrl: honey ? HONEY_IMAGE : p.imageUrl ?? '',
      isComingSoon: honey,
    });
  }
  // Stable display order: SLUG_RULES order (litchi, mango, honey, …), only the slugs we actually saw.
  return SLUG_RULES.map((r) => bySlug.get(r.slug)).filter((f): f is QuizFruit => !!f);
}

// Convenience: derive from the catalogue, but guarantee a non-empty option set for the quiz UI.
export function deriveQuizFruitsOrFallback(products: Product[]): QuizFruit[] {
  const derived = deriveQuizFruits(products);
  return derived.length ? derived : FALLBACK_QUIZ_FRUITS;
}

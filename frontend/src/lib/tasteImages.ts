// "Taste Match" V6 — 4-LENS RUNTIME IMAGE SOURCING (PROTOTYPE-ONLY).
//
// Goal (spec B): every fruit pulls FRESH, ALWAYS-DIFFERENT imagery across FOUR LENSES —
//   (1) THE FRUIT itself, (2) its FARM/orchard, (3) its REGION/city, (4) related NATURE/landscape —
// so a replay never shows the identical card twice.
//
// ── KEY-OPTIONAL IS A HARD REQUIREMENT ────────────────────────────────────────────────────────────
// With NO Pexels key + NO network the game MUST still render real imagery out of the box. So:
//   • The GUARANTEED layer is the per-fruit fallback in tasteMatch.ts (`fruit.imageUrl`) PLUS the curated
//     Wikimedia Commons fallback set below (FALLBACK_LENSES) — verified, hotlink-stable upload.wikimedia.org
//     URLs that need no API call.
//   • The Pexels API is OPTIONAL ENRICHMENT behind `import.meta.env.VITE_PEXELS_KEY`. Undefined key ⇒ we
//     never call Pexels; we serve the curated fallback. Present key ⇒ we enrich with live, varied photos.
//   • A SECONDARY no-key enrichment is the Wikimedia Commons live search API (CORS-open via origin=*) — it
//     needs no key, so even keyless players get *some* variety beyond the static curated set when online.
//
// Document the env var: copy `.env.example` → `.env.local` and set `VITE_PEXELS_KEY=...` to enable live
// Pexels enrichment. Leaving it unset is fully supported (curated + Commons-live fallback).
//
// Caching: an in-session Map<query,results> avoids re-hitting an API for the same lens query within a play
// session (cleared on reload — these are ephemeral prototype results, not persisted).

import type { DuelFruit } from './tasteMatch';

export type Lens = 'fruit' | 'farm' | 'region' | 'nature';
export const LENSES: Lens[] = ['fruit', 'farm', 'region', 'nature'];

export interface SourcedImage {
  url: string;
  lens: Lens;
  /** 'fallback' = curated/static (no network), 'commons' = live Commons search, 'pexels' = live Pexels. */
  source: 'fallback' | 'commons' | 'pexels';
  /** best-effort attribution string for the curated/commons sets (Pexels handled per its API terms). */
  credit?: string;
}

// ── CONFIG / KEY DETECTION ──────────────────────────────────────────────────────────────────────────
// import.meta.env.VITE_PEXELS_KEY is statically replaced by Vite at build; undefined when unset. We read
// it defensively so a missing key NEVER throws — it just disables the Pexels path.
const PEXELS_KEY: string | undefined = (import.meta.env.VITE_PEXELS_KEY as string | undefined) || undefined;
export const hasPexelsKey = (): boolean => typeof PEXELS_KEY === 'string' && PEXELS_KEY.length > 0;

const WM = 'https://upload.wikimedia.org/wikipedia/commons';

// ── PER-FRUIT LENS SEARCH TERMS (for the LIVE paths) ──────────────────────────────────────────────────
// From the asset-manifest Part B. The fruit lens is specific; farm/region/nature are evocative + safe.
// Used to build Pexels + Commons queries. (Keys = slugs from tasteMatch FRUITS + pantry.)
const LENS_QUERIES: Record<string, Record<Lens, string>> = {
  'alphonso-mango': { fruit: 'alphonso mango', farm: 'mango orchard india', region: 'konkan coast maharashtra', nature: 'laterite coast monsoon green' },
  'shahi-litchi': { fruit: 'litchi lychee fruit', farm: 'litchi orchard', region: 'bihar india village', nature: 'monsoon green orchard india' },
  'gir-kesar-mango': { fruit: 'kesar mango', farm: 'mango farm gujarat', region: 'girnar gujarat hills', nature: 'dry deciduous forest india' },
  'mahabaleshwar-strawberry': { fruit: 'strawberry basket', farm: 'strawberry farm hills', region: 'mahabaleshwar hill station', nature: 'misty western ghats' },
  'solapur-pomegranate': { fruit: 'pomegranate arils', farm: 'pomegranate farm', region: 'solapur maharashtra', nature: 'dry arid farmland india' },
  'purandar-fig': { fruit: 'fig fruit cut', farm: 'fig orchard', region: 'pune maharashtra countryside', nature: 'red soil farmland india' },
  'beed-custard-apple': { fruit: 'custard apple sitaphal', farm: 'custard apple tree', region: 'beed maharashtra', nature: 'rocky hills scrub india' },
  'allahabad-surkha-guava': { fruit: 'pink guava cut', farm: 'guava orchard', region: 'prayagraj sangam', nature: 'ganga river india' },
  'nagpur-orange': { fruit: 'orange citrus fruit', farm: 'orange orchard', region: 'nagpur city india', nature: 'vidarbha plains india' },
  'dahanu-gholvad-chikoo': { fruit: 'chikoo sapodilla fruit', farm: 'chikoo orchard', region: 'dahanu coast maharashtra', nature: 'arabian sea coast india' },
  'bhagalpuri-zardalu-mango': { fruit: 'mango golden', farm: 'mango grove bihar', region: 'bhagalpur ganga', nature: 'ganga plains bihar' },
  'coorg-orange': { fruit: 'mandarin orange', farm: 'coffee plantation coorg', region: 'coorg kodagu hills', nature: 'western ghats coffee estate' },
  'mangosteen': { fruit: 'mangosteen fruit cut', farm: 'mangosteen tree kerala', region: 'kerala backwaters', nature: 'tropical rainforest kerala' },
  'dragon-fruit': { fruit: 'dragon fruit pitaya cut', farm: 'dragon fruit farm cactus', region: 'gujarat farmland', nature: 'cactus plantation sunset' },
  honey: { fruit: 'honey jar golden', farm: 'beehive apiary', region: 'wildflower meadow india', nature: 'flowering field bees' },
  ghee: { fruit: 'ghee clarified butter jar', farm: 'indian cow farm', region: 'rural india village', nature: 'golden fields india' },
};

// ── CURATED WIKIMEDIA FALLBACK SET (no API call — verified hotlink-stable originals) ──────────────────
// These ship with zero config + zero network-to-API and are the floor of the "always renders" guarantee.
// The 'fruit' lens reuses the fruit's own card image (the card already shows it); farm/region/nature pull
// from a small, auditable set of broadly-applicable THEMES keyed below — so we verify ~8 landscape URLs
// instead of 14×3, and the LIVE paths refine each lens with something more specific when reachable.
//
// THEMES — a handful of verified, broadly-applicable Commons landscape/farm images. Each fruit's
// farm/region/nature lens picks a theme; this keeps the verified-URL surface small + auditable.
// All 8 URLs below were RESOLVED via the Commons API and HEAD-verified 200 (not hand-guessed) — see the
// V6 verification in the fe-lead session. thumb/ paths are the canonical scaled renders.
const THEME: Record<string, { url: string; credit: string }> = {
  orchard: { url: `${WM}/thumb/2/21/Eastern_Cattle_Egrets_in_a_Mango_orchard%2C_India.jpg/1280px-Eastern_Cattle_Egrets_in_a_Mango_orchard%2C_India.jpg`, credit: 'Wikimedia Commons' },
  hills: { url: `${WM}/thumb/c/c8/Western-Ghats-Matheran.jpg/1280px-Western-Ghats-Matheran.jpg`, credit: 'Wikimedia Commons' },
  river: { url: `${WM}/thumb/a/a3/Ganga_at_Kaudiayala.jpg/1280px-Ganga_at_Kaudiayala.jpg`, credit: 'Wikimedia Commons' },
  coast: { url: `${WM}/thumb/9/9a/Deogad_Beach_in_Sindhudurg_district_%2CKonkan_region_Maharashtra%2C_India.JPG/1280px-Deogad_Beach_in_Sindhudurg_district_%2CKonkan_region_Maharashtra%2C_India.JPG`, credit: 'Wikimedia Commons' },
  dry: { url: `${WM}/thumb/e/e4/Dry_deciduous_forest_in_Sri_Lankamalleswara_Wildlife_Sanctuary_JEG8325.jpg/1280px-Dry_deciduous_forest_in_Sri_Lankamalleswara_Wildlife_Sanctuary_JEG8325.jpg`, credit: 'Wikimedia Commons' },
  meadow: { url: `${WM}/thumb/8/84/Wildflower_Meadow_-_geograph.org.uk_-_81827.jpg/1280px-Wildflower_Meadow_-_geograph.org.uk_-_81827.jpg`, credit: 'Wikimedia Commons' },
  coffee: { url: `${WM}/thumb/d/da/Ripe_Seeds_Coffee_Robusta_Coorg_Karnataka_India_Feb24_D72_25688.jpg/1280px-Ripe_Seeds_Coffee_Robusta_Coorg_Karnataka_India_Feb24_D72_25688.jpg`, credit: 'Wikimedia Commons' },
  apiary: { url: `${WM}/thumb/a/a3/Hives_of_bees.JPG/1280px-Hives_of_bees.JPG`, credit: 'Wikimedia Commons' },
};

// fruit slug → { farm theme, region theme, nature theme }
const FRUIT_THEMES: Record<string, { farm: keyof typeof THEME; region: keyof typeof THEME; nature: keyof typeof THEME }> = {
  'alphonso-mango': { farm: 'orchard', region: 'coast', nature: 'coast' },
  'shahi-litchi': { farm: 'orchard', region: 'river', nature: 'orchard' },
  'gir-kesar-mango': { farm: 'orchard', region: 'dry', nature: 'dry' },
  'mahabaleshwar-strawberry': { farm: 'hills', region: 'hills', nature: 'hills' },
  'solapur-pomegranate': { farm: 'dry', region: 'dry', nature: 'dry' },
  'purandar-fig': { farm: 'orchard', region: 'hills', nature: 'dry' },
  'beed-custard-apple': { farm: 'orchard', region: 'dry', nature: 'dry' },
  'allahabad-surkha-guava': { farm: 'orchard', region: 'river', nature: 'river' },
  'nagpur-orange': { farm: 'orchard', region: 'dry', nature: 'dry' },
  'dahanu-gholvad-chikoo': { farm: 'orchard', region: 'coast', nature: 'coast' },
  'bhagalpuri-zardalu-mango': { farm: 'orchard', region: 'river', nature: 'river' },
  'coorg-orange': { farm: 'coffee', region: 'hills', nature: 'coffee' },
  'mangosteen': { farm: 'orchard', region: 'hills', nature: 'hills' },
  'dragon-fruit': { farm: 'dry', region: 'dry', nature: 'dry' },
  honey: { farm: 'apiary', region: 'meadow', nature: 'meadow' },
  ghee: { farm: 'orchard', region: 'meadow', nature: 'meadow' },
};

// ── IN-SESSION CACHE ──────────────────────────────────────────────────────────────────────────────
// Map<cacheKey, SourcedImage[]> — avoids re-hitting an API for the same lens query within a play session.
const sessionCache = new Map<string, SourcedImage[]>();
function cacheKey(slug: string, lens: Lens, source: string): string {
  return `${source}:${slug}:${lens}`;
}

// Build the GUARANTEED fallback image for a (fruit, lens) — pure, no network. The 'fruit' lens returns the
// fruit's own card image; farm/region/nature return the mapped theme. This is what renders with no key +
// no network, so the game ALWAYS has 4 real lenses to drift through.
export function fallbackLens(fruit: DuelFruit, lens: Lens): SourcedImage {
  if (lens === 'fruit') {
    return { url: fruit.imageUrl, lens, source: 'fallback', credit: 'Wikimedia Commons' };
  }
  const themes = FRUIT_THEMES[fruit.slug];
  const themeKey = themes ? themes[lens] : 'orchard';
  const t = THEME[themeKey] ?? THEME.orchard;
  return { url: t.url, lens, source: 'fallback', credit: t.credit };
}

// The full guaranteed 4-lens set for a fruit (no network). Always returns 4 images.
export function fallbackLensSet(fruit: DuelFruit): SourcedImage[] {
  return LENSES.map((l) => fallbackLens(fruit, l));
}

// ── LIVE ENRICHMENT (best-effort, never required) ─────────────────────────────────────────────────────
// fetchLens resolves to a varied image for (fruit, lens), preferring (when available + reachable):
//   1. Pexels  (only if a key is configured)
//   2. Commons live search (keyless, CORS-open)
//   3. the guaranteed fallback (always)
// It NEVER throws — any error path degrades to the fallback. A `seed` (e.g. epochDay or session seed)
// rotates which result is chosen so replays differ.
export async function fetchLens(fruit: DuelFruit, lens: Lens, seed = 0): Promise<SourcedImage> {
  const q = LENS_QUERIES[fruit.slug]?.[lens];
  if (q) {
    if (hasPexelsKey()) {
      const px = await tryPexels(fruit.slug, lens, q, seed).catch(() => null);
      if (px) return px;
    }
    const cm = await tryCommons(fruit.slug, lens, q, seed).catch(() => null);
    if (cm) return cm;
  }
  return fallbackLens(fruit, lens);
}

// Resolve all 4 lenses for a fruit (parallel), each degrading independently. Always 4 images back.
export async function fetchLensSet(fruit: DuelFruit, seed = 0): Promise<SourcedImage[]> {
  return Promise.all(LENSES.map((l) => fetchLens(fruit, l, seed).catch(() => fallbackLens(fruit, l))));
}

// ── PEXELS (optional) ───────────────────────────────────────────────────────────────────────────────
async function tryPexels(slug: string, lens: Lens, query: string, seed: number): Promise<SourcedImage | null> {
  if (!hasPexelsKey()) return null;
  const ck = cacheKey(slug, lens, 'pexels');
  let results = sessionCache.get(ck);
  if (!results) {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=portrait`;
    const res = await fetch(url, { headers: { Authorization: PEXELS_KEY as string } });
    if (!res.ok) return null;
    const data = (await res.json()) as { photos?: Array<{ src?: { large2x?: string; large?: string }; photographer?: string }> };
    results = (data.photos ?? [])
      .map((p) => ({
        url: p.src?.large2x || p.src?.large || '',
        lens,
        source: 'pexels' as const,
        credit: p.photographer ? `Photo by ${p.photographer} (Pexels)` : 'Pexels',
      }))
      .filter((r) => r.url);
    if (results.length) sessionCache.set(ck, results);
  }
  if (!results || results.length === 0) return null;
  return results[Math.abs(seed) % results.length];
}

// ── WIKIMEDIA COMMONS LIVE SEARCH (keyless, CORS-open via origin=*) ─────────────────────────────────────
async function tryCommons(slug: string, lens: Lens, query: string, seed: number): Promise<SourcedImage | null> {
  const ck = cacheKey(slug, lens, 'commons');
  let results = sessionCache.get(ck);
  if (!results) {
    const api =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(query + ' filetype:bitmap')}` +
      `&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=900&format=json&origin=*`;
    const res = await fetch(api);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      query?: { pages?: Record<string, { imageinfo?: Array<{ url?: string; thumburl?: string; extmetadata?: { Artist?: { value?: string } } }> }> };
    };
    const pages = data.query?.pages ? Object.values(data.query.pages) : [];
    results = pages
      .map((p) => {
        const ii = p.imageinfo?.[0];
        const url = ii?.thumburl || ii?.url || '';
        const artist = ii?.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, '').trim();
        return { url, lens, source: 'commons' as const, credit: artist ? `${artist} (Commons)` : 'Wikimedia Commons' };
      })
      .filter((r) => r.url && /\.(jpe?g|png)$/i.test(r.url.split('?')[0]));
    if (results.length) sessionCache.set(ck, results);
  }
  if (!results || results.length === 0) return null;
  return results[Math.abs(seed) % results.length];
}

// Test/debug seam: clear the in-session cache (e.g. between capture runs).
export function _clearImageCache(): void {
  sessionCache.clear();
}

// "Taste Match" V6 — #F FRUIT PASSPORT + #G ACHIEVEMENT BADGES (PROTOTYPE-ONLY, localStorage).
//
// #F — the FRUIT PASSPORT: across plays, every fruit the player has WANT-IT'd is "discovered". The passport
//      tracks discovered SLUGS → which ORIGIN REGIONS have lit up on the India map. "Collect all 14 / unlock
//      every region" is the core long-game replay reason. This module owns the DATA + PERSISTENCE; the India-
//      map VISUAL is the design-gated surface 2.
// #G — ACHIEVEMENT BADGES: small, tasteful unlockables computed from the discovered set + streak. Examples:
//      "Mango Master" (all 3 GI mangoes), region/streak badges, "Rare Taste" (both non-GI exotics).
//
// HONESTY / PROTOTYPE NOTE: localStorage-only, per-device, easily reset, NOT server-truth (same caveat as
// streak/XP). Zero network I/O; never touches cart/checkout/notify. Only the 14 BUYABLE collectible fruits
// participate — honey/ghee are demand-only and are NOT collectible regions (COLLECTIBLE_SLUGS excludes them).

import { COLLECTIBLE_SLUGS, REGION_OF, ALL_REGIONS } from './tasteMatch';

const STORAGE_KEY = 'mallade.tastematch.passport.v6';

export interface PassportState {
  /** Slugs the player has WANT-IT'd at least once (only collectible fruits are stored). */
  discovered: string[];
}

const EMPTY: PassportState = { discovered: [] };

function read(): PassportState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { discovered: [] };
    const p = JSON.parse(raw) as Partial<PassportState>;
    const arr = Array.isArray(p.discovered) ? p.discovered.filter((s): s is string => typeof s === 'string') : [];
    // keep only known collectibles (defensive against stale/foreign slugs)
    const allow = new Set(COLLECTIBLE_SLUGS);
    return { discovered: arr.filter((s) => allow.has(s)) };
  } catch {
    return { discovered: [] };
  }
}

function write(s: PassportState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked — degrade silently. */
  }
}

export interface PassportProgress {
  /** Discovered collectible slugs. */
  discovered: string[];
  /** Discovered fruit count out of the 14 collectibles. */
  fruitsCount: number;
  fruitsTotal: number;
  /** Distinct regions lit up. */
  regions: string[];
  regionsCount: number;
  regionsTotal: number;
  /** True once all 14 collectible fruits are discovered. */
  complete: boolean;
}

function progressFrom(discovered: string[]): PassportProgress {
  const set = new Set(discovered);
  const regions = Array.from(new Set(discovered.map((s) => REGION_OF[s]).filter(Boolean)));
  return {
    discovered,
    fruitsCount: set.size,
    fruitsTotal: COLLECTIBLE_SLUGS.length,
    regions,
    regionsCount: regions.length,
    regionsTotal: ALL_REGIONS.length,
    complete: set.size >= COLLECTIBLE_SLUGS.length,
  };
}

// Peek the passport WITHOUT mutating — for the intro / passport surface.
export function peekPassport(): PassportProgress {
  return progressFrom(read().discovered);
}

// Is a given region lit up? (for the map surface to colour each state).
export function regionDiscovered(region: string): boolean {
  return read().discovered.some((s) => REGION_OF[s] === region);
}

export interface PassportUpdate extends PassportProgress {
  /** Slugs discovered for the FIRST time in THIS run (for the "new region unlocked!" celebration). */
  newlyDiscovered: string[];
  /** Regions lit up for the first time in THIS run. */
  newRegions: string[];
}

// Record a completed run's WANT-IT slugs into the passport. Only collectible (buyable) slugs count; honey/
// ghee are ignored. Returns the new progress + what was newly unlocked this run.
export function recordDiscoveries(wantSlugs: string[]): PassportUpdate {
  const prev = read();
  const prevSet = new Set(prev.discovered);
  const prevRegions = new Set(prev.discovered.map((s) => REGION_OF[s]).filter(Boolean));
  const allow = new Set(COLLECTIBLE_SLUGS);

  const newlyDiscovered: string[] = [];
  for (const slug of wantSlugs) {
    if (allow.has(slug) && !prevSet.has(slug)) {
      prevSet.add(slug);
      newlyDiscovered.push(slug);
    }
  }
  const discovered = Array.from(prevSet);
  write({ discovered });

  const prog = progressFrom(discovered);
  const newRegions = prog.regions.filter((r) => !prevRegions.has(r));
  return { ...prog, newlyDiscovered, newRegions };
}

// ── #G — ACHIEVEMENT BADGES ─────────────────────────────────────────────────────────────────────────
export interface Badge {
  id: string;
  name: string;
  emoji: string;       // fallback glyph (the gated visual may replace)
  blurb: string;       // one-line "how you earned it"
  unlocked: boolean;
}

// GI mango slugs (the 3 GI-tagged mangoes — Alphonso, Kesar, Zardalu). "Mango Master" = all three.
const GI_MANGOES = ['alphonso-mango', 'gir-kesar-mango', 'bhagalpuri-zardalu-mango'];
// the two non-GI exotic wildcards — "Rare Taste" = discovered both.
const RARE_EXOTICS = ['mangosteen', 'dragon-fruit'];

// Compute the full badge set against the passport + an optional streak count (for streak badges). Pure;
// the UI renders unlocked ones prominently + locked ones as "keep playing" hints. `bestStreak` is read by
// the caller from tasteStreak (kept as an arg so this module stays storage-self-contained for the passport).
export function computeBadges(opts: { discovered?: string[]; bestStreak?: number } = {}): Badge[] {
  const discovered = new Set(opts.discovered ?? read().discovered);
  const best = opts.bestStreak ?? 0;
  const prog = progressFrom(Array.from(discovered));

  const has = (slug: string) => discovered.has(slug);
  const hasAll = (slugs: string[]) => slugs.every(has);

  return [
    {
      id: 'mango-master',
      name: 'Mango Master',
      emoji: '🥭',
      blurb: 'Discover all three GI mangoes — Alphonso, Kesar & Zardalu.',
      unlocked: hasAll(GI_MANGOES),
    },
    {
      id: 'rare-taste',
      name: 'Rare Taste',
      emoji: '👑',
      blurb: 'Discover both the rare exotics — mangosteen & dragon fruit.',
      unlocked: hasAll(RARE_EXOTICS),
    },
    {
      id: 'globe-trotter',
      name: 'Globe-Trotter',
      emoji: '🗺️',
      blurb: 'Light up every origin region on the map.',
      unlocked: prog.regionsCount >= prog.regionsTotal && prog.regionsTotal > 0,
    },
    {
      id: 'full-passport',
      name: 'Full Passport',
      emoji: '📖',
      blurb: 'Discover all 14 fruits in the collection.',
      unlocked: prog.complete,
    },
    {
      id: 'streak-3',
      name: 'On a Roll',
      emoji: '🔥',
      blurb: 'Play 3 days in a row.',
      unlocked: best >= 3,
    },
    {
      id: 'streak-7',
      name: 'Week of Taste',
      emoji: '⭐',
      blurb: 'Play 7 days in a row.',
      unlocked: best >= 7,
    },
  ];
}

// TEST/DEV ONLY — reset the passport.
export function resetPassport(): void {
  write({ ...EMPTY });
}

// TEST/DEV ONLY — force a discovered set (capture uses this to render a partially/fully lit map).
export function _setDiscovered(slugs: string[]): void {
  const allow = new Set(COLLECTIBLE_SLUGS);
  write({ discovered: slugs.filter((s) => allow.has(s)) });
}

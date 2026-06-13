// "Taste Match" V6 — #E "FEEL ACHIEVEMENT": the slow-evolving RANK + XP engine (PROTOTYPE-ONLY, localStorage).
//
// The founder wants the player to "feel achievement" via a cartoon mascot that EVOLVES SLOWLY across many
// plays — not a sugar-rush that maxes out in one sitting. This module owns the XP MATH + PERSISTENCE +
// TIER logic (all non-gated). The mascot VISUAL itself is a design-choice-gated surface (surface 1) — this
// module just tells the UI which tier the player is at + how far to the next.
//
// HONESTY / PROTOTYPE NOTE: localStorage-only — per-device, easily reset, NOT server-truth (same caveat as
// tasteStreak). A real cross-device rank needs a backend account table (future). Zero network I/O; never
// touches cart/checkout/notify.
//
// ── THE XP CURVE (designed for ~3-4 months to the top tier) ────────────────────────────────────────
// Per run a player earns ~10-25 XP (see xpForRun). Tier thresholds 0/120/360/900/2000 mean: at a typical
// ~15-25 XP/day the climb to "Taste Master" takes roughly 3-4 months of near-daily play — a real long-game
// reason to come back, not an instant unlock. The steps grow ~1.5-2.2× so each tier feels earned.

const STORAGE_KEY = 'mallade.tastematch.xp.v6';

export interface Tier {
  id: string;
  name: string;   // the rank title shown next to the mascot
  emoji: string;  // fallback glyph (the gated mascot art replaces/augments this)
  at: number;     // cumulative XP at which this tier unlocks
}

// 5 tiers, cartoonish + tasteful, climbing slowly. Emojis are FALLBACK glyphs only — the evolving-character
// VISUAL is the design-gated surface 1; the UI maps tier.id → the chosen artwork.
export const TIERS: Tier[] = [
  { id: 'sprout', name: 'Sprout', emoji: '🌱', at: 0 },
  { id: 'foodie', name: 'Foodie', emoji: '🍴', at: 120 },
  { id: 'gourmand', name: 'Gourmand', emoji: '🧑‍🍳', at: 360 },
  { id: 'connoisseur', name: 'Connoisseur', emoji: '🎩', at: 900 },
  { id: 'taste-master', name: 'Taste Master', emoji: '👑', at: 2000 },
];

export interface XpState {
  /** Cumulative lifetime XP on this device. */
  xp: number;
  /** Total runs ever finished (mirrors streak.totalPlays but kept local so this module is self-contained). */
  plays: number;
}

const EMPTY: XpState = { xp: 0, plays: 0 };

function read(): XpState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const p = JSON.parse(raw) as Partial<XpState>;
    return {
      xp: typeof p.xp === 'number' && p.xp >= 0 ? p.xp : 0,
      plays: typeof p.plays === 'number' && p.plays >= 0 ? p.plays : 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

function write(s: XpState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked — degrade silently (prototype just won't persist). */
  }
}

// ── XP PER RUN ──────────────────────────────────────────────────────────────────────────────────────
// xpForRun(wants, streakDay, firstPlayToday) = 10 (base) + min(5, wants) (engagement, capped so spamming
// WANT-IT can't farm XP) + 5 (if this run is on a live streak day) + 5 (if it's the first play today).
// Range 10-25. The streakDay / firstPlayToday flags come from the streak module's update.
export function xpForRun(wants: number, streakDay: boolean, firstPlayToday: boolean): number {
  return 10 + Math.min(5, Math.max(0, wants)) + (streakDay ? 5 : 0) + (firstPlayToday ? 5 : 0);
}

// The tier a given cumulative XP sits in (the highest tier whose threshold is ≤ xp).
export function tierFor(xp: number): Tier {
  let t = TIERS[0];
  for (const tier of TIERS) if (xp >= tier.at) t = tier;
  return t;
}

export interface TierProgress {
  tier: Tier;
  /** The next tier, or null if already at the top. */
  next: Tier | null;
  /** XP still needed to reach `next` (0 if maxed). */
  xpToNext: number;
  /** 0..1 progress through the CURRENT tier band (1 if maxed). */
  fraction: number;
  /** Total cumulative XP. */
  xp: number;
}

// Full progress read for the rank bar ("X XP from <next tier>" + a fill fraction within the current band).
export function tierProgress(xp: number): TierProgress {
  const tier = tierFor(xp);
  const idx = TIERS.findIndex((t) => t.id === tier.id);
  const next = idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
  if (!next) return { tier, next: null, xpToNext: 0, fraction: 1, xp };
  const band = next.at - tier.at;
  const into = xp - tier.at;
  return {
    tier,
    next,
    xpToNext: Math.max(0, next.at - xp),
    fraction: band > 0 ? Math.max(0, Math.min(1, into / band)) : 1,
    xp,
  };
}

// Peek the stored XP/tier WITHOUT mutating — used to greet a returning player on the intro.
export function peekXp(): XpState {
  return read();
}
export function peekTier(): TierProgress {
  return tierProgress(read().xp);
}

export interface XpAward extends TierProgress {
  /** XP granted by THIS run. */
  gained: number;
  /** True if this run crossed into a NEW tier (for the "you evolved!" celebration). */
  tieredUp: boolean;
  /** The previous tier (before this run) — set when tieredUp so the UI can animate the transition. */
  fromTier: Tier;
}

// Award XP for a COMPLETED run (call once when the reveal lands, alongside streak.recordRun). Returns the
// new progress + whether the player evolved a tier this run.
export function awardRun(args: {
  wants: number;
  streakDay: boolean;
  firstPlayToday: boolean;
  now?: Date;
}): XpAward {
  const prev = read();
  const fromTier = tierFor(prev.xp);
  const gained = xpForRun(args.wants, args.streakDay, args.firstPlayToday);
  const next: XpState = { xp: prev.xp + gained, plays: prev.plays + 1 };
  write(next);
  const prog = tierProgress(next.xp);
  return {
    ...prog,
    gained,
    fromTier,
    tieredUp: prog.tier.id !== fromTier.id,
  };
}

// TEST/DEV ONLY — reset XP (used by capture to render multiple tiers, and any prototype reset affordance).
export function resetXp(): void {
  write({ ...EMPTY });
}

// TEST/DEV ONLY — force a specific cumulative XP (capture uses this to screenshot ≥2 tiers).
export function _setXp(xp: number): void {
  const prev = read();
  write({ xp: Math.max(0, xp), plays: prev.plays });
}

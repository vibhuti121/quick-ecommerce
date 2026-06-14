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
// ── THE XP CURVE — DISCOVERY-SPINE (Phase 4) ─────────────────────────────────────────────────────────
// North-star unification: XP is no longer a flat "engagement" number — its BIG, dominant lever is
// DISCOVERY. A *first-time* WANT on a never-seen fruit earns a large chunk (DISCOVERY_PER_FRUIT); re-wanting
// a fruit you already own earns only a small, CAPPED trickle (REPEAT_CAP). This makes the rank track the
// fruit-passport (the same discovery signal that feeds demand) instead of a parallel curve, and it makes XP
// UN-FARMABLE: you cannot spam WANT-IT to climb, because the only big earn is finite (14 collectibles, one
// discovery each). Tier thresholds stay 0/120/360/900/2000 — the harness (scoreSim §9) confirms a daily
// player still takes ~3-4 months to "Taste Master": discovery front-loads the first ~week (the dopamine of
// filling the passport), then the small daily base + streak + first-play bonuses carry the long tail.
//
// Component weights (FICO-style, disclosed): base 8 · discovery 16/new-fruit · repeat 1×min(4) · streak +4
// · first-play-of-day +6. Early "collecting" runs spike to ~70-90 XP; steady post-collection runs ~15-22 XP.

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

// ── XP PER RUN — DISCOVERY-SPINE (disclosed component weights) ─────────────────────────────────────
// xpForRun = BASE + DISCOVERY_PER_FRUIT·newDiscoveries + min(REPEAT_CAP, repeatWants) + streak + firstPlay.
//   • newDiscoveries = collectible fruits WANT-IT'd for the FIRST time this run (from the passport) — the
//     BIG earn, and inherently un-farmable (only 14 collectibles exist, one discovery each, ever).
//   • repeatWants    = wants that were NOT new discoveries (already-owned fruits + demand-only honey/ghee) —
//     a small CAPPED trickle so spamming WANT-IT cannot farm rank.
//   • streakDay / firstPlayToday — modest daily-return nudges (flags from the streak module).
// Early "collecting" runs spike (e.g. 3 new fruits + first-play + streak = 8+48+0+6+4 = 66); steady
// post-collection runs settle ~15-22. Harness (scoreSim §9) confirms ~3-4 months to the top tier.
export const XP_BASE = 8;
export const DISCOVERY_PER_FRUIT = 16;
export const REPEAT_CAP = 4;
export const STREAK_BONUS = 4;
export const FIRST_PLAY_BONUS = 6;
export function xpForRun(
  newDiscoveries: number,
  repeatWants: number,
  streakDay: boolean,
  firstPlayToday: boolean,
): number {
  return (
    XP_BASE +
    DISCOVERY_PER_FRUIT * Math.max(0, newDiscoveries) +
    Math.min(REPEAT_CAP, Math.max(0, repeatWants)) +
    (streakDay ? STREAK_BONUS : 0) +
    (firstPlayToday ? FIRST_PLAY_BONUS : 0)
  );
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
  /** Collectible fruits WANT-IT'd for the first time this run (passport.newlyDiscovered.length). */
  newDiscoveries: number;
  /** Wants that were NOT new discoveries (already-owned fruits + demand-only honey/ghee). */
  repeatWants: number;
  streakDay: boolean;
  firstPlayToday: boolean;
  now?: Date;
}): XpAward {
  const prev = read();
  const fromTier = tierFor(prev.xp);
  const gained = xpForRun(args.newDiscoveries, args.repeatWants, args.streakDay, args.firstPlayToday);
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

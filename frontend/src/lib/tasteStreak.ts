// "Taste Match" — #4 HABIT HOOK (V5, PROTOTYPE-ONLY, localStorage).
//
// V4 had NO reason to come back (founder: "there is no intention in game which makes it a habit-making
// game"). V5 adds ONE clean habit mechanic: a DAILY-DROP streak. A player who finishes a run on
// consecutive calendar days grows a streak ("3-day taste streak — come back tomorrow for a new drop").
//
// HONESTY / PROTOTYPE NOTE: this is localStorage-only — per-device, easily reset, NOT server-truth. A
// real streak (cross-device, tamper-resistant, the metric growth-lead could trust) needs a backend table
// keyed to an account (future V7). This module is the prototype stand-in to TEST THE FEEL of a come-back
// loop. It does ZERO network I/O and NEVER touches cart/checkout/notify.
//
// Day boundary = local calendar day (epochDay below is local-midnight based via Date). Consecutive =
// today is exactly one day after the last play. Same-day replays don't inflate the streak. A gap of ≥2
// days resets the streak to 1 (today counts).

const STORAGE_KEY = 'mallade.tastematch.streak.v5';

export interface StreakState {
  /** Current consecutive-day streak (≥1 once they've played today; 0 before any play). */
  count: number;
  /** Longest streak ever reached on this device. */
  best: number;
  /** epochDay of the last completed run (local). -1 = never played. */
  lastDay: number;
  /** Total runs ever finished on this device. */
  totalPlays: number;
}

const EMPTY: StreakState = { count: 0, best: 0, lastDay: -1, totalPlays: 0 };

// Local-calendar epoch day (NOT UTC) — so "tomorrow" lines up with the player's own midnight. Mirrors
// tasteMatch.epochDay's INTENT but uses local date parts so the streak boundary feels right to the user.
export function localEpochDay(d: Date = new Date()): number {
  // Days since the Unix epoch in LOCAL time: zero out the time, divide by ms/day.
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(local.getTime() / 86_400_000);
}

function read(): StreakState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<StreakState>;
    return {
      count: typeof parsed.count === 'number' ? parsed.count : 0,
      best: typeof parsed.best === 'number' ? parsed.best : 0,
      lastDay: typeof parsed.lastDay === 'number' ? parsed.lastDay : -1,
      totalPlays: typeof parsed.totalPlays === 'number' ? parsed.totalPlays : 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

function write(s: StreakState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked (private mode / quota) — degrade silently; the prototype just won't persist. */
  }
}

// Read the current streak WITHOUT mutating it. Used to greet a returning player on the intro screen
// ("You're on a 3-day streak"). Note: this returns the STORED count; if they last played 2+ days ago the
// streak is effectively broken but we don't rewrite until they actually finish a run (recordRun does that).
export function peekStreak(): StreakState {
  return read();
}

// Is the player's stored streak still "live" (they played today or yesterday)? Used to phrase the intro
// hook honestly — a stale streak (gap ≥2 days) reads as "start a new streak" rather than claiming an
// active one.
export function streakIsLive(now: Date = new Date()): boolean {
  const s = read();
  if (s.lastDay < 0) return false;
  const today = localEpochDay(now);
  return today - s.lastDay <= 1;
}

// Record a COMPLETED run (call once when the reveal lands). Returns the updated state + a flag telling
// the UI whether THIS run advanced the streak (so it can celebrate "streak +1!" only when it actually grew).
export interface StreakUpdate extends StreakState {
  /** True if this run advanced the streak to a new consecutive day (for the "+1" celebration). */
  advanced: boolean;
  /** True if this run was a same-day replay (streak unchanged). */
  sameDay: boolean;
  /** True if a gap broke the previous streak and this run started a fresh one. */
  reset: boolean;
}

export function recordRun(now: Date = new Date()): StreakUpdate {
  const prev = read();
  const today = localEpochDay(now);

  let count: number;
  let advanced = false;
  let sameDay = false;
  let reset = false;

  if (prev.lastDay < 0) {
    // First ever run.
    count = 1;
    advanced = true;
  } else if (prev.lastDay === today) {
    // Same-day replay — streak unchanged.
    count = prev.count;
    sameDay = true;
  } else if (today - prev.lastDay === 1) {
    // Consecutive day — streak grows.
    count = prev.count + 1;
    advanced = true;
  } else {
    // Gap of ≥2 days — streak broke; today starts a fresh one.
    count = 1;
    reset = true;
  }

  const next: StreakState = {
    count,
    best: Math.max(prev.best, count),
    lastDay: today,
    totalPlays: prev.totalPlays + 1,
  };
  write(next);
  return { ...next, advanced, sameDay, reset };
}

// TEST/DEV ONLY — clear the streak (used by the prototype "reset" affordance, if any, and by capture).
export function resetStreak(): void {
  write({ ...EMPTY });
}

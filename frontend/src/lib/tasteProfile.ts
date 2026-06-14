// "Taste Match" — the GO-LIVE CONVERSION + PERSISTENCE layer (V7).
//
// V1–V6 persisted ALL progression to localStorage, PER DEVICE (honest footnote: "saved on this device
// only"). V7 adds the conversion mechanic the founder approved: when a player EARNS something real (a new
// badge, a tier-up, a passport milestone), we surface a WHITE-HAT claim CTA — "you earned a real thing,
// log in to save it & keep your Taste Rank everywhere." On login we MERGE the device's guest progress into
// the account (the game's analogue of the guest-cart carry-over invariant — nothing earned is lost), then
// switch the progression source of truth to the server profile.
//
// This module owns the ORCHESTRATION only — it does NOT own the XP/passport/streak math (those stay in
// tasteXp.ts / tastePassport.ts / tasteStreak.ts). It reads a device SNAPSHOT off them, talks to the
// STUB-TOLERANT api.ts seam, and tells the UI whether we're logged in. Zero new persistence; the only
// new localStorage key is a once-per-session flag for the exit-intent nudge (so it never nags).
//
// HONESTY: until login, everything is still per-device. After login, the server is truth — but because the
// api seam is stub-tolerant (404s in local dev → null), a logged-in player whose sync silently fails STILL
// sees their local progress. The merge is additive; we never down-rank a player on a failed round-trip.

import { peekXp } from './tasteXp';
import { peekPassport, computeBadges } from './tastePassport';
import { peekStreak } from './tasteStreak';
import {
  getTasteProfile,
  mergeTasteProfile,
  loginWithGoogle as apiLoginWithGoogle,
  login as apiLogin,
  register as apiRegister,
} from '../api';
import type { DeviceTasteProgress, TasteProfile } from '../types';

// The guest token is minted under qe.guestToken and is prefixed `guest-` by auth-service; a logged-in
// JWT is NOT. We can't read the HttpOnly nothing here — the token is in localStorage — so we decode the
// same way api.ts does (lightly) but only need the cheap "is this a guest token" heuristic the app uses
// everywhere: a real login replaced the token. We expose a simple flag the UI re-reads after onAuthed().
const TOKEN_KEY = 'qe.guestToken';

// Once-per-session flag for the exit-intent nudge. sessionStorage so it resets on a new tab/session but
// never re-fires within one — the rubric hard-rule "fires at most ONCE per session."
const EXIT_NUDGE_KEY = 'mallade.tastematch.exitNudgeShown';

// ── LOGGED-IN HEURISTIC ──────────────────────────────────────────────────────────────────────────────
// A guest session has NO token yet OR a token whose `sub`/`userId` is a guest id. The app's own contract
// (api.ts getProfile) treats a successful /auth/me as "real account"; here, for the local prototype, we
// use the lightweight token-shape check the rest of the app relies on: a logged-in flow stored a fresh
// JWT via login/register/google, replacing any guest token. We decode the payload and check the role/sub.
interface MiniClaims {
  sub?: string;
  userId?: string;
  role?: string;
  exp?: number; // JWT expiry, epoch SECONDS — set by both generate() and generateGuest() server-side.
}
function decode(token: string): MiniClaims {
  try {
    const seg = token.split('.')[1];
    if (!seg) return {};
    const b64 = seg.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(json) as MiniClaims;
  } catch {
    return {};
  }
}

// True when a NON-guest account token is present. Guests (no token, or a guest-* identity / GUEST role)
// read false → the claim CTA shows. Logged-in players read true → no CTA, just "saved to your profile."
export function isLoggedIn(): boolean {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return false;
  const c = decode(token);
  const id = c.userId ?? c.sub ?? '';
  if (!id) return false;
  if (id.startsWith('guest-')) return false;
  if ((c.role ?? '').toUpperCase() === 'GUEST') return false;
  // An EXPIRED (or expiry-less) non-guest token is a dead session, not a logged-in one — treating it as
  // logged-in permanently suppresses the claim CTA and shows a dishonest "saved to your profile". The
  // server stamps `exp` on every JWT; honour it. (Pure check — api.ts evicts the dead token on the next 401.)
  if (typeof c.exp !== 'number' || Date.now() >= c.exp * 1000) return false;
  return true;
}

// ── DEVICE SNAPSHOT ──────────────────────────────────────────────────────────────────────────────────
// Gather the player's full per-device progression off the existing localStorage libs, in the shape the
// merge endpoint wants. Pure read (no mutation). persona/state/pincode are filled by the caller when known
// (they live in the run / capture form, not in a persistence lib).
export function deviceSnapshot(extra?: {
  persona?: string;
  state?: string;
  pincode?: string;
}): DeviceTasteProgress {
  const xp = peekXp();
  const passport = peekPassport();
  const streak = peekStreak();
  const badges = computeBadges({ discovered: passport.discovered, bestStreak: streak.best })
    .filter((b) => b.unlocked)
    .map((b) => b.id);
  return {
    xp: xp.xp,
    plays: xp.plays,
    discoveredFruits: passport.discovered,
    bestStreak: streak.best,
    currentStreak: streak.count,
    lastPlayDay: streak.lastDay,
    badges,
    persona: extra?.persona,
    state: extra?.state,
    pincode: extra?.pincode,
  };
}

// ── CLAIMABLE — what (if anything) the player just earned that's worth a white-hat claim CTA ───────────
// The CTA must be HONEST: it names the real thing earned. We only surface it for a NEW badge, a tier-up,
// or a fresh passport region/milestone — never a generic "log in" with nothing earned behind it.
export interface Claimable {
  // The single, most impressive thing to lead the CTA with (a badge beats a tier-up beats a region).
  headline: string;     // e.g. "🥭 Mango Master" or "Foodie rank" or "a new region"
  kind: 'badge' | 'tier' | 'region';
}

// Decide the claim headline from the run's recorded results. Returns null when nothing claim-worthy was
// earned this run (then NO CTA shows — white-hat: you only claim a real achievement).
export function claimableFrom(args: {
  newBadges: { emoji: string; name: string }[];
  tieredUp: boolean;
  tierName?: string;
  newRegions: string[];
}): Claimable | null {
  if (args.newBadges.length > 0) {
    const b = args.newBadges[0];
    return { headline: `${b.emoji} ${b.name}`, kind: 'badge' };
  }
  if (args.tieredUp && args.tierName) {
    return { headline: `${args.tierName} rank`, kind: 'tier' };
  }
  if (args.newRegions.length > 0) {
    const r = args.newRegions[0];
    return { headline: `${r} on your fruit passport`, kind: 'region' };
  }
  return null;
}

// ── LOGIN FLOWS (each: do the auth, then MERGE the device progress, then return the server profile) ────
// All three reuse api.ts's existing auth functions (which store the real JWT), then fire the merge so the
// guest progress carries over. The merge is stub-tolerant (null when the seam is absent) — login still
// succeeds and the local progression remains visible. Returns the merged TasteProfile or null.

async function afterAuthMerge(extra?: {
  persona?: string;
  state?: string;
  pincode?: string;
}): Promise<TasteProfile | null> {
  return mergeTasteProfile(deviceSnapshot(extra));
}

export async function claimWithGoogle(
  credential: string,
  extra?: { persona?: string; state?: string; pincode?: string },
): Promise<TasteProfile | null> {
  await apiLoginWithGoogle(credential);
  return afterAuthMerge(extra);
}

export async function claimWithPassword(
  mode: 'login' | 'register',
  identifier: string,
  password: string,
  extra?: { persona?: string; state?: string; pincode?: string },
): Promise<TasteProfile | null> {
  if (mode === 'register') await apiRegister(identifier, password);
  else await apiLogin(identifier, password);
  return afterAuthMerge(extra);
}

// ── SERVER-TRUTH READ (post-login the UI prefers this over the local peeks) ────────────────────────────
// Best-effort fetch of the account profile; null → keep showing the localStorage progression. The UI
// calls this once after a successful claim to confirm "saved to your profile" and (when present) to switch
// the displayed rank/passport to server truth.
export async function fetchServerProfile(): Promise<TasteProfile | null> {
  if (!isLoggedIn()) return null;
  return getTasteProfile();
}

// ── EXIT-INTENT NUDGE GATE (rubric-capped: at most ONCE per session) ───────────────────────────────────
export function exitNudgeAlreadyShown(): boolean {
  try {
    return sessionStorage.getItem(EXIT_NUDGE_KEY) === '1';
  } catch {
    return false;
  }
}
export function markExitNudgeShown(): void {
  try {
    sessionStorage.setItem(EXIT_NUDGE_KEY, '1');
  } catch {
    /* storage blocked — degrade silently */
  }
}

// The Google client-id (build-time). Absent → the UI hides the Google button gracefully and shows only the
// email/phone+password fallback. Pending a founder action to provision the OAuth client-id.
export const GOOGLE_CLIENT_ID: string =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';
export const GOOGLE_ENABLED = GOOGLE_CLIENT_ID.length > 0;

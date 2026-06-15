import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { TasteRankMascot, FruitPassportMap } from './TasteMatch';
import { peekTier, tierProgress } from '../lib/tasteXp';
import { peekPassport, computeBadges, type Badge, type PassportProgress } from '../lib/tastePassport';
import { peekStreak } from '../lib/tasteStreak';
import { isLoggedIn } from '../lib/tasteProfile';
import { COLLECTIBLE_SLUGS, REGION_OF, ALL_REGIONS } from '../lib/tasteMatch';
import { getTasteProfile } from '../api';
import type { TasteProfile } from '../types';

// ============================================================================================
// GAMES HUB — "Taste Arcade" (DIRECTION A: reward panel on TOP, games grid BELOW).
//
// The home-surfacing endpoint for the Taste Match game (reached at ?games — see App.tsx). It is an
// OVERLAY rendered INSIDE the Storefront (not a separate app) so opening/closing it never drops the
// shopper's auth/cart/profile state. Two variants per the locked mockup:
//   • LOGGED-IN — a reward panel (Taste Rank mascot + Fruit Passport map + Badges grid) over the games
//     grid (Taste Match featured/live card + two "coming soon" cards).
//   • GUEST     — a dashed "play to earn your Taste Rank" placeholder over the SAME games grid.
//
// REUSE (fe-lead decision): the mascot + passport visuals are the SAME components TasteMatch renders —
// TasteRankMascot / FruitPassportMap, exported from TasteMatch.tsx — fed peekTier()/peekPassport() (or
// the logged-in server profile) as props. No new mascot/passport CSS; the existing scoped .taste-match
// tm-* block styles them (the hub root carries `.taste-match` so that scope applies).
//
// SERVER-TRUTH (V7): for a logged-in player we best-effort getTasteProfile() and PREFER its xp /
// discoveredFruits / streak over the localStorage peeks (the api seam is stub-tolerant → null in local
// dev, in which case we transparently keep the localStorage progression — nothing is lost).
//
// SECURITY / INVARIANTS: zero cart/checkout/notify/honey surfaces here — the hub only reads progression
// and routes to the game (onPlay) or sign-in (onSignIn). Honey-not-buyable + checkout-gate are untouched.
//
// REDUCED-MOTION (two-layer, §3): the entrance stagger is gated by useReducedMotion() (under reduce we
// render the panels statically, no transforms); the mascot bob + passport pin-pulse are gated INSIDE
// the reused components via the `reduce` prop we pass, AND by the global @media layer in index.css.
// ============================================================================================

interface GamesHubProps {
  // Back to the storefront home (pops the ?games overlay; never drops auth/cart).
  onBack: () => void;
  // Launch the Taste Match game (App routes this to ?taste-match — the existing local-only gate).
  onPlay: () => void;
  // Open the storefront sign-in modal (guest → save progress across devices).
  onSignIn: () => void;
  // Logged-in shopper's display name for the hub bar profile cluster (null/guest → "Log in" affordance).
  displayName?: string | null;
}

export default function GamesHub({ onBack, onPlay, onSignIn, displayName }: GamesHubProps) {
  const reduce = useReducedMotion();
  const loggedIn = useMemo(() => isLoggedIn(), []);

  // Server-truth profile (logged-in only). null = guest OR stub seam absent → use localStorage peeks.
  const [server, setServer] = useState<TasteProfile | null>(null);
  useEffect(() => {
    if (!loggedIn) return;
    let active = true;
    getTasteProfile()
      .then((p) => { if (active) setServer(p); })
      .catch(() => { if (active) setServer(null); });
    return () => { active = false; };
  }, [loggedIn]);

  // ── Progression read: prefer server xp/discovered/streak when present, else localStorage peeks. ──
  const tier = useMemo(() => {
    if (server && typeof server.xp === 'number') return tierProgress(server.xp);
    return peekTier();
  }, [server]);

  const passport = useMemo(() => {
    if (server && Array.isArray(server.discoveredFruits)) {
      // Re-run the passport math over the server's discovered set so regions/total/complete are correct.
      // peekPassport() reads storage; for the server case we lean on computeBadges/peekPassport shapes by
      // synthesizing through the local progress when server is absent. Simplest correct path: when server
      // gives us discovered slugs, derive the same PassportProgress via a tiny local helper.
      return deriveServerPassport(server.discoveredFruits);
    }
    return peekPassport();
  }, [server]);

  const badges: Badge[] = useMemo(() => {
    const bestStreak = server && typeof server.streak === 'number' ? server.streak : peekStreak().best;
    const discovered = server && Array.isArray(server.discoveredFruits)
      ? server.discoveredFruits
      : peekPassport().discovered;
    return computeBadges({ discovered, bestStreak });
  }, [server]);

  const unlockedCount = badges.filter((b) => b.unlocked).length;

  // Motion: a soft staggered rise on the panels (gated by reduce).
  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.12, delayChildren: reduce ? 0 : 0.04 } },
  };
  const rise: Variants = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 24 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } },
      };

  return (
    <div className="hub taste-match" role="region" aria-label="MaLLADE Games — Taste Arcade">
      <div className="hub-bar">
        <button className="hub-back" onClick={onBack} aria-label="Back to storefront">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to shop
        </button>
        <div className="hub-title">
          <span className="eyebrow">MaLLADE Games</span>Taste Arcade
        </div>
        <div className="hub-spacer" />
        {loggedIn ? (
          <div className="hub-prof">
            <span className="av" aria-hidden="true" /> Hi, <b>{displayName || 'there'}</b>
          </div>
        ) : (
          <button className="btn-ghost hub-login" onClick={onSignIn}>
            Log in
          </button>
        )}
      </div>

      <motion.div
        className="hub-body"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {loggedIn ? (
          <motion.div className="reward-panel" variants={rise}>
            <div className="reward-grid">
              <div>
                <p className="reward-col-title">Your Taste Rank</p>
                <TasteRankMascot tier={tier} reduce={!!reduce} />
              </div>
              <div>
                <p className="reward-col-title">Fruit Passport</p>
                <FruitPassportMap passport={passport} reduce={!!reduce} />
              </div>
              <div>
                <p className="reward-col-title">Badges · {unlockedCount} of {badges.length}</p>
                <BadgeGrid badges={badges} />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div className="reward-guest" variants={rise}>
            <div className="gm" aria-hidden="true">🌱</div>
            <h3>Play to earn your Taste Rank</h3>
            <p>
              Swipe the fruits you love, fill your India Fruit Passport and climb from Sprout to Taste
              Master. Log in to save your rank, badges &amp; passport across devices — or just start
              playing now.
            </p>
            <div className="nudge">
              <button className="btn-gold" onClick={onPlay}>Play Taste Match</button>
              <button className="btn-ghost" onClick={onSignIn}>Log in to save progress</button>
            </div>
          </motion.div>
        )}

        <motion.p className="hub-sec-label" variants={rise}>
          Games{' '}
          <small>
            {loggedIn
              ? 'Play to earn your Taste Rank · more dropping soon'
              : 'Free to play · no sign-up needed to start'}
          </small>
        </motion.p>

        <motion.div className="games-grid" variants={rise}>
          {/* FEATURED / LIVE — Taste Match */}
          <div className="game-card featured">
            <img className="game-card-photo" src="/taste-match-proto/mango2.jpg" alt="" />
            <div className="game-card-scrim" />
            <div className="game-card-body">
              <span className="game-tag">★ Featured · Live</span>
              <h3 className="game-name">Taste Match</h3>
              <p className="game-desc">
                Swipe the fruits you love → meet your taste persona &amp; earn a Taste Rank.
              </p>
              <button className="game-play" onClick={onPlay}>
                Play
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>

          {/* COMING SOON ×2 */}
          <div className="game-card soon" aria-disabled="true">
            <div className="game-card-body">
              <span className="game-soon-emoji" aria-hidden="true">🧠</span>
              <div className="game-soon-name">Fruit Memory</div>
              <div className="game-soon-desc">Match the GI pairs against the clock.</div>
              <span className="game-soon-badge">Coming soon</span>
            </div>
          </div>
          <div className="game-card soon" aria-disabled="true">
            <div className="game-card-body">
              <span className="game-soon-emoji" aria-hidden="true">📍</span>
              <div className="game-soon-name">Origin Quiz</div>
              <div className="game-soon-desc">Guess the GI region for each fruit.</div>
              <span className="game-soon-badge">Coming soon</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

// Locked-aware badge grid for the reward panel (the reveal in TasteMatch only shows unlocked badges;
// the hub shows the FULL set with locked ones dimmed as "keep playing" hints — the mockup idiom).
function BadgeGrid({ badges }: { badges: Badge[] }) {
  return (
    <div className="tm-badge-pop hub-badges">
      {badges.map((b) =>
        b.unlocked ? (
          <span key={b.id} className="tm-badge-chip" title={b.blurb}>
            {b.emoji} {b.name}
          </span>
        ) : (
          <span key={b.id} className="tm-badge-chip locked" title={b.blurb}>
            <span className="lk" aria-hidden="true">🔒</span> {b.name}
          </span>
        ),
      )}
    </div>
  );
}

// Derive a PassportProgress-shaped object from a server-provided discovered-slug list, reusing the same
// region/total math the local passport lib uses. Kept tiny + local so we don't add a new export to the
// passport lib for the rare server-truth path; the FruitPassportMap only reads { discovered, fruitsCount,
// fruitsTotal, regions, regionsCount, regionsTotal, complete } — exactly what peekPassport returns, so we
// mirror that shape here.
function deriveServerPassport(slugs: string[]): PassportProgress {
  const allow = new Set(COLLECTIBLE_SLUGS);
  const discovered = slugs.filter((s) => allow.has(s));
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

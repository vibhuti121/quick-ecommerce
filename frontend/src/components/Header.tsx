import { useEffect, useMemo, useState } from 'react';
import { peekTier, tierProgress, TIERS } from '../lib/tasteXp';
import { peekPassport } from '../lib/tastePassport';
import { isLoggedIn } from '../lib/tasteProfile';
import { getTasteProfile } from '../api';
import { COLLECTIBLE_SLUGS } from '../lib/tasteMatch';
import type { TasteProfile } from '../types';

interface HeaderProps {
  itemCount: number;
  onOpenCart: () => void;
  onOpenProfile: () => void;
  // Open the "Taste Arcade" Games Hub overlay — fired by the reward chip (B1).
  onOpenGames: () => void;
}

// Catalogue v2: search no longer lives in the header — it folds into the sticky discovery toolbar
// (CatalogControls) as an inline live filter, so the header stays brand + profile + cart. B1 adds the
// "reward chip": a compact Taste Rank pill that surfaces the player's progression in the header and is
// the always-present entry point to the Games Hub. Guest variant nudges "play to earn yours"; logged-in
// variant shows tier · level · XP-to-next + a `🍈 N/14` fruit-passport count.
export default function Header({ itemCount, onOpenCart, onOpenProfile, onOpenGames }: HeaderProps) {
  const loggedIn = useMemo(() => isLoggedIn(), []);

  // Server-truth profile (logged-in only). Stub-tolerant → null in local dev / for guests, in which case
  // the chip reads the localStorage peeks (same resilience as the rest of the taste surfaces).
  const [server, setServer] = useState<TasteProfile | null>(null);
  useEffect(() => {
    if (!loggedIn) return;
    let active = true;
    getTasteProfile()
      .then((p) => { if (active) setServer(p); })
      .catch(() => { if (active) setServer(null); });
    return () => { active = false; };
  }, [loggedIn]);

  // Progression for the chip — prefer server xp/discovered when present, else the local peeks.
  const tier = useMemo(
    () => (server && typeof server.xp === 'number' ? tierProgress(server.xp) : peekTier()),
    [server],
  );
  const fruitsCount = useMemo(() => {
    if (server && Array.isArray(server.discoveredFruits)) {
      const allow = new Set(COLLECTIBLE_SLUGS);
      return new Set(server.discoveredFruits.filter((s) => allow.has(s))).size;
    }
    return peekPassport().fruitsCount;
  }, [server]);
  const fruitsTotal = COLLECTIBLE_SLUGS.length;

  // A returning player has earned XP; a never-played guest shows the "play to earn yours" nudge variant.
  const hasProgress = tier.xp > 0;
  const lvl = TIERS.findIndex((t) => t.id === tier.tier.id) + 1;
  const showEarned = loggedIn || hasProgress;

  const chipLabel = showEarned
    ? `Taste Rank: ${tier.tier.name} level ${lvl}, ${fruitsCount} of ${fruitsTotal} fruits collected${
        tier.next ? `, ${tier.xpToNext} XP to ${tier.next.name}` : ''
      }`
    : 'Play Taste Match to earn your Taste Rank';

  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <span className="brand-mark">⚡</span>
          <span className="brand-name">QuickCart</span>
        </div>

        {/* B1 reward chip — always present; opens the Games Hub. Earned vs guest variant. */}
        <button
          type="button"
          className={`reward-chip${showEarned ? '' : ' guest'}`}
          onClick={onOpenGames}
          aria-label={chipLabel}
        >
          <span className="chip-mascot" aria-hidden="true">
            <span className="acc">{showEarned ? tier.tier.emoji : '🌱'}</span>
          </span>
          <span className="chip-text">
            {showEarned ? (
              <>
                <span className="chip-tier">
                  <b>{tier.tier.name}</b> · Lvl {lvl}
                </span>
                <span className="chip-sub">
                  {tier.next ? `${tier.xpToNext} XP to ${tier.next.name}` : 'Top tier reached'}
                </span>
              </>
            ) : (
              <>
                <span className="chip-tier">Taste Rank</span>
                <span className="chip-sub">Play to earn yours →</span>
              </>
            )}
          </span>
          {showEarned && (
            <span className="chip-fruit" aria-hidden="true">
              🍈 {fruitsCount}/{fruitsTotal}
            </span>
          )}
        </button>

        <button className="profile-button" onClick={onOpenProfile} aria-label="Open profile">
          <span className="profile-icon">👤</span>
          <span>Profile</span>
        </button>
        <button className="cart-button" onClick={onOpenCart} aria-label="Open cart">
          <span className="cart-icon">🛒</span>
          <span>Cart</span>
          {itemCount > 0 && <span className="cart-count">{itemCount}</span>}
        </button>
      </div>
    </header>
  );
}

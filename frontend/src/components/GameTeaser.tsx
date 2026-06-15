import { useEffect, useState } from 'react';
import { motion, useReducedMotion, type Variants } from 'motion/react';
import { peekTier } from '../lib/tasteXp';
import { isLoggedIn } from '../lib/tasteProfile';
import { TIERS } from '../lib/tasteXp';

// ============================================================================================
// HOME GAME TEASER — the light editorial block that surfaces the Taste Arcade on the home page
// (placed beside the HoneyTeaser). Copy-left / art-right split card. Primary CTA opens the Games Hub
// overlay (?games); a returning player who already has a rank sees a small "Your rank" stamp on the art
// so the teaser doubles as a personalised re-entry point.
//
// SECURITY / INVARIANTS: no cart/checkout/notify/honey here — it only routes (onOpenGames / onPlay).
// REDUCED-MOTION (§3): the entrance rise is gated by useReducedMotion(); no JS motion-value transforms,
// so the global @media layer + this gate fully cover it.
// ============================================================================================
interface GameTeaserProps {
  // Open the full Games Hub overlay.
  onOpenGames: () => void;
  // Jump straight into the game (used by the secondary affordance / accessibility).
  onPlay: () => void;
}

export default function GameTeaser({ onOpenGames }: GameTeaserProps) {
  const reduce = useReducedMotion();

  // Personalise the art stamp for a returning player with progress. Read once on mount (localStorage /
  // server-truth is read in the hub itself; here a cheap local peek is enough for the teaser stamp).
  const [rank, setRank] = useState<{ name: string; lvl: number } | null>(null);
  useEffect(() => {
    const t = peekTier();
    // Only show a stamp once the player has actually earned XP (otherwise the teaser reads as "new").
    if (t.xp > 0) {
      const lvl = TIERS.findIndex((x) => x.id === t.tier.id) + 1;
      setRank({ name: t.tier.name, lvl });
    }
  }, []);

  const loggedIn = isLoggedIn();

  const rise: Variants = reduce
    ? { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 24 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } },
      };

  return (
    <section className="home-game-section" aria-label="MaLLADE Games — Taste Match">
      <motion.div
        className="game-teaser"
        variants={rise}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
      >
        <div className="gt-copy">
          <div className="gt-eyebrow">New · MaLLADE Games</div>
          <h2 className="gt-title">
            Find your <em>taste twin</em> in 30 seconds
          </h2>
          <p className="gt-desc">
            Swipe the fruits you crave, unlock your Taste Rank and collect every GI-tagged region on your
            India Fruit Passport.
          </p>
          <div className="gt-row">
            <button className="gt-cta" onClick={onOpenGames}>
              {rank ? 'Open Taste Arcade' : 'Play Taste Match'}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
            <span className="gt-meta">
              <b>Free</b> · 30 sec · earn a Taste Rank
            </span>
          </div>
        </div>
        <div className="gt-art">
          <img src="/taste-match-proto/mango.jpg" alt="" loading="lazy" />
          <div className="gt-art-scrim" />
          {rank && loggedIn && (
            <div className="gt-stamp">
              <span className="sm" aria-hidden="true" />
              <span>
                <small>Your rank</small>
                <b>
                  {rank.name} · Lvl {rank.lvl}
                </b>
              </span>
            </div>
          )}
        </div>
      </motion.div>
    </section>
  );
}

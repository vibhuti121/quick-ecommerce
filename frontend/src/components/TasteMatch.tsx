import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  animate,
  type Variants,
  type MotionProps,
  type PanInfo,
} from 'motion/react';
import { toPng } from 'html-to-image';
import NotifyForm from './NotifyForm';
import {
  DUEL_COUNT,
  buildDeck,
  dailyDropFruit,
  introHero,
  composeRevealCopy,
  scorePersona,
  provenanceOf,
  fruitForSlug,
  alsoLoved,
  REGION_OF,
  type DuelFruit,
  type RevealCopy,
  type TastePersona,
} from '../lib/tasteMatch';
import {
  peekStreak,
  streakIsLive,
  recordRun,
  type StreakUpdate,
} from '../lib/tasteStreak';
import { awardRun, peekTier, type XpAward } from '../lib/tasteXp';
import {
  recordDiscoveries,
  peekPassport,
  computeBadges,
  type PassportUpdate,
  type Badge,
} from '../lib/tastePassport';
import { TIERS } from '../lib/tasteXp';
import {
  isLoggedIn,
  claimableFrom,
  claimWithGoogle,
  claimWithPassword,
  exitNudgeAlreadyShown,
  markExitNudgeShown,
  GOOGLE_CLIENT_ID,
  GOOGLE_ENABLED,
  type Claimable,
} from '../lib/tasteProfile';

// ============================================================================================
// "Taste Match" V6 — a clickable PROTOTYPE (frontend-only · LOCAL · NOT deployed · NOT committed).
//
// A Tinder × Snapchat swipe DECK of premium fruit cards: full-bleed photo, gold hairline editorial
// base (A "Dark Editorial Gloss") with B "Vivid Pop-Juicy" punch on the high-moments — bold rotated
// WANT IT! / NAH swipe stamps, an HONEST persona-match badge, and a Spotify-Wrapped-style reveal.
//
// V6 (founder-picked design directions — three NEW gated visual surfaces grafted onto the V5.1 base):
//   • SURFACE 1 — TASTE RANK = 1B "Drawn fruit-mascot": a CSS-drawn orange character (face + chef-hat +
//     leaf) that EVOLVES SLOWLY across plays — tier accessory / expression / aura change 🌱→👑 off the
//     localStorage XP curve (tasteXp.ts). Lives inside the reveal accordion's "Your taste rank" row.
//   • SURFACE 2 — FRUIT PASSPORT = 2A "Literal India silhouette + glowing region pins": a production
//     Natural-Earth India outline (viewBox 0 0 604 611, CC0) with 6 region pins — discovered (glow) /
//     region-complete (litchi ring) / locked (dim). "N of 14 fruits collected." (tastePassport.ts).
//   • SURFACE 3 — REVEAL = 3C "Hero summary + expandable accordion": a persona HERO card (insight FIRST,
//     identity not performance — Spotify-Wrapped) + collapsible rows (📍 picks by origin · 💛 also loved ·
//     🏅 taste rank · 🗺 fruit passport). Progressive disclosure; the climax lands before any detail.
//
// On run completion the reveal fires recordRun (streak) + awardRun (XP/tier) + recordDiscoveries
// (passport) EXACTLY ONCE and surfaces a tier-up + any newly-earned badges.
//
// Carried forward from V5.1: the honest cosine persona-match (#1), refined imagery (#2), per-session
// shuffled deck (#3), and the localStorage streak + daily drop (#4).
//
// V5 REFINEMENT (founder scored V4 5.65/10 — four concrete drags fixed; direction LOCKED, no new round):
//   #1 HONEST PERSONA-MATCH SCORE — V4's "rarer than 82% of swipers" was a FAKE per-persona constant.
//      V5 replaces it with the GENUINE computed result from scorePersona(): "You're <matchPct>% <persona>",
//      where matchPct is the cosine similarity of the player's swipe-vector to the closest archetype. No
//      fabricated population stat survives. The count-up animation is kept (MatchCountUp: 0 → matchPct).
//   #2 REFINED IMAGERY — the editorial grade on .tm-card-photo / .tm-sharecard-photo is tightened (CSS) for
//      a more art-directed, cohesive look. SWAP-TO-OWNED-PHOTO seam left intact in tasteMatch.ts.
//   #3 DECK VARIABILITY — buildDeck(seed) draws a per-session SHUFFLED deck from the larger pool (daily-drop
//      card leads). A fresh seed (Date.now()) is generated on every start() so replays surface new fruits.
//   #4 HABIT HOOK — a localStorage streak + daily fruit drop. The intro greets a returning player with
//      their live streak + today's drop; the reveal celebrates the run's streak result (recordRun fires
//      exactly once on entering the reveal). Per-device only — an honest footnote says so.
//
// Each right-swipe (WANT IT!) is a vote for that fruit's SLUG — the demand signal MaLLADE wants. This
// is a FOUNDER-SCORE artifact: the founder PLAYS it and scores it 1-10. Reachable ONLY at ?taste-match
// — it must NOT appear in production nav / on mallde.in.
//
// Reuses: the 3-phase state machine, the shared NotifyForm for capture, the scoped dark .taste-match
// tokens + motion v12 vocabulary. Tokens-only CSS.
//
// INVARIANTS preserved: honey may appear as a persona FLAVOR but is NEVER buyable / never added to
// cart (demand-only). No checkout/guest-cart/search/video-call code touched.
//
// REDUCED-MOTION (two-layer, §3): the global @media (prefers-reduced-motion: reduce) layer lives in
// index.css; HERE every motion-value/drag transform is gated behind useReducedMotion() — under reduce
// we render a STATIC card with tappable WANT IT! / NAH buttons (no drag, no motion-value transforms),
// because a CSS media query CANNOT stop motion-value inline transforms.
// ============================================================================================

// ---- PROTOTYPE STUB SWITCH (the single obvious one-line switch) -----------------------------
// The intended PRODUCTION capture is:
//   notify('quiz', phone, email, pincode, city, state, { name, source: 'taste-match-v6', fruits, persona, city })
// In prototype mode this MUST be MOCKED — a real POST to /api/catalog/notify would pollute MaLLADE's
// LIVE demand counts (the exact metric growth-lead measures). So flip this ONE flag to go live later.
const PROTOTYPE_MODE = true;

// ---- V7 CONVERSION LAYER — Google Identity Services (GIS) minimal type shim + script loader -------
// We render the official Google button (renderButton) rather than one-tap inside the embedded panel —
// renderButton is reliable inside an in-page container and gives the same credential callback. The whole
// path is gated behind VITE_GOOGLE_CLIENT_ID: absent → we never load the script and never render the
// button (graceful hide), so local dev / a misconfigured build shows only the email/phone fallback.
interface GisCredentialResponse {
  credential: string;
}
interface GisIdConfig {
  client_id: string;
  callback: (resp: GisCredentialResponse) => void;
}
interface GisButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  shape?: 'rectangular' | 'pill';
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  width?: number;
}
interface GoogleAccountsId {
  initialize: (cfg: GisIdConfig) => void;
  renderButton: (parent: HTMLElement, opts: GisButtonOptions) => void;
}
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let gisLoadPromise: Promise<GoogleAccountsId | null> | null = null;
// Load the GIS script once (cached promise). Resolves null if the id isn't configured or the script
// fails — callers then simply don't render the Google button (the email/phone fallback still works).
function loadGis(): Promise<GoogleAccountsId | null> {
  if (!GOOGLE_ENABLED) return Promise.resolve(null);
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve) => {
    if (window.google?.accounts?.id) {
      resolve(window.google.accounts.id);
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.google?.accounts?.id ?? null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return gisLoadPromise;
}

// §3 house spring. Feed identity transforms when reduce-motion is on.
const SPRING = { type: 'spring', stiffness: 260, damping: 26 } as const;

// Drag distance (px) past which a release commits a swipe (WANT IT! right / NAH left).
const SWIPE_THRESHOLD = 110;

// #3 — MID-DECK SOCIAL-PROOF FLASH.
// ILLUSTRATIVE / STATIC numbers only — this is a PROTOTYPE. These do NOT come from a real API and must
// NOT be presented as live data outside the prototype; they exist to demo the "you're not alone" beat.
// Keyed loosely so the flash feels topical to what was just swiped; falls back to a generic line.
// SWAP-TO-REAL SEAM: when wired for production, replace this map with a real aggregate from the demand
// endpoint (e.g. GET /api/catalog/notify/stats?slug=…) and gate it behind PROTOTYPE_MODE === false.
const SOCIAL_PROOF: Record<string, string> = {
  mango: '71% of swipers also wanted this',
  litchi: '64% couldn’t resist this one either',
  mangosteen: 'Only 22% are brave enough to want this',
  guava: '58% of swipers said yes to this',
  pomegranate: '49% wanted this too',
  honey: '83% are waiting on this drop',
  ghee: '76% want this lab-tested too',
};
const SOCIAL_PROOF_FALLBACK = 'Most swipers are split on this one';
// Show the flash after these swipe-indices (0-based card index just committed) — once or twice, mid-deck.
const SOCIAL_PROOF_AT = new Set([2, 5]);

const riseVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: SPRING },
  exit: { opacity: 0, y: 12, transition: { duration: 0.18 } },
};
const staggerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

type Phase = 'intro' | 'deck' | 'reveal';

export default function TasteMatch() {
  const reduce = useReducedMotion();

  const [phase, setPhase] = useState<Phase>('intro');
  const [cardIndex, setCardIndex] = useState(0);
  // #3 — the per-session SHUFFLED deck, built once per run from a fresh seed. The daily-drop card leads.
  // Seeded so a single playthrough is STABLE across re-renders, but DIFFERENT runs vary.
  const [deck, setDeck] = useState<DuelFruit[]>([]);
  // The ordered list of WANT-IT slugs — one per right-swipe. This IS the demand signal.
  const [picks, setPicks] = useState<string[]>([]);
  // The ordered list of NAH slugs — needed to compose natural "you waved off X" reveal copy (#5).
  const [skips, setSkips] = useState<string[]>([]);
  // #3 — the transient social-proof line currently flashing (null = none). Cleared on a timer.
  const [proof, setProof] = useState<string | null>(null);

  // #4 — intro habit copy. Read ONCE on mount (the stored streak + whether it's live + today's drop).
  // peekStreak()/streakIsLive() are pure reads (no mutation); recordRun() is the only mutator and it
  // fires later, on entering the reveal.
  const intro = useMemo(() => {
    const s = peekStreak();
    return { streak: s, live: streakIsLive(), drop: dailyDropFruit() };
  }, []);

  // V7 EXIT-INTENT — is there real, claimable progress AND is the player a guest? We read at mount and
  // re-read after a run finishes (the `phase` dep), so the nudge only ever offers to save something real.
  // The nudge component itself enforces the once-per-session + dismiss rules; here we just decide whether
  // to ARM it at all (never arm for a logged-in player, never for a brand-new zero-progress device).
  const isGuest = useMemo(() => !isLoggedIn(), []);
  const exitNudge = useMemo(() => {
    const s = peekStreak();
    const pass = peekPassport();
    const xp = peekTier();
    const hasProgress = s.totalPlays > 0 || pass.fruitsCount > 0 || xp.xp > 0;
    const badges = computeBadges({ discovered: pass.discovered, bestStreak: s.best }).filter(
      (b) => b.unlocked,
    );
    const best = badges[badges.length - 1];
    return { hasProgress, badgeLabel: best ? `${best.emoji} ${best.name}` : null };
    // re-evaluate after each phase change so a freshly-finished run's progress arms the nudge.
  }, [phase]);

  // #1 — HONEST persona match. scorePersona() returns the closest archetype + a REAL match % (cosine of
  // the player's swipe-vector to the archetype profile) + the ordered demand-signal winner slugs +
  // the player's normalised taste vector (feeds the composed "taste in three words").
  const { persona, matchPct, winnerSlugs, playerVector, confidence } = useMemo(
    () => scorePersona(picks, skips),
    [picks, skips],
  );
  // #5 — natural reveal copy composed from the ACTUAL wants + skips + the HONEST match % (so the share
  // line quotes a real number, never a fabricated population stat). playerVector + confidence feed the
  // "taste in three words" + the tone, so two players on the same persona who swiped differently differ.
  const copy: RevealCopy = useMemo(
    () => composeRevealCopy(winnerSlugs, skips, persona, matchPct, playerVector, confidence),
    [winnerSlugs, skips, persona, matchPct, playerVector, confidence],
  );

  // V6 — record the run's PROGRESSION EXACTLY ONCE when the reveal phase is entered (not on every render).
  // recordRun (streak), recordDiscoveries (passport), awardRun (XP/tier) all mutate localStorage, so they
  // must fire once per run; the effect is keyed to `phase` and guarded with a ref so a re-render in the
  // reveal phase never double-counts. ORDER matters (Phase 4 discovery-spine): streak first (its flags feed
  // the XP math), then passport (it tells us how many fruits are NEWLY discovered — the big XP lever), then
  // XP last (it consumes the discovery split).
  const [streakResult, setStreakResult] = useState<StreakUpdate | null>(null);
  const [xpResult, setXpResult] = useState<XpAward | null>(null);
  const [passportResult, setPassportResult] = useState<PassportUpdate | null>(null);
  const [newBadges, setNewBadges] = useState<Badge[]>([]);
  const recordedRef = useRef(false);
  useEffect(() => {
    if (phase !== 'reveal' || recordedRef.current) return;
    recordedRef.current = true;

    // 1) STREAK — also gives us the firstPlayToday / live-day flags the XP curve rewards.
    const streak = recordRun();
    setStreakResult(streak);

    // 2) PASSPORT — record the WANT-IT slugs (only the 14 collectibles count; honey/ghee are ignored inside
    //    recordDiscoveries). Snapshot badges BEFORE the mutation so we can diff what was newly earned. The
    //    returned newlyDiscovered drives the discovery-weighted XP below.
    const beforeBadges = computeBadges({ bestStreak: streak.best });
    const passport = recordDiscoveries(winnerSlugs);
    setPassportResult(passport);
    const afterBadges = computeBadges({ discovered: passport.discovered, bestStreak: streak.best });
    const beforeIds = new Set(beforeBadges.filter((b) => b.unlocked).map((b) => b.id));
    setNewBadges(afterBadges.filter((b) => b.unlocked && !beforeIds.has(b.id)));

    // 3) XP / TIER — DISCOVERY-SPINE. The big earn is newly-discovered collectibles this run; everything
    //    else (already-owned fruits + demand-only honey/ghee) is a small capped repeat trickle. firstPlayToday
    //    = an advance that isn't a same-day replay; a live streak day grants the streak bonus. Surfaces
    //    tieredUp for the "you evolved!" mascot celebration.
    const firstPlayToday = streak.advanced && !streak.sameDay;
    const newDiscoveries = passport.newlyDiscovered.length;
    const repeatWants = Math.max(0, winnerSlugs.length - newDiscoveries);
    const xp = awardRun({
      newDiscoveries,
      repeatWants,
      streakDay: streakIsLive(),
      firstPlayToday,
    });
    setXpResult(xp);
  }, [phase, winnerSlugs]);

  // Static/animated prop helper — finished state, no transition, when reduce-motion is on.
  const reveal = (): MotionProps =>
    reduce
      ? { initial: false }
      : { variants: riseVariants, initial: 'hidden', animate: 'show', exit: 'exit' };

  function start() {
    // #3 — fresh seed per play so each run draws a different shuffled deck (daily-drop card still leads).
    setDeck(buildDeck(Date.now()));
    setPicks([]);
    setSkips([]);
    setProof(null);
    setCardIndex(0);
    // reset the run-record guard + all progression results so the NEXT reveal records its own run.
    recordedRef.current = false;
    setStreakResult(null);
    setXpResult(null);
    setPassportResult(null);
    setNewBadges([]);
    setPhase('deck');
  }

  // Commit a card: 'want' pushes the slug (demand signal); 'nah' records the skip. Then advance or reveal.
  // #3: after select mid-deck swipes, flash a brief (illustrative) social-proof line keyed to that fruit.
  const commit = useCallback(
    (decision: 'want' | 'nah') => {
      const slug = deck[cardIndex].slug;
      if (decision === 'want') setPicks((prev) => [...prev, slug]);
      else setSkips((prev) => [...prev, slug]);

      const last = cardIndex + 1 >= DUEL_COUNT;
      if (!last && SOCIAL_PROOF_AT.has(cardIndex)) {
        setProof(SOCIAL_PROOF[slug] ?? SOCIAL_PROOF_FALLBACK);
      }

      if (last) {
        setPhase('reveal');
      } else {
        setCardIndex((i) => i + 1);
      }
    },
    [cardIndex, deck],
  );

  // #3 — auto-dismiss the social-proof flash after a short, non-blocking beat.
  useEffect(() => {
    if (!proof) return;
    const t = window.setTimeout(() => setProof(null), 1900);
    return () => window.clearTimeout(t);
  }, [proof]);

  // Friendly progress framing over the deck.
  const progressPct = Math.round((cardIndex / DUEL_COUNT) * 100);

  const honeyLean = winnerSlugs.includes('honey') || persona.flavorSlug === 'honey';

  return (
    <section className="taste-match" aria-labelledby="taste-match-title">
      <div className="taste-match-inner">
        {/* ---- PHASE 1: intro — full-bleed darkened hero (drag #1 fix) ---- */}
        {phase === 'intro' && (
          <motion.div className="tm-intro" {...reveal()}>
            {/* Full-bleed darkened hero photo behind the title — fills the old dead-space with intent.
                A layered scrim (.tm-intro-scrim) sits between the photo and the copy for depth + AA.
                #3: introHero() is the DAILY DROP'S photo so the intro previews "today's drop". */}
            <div className="tm-intro-hero" aria-hidden="true">
              {/* The DAILY-DROP photo is always the base layer (instant first paint, and the ONLY layer
                  under reduced-motion). When motion is allowed, ONE ambient honey loop (CC0, Mixkit,
                  self-hosted ~0.78MB, with a poster) plays OVER it for atmosphere — muted/looped/inline,
                  decorative. Killed entirely under reduce: the <video> isn't even mounted (JS layer one)
                  and the CSS layer-two drops its opacity to 0. */}
              <img className="tm-intro-hero-photo" src={introHero()} alt="" draggable={false} />
              {!reduce && (
                <video
                  className="tm-intro-hero-video"
                  src="/taste-match-proto/ambient-honey.mp4"
                  poster="/taste-match-proto/ambient-honey-poster.jpg"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="metadata"
                  aria-hidden="true"
                />
              )}
              <div className="tm-intro-scrim" />
            </div>
            <div className="tm-intro-copy">
              {/* #4 — HABIT HOOK. A returning player on a live streak gets greeted with it; everyone
                  else gets a softer "play daily" nudge. Both name today's drop. Tokens-only, dark. */}
              {intro.live && intro.streak.count > 0 ? (
                <span className="tm-streak-pill" role="status">
                  🔥 {intro.streak.count}-day taste streak
                </span>
              ) : (
                <span className="tm-streak-pill tm-streak-pill-soft">
                  Play daily — build your taste streak
                </span>
              )}
              <span className="tm-eyebrow">Taste Match</span>
              <h2 id="taste-match-title" className="display-1 tm-intro-title">
                What fruit
                <br />
                are you?
              </h2>
              <p className="tm-intro-lede">
                Swipe through India&apos;s rarest fruits. Right for <strong>want it</strong>, left for{' '}
                <strong>nah</strong>. We&apos;ll reveal your fruit persona — and how well you match it.
              </p>
              <p className="tm-intro-drop">
                Today&apos;s drop: <strong>{intro.drop.name}</strong>
              </p>
              <button type="button" className="btn btn-primary tm-start" onClick={start}>
                Start swiping →
              </button>
              <p className="tm-intro-fine">Under a minute · one thumb · no rules</p>
            </div>
          </motion.div>
        )}

        {/* ---- PHASE 2: the swipe DECK ---- */}
        {phase === 'deck' && (
          <div className="tm-deck-wrap">
            <div className="tm-progress" role="status" aria-live="polite">
              <span className="tm-progress-label">
                {Math.min(cardIndex + 1, DUEL_COUNT)} of {DUEL_COUNT}
              </span>
              <div className="tm-progress-track" aria-hidden="true">
                <motion.div
                  className="tm-progress-fill"
                  initial={false}
                  animate={{ width: `${progressPct}%` }}
                  transition={reduce ? { duration: 0 } : SPRING}
                />
              </div>
            </div>

            <Deck reduce={!!reduce} deck={deck} cardIndex={cardIndex} onCommit={commit} />

            {/* #3 — mid-deck social-proof flash: brief, non-blocking, fades out. role=status so screen
                readers get it once; pointer-events:none in CSS so it never blocks the next swipe. */}
            <AnimatePresence>
              {proof && (
                <motion.div
                  key={proof}
                  className="tm-social-proof"
                  role="status"
                  initial={reduce ? false : { opacity: 0, y: 10, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 24 }}
                >
                  <span className="tm-social-proof-dot" aria-hidden="true" />
                  {proof}
                </motion.div>
              )}
            </AnimatePresence>

            {!reduce && (
              <p className="tm-deck-hint" aria-hidden="true">
                Drag right to want · left to skip
              </p>
            )}
          </div>
        )}

        {/* ---- PHASE 3: loud persona reveal + share + capture ---- */}
        {phase === 'reveal' && (
          <Reveal
            reduce={!!reduce}
            persona={persona}
            matchPct={matchPct}
            winnerSlugs={winnerSlugs}
            copy={copy}
            honeyLean={honeyLean}
            streakResult={streakResult}
            xpResult={xpResult}
            passportResult={passportResult}
            newBadges={newBadges}
            reveal={reveal}
            staggerVariants={staggerVariants}
            onReplay={start}
          />
        )}
      </div>

      {/* V7 EXIT-INTENT NUDGE — armed only for a guest who has real progress to keep. Once-per-session,
          dismissible, honest; never shown to a logged-in player or a zero-progress device. */}
      {isGuest && exitNudge.hasProgress && (
        <ExitNudge reduce={!!reduce} badgeLabel={exitNudge.badgeLabel} />
      )}
    </section>
  );
}

// ============================================================================================
// The swipe DECK — a stack; the top card is draggable (motion v12 drag="x"). A peek-behind next card
// scales up slightly. WANT IT! opacity rises on right-drag, NAH on left-drag. Release past threshold =
// spring-throw off-screen + commit; below = spring back. GATED: under reduce we render the static
// fallback (no drag, no motion values) — tappable WANT IT! / NAH buttons.
// #3: cards are indexed off the per-session `deck` array prop, NOT a static imported constant.
// ============================================================================================
function Deck({
  reduce,
  deck,
  cardIndex,
  onCommit,
}: {
  reduce: boolean;
  deck: DuelFruit[];
  cardIndex: number;
  onCommit: (d: 'want' | 'nah') => void;
}) {
  const top = deck[cardIndex];
  const next = deck[cardIndex + 1];

  return (
    <div className="tm-deck">
      {/* peek-behind next card (static; the live scale-up is driven by the top card's drag below) */}
      {next && (
        <div className="tm-deck-peek" aria-hidden="true">
          <FruitArt fruit={next} />
          <div className="tm-card-grade" />
          <div className="tm-card-scrim" />
        </div>
      )}

      <AnimatePresence mode="popLayout">
        {top &&
          (reduce ? (
            <StaticCard key={cardIndex} fruit={top} onCommit={onCommit} />
          ) : (
            <SwipeCard key={cardIndex} fruit={top} onCommit={onCommit} />
          ))}
      </AnimatePresence>
    </div>
  );
}

// "Lab-tested" trust badge for the DEMAND-ONLY pantry items (honey + ghee). These are coming-soon / NEVER
// buyable — the badge is MaLLADE's quality promise (honey adulteration + ghee purity are real consumer
// concerns), and a tasteful signal that a WANT-IT here is a pre-launch demand vote, not a purchase. It is
// rendered ONLY for fruit.demandOnly cards, sits top-right (opposite the tagline eyebrow), and uses the
// trust-green --forest accent on a dark backing pill so it clears AA over a bright photo top. Tokens-only;
// no animation, so it is inert under reduced-motion (the two-layer kill-switch needs nothing extra here).
function LabBadge({ fruit }: { fruit: DuelFruit }) {
  if (!fruit.demandOnly) return null;
  return (
    <span className="tm-lab-badge" aria-label="Lab-tested — coming soon, not yet for sale">
      <svg className="tm-lab-badge-tick" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
        <path
          d="M2.5 8.5l3.2 3.2L13.5 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Lab-tested
    </span>
  );
}

// Full-bleed fruit photo with graceful emoji fallback if the prototype asset 404s.
function FruitArt({ fruit }: { fruit: DuelFruit }) {
  const [failed, setFailed] = useState(false);
  if (failed || !fruit.imageUrl) {
    return (
      <div className="tm-card-emoji-bg" aria-hidden="true">
        <span>{fruit.emoji}</span>
      </div>
    );
  }
  return (
    <img
      className="tm-card-photo"
      src={fruit.imageUrl}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

// The DRAGGABLE top card (fine-motion path). Uses useMotionValue/useTransform for stamp opacities +
// rotation. onDragEnd checks the threshold and either throws the card off-screen + commits, or springs
// back. Honey card here is a demand signal on want — NEVER add-to-cart.
// forwardRef so AnimatePresence mode="popLayout" can attach its measurement ref (silences the dev-only
// "Function components cannot be given refs" warning; popLayout pops the exiting card out of layout flow —
// keeping the swipe-throw exit + no-gap next-card behavior intact, unlike mode="wait").
const SwipeCard = forwardRef<
  HTMLDivElement,
  {
    fruit: DuelFruit;
    onCommit: (d: 'want' | 'nah') => void;
  }
>(function SwipeCard({ fruit, onCommit }, ref) {
  // #1 (V4) — REAL continuous drag physics. The card follows the pointer 1:1 (drag="x"); x drives rotation,
  // the stamp opacities, AND a like/nah colour tint — all proportional to drag distance, all live.
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-14, 0, 14]);
  const wantOpacity = useTransform(x, [20, SWIPE_THRESHOLD], [0, 1]);
  const nahOpacity = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0]);
  // Colour tints: green/litchi "want" wash on right-drag, cool "nah" wash on left-drag. They reach full
  // strength right at the commit threshold so the player FEELS the line they're about to cross.
  const wantTint = useTransform(x, [10, SWIPE_THRESHOLD], [0, 0.5]);
  const nahTint = useTransform(x, [-SWIPE_THRESHOLD, -10], [0.5, 0]);
  // A faint scale-pop on the stamps as the threshold is reached (the "click" of the decision).
  const wantStampScale = useTransform(x, [20, SWIPE_THRESHOLD], [0.82, 1]);
  const nahStampScale = useTransform(x, [-SWIPE_THRESHOLD, -20], [1, 0.82]);
  // peek card behind scales up as the top card travels (handled visually here on the card's shadow).
  const [thrown, setThrown] = useState(false);

  // Tiny haptic-ish "armed" cue: toggle a class the moment the card crosses the commit threshold while
  // still dragging, so the stamp reads as locked-in before release. Pure visual; no commit happens here.
  const [armed, setArmed] = useState<0 | 1 | -1>(0);
  useMotionValueEvent(x, 'change', (v) => {
    const next = v > SWIPE_THRESHOLD ? 1 : v < -SWIPE_THRESHOLD ? -1 : 0;
    setArmed((prev) => (prev === next ? prev : next));
  });

  function handleDragEnd(_e: unknown, info: PanInfo) {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const past = Math.abs(offset) > SWIPE_THRESHOLD || Math.abs(velocity) > 700;
    if (!past) return; // below threshold → motion's dragSnapToOrigin springs it back

    const decision: 'want' | 'nah' = offset > 0 ? 'want' : 'nah';
    setThrown(true);
    // Spring-throw off-screen in the drag direction, then register the pick.
    const dir = offset > 0 ? 1 : -1;
    animate(x, dir * (window.innerWidth || 800), {
      type: 'spring',
      stiffness: 220,
      damping: 30,
      onComplete: () => onCommit(decision),
    });
  }

  return (
    <motion.div
      ref={ref}
      className="tm-card tm-swipe-card"
      style={{ x, rotate }}
      drag={thrown ? false : 'x'}
      dragSnapToOrigin
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.7}
      whileTap={{ cursor: 'grabbing' }}
      initial={{ scale: 0.94, y: 16, opacity: 0 }}
      animate={{ scale: 1, y: 0, opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      transition={SPRING}
      onDragEnd={handleDragEnd}
    >
      <FruitArt fruit={fruit} />
      <div className="tm-card-grade" aria-hidden="true" />
      <div className="tm-card-scrim" />

      {/* #1 — live colour TINT washes, opacity driven by the same x motion value as the stamps. */}
      <motion.div className="tm-card-tint tm-card-tint-want" style={{ opacity: wantTint }} aria-hidden="true" />
      <motion.div className="tm-card-tint tm-card-tint-nah" style={{ opacity: nahTint }} aria-hidden="true" />

      {/* B "Vivid Pop-Juicy" swipe STAMPS — fade + scale-pop in on drag via motion values; `is-armed`
          fires the moment the card crosses the commit threshold so the decision reads locked-in. */}
      {/* rotate is baked into the motion transform (not CSS) because the inline scale transform would
          otherwise clobber a CSS `transform: rotate(...)`. */}
      <motion.div
        className={'tm-stamp tm-stamp-want' + (armed === 1 ? ' is-armed' : '')}
        style={{ opacity: wantOpacity, scale: wantStampScale, rotate: 12 }}
        aria-hidden="true"
      >
        WANT IT!
      </motion.div>
      <motion.div
        className={'tm-stamp tm-stamp-nah' + (armed === -1 ? ' is-armed' : '')}
        style={{ opacity: nahOpacity, scale: nahStampScale, rotate: -12 }}
        aria-hidden="true"
      >
        NAH
      </motion.div>

      <span className={'tm-card-eyebrow tm-card-eyebrow-' + fruit.accent}>{fruit.tagline}</span>
      <LabBadge fruit={fruit} />

      <div className="tm-card-foot">
        <h3 className="tm-card-title">{fruit.name}</h3>
        <p className="tm-card-fact">{fruit.microFact}</p>
        <div className="tm-card-actions" aria-hidden="true">
          <span className="tm-card-chip tm-card-chip-nah">✕ Nah</span>
          <span className="tm-card-chip tm-card-chip-want">♥ Want it</span>
        </div>
      </div>
    </motion.div>
  );
});

// REDUCED-MOTION static fallback — no drag, no motion values. Real <button>s commit the pick. Mandatory
// per §3 (the CSS media query can't stop motion-value transforms, so the JS path must not mount them).
const StaticCard = forwardRef<
  HTMLDivElement,
  {
    fruit: DuelFruit;
    onCommit: (d: 'want' | 'nah') => void;
  }
>(function StaticCard({ fruit, onCommit }, ref) {
  return (
    <div ref={ref} className="tm-card tm-static-card">
      <FruitArt fruit={fruit} />
      <div className="tm-card-grade" aria-hidden="true" />
      <div className="tm-card-scrim" />
      <span className={'tm-card-eyebrow tm-card-eyebrow-' + fruit.accent}>{fruit.tagline}</span>
      <LabBadge fruit={fruit} />
      <div className="tm-card-foot">
        <h3 className="tm-card-title">{fruit.name}</h3>
        <p className="tm-card-fact">{fruit.microFact}</p>
        <div className="tm-static-actions">
          <button
            type="button"
            className="tm-static-btn tm-static-btn-nah"
            onClick={() => onCommit('nah')}
            aria-label={`Nah — skip ${fruit.name}`}
          >
            ✕ Nah
          </button>
          <button
            type="button"
            className="tm-static-btn tm-static-btn-want"
            onClick={() => onCommit('want')}
            aria-label={`Want it — pick ${fruit.name}`}
          >
            ♥ Want it
          </button>
        </div>
      </div>
    </div>
  );
});

// ============================================================================================
// PHASE 3 — V6 reveal = direction 3C "Hero summary + expandable accordion (progressive disclosure)".
// The persona HERO lands FIRST (identity-led, Spotify-Wrapped: the insight line is the headline, not a
// performance stat), with the loud share + swipe-again right under it. Everything else — picks-by-origin,
// also-loved, the slow-evolving taste rank (1B mascot), and the fruit passport (2A India map) — lives in
// collapsible accordion rows below the fold, so the climax is uninterrupted. The off-screen 1080×1920
// (9:16) capture node still backs the shareable PNG.
// ============================================================================================
function Reveal({
  reduce,
  persona,
  matchPct,
  winnerSlugs,
  copy,
  honeyLean,
  streakResult,
  xpResult,
  passportResult,
  newBadges,
  reveal,
  staggerVariants,
  onReplay,
}: {
  reduce: boolean;
  persona: TastePersona;
  matchPct: number;
  winnerSlugs: string[];
  copy: RevealCopy;
  honeyLean: boolean;
  streakResult: StreakUpdate | null;
  xpResult: XpAward | null;
  passportResult: PassportUpdate | null;
  newBadges: Badge[];
  reveal: () => MotionProps;
  staggerVariants: Variants;
  onReplay: () => void;
}) {
  // the capture form is SECONDARY — hidden behind a soft "want first dibs?" toggle so the joyful,
  // shareable climax lands FIRST, uninterrupted by a lead-gen form.
  const [showCapture, setShowCapture] = useState(false);

  // V7 CONVERSION — login-to-claim. We only surface the claim CTA when the player EARNED something real
  // THIS run (a new badge, a tier-up, or a fresh passport region) AND isn't already logged in. The CTA is
  // HONEST (names the thing earned), inline (never hides the achievement), and on a successful login it
  // merges the device progress into the account. `claimed` flips the panel to a calm "saved" confirmation.
  const loggedInAtMount = useMemo(() => isLoggedIn(), []);
  const claimable: Claimable | null = useMemo(
    () =>
      claimableFrom({
        newBadges: newBadges.map((b) => ({ emoji: b.emoji, name: b.name })),
        tieredUp: !!xpResult?.tieredUp,
        tierName: xpResult?.tier.name,
        newRegions: passportResult?.newRegions ?? [],
      }),
    [newBadges, xpResult, passportResult],
  );
  const [claimed, setClaimed] = useState(false);

  // #4 — the streak result line, phrased honestly from recordRun()'s flags.
  const streakLine = streakResult ? streakCopy(streakResult) : null;

  // The progression read used by the rank/passport rows — fall back to a fresh peek if the run hasn't
  // recorded yet (defensive; the effect fires synchronously on reveal entry so these are normally set).
  const tier = xpResult ?? peekTier();
  const passport = passportResult ?? peekPassport();

  // 💛 ALSO LOVED — "the one you're missing." Honest taste-affinity (never a fabricated %), routed only to
  // the 14 buyable fruits (honey/ghee are never an also-loved). Empty on a no-wants run.
  const loved = useMemo(() => alsoLoved(winnerSlugs, 1)[0], [winnerSlugs]);

  // 📍 PICKS BY ORIGIN — the player's WANT-IT slugs resolved to provenance (name + origin + GI year-or-null
  // + ≤20-word story). GI ✓ shows ONLY when giYear is non-null (mangosteen/dragon-fruit/honey/ghee have none).
  const picksProvenance = useMemo(
    () =>
      winnerSlugs
        .map((slug) => fruitForSlug(slug))
        .filter((f): f is DuelFruit => !!f)
        .slice(0, 5)
        .map((f) => ({ slug: f.slug, prov: provenanceOf(f), story: f.story })),
    [winnerSlugs],
  );

  return (
    <motion.div
      className={'tm-reveal tm-reveal-v6' + (honeyLean ? ' is-honey' : '')}
      {...((reduce
        ? { initial: false }
        : { variants: staggerVariants, initial: 'hidden', animate: 'show' }) as MotionProps)}
    >
      {/* ── 3C HERO CARD — identity FIRST. The insight line is the headline read (Spotify-Wrapped). ── */}
      <motion.div className={'tm-hero-card' + (reduce ? '' : ' tm-celebrate')} {...reveal()}>
        {!reduce && <span className="tm-shimmer" aria-hidden="true" />}
        {!reduce && <span className="tm-sparks" aria-hidden="true" />}
        <span className="tm-hero-kick">Your fruit persona</span>
        <h2 className="tm-hero-name">{persona.name}</h2>
        {/* D (B3): the IDENTITY insight — who you are, not how you scored. Prominent, before the %. */}
        <p className="tm-hero-insight">{copy.insight}</p>
        <p className="tm-hero-match">
          You&apos;re <MatchCountUp reduce={reduce} target={matchPct} /> a match
        </p>
        {/* the natural, composed descriptive line (names the player's real wants/skips). */}
        <p className="tm-hero-body">{copy.descriptive}</p>
        {/* "your taste in three words" — small, true, derived from the vector. */}
        {copy.words.length > 0 && (
          <div className="tm-hero-words" aria-label="Your taste in three words">
            {copy.words.map((w) => (
              <span key={w} className="tm-hero-word">
                {w}
              </span>
            ))}
          </div>
        )}
        <div className="tm-hero-share">
          <ShareButton persona={persona} matchPct={matchPct} shareLine={copy.shareLine} />
        </div>
      </motion.div>

      {/* swipe-again sits right under the hero (a real, prominent secondary action). */}
      <motion.button type="button" className="btn tm-replay tm-replay-v6" onClick={onReplay} {...reveal()}>
        ↺ Swipe again — new fruits every play
      </motion.button>

      {/* V6 — tier-up + new-badge celebration banner. Honest, derived from the run's recorded progression. */}
      {xpResult?.tieredUp && (
        <motion.p className="tm-evolve-banner" role="status" {...reveal()}>
          ✨ You evolved — <strong>{xpResult.fromTier.name}</strong> → <strong>{xpResult.tier.name}</strong>!
        </motion.p>
      )}
      {newBadges.length > 0 && (
        <motion.div className="tm-badge-pop" role="status" {...reveal()}>
          {newBadges.map((b) => (
            <span key={b.id} className="tm-badge-chip" title={b.blurb}>
              {b.emoji} {b.name} unlocked
            </span>
          ))}
        </motion.div>
      )}
      {passportResult && passportResult.newRegions.length > 0 && (
        <motion.p className="tm-region-pop" role="status" {...reveal()}>
          🗺️ New region{passportResult.newRegions.length > 1 ? 's' : ''} lit up:{' '}
          <strong>{passportResult.newRegions.join(', ')}</strong>
        </motion.p>
      )}

      {/* ── V7 LOGIN-TO-CLAIM — inline, white-hat. Sits right under the celebration banners (so the
          achievement is ALREADY visible above it), only when something real was earned this run and the
          player isn't logged in. Logged-in earners get a calm "saved to your profile" line instead. ── */}
      {claimable && !loggedInAtMount && (
        <motion.div {...reveal()}>
          <TasteClaim
            reduce={reduce}
            claimable={claimable}
            personaId={persona.id}
            claimed={claimed}
            onClaimed={() => setClaimed(true)}
          />
        </motion.div>
      )}
      {claimable && loggedInAtMount && (
        <motion.p className="tm-claim-saved" role="status" {...reveal()}>
          ✓ Saved to your profile — your {claimable.headline} is safe across all your devices.
        </motion.p>
      )}

      {/* ── THE ACCORDION (progressive disclosure) — everything detailed lives here, below the climax. ── */}
      <motion.div className="tm-acc" {...reveal()}>
        <AccRow icon="📍" title="Your picks, by origin" defaultOpen>
          {picksProvenance.length === 0 ? (
            <p className="tm-acc-empty">You waved off the whole tray — nothing to map this round.</p>
          ) : (
            <ul className="tm-prov-list">
              {picksProvenance.map(({ slug, prov, story }) => (
                <li key={slug} className="tm-prov-item">
                  <div className="tm-prov-head">
                    <b className="tm-prov-name">{prov.name}</b>
                    {/* GI ✓ ONLY when giYear is non-null — honesty contract (no GI for mangosteen/
                        dragon-fruit/honey/ghee). Origin always shown. */}
                    <span className="tm-prov-meta">
                      {prov.origin}
                      {prov.giYear != null && <span className="tm-prov-gi"> · GI&nbsp;✓</span>}
                    </span>
                  </div>
                  <p className="tm-prov-story">{story}</p>
                </li>
              ))}
            </ul>
          )}
        </AccRow>

        <AccRow icon="💛" title="Also loved">
          {loved ? (
            <p className="tm-loved">
              Your taste says you&apos;d fall for <b>{loved.fruit.name}</b> — the one you&apos;re missing.{' '}
              <span className="tm-loved-origin">{loved.fruit.origin}.</span>
            </p>
          ) : (
            <p className="tm-acc-empty">Swipe right on a few fruits and we&apos;ll find your next match.</p>
          )}
        </AccRow>

        <AccRow icon="🏅" title="Your taste rank">
          {/* SURFACE 1 — 1B drawn fruit-mascot, evolving slowly across plays. */}
          <TasteRankMascot tier={tier} reduce={reduce} />
        </AccRow>

        <AccRow icon="🗺️" title={`Fruit passport · ${passport.fruitsCount}/${passport.fruitsTotal}`}>
          {/* SURFACE 2 — 2A literal India silhouette + glowing region pins. */}
          <FruitPassportMap passport={passport} reduce={reduce} />
        </AccRow>
      </motion.div>

      {/* #4 — the streak result line/pill. Animated in with the same reveal() stagger; reduce-safe. */}
      {streakLine && (
        <motion.p className="tm-streak-result" role="status" {...reveal()}>
          {streakLine}
        </motion.p>
      )}

      {honeyLean && (
        <motion.p className="tm-reveal-note" {...reveal()}>
          Your taste leans toward our honey — it&apos;s not for sale yet, but drop your number below and
          you&apos;ll be first to know when the first drop lands.
        </motion.p>
      )}

      {/* ── THE ASK (secondary, below the fold, behind a soft toggle) ────────────────────────── */}
      <motion.div className="tm-capture-block" {...reveal()}>
        {!showCapture ? (
          <button
            type="button"
            className="tm-capture-toggle"
            onClick={() => setShowCapture(true)}
            aria-expanded={false}
            aria-controls="tm-capture-panel"
          >
            🔔 Want first dibs? Drop your number →
          </button>
        ) : (
          <div id="tm-capture-panel" className="tm-capture-panel">
            <p className="tm-capture-lede">
              Be first in line when {honeyLean ? 'the honey' : 'your picks'} drop — we&apos;ll text you,
              nothing else.
            </p>
            {/* Capture — reuse the shared NotifyForm. In PROTOTYPE_MODE the submit is MOCKED. */}
            <NotifyForm
              collectName
              stateFirst
              onNotify={() => {}}
              onNotifyWithName={(name, phone, email, pincode, city, state) => {
                // V7 production shape: source is 'taste-match-v7' and the extra carries
                // { fruits, persona, city, state } — state + pincode are the per-pincode demand
                // footprint. STILL stubbed under PROTOTYPE_MODE — never POSTs.
                const payload = {
                  topic: 'quiz',
                  phone,
                  email,
                  pincode,
                  city,
                  state,
                  extra: {
                    name,
                    source: 'taste-match-v7',
                    fruits: winnerSlugs,
                    persona: persona.id,
                    city,
                    state,
                  },
                };
                if (PROTOTYPE_MODE) {
                  // STUB: console.log only — do NOT POST. A real POST pollutes live demand counts.
                  // To wire for real later: flip PROTOTYPE_MODE → false and replace this block with
                  //   notify('quiz', phone, email, pincode, city, state, payload.extra)
                  // eslint-disable-next-line no-console
                  console.log('[TasteMatch · PROTOTYPE · notify STUBBED — no POST]', payload);
                }
              }}
            />
          </div>
        )}
      </motion.div>

      {/* #4 — honest footnote: rank/streak/passport are per-device (localStorage), not server-truth. */}
      <p className="tm-streak-fine">Your taste rank, streak &amp; passport are saved on this device only.</p>
    </motion.div>
  );
}

// ============================================================================================
// V7 LOGIN-TO-CLAIM — the white-hat conversion surface. Direction "Inline panel" (fe-lead recommended,
// pending founder confirmation): an in-flow card that matches the tm-capture-block toggle idiom and
// NEVER hides the achievement (the badge/tier banner is already rendered above it). It states the truth —
// you earned a real thing; log in to keep it everywhere — and offers Google one-tap (gated behind
// VITE_GOOGLE_CLIENT_ID; hidden when absent) plus an email-or-phone + password fallback with a
// login/register toggle. On success it MERGES the device progress (api seam, stub-tolerant) and flips to
// a calm "saved" confirmation. Honesty: the device progress is NEVER lost — login is additive.
// Motion: only the reveal() stagger from the parent + a CSS expand; no motion-value transforms here, so
// it's inert under reduced-motion (two-layer kill-switch already covers the parent).
// ============================================================================================
function TasteClaim({
  reduce,
  claimable,
  personaId,
  claimed,
  onClaimed,
}: {
  reduce: boolean;
  claimable: Claimable;
  personaId: string;
  claimed: boolean;
  onClaimed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The Google button container — GIS renders into it once the script is loaded AND the panel is open.
  const googleSlot = useRef<HTMLDivElement | null>(null);
  const [googleReady, setGoogleReady] = useState(false);

  // Honest, specific CTA copy keyed to WHAT was earned (badge / tier / region).
  const cue =
    claimable.kind === 'badge'
      ? `You unlocked ${claimable.headline}`
      : claimable.kind === 'tier'
        ? `You reached ${claimable.headline}`
        : `You discovered ${claimable.headline}`;

  // Render the official Google button into our slot once the panel opens and GIS is available. Gated
  // behind GOOGLE_ENABLED so an unconfigured build never loads the script or shows the button.
  useEffect(() => {
    if (!open || !GOOGLE_ENABLED || claimed) return;
    let cancelled = false;
    void loadGis().then((gis) => {
      if (cancelled || !gis || !googleSlot.current) return;
      gis.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp) => {
          void runClaim(() => claimWithGoogle(resp.credential, { persona: personaId }));
        },
      });
      gis.renderButton(googleSlot.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: 280,
      });
      setGoogleReady(true);
    });
    return () => {
      cancelled = true;
    };
    // runClaim/personaId are stable enough for this one-shot render; deps kept minimal intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, claimed]);

  // Shared claim runner: do the auth+merge, surface a friendly error on failure, flip to "saved" on win.
  async function runClaim(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      onClaimed();
    } catch {
      setError('Could not sign you in just now. Your progress is still safe on this device.');
    } finally {
      setBusy(false);
    }
  }

  function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Enter your email or phone and a password.');
      return;
    }
    void runClaim(() =>
      claimWithPassword(mode, identifier.trim(), password, { persona: personaId }),
    );
  }

  // POST-CLAIM — calm, honest confirmation. No more CTA; the thing is saved.
  if (claimed) {
    return (
      <div className="tm-claim tm-claim-done" role="status">
        <span className="tm-claim-tick" aria-hidden="true">
          ✓
        </span>
        <p className="tm-claim-done-copy">
          Saved to your profile — your <strong>{claimable.headline}</strong> &amp; Taste Rank now follow
          you on every device.
        </p>
      </div>
    );
  }

  return (
    <div className={'tm-claim' + (open ? ' is-open' : '')}>
      {!open ? (
        <button
          type="button"
          className="tm-claim-cue"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls="tm-claim-panel"
        >
          <span className="tm-claim-cue-head">{cue}</span>
          <span className="tm-claim-cue-sub">
            Log in to save your badge &amp; keep your Taste Rank →
          </span>
        </button>
      ) : (
        <div id="tm-claim-panel" className="tm-claim-panel">
          <div className="tm-claim-panel-head">
            <p className="tm-claim-panel-lede">
              <strong>{cue}.</strong> Log in to keep it — your rank, badges &amp; fruit passport will
              follow you on every device.
            </p>
            <button
              type="button"
              className="tm-claim-close"
              onClick={() => setOpen(false)}
              aria-label="Close — keep playing without logging in"
            >
              ✕
            </button>
          </div>

          {/* Google one-tap — only when configured. The slot stays mounted; GIS paints into it. */}
          {GOOGLE_ENABLED && (
            <>
              <div ref={googleSlot} className="tm-claim-google" aria-busy={!googleReady} />
              <div className="tm-claim-or" aria-hidden="true">
                <span>or</span>
              </div>
            </>
          )}

          {/* Email-or-phone + password fallback (the existing auth-service `identifier`+password idiom). */}
          <form className="tm-claim-form" onSubmit={submitPassword} noValidate>
            <label className="coming-soon-label" htmlFor="tm-claim-id">
              Email or phone
            </label>
            <input
              id="tm-claim-id"
              type="text"
              autoComplete="username"
              className="coming-soon-input"
              placeholder="you@example.com or 98765 43210"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (error) setError('');
              }}
            />
            <label className="coming-soon-label" htmlFor="tm-claim-pw">
              Password
            </label>
            <input
              id="tm-claim-pw"
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              className="coming-soon-input"
              placeholder={mode === 'register' ? 'Create a password' : 'Your password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
            />
            {error && (
              <span className="coming-soon-error" role="alert">
                {error}
              </span>
            )}
            <button type="submit" className="btn btn-primary tm-claim-submit" disabled={busy}>
              {busy
                ? 'Saving…'
                : mode === 'register'
                  ? 'Create account & save'
                  : 'Log in & save'}
            </button>
          </form>

          <button
            type="button"
            className="tm-claim-toggle-mode"
            onClick={() => {
              setMode((m) => (m === 'login' ? 'register' : 'login'));
              setError('');
            }}
          >
            {mode === 'login'
              ? 'New here? Create an account'
              : 'Already have an account? Log in'}
          </button>

          {/* Always-visible no-thanks path — never trapped. */}
          <button type="button" className="tm-claim-skip" onClick={() => setOpen(false)}>
            No thanks, keep playing
          </button>

          {/* Honest footnote: nothing is lost either way. */}
          <p className="tm-claim-fine">
            Your progress is already saved on this device{reduce ? '' : ' '}— logging in just keeps it
            everywhere.
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================================
// V7 EXIT-INTENT NUDGE — direction "Gentle bottom toast" (fe-lead recommended, pending founder
// confirmation): the rubric-safest, least-manipulative form factor. RUBRIC HARD-RULES enforced here:
//   • fires at most ONCE per session (sessionStorage gate via tasteProfile.exitNudgeShown).
//   • only when there's real progress to keep AND the player isn't logged in.
//   • HONEST copy — "saved on this device, log in to keep them everywhere" — NEVER "you'll lose it forever."
//   • obvious close (✕) + an always-visible "Not now" — a no-thanks path is never hidden.
//   • dismissible; never re-shown after dismiss in the same session.
//   • reduce-motion respected (slide-in gated; static under reduce).
// Trigger: pointer leaving toward the top of the viewport (classic desktop exit-intent) OR the tab being
// hidden. We do NOT hijack history/beforeunload (no scary native dialog). One-shot, then it disarms.
// ============================================================================================
function ExitNudge({ reduce, badgeLabel }: { reduce: boolean; badgeLabel: string | null }) {
  const [show, setShow] = useState(false);
  const armedRef = useRef(true);

  useEffect(() => {
    if (exitNudgeAlreadyShown()) return; // already fired this session — never nag again.

    const fire = () => {
      if (!armedRef.current || exitNudgeAlreadyShown()) return;
      armedRef.current = false;
      markExitNudgeShown();
      setShow(true);
    };

    // Desktop exit-intent: the pointer leaves through the top edge of the window.
    const onMouseOut = (e: MouseEvent) => {
      if (e.clientY <= 0 && !e.relatedTarget) fire();
    };
    // Mobile / tab-switch proxy: the page becomes hidden. Gentle, not a native popup.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') fire();
    };

    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="tm-exit-nudge"
          role="dialog"
          aria-label="Save your taste progress"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
          transition={reduce ? { duration: 0 } : SPRING}
        >
          <div className="tm-exit-nudge-body">
            <p className="tm-exit-nudge-copy">
              {badgeLabel ? (
                <>
                  Your <strong>{badgeLabel}</strong> &amp; Taste Rank are saved on this device — log in
                  to keep them everywhere.
                </>
              ) : (
                <>
                  Your Taste Rank is saved on this device — log in to keep it everywhere.
                </>
              )}
            </p>
            <button
              type="button"
              className="tm-exit-nudge-close"
              onClick={() => setShow(false)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
          <div className="tm-exit-nudge-actions">
            <a className="btn btn-primary tm-exit-nudge-cta" href="?taste-match#claim">
              Log in to keep them
            </a>
            <button type="button" className="tm-exit-nudge-skip" onClick={() => setShow(false)}>
              Not now
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── 3C accordion row — a collapsible disclosure. defaultOpen pre-expands "picks by origin" so the reveal
// isn't a wall of closed rows. Pure CSS height via a conditional render; the chevron flips +/−. Keyboard-
// operable (real <button> header, aria-expanded). No motion-value transforms → inert under reduced-motion.
function AccRow({
  icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={'tm-acc-row' + (open ? ' is-open' : '')}>
      <button
        type="button"
        className="tm-acc-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="tm-acc-title">
          <span className="tm-acc-icon" aria-hidden="true">
            {icon}
          </span>
          {title}
        </span>
        <span className="tm-acc-chev" aria-hidden="true">
          {open ? '–' : '+'}
        </span>
      </button>
      {open && <div className="tm-acc-body">{children}</div>}
    </div>
  );
}

// ============================================================================================
// SURFACE 1 — TASTE RANK = 1B "Drawn fruit-mascot". A CSS/SVG-drawn orange character (face + leaf + a
// per-tier accessory) that EVOLVES SLOWLY across plays. The tier comes from the localStorage XP curve
// (tasteXp.ts: 0/120/360/900/2000). Cosmetic evolution only — sprout 🌱 → … → taste-master 👑 — via the
// `is-t{n}` class (expression/accessory/aura swap) so each tier visibly looks "fitter," never a sugar-rush.
// The gradient XP bar fills the current tier BAND; "X XP from <next>" is honest (peekTier()'s xpToNext).
// No motion-value transforms — a CSS-only idle bob gated under the @media reduce layer + the JS `reduce`
// flag (we drop the bob class entirely when reduce is on; two-layer kill-switch).
// ============================================================================================
function TasteRankMascot({ tier, reduce }: { tier: XpAward | ReturnType<typeof peekTier>; reduce: boolean }) {
  const idx = TIERS.findIndex((t) => t.id === tier.tier.id);
  const lvl = idx + 1; // Lvl 1..5
  const pct = Math.round(tier.fraction * 100);
  return (
    <div className="tm-rank">
      <div className="tm-rank-stage">
        <div
          className={
            'tm-mascot is-t' + lvl + (reduce ? '' : ' tm-mascot-bob')
          }
          aria-hidden="true"
        >
          {/* per-tier AURA ring behind the body (brightens with tier) */}
          <span className="tm-mascot-aura" />
          {/* the orange body */}
          <span className="tm-mascot-body" />
          {/* leaf sprig */}
          <span className="tm-mascot-leaf" />
          {/* face */}
          <span className="tm-mascot-eye tm-mascot-eye-l" />
          <span className="tm-mascot-eye tm-mascot-eye-r" />
          <span className="tm-mascot-mouth" />
          {/* per-tier ACCESSORY (emoji) — none / fork / chef-hat / top-hat / crown */}
          <span className="tm-mascot-acc">{TIERS[idx].emoji}</span>
        </div>
      </div>
      <div className="tm-rank-name">
        {tier.tier.name} <span>· Lvl {lvl}</span>
      </div>
      <div className="tm-rank-band" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="tm-rank-xp">
        {tier.next
          ? `${tier.xpToNext} XP from ${tier.next.name}`
          : 'Top tier reached — Taste Master 👑'}
      </p>
    </div>
  );
}

// ============================================================================================
// SURFACE 2 — FRUIT PASSPORT = 2A "Literal India silhouette + glowing region pins". A production
// Natural-Earth India outline (viewBox 0 0 604 611, CC0 / public-domain; see INDIA_PATH below) with 6
// region pins. State of each pin from the passport: DISCOVERED (≥1 fruit → marigold glow), REGION-COMPLETE
// (all the region's fruits → litchi ring), LOCKED (none → dim). Multi-fruit regions (Maharashtra/Gujarat)
// show a count badge. The bar + "N of 14 fruits collected" mirror the passport progress. No motion-value
// transforms — a CSS pulse on discovered pins, gated under reduce (the class is dropped when reduce is on).
// ============================================================================================

// Natural-Earth-derived (CC0) India mainland outline, simplified to 200 points, projected into the
// viewBox below. NOT survey-grade / NOT a political map — a decorative provenance silhouette only.
const INDIA_VIEWBOX = '0 0 604 611';
const INDIA_PATH =
  'M2,259.8 L13.5,257.4 L14.7,249.7 L35.7,253 L61.2,247.8 L53.1,219.7 L41.8,214.3 L42.8,201.1 L29.6,195.9 L30.2,187.5 L48,167.5 L56.2,174.5 L78.2,168.9 L87.9,151.4 L99.5,145.3 L109.3,125.2 L118.1,121.7 L119.9,114.1 L135,100.8 L133.4,83.5 L149.3,74.7 L136.1,68.5 L135.7,62.7 L129.3,62.4 L122.1,53.1 L125.1,46.1 L121.5,41.3 L127.2,36.3 L120,33.5 L117.8,26.8 L121.2,20.7 L128.2,18.2 L157.2,24 L175.4,18.8 L200.2,2 L205.2,2.4 L211,21.7 L224.2,28.4 L219.2,34.8 L229.4,68.3 L223.2,71.5 L218.7,66.2 L212.3,67.9 L219.4,80.4 L219.6,94.4 L227.1,92.7 L235,101.7 L248.5,106.2 L249.4,111.2 L266.2,120.1 L253.7,129.7 L246.9,149.7 L301.7,178.7 L313.1,182 L329.6,179.3 L353.2,195.7 L360,193.7 L364.6,199 L409.9,203.9 L413.3,196.3 L409.7,187.2 L412.9,169.2 L426.5,167.9 L428.3,183.2 L425.2,186.3 L433.6,194.3 L492.2,193.4 L494,183.8 L483.9,177.8 L484.7,173.4 L503.5,170.7 L518,154.1 L528.5,151.9 L546.2,139 L562,145.1 L575.3,136 L581.9,140.4 L577.4,147.6 L583.5,144.8 L586.5,151.1 L580.3,158.9 L601.7,163.2 L602,169.4 L592.6,177.2 L597.2,187.6 L589.6,182.9 L578.5,184.4 L556.6,199.1 L556.7,211.4 L545.3,227.4 L548,233.4 L536,259.4 L519.5,255.2 L520.4,275.9 L516.2,278.1 L515.9,295.8 L511,301.2 L507.1,298 L504.1,301.4 L497.3,263.7 L490.8,263.6 L484.4,279.3 L480.7,274.4 L478.2,276.5 L475.1,265.9 L479.2,254.6 L489.7,252.3 L497,237.1 L501.9,235.7 L493.3,230.7 L447.7,228 L444.4,207.6 L438.2,212.2 L430.9,203.3 L427,206.8 L417.6,199.9 L419,204.2 L411.7,214.8 L429.6,228.8 L419.4,230.3 L410.5,242.7 L424.9,250.6 L421.7,263.9 L429.1,274.7 L431.6,308.6 L427.6,306.6 L425.3,310.2 L423.2,298.2 L422,308.5 L412.5,309 L414,297.9 L408.8,292.7 L413.3,298.3 L408.9,304.8 L386.5,317.9 L388.9,329.7 L384.3,338.3 L373.3,347.6 L353.4,350.6 L352,354.2 L357.4,353.5 L329.9,383.1 L294,409.6 L291.9,421.5 L271.9,426.4 L265.6,439.2 L258.7,436.2 L251.5,440.3 L246.5,454.4 L251.7,489.6 L248.6,484.5 L246.7,486.9 L252.5,492.3 L239.1,537.7 L242.3,540.3 L242.1,559.6 L231.3,561.1 L223.6,576.4 L225.3,581.5 L233.3,584.7 L213,586.6 L205.5,602.6 L194.4,609.3 L174.5,591.1 L170.3,568.5 L141.5,510 L129.9,467.2 L108.4,423.7 L98.9,375.3 L101.6,366.9 L97.4,365.6 L97.6,360.8 L101.2,361.3 L97.1,359.4 L94.6,349 L99.3,330.4 L93.5,312.9 L103.8,306.5 L92.1,307.7 L95.3,301.6 L91.6,301.5 L92.3,297.4 L97.5,295.8 L84.6,295 L86.5,299 L81.6,304.9 L86.1,311.3 L81.2,319.7 L60.8,328.9 L49.7,326.6 L18.6,294.5 L43.4,288.3 L49.8,276.8 L32.8,284.1 L24,282.2 L11.8,274.6 L7.2,266.1 L14.6,259.9 L3.4,265.6 L2,259.8Z';

// Region pins in the SAME viewBox units (geographically placed — see fe-design sourcing note).
const REGION_PINS: { region: string; x: number; y: number }[] = [
  { region: 'Gujarat', x: 60.3, y: 305.4 },
  { region: 'Maharashtra', x: 134.4, y: 367.4 },
  { region: 'Uttar Pradesh', x: 282.5, y: 225.6 },
  { region: 'Bihar', x: 356.5, y: 214.6 },
  { region: 'Karnataka', x: 157.0, y: 513.6 },
  { region: 'Kerala', x: 173.4, y: 566.8 },
];

function FruitPassportMap({
  passport,
  reduce,
}: {
  passport: PassportUpdate | ReturnType<typeof peekPassport>;
  reduce: boolean;
}) {
  // Per-region tallies from the discovered set: got = discovered fruits in that region, total = all the
  // collectibles whose REGION_OF maps there. done = region complete (every fruit found).
  const tally = useMemo(() => {
    const got: Record<string, number> = {};
    const total: Record<string, number> = {};
    for (const region of Object.values(REGION_OF)) {
      total[region] = (total[region] ?? 0) + 1;
    }
    for (const slug of passport.discovered) {
      const region = REGION_OF[slug];
      if (region) got[region] = (got[region] ?? 0) + 1;
    }
    return { got, total };
  }, [passport.discovered]);

  const fruitPct = passport.fruitsTotal > 0 ? (passport.fruitsCount / passport.fruitsTotal) * 100 : 0;

  return (
    <div className="tm-passport">
      <div className="tm-map-wrap">
        <svg
          viewBox={INDIA_VIEWBOX}
          className={'tm-map' + (reduce ? '' : ' tm-map-live')}
          role="img"
          aria-label={`India fruit passport — ${passport.regionsCount} of ${passport.regionsTotal} regions lit, ${passport.fruitsCount} of ${passport.fruitsTotal} fruits collected`}
        >
          <path className="tm-map-land" d={INDIA_PATH} />
          {REGION_PINS.map((p) => {
            const got = tally.got[p.region] ?? 0;
            const total = tally.total[p.region] ?? 0;
            const done = total > 0 && got >= total;
            const state = got > 0 ? (done ? 'done' : 'on') : 'off';
            const multi = total > 1;
            return (
              <g key={p.region} className={'tm-pin is-' + state}>
                {done && <circle className="tm-pin-ring" cx={p.x} cy={p.y} r={14} />}
                <circle className="tm-pin-dot" cx={p.x} cy={p.y} r={got > 0 ? 9 : 6} />
                {multi && got > 0 && (
                  <text className="tm-pin-num" x={p.x} y={p.y + 4} textAnchor="middle">
                    {got}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="tm-map-legend">
        <span>
          <i className="tm-leg tm-leg-on" /> Discovered
        </span>
        <span>
          <i className="tm-leg tm-leg-done" /> Region complete
        </span>
        <span>
          <i className="tm-leg tm-leg-off" /> Locked
        </span>
      </div>
      <div className="tm-map-bar" aria-hidden="true">
        <span style={{ width: `${fruitPct}%` }} />
      </div>
      <p className="tm-map-prog">
        {passport.fruitsCount} of {passport.fruitsTotal} fruits collected
      </p>
    </div>
  );
}

// #4 — phrase the streak result honestly from recordRun()'s flags. advanced → celebrate + come-back hook;
// sameDay → reassure the streak is safe; reset → welcome back, fresh day-1.
function streakCopy(s: StreakUpdate): string {
  if (s.sameDay) {
    return `You’ve already played today — your ${s.count}-day streak is safe. New drop tomorrow.`;
  }
  if (s.reset) {
    return 'Welcome back! Fresh streak: day 1. A new drop every day.';
  }
  // advanced (including first-ever run)
  return `🔥 ${s.count}-day taste streak — come back tomorrow for a new drop.`;
}

// #1 — the match number COUNTS UP from 0 → target on reveal (the slot-machine "how well do I match" beat).
// Reduce-motion: render the final number immediately, no animation. (Renamed from V4's RarityCountUp;
// reuses the .tm-match-num styling idiom — formerly .tm-rarity-num.)
function MatchCountUp({ reduce, target }: { reduce: boolean; target: number }) {
  const [val, setVal] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) {
      setVal(target);
      return;
    }
    const controls = animate(0, target, {
      duration: 1.1,
      delay: 0.35,
      ease: [0.16, 1, 0.3, 1], // easeOutExpo-ish — fast then settle, the satisfying climb
      onUpdate: (v) => setVal(Math.round(v)),
    });
    return () => controls.stop();
  }, [reduce, target]);
  return <strong className="tm-match-num">{val}%</strong>;
}

// The visual face of the share card — reused on-screen AND inside the off-screen 9:16 capture node, so
// the downloaded PNG looks exactly like what the player sees. Honey persona = demand flavor only.
// `shareLine` overrides persona.shareLine with the COMPOSED, player-specific line (#5) when provided.
// #1: the top badge shows the HONEST "{matchPct}% {persona.title}" — NO fabricated population stat.
function ShareCardFace({
  persona,
  matchPct,
  big = false,
  shareLine,
}: {
  persona: TastePersona;
  matchPct: number;
  big?: boolean;
  shareLine?: string;
}) {
  const [failed, setFailed] = useState(false);
  const cls = 'tm-sharecard' + (big ? ' tm-sharecard-big' : '');
  return (
    <div className={cls}>
      {failed || !persona.imageUrl ? (
        <div className="tm-card-emoji-bg" aria-hidden="true">
          <span>✦</span>
        </div>
      ) : (
        <img
          className="tm-sharecard-photo"
          src={persona.imageUrl}
          alt=""
          draggable={false}
          crossOrigin="anonymous"
          onError={() => setFailed(true)}
        />
      )}
      <div className="tm-sharecard-grade" aria-hidden="true" />
      <div className="tm-sharecard-scrim" />
      <div className="tm-sharecard-rare">{matchPct}% {persona.title}</div>
      <div className="tm-sharecard-mid">
        <span className="tm-sharecard-kicker">Your fruit persona</span>
        <h3 className="tm-sharecard-name">{persona.name}</h3>
        <p className="tm-sharecard-blurb">{persona.blurb}</p>
      </div>
      <div className="tm-sharecard-foot">
        <span className="tm-sharecard-wordmark">MaLLADE</span>
        <span className="tm-sharecard-cta">{shareLine ?? persona.shareLine}</span>
      </div>
    </div>
  );
}

// "Share your fruit persona" — renders the OFF-SCREEN 9:16 node to a PNG (html-to-image), then:
//  1) native FILE share via navigator.share({ files }) when canShare({ files }) is supported,
//  2) else a download <a download> from the data URL + the existing text navigator.share / clipboard.
// All local; no backend. This is the distribution lever.
function ShareButton({
  persona,
  matchPct,
  shareLine,
}: {
  persona: TastePersona;
  matchPct: number;
  shareLine?: string;
}) {
  const captureRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<'idle' | 'working' | 'shared' | 'downloaded' | 'copied'>('idle');
  // #5 — the share TEXT also uses the composed, player-specific line when available; the fallback quotes
  // the HONEST match % (never a fabricated population stat).
  const text = shareLine
    ? `${shareLine} (I'm ${matchPct}% ${persona.name} on MaLLADE Taste Match.)`
    : `I'm ${matchPct}% ${persona.name} on MaLLADE Taste Match. What fruit are you?`;

  async function renderPng(): Promise<{ blob: Blob; dataUrl: string } | null> {
    const node = captureRef.current;
    if (!node) return null;
    // pixelRatio 1 (the node is already 1080×1920) — crisp 9:16 regardless of viewport.
    const dataUrl = await toPng(node, { pixelRatio: 1, cacheBust: true, width: 1080, height: 1920 });
    const blob = await (await fetch(dataUrl)).blob();
    return { blob, dataUrl };
  }

  function download(dataUrl: string) {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `mallade-taste-match-${persona.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleShare() {
    setStatus('working');
    try {
      const out = await renderPng();
      if (!out) {
        setStatus('idle');
        return;
      }
      const { blob, dataUrl } = out;
      const file = new File([blob], `mallade-taste-match-${persona.id}.png`, { type: 'image/png' });

      // 1) Native FILE share (the real viral loop) — feature-detect canShare({ files }).
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean;
      };
      if (nav.canShare?.({ files: [file] }) && typeof nav.share === 'function') {
        try {
          await nav.share({ files: [file], title: 'MaLLADE Taste Match', text });
          setStatus('shared');
          return;
        } catch {
          /* user dismissed — fall through to download */
        }
      }

      // 2) Fallback: download the PNG, then best-effort text share / clipboard.
      download(dataUrl);
      if (typeof nav.share === 'function') {
        try {
          await nav.share({ title: 'MaLLADE Taste Match', text });
        } catch {
          /* dismissed */
        }
      } else {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          /* clipboard blocked */
        }
      }
      setStatus('downloaded');
    } catch {
      // Capture failed (e.g. tainted canvas) — fall back to text share / clipboard only.
      try {
        if (typeof navigator.share === 'function') {
          await navigator.share({ title: 'MaLLADE Taste Match', text });
          setStatus('shared');
        } else {
          await navigator.clipboard.writeText(text);
          setStatus('copied');
        }
      } catch {
        setStatus('idle');
      }
    }
    window.setTimeout(() => setStatus('idle'), 2400);
  }

  const label =
    status === 'working'
      ? 'Building your card…'
      : status === 'shared'
        ? '✓ Shared'
        : status === 'downloaded'
          ? '✓ Saved — now post it'
          : status === 'copied'
            ? '✓ Copied'
            : '↗ Share your persona card';

  return (
    <>
      <button
        type="button"
        className="btn btn-primary tm-share"
        onClick={handleShare}
        disabled={status === 'working'}
      >
        {label}
      </button>

      {/* OFF-SCREEN 9:16 capture node — fixed 1080×1920 so the PNG is crisp regardless of viewport.
          Positioned far off-screen (not display:none, which would zero its layout for html-to-image). */}
      <div className="tm-capture-stage" aria-hidden="true">
        <div className="tm-capture-node" ref={captureRef}>
          <ShareCardFace persona={persona} matchPct={matchPct} big shareLine={shareLine} />
        </div>
      </div>
    </>
  );
}

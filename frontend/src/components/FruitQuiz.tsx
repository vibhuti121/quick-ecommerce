import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion, type Variants, type MotionProps } from 'motion/react';
import type { QuizFruit } from '../lib/quizFruits';
import {
  FRUIT_NUGGETS,
  VIBE_QUESTION,
  resolvePersona,
  type Persona,
  type VibeLean,
} from '../lib/quizContent';
import NotifyForm from './NotifyForm';

// "Find your MaLLADE match" — the Phase-0 waitlist centerpiece. A HYBRID (Decisions Log 2026-06-13):
//  - BACKBONE: a tap-to-collect fruit GRID — every card is a real <button aria-pressed> toggling into
//    a running basket (mobile-first 2-col / 3-col ≥640px), with a sticky aria-live basket chip.
//  - SOUL: on first-select of a fruit, an inline "vs your usual" NUGGET reveals (role="status") —
//    taste/rarity LEAD + provenance chips + an optional CITED nutrition line (compliance-gated).
//  - FLOURISH: after one "vibe" question, a persona RESULT card reveals with native share + retake,
//    then the EXISTING NotifyForm captures the launch list. NO drag/gesture layer — reveal motion only.
//
// NO money, NO cart, NO checkout. Honey is selectable purely as a DEMAND SIGNAL: a honey pick rides
// the SAME single notify POST (the backend fans out a topic='honey' row from fruits[]), never a cart
// add — so the honey-not-buyable (§4) and checkout (§4b) invariants are untouched by this whole path.
//
// CONTENT is data-driven (lib/quizContent.ts) — signed-off copy swaps as a data-only edit.

type Step = 'grid' | 'vibe' | 'result';

interface FruitQuizProps {
  // Derived from the live catalogue by the parent (deriveQuizFruitsOrFallback). Honey options carry
  // isComingSoon:true + HONEY_IMAGE so the demand-signal routing holds even on the fallback set.
  fruits: QuizFruit[];
  // ONE notify call, server-side fan-out. The parent owns persistence (saveNotify mirror + best-effort
  // notify('quiz', …, { name, source:'quiz', fruits })) so this component stays presentation-only.
  onSubmit: (
    name: string,
    phone: string,
    email: string | undefined,
    pincode: string,
    city: string,
    state: string,
    fruits: string[],
  ) => void;
}

// §3 house spring — feed identity transforms when reduce-motion is on (CSS media query alone can't
// stop motion-value inline transforms, so this JS gate is mandatory, not redundant).
const SPRING = { type: 'spring', stiffness: 260, damping: 26 } as const;

// Reveal variants for the nugget + result card (rise from y:24, opacity:0; stagger children 0.12).
const riseVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: SPRING },
  exit: { opacity: 0, y: 12, transition: { duration: 0.18 } },
};
const resultVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

export default function FruitQuiz({ fruits, onSubmit }: FruitQuizProps) {
  const reduce = useReducedMotion();

  const [step, setStep] = useState<Step>('grid');
  // The running basket — ordered set of picked fruit slugs (first-pick order preserved for "strongest").
  const [picks, setPicks] = useState<string[]>([]);
  const [vibe, setVibe] = useState<VibeLean | null>(null);

  const pickedSet = useMemo(() => new Set(picks), [picks]);
  const pickedFruits = useMemo(
    () => picks.map((slug) => fruits.find((f) => f.slug === slug)).filter((f): f is QuizFruit => !!f),
    [picks, fruits],
  );

  // The strongest fruit lean = the FIRST non-honey pick (honey is the demand-signal path, resolved
  // separately in resolvePersona). If the only picks are honey, strongest stays honey → Forest Wanderer.
  const strongestSlug = useMemo(() => {
    const firstFruit = picks.find((s) => s !== 'honey');
    return firstFruit ?? picks[0] ?? null;
  }, [picks]);

  function toggle(slug: string) {
    setPicks((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }

  const persona: Persona = useMemo(
    () => resolvePersona(strongestSlug, vibe),
    [strongestSlug, vibe],
  );

  // Whether the result routes to the honey demand list (Forest Wanderer / a honey pick). Drives the
  // ribbon wash + a small honest line; honey is NEVER buyable, this is interest only.
  const honeyLean = persona.id === 'forest-wanderer' || pickedSet.has('honey');

  // Static/animated prop helpers — when reduce-motion is on, render finished state with no transition.
  // Typed as MotionProps so spreading onto motion.* elements narrows cleanly under strict TS.
  const reveal = (): MotionProps =>
    reduce
      ? { initial: false }
      : { variants: riseVariants, initial: 'hidden', animate: 'show', exit: 'exit' };

  return (
    <section className="fruit-quiz" aria-labelledby="fruit-quiz-title">
      <div className="fruit-quiz-inner">
        <header className="fruit-quiz-head">
          <span className="fruit-quiz-eyebrow">Phase 0 · No checkout</span>
          <h2 id="fruit-quiz-title" className="display-2 fruit-quiz-title">
            Find your MaLLADE match
          </h2>
          <p className="fruit-quiz-lede">
            Tap the fruit you love. We&apos;ll show you what makes ours different — then save you a
            spot for the first drop.
          </p>
        </header>

        {/* ---- STEP 1: grid select + inline nugget reveals ---- */}
        {step === 'grid' && (
          <div className="fruit-quiz-step">
            <div className="fruit-quiz-grid" role="group" aria-label="Choose the fruit you love">
              {fruits.map((fruit) => {
                const selected = pickedSet.has(fruit.slug);
                const nugget = FRUIT_NUGGETS[fruit.slug];
                // Honey card accessible name spells out coming-soon + the notify intent (a11y spec).
                const accessibleName = fruit.isComingSoon
                  ? `${fruit.label} — coming soon, join the notify list`
                  : fruit.label;
                return (
                  <div className="fruit-quiz-cell" key={fruit.slug}>
                    <motion.button
                      type="button"
                      className={
                        'fruit-quiz-card' +
                        (selected ? ' is-selected' : '') +
                        (fruit.isComingSoon ? ' is-honey' : '')
                      }
                      aria-pressed={selected}
                      aria-label={accessibleName}
                      onClick={() => toggle(fruit.slug)}
                      whileTap={reduce ? undefined : { scale: 0.96 }}
                    >
                      {fruit.imageUrl ? (
                        <img
                          className="fruit-quiz-card-img"
                          src={fruit.imageUrl}
                          alt=""
                          loading="lazy"
                          aria-hidden="true"
                        />
                      ) : (
                        <span className="fruit-quiz-card-emoji" aria-hidden="true">
                          🍃
                        </span>
                      )}
                      <span className="fruit-quiz-card-label">{fruit.label}</span>
                      {fruit.isComingSoon && (
                        <span className="fruit-quiz-card-badge">Coming Soon</span>
                      )}
                      {/* Checkmark scales in on select (gated by reduce-motion). */}
                      <AnimatePresence>
                        {selected && (
                          <motion.span
                            className="fruit-quiz-card-check"
                            aria-hidden="true"
                            initial={reduce ? false : { scale: 0 }}
                            animate={reduce ? undefined : { scale: 1 }}
                            exit={reduce ? undefined : { scale: 0 }}
                            transition={SPRING}
                          >
                            ✓
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>

                    {/* SOUL: inline "vs your usual" nugget — revealed only while this fruit is picked. */}
                    <AnimatePresence initial={false}>
                      {selected && nugget && (
                        <motion.div
                          className={'fruit-quiz-nugget' + (fruit.slug === 'litchi' ? ' is-litchi' : '')}
                          role="status"
                          {...reveal()}
                        >
                          <p className="fruit-quiz-nugget-lead">{nugget.tasteRarity}</p>
                          {nugget.provenanceChips.length > 0 && (
                            <ul className="fruit-quiz-chips" aria-label="Provenance">
                              {nugget.provenanceChips.map((chip) => (
                                <li className="fruit-quiz-chip" key={chip}>
                                  {chip}
                                </li>
                              ))}
                            </ul>
                          )}
                          {/* Nutrition ONLY ever rendered with its cited source (compliance). */}
                          {nugget.nutrition && nugget.nutritionSource && (
                            <p className="fruit-quiz-nutrition">
                              {nugget.nutrition}{' '}
                              <span className="fruit-quiz-source">Source: {nugget.nutritionSource}</span>
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* Sticky running-basket chip — aria-live so picks are announced. */}
            <div className="fruit-quiz-basket" aria-live="polite">
              <span className="fruit-quiz-basket-label">
                {picks.length === 0
                  ? 'Your basket is empty — tap a fruit to start'
                  : `In your basket: ${pickedFruits.map((f) => f.label).join(', ')}`}
              </span>
              <button
                type="button"
                className="btn btn-primary fruit-quiz-next"
                onClick={() => setStep('vibe')}
                disabled={picks.length === 0}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ---- STEP 2: one vibe question (real radios in fieldset/legend) ---- */}
        {step === 'vibe' && (
          <motion.div className="fruit-quiz-step" {...reveal()}>
            <fieldset className="fruit-quiz-fieldset">
              <legend className="fruit-quiz-legend">{VIBE_QUESTION.prompt}</legend>
              <div className="fruit-quiz-options">
                {VIBE_QUESTION.options.map((opt) => (
                  <label
                    key={opt.id}
                    className={'fruit-quiz-option' + (vibe === opt.lean ? ' is-selected' : '')}
                  >
                    <input
                      type="radio"
                      name="vibe"
                      value={opt.id}
                      checked={vibe === opt.lean}
                      onChange={() => setVibe(opt.lean)}
                    />
                    <span className="fruit-quiz-option-label">{opt.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="fruit-quiz-navrow">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep('grid')}
              >
                ← Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStep('result')}
                disabled={vibe === null}
              >
                See my match →
              </button>
            </div>
          </motion.div>
        )}

        {/* ---- STEP 3: persona result + native share + the EXISTING NotifyForm ---- */}
        {step === 'result' && (
          <motion.div
            className={'fruit-quiz-result' + (honeyLean ? ' is-honey' : '')}
            {...((reduce
              ? { initial: false }
              : { variants: resultVariants, initial: 'hidden', animate: 'show' }) as MotionProps)}
          >
            <motion.span className="fruit-quiz-result-eyebrow" {...reveal()}>
              Your match
            </motion.span>
            <motion.h3 className="display-3 fruit-quiz-result-name" {...reveal()}>
              {persona.name}
            </motion.h3>
            <motion.p className="fruit-quiz-result-blurb" {...reveal()}>
              {persona.blurb}
            </motion.p>

            {honeyLean && (
              <motion.p className="fruit-quiz-result-note" {...reveal()}>
                Honey isn&apos;t for sale yet — join below and you&apos;ll be first to know when the
                first drop lands.
              </motion.p>
            )}

            <ShareRow persona={persona} {...reveal()} />

            <motion.div className="fruit-quiz-result-form" {...reveal()}>
              <p className="fruit-quiz-result-cta">
                Save your spot for the first drop
              </p>
              <NotifyForm
                collectName
                // honey callers ignore this; the quiz captures name + fans out via the parent.
                onNotify={() => {}}
                onNotifyWithName={(name, phone, email, pincode, city, state) =>
                  onSubmit(name, phone, email, pincode, city, state, picks)
                }
              />
            </motion.div>

            <button
              type="button"
              className="fruit-quiz-retake"
              onClick={() => {
                setPicks([]);
                setVibe(null);
                setStep('grid');
              }}
            >
              ↺ Retake
            </button>
          </motion.div>
        )}
      </div>
    </section>
  );
}

// Native share (navigator.share) with a copy-link fallback. Pure presentation — the share text names
// the persona; the link is the current storefront URL (the quiz is a homepage section, no router).
function ShareRow({
  persona,
  ...motionProps
}: { persona: Persona } & MotionProps) {
  const [copied, setCopied] = useState(false);
  const shareText = `My MaLLADE match is ${persona.name}. Find yours →`;
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  async function handleShare() {
    // navigator.share is the native sheet on supporting (mostly mobile) browsers; fall back to
    // clipboard everywhere else so the action always does SOMETHING useful.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'Find your MaLLADE match', text: shareText, url: shareUrl });
        return;
      } catch {
        /* user dismissed the sheet, or share failed — fall through to copy */
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked (insecure context / permissions) — nothing more we can safely do */
    }
  }

  return (
    <motion.div className="fruit-quiz-share" {...motionProps}>
      <button type="button" className="btn btn-secondary fruit-quiz-share-btn" onClick={handleShare}>
        {copied ? '✓ Link copied' : '↗ Share my match'}
      </button>
    </motion.div>
  );
}

import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { HONEY_IMAGE, HONEY_LAUNCH_DATE } from '../lib/comingSoon';
import NotifyForm from './NotifyForm';

interface HoneyTeaserProps {
  // Persist interest for the 'honey' launch list. Phone required & validated; email optional; pincode
  // + auto-filled-editable city/state for the serviceability pilot. The parent owns the topic
  // ('honey') so card + carousel + this section all dedupe into one list.
  onNotify: (
    phone: string,
    email: string | undefined,
    pincode: string,
    city: string,
    state: string,
  ) => void;
}

// The hero hook: a full-width scrollytelling section that builds desire for the not-yet-launched
// litchi-honey. The real MaLLADE jar (HONEY_IMAGE — never a placeholder) scales + rises as the
// section scrolls through the viewport, over a honeycomb backdrop, with the shared NotifyForm
// capturing the launch list. Honey is NEVER buyable here — this only collects interest.
export default function HoneyTeaser({ onNotify }: HoneyTeaserProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);

  // Scroll-linked reveal: track this section crossing the viewport (enter bottom → leave top) and
  // map that 0→1 progress onto the jar's scale + lift + opacity. Gated by reduced-motion: when the
  // user opts out we feed static identity transforms so nothing animates.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const jarScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.82, 1, 1.08]);
  const jarY = useTransform(scrollYProgress, [0, 0.5, 1], [60, 0, -40]);
  const jarOpacity = useTransform(scrollYProgress, [0, 0.25, 1], [0.4, 1, 1]);
  const jarStyle = reduce ? undefined : { scale: jarScale, y: jarY, opacity: jarOpacity };

  return (
    <section className="honey-teaser" id="honey-teaser" ref={ref} aria-label="Litchi honey — coming soon">
      {/* Decorative honeycomb wash — pure CSS, marked aria-hidden so it never reaches the a11y tree. */}
      <div className="honey-teaser-comb" aria-hidden="true" />

      <div className="honey-teaser-inner">
        <div className="honey-teaser-visual">
          <motion.img
            className="honey-teaser-jar"
            src={HONEY_IMAGE}
            alt="MaLLADE litchi honey jar"
            loading="lazy"
            style={jarStyle}
          />
          <span className="honey-teaser-tag">Coming Soon</span>
        </div>

        <div className="honey-teaser-copy">
          <span className="honey-teaser-eyebrow">The Drop · Batch 1</span>
          <h2 className="display-2 honey-teaser-title">
            The first drop is coming.{' '}
            <span className="honey-teaser-accent">Be first to taste it.</span>
          </h2>
          <p className="honey-teaser-lede">
            Single-origin litchi honey, pressed from hives set among the same GI-tagged Shahi litchi
            orchards — lab-tested for purity and bottled raw. Batch 1 is small, and it goes to the
            drop list first.
          </p>

          {/* Launch-date seam: HONEY_LAUNCH_DATE === null ⇒ the no-date "The Drop" copy (built).
              When an ISO date is set, flip to the countdown-clock path. */}
          {HONEY_LAUNCH_DATE !== null && (
            // TODO: full countdown-clock styling deferred (fe-lead follow-up)
            <p className="honey-teaser-countdown">Dropping {HONEY_LAUNCH_DATE}</p>
          )}

          <div className="honey-teaser-form">
            <NotifyForm onNotify={onNotify} />
          </div>
        </div>
      </div>
    </section>
  );
}

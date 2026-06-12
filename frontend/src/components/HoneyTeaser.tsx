import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { HONEY_IMAGE } from '../lib/comingSoon';
import NotifyForm from './NotifyForm';

interface HoneyTeaserProps {
  // Persist interest for the 'honey' launch list. Phone required & validated; email optional.
  // The parent owns the topic ('honey') so card + carousel + this section all dedupe into one list.
  onNotify: (phone: string, email?: string) => void;
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
          <span className="honey-teaser-eyebrow">The next harvest</span>
          <h2 className="display-2 honey-teaser-title">
            Litchi Honey, <span className="honey-teaser-accent">straight from the blossom</span>
          </h2>
          <p className="honey-teaser-lede">
            Pressed from hives set among the same GI-tagged Shahi litchi orchards — single-origin,
            lab-tested for purity, and bottled raw. We&apos;re finishing the last batch of testing.
            Be first in line when it drops.
          </p>
          <div className="honey-teaser-form">
            <NotifyForm onNotify={onNotify} />
          </div>
        </div>
      </div>
    </section>
  );
}

import { useRef } from 'react';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from 'motion/react';
import { HONEY_IMAGE } from '../lib/comingSoon';

interface HeroProps {
  // "Shop Litchi" — smooth-scrolls down to the product catalogue.
  onShopClick: () => void;
  // "Honey — coming soon" — jumps to the honey teaser (or opens the honey notify popup).
  onHoneyClick: () => void;
}

// The headline reads as a journey: litchi blossoms → hive-gold honey. Each word reveals on a
// staggered spring so the line "writes itself" on load — kinetic typography, not a static H1.
const HEADLINE = ['From', 'Litchi', 'Blossoms', 'to', 'Hive-Gold', 'Honey'];

const wordVariants: Variants = {
  hidden: { y: '110%' },
  show: (i: number) => ({
    y: '0%',
    transition: { delay: 0.15 + i * 0.07, type: 'spring', stiffness: 320, damping: 28 },
  }),
};

export default function Hero({ onShopClick, onHoneyClick }: HeroProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);

  // Scroll-linked parallax: as the hero scrolls out, its layers drift at different rates for depth.
  // Disabled wholesale under prefers-reduced-motion (the transforms collapse to 0).
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });
  const artY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 120]);
  const blobY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 60]);
  const copyY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -40]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, reduce ? 1 : 0]);

  return (
    <section className="hero-cinematic" ref={ref} aria-label="MaLLADE — litchi and honey">
      {/* Decorative drifting blobs — warm honey/litchi glows behind the copy. */}
      <motion.span className="hero-blob hero-blob--honey" style={{ y: blobY }} aria-hidden="true" />
      <motion.span className="hero-blob hero-blob--litchi" style={{ y: blobY }} aria-hidden="true" />

      <motion.div className="hero-copy" style={{ y: copyY, opacity: fade }}>
        <motion.span
          className="hero-eyebrow"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          🌸 GI-Tagged · Farmer-Direct · Muzaffarpur
        </motion.span>

        <h1 className="hero-headline display-1">
          {HEADLINE.map((word, i) => (
            <span className="hero-word-mask" key={word + i}>
              <motion.span
                className="hero-word"
                custom={i}
                variants={wordVariants}
                initial={reduce ? false : 'hidden'}
                animate="show"
              >
                {word}
                {i === 1 || i === 4 ? <span className="hero-word-spark" aria-hidden="true" /> : null}
              </motion.span>
            </span>
          ))}
        </h1>

        <motion.p
          className="hero-sub"
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.55 }}
        >
          Single-origin Shahi litchi, picked ripe and lab-tested — and the litchi-blossom honey
          the same orchards are about to give up. Real provenance, no middlemen.
        </motion.p>

        <motion.div
          className="hero-ctas"
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.5 }}
        >
          <button className="hero-cta hero-cta--primary" onClick={onShopClick}>
            Shop Litchi
            <span className="hero-cta-arrow" aria-hidden="true">→</span>
          </button>
          <button className="hero-cta hero-cta--ghost" onClick={onHoneyClick}>
            <span className="hero-cta-dot" aria-hidden="true" />
            Honey — coming soon
          </button>
        </motion.div>
      </motion.div>

      {/* The hero's visual anchor: the real honey jar, floating on a parallax layer. */}
      <motion.div className="hero-art" style={{ y: artY }} aria-hidden="true">
        <motion.div
          className="hero-jar"
          initial={reduce ? false : { opacity: 0, scale: 0.9, rotate: -4 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 120, damping: 18 }}
        >
          <img src={HONEY_IMAGE} alt="" loading="eager" />
          <span className="hero-jar-tag">Coming soon</span>
        </motion.div>
      </motion.div>

      <motion.button
        className="hero-scroll-cue"
        onClick={onShopClick}
        aria-label="Scroll to shop"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 0.6 }}
      >
        <span className="hero-scroll-text">Discover</span>
        <span className="hero-scroll-arrow" aria-hidden="true" />
      </motion.button>
    </section>
  );
}

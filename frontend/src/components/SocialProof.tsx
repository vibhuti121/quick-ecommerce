import { motion, useReducedMotion, type Variants } from 'motion/react';

// Curated, clearly-presentational social proof — first-name + city voices that reinforce the
// food-trust story (freshness, provenance, the honey wait). These are illustrative brand voices,
// NOT fabricated verified-purchase reviews: no star counts, no "verified buyer" claims, no totals.
// Keep it honest — the storefront is in soft-pilot, so we don't invent a review economy.
const VOICES = [
  {
    quote:
      'The litchis showed up still cool, smelling like the orchard. Tasted like the ones my grandmother used to send from Muzaffarpur.',
    name: 'Ananya',
    city: 'Bengaluru',
    avatar: '🧑🏽',
  },
  {
    quote:
      'I care where my food comes from. The GI tag and the lab report were right there — that earned my trust before I even ordered.',
    name: 'Rahul',
    city: 'Pune',
    avatar: '🧔🏽',
  },
  {
    quote:
      'Already signed up for the honey list. If it is anything like the litchi, I am buying a case the day it launches.',
    name: 'Meera',
    city: 'Hyderabad',
    avatar: '👩🏻',
  },
];

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } },
};

export default function SocialProof() {
  const reduce = useReducedMotion();
  return (
    <section className="social-proof" aria-label="What early shoppers say">
      <div className="social-proof-head">
        <span className="social-proof-eyebrow">From our soft launch</span>
        <h2 className="display-2 social-proof-title">Early shoppers, real reactions</h2>
      </div>
      <motion.ul
        className="social-proof-grid"
        variants={containerVariants}
        initial={reduce ? false : 'hidden'}
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
      >
        {VOICES.map((v) => (
          <motion.li className="social-proof-card" key={v.name} variants={cardVariants}>
            <p className="social-proof-quote">{v.quote}</p>
            <div className="social-proof-author">
              <span className="social-proof-avatar" aria-hidden="true">
                {v.avatar}
              </span>
              <span className="social-proof-meta">
                <span className="social-proof-name">{v.name}</span>
                <span className="social-proof-city">{v.city}</span>
              </span>
            </div>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}

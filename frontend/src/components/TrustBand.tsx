import { motion, useReducedMotion, type Variants } from 'motion/react';

// The three trust pillars MaLLADE actually stands on — GI provenance, lab testing, and a
// farmer-direct chain. Static curated copy (no fabricated stats); these reinforce food-trust,
// the one thing the Gen-Z motion must never undercut.
const PILLARS = [
  {
    icon: '📜',
    title: 'GI-Tagged',
    line: 'Certified Shahi litchi from Muzaffarpur — provenance you can trace to the orchard.',
  },
  {
    icon: '🔬',
    title: 'Lab-Tested',
    line: 'Every honey batch screened for purity & adulteration before it reaches your shelf.',
  },
  {
    icon: '🚜',
    title: 'Farmer-Direct',
    line: 'Bought straight from growers and beekeepers — no middlemen, fairer for both ends.',
  },
];

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 26 } },
};

export default function TrustBand() {
  const reduce = useReducedMotion();
  return (
    <section className="trust-band" aria-label="Why MaLLADE">
      <motion.ul
        className="trust-grid"
        variants={containerVariants}
        initial={reduce ? false : 'hidden'}
        whileInView="show"
        viewport={{ once: true, amount: 0.4 }}
      >
        {PILLARS.map((p) => (
          <motion.li className="trust-card" key={p.title} variants={itemVariants}>
            <span className="trust-icon" aria-hidden="true">
              {p.icon}
            </span>
            <div className="trust-text">
              <h3 className="trust-title">{p.title}</h3>
              <p className="trust-line">{p.line}</p>
            </div>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}

// Dev-only CONCRETE-SCENARIO test (run: npx tsx src/lib/__sim__/scenarioTest.ts).
// Excluded from prod tsc (tsconfig exclude: src/lib/__sim__). NOT committed unless asked.
//
// Purpose: the sim (scoreSim.ts) proves the engine over 200k RANDOM plays. THIS proves it on 3 NAMED,
// hand-built cases the founder can read line-by-line — single-axis (coherent), mixed (spread), and
// no-swipe (cold). It calls the REAL shipping functions (scorePersona + xpForRun), no re-implementation,
// so what prints here is exactly what the live game computes for these inputs.

import { scorePersona, COLLECTIBLE_SLUGS, AXES } from '../tasteMatch';
import { xpForRun } from '../tasteXp';

const fmt = (n: number, d = 2) => n.toFixed(d);

// On a FRESH device every collectible (fruit, not honey/ghee) WANT is a first-time discovery.
function discoveriesOf(wants: string[]): { newDiscoveries: number; repeatWants: number } {
  const newDiscoveries = wants.filter((s) => COLLECTIBLE_SLUGS.includes(s)).length;
  return { newDiscoveries, repeatWants: wants.length - newDiscoveries };
}

function report(title: string, wants: string[], skips: string[]) {
  const m = scorePersona(wants, skips);
  const { newDiscoveries, repeatWants } = discoveriesOf(wants);
  // First play of day on a fresh device: firstPlayToday=true, streakDay=false (no streak yet).
  const xp = xpForRun(newDiscoveries, repeatWants, false, true);

  const w = AXES.map((ax) => `${ax}=${fmt(m.demandWeights[ax])}`).join('  ');

  console.log(`\n━━ ${title} ━━`);
  console.log(`  wants: [${wants.join(', ') || '—'}]`);
  console.log(`  skips: [${skips.join(', ') || '—'}]`);
  console.log(`  → persona:        ${m.persona.name}`);
  console.log(`  → honest match%:  ${m.matchPct}`);
  console.log(`  → self-fit (A1):  ${m.selfFit === -1 ? 'n/a (no swipes)' : `${fmt(m.selfFit * 100, 0)}% over ${m.selfFitN} picks`}`);
  console.log(`  → confidence:     ${m.engineConfidence}  (posteriorStd=${fmt(m.posteriorStd, 3)})`);
  console.log(`  → demand weights: ${w}`);
  console.log(`  → winnerSlugs:    [${m.winnerSlugs.join(', ') || '—'}]  (demand signal — must be byte-for-byte the wants order)`);
  console.log(`  → XP this run:    ${xp}  (newDiscoveries=${newDiscoveries}×16 + base8 + firstPlay6)`);
}

console.log('=== Taste Match — concrete-scenario engine test (real shipping fns) ===');

// 1) SINGLE-AXIS / coherent palate: all three heritage-mango fruits WANT'd, the rest SKIP'd.
//    Expect: persona = a mango archetype, HIGH %, HIGH self-fit, heritage-mango weight dominant.
report(
  '1. SINGLE-AXIS (coherent mango lover)',
  ['alphonso-mango', 'gir-kesar-mango', 'bhagalpuri-zardalu-mango'],
  ['mangosteen', 'dragon-fruit', 'allahabad-surkha-guava'],
);

// 2) MIXED / spread palate: tropical + berry + exotic, one mango SKIP.
//    Expect: LOWER % (no single archetype dominates), demand spread across axes.
report(
  '2. MIXED (spread: tropical + berry + exotic)',
  ['shahi-litchi', 'mahabaleshwar-strawberry', 'mangosteen', 'dragon-fruit'],
  ['alphonso-mango'],
);

// 3) NO-SWIPE: nothing wanted, nothing skipped.
//    Expect: cold honest output — LOW confidence ("still learning"), % NOT inflated, XP = base+firstPlay only.
report('3. NO-SWIPE (cold start)', [], []);

// 3b) CONTRADICTORY swiper: wants AND skips the same axis — the "incoherent palate" case.
//     Expect: weak self-fit (model can't explain contradictory picks), honest low/medium confidence.
report(
  '3b. CONTRADICTORY (wants + skips same axes)',
  ['shahi-litchi', 'mangosteen'],
  ['nagpur-orange', 'dragon-fruit'],
);

console.log('\n=== done ===');

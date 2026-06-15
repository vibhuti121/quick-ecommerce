// Taste Match scoring — DEV-ONLY simulation + measurement harness (Phase 0 of the scoring redesign).
//
// Run it (no build needed; tsx transpiles on the fly):
//     cd frontend && npx tsx src/lib/__sim__/scoreSim.ts            # default N
//     cd frontend && npx tsx src/lib/__sim__/scoreSim.ts 500000     # more samples
//
// WHAT IT DOES (and why it exists)
// The founder's objection to the old plan was: "the algorithm logic i cannot see; how is it improving;
// how is accuracy included." This harness makes all three OBJECTIVE, not vibes:
//   1) It imports the REAL scoring internals from ../tasteMatch and measures the CURRENT match% on
//      ~N simulated-but-plausible swipe runs → PROVES the 88-98 inflation (the bug) with numbers.
//   2) It computes the NEW honest-% mechanism (mean-centred archetypes + margin + ECDF calibration) on the
//      same runs and reports the spread it produces (target p10≈55 / p90≈97) — the "how it improves" delta.
//   3) It carries the two accuracy quantities from the plan, as numbers, from Phase 0 onward:
//        A1 = predictive self-fit  (does the per-user ridge-logit model explain the player's OWN picks?)
//        A3 = sim recovery         (fit a known latent palate w* and measure how close ŵ lands — the only
//                                   OBJECTIVE "is it accurate?" test, because real users carry no ground truth)
//   4) It emits the MARGIN_KNOTS calibration lookup (101 percentiles) for Phase 1 to paste into tasteMatch.ts.
//
// It writes REPORT.md next to this file and prints the same summary to stdout. NOTHING here ships in the
// bundle — it's outside the app's import graph (only the app imports tasteMatch, never this file). The
// ridge-logit fit lives here for measurement now; Phase 2 ports the SAME math into tasteMatch.ts.
//
// Determinism: a seeded RNG (mulberry32 + Box-Muller), so REPORT.md is stable run-to-run for the same N.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  AXES,
  AXIS_OF,
  ARCHETYPES,
  scorePersona,
  buildDeck,
  DECK_SIZE,
  displayPct,
  playerVectorFrom,
  cosine,
  POOL,
  COLLECTIBLE_SLUGS,
  dailyDropFruit,
  uniformPersonaPrior,
  updatePersonaPosterior,
  nextEigCardIndex,
  type Axis,
} from '../tasteMatch';
import {
  xpForRun,
  TIERS,
  XP_BASE,
  DISCOVERY_PER_FRUIT,
  REPEAT_CAP,
  STREAK_BONUS,
  FIRST_PLAY_BONUS,
} from '../tasteXp';

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 0. Config + seeded randomness
// ────────────────────────────────────────────────────────────────────────────────────────────────────
const N = Number(process.argv[2] ?? 200_000); // baseline match%/persona sample size
const N_A1 = Math.min(N, 30_000); // A1 self-fit sample (each needs a per-run IRLS fit → keep modest)
const N_A1_LOO = Math.min(N, 4_000); // leave-one-out is N_A1×DECK_SIZE refits → smaller
const N_A3 = 20_000; // A3 synthetic-recovery players
const RIDGE_LAMBDA = 1.5; // ridge / Bayes-prior strength on the 6 weights (NOT the bias)

// A deterministic RNG so the report is reproducible. (This is a plain tsx script, not a Workflow — but a
// seeded RNG keeps REPORT.md diff-able across runs, which is the whole point of a measurement baseline.)
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xc0ffee);
function randn(): number {
  // Box-Muller off the seeded uniform stream.
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

const AXIS_LIST = AXES as readonly Axis[];
const D = AXIS_LIST.length; // 6
const AXIS_IDX: Record<string, number> = {};
AXIS_LIST.forEach((ax, i) => (AXIS_IDX[ax] = i));

// One-hot feature for a fruit slug (today's featureisation in tasteMatch). Unknown slug → zero vector.
function featureOf(slug: string): number[] {
  const x = new Array(D).fill(0);
  const ax = AXIS_OF[slug];
  if (ax != null) x[AXIS_IDX[ax]] = 1;
  return x;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 1. A plausible PLAYER MODEL (not coin-flips) — the latent palate w* that GENERATES swipes
// ────────────────────────────────────────────────────────────────────────────────────────────────────
// A real player isn't a uniform random swiper; they have tastes. We model a player as a latent weight
// vector w* over the 6 axes + a bias b* (overall want-rate). To look realistic we make a MIX:
//   • ~70% "decisive": a clear favourite axis (and often a disliked one) → coherent palate
//   • ~30% "wishy-washy": weak weights → near-coin-flip swiper (the honest hard case for any scorer)
// A swipe on a card is then a Bernoulli draw on σ(w*·x + b*). This is exactly the data-generating process
// the ridge-logit engine assumes — so A3 (below) can recover w* and we can measure how close it gets.
interface Latent {
  w: number[];
  b: number;
}
function sampleLatent(): Latent {
  const w = new Array(D).fill(0).map(() => randn() * 0.7); // mild baseline taste over every axis
  const decisive = rng() < 0.7;
  if (decisive) {
    const fav = Math.floor(rng() * D);
    w[fav] += 1.8 + rng() * 1.4; // a clear love
    if (rng() < 0.6) {
      let dis = Math.floor(rng() * D);
      if (dis === fav) dis = (dis + 1) % D;
      w[dis] -= 1.2 + rng() * 1.0; // a clear turn-off
    }
  }
  const b = -0.2 + randn() * 0.5; // centres the overall want-rate near ~45-55%
  return { w, b };
}

// Simulate ONE run: build a real session deck, draw WANT/SKIP per card from the latent palate.
interface Run {
  wants: string[];
  skips: string[];
  rows: { x: number[]; y: number }[];
}
function simulateRun(latent: Latent, deckSeed: number, nowDay: number): Run {
  const deck = buildDeck(deckSeed, nowDay);
  const wants: string[] = [];
  const skips: string[] = [];
  const rows: { x: number[]; y: number }[] = [];
  for (const card of deck) {
    const x = featureOf(card.slug);
    let z = latent.b;
    for (let j = 0; j < D; j++) z += latent.w[j] * x[j];
    const y = rng() < sigmoid(z) ? 1 : 0;
    if (y === 1) wants.push(card.slug);
    else skips.push(card.slug);
    rows.push({ x, y });
  }
  return { wants, skips, rows };
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 2. Linear algebra: solve a small symmetric SPD system (for the IRLS Newton step)
// ────────────────────────────────────────────────────────────────────────────────────────────────────
// Gaussian elimination with partial pivoting on an (n)×(n) system A w = g. n = 7 here (6 weights + bias).
function solve(A: number[][], g: number[]): number[] {
  const n = g.length;
  const M = A.map((row, i) => [...row, g[i]]); // augmented
  for (let col = 0; col < n; col++) {
    // pivot
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) continue; // singular-ish; leave (ridge keeps this rare)
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 3. THE NEW ENGINE — per-user ridge logistic regression (IRLS / Newton)  [Phase-2 math, measured here]
// ────────────────────────────────────────────────────────────────────────────────────────────────────
// Fit w∈ℝ⁶, b∈ℝ to the run's labelled rows by minimising
//     J = −Σ[ y ln p + (1−y) ln(1−p) ] + λ‖w‖²,   p = σ(w·x + b)
// Newton step:  θ ← θ + (XᵀSX + λI_reg)⁻¹ Xᵀ(y − p),   S = diag(p(1−p)),  ridge on w only (not bias).
interface Fit {
  w: number[];
  b: number;
}
function fitLogit(rows: { x: number[]; y: number }[], lambda = RIDGE_LAMBDA, iters = 8): Fit {
  const n = D + 1; // weights + bias
  const theta = new Array(n).fill(0); // [w0..w5, b]
  if (rows.length === 0) return { w: theta.slice(0, D), b: 0 };
  for (let it = 0; it < iters; it++) {
    // gradient g = Xᵀ(y−p) − λ·w_reg ; Hessian H = XᵀSX + λI_reg
    const g = new Array(n).fill(0);
    const H = Array.from({ length: n }, () => new Array(n).fill(0));
    for (const { x, y } of rows) {
      const xa = [...x, 1]; // augment with bias feature
      let z = 0;
      for (let j = 0; j < n; j++) z += theta[j] * xa[j];
      const p = sigmoid(z);
      const s = Math.max(p * (1 - p), 1e-6); // floor keeps S well-conditioned
      for (let a = 0; a < n; a++) {
        g[a] += (y - p) * xa[a];
        for (let bb = 0; bb < n; bb++) H[a][bb] += s * xa[a] * xa[bb];
      }
    }
    // ridge: penalise the 6 weights, not the bias
    for (let j = 0; j < D; j++) {
      g[j] -= lambda * theta[j];
      H[j][j] += lambda;
    }
    const step = solve(H, g);
    for (let j = 0; j < n; j++) theta[j] += step[j];
  }
  return { w: theta.slice(0, D), b: theta[D] };
}

function predict(fit: Fit, x: number[]): number {
  let z = fit.b;
  for (let j = 0; j < D; j++) z += fit.w[j] * x[j];
  return sigmoid(z);
}

// Laplace posterior: Σ = (XᵀSX + λI_reg)⁻¹ evaluated AT the fitted θ — free from the IRLS solve.
// We summarise the per-weight uncertainty as the RMS posterior std over the 6 weights: small → the data
// pinned the palate down (high confidence); large → few/contradictory swipes (still learning). This is the
// honest "are we sure yet" band; we measure its distribution here so the runtime can map it to high/med/low.
function posteriorStdOf(rows: { x: number[]; y: number }[], fit: Fit, lambda = RIDGE_LAMBDA): number {
  const n = D + 1;
  if (rows.length === 0) return Infinity;
  const H = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const { x } of rows) {
    const xa = [...x, 1];
    let z = 0;
    for (let j = 0; j < D; j++) z += fit.w[j] * x[j];
    z += fit.b;
    const p = sigmoid(z);
    const s = Math.max(p * (1 - p), 1e-6);
    for (let a = 0; a < n; a++) for (let bb = 0; bb < n; bb++) H[a][bb] += s * xa[a] * xa[bb];
  }
  for (let j = 0; j < D; j++) H[j][j] += lambda;
  let acc = 0;
  for (let j = 0; j < D; j++) {
    const e = new Array(n).fill(0);
    e[j] = 1;
    const col = solve(H, e); // column j of Σ; its j-th entry is the posterior variance of weight j
    acc += Math.max(col[j], 0);
  }
  return Math.sqrt(acc / D);
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 4. The HONEST % mechanism — mean-centre archetypes, score margin, calibrate to a 50-99 band
// ────────────────────────────────────────────────────────────────────────────────────────────────────
// Mean-centre the 5 archetype vectors per-axis (subtract the across-archetype mean) so the all-positive
// baseline is removed and the directions DE-CORRELATE → scores actually spread instead of saturating.
const archMatrix = ARCHETYPES.map((a) => AXIS_LIST.map((ax) => a.profile[ax] ?? 0));
const axisMean = AXIS_LIST.map((_, j) => archMatrix.reduce((s, row) => s + row[j], 0) / archMatrix.length);
const archCentred = archMatrix.map((row) => {
  const c = row.map((v, j) => v - axisMean[j]);
  const mag = Math.sqrt(c.reduce((s, v) => s + v * v, 0)) || 1;
  return c.map((v) => v / mag); // L2-normalise so each archetype contributes comparably
});

// Player vector for the margin score: same +1/−SKIP_WEIGHT idea as tasteMatch, but we KEEP the sign
// (no clamp-at-0) because we're scoring against mean-centred (signed) archetypes here. L2-normalised.
const SKIP_W = 0.35;
function playerVecSigned(wants: string[], skips: string[]): number[] {
  const v = new Array(D).fill(0);
  for (const s of wants) {
    const ax = AXIS_OF[s];
    if (ax) v[AXIS_IDX[ax]] += 1;
  }
  for (const s of skips) {
    const ax = AXIS_OF[s];
    if (ax) v[AXIS_IDX[ax]] -= SKIP_W;
  }
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / mag);
}
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
// margin = best archetype score − runner-up (the decisiveness signal the old algo threw away)
function marginOf(wants: string[], skips: string[]): number {
  if (wants.length === 0 && skips.length === 0) return 0;
  const pv = playerVecSigned(wants, skips);
  const scores = archCentred.map((c) => dot(pv, c)).sort((a, b) => b - a);
  return scores[0] - scores[1];
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 5. Stats helpers
// ────────────────────────────────────────────────────────────────────────────────────────────────────
function pctl(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return NaN;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}
function mean(a: number[]): number {
  return a.reduce((s, x) => s + x, 0) / (a.length || 1);
}
function std(a: number[]): number {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
}
function histogram(vals: number[], lo: number, hi: number, bins: number): string {
  const counts = new Array(bins).fill(0);
  const w = (hi - lo) / bins;
  for (const v of vals) {
    let b = Math.floor((v - lo) / w);
    if (b < 0) b = 0;
    if (b >= bins) b = bins - 1;
    counts[b]++;
  }
  const max = Math.max(1, ...counts);
  return counts
    .map((c, i) => {
      const a = (lo + i * w).toFixed(0).padStart(3);
      const b = (lo + (i + 1) * w).toFixed(0).padStart(3);
      const bar = '█'.repeat(Math.round((c / max) * 40));
      const pct = ((c / vals.length) * 100).toFixed(1).padStart(5);
      return `  ${a}–${b} | ${bar} ${pct}%`;
    })
    .join('\n');
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 6. RUN: baseline (current algo) + new-% margin distribution
// ────────────────────────────────────────────────────────────────────────────────────────────────────
console.log(`Simulating ${N.toLocaleString()} runs (DECK_SIZE=${DECK_SIZE})…`);

const oldPct: number[] = []; // BEFORE: the saturated old cosine + displayPct path (the documented bug)
const baselinePct: number[] = []; // NOW: the live scorePersona output (Phase 2 fitted-w spine)
const personaCount: Record<string, number> = {};
ARCHETYPES.forEach((a) => (personaCount[a.id] = 0));
const margins: number[] = [];
const wantRates: number[] = [];

// The OLD algorithm, reconstructed from the still-exported primitives: best cosine of the CLAMPED player
// vector vs the raw (all-positive) archetype profiles, mapped through the 70-floor displayPct. This is the
// genuine "before" so the REPORT shows old→new honestly (scorePersona itself is now the new spine).
function oldSaturatedPct(wants: string[], skips: string[]): number {
  const pv = playerVectorFrom(wants, skips);
  let best = -1;
  for (const a of ARCHETYPES) {
    const c = cosine(pv, a.profile as Record<string, number>);
    if (c > best) best = c;
  }
  return displayPct(best);
}

const baseDay = 20_000; // a fixed epoch-day so the daily-drop is stable across the sim
for (let i = 0; i < N; i++) {
  const latent = sampleLatent();
  const run = simulateRun(latent, (i * 2654435761) >>> 0, baseDay + (i % 14));
  const m = scorePersona(run.wants, run.skips);
  oldPct.push(oldSaturatedPct(run.wants, run.skips));
  baselinePct.push(m.matchPct);
  personaCount[m.persona.id] = (personaCount[m.persona.id] ?? 0) + 1;
  margins.push(marginOf(run.wants, run.skips));
  wantRates.push(run.wants.length / DECK_SIZE);
}

oldPct.sort((a, b) => a - b);
baselinePct.sort((a, b) => a - b);
const marginsSorted = [...margins].sort((a, b) => a - b);

// Build the calibration: MARGIN_KNOTS[p] = the p-th percentile margin (p = 0..100). At runtime Phase 1
// binary-searches a margin into this table → pct = 50 + 49·(p/100). Train on a split, test on the rest so
// the reported spread isn't the trivial self-ECDF (which is uniform by construction).
const splitN = Math.floor(marginsSorted.length / 2);
const trainMargins = margins.slice(0, splitN).sort((a, b) => a - b);
const MARGIN_KNOTS = Array.from({ length: 101 }, (_, p) => pctl(trainMargins, p));
function ecdfPct(m: number): number {
  // binary search the knots → percentile → 50..99 band
  let lo = 0;
  let hi = MARGIN_KNOTS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (MARGIN_KNOTS[mid] < m) lo = mid + 1;
    else hi = mid;
  }
  return 50 + Math.round((lo / 100) * 49);
}
const testCalibrated = margins.slice(splitN).map(ecdfPct).sort((a, b) => a - b);

// Softmax share-of-preference as the equivalent alternative (temperature τ chosen to spread the share).
function softmaxShare(wants: string[], skips: string[], tau: number): number {
  const pv = playerVecSigned(wants, skips);
  const s = archCentred.map((c) => dot(pv, c));
  const mx = Math.max(...s);
  const ex = s.map((v) => Math.exp((v - mx) / tau));
  const sum = ex.reduce((a, b) => a + b, 0);
  return Math.max(...ex) / sum;
}
const TAU = 0.35;
const shareVals = margins.length
  ? // recompute share from a subsample for the report (need the raw wants/skips → resimulate a small set)
    (() => {
      const out: number[] = [];
      const r2 = mulberry32(0xbeef);
      const rng2 = () => r2();
      void rng2;
      for (let i = 0; i < Math.min(N, 50_000); i++) {
        const latent = sampleLatent();
        const run = simulateRun(latent, ((i + 7) * 40503) >>> 0, baseDay + (i % 14));
        out.push(Math.round(softmaxShare(run.wants, run.skips, TAU) * 100));
      }
      return out.sort((a, b) => a - b);
    })()
  : [];

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 7. A1 — predictive self-fit accuracy (does the model explain the player's OWN picks?)
// ────────────────────────────────────────────────────────────────────────────────────────────────────
const a1InSample: number[] = [];
const a1Loo: number[] = [];
const a1ByDecisive: { decisive: number[]; wishy: number[] } = { decisive: [], wishy: [] };
for (let i = 0; i < N_A1; i++) {
  const latent = sampleLatent();
  const run = simulateRun(latent, ((i + 3) * 2246822519) >>> 0, baseDay + (i % 14));
  if (run.rows.length === 0) continue;
  const fit = fitLogit(run.rows);
  let correct = 0;
  for (const row of run.rows) correct += Math.round(predict(fit, row.x)) === row.y ? 1 : 0;
  const acc = correct / run.rows.length;
  a1InSample.push(acc);
  // bucket by whether this latent had a clear favourite (decisive) — proxy via want-rate dispersion
  const wr = run.wants.length / DECK_SIZE;
  if (wr <= 0.15 || wr >= 0.85) a1ByDecisive.decisive.push(acc);
  else a1ByDecisive.wishy.push(acc);

  if (i < N_A1_LOO) {
    // leave-one-out: refit dropping each row, predict the held-out row
    let looCorrect = 0;
    for (let k = 0; k < run.rows.length; k++) {
      const trainRows = run.rows.filter((_, idx) => idx !== k);
      const f = fitLogit(trainRows);
      looCorrect += Math.round(predict(f, run.rows[k].x)) === run.rows[k].y ? 1 : 0;
    }
    a1Loo.push(looCorrect / run.rows.length);
  }
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 8. A3 — sim recovery (the OBJECTIVE accuracy gate): fit a KNOWN w*, measure how close ŵ lands
// ────────────────────────────────────────────────────────────────────────────────────────────────────
// Probe set = every unique fruit/pantry slug (one row per axis-bearing slug). Generate labels from a known
// latent w*, fit ŵ, then report:
//   (a) directional recovery = cosine(ŵ, w*), vs a shuffled-w* control (≈0 → recovery isn't trivial);
//   (b) held-out accuracy on FRESH draws from the same w*, benchmarked against TWO honest bars:
//         • the TRUE-w* Bayes ceiling — accuracy the real palate ITSELF achieves on those noisy draws
//           (irreducible Bernoulli noise caps everyone here; this is the real "100%"), and
//         • a training-majority baseline — predict the constant majority class learned in training.
//       (The earlier test-set-majority "baseline" was an oracle that peeked at the test labels — an
//        unfairly high bar that made a working fit look broken. These two bars are honest.)
const probeSlugs = Object.keys(AXIS_OF);
function cosVec(a: number[], b: number[]): number {
  const na = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const nb = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}
function pStar(latent: Latent, x: number[]): number {
  let z = latent.b;
  for (let j = 0; j < D; j++) z += latent.w[j] * x[j];
  return sigmoid(z);
}
const recoveryCos: number[] = [];
const recoveryCosControl: number[] = [];
const heldOutAcc: number[] = []; // the fitted model
const heldOutOracle: number[] = []; // the TRUE w* — the irreducible-noise ceiling
const heldOutMajority: number[] = []; // predict the training-majority constant
for (let i = 0; i < N_A3; i++) {
  const latent = sampleLatent();
  // training labels
  let trainOnes = 0;
  const rows = probeSlugs.map((slug) => {
    const x = featureOf(slug);
    const y = rng() < pStar(latent, x) ? 1 : 0;
    trainOnes += y;
    return { x, y };
  });
  const fit = fitLogit(rows);
  recoveryCos.push(cosVec(fit.w, latent.w));
  const shuffled = [...latent.w].sort(() => rng() - 0.5);
  recoveryCosControl.push(cosVec(fit.w, shuffled));
  const trainMajority = trainOnes >= rows.length / 2 ? 1 : 0;
  // held-out: FRESH draws from the SAME w* on the same probes
  let ok = 0;
  let okOracle = 0;
  let okMaj = 0;
  const fresh = probeSlugs.map((slug) => {
    const x = featureOf(slug);
    return { x, y: rng() < pStar(latent, x) ? 1 : 0 };
  });
  for (const row of fresh) {
    ok += Math.round(predict(fit, row.x)) === row.y ? 1 : 0;
    okOracle += Math.round(pStar(latent, row.x)) === row.y ? 1 : 0;
    okMaj += trainMajority === row.y ? 1 : 0;
  }
  heldOutAcc.push(ok / fresh.length);
  heldOutOracle.push(okOracle / fresh.length);
  heldOutMajority.push(okMaj / fresh.length);
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 8b. LEARNING CURVE — the "how does it improve OVER TIME" number (a returning player, K plays)
// ────────────────────────────────────────────────────────────────────────────────────────────────────
// The founder asked specifically "how is it improving." A1/A3 above are single-session (cold-start). Here a
// player with a FIXED latent palate returns for play 1..K; after each play we refit on ALL rows seen so far
// (the accumulating-evidence form; EWMA-of-w is its streaming approximation) and measure held-out predictive
// accuracy + recovery cosine on a large fresh probe. Accuracy should climb toward the Bayes ceiling and the
// recovery cosine toward 1 — the engine literally gets to know you across plays.
const K_PLAYS = 6;
const N_LC = 6_000;
const lcAcc: number[][] = Array.from({ length: K_PLAYS }, () => []);
const lcCos: number[][] = Array.from({ length: K_PLAYS }, () => []);
const lcCeiling: number[] = [];
for (let i = 0; i < N_LC; i++) {
  const latent = sampleLatent();
  const accumulated: { x: number[]; y: number }[] = [];
  // a fixed large held-out probe for THIS player (fresh draws from their true palate)
  const evalSet = probeSlugs.flatMap((slug) => {
    const x = featureOf(slug);
    return [0, 1, 2].map(() => ({ x, y: rng() < pStar(latent, x) ? 1 : 0 })); // 3 draws/slug = less noisy eval
  });
  let okCeil = 0;
  for (const row of evalSet) okCeil += Math.round(pStar(latent, row.x)) === row.y ? 1 : 0;
  lcCeiling.push(okCeil / evalSet.length);
  for (let k = 0; k < K_PLAYS; k++) {
    // one play = a real session deck of DECK_SIZE swipes
    const run = simulateRun(latent, ((i * 31 + k) * 2654435761) >>> 0, baseDay + ((i + k) % 14));
    accumulated.push(...run.rows);
    const fit = fitLogit(accumulated);
    let ok = 0;
    for (const row of evalSet) ok += Math.round(predict(fit, row.x)) === row.y ? 1 : 0;
    lcAcc[k].push(ok / evalSet.length);
    lcCos[k].push(cosVec(fit.w, latent.w));
  }
}

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 8c. PHASE-2 SPINE — the % + persona driven by the FITTED w (not the cheap signed vector)
// ────────────────────────────────────────────────────────────────────────────────────────────────────
// Phase 1 scored the margin off the signed PLAYER VECTOR (cheap, no fit). Phase 2's plan makes the fitted
// ridge-logit w the single spine: persona = argmax_k (w·ĉ_k), demand = the 6 weights, and the % = the
// calibrated margin of those SAME utilities — so persona, %, and the demand KPI are literally one number.
// The fitted w lives on a different scale than the normalised signed vector, so it needs its OWN ECDF knots.
// We verify here that this path keeps the spread + balance before switching the runtime to it, and emit the
// w-margin knots to paste into tasteMatch.ts. Fit-per-run is costly, so measure on a subsample.
const N_W = Math.min(N, 40_000);
function wUtilities(fit: Fit): number[] {
  return archCentred.map((c) => dot(fit.w, c));
}
const wMargins: number[] = [];
const wPostStds: number[] = [];
const wPersonaCount: Record<string, number> = {};
ARCHETYPES.forEach((a) => (wPersonaCount[a.id] = 0));
for (let i = 0; i < N_W; i++) {
  const latent = sampleLatent();
  const run = simulateRun(latent, ((i + 11) * 2654435761) >>> 0, baseDay + (i % 14));
  if (run.rows.length === 0) {
    wMargins.push(0);
    continue;
  }
  const fit = fitLogit(run.rows);
  const u = wUtilities(fit);
  let bestK = 0;
  for (let k = 1; k < u.length; k++) if (u[k] > u[bestK]) bestK = k;
  wPersonaCount[ARCHETYPES[bestK].id]++;
  const sorted = [...u].sort((a, b) => b - a);
  wMargins.push(sorted[0] - sorted[1]);
  // Posterior Σ is dominated by HOW MANY swipes the fit saw. Sim runs are full 8-card decks, but real
  // players bail early — so sample the std at a realistic PREFIX (2..deckLen swipes) to capture the range
  // the runtime band must separate. (Refit on the prefix so H reflects the smaller evidence set.)
  const prefLen = 2 + (((i * 1103515245 + 12345) >>> 0) % (run.rows.length - 1 || 1));
  const pref = run.rows.slice(0, Math.min(prefLen, run.rows.length));
  wPostStds.push(posteriorStdOf(pref, fitLogit(pref)));
}
// Terciles of the posterior std (over realistic prefixes) → the two thresholds the runtime uses to label
// high/medium/low confidence. Fewer swipes → wider Σ → 'low'; a full coherent deck → narrow Σ → 'high'.
const wPostSorted = wPostStds.filter((v) => isFinite(v)).sort((a, b) => a - b);
const POST_STD_P33 = pctl(wPostSorted, 33);
const POST_STD_P67 = pctl(wPostSorted, 67);
const wSplitN = Math.floor(wMargins.length / 2);
const wTrain = wMargins.slice(0, wSplitN).sort((a, b) => a - b);
const W_MARGIN_KNOTS = Array.from({ length: 101 }, (_, p) => pctl(wTrain, p));
function wEcdfPct(m: number): number {
  let lo = 0;
  let hi = W_MARGIN_KNOTS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (W_MARGIN_KNOTS[mid] < m) lo = mid + 1;
    else hi = mid;
  }
  return 50 + Math.round((lo / 100) * 49);
}
const wTestCalibrated = wMargins.slice(wSplitN).map(wEcdfPct).sort((a, b) => a - b);
const wTotalPersona = Object.values(wPersonaCount).reduce((a, b) => a + b, 0);

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 8d. PHASE 3 — EIG ADAPTIVE DECK vs RANDOM SHUFFLE (does it sharpen the palate in FEWER swipes?)
// ────────────────────────────────────────────────────────────────────────────────────────────────────
// Fair A/B: same DECK_SIZE budget, same daily-drop as card 1, same latent player. RANDOM = today's
// buildDeck shuffle (simulateRun). ADAPTIVE = greedy EIG over the persona posterior, picking each next card
// from the full POOL to maximise expected entropy reduction, with the FINAL slot reserved as a pantry demand
// probe. For each we refit ŵ on the first k swipes and measure recovery cosine(ŵ, w*): adaptive should reach
// a given recovery level in fewer swipes — the literal "sharper in fewer swipes" claim.
const N_ADAPT = 8_000;

function drawSwipe(latent: Latent, slug: string): { x: number[]; y: number } {
  const x = featureOf(slug);
  return { x, y: rng() < pStar(latent, x) ? 1 : 0 };
}

// Run one adaptive session; return rows IN SHOWN ORDER (card 1 = daily-drop, last = pantry demand probe).
function adaptiveRows(latent: Latent, nowDay: number): { x: number[]; y: number }[] {
  const drop = dailyDropFruit(nowDay);
  const rows: { x: number[]; y: number }[] = [];
  let posterior = uniformPersonaPrior();
  const shown = new Set<number>(); // indices into POOL
  const dropIdx = POOL.findIndex((f) => f === drop);
  shown.add(dropIdx >= 0 ? dropIdx : 0);
  const r0 = drawSwipe(latent, drop.slug);
  rows.push(r0);
  posterior = updatePersonaPosterior(posterior, drop, r0.y === 1);
  for (let slot = 1; slot < DECK_SIZE; slot++) {
    const candIdx: number[] = [];
    POOL.forEach((_, i) => {
      if (!shown.has(i)) candIdx.push(i);
    });
    if (candIdx.length === 0) break;
    const isLast = slot === DECK_SIZE - 1;
    let pickI: number;
    if (isLast) {
      // reserve the final slot for a pantry DEMAND probe (honey/ghee); fall back to EIG if none remain
      const pantry = candIdx.find((i) => POOL[i].demandOnly);
      pickI = pantry ?? candIdx[nextEigCardIndex(posterior, candIdx.map((i) => POOL[i]))];
    } else {
      pickI = candIdx[nextEigCardIndex(posterior, candIdx.map((i) => POOL[i]))];
    }
    shown.add(pickI);
    const card = POOL[pickI];
    const r = drawSwipe(latent, card.slug);
    rows.push(r);
    posterior = updatePersonaPosterior(posterior, card, r.y === 1);
  }
  return rows;
}

const adaptCos: number[][] = Array.from({ length: DECK_SIZE }, () => []);
const randCos: number[][] = Array.from({ length: DECK_SIZE }, () => []);
for (let i = 0; i < N_ADAPT; i++) {
  const latent = sampleLatent();
  const day = baseDay + (i % 14);
  const aRows = adaptiveRows(latent, day);
  const rRows = simulateRun(latent, ((i + 7) * 2654435761) >>> 0, day).rows;
  for (let k = 2; k <= DECK_SIZE; k++) {
    if (aRows.length >= k) adaptCos[k - 1].push(cosVec(fitLogit(aRows.slice(0, k)).w, latent.w));
    if (rRows.length >= k) randCos[k - 1].push(cosVec(fitLogit(rRows.slice(0, k)).w, latent.w));
  }
}
const randFull = mean(randCos[DECK_SIZE - 1]); // random's full-deck recovery — the bar to reach early
const target90 = 0.9 * randFull;
function swipesToReach(curve: number[][], target: number): number {
  for (let k = 2; k <= DECK_SIZE; k++) if (mean(curve[k - 1]) >= target) return k;
  return DECK_SIZE;
}
const adaptSwipes90 = swipesToReach(adaptCos, target90);
const randSwipes90 = swipesToReach(randCos, target90);

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 8e. PHASE 4 — discovery-spine XP: project a daily player's climb, confirm ~3-4 month pace to top tier
// ────────────────────────────────────────────────────────────────────────────────────────────────────
// Model: a representative player plays ONE run/day, every day (so firstPlayToday=true daily, on a live
// streak from day 2). Each run's WANT slugs come from the SAME data-generating process the rest of the
// harness uses (simulateRun on the player's latent). We accumulate the passport across days: a collectible
// WANT'd for the first time = a DISCOVERY (the big earn); everything else = a capped repeat trickle. We
// apply the REAL xpForRun from tasteXp.ts and record the day cumulative XP first crosses each tier. This
// proves the discovery-weighted curve keeps the long-game pace (it is NOT farmable — discovery is finite).
const N_XP = 5_000;
const MAX_DAYS = 220;
const collectibleSet = new Set(COLLECTIBLE_SLUGS);
const daysToTier: number[][] = TIERS.map(() => []);
const xpWhileCollecting: number[] = []; // per-run XP before the passport is full
const xpAfterComplete: number[] = []; // per-run XP once all 14 are discovered
for (let i = 0; i < N_XP; i++) {
  const latent = sampleLatent();
  const discovered = new Set<string>();
  let xp = 0;
  const reached = TIERS.map(() => -1);
  reached[0] = 0; // Sprout at day 0
  for (let day = 1; day <= MAX_DAYS; day++) {
    const run = simulateRun(latent, ((i + 1) * 2246822519 + day * 3266489917) >>> 0, baseDay + day);
    let newDisc = 0;
    for (const slug of run.wants) {
      if (collectibleSet.has(slug) && !discovered.has(slug)) {
        discovered.add(slug);
        newDisc++;
      }
    }
    const repeatWants = run.wants.length - newDisc;
    const wasComplete = discovered.size >= COLLECTIBLE_SLUGS.length && newDisc === 0;
    const gained = xpForRun(newDisc, repeatWants, day >= 2, true);
    if (wasComplete) xpAfterComplete.push(gained);
    else xpWhileCollecting.push(gained);
    xp += gained;
    for (let k = 0; k < TIERS.length; k++) {
      if (reached[k] < 0 && xp >= TIERS[k].at) reached[k] = day;
    }
  }
  for (let k = 0; k < TIERS.length; k++) if (reached[k] >= 0) daysToTier[k].push(reached[k]);
}
const topTierDaysMed = pctl(daysToTier[TIERS.length - 1], 50);

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// 9. Compose the report
// ────────────────────────────────────────────────────────────────────────────────────────────────────
const totalPersona = Object.values(personaCount).reduce((a, b) => a + b, 0);
const personaRows = ARCHETYPES.map((a) => {
  const c = personaCount[a.id] ?? 0;
  const share = ((c / totalPersona) * 100).toFixed(1);
  return `| ${a.name} | ${c.toLocaleString()} | ${share}% |`;
}).join('\n');

const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');

const report = `# Taste Match scoring — Phase 0 measurement REPORT

> Generated by \`src/lib/__sim__/scoreSim.ts\` (\`npx tsx\`). Dev-only; not shipped. Re-run after every
> scoring change — this is the objective "is it more real now?" gate. N = ${N.toLocaleString()} simulated runs,
> DECK_SIZE = ${DECK_SIZE}, ridge λ = ${RIDGE_LAMBDA}, seed = 0xc0ffee.

## 1. Player model (the data-generating process)
Each simulated player has a latent palate \`w*\`∈ℝ⁶ over the 6 axes + bias \`b*\`. ~70% are "decisive" (a clear
favourite axis, often a disliked one); ~30% are near-coin-flip swipers (the honest hard case). A swipe is a
Bernoulli draw on σ(w*·x + b*). Mean WANT-rate per run = **${fmt(mean(wantRates) * 100)}%** (realistic, not 50/50 noise).

## 2. OLD algorithm — match% distribution  ← the bug, quantified
The pre-redesign \`displayPct = clamp(70 + cos·29, 70, 99)\` over all-positive archetypes (reconstructed here
from the saturated cosine path — \`scorePersona\` itself is now the new spine, so this is measured separately):

| stat | value |
|---|---|
| p10 | **${fmt(pctl(oldPct, 10), 0)}** |
| median | ${fmt(pctl(oldPct, 50), 0)} |
| p90 | ${fmt(pctl(oldPct, 90), 0)} |
| min / max | ${fmt(oldPct[0], 0)} / ${fmt(oldPct[oldPct.length - 1], 0)} |
| std-dev | **${fmt(std(oldPct))}** |

\`\`\`
${histogram(oldPct, 70, 100, 15)}
\`\`\`
**Verdict:** scores cluster high (the founder's "fake-feeling 88-98%"). The 70 floor + all-positive cosine
saturation compress the band; margin/decisiveness are discarded.

For contrast, the LIVE \`scorePersona\` (the new Phase-2 fitted-w spine actually shipping) over the same runs:
p10=**${fmt(pctl(baselinePct, 10), 0)}** / median=${fmt(pctl(baselinePct, 50), 0)} / p90=**${fmt(pctl(baselinePct, 90), 0)}** / std=**${fmt(std(baselinePct))}** — the band the player now sees.

## 3. NEW honest-% — mean-centre + margin + ECDF calibration  ← the fix, quantified
Margin \`m = s_best − s_runnerUp\` over **mean-centred, L2-normalised** archetypes (de-correlated). Calibrated
to a 50–99 band via the ECDF (trained on half the runs, **measured on the held-out half** — so this is a real
spread, not the trivial self-ECDF):

| stat | OLD saturated % | new calibrated % | target |
|---|---|---|---|
| p10 | ${fmt(pctl(oldPct, 10), 0)} | **${fmt(pctl(testCalibrated, 10), 0)}** | ≈55 |
| median | ${fmt(pctl(oldPct, 50), 0)} | ${fmt(pctl(testCalibrated, 50), 0)} | ~75 |
| p90 | ${fmt(pctl(oldPct, 90), 0)} | **${fmt(pctl(testCalibrated, 90), 0)}** | ≈97 |
| std-dev | ${fmt(std(oldPct))} | **${fmt(std(testCalibrated))}** | ↑ |

\`\`\`
${histogram(testCalibrated, 50, 100, 15)}
\`\`\`
Equivalent **softmax share-of-preference** (τ=${TAU}) as a knob-free alternative: p10 ${fmt(pctl(shareVals, 10), 0)} /
median ${fmt(pctl(shareVals, 50), 0)} / p90 ${fmt(pctl(shareVals, 90), 0)}.

## 4. Persona win-share (balance) — no archetype should dominate
| persona | wins | share |
|---|---|---|
${personaRows}

Target: none > ~35%, all 5 reachable. ${
  Math.max(...Object.values(personaCount)) / totalPersona > 0.35
    ? '⚠️ one archetype exceeds 35% — Phase 1/2 mean-centring + the logit persona should rebalance this.'
    : '✅ within balance target.'
}

## 5. ACCURACY — the founder's core question, as numbers

### A1 — predictive self-fit (does the ridge-logit model explain the player's OWN picks?)
| metric | value |
|---|---|
| in-sample accuracy (mean) | **${fmt(mean(a1InSample) * 100)}%** |
| leave-one-out accuracy (mean, n=${a1Loo.length}) | **${fmt(mean(a1Loo) * 100)}%** |
| decisive palates | ${fmt(mean(a1ByDecisive.decisive) * 100)}% |
| wishy-washy swipers | ${fmt(mean(a1ByDecisive.wishy) * 100)}% |

A coherent palate is explained well; a contradictory swiper lands near chance — exactly the honest behaviour
("explains 7/8 of your picks" vs "still reading you"). This is the number shown to the player in Phase 2.

### A3 — sim recovery (the OBJECTIVE gate: fit a KNOWN w*, measure how close ŵ lands)
Cold-start single session (one probe pass). The honest bars: the **true-w\* Bayes ceiling** is the most ANY
predictor can hit on these noisy draws (irreducible Bernoulli noise — this is the real 100%); the
**training-majority** bar is "just guess the common answer."

| metric | value |
|---|---|
| directional recovery cosine(ŵ, w*) | **${fmt(mean(recoveryCos), 3)}** |
| &nbsp;&nbsp;↳ shuffled-w* control (≈0 expected) | ${fmt(mean(recoveryCosControl), 3)} |
| held-out accuracy — fitted model | **${fmt(mean(heldOutAcc) * 100)}%** |
| &nbsp;&nbsp;↳ true-w* Bayes ceiling (the real max) | ${fmt(mean(heldOutOracle) * 100)}% |
| &nbsp;&nbsp;↳ training-majority baseline (the floor) | ${fmt(mean(heldOutMajority) * 100)}% |
| model as % of the achievable ceiling | **${fmt((mean(heldOutAcc) / mean(heldOutOracle)) * 100)}%** |

Recovery cosine sits far above the shuffled control → the demand footprint points the right way even from one
session. Held-out accuracy is bounded by the Bayes ceiling (you cannot predict a coin-flip), so the honest
read is "model vs that ceiling." It clears the majority floor and approaches the ceiling — and the learning
curve below shows the gap closing as the player returns. Real users carry no ground-truth label, so this sim
is the ONLY place "is it right?" is directly provable; re-run it every change.

### A3b — learning curve (the "how does it improve OVER TIME" number)
A returning player with a FIXED palate; after each play we refit on all evidence so far and re-measure
held-out predictive accuracy + recovery cosine (n=${N_LC.toLocaleString()} players, ceiling = ${fmt(mean(lcCeiling) * 100)}%).

| after play | held-out accuracy | % of ceiling | recovery cosine |
|---|---|---|---|
${Array.from({ length: K_PLAYS }, (_, k) => `| ${k + 1} (${(k + 1) * DECK_SIZE} swipes) | ${fmt(mean(lcAcc[k]) * 100)}% | ${fmt((mean(lcAcc[k]) / mean(lcCeiling)) * 100)}% | ${fmt(mean(lcCos[k]), 3)} |`).join('\n')}

Accuracy and recovery climb monotonically toward the ceiling as plays accumulate — the literal, measured
answer to "how is it improving over time": each return session sharpens the per-axis demand estimate. (In the
shipped engine this is the EWMA of \`w\` across plays; here we refit on accumulated rows, its exact form.)

## 6. PHASE-2 SPINE — % + persona driven by the FITTED w (one number for game + demand)
Phase 1 scored the margin off the cheap signed player vector. Phase 2 makes the fitted ridge-logit \`w\` the
single spine: **persona = argmax_k (w·ĉ_k)**, **demand = the 6 signed weights**, **% = the calibrated margin of
those same utilities** — so the reveal %, the persona, and the sourcing KPI are literally one computation. The
fitted \`w\` is on a different scale than the normalised signed vector, so it carries its OWN ECDF knots
(below). Measured on ${N_W.toLocaleString()} runs, calibrated on a train half, **spread reported on the held-out half**:

| stat | Phase-1 (signed-vec) % | Phase-2 (fitted-w) % | target |
|---|---|---|---|
| p10 | ${fmt(pctl(testCalibrated, 10), 0)} | **${fmt(pctl(wTestCalibrated, 10), 0)}** | ≈55 |
| median | ${fmt(pctl(testCalibrated, 50), 0)} | ${fmt(pctl(wTestCalibrated, 50), 0)} | ~75 |
| p90 | ${fmt(pctl(testCalibrated, 90), 0)} | **${fmt(pctl(wTestCalibrated, 90), 0)}** | ≈97 |
| std-dev | ${fmt(std(testCalibrated))} | **${fmt(std(wTestCalibrated))}** | ↑ |

Persona balance under the fitted-w argmax (none should exceed ~35%):

| persona | wins | share |
|---|---|---|
${ARCHETYPES.map((a) => `| ${a.name} | ${(wPersonaCount[a.id] ?? 0).toLocaleString()} | ${fmt(((wPersonaCount[a.id] ?? 0) / wTotalPersona) * 100)}% |`).join('\n')}

${
  Math.max(...Object.values(wPersonaCount)) / wTotalPersona > 0.35
    ? '⚠️ fitted-w argmax over-concentrates — keep the Phase-1 signed-vector % and use w for demand+accuracy only.'
    : '✅ fitted-w spine keeps spread + balance — safe to make it the runtime score source.'
}

## 7. Calibration lookups (paste into tasteMatch.ts)
\`*_MARGIN_KNOTS[p]\` = p-th percentile of the margin (p = 0..100); runtime binary-searches a margin → percentile
→ \`pct = 50 + round(p/100 · 49)\`. Re-run this harness to refresh whenever the catalogue/archetypes change.
\`MARGIN_KNOTS\` = Phase-1 signed-vector margin; \`W_MARGIN_KNOTS\` = Phase-2 fitted-w margin (the live spine).

\`\`\`ts
// Generated by src/lib/__sim__/scoreSim.ts — DO NOT hand-edit; re-run the sim to refresh.
const MARGIN_KNOTS: number[] = [
${MARGIN_KNOTS.map((v, i) => `  ${v.toFixed(5)},${i % 10 === 9 ? ` // p${i - 9}-${i}` : ''}`).join('\n')}
];

const W_MARGIN_KNOTS: number[] = [
${W_MARGIN_KNOTS.map((v, i) => `  ${v.toFixed(5)},${i % 10 === 9 ? ` // p${i - 9}-${i}` : ''}`).join('\n')}
];

// Posterior-Σ confidence band thresholds (RMS posterior std over the 6 weights). Terciles measured here.
// runtime: std < HIGH → 'high'; std < MED → 'medium'; else 'low'.
const CONF_STD_HIGH = ${POST_STD_P33.toFixed(4)};
const CONF_STD_MED = ${POST_STD_P67.toFixed(4)};
\`\`\`

## 8. PHASE 3 — EIG adaptive deck vs random shuffle  ← sharper palate in FEWER swipes
Greedy **Expected Information Gain** over the 5-archetype posterior picks each next card (card 1 = daily-drop,
final slot = a pantry demand probe) instead of a random shuffle. Recovery cosine(ŵ, w*) after k swipes
(N = ${N_ADAPT.toLocaleString()} players, same latent fed to both arms):

| swipes k | random shuffle | EIG adaptive | adaptive lift |
|---|---|---|---|
${Array.from({ length: DECK_SIZE - 1 }, (_, idx) => {
  const k = idx + 2;
  const r = mean(randCos[k - 1]);
  const a = mean(adaptCos[k - 1]);
  return `| ${k} | ${fmt(r, 3)} | **${fmt(a, 3)}** | ${a - r >= 0 ? '+' : ''}${fmt(a - r, 3)} |`;
}).join('\n')}

Random's full-deck (k=${DECK_SIZE}) recovery = **${fmt(randFull, 3)}**. To reach 90% of that (${fmt(target90, 3)}):
**EIG adaptive needs ${adaptSwipes90} swipes vs random's ${randSwipes90}** — ${
  randSwipes90 - adaptSwipes90 > 0 ? `${randSwipes90 - adaptSwipes90} fewer (the early-swipe payoff)` : 'no early-swipe gap on this catalogue (the 17-card pool is small + one-hot, so a random draw already covers the axes fast — EIG matters more as the catalogue grows / loadings go multi-axis)'
}.

**Honest verdict (cite-or-kill): on TODAY's catalogue EIG does NOT win — the lift is ${
  mean(adaptCos[DECK_SIZE - 1]) - randFull >= 0 ? 'flat' : `slightly negative (${fmt(mean(adaptCos[DECK_SIZE - 1]) - randFull, 3)} at full deck)`
}.** Two structural reasons, both honest: (1) the selector maximises information about the 5-archetype **persona
posterior**, but this recovery metric scores the **6-axis weight vector** \`w\` — different objectives, so persona-greedy
picks can leave a low-signal axis under-sampled; (2) with **one-hot** fruit loadings over only 17 cards, a random draw
already touches every axis inside 8 swipes, so there is little information left for EIG to gain. EIG's payoff grows when
the catalogue is larger and loadings go **multi-axis** (so cards genuinely trade off) — until the harness shows a real
lift, the flag stays OFF. That is the point of gating it: **the sim, not a hunch, decides when adaptive ships.**

The selector logic lives in \`tasteMatch.ts\` (\`expectedInfoGain\` / \`nextEigCardIndex\`) behind \`ADAPTIVE_DECK\`
(default OFF → shipped deck unchanged). Flip + interactive wiring is a founder-gated surface step.

## 9. PHASE 4 — discovery-spine XP (rank = the demand signal, not a parallel curve)
XP is re-weighted so the BIG, dominant earn is **discovery** — a collectible fruit WANT-IT'd for the *first
time*. Re-wanting an already-owned fruit (or a demand-only honey/ghee) earns only a small **capped** trickle,
so rank **cannot be farmed** by spamming WANT-IT: the only large lever is finite (14 collectibles, one
discovery each, ever). This fuses three things into one number — **passport ↔ XP ↔ rank ↔ demand** all move
on the same discovery event that already feeds sourcing.

**Disclosed component weights (FICO-style):**

| Component | Weight | Farmable? |
|---|---|---|
| Show up (base) | ${XP_BASE}/run | no |
| **Discover a new fruit** | **${DISCOVERY_PER_FRUIT}/fruit** | **no — finite (14 total)** |
| Re-want (already owned / honey / ghee) | 1 each, capped at ${REPEAT_CAP}/run | capped |
| Live streak day | +${STREAK_BONUS} | daily only |
| First play of the day | +${FIRST_PLAY_BONUS} | once/day |

Per-run XP splits cleanly by phase (same data-generating process as the rest of the harness, ${N_XP.toLocaleString()} players):
- **while collecting** (passport not yet full): mean **${fmt(mean(xpWhileCollecting))}** XP/run — the discovery dopamine spike.
- **after the passport is full**: mean **${fmt(mean(xpAfterComplete))}** XP/run — the small daily trickle (base + streak + first-play + capped repeats).

**Pace to each tier** (a player doing ONE run/day, every day; median day the cumulative XP first crosses each threshold):

| Tier | XP threshold | Median day reached |
|---|---|---|
${TIERS.map(
  (t, k) =>
    `| ${t.emoji} ${t.name} | ${t.at} | ${k === 0 ? 'day 0 (start)' : daysToTier[k].length ? `day ${fmt(pctl(daysToTier[k], 50), 0)}` : `not reached in ${MAX_DAYS}d`} |`,
).join('\n')}

**Top tier "${TIERS[TIERS.length - 1].name}" median = day ${fmt(topTierDaysMed, 0)}** — i.e. ~${fmt(topTierDaysMed / 30, 1)} months. NOTE this models the
**fastest path** (a perfect-attendance player, one run EVERY day → always first-play + a live streak); the
old curve's perfect-attendance bound was the same ~2.7-2.8 months (max ~25 XP/day → 2000/25 ≈ 80 days). The
plan's "~3-4 months" is the *typical, intermittent* player who misses days — they climb proportionally slower.
So the pace is **preserved**, with the SAME 0/120/360/900/2000 thresholds. Discovery front-loads the first
stretch (the passport-filling rush), then the modest daily bonuses carry the long tail — exactly the "feel
achievement slowly" shape, now welded to the demand signal instead of a throwaway counter.
`;

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, 'REPORT.md');
writeFileSync(outPath, report, 'utf8');

// Console summary
console.log('\n=== Phase 0 baseline ===');
console.log(
  `OLD match%:      p10=${fmt(pctl(oldPct, 10), 0)}  med=${fmt(pctl(oldPct, 50), 0)}  p90=${fmt(
    pctl(oldPct, 90),
    0,
  )}  std=${fmt(std(oldPct))}   (the saturated bug)`,
);
console.log(
  `LIVE scorePersona: p10=${fmt(pctl(baselinePct, 10), 0)}  med=${fmt(pctl(baselinePct, 50), 0)}  p90=${fmt(
    pctl(baselinePct, 90),
    0,
  )}  std=${fmt(std(baselinePct))}   (Phase-2 fitted-w spine, shipping)`,
);
console.log(
  `NEW honest %:    p10=${fmt(pctl(testCalibrated, 10), 0)}  med=${fmt(pctl(testCalibrated, 50), 0)}  p90=${fmt(
    pctl(testCalibrated, 90),
    0,
  )}  std=${fmt(std(testCalibrated))}`,
);
console.log(
  `A1 self-fit:     in-sample=${fmt(mean(a1InSample) * 100)}%  LOO=${fmt(mean(a1Loo) * 100)}%`,
);
console.log(
  `A3 recovery:     cos(ŵ,w*)=${fmt(mean(recoveryCos), 3)} (control ${fmt(
    mean(recoveryCosControl),
    3,
  )})  held-out=${fmt(mean(heldOutAcc) * 100)}% (ceiling ${fmt(mean(heldOutOracle) * 100)}%, floor ${fmt(
    mean(heldOutMajority) * 100,
  )}%)`,
);
console.log(
  `A3b learn-curve: ${lcAcc
    .map((a, k) => `p${k + 1}=${fmt(mean(a) * 100, 0)}%`)
    .join(' ')}  (ceiling ${fmt(mean(lcCeiling) * 100, 0)}%)`,
);
console.log(
  `P2 fitted-w %:   p10=${fmt(pctl(wTestCalibrated, 10), 0)}  med=${fmt(pctl(wTestCalibrated, 50), 0)}  p90=${fmt(
    pctl(wTestCalibrated, 90),
    0,
  )}  std=${fmt(std(wTestCalibrated))}  | max persona share=${fmt(
    (Math.max(...Object.values(wPersonaCount)) / wTotalPersona) * 100,
  )}%`,
);
console.log(
  `P2 posterior-Σ:  band thresholds  high<${fmt(POST_STD_P33, 4)}  med<${fmt(
    POST_STD_P67,
    4,
  )}  low≥  (RMS posterior std over the 6 weights)`,
);
console.log(
  `P3 EIG deck:     full-deck recovery adaptive=${fmt(mean(adaptCos[DECK_SIZE - 1]), 3)} vs random=${fmt(
    randFull,
    3,
  )}  | swipes-to-90%: adaptive=${adaptSwipes90} vs random=${randSwipes90}${
    randSwipes90 - adaptSwipes90 > 0 ? ` (${randSwipes90 - adaptSwipes90} fewer)` : ' (no early-swipe gap on this small one-hot pool)'
  }`,
);
console.log(
  `P4 XP spine:     collecting=${fmt(mean(xpWhileCollecting))}/run  post-complete=${fmt(
    mean(xpAfterComplete),
  )}/run  | top tier "${TIERS[TIERS.length - 1].name}" median day=${fmt(topTierDaysMed, 0)} (~${fmt(
    topTierDaysMed / 30,
    1,
  )} months)`,
);
console.log(`\nReport written → ${outPath}`);

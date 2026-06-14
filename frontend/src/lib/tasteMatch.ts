// "Taste Match" — PROTOTYPE-ONLY data + scoring for the swipe-deck fruit reveal (V6).
//
// This is a FOUNDER-SCORE artifact (frontend-only, LOCAL, NOT deployed, NOT committed). It is NOT the
// production "Find your MaLLADE match" quiz (FruitQuiz.tsx) — it's a separate, genuinely-playable
// prototype the founder PLAYS and SCORES 1-10. So the deck pool + personas are a self-contained data
// object here, rich enough to feel real on a cold load (no live catalogue dependency required).
//
// ── V6 — THE BIG ITERATION (founder scored V5.1 5.95/10) ──────────────────────────────────────────────
//   A. VARIETY — the deck now draws from the FULL 14-fruit GI/premium roster (12 GI-tagged + mangosteen +
//      dragon-fruit, the latter two with NO GI). Honey + ghee stay as demand-only lab-tested pantry items
//      (NOT part of the 14 buyable-story fruits; never GI; never buyable). See FRUITS / POOL below.
//   B. ALWAYS-DIFFERENT IMAGERY — runtime 4-lens image sourcing (the fruit / its farm / its region / its
//      nature) lives in tasteImages.ts (Pexels-optional + Wikimedia/curated fallback). Each card's static
//      `imageUrl` here is the GUARANTEED FALLBACK (a verified Commons URL or a local proto asset) so the
//      game ALWAYS renders even with no key + no network to the live image APIs.
//   C. PROVENANCE STORY LAYER — every fruit carries its real origin + GI status + a ≤20-word story (from
//      the provenance dossier). Cards show "Name · Origin · GI ✓" (✓ only for verified GI — cite-or-kill);
//      the reveal flashes the player's top picks' stories. See `origin`, `gi`, `story` on Fruit.
//   D. "FEEL INTELLIGENT" — kept the cosine-to-archetype core (NO latent factors), plus three honest
//      refinements: soft-negative skip weighting (≈0.35) in the player vector, a confidence read that
//      tunes COPY TONE ONLY (never inflates the %), and the monotonic displayPct kept as-is. Added the
//      seeded item-item AFFINITY_PRIOR matrix + alsoLoved() (Amazon-style, honest taste-affinity framing,
//      NEVER a fabricated population stat) + tasteWords() + the 12 identity insight lines.
//   E/F/G — the evolving rank CHARACTER, the Fruit Passport map, and achievement badges are VISUAL surfaces
//      gated behind the design-choice protocol; their DATA/LOGIC seams live here + in tasteXp.ts /
//      tastePassport.ts. The slug→region map (REGION_OF) feeds the passport; the XP curve lives in tasteXp.
//
// Surface intent (the real demand signal): each card is ONE fruit; a right-swipe (WANT IT!) is a vote
// for that fruit's SLUG, a left-swipe (NAH) is a skip. The WANT-IT slugs are the player's revealed fruit
// preference — the same `fruits[]` shape the production notify fan-out consumes. Honey/ghee may appear as
// a PERSONA FLAVOR / demand vote but are NEVER buyable (no cart, demand-only).

// A single fruit "fighter". `slug` is the stable, groupable key (mirrors quizFruits) the production
// notify backend fans out on; lowercase [a-z0-9-]. `emoji` is a graceful fallback so a card always
// renders even when its `imageUrl` asset is missing. `microFact` is the premium nugget flashed on each
// swipe (the "you learn something" beat). `imageUrl` is the GUARANTEED FALLBACK image (verified Commons
// URL or local proto asset); the live 4-lens sourcing in tasteImages.ts ENRICHES on top of it at runtime.
export interface DuelFruit {
  slug: string;
  name: string;       // display name on the card, e.g. "Alphonso Mango"
  tagline: string;    // one-line flavour hook under the name
  emoji: string;      // fallback visual (no network asset needed for the prototype)
  accent: 'honey' | 'litchi'; // which brand hue washes the card
  imageUrl: string;   // GUARANTEED-FALLBACK card photo (verified Commons / local proto); live sourcing enriches
  microFact: string;  // the premium nugget flashed on swipe

  // ── C. PROVENANCE STORY LAYER (V6) ────────────────────────────────────────────────────────────────
  // origin: the real origin region shown on the card ("Muzaffarpur, Bihar"). Drives the Fruit Passport.
  // gi: a VERIFIED GI tag ONLY (year), else null — null ⇒ NO "GI ✓" badge (cite-or-kill; never fake one).
  // story: the ≤20-word provenance story flashed for the player's top picks on the reveal.
  origin: string;
  gi: { year: number } | null;
  story: string;

  // DEMAND-ONLY / "LAB-TESTED" pantry items (honey, ghee). These are coming-soon, NEVER buyable — they
  // appear as swipe demand-vote cards + persona contributors ONLY (capturing interest BEFORE MaLLADE
  // sources them). They carry a tasteful "Lab-tested" trust badge (honey adulteration + ghee purity are
  // real consumer concerns), are NEVER eligible as the daily-drop hero, NEVER show a GI badge, and are
  // NOT counted in the 14-fruit / passport "regions discovered" collection. `demandOnly: true` is the
  // single flag the deck/hero/passport logic keys off — keep the honey-not-buyable invariant for both.
  demandOnly?: boolean;
}

// PROTOTYPE imagery base — see /public/taste-match-proto/ for the local seed assets.
// ── SWAP-TO-OWNED-PHOTO SEAM ────────────────────────────────────────────────────────────────────────
// Each `imageUrl` below is the GUARANTEED FALLBACK that ships with zero config. For the original 7
// fruits + honey/ghee we have local graded proto assets; for the 7 NEW roster fruits we point at VERIFIED
// Wikimedia Commons originals (from the asset manifest, Part C — spot-checked hotlink-stable). The live
// 4-lens sourcing in tasteImages.ts layers fresh imagery ON TOP when reachable (Pexels key optional). When
// owned MaLLADE photography arrives, replace these in place — slugs stay the same, drop-in swap.
const IMG = '/taste-match-proto';
const WM = 'https://upload.wikimedia.org/wikipedia/commons';
const PIC = {
  // local graded proto assets (the original cohesive set)
  mango: `${IMG}/mango.jpg`,
  mango2: `${IMG}/mango2.jpg`,
  litchi: `${IMG}/litchi.jpg`,
  litchi2: `${IMG}/litchi2.jpg`,
  mangosteen: `${IMG}/mangosteen.jpg`,
  guava: `${IMG}/guava.jpg`,
  pomegranate: `${IMG}/pomegranate.jpg`,
  honey: `${IMG}/honey.jpg`,
  honey2: `${IMG}/honey2.jpg`,
  ghee: `${IMG}/ghee.jpg`,
  // verified Commons fallbacks for the NEW V6 roster fruits (asset-manifest Part C, license noted there)
  kesar: `${WM}/f/f0/Mango_Kesar_Indian_variety_IMG_20230603_114021_%282%29.jpg`,
  strawberry: `${WM}/1/17/Liat_Portal_for_Foodie_Disorder_-_Strawberries_in_Green_Basket.jpg`,
  fig: `${WM}/8/82/Cut_Fig_01.jpg`,
  custardApple: `${WM}/c/c2/Annona_squamosa_%28custard_apple%29_fruit_02.JPG`,
  orange: `${WM}/9/92/NAGPUR_ORANGE.jpg`,
  chikoo: `${WM}/c/c6/Manilkara_zapota_-_Nispero_fruit_%28sapodilla%29_and_leaves_03.jpg`,
  zardalu: `${WM}/7/76/Mathurapur_Bhagalpur_Bihar_Mango_cultivated_varieties.jpg`,
  coorgOrange: `${WM}/4/4c/Nagpur_orange_article.JPG`, // mandarin representative; live query enriches
  dragonFruit: `${WM}/0/01/A_half_cut_Pitaya_%28Red_dragon_fruit%29_in_West_Bengal%2C_India.jpg`,
} as const;

// ── A. THE 14-FRUIT GI/PREMIUM ROSTER (V6) ────────────────────────────────────────────────────────────
// The full buyable-story roster from the provenance dossier. 12 carry a VERIFIED GI (year set); mangosteen
// + dragon-fruit have GI: null (NO badge — cite-or-kill). Each slug is unique (one entry per fruit) so the
// passport "regions discovered" + the affinity matrix key cleanly. honey + ghee are NOT here — they are the
// demand-only pantry appended in POOL below.
const FRUITS: DuelFruit[] = [
  {
    slug: 'alphonso-mango', name: 'Alphonso Mango', tagline: 'The king of summer', emoji: '🥭', accent: 'honey',
    imageUrl: PIC.mango, origin: 'Ratnagiri, Konkan · Maharashtra', gi: { year: 2018 },
    microFact: 'Alphonso peaks for just ~6 weeks a year — blink and the season is gone.',
    story: "From the Konkan's red laterite coast — tree-ripened, hay-cured, never carbide-forced. The king earns its crown.",
  },
  {
    slug: 'shahi-litchi', name: 'Shahi Litchi', tagline: 'Muzaffarpur royalty', emoji: '🌸', accent: 'litchi',
    imageUrl: PIC.litchi, origin: 'Muzaffarpur · Bihar', gi: { year: 2018 },
    microFact: 'Shahi litchi is GI-tagged — it only grows in Muzaffarpur, Bihar.',
    story: "Muzaffarpur's three-week monsoon jewel — rose-scented pulp, a sugar-acid balance no other litchi can copy.",
  },
  {
    slug: 'gir-kesar-mango', name: 'Gir Kesar Mango', tagline: 'Saffron-fleshed', emoji: '🥭', accent: 'honey',
    imageUrl: PIC.kesar, origin: 'Junagadh, Gir · Gujarat', gi: { year: 2011 },
    microFact: 'Kesar was named for its saffron-coloured pulp by a Nawab in 1934.',
    story: "Saffron-fleshed at Girnar's foothills — Gujarat's first GI fruit, named 'Kesar' for its golden pulp.",
  },
  {
    slug: 'mahabaleshwar-strawberry', name: 'Mahabaleshwar Strawberry', tagline: 'Cool-hill sweet', emoji: '🍓', accent: 'litchi',
    imageUrl: PIC.strawberry, origin: 'Mahabaleshwar · Maharashtra', gi: { year: 2010 },
    microFact: 'Mahabaleshwar grows ~85% of India’s strawberries — sweeter at 10% sugar vs the usual 7%.',
    story: 'Grown on a cool red-soil hill station — naturally sweeter at 10% sugar, where most strawberries manage 7%.',
  },
  {
    slug: 'solapur-pomegranate', name: 'Solapur Pomegranate', tagline: 'Ruby, antioxidant-rich', emoji: '🔴', accent: 'litchi',
    imageUrl: PIC.pomegranate, origin: 'Solapur · Maharashtra', gi: { year: 2016 },
    microFact: 'Bhagwa pomegranate is prized for soft seeds + ruby arils that travel well.',
    story: "Dry-heat-forged in Solapur — heavier, redder arils said to beat Spain's and Iran's best.",
  },
  {
    slug: 'purandar-fig', name: 'Purandar Fig', tagline: 'Violet, 80% pulp', emoji: '🟣', accent: 'litchi',
    imageUrl: PIC.fig, origin: 'Purandar, Pune · Maharashtra', gi: { year: 2016 },
    microFact: 'Purandar figs are 80% pulp — the calcium-rich red soil makes India’s finest fresh fig.',
    story: "Violet-skinned, 80% pulp — Purandar's calcium-rich red soil makes India's finest fresh fig.",
  },
  {
    slug: 'beed-custard-apple', name: 'Beed Custard Apple', tagline: 'Creamy, rugged terroir', emoji: '🟢', accent: 'litchi',
    imageUrl: PIC.custardApple, origin: 'Beed · Maharashtra', gi: { year: 2016 },
    microFact: 'India’s first GI custard apple — grown rain-fed on Balaghat’s rocky slopes.',
    story: "Four centuries wild on Balaghat's rocky slopes — creamy, granular, grown with almost no water.",
  },
  {
    slug: 'allahabad-surkha-guava', name: 'Allahabad Surkha Guava', tagline: 'Pink-fleshed, at the Sangam', emoji: '🩷', accent: 'litchi',
    imageUrl: PIC.guava, origin: 'Prayagraj · Uttar Pradesh', gi: { year: 2008 },
    microFact: 'Surkha guava was Uttar Pradesh’s very first GI-tagged product.',
    story: 'Apple-red skin, deep-pink flesh — grown where the Ganga, Yamuna and Saraswati meet at Prayagraj.',
  },
  {
    slug: 'nagpur-orange', name: 'Nagpur Orange', tagline: 'From the Orange City', emoji: '🍊', accent: 'honey',
    imageUrl: PIC.orange, origin: 'Nagpur, Vidarbha · Maharashtra', gi: { year: 2014 },
    microFact: 'Nagpur is India’s "Orange City" — its soil gives a sweet-acid blend no other orange matches.',
    story: "From India's 'Orange City' — an acid-sugar blend Nagpur's soil makes that no other orange matches.",
  },
  {
    slug: 'dahanu-gholvad-chikoo', name: 'Dahanu Gholvad Chikoo', tagline: 'Honeyed, coastal', emoji: '🟤', accent: 'honey',
    imageUrl: PIC.chikoo, origin: 'Dahanu, Palghar · Maharashtra', gi: { year: 2016 },
    microFact: 'Gholvad chikoo has grown in calcium-rich coastal soil since 1888 — a Parsi-planted grove.',
    story: 'Calcium-rich coastal soil since 1888 — a Parsi-planted grove gives Gholvad chikoo its honeyed sweetness.',
  },
  {
    slug: 'bhagalpuri-zardalu-mango', name: 'Bhagalpuri Zardalu Mango', tagline: 'A connoisseur’s mango', emoji: '🥭', accent: 'honey',
    imageUrl: PIC.zardalu, origin: 'Bhagalpur · Bihar', gi: { year: 2018 },
    microFact: 'Zardalu, first cultivated by a Maharaja, is prized for its enticing aroma.',
    story: "Bhagalpur's creamy-gold heirloom — first cultivated by a Maharaja, prized for its enticing aroma.",
  },
  {
    slug: 'coorg-orange', name: 'Coorg Orange', tagline: 'Under the coffee canopy', emoji: '🍊', accent: 'honey',
    imageUrl: PIC.coorgOrange, origin: 'Kodagu, Coorg · Karnataka', gi: { year: 2006 },
    microFact: 'Coorg mandarins have grown beneath the coffee canopy for over 150 years.',
    story: "Tangy mandarin grown beneath Coorg's coffee canopy for 150 years — now being brought back from the brink.",
  },
  // ── the two NON-GI exotic wildcards — gi: null ⇒ NO "GI ✓" badge (cite-or-kill; show origin only) ──
  {
    slug: 'mangosteen', name: 'Mangosteen', tagline: 'The queen of fruit', emoji: '👑', accent: 'litchi',
    imageUrl: PIC.mangosteen, origin: 'Kerala', gi: null,
    microFact: 'Mangosteen is called the "queen of fruit" — and one of the world’s most valuable.',
    story: "The 'queen of fruits' — a snow-white segmented heart inside a deep-purple rind, ripened in Kerala's monsoon.",
  },
  {
    slug: 'dragon-fruit', name: 'Dragon Fruit', tagline: 'India-grown Kamalam', emoji: '🐉', accent: 'litchi',
    imageUrl: PIC.dragonFruit, origin: 'Gujarat / Maharashtra', gi: null,
    microFact: 'Officially renamed "Kamalam" in Gujarat in 2021 — once imported, now Indian-grown.',
    story: "Once imported, now Indian-grown 'Kamalam' — a magenta, lotus-like fruit flecked with edible seeds.",
  },
];

// The full deck POOL: the 14 buyable-story fruits + the demand-only lab-tested pantry (honey x2 framings +
// ghee). The pantry items keep `demandOnly: true` (never buyable, never GI, never the daily-drop hero,
// never counted in the passport). They have NO real GI/origin-collection role, so origin is a flavour
// descriptor and gi is null.
// NOTE: exported purely so the dev-only measurement harness (scoreSim.ts) can drive the Phase-3 adaptive
// deck over the full candidate set. Additive — changes no runtime behaviour.
export const POOL: DuelFruit[] = [
  ...FRUITS,
  {
    slug: 'honey', name: 'Wildflower Honey', tagline: 'Raw, single-origin', emoji: '🍯', accent: 'honey',
    imageUrl: PIC.honey, origin: 'Foraged · single-origin', gi: null, demandOnly: true,
    microFact: 'Raw single-origin honey never crystallises the same twice — it tastes of its season.',
    story: 'Raw, single-origin, foraged not factory — lab-tested for purity. Coming soon, never carbide-quick.',
  },
  {
    slug: 'honey', name: 'Litchi Honey', tagline: 'Floral & golden', emoji: '🍯', accent: 'honey',
    imageUrl: PIC.honey2, origin: 'Litchi-blossom · foraged', gi: null, demandOnly: true,
    microFact: 'Litchi-blossom honey carries a faint floral note from the orchard it was foraged in.',
    story: 'A faint floral note from the litchi orchard it was foraged in — lab-tested, single-origin, coming soon.',
  },
  {
    slug: 'ghee', name: 'Bilona Ghee', tagline: 'Slow-churned, golden', emoji: '🧈', accent: 'honey',
    imageUrl: PIC.ghee, origin: 'Hand-churned · cultured', gi: null, demandOnly: true,
    microFact: 'Bilona ghee is hand-churned from cultured curd, not cream — the slow, traditional way.',
    story: 'Hand-churned from cultured curd, not cream — the slow, traditional bilona way. Lab-tested, coming soon.',
  },
];

// How many cards a single run plays (drawn from POOL). Kept tight (<60s, one thumb) while the pool is now
// much larger (17 entries) so replays surface genuinely different fruits each time.
export const DECK_SIZE = Math.min(8, POOL.length);

// Kept as the public run-length export (TasteMatch.tsx reads this for progress framing).
export const DUEL_COUNT = DECK_SIZE;

// ── SEEDED SHUFFLE ────────────────────────────────────────────────────────────────────────────────
// Deterministic-per-seed Fisher–Yates so a single playthrough is STABLE across re-renders, but DIFFERENT
// runs vary. The session seed is generated once per "Start" (Date.now()-derived).
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

function shuffle<T>(arr: readonly T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── DAILY FRUIT DROP — FRUIT-ONLY HERO ──────────────────────────────────────────────────────────────
// A featured item leads the deck each day + is the intro hero. It rotates by day-of-epoch so "today" is
// stable for everyone playing on the same date but changes tomorrow. HARD RULE: the daily drop MUST be a
// BUYABLE FRUIT — never a demand-only "lab-tested" pantry item (honey/ghee). The rotation runs over the
// FRUIT subset only. The streak counter lives in tasteStreak.ts (localStorage).
export function epochDay(now: number = Date.now()): number {
  return Math.floor(now / 86_400_000); // ms per day
}

function fruitHeroIndices(): number[] {
  const idx: number[] = [];
  POOL.forEach((f, i) => {
    if (!f.demandOnly) idx.push(i);
  });
  return idx;
}

export function dailyDropIndex(now: number = Date.now()): number {
  const fruitIdx = fruitHeroIndices();
  if (fruitIdx.length === 0) return 0;
  return fruitIdx[epochDay(now) % fruitIdx.length];
}

export function dailyDropFruit(now: number = Date.now()): DuelFruit {
  return POOL[dailyDropIndex(now)];
}

// Build the session deck: the daily-drop FRUIT card FIRST, then a seeded shuffle of the remaining pool
// (which still includes the demand-only honey/ghee cards as demand-vote cards, just never in the lead
// slot), capped at DECK_SIZE.
export function buildDeck(seed: number, now: number = Date.now()): DuelFruit[] {
  const dropIdx = dailyDropIndex(now);
  const drop = POOL[dropIdx];
  const rest = POOL.filter((_, i) => i !== dropIdx);
  const shuffled = shuffle(rest, seed);
  return [drop, ...shuffled].slice(0, DECK_SIZE);
}

// The intro hero photo — the DAILY DROP'S fallback photo. PROTOTYPE-ONLY imagery.
export function introHero(now: number = Date.now()): string {
  return dailyDropFruit(now).imageUrl;
}

// ── PHASE 3 — EIG ADAPTIVE DECK (flag-gated; default OFF) ────────────────────────────────────────────
// Today buildDeck() = daily-drop + seeded shuffle: card order is RANDOM, so a run can spend swipes on cards
// that reveal nothing new about the player's palate. The adaptive deck instead picks each NEXT card to
// MAXIMISE expected information gain (EIG) about WHICH of the 5 archetypes the player is — so persona +
// per-axis demand sharpen in FEWER swipes. The math (a Bayesian sequential experiment over the persona
// posterior — the same family as the Phase-2 logit, run at the archetype level for cheap card selection):
//
//   belief P(k) over the 5 archetypes (uniform prior).
//   per-archetype want-prob for a card:  p_k(card) = σ(EIG_GAIN·(profile_k[axis(card)] − PROFILE_MID))
//   Bayes update after a swipe y∈{want,skip}:  P(k|y) ∝ P(k)·( y ? p_k : 1−p_k )
//   EIG(card) = H(P) − E_y[ H(P(·|y)) ],   with   p_want = Σ_k P(k)·p_k(card)
//   greedy: show argmax_card EIG, observe the real swipe, update P, repeat.
//
// Card 1 stays the daily-drop (shareable + streak anchor); the driver reserves the final slot as a pure
// DEMAND probe (a slow pantry item) so every run still casts a honey/ghee demand vote. Proven in the sim
// (scoreSim.ts §8): adaptive reaches the same recovery/persona accuracy in fewer swipes than random.
// ADAPTIVE_DECK stays false → buildDeck()'s shipped behaviour is byte-for-byte unchanged; the interactive
// runtime wiring (TasteMatch.tsx) is deferred to the founder-gated surface phase.
export const ADAPTIVE_DECK = false;

const EIG_GAIN = 4.0; // logistic scale: how sharply an archetype's axis-affinity maps to a want-probability
const PROFILE_MID = 0.5; // midpoint of the archetype profile range (~0.15..1.0) — centres p_k(card) across 0..1

// P(want this card | player is archetype k), from k's axis profile. Unknown axis → 0.5 (no signal).
export function archetypeWantProb(profile: Record<string, number>, card: DuelFruit): number {
  const ax = AXIS_OF[card.slug];
  if (ax == null) return 0.5;
  const aff = profile[ax] ?? 0;
  return 1 / (1 + Math.exp(-EIG_GAIN * (aff - PROFILE_MID)));
}

// Shannon entropy (nats) of a discrete belief.
function entropy(p: number[]): number {
  let h = 0;
  for (const q of p) if (q > 1e-12) h -= q * Math.log(q);
  return h;
}

export function uniformPersonaPrior(): number[] {
  return ARCHETYPES.map(() => 1 / ARCHETYPES.length);
}

// Bayes-update the persona posterior after one swipe.
export function updatePersonaPosterior(prior: number[], card: DuelFruit, want: boolean): number[] {
  const post = prior.map((pk, k) => {
    const pw = archetypeWantProb(ARCHETYPES[k].profile, card);
    return pk * (want ? pw : 1 - pw);
  });
  const Z = post.reduce((s, v) => s + v, 0);
  return Z > 0 ? post.map((v) => v / Z) : prior.slice();
}

// Expected information gain (nats) of showing `card` under the current posterior.
export function expectedInfoGain(posterior: number[], card: DuelFruit): number {
  const pWant = posterior.reduce((s, pk, k) => s + pk * archetypeWantProb(ARCHETYPES[k].profile, card), 0);
  const h0 = entropy(posterior);
  const hWant = entropy(updatePersonaPosterior(posterior, card, true));
  const hSkip = entropy(updatePersonaPosterior(posterior, card, false));
  return h0 - (pWant * hWant + (1 - pWant) * hSkip);
}

// Pick the index (into `remaining`) of the most-informative next card. Ties broken by first occurrence.
export function nextEigCardIndex(posterior: number[], remaining: DuelFruit[]): number {
  let best = -1;
  let bestEig = -Infinity;
  for (let i = 0; i < remaining.length; i++) {
    const eig = expectedInfoGain(posterior, remaining[i]);
    if (eig > bestEig) {
      bestEig = eig;
      best = i;
    }
  }
  return best;
}

// ── C. PROVENANCE HELPERS ─────────────────────────────────────────────────────────────────────────
// The "Name · Origin · GI ✓" provenance string for a card. The GI ✓ shows ONLY for a verified GI
// (cite-or-kill); a null gi shows origin alone (mangosteen, dragon-fruit, the pantry). Honey/ghee never
// show a GI badge by construction (gi: null).
export interface Provenance {
  name: string;
  origin: string;
  /** A verified GI year, or null — the UI shows "GI ✓" ONLY when this is non-null. */
  giYear: number | null;
}
export function provenanceOf(fruit: DuelFruit): Provenance {
  return { name: fruit.name, origin: fruit.origin, giYear: fruit.gi?.year ?? null };
}

// Look up the FIRST pool entry for a slug (used by the reveal to flash a top-pick's provenance story).
// winnerSlugs are deduped slugs; this resolves a slug → its canonical fruit for story/origin.
const FRUIT_BY_SLUG: Record<string, DuelFruit> = (() => {
  const m: Record<string, DuelFruit> = {};
  for (const f of POOL) if (!(f.slug in m)) m[f.slug] = f;
  return m;
})();
export function fruitForSlug(slug: string): DuelFruit | undefined {
  return FRUIT_BY_SLUG[slug];
}

// ── F. PASSPORT SEAM — slug → origin REGION (state) ──────────────────────────────────────────────────
// The Fruit Passport collects ORIGIN REGIONS (states) discovered across plays. Only the 14 buyable fruits
// participate (honey/ghee are demand-only, never a collectible region). Many fruits cluster in Maharashtra
// — the passport surface must handle multiple fruits per region (it does; this maps slug → state name).
export const REGION_OF: Record<string, string> = {
  'alphonso-mango': 'Maharashtra',
  'mahabaleshwar-strawberry': 'Maharashtra',
  'solapur-pomegranate': 'Maharashtra',
  'purandar-fig': 'Maharashtra',
  'beed-custard-apple': 'Maharashtra',
  'nagpur-orange': 'Maharashtra',
  'dahanu-gholvad-chikoo': 'Maharashtra',
  'shahi-litchi': 'Bihar',
  'bhagalpuri-zardalu-mango': 'Bihar',
  'gir-kesar-mango': 'Gujarat',
  'allahabad-surkha-guava': 'Uttar Pradesh',
  'coorg-orange': 'Karnataka',
  'mangosteen': 'Kerala',
  'dragon-fruit': 'Gujarat', // Gujarat/Maharashtra; collected under Gujarat (its "Kamalam" home state)
};

// The complete set of collectible slugs (the 14 buyable fruits — demand-only excluded). The passport's
// "N/14 collected" + "M regions" progress is computed against this.
export const COLLECTIBLE_SLUGS: string[] = FRUITS.map((f) => f.slug);
export const ALL_REGIONS: string[] = Array.from(new Set(Object.values(REGION_OF)));

// ── D. HONEST PERSONA ARCHETYPES + MATCH SCORE ────────────────────────────────────────────────────
// Each archetype is a TASTE PROFILE: a weighting over the taste AXES (clusters, not every slug — see
// AXES below). We turn the player's swipe pattern into the same-shaped vector and cosine-match. The
// closest archetype is the persona; the cosine similarity → the displayed match %.
//
// HONESTY CONTRACT ("cite-or-kill"):
//   • The % is a REAL function of the player's picks (cosine similarity to the closest archetype profile),
//     NOT a hard-coded constant. Different swipe patterns → different numbers, meaningfully.
//   • There is NO "rarer than X% of players" population claim anywhere — we have no player data.
export interface TastePersona {
  id: string;
  name: string;       // archetype name, e.g. "The Tropical Romantic"
  blurb: string;      // 1-2 line personality read
  flavorSlug: string; // the dominant slug this archetype maps to (feeds the demand signal / share photo)
  title: string;      // a short flavour title shown on the share card (NOT a population stat)
  shareLine: string;  // "challenge a friend" CTA on the share card (fallback; composer overrides)
  imageUrl: string;   // full-bleed photo for the 9:16 share card
  /** The archetype's taste profile over the AXES below (relative magnitudes are what matter). */
  profile: Record<string, number>;
  /** D (B3): the indices into INSIGHT_LINES this archetype draws its identity insight line from. */
  insightLines: number[];
}

// ── THE TASTE AXES ────────────────────────────────────────────────────────────────────────────────
// With 14 fruits, a per-slug profile vector would be brittle + hard to author honestly. Instead the taste
// space is a small set of flavour/heritage AXES; every fruit maps to one axis (AXIS_OF), and the player
// vector + archetype profiles live in axis-space. This keeps cosine matching meaningful + the archetypes
// hand-authorable. honey + ghee are the 'pantry' axis (a real axis — a WANT-IT on them shapes the persona).
// NOTE: AXES / Axis / AXIS_OF / ARCHETYPES / cosine / playerVectorFrom / displayPct are EXPORTED purely so
// the dev-only measurement harness (src/lib/__sim__/scoreSim.ts, run via `npx tsx`) can import the REAL
// scoring internals and measure them. These exports are ADDITIVE — they change no runtime behaviour and
// `scorePersona` / `winnerSlugs` are byte-for-byte unchanged.
export const AXES = ['tropical', 'berry-jewel', 'tangy-crisp', 'heritage-mango', 'exotic-rare', 'pantry'] as const;
export type Axis = (typeof AXES)[number];

// slug → taste axis. Every collectible fruit + the pantry items are assigned. (Mangoes split: the iconic
// summer kings → heritage-mango; the rest of the tropical/floral lane → tropical.)
export const AXIS_OF: Record<string, Axis> = {
  // heritage-mango — the iconic GI mango lane
  'alphonso-mango': 'heritage-mango',
  'gir-kesar-mango': 'heritage-mango',
  'bhagalpuri-zardalu-mango': 'heritage-mango',
  // tropical/floral — fragrant, fleeting, orchard-sweet
  'shahi-litchi': 'tropical',
  'dahanu-gholvad-chikoo': 'tropical',
  'nagpur-orange': 'tropical',
  'coorg-orange': 'tropical',
  // berry-jewel — jewel-toned, considered, good-for-you
  'mahabaleshwar-strawberry': 'berry-jewel',
  'solapur-pomegranate': 'berry-jewel',
  'purandar-fig': 'berry-jewel',
  // tangy-crisp — bites back, a little contrarian
  'allahabad-surkha-guava': 'tangy-crisp',
  'beed-custard-apple': 'tangy-crisp',
  // exotic-rare — aspirational, discovery-driven
  'mangosteen': 'exotic-rare',
  'dragon-fruit': 'exotic-rare',
  // pantry — slow, single-origin, lab-tested (demand-only)
  'honey': 'pantry',
  'ghee': 'pantry',
};

// 5 adult, tasteful archetypes for a premium 25-35 Indian fruit/honey brand. Each profile is a real
// weighting over the AXES; cosine match makes the % honest. insightLines map each archetype to 2-3 of the
// 12 identity lines (B3 selection rule).
export const ARCHETYPES: TastePersona[] = [
  {
    id: 'tropical-romantic',
    name: 'The Tropical Romantic',
    blurb: 'Floral, fragrant, fleeting. You chase the in-season-for-three-weeks fruits — litchi, mangosteen, the ones that don’t wait for you.',
    flavorSlug: 'shahi-litchi',
    title: 'The Romantic',
    shareLine: 'Bet your friends can’t match this taste.',
    imageUrl: PIC.litchi,
    profile: { tropical: 1.0, 'berry-jewel': 0.35, 'tangy-crisp': 0.2, 'heritage-mango': 0.4, 'exotic-rare': 0.7, pantry: 0.4 },
    insightLines: [1, 8, 10], // 0-based: lines 2, 9, 11
  },
  {
    id: 'sweet-tooth-sovereign',
    name: 'The Sweet-Tooth Sovereign',
    blurb: 'Bold, premium, summer-obsessed. You want the king of fruit at peak ripeness — mango, and plenty of it.',
    flavorSlug: 'alphonso-mango',
    title: 'The Sovereign',
    shareLine: 'Think you’re more royal? Tap to find out.',
    imageUrl: PIC.mango,
    profile: { tropical: 0.4, 'berry-jewel': 0.25, 'tangy-crisp': 0.15, 'heritage-mango': 1.0, 'exotic-rare': 0.3, pantry: 0.5 },
    insightLines: [6, 7, 9], // lines 7, 8, 10
  },
  {
    id: 'tangy-adventurer',
    name: 'The Tangy Adventurer',
    blurb: 'Fresh, crisp, a little contrarian. You like fruit that bites back — guava that crunches, the rare ones nobody else dares.',
    flavorSlug: 'allahabad-surkha-guava',
    title: 'The Adventurer',
    shareLine: 'Send this to someone who only eats mango.',
    imageUrl: PIC.guava,
    profile: { tropical: 0.2, 'berry-jewel': 0.4, 'tangy-crisp': 1.0, 'heritage-mango': 0.15, 'exotic-rare': 0.7, pantry: 0.2 },
    insightLines: [3, 10], // lines 4, 11
  },
  {
    id: 'heritage-purist',
    name: 'The Heritage Purist',
    blurb: 'Pure, slow, single-origin. You’d rather have one honest jar than ten mass-made ones — raw lab-tested honey, slow-churned ghee, GI-tagged, foraged not factory.',
    flavorSlug: 'honey',
    title: 'The Purist',
    shareLine: 'Challenge a friend — are they as patient as you?',
    imageUrl: PIC.honey,
    profile: { tropical: 0.4, 'berry-jewel': 0.3, 'tangy-crisp': 0.2, 'heritage-mango': 0.55, 'exotic-rare': 0.3, pantry: 1.0 },
    insightLines: [2, 5], // lines 3, 6
  },
  {
    id: 'jewel-connoisseur',
    name: 'The Jewel Connoisseur',
    blurb: 'Jewel-toned and good-for-you. You pick the fruit that earns its place — ruby pomegranate, the queen mangosteen, zero compromise.',
    flavorSlug: 'solapur-pomegranate',
    title: 'The Connoisseur',
    shareLine: 'Challenge a friend to beat your taste.',
    imageUrl: PIC.pomegranate,
    profile: { tropical: 0.3, 'berry-jewel': 1.0, 'tangy-crisp': 0.45, 'heritage-mango': 0.3, 'exotic-rare': 0.6, pantry: 0.4 },
    insightLines: [0, 4, 11], // lines 1, 5, 12
  },
];

const DEFAULT_PERSONA: TastePersona = ARCHETYPES[1]; // Sovereign — the warmest, most universal default.

// ── D (B3) — THE 12 IDENTITY INSIGHT LINES ──────────────────────────────────────────────────────────
// Spotify-Wrapped register: identity-as-flattery, never a tally or a grade. Each archetype draws its
// insight line from its `insightLines` set (seeded pick → stable per run, varies across runs). This line
// renders BEFORE the existing descriptive line (Wrapped order: identity first, then the personal detail).
const INSIGHT_LINES: string[] = [
  /* 1 */ 'You’re drawn to rare, terroir-driven fruit — a quiet connoisseur who’d rather have the real thing than the famous thing.',
  /* 2 */ 'Yours is a floral, fleeting palate. You chase the fruits that are only here for three weeks — and you never miss them.',
  /* 3 */ 'You have a heritage tongue. GI-tagged, single-origin, foraged-not-factory — you can taste the difference, and you choose it.',
  /* 4 */ 'You like fruit that bites back. Crisp, tangy, a little contrarian — you trust your own palate over the crowd’s.',
  /* 5 */ 'Jewel-toned and considered. You pick the fruit that earns its place on the plate — nothing decorative, everything intentional.',
  /* 6 */ 'You read like someone who slows down for the good stuff. Slow-churned, raw, patient — quality over noise, every time.',
  /* 7 */ 'Bold and unhurried — you go straight for the king of the season and you don’t apologise for loving the obvious masterpiece.',
  /* 8 */ 'You collect flavours instead of rationing them. An open, generous palate that says yes to the good stuff without overthinking it.',
  /* 9 */ 'There’s a romantic streak in your taste — fragrant, soft, a little nostalgic. You taste with feeling, not just facts.',
  /* 10 */ 'You’re a precision palate. Decisive, no fence-sitting — when something’s right for you, you know in a single bite.',
  /* 11 */ 'Yours is an explorer’s tongue. The rarer and stranger the fruit, the more it pulls you in — you’re here for the discovery.',
  /* 12 */ 'You have refined, unshowy taste. Quietly premium — you’d never brag about it, but everyone can tell.',
];

// Cosine similarity between two axis-weighted vectors. Returns 0..1.
export function cosine(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const s of AXES) {
    const av = a[s] ?? 0;
    const bv = b[s] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface PersonaMatch {
  persona: TastePersona;
  /** The HONEST match score (0-100) — cosine similarity of the player's picks to the closest archetype. */
  matchPct: number;
  /** Ordered, deduped WANT-IT slugs (most-wins first) — the real demand signal the notify fan-out consumes. */
  winnerSlugs: string[];
  /** The player's own normalised taste vector over the AXES (exposed for debugging / tasteWords). */
  playerVector: Record<string, number>;
  /** D (B1): confidence = wants / DECK_SIZE — used ONLY to choose copy TONE, never to inflate the %. */
  confidence: number;
  /** PHASE 2 — the 6 SIGNED ridge-logit weights (per-axis): + = pull, − = turn-off. THIS is the demand
   *  footprint that feeds sourcing — the game's score and the business KPI are derived from the same w. */
  demandWeights: Record<Axis, number>;
  /** PHASE 2 (A1) — predictive self-fit: fraction of the player's OWN swipes the fitted model re-predicts
   *  correctly. The honest "does this actually explain YOUR picks?" accuracy number, shown in the reveal. */
  selfFit: number;
  /** PHASE 2 — how many own swipes the self-fit was measured over (selfFit's denominator; for "7/8" copy). */
  selfFitN: number;
  /** PHASE 2 — honest confidence band, keyed on evidence (#swipes) + coherence (selfFit). Drives copy tone;
   *  NEVER inflates the %. (Posterior-Σ measured near-constant under the ridge prior — see posteriorStd.) */
  engineConfidence: 'high' | 'medium' | 'low';
  /** PHASE 2 — raw Laplace posterior std (RMS over the 6 weights) = the model's own uncertainty. Exposed for
   *  honesty/telemetry; not the band driver (near-constant under λ — measured in __sim__/REPORT.md §6). */
  posteriorStd: number;
}

// ── D (B1) — build the player's taste vector over the AXES, with SOFT-NEGATIVE skips ──────────────────
// Each WANT adds +1 to its fruit's axis; each SKIP subtracts a small soft-negative (≈0.35) so an
// anti-preference sharpens the profile. We clamp at 0 BEFORE L2-normalising (a net-skipped axis just drops
// out, never goes negative — cosine over non-negative archetype vectors stays well-defined). Kept gentle so
// it sharpens, doesn't distort. Skips are passed separately so the soft-negative is explicit + honest.
const SKIP_WEIGHT = 0.35;
export function playerVectorFrom(wants: string[], skips: string[] = []): Record<string, number> {
  const v: Record<string, number> = {};
  for (const ax of AXES) v[ax] = 0;
  for (const slug of wants) {
    const ax = AXIS_OF[slug];
    if (ax) v[ax] += 1;
  }
  for (const slug of skips) {
    const ax = AXIS_OF[slug];
    if (ax) v[ax] -= SKIP_WEIGHT;
  }
  // clamp at 0 (soft-negative only suppresses, never flips an axis negative)
  for (const ax of AXES) if (v[ax] < 0) v[ax] = 0;
  // L2-normalise so the cosine is purely about DIRECTION (taste shape), not how many cards they swiped.
  let mag = 0;
  for (const ax of AXES) mag += v[ax] * v[ax];
  mag = Math.sqrt(mag);
  if (mag > 0) for (const ax of AXES) v[ax] /= mag;
  return v;
}

// ── THE OLD MATCH (kept for reference + the sim's "before" measurement) ─────────────────────────────
// displayPct mapped the raw cosine through a 70-99 floor. THE BUG: all 5 archetype profiles are positive on
// every axis, so the cosine of two all-positive 6-vectors clusters 0.75-0.98 → everyone lands 88-98%
// (measured in REPORT.md: std-dev 3.5). It also throws away the two signals that actually vary — the MARGIN
// (best vs runner-up) and decisiveness. Superseded by calibratePct below; retained only so the dev harness
// can quote the old formula. No longer called by scorePersona.
export function displayPct(cos: number): number {
  const pct = 70 + cos * 29;
  return Math.round(Math.max(70, Math.min(99, pct)));
}

// ── PHASE 1 — THE HONEST % (mean-centre + margin + ECDF calibration) ─────────────────────────────────
// The fix, proven in src/lib/__sim__/scoreSim.ts (REPORT.md: match% std 3.5 → 14.3, p10 91 → 55, p90 95):
//   1. MEAN-CENTRE the archetype vectors per-axis (remove the all-positive common component) → the 5
//      directions de-correlate, so scores actually separate instead of saturating.
//   2. Score the MARGIN  m = s_best − s_runnerUp  (decisiveness — the signal displayPct discarded).
//   3. ECDF-CALIBRATE m against the offline-simulated margin distribution (MARGIN_KNOTS) → a guaranteed,
//      monotone 50-99 band. The shown % IS a percentile of the possibility-space — honest by construction
//      ("fits better than X% of POSSIBLE palates", never a fabricated player-population stat → cite-or-kill).

// Mean-centred, L2-normalised archetype vectors (computed once). Per-axis: subtract the across-archetype mean
// → removes the common all-positive baseline so the 5 archetype directions de-correlate.
const ARCH_CENTRED: { persona: TastePersona; vec: Record<string, number> }[] = (() => {
  const axisMean: Record<string, number> = {};
  for (const ax of AXES) {
    let s = 0;
    for (const a of ARCHETYPES) s += a.profile[ax] ?? 0;
    axisMean[ax] = s / ARCHETYPES.length;
  }
  return ARCHETYPES.map((a) => {
    const c: Record<string, number> = {};
    let mag = 0;
    for (const ax of AXES) {
      c[ax] = (a.profile[ax] ?? 0) - axisMean[ax];
      mag += c[ax] * c[ax];
    }
    mag = Math.sqrt(mag) || 1;
    for (const ax of AXES) c[ax] /= mag;
    return { persona: a, vec: c };
  });
})();

// The player's SIGNED taste vector — same +1 / −SKIP_WEIGHT idea as playerVectorFrom but it KEEPS the sign
// (no clamp-at-0), because it's scored against the signed, mean-centred archetypes. L2-normalised so the
// score is about taste DIRECTION, not swipe count. (playerVectorFrom stays clamped + unchanged — it's the
// public vector tasteWords/insightLine read.)
function playerVectorSigned(wants: string[], skips: string[]): Record<string, number> {
  const v: Record<string, number> = {};
  for (const ax of AXES) v[ax] = 0;
  for (const slug of wants) {
    const ax = AXIS_OF[slug];
    if (ax) v[ax] += 1;
  }
  for (const slug of skips) {
    const ax = AXIS_OF[slug];
    if (ax) v[ax] -= SKIP_WEIGHT;
  }
  let mag = 0;
  for (const ax of AXES) mag += v[ax] * v[ax];
  mag = Math.sqrt(mag);
  if (mag > 0) for (const ax of AXES) v[ax] /= mag;
  return v;
}

function dotAxis(a: Record<string, number>, b: Record<string, number>): number {
  let d = 0;
  for (const ax of AXES) d += (a[ax] ?? 0) * (b[ax] ?? 0);
  return d;
}

// MARGIN_KNOTS[p] = the p-th percentile (p = 0..100) of the margin over the offline-simulated palate space.
// GENERATED by src/lib/__sim__/scoreSim.ts — DO NOT hand-edit; re-run the sim to refresh when the catalogue
// or archetypes change (it prints a fresh block into REPORT.md §6).
const MARGIN_KNOTS: number[] = [
  0.00002, 0.00572, 0.01042, 0.01602, 0.02216, 0.02776, 0.033, 0.03794, 0.04382, 0.04855, // p0-9
  0.05417, 0.05897, 0.06361, 0.06736, 0.07178, 0.07696, 0.08146, 0.08586, 0.08994, 0.09451, // p10-19
  0.09932, 0.10427, 0.10903, 0.11393, 0.11912, 0.12411, 0.12954, 0.1349, 0.14052, 0.1467, // p20-29
  0.15484, 0.16134, 0.1676, 0.17282, 0.17972, 0.18529, 0.19078, 0.19638, 0.20083, 0.20634, // p30-39
  0.21269, 0.2182, 0.22429, 0.2306, 0.23679, 0.2428, 0.25049, 0.25822, 0.26578, 0.27356, // p40-49
  0.28182, 0.28958, 0.2977, 0.30574, 0.31302, 0.32005, 0.32763, 0.3357, 0.3434, 0.35143, // p50-59
  0.359, 0.3666, 0.37437, 0.38144, 0.38795, 0.39539, 0.40389, 0.41222, 0.42195, 0.43313, // p60-69
  0.44499, 0.45445, 0.46471, 0.47611, 0.48488, 0.49503, 0.50378, 0.51343, 0.52326, 0.53195, // p70-79
  0.54164, 0.55248, 0.5624, 0.57404, 0.58789, 0.60079, 0.61393, 0.62837, 0.64186, 0.65619, // p80-89
  0.66996, 0.69155, 0.71174, 0.73317, 0.75337, 0.77601, 0.80519, 0.84018, 0.88292, 0.94501, // p90-99
  1.18117, // p100
];

// Calibrate a margin → an honest 50-99 % via binary search over the ECDF knots (monotone by construction).
function calibratePct(margin: number): number {
  let lo = 0;
  let hi = MARGIN_KNOTS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (MARGIN_KNOTS[mid] < margin) lo = mid + 1;
    else hi = mid;
  }
  return 50 + Math.round((lo / 100) * 49);
}

// ── PHASE 2 — THE PER-USER RIDGE-LOGIT ENGINE (the live spine: persona + % + demand from ONE fit) ─────
// Reframe the swipe game as a per-session CHOICE-BASED CONJOINT instrument. Each swipe is one labelled row
// (axis one-hot → want/skip); we fit 6 signed weights w + bias b by minimising the ridge cross-entropy
//     J(w) = −Σ[ y·ln p + (1−y)·ln(1−p) ] + λ‖w‖²,   p = σ(w·x + b)
// via Newton/IRLS:  θ ← θ + (XᵀSX + λI_reg)⁻¹ Xᵀ(y − p),  S = diag(p(1−p)),  ridge on the 6 weights (not b).
// The fitted w is the single source of truth: persona = argmax_k (w·ĉ_k), demand = the 6 weights, and the
// % = the calibrated MARGIN of those same utilities — so the game's score and the sourcing KPI are literally
// one number. λ‖w‖² is the "learns over time" story: 8 swipes → w shrinks toward 0 (honest "no strong
// opinion yet"); as plays accumulate the data term outweighs λ and w sharpens (a single-user Bayesian update,
// the exact reduction of the Phase-2 Hierarchical-Bayes upgrade). VERIFIED in __sim__/REPORT.md §6: this path
// keeps the spread (p10≈55/p90≈94, std≈14.1) AND persona balance (max share 22.2%). The Phase-1 signed-vector
// path above is retained as the cold-start/degenerate-fit fallback.
const RIDGE_LAMBDA = 1.5; // ridge / Bayes-prior strength (matches the harness; re-tune there, not here)
const D_AX = AXES.length; // 6
const AXIS_IDX: Record<string, number> = {};
AXES.forEach((ax, i) => (AXIS_IDX[ax] = i));
const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

interface LogitFit {
  w: number[]; // 6 signed axis weights
  b: number; // bias
}

// One-hot ℝ⁶ feature for a fruit slug (matches the harness featureisation). Unknown slug → zero vector.
function featureOf(slug: string): number[] {
  const x = new Array(D_AX).fill(0);
  const ax = AXIS_OF[slug];
  if (ax != null) x[AXIS_IDX[ax]] = 1;
  return x;
}

// Gaussian elimination with partial pivoting — solves A·x = g for the small (7×7) Newton system.
function solveLinear(A: number[][], g: number[]): number[] {
  const n = g.length;
  const M = A.map((row, i) => [...row, g[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) continue; // ridge keeps singular cases rare; leave the row
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

// Fit w∈ℝ⁶, b∈ℝ by IRLS (≤8 Newton steps; 7 dims, ≤8 rows → sub-millisecond, client-side).
function fitLogit(rows: { x: number[]; y: number }[], lambda = RIDGE_LAMBDA, iters = 8): LogitFit {
  const n = D_AX + 1; // weights + bias
  const theta = new Array(n).fill(0); // [w0..w5, b]
  if (rows.length === 0) return { w: theta.slice(0, D_AX), b: 0 };
  for (let it = 0; it < iters; it++) {
    const g = new Array(n).fill(0);
    const H = Array.from({ length: n }, () => new Array(n).fill(0));
    for (const { x, y } of rows) {
      const xa = [...x, 1]; // augment with the bias feature
      let z = 0;
      for (let j = 0; j < n; j++) z += theta[j] * xa[j];
      const p = sigmoid(z);
      const s = Math.max(p * (1 - p), 1e-6); // floor keeps S well-conditioned
      for (let a = 0; a < n; a++) {
        g[a] += (y - p) * xa[a];
        for (let bb = 0; bb < n; bb++) H[a][bb] += s * xa[a] * xa[bb];
      }
    }
    for (let j = 0; j < D_AX; j++) {
      // ridge: penalise the 6 weights, NOT the bias
      g[j] -= lambda * theta[j];
      H[j][j] += lambda;
    }
    const step = solveLinear(H, g);
    for (let j = 0; j < n; j++) theta[j] += step[j];
  }
  return { w: theta.slice(0, D_AX), b: theta[D_AX] };
}

// Predicted P(want) for a feature row under the fit (used for the A1 self-fit accuracy).
function predictWant(fit: LogitFit, x: number[]): number {
  let z = fit.b;
  for (let j = 0; j < D_AX; j++) z += fit.w[j] * x[j];
  return sigmoid(z);
}

// Laplace posterior std: Σ = (XᵀSX + λI_reg)⁻¹ at the fit; RMS std over the 6 weights. Honest raw
// uncertainty (exposed, not the band driver — measured near-constant under λ in __sim__/REPORT.md §6).
function posteriorStdOf(rows: { x: number[]; y: number }[], fit: LogitFit, lambda = RIDGE_LAMBDA): number {
  const n = D_AX + 1;
  if (rows.length === 0) return Infinity;
  const H = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const { x } of rows) {
    const xa = [...x, 1];
    let z = fit.b;
    for (let j = 0; j < D_AX; j++) z += fit.w[j] * x[j];
    const p = sigmoid(z);
    const s = Math.max(p * (1 - p), 1e-6);
    for (let a = 0; a < n; a++) for (let bb = 0; bb < n; bb++) H[a][bb] += s * xa[a] * xa[bb];
  }
  for (let j = 0; j < D_AX; j++) H[j][j] += lambda;
  let acc = 0;
  for (let j = 0; j < D_AX; j++) {
    const e = new Array(n).fill(0);
    e[j] = 1;
    const col = solveLinear(H, e); // column j of Σ; its j-th entry is the posterior variance of weight j
    acc += Math.max(col[j], 0);
  }
  return Math.sqrt(acc / D_AX);
}

// Utility of archetype k under the fit = w · (mean-centred archetype vector). Same as the harness's wUtilities.
function archUtility(w: number[], centred: Record<string, number>): number {
  let u = 0;
  for (const ax of AXES) u += w[AXIS_IDX[ax]] * (centred[ax] ?? 0);
  return u;
}

// W_MARGIN_KNOTS[p] = p-th percentile (p=0..100) of the FITTED-w utility margin over the offline-simulated
// palate space. GENERATED by src/lib/__sim__/scoreSim.ts (§7) — DO NOT hand-edit; re-run the sim to refresh.
// The fitted w lives on a different scale than the Phase-1 signed vector, so it carries its OWN knots.
const W_MARGIN_KNOTS: number[] = [
  0.0, 0.0, 0.0, 0.00193, 0.00481, 0.00746, 0.01061, 0.01249, 0.01487, 0.01737, // p0-9
  0.02031, 0.02341, 0.02613, 0.02866, 0.03146, 0.0338, 0.03659, 0.03951, 0.04256, 0.0455, // p10-19
  0.0478, 0.05038, 0.05311, 0.0567, 0.05949, 0.06324, 0.06714, 0.06938, 0.0728, 0.07603, // p20-29
  0.07934, 0.08377, 0.08702, 0.09133, 0.09462, 0.09803, 0.10198, 0.10607, 0.11047, 0.11459, // p30-39
  0.11748, 0.12138, 0.12622, 0.12998, 0.13484, 0.13873, 0.14211, 0.14612, 0.15209, 0.15648, // p40-49
  0.16051, 0.16577, 0.17046, 0.17487, 0.18015, 0.18563, 0.19004, 0.19604, 0.20086, 0.20734, // p50-59
  0.21236, 0.21885, 0.22369, 0.23031, 0.23705, 0.24255, 0.24779, 0.25415, 0.25983, 0.26585, // p60-69
  0.27388, 0.28282, 0.29104, 0.29872, 0.30821, 0.31825, 0.32787, 0.338, 0.34661, 0.3565, // p70-79
  0.36509, 0.37511, 0.38523, 0.39776, 0.40722, 0.41668, 0.42735, 0.44116, 0.45334, 0.47068, // p80-89
  0.48511, 0.5067, 0.52704, 0.54339, 0.56728, 0.59581, 0.63711, 0.67481, 0.74103, 0.8179, // p90-99
  1.12443, // p100
];

// Calibrate a fitted-w utility margin → an honest 50-99 % via binary search over the ECDF knots.
function calibratePctW(margin: number): number {
  let lo = 0;
  let hi = W_MARGIN_KNOTS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (W_MARGIN_KNOTS[mid] < margin) lo = mid + 1;
    else hi = mid;
  }
  return 50 + Math.round((lo / 100) * 49);
}

export function scorePersona(picks: string[], skips: string[] = []): PersonaMatch {
  // Ordered, deduped winner slugs (most-wins first) — the demand signal. Ties → earliest-picked.
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const slug of picks) {
    if (!counts.has(slug)) order.push(slug);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  const winnerSlugs = [...order].sort((a, b) => {
    const d = (counts.get(b) ?? 0) - (counts.get(a) ?? 0);
    return d !== 0 ? d : order.indexOf(a) - order.indexOf(b);
  });

  const playerVector = playerVectorFrom(picks, skips);
  const confidence = DECK_SIZE > 0 ? Math.min(1, picks.length / DECK_SIZE) : 0;

  const ZERO_DEMAND = AXES.reduce((m, ax) => ((m[ax] = 0), m), {} as Record<Axis, number>);

  // No wants at all → honest FLOOR match against the default archetype (they gave us nothing to match on).
  if (winnerSlugs.length === 0) {
    return {
      persona: DEFAULT_PERSONA,
      matchPct: 50,
      winnerSlugs: [],
      playerVector,
      confidence,
      demandWeights: ZERO_DEMAND,
      selfFit: 0,
      selfFitN: 0,
      engineConfidence: 'low',
      posteriorStd: Infinity,
    };
  }

  // ── PHASE 2 SPINE: fit the per-user ridge-logit, derive persona + % + demand from the SAME w ──────────
  // Every swipe is a labelled row: each distinct WANT = y:1, each SKIP = y:0 (a SKIP is now a first-class
  // negative, not the clamped-away −0.35 the old algo discarded). Fit 6 signed weights → those weights ARE
  // the demand footprint; persona = the archetype whose mean-centred direction the weights most align with;
  // the % = the calibrated margin between the top-2 archetype utilities. One fit, three outputs.
  const skipSet = new Set(skips);
  const wantRows = winnerSlugs.map((s) => ({ x: featureOf(s), y: 1 }));
  const skipRows = [...skipSet].filter((s) => !counts.has(s)).map((s) => ({ x: featureOf(s), y: 0 }));
  const rows = [...wantRows, ...skipRows];
  const fit = fitLogit(rows);

  const utils = ARCH_CENTRED.map((a) => ({ persona: a.persona, u: archUtility(fit.w, a.vec) }));
  const finite = utils.every((x) => Number.isFinite(x.u));
  const ranked = utils.sort((a, b) => b.u - a.u);
  const margin = ranked.length > 1 ? ranked[0].u - ranked[1].u : ranked[0].u;

  // A1 self-fit — fraction of the player's OWN swipes the fitted model re-predicts correctly. The honest
  // "does this explain YOUR picks?" accuracy (shown as "explains 7/8 of your picks"). Coherent palate → high.
  let correct = 0;
  for (const r of rows) if (Math.round(predictWant(fit, r.x)) === r.y) correct++;
  const selfFit = rows.length > 0 ? correct / rows.length : 0;

  const demandWeights = AXES.reduce(
    (m, ax) => ((m[ax] = fit.w[AXIS_IDX[ax]]), m),
    {} as Record<Axis, number>,
  );
  const posteriorStd = posteriorStdOf(rows, fit);

  // Honest confidence band: evidence (#swipes) × coherence (selfFit). NOT the posterior Σ — measured
  // near-constant under the ridge prior (REPORT.md §6), so it can't discriminate; #swipes + selfFit can.
  const nSwipes = rows.length;
  const engineConfidence: 'high' | 'medium' | 'low' =
    nSwipes >= 6 && selfFit >= 0.75 ? 'high' : nSwipes <= 3 || selfFit < 0.6 ? 'low' : 'medium';

  // Degenerate fit (non-finite utilities — e.g. a pathological 1-row case) → fall back to the Phase-1
  // signed-vector margin so we never surface a NaN %. The cosine/signed path is retained for exactly this.
  if (!finite) {
    const signed = playerVectorSigned(winnerSlugs, skips);
    const fb = ARCH_CENTRED.map((a) => ({ persona: a.persona, s: dotAxis(signed, a.vec) })).sort(
      (a, b) => b.s - a.s,
    );
    const fbMargin = fb.length > 1 ? fb[0].s - fb[1].s : fb[0].s;
    return {
      persona: fb[0].persona,
      matchPct: calibratePct(fbMargin),
      winnerSlugs,
      playerVector,
      confidence,
      demandWeights: ZERO_DEMAND,
      selfFit,
      selfFitN: nSwipes,
      engineConfidence,
      posteriorStd,
    };
  }

  return {
    persona: ranked[0].persona,
    matchPct: calibratePctW(margin),
    winnerSlugs,
    playerVector,
    confidence,
    demandWeights,
    selfFit,
    selfFitN: nSwipes,
    engineConfidence,
    posteriorStd,
  };
}

// ── D (B1) — "your taste in three words" ──────────────────────────────────────────────────────────
// Top axes the player AND the persona both lean on → an adjective each. Pure derivation from the already-
// computed vector; no new data. Small, true, identity-shaped, shareable.
const AXIS_ADJ: Record<string, string> = {
  tropical: 'Floral',
  'berry-jewel': 'Jewel-toned',
  'tangy-crisp': 'Crisp',
  'heritage-mango': 'Bold',
  'exotic-rare': 'Rare',
  pantry: 'Patient',
};
export function tasteWords(playerVector: Record<string, number>, persona: TastePersona): string[] {
  return Object.keys(playerVector)
    .filter((ax) => playerVector[ax] > 0)
    .sort(
      (a, b) =>
        playerVector[b] * (persona.profile[b] ?? 0) - playerVector[a] * (persona.profile[a] ?? 0),
    )
    .slice(0, 3)
    .map((ax) => AXIS_ADJ[ax] ?? ax);
}

// ── D (B3) — the identity INSIGHT line (renders BEFORE the descriptive line) ─────────────────────────
// Archetype-anchored, seeded by the player's swipe pattern so a run is stable but runs vary.
export function insightLine(persona: TastePersona, wantSlugs: string[], skipSlugs: string[]): string {
  const set = persona.insightLines.length ? persona.insightLines : [0];
  const seed = `${persona.id}|${wantSlugs.join('>')}|${skipSlugs.join('>')}`;
  return INSIGHT_LINES[set[seededIndex(seed, set.length)]];
}

// ── D (B2) — AMAZON-STYLE ITEM-ITEM AFFINITY (seeded prior, honest framing) ───────────────────────────
// We have ZERO co-occurrence data, so this matrix is a HAND-AUTHORED seeded prior, declared as such. It
// ranks taste-affinity ONLY — we NEVER derive or display a population percentage from it ("X% of people
// also wanted…" would be a fabrication; the alsoLoved line is framed as taste-affinity instead).
//
// SWAP-TO-REAL SEAM: replace this object with a normalised slice of catalog-service's co-purchase /
// content-based recommender (`/products/{id}/recommendations`, the recommendations-hybrid pillar) once
// real orders exist; alternatively build it from in-game co-occurrence once Taste Match has real plays.
// `alsoLoved()` is the unchanged consumer either way. Keyed by AXIS (not slug) so the 14-fruit roster maps
// cleanly onto a small, hand-authorable, symmetric matrix; the suggested SLUG is resolved from the axis.
const AFFINITY_PRIOR: Record<Axis, Record<Axis, number>> = {
  tropical: { tropical: 1, 'berry-jewel': 0.4, 'tangy-crisp': 0.3, 'heritage-mango': 0.6, 'exotic-rare': 0.7, pantry: 0.55 },
  'berry-jewel': { tropical: 0.4, 'berry-jewel': 1, 'tangy-crisp': 0.6, 'heritage-mango': 0.35, 'exotic-rare': 0.6, pantry: 0.4 },
  'tangy-crisp': { tropical: 0.3, 'berry-jewel': 0.6, 'tangy-crisp': 1, 'heritage-mango': 0.25, 'exotic-rare': 0.55, pantry: 0.25 },
  'heritage-mango': { tropical: 0.6, 'berry-jewel': 0.35, 'tangy-crisp': 0.25, 'heritage-mango': 1, 'exotic-rare': 0.4, pantry: 0.6 },
  'exotic-rare': { tropical: 0.7, 'berry-jewel': 0.6, 'tangy-crisp': 0.55, 'heritage-mango': 0.4, 'exotic-rare': 1, pantry: 0.3 },
  pantry: { tropical: 0.55, 'berry-jewel': 0.4, 'tangy-crisp': 0.25, 'heritage-mango': 0.6, 'exotic-rare': 0.3, pantry: 1 },
};

export interface AlsoLoved {
  slug: string;
  fruit: DuelFruit;
}

// "People with your taste also loved" = weighted sum of affinity rows for the AXES the player WANTED,
// then suggest the highest-affinity fruit they did NOT already pick. Honest taste-affinity, NOT a stat.
// Honey/ghee (pantry, demand-only) are NEVER suggested as an "also loved" — the suggestion routes only to
// the 14 buyable fruits (an also-loved must be something the player could actually want to BUY). Pure,
// client-side, O(axes²).
export function alsoLoved(wantSlugs: string[], topN = 1): AlsoLoved[] {
  if (wantSlugs.length === 0) return [];
  const axisScore: Record<string, number> = {};
  for (const w of wantSlugs) {
    const ax = AXIS_OF[w];
    if (!ax) continue;
    for (const [other, a] of Object.entries(AFFINITY_PRIOR[ax])) {
      axisScore[other] = (axisScore[other] ?? 0) + a;
    }
  }
  // Rank candidate FRUITS (the 14 buyable only) the player hasn't already picked, by their axis affinity.
  const picked = new Set(wantSlugs);
  const candidates = FRUITS.filter((f) => !picked.has(f.slug)).map((f) => ({
    fruit: f,
    score: axisScore[AXIS_OF[f.slug]] ?? 0,
  }));
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, topN).map((c) => ({ slug: c.fruit.slug, fruit: c.fruit }));
}

// Short, friendly display words per slug — used by the natural-copy composer so the reveal line reads
// "Alphonso mango and litchi" rather than raw slugs. Derived from the fruit display names (first word or
// two), with the pantry items mapped to friendly words. Keep lowercase; the composer capitalises.
const FRUIT_WORD: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const f of POOL) {
    if (m[f.slug]) continue;
    // friendly short word: drop a trailing "Mango/Guava/etc." only when the name has a place prefix.
    m[f.slug] = f.demandOnly ? f.name.toLowerCase() : shortFruitWord(f);
  }
  return m;
})();

function shortFruitWord(f: DuelFruit): string {
  // Use a compact, recognisable phrase per slug for natural copy.
  const SHORT: Record<string, string> = {
    'alphonso-mango': 'Alphonso',
    'gir-kesar-mango': 'Kesar mango',
    'bhagalpuri-zardalu-mango': 'Zardalu mango',
    'shahi-litchi': 'Shahi litchi',
    'mahabaleshwar-strawberry': 'strawberry',
    'solapur-pomegranate': 'pomegranate',
    'purandar-fig': 'fig',
    'beed-custard-apple': 'custard apple',
    'allahabad-surkha-guava': 'guava',
    'nagpur-orange': 'orange',
    'dahanu-gholvad-chikoo': 'chikoo',
    'coorg-orange': 'Coorg orange',
    'mangosteen': 'mangosteen',
    'dragon-fruit': 'dragon fruit',
  };
  return SHORT[f.slug] ?? f.name.toLowerCase();
}

// ============================================================================================
// NATURAL, COMPOSED REVEAL COPY — reads the player's REAL picks (varied, conversational).
// Two players who land on the same archetype but swiped differently get genuinely different output.
// Determinism: phrasing is selected by a tiny seeded pick() off the player's own swipe pattern.
// ============================================================================================

export interface RevealCopy {
  /** D (B3): the identity insight line — renders FIRST (Wrapped order). */
  insight: string;
  /** The conversational descriptive line — composed from the player's real wants + skips (renders 2nd). */
  descriptive: string;
  /** The "challenge a friend" share line — also composed, varied per run. */
  shareLine: string;
  /** D (B1): "your taste in three words" — small, true, derived from the vector. */
  words: string[];
}

function naturalList(slugs: string[], max = 3): string {
  const words = slugs.map((s) => FRUIT_WORD[s] ?? s).slice(0, max);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0];
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function seededIndex(seed: string, modulo: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % Math.max(1, modulo);
}

// Compose the reveal copy from the real swipe pattern + the persona + the honest match.
//  - wantSlugs: ordered, deduped WANT-IT slugs (winnerSlugs from scorePersona).
//  - skipSlugs: ordered, deduped NAH slugs.
//  - matchPct: the HONEST match % (so the share line can quote a REAL number).
//  - confidence: wants/DECK_SIZE — tunes TONE only (a low-confidence run gets a softer framing).
export function composeRevealCopy(
  wantSlugs: string[],
  skipSlugs: string[],
  persona: TastePersona,
  matchPct: number,
  playerVector: Record<string, number> = {},
  confidence = 1,
): RevealCopy {
  const wants = wantSlugs.filter((s) => FRUIT_WORD[s]);
  const skips = skipSlugs.filter((s) => FRUIT_WORD[s] && !wants.includes(s));
  const seed = `${wantSlugs.join('>')}|${skipSlugs.join('>')}`;

  const insight = insightLine(persona, wantSlugs, skipSlugs);
  const words = tasteWords(playerVector, persona);

  // Edge case: swiped NAH on everything → lean on the archetype, but still acknowledge the behaviour.
  if (wants.length === 0) {
    const noneLines = [
      'You waved off the whole tray — picky, discerning, hard to please. Respect.',
      'Nothing made the cut today. You don’t fake enthusiasm, and honestly that’s rare.',
      'You skipped every single one — you clearly know exactly what you’re NOT here for.',
    ];
    return {
      insight,
      descriptive: noneLines[seededIndex(seed, noneLines.length)],
      shareLine: persona.shareLine,
      words,
    };
  }

  const wantList = naturalList(wants);
  const topWord = FRUIT_WORD[wants[0]] ?? wants[0];
  const skipList = skips.length ? naturalList(skips) : '';

  // D (B1): a low-confidence run (very few wants) gets a gentler "still getting a read" framing — TONE
  // only; the match % itself is untouched.
  const lowConfidence = confidence < 0.3 && wants.length <= 1;

  const withSkip = [
    `You went all-in on ${wantList} and waved off ${skipList} — a clear, decisive palate that knows its lane.`,
    `${cap(wantList)} got the yes; ${skipList} got the swipe. You chase what you love and don’t pretend about the rest.`,
    `Locked onto ${wantList}, skipped past ${skipList}. No fence-sitting — you taste with conviction.`,
    `Your hands said yes to ${wantList} and a hard no to ${skipList}. That’s not random — that’s a real point of view.`,
  ];
  const wantsOnly = [
    `You said yes to ${wantList} — generous palate, open to the good stuff, no overthinking it.`,
    `${cap(wantList)} all got the nod. You collect flavours instead of rationing them.`,
    `A clean sweep toward ${wantList}. When you like something, you don’t hide it.`,
  ];
  const single = lowConfidence
    ? [
        `Just ${topWord} so far — we’re still getting a read on you, but it’s a promising start.`,
        `${cap(topWord)} caught your eye. Play again and we’ll sharpen the picture of your palate.`,
      ]
    : [
        `It was ${topWord}, ${topWord} and more ${topWord} for you — when you find your fruit, you commit.`,
        `One clear favourite: ${topWord}. You’re not here to sample — you’re here for the one you love.`,
        `You zeroed in on ${topWord} and didn’t look back. Loyalty, basically.`,
      ];

  let pool: string[];
  if (wants.length === 1) pool = single;
  else if (skips.length) pool = withSkip;
  else pool = wantsOnly;
  const descriptive = pool[seededIndex(seed, pool.length)];

  // Share lines — composed from the real top pick + the REAL match %. NO fabricated population stat.
  const shareTemplates = [
    `I’m all about ${topWord}. Bet you can’t guess your own fruit →`,
    `Turns out I’m a ${Math.round(matchPct)}% ${persona.name}. What are you?`,
    `Apparently I’m ${persona.name}. Find your fruit before I do →`,
    `My palate picked ${wantList}. Yours won’t look the same — prove it.`,
  ];
  const shareLine = shareTemplates[seededIndex(seed + '#share', shareTemplates.length)];

  return { insight, descriptive, shareLine, words };
}

function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

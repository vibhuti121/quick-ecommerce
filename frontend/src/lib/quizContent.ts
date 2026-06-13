// "Find your MaLLADE match" — quiz CONTENT config (nuggets + vibe question + personas).
//
// This is the DATA layer the quiz UI (components/FruitQuiz.tsx) renders. It is intentionally
// data-driven so the signed-off CONTENT SHEET swaps in as a DATA-ONLY edit — no UI churn. The fruit
// OPTIONS themselves come from the live catalogue (lib/quizFruits.deriveQuizFruitsOrFallback); this
// module only carries the editorial copy keyed by the same fruit SLUGS ('litchi' | 'mango' | 'honey').
//
// COMPLIANCE NOTES (read before editing copy):
//  - Every string here is DRAFT placeholder copy pending founder/compliance sign-off. Do NOT present
//    any nutrition line as final until it's signed off — it stays clearly marked below.
//  - Honey carries NO nutrition nugget (nutrition:null): under FSSAI we make no defensible nutrition
//    claim for honey. Honey leads on taste/rarity + lab purity only, and is NOT GI-tagged.
//  - A nutrition line is only ever rendered WITH its cited source (nutritionSource) in muted small
//    text; never an uncited claim. A null nutrition simply renders no nutrition line at all.

/* PLACEHOLDER — pending founder sign-off. The shape is final; the strings are draft (fe-design's
   content sheet, NOT yet compliance-signed). Swap copy here only. */

// Per-fruit "vs your usual" nugget — the conversion moment. tasteRarity LEADS (always shown);
// provenanceChips render as small GI/lab pills; nutrition (+ its source) is optional + compliance-gated.
export interface FruitNugget {
  tasteRarity: string; // the lead line: taste + why it's rare vs the supermarket default
  nutrition: string | null; // optional cited nutrition line; null ⇒ no claim (e.g. honey/FSSAI)
  nutritionSource: string | null; // REQUIRED whenever nutrition is non-null; shown in muted small text
  provenanceChips: string[]; // e.g. ['GI ✓ GI-BR-0045', 'Cold-chained'] — short trust pills
}

// Keyed by fruit slug (lib/quizFruits SLUG_RULES: 'litchi' | 'mango' | 'honey'). A slug with no entry
// here simply shows no nugget (the grid card still works as a plain toggle).
export const FRUIT_NUGGETS: Record<string, FruitNugget> = {
  litchi: {
    tasteRarity:
      "Shahi Litchi — India's only GI-tagged litchi, prized for its rose-honey aroma and " +
      'translucent, near-seedless pulp; cold-chained within hours, not the watery cold-store ' +
      'litchi you usually get.',
    nutrition: 'Good source of vitamin C (~71 mg/100g).',
    nutritionSource: 'USDA FoodData Central',
    provenanceChips: ['GI ✓ GI-BR-0045', 'Cold-chained'],
  },
  mango: {
    tasteRarity:
      'Ratnagiri Alphonso (naturally tree-ripened, no calcium-carbide) plus GI-authorized ' +
      'Banaganapalle — saffron, fibreless, clean-sweet. Not the green-picked, gas-ripened ' +
      'supermarket mango.',
    nutrition: 'Good source of vitamin C (~36 mg/100g); provides vitamin A.',
    nutritionSource: 'USDA FoodData Central',
    provenanceChips: ['GI ✓ GI-AP-0123', 'Naturally ripened'],
  },
  honey: {
    // Honey: taste + rarity + LAB PURITY only. No nutrition claim (FSSAI). NOT GI-tagged.
    tasteRarity:
      'Raw, single-origin forest honey — Coorg Wild and Nilgiri Jungle — unheated, unblended, ' +
      'NABL lab-tested (C4-sugar and NMR adulteration panel passed).',
    nutrition: null, // no defensible nutrition claim for honey
    nutritionSource: null,
    provenanceChips: ['Lab-tested ✓ NABL', 'Raw / unheated'],
  },
};

// ---- the one "vibe" question ----------------------------------------------------------------------
// A single radio question (rendered in <fieldset><legend>) that biases the persona. Each option leans
// toward one of three flavour axes; the result combines that lean with the user's strongest fruit pick.
export type VibeLean = 'sweet' | 'tangy' | 'aromatic';

export interface VibeOption {
  id: string; // stable radio value, [a-z0-9-]
  label: string; // shown next to the radio
  lean: VibeLean; // which flavour axis this option biases toward
}

export interface VibeQuestion {
  prompt: string;
  options: VibeOption[];
}

/* PLACEHOLDER — pending founder sign-off (draft copy). */
export const VIBE_QUESTION: VibeQuestion = {
  prompt: 'When you reach for fruit, what hits the spot?',
  options: [
    { id: 'sweet', label: 'Sweet & mellow', lean: 'sweet' },
    { id: 'tangy', label: 'Bright & tangy', lean: 'tangy' },
    { id: 'aromatic', label: 'Aromatic & fancy', lean: 'aromatic' },
  ],
};

// ---- personas ------------------------------------------------------------------------------------
// A persona is earned by a (fruitLean × vibeLean) combo. `fruitLean` is matched against the user's
// STRONGEST fruit pick slug; 'any' matches any fruit. The first persona whose (fruitLean, vibeLean)
// both match wins; if none match we use the explicit `FALLBACK_PERSONA`. The Forest Wanderer (honey)
// is the fallback so an unusual/empty path still lands somewhere warm AND seeds the honey demand list.
export interface Persona {
  id: string; // stable id, [a-z0-9-]
  name: string;
  blurb: string;
  fruitLean: string; // a fruit slug ('litchi' | 'mango' | 'honey') or 'any'
  vibeLean: VibeLean;
}

/* PLACEHOLDER — pending founder sign-off (draft personas; keep premium + warm). */
export const PERSONAS: Persona[] = [
  {
    id: 'orchard-purist',
    name: 'The Orchard Purist',
    blurb:
      'You want the fruit exactly as the tree intended — saffron-deep, fragrant, nothing forced. ' +
      'Tree-ripened Alphonso is your love language.',
    fruitLean: 'mango',
    vibeLean: 'aromatic',
  },
  {
    id: 'sunshine-seeker',
    name: 'The Sunshine Seeker',
    blurb:
      'Clean, mellow sweetness is your happy place — a fibreless Alphonso on a warm afternoon, ' +
      'no notes. Easy joy, properly grown.',
    fruitLean: 'mango',
    vibeLean: 'sweet',
  },
  {
    id: 'rare-bloom-romantic',
    name: 'The Rare-Bloom Romantic',
    blurb:
      'You chase the fleeting and the fragrant — rose-honey Shahi litchi that arrives for a few ' +
      'weeks and then is gone. You like your fruit a little legendary.',
    fruitLean: 'litchi',
    vibeLean: 'aromatic',
  },
  {
    id: 'bright-spark',
    name: 'The Bright Spark',
    blurb:
      'Bright, lively, a little tangy — you like fruit that wakes you up. Whatever the season ' +
      'sends, you want it at its zingy peak.',
    fruitLean: 'any',
    vibeLean: 'tangy',
  },
];

// The Forest Wanderer is the explicit fallback (honey lean). Earning it — OR landing here by fallback
// — routes the shopper to the honey notify list (a demand signal, never a cart). Matched first when a
// user's strongest pick is honey; otherwise used as the catch-all when no PERSONAS combo matches.
export const FALLBACK_PERSONA: Persona = {
  id: 'forest-wanderer',
  name: 'The Forest Wanderer',
  blurb:
    'You go where the rare stuff is — raw, single-origin forest honey, unheated and unblended. ' +
    "You'll be first in line when the first drop lands.",
  fruitLean: 'honey',
  vibeLean: 'aromatic',
};

// Resolve the persona for a (strongest-fruit-pick, vibe) pair. Pure + total — always returns a
// persona. Honey-strongest ALWAYS lands on The Forest Wanderer (honey demand path) regardless of vibe.
export function resolvePersona(strongestFruitSlug: string | null, vibe: VibeLean | null): Persona {
  // Honey pick is the demand-signal path — it wins outright so a honey-curious shopper always lands
  // on the Forest Wanderer (→ honey notify list), never a fruit persona.
  if (strongestFruitSlug === 'honey') return FALLBACK_PERSONA;
  if (vibe) {
    const match = PERSONAS.find(
      (p) =>
        p.vibeLean === vibe &&
        (p.fruitLean === 'any' || p.fruitLean === strongestFruitSlug),
    );
    if (match) return match;
  }
  return FALLBACK_PERSONA;
}

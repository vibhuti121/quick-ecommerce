// Storefront "latest updates" — the announcements shown in the top carousel.
//
// Edit this list to change what scrolls at the top of the page. Frontend-only, no CMS: these are
// curated MaLLADE announcements (seasonal availability, launches, trust signals, offers). Keep each
// line short — one icon + a punchy phrase reads best as it auto-advances.

import { HONEY_IMAGE } from './comingSoon';

export interface Update {
  icon: string;
  text: string;
  image: string; // bundled banner under public/updates/ (served at /updates/<name>.svg)
}

export const UPDATES: Update[] = [
  {
    icon: '🍯',
    text: 'Litchi honey — coming soon. Tap a honey jar to get notified at launch.',
    image: HONEY_IMAGE, // real MaLLADE jar photo (shared with the honey product cards)
  },
  {
    icon: '🥭',
    text: 'Fresh Shahi litchi — in season now, shipping from Muzaffarpur.',
    image: '/updates/litchi.svg',
  },
  {
    icon: '✅',
    text: 'GI-tagged & lab-tested — every batch traceable to its farm.',
    image: '/updates/gi.svg',
  },
  {
    icon: '🚚',
    text: 'Free delivery on orders over ₹500.',
    image: '/updates/delivery.svg',
  },
];

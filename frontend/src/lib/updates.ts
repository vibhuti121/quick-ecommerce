// Storefront "latest updates" — the announcements shown in the top carousel.
//
// Edit this list to change what scrolls at the top of the page. Frontend-only, no CMS: these are
// curated MaLLADE announcements (seasonal availability, launches, trust signals, offers). Keep each
// line short — one icon + a punchy phrase reads best as it auto-advances.

import { HONEY_IMAGE } from './comingSoon';

// Each banner carries its OWN notify topic — the carousel's "🔔 Notify me" button signs the visitor up
// for THAT banner's subject (honey launch, litchi season, …), not one global list. Self-contained so the
// popup (NotifyModal) needs nothing but this object: `key` is the stable storage id (see saveNotify),
// `image`/`icon` reuse the banner's own art so the popup matches the banner that was clicked.
export interface NotifyTopic {
  key: string; // storage id, stable: 'honey' | 'litchi' | 'gi' | 'delivery'
  title: string; // popup heading
  blurb: string; // one-line description under the heading
  badge: string; // pill text, e.g. 'Coming Soon' / 'In season'
  image: string; // popup art (reuses the banner image)
  icon: string; // popup icon (reuses the banner icon)
}

export interface Update {
  icon: string;
  text: string;
  image: string; // bundled banner under public/updates/ (served at /updates/<name>.svg)
  notify: NotifyTopic; // per-banner notify-me subject
}

export const UPDATES: Update[] = [
  {
    icon: '🍯',
    text: 'Litchi honey — coming soon. Tap a honey jar to get notified at launch.',
    image: HONEY_IMAGE, // real MaLLADE jar photo (shared with the honey product cards)
    notify: {
      key: 'honey',
      title: 'Premium Raw Jungle Honey',
      blurb: 'Single-origin litchi-blossom honey, launching soon. Be first to know.',
      badge: 'Coming Soon',
      image: HONEY_IMAGE,
      icon: '🍯',
    },
  },
  {
    icon: '🥭',
    text: 'Fresh Shahi litchi — in season now, shipping from Muzaffarpur.',
    image: '/updates/litchi.svg',
    notify: {
      key: 'litchi',
      title: 'Fresh Shahi Litchi',
      blurb: 'In season now from Muzaffarpur. Get an alert before each fresh batch sells out.',
      badge: 'In season',
      image: '/updates/litchi.svg',
      icon: '🥭',
    },
  },
  {
    icon: '✅',
    text: 'GI-tagged & lab-tested — every batch traceable to its farm.',
    image: '/updates/gi.svg',
    notify: {
      key: 'gi',
      title: 'GI-tagged & lab-tested',
      blurb: 'Every batch traceable to its farm. Get our provenance & lab-report updates.',
      badge: 'Verified',
      image: '/updates/gi.svg',
      icon: '✅',
    },
  },
  {
    icon: '🚚',
    text: 'Free delivery on orders over ₹500.',
    image: '/updates/delivery.svg',
    notify: {
      key: 'delivery',
      title: 'Delivery & offers',
      blurb: 'Free delivery over ₹500. Get notified about new delivery areas and offers.',
      badge: 'Offer',
      image: '/updates/delivery.svg',
      icon: '🚚',
    },
  },
];

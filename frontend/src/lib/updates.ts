// Storefront "latest updates" — the announcements shown in the top carousel.
//
// Edit this list to change what scrolls at the top of the page. Frontend-only, no CMS: these are
// curated MaLLADE announcements (seasonal availability, launches, trust signals, offers). Keep each
// line short — one icon + a punchy phrase reads best as it auto-advances.

export interface Update {
  icon: string;
  text: string;
}

export const UPDATES: Update[] = [
  { icon: '🍯', text: 'Litchi honey — coming soon. Tap a honey jar to get notified at launch.' },
  { icon: '🥭', text: 'Fresh Shahi litchi — in season now, shipping from Muzaffarpur.' },
  { icon: '✅', text: 'GI-tagged & lab-tested — every batch traceable to its farm.' },
  { icon: '🚚', text: 'Free delivery on orders over ₹500.' },
];

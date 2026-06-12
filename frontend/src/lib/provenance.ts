import type { Product } from '../types';

// Shared provenance predicates so the card, the detail drawer, and the catalogue filters all agree on
// what earns a trust claim. Pure + defensive (provenance is optional on a Product).

// GI badge is earned ONLY by gi.status === 'authorized' (compliance rule — pending/none don't qualify).
export function isGiTagged(p: Pick<Product, 'provenance'>): boolean {
  return p.provenance?.gi?.status === 'authorized';
}

// "Lab-tested" means the adulteration/quality panel PASSED — pending/failed don't earn the claim.
export function isLabTested(p: Pick<Product, 'provenance'>): boolean {
  return (p.provenance?.labCert?.status ?? '').toLowerCase() === 'passed';
}

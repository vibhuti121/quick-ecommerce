// UX-only memory of "this browser already filled the Tally form" — mirrors lib/comingSoon.ts:
// pure, synchronous, defensive, never throws. This is NOT a security check: the real eligibility
// gate is the server record on videocall-service (POST /api/videocall/eligibility). This flag only
// lets a returning user skip re-seeing the form; if it's wrong, the server's grant call corrects it.

const ELIGIBLE_KEY = 'qe.videocallEligible';

export function isLocallyEligible(): boolean {
  try {
    return localStorage.getItem(ELIGIBLE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markLocallyEligible(): void {
  try {
    localStorage.setItem(ELIGIBLE_KEY, 'true');
  } catch {
    /* quota / disabled storage — the server record still governs eligibility */
  }
}

// The Tally form is embedded; this is the embed URL for form eqz9o0 (https://tally.so/forms/eqz9o0).
export const TALLY_EMBED_URL = 'https://tally.so/embed/eqz9o0?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1';

// Tally posts a window 'message' when its embedded form is submitted. The payload is a JSON string
// like {"event":"Tally.FormSubmitted",...}. Parse defensively and return true only on a real submit.
export function isTallySubmitMessage(data: unknown): boolean {
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    return !!parsed && typeof parsed === 'object'
      && (parsed as { event?: string }).event === 'Tally.FormSubmitted';
  } catch {
    return false;
  }
}

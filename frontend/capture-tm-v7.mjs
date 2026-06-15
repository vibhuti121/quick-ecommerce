/**
 * capture-tm-v7.mjs — Taste Match V7 conversion-layer screenshots + assertions.
 * Throwaway / NOT committed.  Run: node capture-tm-v7.mjs
 * Dev server must be up on :5173.  Captures into ./proto-shots.
 *
 * Proves the four V7 surfaces:
 *   (1) login-to-claim CTA appears in the reveal when something real was earned (a new region),
 *       and the inline panel opens with the Google button HIDDEN (no VITE_GOOGLE_CLIENT_ID) and
 *       the email/phone + password fallback + register toggle + no-thanks visible.
 *   (2) exit-intent nudge fires ONCE (mouse leaves through the top) and is dismissible.
 *   (3) State → PIN → City capture order in the notify form (State is a <select>).
 *   (4) reduced-motion: the claim panel renders static (no expand), keyboard focus ring visible.
 *
 * Captures (./proto-shots):
 *   v7-01-claim-cue.png        reveal with the collapsed claim CTA under the celebration banner
 *   v7-02-claim-panel.png      expanded inline login panel (Google hidden, email/phone fallback)
 *   v7-03-claim-register.png   the register-mode toggle state
 *   v7-04-exit-nudge.png       the gentle bottom exit-intent toast
 *   v7-05-capture-statefirst.png  the notify form, State select first → PIN → City
 *   v7-06-reduced-motion.png   reduced-motion reveal + claim (static)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/Users/vibhutiraman/code/quick-ecommerce/frontend/proto-shots';
const BASE = 'http://localhost:5174/?taste-match';
mkdirSync(OUT, { recursive: true });

const KEYS = [
  'mallade.tastematch.streak.v5',
  'mallade.tastematch.xp.v6',
  'mallade.tastematch.passport.v6',
  'mallade.tastematch.exitNudgeShown',
  'qe.guestToken',
];

async function freshGuest(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate((keys) => {
    keys.forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
  }, KEYS);
  await page.reload({ waitUntil: 'networkidle' });
}

// Under reduced-motion the deck renders tappable static buttons (.tm-static-btn) — deterministic.
// Want-it (right) on every card lights regions → guarantees a "new region" claimable in the reveal.
async function playRunStatic(page) {
  await page.waitForSelector('.tm-intro', { timeout: 10000 });
  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  for (let i = 0; i < 12; i++) {
    if ((await page.locator('.tm-reveal').count()) > 0) break;
    const want = page.locator('.tm-static-btn:has-text("WANT")').first();
    if ((await want.count()) === 0) {
      // fall back to any first static button
      const any = page.locator('.tm-static-btn').first();
      if ((await any.count()) === 0) { await page.waitForTimeout(300); continue; }
      await any.click();
    } else {
      await want.click();
    }
    await page.waitForTimeout(250);
  }
  await page.waitForSelector('.tm-reveal', { timeout: 12000 });
  await page.waitForTimeout(500);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });

// ── 1+2+3) claim CTA + panel + register toggle (reduced-motion ctx for a deterministic static run) ──
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('[err]', m.text().split('\n')[0].slice(0, 160));
  });

  await freshGuest(page);
  await playRunStatic(page);

  const cueCount = await page.locator('.tm-claim-cue').count();
  const savedCount = await page.locator('.tm-claim-saved').count();
  console.log(`[claim] cue=${cueCount} saved(loggedin)=${savedCount} (expect cue>=1 for a guest who earned)`);

  if (cueCount > 0) {
    await page.locator('.tm-claim-cue').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/v7-01-claim-cue.png` });
    console.log('captured v7-01-claim-cue.png');

    await page.locator('.tm-claim-cue').first().click();
    await page.waitForSelector('.tm-claim-panel', { timeout: 5000 });
    await page.waitForTimeout(300);

    const googleVisible = await page.locator('.tm-claim-google').count();
    const idField = await page.locator('#tm-claim-id').count();
    const skip = await page.locator('.tm-claim-skip').count();
    console.log(`[panel] google-slot=${googleVisible} (expect 0, no client-id) idField=${idField} noThanks=${skip}`);

    await page.locator('.tm-claim-panel').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/v7-02-claim-panel.png` });
    console.log('captured v7-02-claim-panel.png');

    // register toggle
    await page.locator('.tm-claim-toggle-mode').click();
    await page.waitForTimeout(200);
    const submitText = (await page.locator('.tm-claim-submit').textContent())?.trim();
    console.log(`[panel] after toggle submit="${submitText}" (expect "Create account & save")`);
    await page.screenshot({ path: `${OUT}/v7-03-claim-register.png` });
    console.log('captured v7-03-claim-register.png');

    // keyboard focus ring on the id field (a11y)
    await page.locator('#tm-claim-id').focus();
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/v7-06-reduced-motion.png` });
    console.log('captured v7-06-reduced-motion.png (focus ring, static panel)');
  } else {
    console.log('[claim] NOTE: no claim cue surfaced — re-run (region not lit this shuffle).');
  }
  await ctx.close();
}

// ── 4) exit-intent nudge — fires once when the pointer leaves through the top edge ─────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await freshGuest(page);
  // seed real progress so the nudge is armed (xp + a discovery), without playing a full run.
  await page.evaluate(() => {
    localStorage.setItem('mallade.tastematch.xp.v6', JSON.stringify({ xp: 140, plays: 2 }));
    localStorage.setItem(
      'mallade.tastematch.passport.v6',
      JSON.stringify({ discovered: ['mango', 'litchi'] }),
    );
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.tm-intro', { timeout: 10000 });
  await page.waitForTimeout(400);

  // simulate exit-intent: move to the middle, then out through the top edge (clientY <= 0, no relatedTarget).
  await page.mouse.move(550, 400);
  await page.mouse.move(550, 0);
  await page.dispatchEvent('body', 'mouseout', { clientY: 0, relatedTarget: null }).catch(() => {});
  await page.evaluate(() => {
    const ev = new MouseEvent('mouseout', { clientY: 0, bubbles: true });
    Object.defineProperty(ev, 'relatedTarget', { value: null });
    document.dispatchEvent(ev);
  });
  await page.waitForTimeout(500);
  const nudge = await page.locator('.tm-exit-nudge').count();
  console.log(`[exit] nudge visible=${nudge} (expect 1)`);
  if (nudge > 0) {
    await page.screenshot({ path: `${OUT}/v7-04-exit-nudge.png` });
    console.log('captured v7-04-exit-nudge.png');
    // assert once-per-session: dismiss + re-trigger → should NOT reappear.
    await page.locator('.tm-exit-nudge-skip').click();
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const ev = new MouseEvent('mouseout', { clientY: 0, bubbles: true });
      Object.defineProperty(ev, 'relatedTarget', { value: null });
      document.dispatchEvent(ev);
    });
    await page.waitForTimeout(400);
    const again = await page.locator('.tm-exit-nudge').count();
    console.log(again === 0 ? '[exit] PASS — once-per-session (no re-fire)' : '[exit] FAIL — re-fired');
  }
  await ctx.close();
}

// ── 5) State-first capture form (State <select> → PIN → City) ─────────────────────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await freshGuest(page);
  await playRunStatic(page);

  // open the secondary capture (the "want first dibs" toggle).
  const toggle = page.locator('.tm-capture-toggle');
  if ((await toggle.count()) > 0) {
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
    await page.waitForSelector('.coming-soon-form', { timeout: 5000 });
    await page.waitForTimeout(300);

    // assert the FIRST location field is the State <select>.
    const labels = await page.locator('.coming-soon-label').allTextContents();
    console.log('[capture] field labels in order:', JSON.stringify(labels.map((l) => l.trim())));
    const stateIsSelect = (await page.locator('#notify-state').evaluate((el) => el.tagName)) === 'SELECT';
    console.log(`[capture] #notify-state tag = ${stateIsSelect ? 'SELECT (PASS)' : 'INPUT (FAIL)'}`);

    // pick a state to show auto-fill of city = capital.
    await page.selectOption('#notify-state', 'Karnataka').catch(() => {});
    await page.waitForTimeout(200);
    const city = await page.locator('#notify-city').inputValue();
    console.log(`[capture] state=Karnataka → city auto-filled="${city}" (expect Bengaluru)`);

    await page.locator('.coming-soon-form').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/v7-05-capture-statefirst.png` });
    console.log('captured v7-05-capture-statefirst.png');
  } else {
    console.log('[capture] NOTE: capture toggle not found (reveal may differ this shuffle).');
  }
  await ctx.close();
}

await browser.close();
console.log('\nAll V7 captures done. Output dir:', OUT);

/**
 * capture-tm-v4.mjs — Taste Match V4 JUICE-PASS prototype screenshots.
 * Throwaway / NOT committed.  Run: node capture-tm-v4.mjs
 * Viewport: 390×844 (iPhone-ish 9:16).  Dev server must be up on :5173.
 *
 * Captures: intro, deck idle, MID-DRAG (card following cursor + tint + stamp), social-proof flash,
 * reveal climax (count-up + shimmer mid-sweep), capture-open, reduced-motion.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT  = '/Users/vibhutiraman/code/quick-ecommerce/frontend/proto-shots';
const BASE = 'http://localhost:5174/?taste-match';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function shot(page, file) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
  console.log('captured', file);
}

// Drag to a HELD mid-point (does NOT release) → capture the continuous-drag moment, then release past
// threshold to commit. `midShot` captures with the card held mid-drag.
async function swipeHold(page, dir, midShot) {
  const card = page.locator('.tm-swipe-card').first();
  if (await card.count() === 0) return false;
  const b = await card.boundingBox();
  if (!b) return false;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  // partial drag, held — card following cursor, tint + stamp rising, just past threshold for "armed".
  await page.mouse.move(cx + dir * 135, cy - 8, { steps: 14 });
  if (midShot) {
    await page.waitForTimeout(260);
    await page.screenshot({ path: `${OUT}/${midShot}` });
    console.log('captured', midShot);
  }
  await page.mouse.move(cx + dir * 330, cy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(1100);
  return true;
}

async function swipe(page, dir) {
  return swipeHold(page, dir, null);
}

// ── 1) Normal motion ──────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') console.log('[console-error]', t.split('\n')[0]);
    if (t.includes('PROTOTYPE')) console.log('[stub]', t.split('\n')[0].slice(0, 140));
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  await page.waitForSelector('.tm-intro-hero-photo', { timeout: 10000 });
  await page.waitForTimeout(550);
  await shot(page, 'v4-01-intro.png');

  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(700);
  await shot(page, 'v4-02-deck.png');

  // #1 — capture the CONTINUOUS DRAG mid-gesture (card following + tint + WANT IT! armed)
  await swipeHold(page, 1, 'v4-03-mid-drag.png');

  // swipe to card index 2, then the next swipe (index 2 committed) should trigger the social-proof flash
  await swipe(page, -1);  // card 1 (index 1)
  // now on index 2: swipe and immediately try to catch the flash
  {
    const card = page.locator('.tm-swipe-card').first();
    const b = await card.boundingBox();
    if (b) {
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 330, cy, { steps: 8 });
      await page.mouse.up();
    }
    // the flash mounts right after commit — grab it fast
    await page.waitForSelector('.tm-social-proof', { timeout: 2500 }).catch(() => {});
    await page.waitForTimeout(260);
    const hasProof = await page.locator('.tm-social-proof').count();
    if (hasProof) {
      const txt = await page.locator('.tm-social-proof').textContent().catch(() => '');
      console.log('[social-proof] visible:', JSON.stringify(txt));
    } else {
      console.log('[social-proof] WARN — not visible at capture time');
    }
    await page.screenshot({ path: `${OUT}/v4-04-social-proof.png` });
    console.log('captured v4-04-social-proof.png');
    await page.waitForTimeout(1100);
  }

  // push through the rest of the 9-card deck → reveal
  for (let i = 0; i < 16; i++) {
    if (await page.locator('.tm-reveal').count() > 0) break;
    const ok = await swipe(page, i % 2 === 0 ? 1 : -1);
    if (!ok) {
      await page.waitForTimeout(600);
      if (await page.locator('.tm-reveal').count() > 0) break;
    }
  }

  // #2 — capture the reveal EARLY so the count-up + shimmer are mid-animation (juicy climax)
  await page.waitForSelector('.tm-reveal', { timeout: 15000 });
  await page.waitForTimeout(700); // shimmer sweep + count-up are running ~0.45-1.5s in
  await shot(page, 'v4-05-reveal-climax.png');

  const revealState = await page.evaluate(() => ({
    kicker: document.querySelector('.tm-reveal-kicker')?.textContent?.trim(),
    copy: document.querySelector('.tm-reveal-copy')?.textContent?.replace(/\s+/g, ' ').trim(),
    stat: document.querySelector('.tm-reveal-stat')?.textContent?.replace(/\s+/g, ' ').trim(),
    shareCta: document.querySelector('.tm-sharecard-cta')?.textContent?.trim(),
    hasShimmer: !!document.querySelector('.tm-shimmer'),
    hasSparks: !!document.querySelector('.tm-sparks'),
  }));
  console.log('[reveal]', JSON.stringify(revealState));

  // settle, then capture-open
  await page.waitForTimeout(1200);
  const toggle = page.locator('.tm-capture-toggle').first();
  if (await toggle.count() > 0) {
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
    await page.waitForSelector('.tm-capture-panel', { timeout: 5000 });
    await page.locator('.tm-capture-panel').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/v4-06-capture-open.png` });
    console.log('captured v4-06-capture-open.png');
  }

  await ctx.close();
}

// ── 2) Reduced-motion ─────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tm-intro', { timeout: 10000 });
  await page.waitForTimeout(400);

  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/v4-07-reduced-deck.png` });
  console.log('captured v4-07-reduced-deck.png');

  const swipeCount  = await page.locator('.tm-swipe-card').count();
  const staticCount = await page.locator('.tm-static-card').count();
  console.log(`[reduced-motion] tm-swipe-card=${swipeCount}  tm-static-card=${staticCount}`);
  console.log(swipeCount === 0 && staticCount > 0
    ? '[reduced-motion] PASS — static fallback rendered, no drag layer'
    : '[reduced-motion] FAIL — unexpected card state');

  // tap through with the static buttons to the reveal, confirm count-up shows final value immediately
  for (let i = 0; i < 12; i++) {
    if (await page.locator('.tm-reveal').count() > 0) break;
    const btn = page.locator(i % 2 === 0 ? '.tm-static-btn-want' : '.tm-static-btn-nah').first();
    if (await btn.count() === 0) break;
    await btn.click();
    await page.waitForTimeout(120);
  }
  await page.waitForSelector('.tm-reveal', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const num = await page.locator('.tm-rarity-num').textContent().catch(() => '?');
  const hasShimmer = await page.locator('.tm-shimmer').count();
  console.log(`[reduced-motion reveal] rarity-num="${num}" shimmerSpan=${hasShimmer} (expect final value + 0 shimmer)`);
  await page.screenshot({ path: `${OUT}/v4-08-reduced-reveal.png` });
  console.log('captured v4-08-reduced-reveal.png');

  await ctx.close();
}

await browser.close();
console.log('\nAll V4 captures done. Output dir:', OUT);

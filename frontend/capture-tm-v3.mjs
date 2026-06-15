/**
 * capture-tm-v3.mjs  — Taste Match V3 prototype screenshots.
 * Throwaway / NOT committed.  Run: node capture-tm-v3.mjs
 * Viewport: 390×844 (iPhone-ish 9:16).  Dev server must be up on :5173.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT  = '/Users/vibhutiraman/code/quick-ecommerce/frontend/proto-shots';
const BASE = 'http://localhost:5173/?taste-match';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function shot(page, file) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
  console.log('captured', file);
}

// drag one card past threshold by direction (+1 want / -1 nah); waits for the throw + next mount.
async function swipe(page, dir, holdShot) {
  const card = page.locator('.tm-swipe-card').first();
  if (await card.count() === 0) return false;
  const b = await card.boundingBox();
  if (!b) return false;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dir * 150, cy, { steps: 12 });
  if (holdShot) {
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${OUT}/${holdShot}` });
    console.log('captured', holdShot);
  }
  await page.mouse.move(cx + dir * 320, cy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(1100);
  return true;
}

// ── 1) Normal motion ──────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('[console-error]', m.text().split('\n')[0]); });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // v3-01-intro.png — the NEW full-bleed darkened hero
  await page.waitForSelector('.tm-intro-hero-photo', { timeout: 10000 });
  await page.waitForTimeout(500); // let hero image decode
  await shot(page, 'v3-01-intro.png');

  // → deck
  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(700);
  await shot(page, 'v3-02-deck.png'); // idle top card (editorial-graded photo)

  // first swipe right, hold to show the WANT IT! stamp
  await swipe(page, 1, 'v3-02b-want-stamp.png');

  // push through the rest of the 9-card deck → reveal
  for (let i = 0; i < 16; i++) {
    if (await page.locator('.tm-reveal').count() > 0) break;
    const prog = await page.locator('.tm-progress-label').textContent().catch(() => '?');
    const ok = await swipe(page, i % 2 === 0 ? 1 : -1, null);
    console.log(`  swipe ${i + 2} (prog="${prog}") ok=${ok}`);
    if (!ok) {
      // no swipe card present — either reveal arrived or a transient gap; wait + recheck
      await page.waitForTimeout(600);
      if (await page.locator('.tm-reveal').count() > 0) break;
    }
  }

  // v3-03-reveal.png — climax-first reveal (persona + rarity stat + share/swipe-again; capture hidden)
  await page.waitForSelector('.tm-reveal', { timeout: 15000 });
  await page.waitForTimeout(500);
  await shot(page, 'v3-03-reveal.png');

  // log the reveal hierarchy + that capture is hidden behind the toggle
  const revealState = await page.evaluate(() => ({
    kicker: document.querySelector('.tm-reveal-kicker')?.textContent?.trim(),
    stat: document.querySelector('.tm-reveal-stat')?.textContent?.replace(/\s+/g, ' ').trim(),
    hasShare: !!document.querySelector('.tm-share'),
    hasReplay: !!document.querySelector('.tm-replay'),
    captureFormVisible: !!document.querySelector('.tm-capture-panel'),
    captureToggleVisible: !!document.querySelector('.tm-capture-toggle'),
  }));
  console.log('[reveal] hierarchy:', JSON.stringify(revealState));

  // v3-03b-capture-open.png — secondary capture expanded (the ask, below the climax)
  const toggle = page.locator('.tm-capture-toggle').first();
  if (await toggle.count() > 0) {
    await toggle.scrollIntoViewIfNeeded();
    await toggle.click();
    await page.waitForSelector('.tm-capture-panel', { timeout: 5000 });
    await page.waitForTimeout(300);
    // scroll the panel into view for the shot
    await page.locator('.tm-capture-panel').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/v3-03b-capture-open.png` });
    console.log('captured v3-03b-capture-open.png');
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
  await page.screenshot({ path: `${OUT}/v3-04-reduced-intro.png` });
  console.log('captured v3-04-reduced-intro.png');

  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/v3-04-reduced-motion.png` });
  console.log('captured v3-04-reduced-motion.png');

  const swipeCount  = await page.locator('.tm-swipe-card').count();
  const staticCount = await page.locator('.tm-static-card').count();
  console.log(`[reduced-motion] tm-swipe-card=${swipeCount}  tm-static-card=${staticCount}`);
  console.log(swipeCount === 0 && staticCount > 0
    ? '[reduced-motion] PASS — static fallback rendered, no drag layer'
    : '[reduced-motion] FAIL — unexpected card state');

  // keyboard reachability of the static buttons
  await page.click('.tm-progress-label');
  await page.keyboard.press('Tab');
  const f1 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  await page.keyboard.press('Tab');
  const f2 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  console.log('[keyboard] Tab1:', f1, '| Tab2:', f2);

  await ctx.close();
}

await browser.close();
console.log('\nAll V3 captures done. Output dir:', OUT);

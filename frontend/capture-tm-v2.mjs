/**
 * capture-tm-v2.mjs  — Taste Match V2 prototype screenshots.
 * Throwaway / NOT committed.  Run: node capture-tm-v2.mjs
 * Viewport: 390×844 (iPhone-ish 9:16).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT  = '/Users/vibhutiraman/code/quick-ecommerce/frontend/proto-shots';
const BASE = 'http://localhost:5173/?taste-match';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function shot(page, file) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
  console.log('captured', file);
}

// ── 1) Normal motion context ─────────────────────────────────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() === 'error') console.log('[console-error]', m.text().split('\n')[0]);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // v2-01-intro.png
  await page.waitForSelector('.tm-intro', { timeout: 10000 });
  await shot(page, 'v2-01-intro.png');

  // Advance to deck
  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(600); // let card entrance animate

  // v2-02-deck.png  (idle top card)
  await shot(page, 'v2-02-deck.png');

  // v2-02b-want-stamp.png  (drag right far enough to show WANT IT! stamp but hold)
  const card = page.locator('.tm-swipe-card').first();
  let box = await card.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    // Move to 150px right of center — enough to show stamp; don't release so we can screenshot
    await page.mouse.move(cx + 150, cy, { steps: 10 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/v2-02b-want-stamp.png` });
    console.log('captured v2-02b-want-stamp.png');
    // Release — commits the card (150 > 110 threshold)
    await page.mouse.up();
    await page.waitForTimeout(800);
  }

  // v2-02c-nah-stamp.png  (drag left to show NAH stamp, hold for screenshot)
  const card2 = page.locator('.tm-swipe-card').first();
  const box2 = await card2.boundingBox();
  if (box2) {
    const cx2 = box2.x + box2.width / 2;
    const cy2 = box2.y + box2.height / 2;
    await page.mouse.move(cx2, cy2);
    await page.mouse.down();
    await page.mouse.move(cx2 - 150, cy2, { steps: 10 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/v2-02c-nah-stamp.png` });
    console.log('captured v2-02c-nah-stamp.png');
    await page.mouse.up();
    await page.waitForTimeout(800);
  }

  // Swipe through remaining 4 cards using JS clicks on the card actions to trigger commits
  // We'll evaluate JS to call React's commit via clicking the chip hint area.
  // Actually: inject keyboard-triggered clicks on the SwipeCard using evaluate to speed through
  // For headless Playwright, the most reliable approach is: override the mouse to drag past threshold
  for (let i = 0; i < 4; i++) {
    const swipeCard = page.locator('.tm-swipe-card').first();
    const count = await swipeCard.count();
    if (count === 0) {
      console.log(`card ${i+3}: no swipe card found, checking for reveal...`);
      break;
    }
    const b = await swipeCard.boundingBox();
    if (!b) break;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const dir = i % 2 === 0 ? 1 : -1;  // alternate want/nah
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dir * 160, cy, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(900); // wait for throw animation + next card mount
  }

  // v2-03-reveal.png  (persona reveal card)
  try {
    await page.waitForSelector('.tm-reveal', { timeout: 15000 });
    await shot(page, 'v2-03-reveal.png');
    console.log('[reveal] persona reveal captured OK');
  } catch (e) {
    console.log('[reveal] timed out — checking deck state');
    const remaining = await page.locator('.tm-swipe-card').count();
    const progress = await page.locator('.tm-progress-label').textContent().catch(() => 'n/a');
    console.log(`remaining swipe cards=${remaining}, progress="${progress}"`);
    // Force through remaining cards
    for (let i = 0; i < 6; i++) {
      const sc = page.locator('.tm-swipe-card').first();
      if (await sc.count() === 0) break;
      const b2 = await sc.boundingBox();
      if (!b2) break;
      const cx3 = b2.x + b2.width / 2;
      const cy3 = b2.y + b2.height / 2;
      await page.mouse.move(cx3, cy3);
      await page.mouse.down();
      await page.mouse.move(cx3 + 160, cy3, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(900);
    }
    await page.waitForSelector('.tm-reveal', { timeout: 10000 });
    await shot(page, 'v2-03-reveal.png');
  }

  await ctx.close();
}

// ── 2) Reduced-motion context ────────────────────────────────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() === 'error') console.log('[console-error-rm]', m.text().split('\n')[0]);
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tm-intro', { timeout: 10000 });
  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(300);

  // v2-04-reduced-motion.png  — must show tm-static-card NOT tm-swipe-card
  await page.screenshot({ path: `${OUT}/v2-04-reduced-motion.png` });
  console.log('captured v2-04-reduced-motion.png');

  // Confirm static vs swipe card
  const swipeCount  = await page.locator('.tm-swipe-card').count();
  const staticCount = await page.locator('.tm-static-card').count();
  console.log(`[reduced-motion] tm-swipe-card=${swipeCount}  tm-static-card=${staticCount}`);
  if (swipeCount === 0 && staticCount > 0) {
    console.log('[reduced-motion] PASS — static fallback rendered, no drag layer');
  } else {
    console.log('[reduced-motion] FAIL — unexpected card state');
  }

  // Keyboard tab test — the Want it / Nah buttons should be reachable
  // Focus the page first by clicking outside interactive elements
  await page.click('.tm-progress-label');
  // Tab twice: first lands on NAH, second on WANT IT
  await page.keyboard.press('Tab');
  const focused1 = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    cls: document.activeElement?.className,
    aria: document.activeElement?.getAttribute('aria-label'),
  }));
  console.log('[keyboard] Tab 1 focused:', JSON.stringify(focused1));

  await page.keyboard.press('Tab');
  const focused2 = await page.evaluate(() => ({
    tag: document.activeElement?.tagName,
    cls: document.activeElement?.className,
    aria: document.activeElement?.getAttribute('aria-label'),
  }));
  console.log('[keyboard] Tab 2 focused:', JSON.stringify(focused2));

  // Check :focus-visible outline is visible
  const wantBtn = page.locator('.tm-static-btn-want').first();
  await wantBtn.focus();
  await page.waitForTimeout(100);
  const ringStyle = await page.evaluate(() => {
    const el = document.querySelector('.tm-static-btn-want');
    if (!el) return 'element not found';
    const cs = window.getComputedStyle(el);
    return `outline: ${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`;
  });
  console.log('[keyboard] .tm-static-btn-want computed outline:', ringStyle);

  // Check :focus-visible CSS rule exists for tm-static-btn
  const hasFocusVisible = await page.evaluate(() => {
    const sheets = Array.from(document.styleSheets);
    for (const sheet of sheets) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        for (const rule of rules) {
          if (rule.cssText && rule.cssText.includes('tm-static-btn') && rule.cssText.includes('focus')) {
            return rule.selectorText + ': outline=' + rule.style?.outline;
          }
        }
      } catch { /* cross-origin */ }
    }
    return 'not found';
  });
  console.log('[keyboard] focus-visible CSS rule:', hasFocusVisible);

  await ctx.close();
}

await browser.close();
console.log('\nAll captures done. Output dir:', OUT);
// This file is already done — just a note that box-shadow was verified separately

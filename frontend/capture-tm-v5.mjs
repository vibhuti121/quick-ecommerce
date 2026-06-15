/**
 * capture-tm-v5.mjs — Taste Match V5 prototype screenshots.
 * Throwaway / NOT committed.  Run: node capture-tm-v5.mjs
 * Viewport: 390×844 (iPhone-ish 9:16).  Dev server must be up on :5173.
 *
 * Captures: intro (first-time state), mid-drag, honest-% reveal, habit-streak result,
 * deck-variability A+B, reduced-motion deck + reveal.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT  = '/Users/vibhutiraman/code/quick-ecommerce/frontend/proto-shots';
const BASE = 'http://localhost:5173/?taste-match';  // V5 is on :5173 (confirmed live)
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });

async function shot(page, file) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: false });
  console.log('captured', file);
}

// Drag to a HELD mid-point (does NOT release) → capture, then release past threshold.
// Mirrors V4's swipeHold helper.
async function swipeHold(page, dir, midShot) {
  const card = page.locator('.tm-swipe-card').first();
  if (await card.count() === 0) return false;
  const b = await card.boundingBox();
  if (!b) return false;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
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

// Swipe all remaining cards until reveal appears (or we've tried enough times)
async function swipeToReveal(page) {
  for (let i = 0; i < 14; i++) {
    if (await page.locator('.tm-reveal').count() > 0) break;
    const ok = await swipe(page, i % 2 === 0 ? 1 : -1);
    if (!ok) {
      await page.waitForTimeout(600);
      if (await page.locator('.tm-reveal').count() > 0) break;
    }
  }
  await page.waitForSelector('.tm-reveal', { timeout: 12000 });
}

// ── 1) v5-01-intro.png: first-time state (clear localStorage first) ──────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') console.log('[console-error]', t.split('\n')[0].slice(0, 200));
    if (t.includes('PROTOTYPE')) console.log('[stub]', t.split('\n')[0].slice(0, 160));
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  // Clear the streak key so we see first-time "Play daily — build your taste streak" state
  await page.evaluate(() => {
    localStorage.removeItem('mallade.tastematch.streak.v5');
  });
  // Reload to pick up the cleared state
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.tm-intro', { timeout: 10000 });
  await page.waitForTimeout(600);

  // Log the intro copy for audit
  const introCopy = await page.evaluate(() => ({
    streakPill: document.querySelector('.tm-streak-pill')?.textContent?.trim(),
    drop: document.querySelector('.tm-intro-drop')?.textContent?.trim(),
    title: document.querySelector('#taste-match-title')?.textContent?.replace(/\s+/g, ' ').trim(),
  }));
  console.log('[intro]', JSON.stringify(introCopy));

  await page.screenshot({ path: `${OUT}/v5-01-intro.png` });
  console.log('captured v5-01-intro.png');
  await ctx.close();
}

// ── 2) v5-02-mid-drag.png: card held mid-drag ─────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() === 'error') console.log('[console-error]', m.text().split('\n')[0].slice(0, 200));
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tm-intro', { timeout: 10000 });
  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(700);

  // hold mid-drag rightward (WANT IT! direction, arm the stamp)
  await swipeHold(page, 1, 'v5-02-mid-drag.png');
  await ctx.close();
}

// ── 3+4) v5-03-reveal.png + v5-04-habit-streak.png: honest % reveal + streak ─────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() === 'error') console.log('[console-error]', m.text().split('\n')[0].slice(0, 200));
    if (m.text().includes('PROTOTYPE')) console.log('[stub]', m.text().split('\n')[0].slice(0, 160));
  });

  // Use a fresh streak so we get the "day 1 streak" result line on reveal
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('mallade.tastematch.streak.v5'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.tm-intro', { timeout: 10000 });
  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });

  // Swipe through the full deck
  await swipeToReveal(page);

  // Wait ~700ms for count-up to run, then screenshot
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/v5-03-reveal.png` });
  console.log('captured v5-03-reveal.png');

  // Log the reveal headline + share badge text (the honest % + persona)
  const revealState = await page.evaluate(() => ({
    stat: document.querySelector('.tm-reveal-stat')?.textContent?.replace(/\s+/g, ' ').trim(),
    matchNum: document.querySelector('.tm-match-num')?.textContent?.trim(),
    shareBadge: document.querySelector('.tm-sharecard-rare')?.textContent?.trim(),
    kicker: document.querySelector('.tm-reveal-kicker')?.textContent?.trim(),
    copy: document.querySelector('.tm-reveal-copy')?.textContent?.replace(/\s+/g, ' ').trim(),
    streakResult: document.querySelector('.tm-streak-result')?.textContent?.trim(),
  }));
  console.log('[reveal]', JSON.stringify(revealState));

  // v5-04: scroll to .tm-streak-result and screenshot
  const streakEl = page.locator('.tm-streak-result').first();
  const streakCount = await streakEl.count();
  if (streakCount > 0) {
    await streakEl.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/v5-04-habit-streak.png` });
    console.log('captured v5-04-habit-streak.png');
  } else {
    console.log('[streak] WARN — .tm-streak-result not found in DOM; taking full reveal screenshot instead');
    await page.screenshot({ path: `${OUT}/v5-04-habit-streak.png` });
    console.log('captured v5-04-habit-streak.png (fallback — streak element not found)');
  }

  await ctx.close();
}

// ── 5) v5-05-deck-variability-A+B.png: prove different deck order on replay ──────────────────
// The deck is a stack — only the top card is in the DOM at a time. Collect titles per-swipe.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() === 'error') console.log('[console-error]', m.text().split('\n')[0].slice(0, 200));
  });

  async function collectDeckTitles(page) {
    const titles = [];
    // Record the title of the current top card before each swipe
    for (let i = 0; i < 10; i++) {
      if (await page.locator('.tm-reveal').count() > 0) break;
      const titleEl = page.locator('.tm-card-title').first();
      if (await titleEl.count() === 0) { await page.waitForTimeout(400); continue; }
      const t = await titleEl.textContent().catch(() => '?');
      titles.push(t?.trim());
      await swipe(page, i % 2 === 0 ? 1 : -1);
    }
    return titles;
  }

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tm-intro', { timeout: 10000 });

  // ── Play A ──
  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(700);

  // Screenshot the first card of play A before any swiping
  await page.screenshot({ path: `${OUT}/v5-05-deck-variability-A.png` });
  console.log('captured v5-05-deck-variability-A.png');

  const titlesA = await collectDeckTitles(page);
  console.log('[variability-A deck order]', JSON.stringify(titlesA));

  // Wait for reveal, then replay
  await page.waitForSelector('.tm-reveal', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(400);
  const replayBtn = page.locator('.tm-replay').first();
  if (await replayBtn.count() > 0) {
    await replayBtn.click();
  } else {
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.tm-intro', { timeout: 10000 });
    await page.click('.tm-start');
  }
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(700);

  // Screenshot the first card of play B
  await page.screenshot({ path: `${OUT}/v5-05-deck-variability-B.png` });
  console.log('captured v5-05-deck-variability-B.png');

  const titlesB = await collectDeckTitles(page);
  console.log('[variability-B deck order]', JSON.stringify(titlesB));

  // card[0] = daily drop (same both plays by design). Check that subsequent cards differ.
  const aAfterFirst = titlesA.slice(1);
  const bAfterFirst = titlesB.slice(1);
  const differ = JSON.stringify(aAfterFirst) !== JSON.stringify(bAfterFirst);
  console.log(`[variability] card[0] A="${titlesA[0]}" B="${titlesB[0]}" (expected SAME — daily drop)`);
  console.log(`[variability] cards after drop differ: ${differ ? 'YES — PASS' : 'NO — check buildDeck seeding'}`);

  await ctx.close();
}

// ── 6) v5-06-reduced-motion.png: reduced-motion context ──────────────────────────────────────
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() === 'error') console.log('[console-error]', m.text().split('\n')[0].slice(0, 200));
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tm-intro', { timeout: 10000 });
  await page.waitForTimeout(400);
  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(300);

  // Assert: 0 swipe cards, >0 static cards
  const swipeCount  = await page.locator('.tm-swipe-card').count();
  const staticCount = await page.locator('.tm-static-card').count();
  console.log(`[reduced-motion] tm-swipe-card=${swipeCount} tm-static-card=${staticCount}`);
  console.log(swipeCount === 0 && staticCount > 0
    ? '[reduced-motion] PASS — static fallback rendered, no drag layer'
    : `[reduced-motion] FAIL — swipe=${swipeCount} static=${staticCount}`);

  // Also verify static buttons have aria-labels
  const ariaLabels = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.tm-static-btn')).map(b => ({
      text: b.textContent?.trim(),
      label: b.getAttribute('aria-label'),
      tag: b.tagName,
    }));
  });
  console.log('[reduced-motion a11y]', JSON.stringify(ariaLabels));

  await page.screenshot({ path: `${OUT}/v5-06-reduced-motion.png` });
  console.log('captured v5-06-reduced-motion.png');

  // Tap through to reveal with static buttons
  for (let i = 0; i < 12; i++) {
    if (await page.locator('.tm-reveal').count() > 0) break;
    const btn = page.locator(i % 2 === 0 ? '.tm-static-btn-want' : '.tm-static-btn-nah').first();
    if (await btn.count() === 0) break;
    await btn.click();
    await page.waitForTimeout(120);
  }
  await page.waitForSelector('.tm-reveal', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);

  // Verify count-up shows final value immediately (no animation in reduced-motion) + no shimmer
  const matchNum = await page.locator('.tm-match-num').textContent().catch(() => '?');
  const shimmerCount = await page.locator('.tm-shimmer').count();
  console.log(`[reduced-motion reveal] match-num="${matchNum}" shimmerSpan=${shimmerCount} (expect final value + 0 shimmer)`);

  // Also check .tm-match-num is not mid-animation (should be a real number, not 0 or empty)
  const numVal = parseInt(matchNum ?? '0', 10);
  if (numVal > 0 && shimmerCount === 0) {
    console.log('[reduced-motion reveal] PASS — final value shown immediately, 0 shimmer');
  } else {
    console.log(`[reduced-motion reveal] CHECK — match=${matchNum} shimmer=${shimmerCount}`);
  }

  // Optional: v5-07-reduced-reveal.png
  await page.screenshot({ path: `${OUT}/v5-07-reduced-reveal.png` });
  console.log('captured v5-07-reduced-reveal.png');

  // a11y: check Start button focus visibility (Tab to it on the intro before starting)
  // (already in deck phase; check the static card buttons instead)
  const btnFocus = await page.evaluate(() => {
    const btn = document.querySelector('.tm-static-btn-want');
    if (!btn) return 'not-found';
    btn.focus();
    const s = getComputedStyle(btn);
    return { outline: s.outline, outlineColor: s.outlineColor, outlineWidth: s.outlineWidth };
  });
  console.log('[a11y focus-ring static-btn-want]', JSON.stringify(btnFocus));

  await ctx.close();
}

await browser.close();
console.log('\nAll V5 captures done. Output dir:', OUT);

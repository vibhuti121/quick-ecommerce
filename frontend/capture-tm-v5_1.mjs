/**
 * capture-tm-v5_1.mjs — Taste Match V5.1 refinement screenshots + assertions.
 * Throwaway / NOT committed.  Run: node capture-tm-v5_1.mjs
 * Viewport: 390×844 (iPhone-ish 9:16).  Dev server must be up on :5173.
 *
 * Proves the two founder changes:
 *   (1) DAILY DROP is FRUIT-ONLY — the intro hero / first card is a buyable fruit, never honey/ghee.
 *   (2) LAB-TESTED demand-only cards — honey + the NEW ghee card carry the "Lab-tested" badge.
 * Plus: the persona reveal still works, and reduced-motion still renders the static fallback.
 *
 * Captures:
 *   v5_1-01-intro-fruit-hero.png   intro hero (asserts drop name is a FRUIT)
 *   v5_1-02-honey-lab-badge.png    a honey card showing the Lab-tested badge
 *   v5_1-03-ghee-lab-badge.png     the NEW ghee card showing the Lab-tested badge
 *   v5_1-04-reveal.png             the honest persona reveal
 *   v5_1-05-reduced-motion.png     reduced-motion static deck
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/Users/vibhutiraman/code/quick-ecommerce/frontend/proto-shots';
const BASE = 'http://localhost:5173/?taste-match';
mkdirSync(OUT, { recursive: true });

const DEMAND_ONLY_NAMES = new Set(['Wildflower Honey', 'Litchi Honey', 'Bilona Ghee']);

const browser = await chromium.launch({ channel: 'chrome', headless: true });

// Walk the swipe deck card-by-card; before each swipe, capture a screenshot when the current top card
// matches `wantTitle`. Returns the ordered list of card titles seen + whether a shot was taken.
async function walkDeck(page, { capture } = {}) {
  const titles = [];
  const shotsTaken = {};
  for (let i = 0; i < 12; i++) {
    if (await page.locator('.tm-reveal').count() > 0) break;
    const titleEl = page.locator('.tm-card-title').first();
    if ((await titleEl.count()) === 0) { await page.waitForTimeout(350); continue; }
    const t = (await titleEl.textContent().catch(() => '?'))?.trim();
    titles.push(t);
    // capture: { 'Bilona Ghee': 'file.png', ... } — screenshot when this card is on top + has a badge.
    if (capture && capture[t] && !shotsTaken[t]) {
      const hasBadge = (await page.locator('.tm-card .tm-lab-badge').count()) > 0;
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${capture[t]}` });
      shotsTaken[t] = { file: capture[t], hasBadge };
      console.log(`captured ${capture[t]} (top card="${t}", lab-badge=${hasBadge})`);
    }
    await swipe(page, i % 2 === 0 ? 1 : -1);
  }
  return { titles, shotsTaken };
}

async function swipe(page, dir) {
  const card = page.locator('.tm-swipe-card').first();
  if ((await card.count()) === 0) { await page.waitForTimeout(400); return false; }
  const b = await card.boundingBox();
  if (!b) return false;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dir * 140, cy - 6, { steps: 12 });
  await page.mouse.move(cx + dir * 340, cy, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(950);
  return true;
}

// ── 1) intro: assert the daily-drop hero is a FRUIT (not honey/ghee) ─────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('[err]', m.text().split('\n')[0].slice(0, 160)); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('mallade.tastematch.streak.v5'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.tm-intro', { timeout: 10000 });
  await page.waitForTimeout(600);

  const drop = (await page.locator('.tm-intro-drop').textContent())?.replace(/\s+/g, ' ').trim();
  console.log('[intro] drop copy:', JSON.stringify(drop));
  const isDemandOnly = [...DEMAND_ONLY_NAMES].some(n => drop?.includes(n));
  console.log(isDemandOnly
    ? '[intro] FAIL — daily-drop hero is a DEMAND-ONLY item!'
    : '[intro] PASS — daily-drop hero is a FRUIT (not honey/ghee)');

  await page.screenshot({ path: `${OUT}/v5_1-01-intro-fruit-hero.png` });
  console.log('captured v5_1-01-intro-fruit-hero.png');
  await ctx.close();
}

// ── 2+3) deck: capture honey + ghee cards with the Lab-tested badge; assert first card is a fruit ──
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('[err]', m.text().split('\n')[0].slice(0, 160)); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tm-intro', { timeout: 10000 });
  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(600);

  // First card must be a fruit (the daily-drop hero leads the deck).
  const firstCard = (await page.locator('.tm-card-title').first().textContent())?.trim();
  const firstBadge = (await page.locator('.tm-card .tm-lab-badge').count()) > 0;
  console.log(`[deck] first card="${firstCard}" lab-badge=${firstBadge} (expect a fruit, NO badge)`);
  console.log(!DEMAND_ONLY_NAMES.has(firstCard) && !firstBadge
    ? '[deck] PASS — first card is a fruit with no Lab-tested badge'
    : '[deck] FAIL — first card is demand-only / shows a badge');

  // Walk the deck and snap the honey + ghee cards when they surface.
  const { titles, shotsTaken } = await walkDeck(page, {
    capture: {
      'Wildflower Honey': 'v5_1-02-honey-lab-badge.png',
      'Litchi Honey': 'v5_1-02-honey-lab-badge.png',
      'Bilona Ghee': 'v5_1-03-ghee-lab-badge.png',
    },
  });
  console.log('[deck order]', JSON.stringify(titles));
  // Assert: every demand-only card we captured had the badge.
  for (const [name, info] of Object.entries(shotsTaken)) {
    console.log(`[badge] "${name}" → ${info.hasBadge ? 'PASS (Lab-tested badge present)' : 'FAIL (no badge)'}`);
  }
  if (!Object.keys(shotsTaken).some(n => n.includes('Honey')))
    console.log('[badge] note: no honey card surfaced in this shuffled run (re-run to catch it)');
  if (!shotsTaken['Bilona Ghee'])
    console.log('[badge] note: ghee card did not surface in this shuffled run (re-run to catch it)');

  await ctx.close();
}

// ── 4) reveal: the honest persona reveal ─────────────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() === 'error') console.log('[err]', m.text().split('\n')[0].slice(0, 160));
    if (m.text().includes('PROTOTYPE')) console.log('[stub]', m.text().split('\n')[0].slice(0, 160));
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.removeItem('mallade.tastematch.streak.v5'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.tm-intro', { timeout: 10000 });
  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await walkDeck(page);
  await page.waitForSelector('.tm-reveal', { timeout: 12000 });
  await page.waitForTimeout(700);

  const reveal = await page.evaluate(() => ({
    stat: document.querySelector('.tm-reveal-stat')?.textContent?.replace(/\s+/g, ' ').trim(),
    badge: document.querySelector('.tm-sharecard-rare')?.textContent?.trim(),
    copy: document.querySelector('.tm-reveal-copy')?.textContent?.replace(/\s+/g, ' ').trim(),
  }));
  console.log('[reveal]', JSON.stringify(reveal));
  await page.screenshot({ path: `${OUT}/v5_1-04-reveal.png` });
  console.log('captured v5_1-04-reveal.png');
  await ctx.close();
}

// ── 5) reduced-motion: static deck still renders; badge inert ────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('[err]', m.text().split('\n')[0].slice(0, 160)); });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tm-intro', { timeout: 10000 });
  await page.click('.tm-start');
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(400);

  const swipeCount = await page.locator('.tm-swipe-card').count();
  const staticCount = await page.locator('.tm-static-card').count();
  console.log(`[reduced-motion] swipe=${swipeCount} static=${staticCount}`);
  console.log(swipeCount === 0 && staticCount > 0
    ? '[reduced-motion] PASS — static fallback, no drag layer'
    : '[reduced-motion] FAIL');

  // Tap through to catch a demand-only static card if one is in the first slots; snap whatever's on top.
  await page.screenshot({ path: `${OUT}/v5_1-05-reduced-motion.png` });
  console.log('captured v5_1-05-reduced-motion.png');
  await ctx.close();
}

await browser.close();
console.log('\nAll V5.1 captures done. Output dir:', OUT);

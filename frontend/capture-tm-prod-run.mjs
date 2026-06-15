/**
 * Final data-read pass — runs 1 and 2 reveal data + normal-motion deck screenshot.
 * THROWAWAY, NOT COMMITTED.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = '/Users/vibhutiraman/code/quick-ecommerce/frontend/proto-shots/prod-v8';
mkdirSync(OUT, { recursive: true });

const PROD_URL = 'https://mallde.in/?taste-match';

const LS_KEYS = [
  'mallade.tastematch.streak.v5',
  'mallade.tastematch.xp.v6',
  'mallade.tastematch.passport.v6',
  'mallade.tastematch.exitNudgeShown',
  'qe.guestToken',
];

const WANT_KEYWORDS = ['alphonso', 'kesar', 'zardalu', 'mango'];

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
    ...opts,
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => {
    if (m.type() === 'error') {
      const txt = m.text();
      if (!txt.includes('cdn-cgi') && !txt.includes('favicon')) errs.push(txt.slice(0, 200));
    }
  });
  page.on('pageerror', err => errs.push('[JS] ' + err.message.slice(0, 200)));
  return { ctx, page, errs };
}

async function freshLoad(page) {
  await page.goto(PROD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.evaluate(keys => keys.forEach(k => localStorage.removeItem(k)), LS_KEYS);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
}

async function scrollToTM(page) {
  await page.evaluate(() => {
    const el = document.querySelector('.taste-match');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(500);
}

async function playStatic(page, wantFn) {
  const cards = [];
  for (let i = 0; i < 12; i++) {
    if (await page.locator('.tm-reveal').count() > 0) break;
    const title = (await page.locator('.tm-card-title').first().textContent().catch(() => '')).trim();
    const isWant = wantFn(title.toLowerCase());
    cards.push({ title, decision: isWant ? 'WANT' : 'NAH' });
    const btn = page.locator(isWant ? '.tm-static-btn-want' : '.tm-static-btn-nah').first();
    if (await btn.count() > 0) await btn.click();
    else await page.keyboard.press(isWant ? 'ArrowRight' : 'ArrowLeft');
    await page.waitForTimeout(700);
  }
  await page.waitForSelector('.tm-reveal', { timeout: 20000 });
  await page.waitForTimeout(2000);
  return cards;
}

async function readReveal(page) {
  return page.evaluate(() => {
    const t = sel => document.querySelector(sel)?.textContent?.trim() ?? null;
    const cnt = sel => document.querySelectorAll(sel).length;
    const bodyText = document.body.innerText;
    return {
      idStripPresent: cnt('.tm-id-strip') > 0,
      idGuestText: t('.tm-id-guest'),
      idSavedText: t('.tm-id-saved'),
      stripPresent: cnt('.tm-strip') > 0,
      xpChipCount: cnt('.tm-xp-chip'),
      xpChipTexts: Array.from(document.querySelectorAll('.tm-xp-chip')).map(e => e.textContent?.trim()),
      accuracyPresent: cnt('.tm-accuracy') > 0,
      accuracyText: t('.tm-accuracy'),
      confPipText: t('.tm-conf-pip'),
      confPipClass: document.querySelector('.tm-conf-pip')?.className ?? null,
      passportPresent: cnt('.tm-passport-map, [class*="passport-map"]') > 0,
      passport14: bodyText.includes('/14'),
      rankMascotPresent: cnt('.tm-rank-mascot, [class*="rank-mascot"]') > 0,
      tierBarPresent: cnt('.tm-xp-bar, [class*="xp-bar"]') > 0,
      heroNameText: t('.tm-hero-name'),
      heroLearning: cnt('.tm-hero-learning') > 0,
      heroInsight: t('.tm-hero-insight'),
      heroMatchText: t('.tm-hero-match'),
      heroMatchNum: (() => {
        // Try several selectors
        return t('.tm-match-num') ??
          t('[class*="match-num"]') ??
          (() => {
            const m = document.querySelector('.tm-hero-match');
            if (!m) return null;
            const nums = m.textContent?.match(/\d+/);
            return nums ? nums[0] + '%' : null;
          })();
      })(),
      heroWords: Array.from(document.querySelectorAll('.tm-hero-word')).map(e => e.textContent?.trim()),
      sharePresent: cnt('.tm-hero-share') > 0,
      accPresent: cnt('.tm-acc') > 0,
      shimmerCount: cnt('.tm-shimmer'),
      sparkCount: cnt('.tm-sparks'),
      videoCount: cnt('video'),
      posteriorStdVisible: bodyText.includes('posteriorStd') || bodyText.includes('Infinity'),
    };
  });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });

// ── RUN 1: COHERENT (heritage-mango) ────────────────────────────────────────────────────────────
console.log('\n=== RUN 1: Coherent (heritage-mango, reduced-motion) ===');
let r1 = {}, r1cards = [];
{
  const { ctx, page, errs } = await newPage(browser, { reducedMotion: 'reduce' });
  await freshLoad(page);
  await scrollToTM(page);
  await page.screenshot({ path: `${OUT}/run1-01-intro.png` });

  await page.locator('.tm-start').click();
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/run1-02-deck.png` });

  r1cards = await playStatic(page, t => WANT_KEYWORDS.some(k => t.includes(k)));
  console.log('  cards:', r1cards.map(c => `"${c.title}"→${c.decision}`).join(' | '));

  await scrollToTM(page);
  await page.screenshot({ path: `${OUT}/run1-03-reveal-full.png`, fullPage: true });

  const strip = page.locator('.tm-strip');
  if (await strip.count() > 0) {
    await strip.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/run1-04-strip.png` });
  }

  const hero = page.locator('.tm-hero-card');
  if (await hero.count() > 0) {
    await hero.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/run1-05-hero.png` });
  }

  const acc = page.locator('.tm-acc');
  if (await acc.count() > 0) {
    await acc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/run1-06-accordion.png` });
  }

  r1 = { ...(await readReveal(page)), consoleErrors: errs };
  await ctx.close();
}

// ── RUN 2: SPARSE (all-NAH) ─────────────────────────────────────────────────────────────────────
console.log('\n=== RUN 2: Sparse (all-NAH → low-confidence) ===');
let r2 = {}, r2cards = [];
{
  const { ctx, page, errs } = await newPage(browser, { reducedMotion: 'reduce' });
  await freshLoad(page);
  await scrollToTM(page);
  await page.screenshot({ path: `${OUT}/run2-01-intro.png` });

  await page.locator('.tm-start').click();
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/run2-02-deck.png` });

  r2cards = await playStatic(page, () => false);
  console.log('  cards:', r2cards.map(c => `"${c.title}"→${c.decision}`).join(' | '));

  await scrollToTM(page);
  await page.screenshot({ path: `${OUT}/run2-03-reveal-full.png`, fullPage: true });

  const hero = page.locator('.tm-hero-card');
  if (await hero.count() > 0) {
    await hero.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/run2-04-hero.png` });
  }

  r2 = { ...(await readReveal(page)), consoleErrors: errs };
  await ctx.close();
}

// ── NORMAL MOTION DECK SCREENSHOT (no reveal needed) ────────────────────────────────────────────
console.log('\n=== Normal motion deck snapshot ===');
{
  const { ctx, page, errs } = await newPage(browser);
  await freshLoad(page);
  await scrollToTM(page);
  await page.screenshot({ path: `${OUT}/norm-01-intro.png` });

  await page.locator('.tm-start').click();
  await page.waitForSelector('.tm-deck', { timeout: 10000 });
  await page.waitForTimeout(1500);

  // Scroll deck into view
  await page.locator('.tm-deck').scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);

  const swipe = await page.locator('.tm-swipe-card').count();
  const stat = await page.locator('.tm-static-card').count();
  console.log('  SwipeCard:', swipe, '(expect 1 in normal motion)');
  console.log('  StaticCard:', stat, '(expect 0 in normal motion)');

  // Screenshot: confirm swipe card (not static) is rendered
  await page.screenshot({ path: `${OUT}/norm-02-deck-swipecard.png` });
  console.log('  snap: deck with swipe card rendered');

  // Screenshot: card shows WANT IT! / NAH chips (inline visual in normal mode)
  const chips = await page.locator('.tm-card-chip').count();
  const stamps = await page.locator('.tm-stamp').count();
  console.log('  .tm-card-chip count:', chips, '(the WANT/NAH labels on the swipe card)');
  console.log('  .tm-stamp count:', stamps, '(WANT IT!/NAH stamps hidden until drag)');
  console.log('  Errors:', errs.length, errs.slice(0, 3));
  await ctx.close();
}

await browser.close();

// ── FINAL COMBINED REPORT ────────────────────────────────────────────────────────────────────────
console.log('\n\n======================== DIRECTION A REVEAL CHECKLIST ========================');
console.log('PROD URL:', PROD_URL);
console.log('Output dir:', OUT);

console.log('\n── RUN 1: Coherent (heritage-mango, 4 WANTs / 4 NAHs) ──');
console.log('Cards:', r1cards.map(c => `"${c.title}"→${c.decision}`).join(' | '));
console.log('');
console.log('[TOP] (A) ID strip present:', r1.idStripPresent, '(expect true)');
console.log('[TOP] (A) Guest indicator text:', r1.idGuestText ?? '[MISSING — FAIL]');
console.log('[TOP] (A) Saved indicator (should be null for guest):', r1.idSavedText ?? 'null (CORRECT)');
console.log('');
console.log('[STRIP] (B) Progression strip:', r1.stripPresent ? 'PRESENT' : 'MISSING');
console.log('[STRIP] (B) XP chips:', r1.xpChipCount, '(expect 3) | texts:', JSON.stringify(r1.xpChipTexts));
console.log('[STRIP] (B) Accuracy section:', r1.accuracyPresent ? 'PRESENT' : 'MISSING');
console.log('[STRIP] (B) Accuracy text:', r1.accuracyText);
console.log('[STRIP] (B) Confidence pip:', r1.confPipText, '| class:', r1.confPipClass);
console.log('[STRIP] (B) Passport map:', r1.passportPresent ? 'PRESENT' : 'MISSING');
console.log('[STRIP] (B) Passport N/14:', r1.passport14 ? 'text contains /14 (PRESENT)' : 'NOT FOUND');
console.log('[STRIP] (B) Rank mascot:', r1.rankMascotPresent ? 'PRESENT' : 'MISSING');
console.log('[STRIP] (B) Tier bar:', r1.tierBarPresent ? 'PRESENT' : 'MISSING');
console.log('');
console.log('[HERO] (C) Persona name:', r1.heroNameText ?? '[MISSING — FAIL]');
console.log('[HERO] (C) Insight line:', r1.heroInsight ?? '[MISSING]');
console.log('[HERO] (C) Match line text:', r1.heroMatchText ?? '[MISSING]');
console.log('[HERO] (C) Match%:', r1.heroMatchNum ?? '[MISSING — FAIL]');
console.log('[HERO] (C) Still Learning (should be FALSE):', r1.heroLearning);
console.log('[HERO] (C) Taste words:', r1.heroWords);
console.log('[HERO] (C) Share button:', r1.sharePresent ? 'PRESENT' : 'MISSING');
console.log('');
console.log('[HONEST] posteriorStd NOT shown:', !r1.posteriorStdVisible, '(true = PASS)');
console.log('[ERRORS] Console errors:', r1.consoleErrors?.length ?? 0);
if (r1.consoleErrors?.length) r1.consoleErrors.slice(0, 5).forEach(e => console.log('   ', e));

console.log('\n── RUN 2: Sparse (all-NAH → low-confidence) ──');
console.log('Cards:', r2cards.map(c => `"${c.title}"→${c.decision}`).join(' | '));
console.log('');
console.log('[TOP] (A) Guest indicator:', r2.idGuestText ?? '[MISSING]');
console.log('[LOW-CONF] Still Learning class shown (expect TRUE):', r2.heroLearning);
console.log('[LOW-CONF] Hero name content:', r2.heroNameText ?? '[none]');
console.log('[LOW-CONF] Match% shown (expect none for low-conf):', r2.heroMatchNum ?? 'null (correct)');
console.log('[LOW-CONF] Confidence pip:', r2.confPipText ?? '[none]');
console.log('[HONEST] posteriorStd NOT shown:', !r2.posteriorStdVisible, '(true = PASS)');
console.log('[ERRORS] Console errors:', r2.consoleErrors?.length ?? 0);
if (r2.consoleErrors?.length) r2.consoleErrors.slice(0, 5).forEach(e => console.log('   ', e));

console.log('\n── Match% HONEST SPREAD ──');
console.log('Run 1 (coherent mango):', r1.heroMatchNum ?? '[none]');
console.log('Run 2 (all-NAH):', r2.heroMatchNum ?? '[none — correct if low-confidence shown]');
console.log('Spread visible:', r1.heroMatchNum !== r2.heroMatchNum ? 'YES' : 'NO — investigate');

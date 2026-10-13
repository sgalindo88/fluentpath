/**
 * Hub (app.html) after the Phase C restyle: bilingual copy, icons instead of
 * emoji, the route and next-step cards, the reset dialog, and phone fit.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve, launch, newPage, LEVEL_PROGRESS } from './harness.js';

let srv, browser, base;
beforeAll(async () => { srv = await serve(); base = srv.url; browser = await launch(); });
afterAll(async () => { await browser?.close(); srv?.server.close(); });

const LESSONS = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ day: d, topic: 'Topic ' + d, time_spent: 15 + d, confidence: ['😕 Hard', '😐 OK', '🙂 Good', '😄 Great!'][d % 4], date: '2026-10-0' + d }));
const states = {
  fresh: LEVEL_PROGRESS({ test_completed: false, cefr_level: null }),
  review: LEVEL_PROGRESS({ cefr_level: null }),
  mid: LEVEL_PROGRESS({ test_date: '2026-10-01', max_day: 7, lessons_completed: 7, lessons: LESSONS, last_lesson_date: '2026-10-07' }),
};
const open = async (progress, opts = {}) => {
  const t = await newPage(browser, { handlers: { get_progress: () => progress, get_settings: () => ({ found: true }) }, ...opts });
  await t.page.goto(base + '/app.html', { waitUntil: 'load' });
  return t;
};
const EMOJI = /\p{Extended_Pictographic}/u;

describe('log in screen', () => {
  it('is bilingual (English with Spanish beneath) and uses the stacked logo', async () => {
    const { page, ctx } = await open(states.mid, { session: false });
    const text = await page.textContent('#screen-welcome');
    for (const es of ['Correo electrónico', 'Contraseña', 'Iniciar sesión', '¿Olvidaste tu contraseña?', 'Tu camino hacia la fluidez']) expect(text).toContain(es);
    expect(await page.getAttribute('#screen-welcome img.fp-logo--stacked', 'src')).toContain('logo-stacked.svg');
    expect(text).not.toMatch(/Fluentora/);
    await ctx.close();
  });

  it('an empty submit shows the message in both languages with an icon, and stays put', async () => {
    const { page, ctx } = await open(states.mid, { session: false });
    await page.click('#btnEnter');
    const err = page.locator('#loginError');
    await err.waitFor({ state: 'visible' });
    expect(await err.textContent()).toContain('Please enter your email and your password'.replace(' and your', ' and'));
    expect(await err.textContent()).toContain('Escribe tu correo y tu contraseña.');
    expect(await err.locator('svg.fp-icon').count()).toBe(1);
    await ctx.close();
  });

  it('a wrong password translates the server message', async () => {
    const t = await newPage(browser, { session: false, handlers: { login: () => ({ ok: false, error: 'Invalid email or password' }) } });
    await t.page.goto(base + '/app.html', { waitUntil: 'load' });
    await t.page.fill('#loginEmail', 'a@b.c');
    await t.page.fill('#loginPassword', 'nope');
    await t.page.click('#btnEnter');
    await t.page.waitForSelector('#loginError', { state: 'visible' });
    const text = await t.page.textContent('#loginError');
    expect(text).toContain('Wrong email or password.');
    expect(text).toContain('Correo o contraseña incorrectos.');
    expect(await t.page.textContent('#btnEnter')).toContain('Iniciar sesión'); // button restored
    await t.ctx.close();
  });

  it('the i18n runtime is not loaded here (the copy is static, no tap-to-translate underlines)', async () => {
    const { page, ctx } = await open(states.mid, { session: false });
    expect(await page.evaluate(() => typeof I18n)).toBe('undefined');
    await ctx.close();
  });
});

describe('forgot-password dialog', () => {
  it('opens bilingual with focus in the email field; Escape closes and returns focus to the link', async () => {
    const { page, ctx } = await open(states.mid, { session: false });
    await page.focus('a:has-text("Forgot password")');
    await page.click('a:has-text("Forgot password")');
    await page.waitForSelector('#fp-reset-modal.is-open');
    expect(await page.evaluate(() => document.activeElement.id)).toBe('fp-reset-email');
    const text = await page.textContent('#fp-view-forgot');
    expect(text).toContain('Restablece tu contraseña');
    expect(text).toContain('Enviar enlace');
    expect(await page.getAttribute('.fp-reset[role="dialog"]', 'aria-modal')).toBe('true');
    await page.keyboard.press('Escape');
    expect(await page.isVisible('#fp-reset-modal')).toBe(false);
    expect(await page.evaluate(() => document.activeElement.textContent)).toContain('Forgot password');
    await ctx.close();
  });

  it('Tab stays inside the dialog', async () => {
    const { page, ctx } = await open(states.mid, { session: false });
    await page.click('a:has-text("Forgot password")');
    await page.waitForSelector('#fp-reset-modal.is-open');
    for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#fp-reset-modal'))).toBe(true);
    await ctx.close();
  });

  it('sending a reset link confirms in both languages', async () => {
    const t = await newPage(browser, { session: false, handlers: { request_reset: () => ({ ok: true }) } });
    await t.page.goto(base + '/app.html', { waitUntil: 'load' });
    await t.page.click('a:has-text("Forgot password")');
    await t.page.fill('#fp-reset-email', 'maria@example.com');
    await t.page.click('#fp-reset-send');
    await t.page.waitForSelector('#fp-reset-msg.fp-banner--success');
    const text = await t.page.textContent('#fp-reset-msg');
    expect(text).toContain('reset link is on its way');
    expect(text).toContain('te enviamos un enlace');
    await t.ctx.close();
  });
});

describe('hub states', () => {
  it('a new student: the route starts at the placement test and the one next step is that test', async () => {
    const { page, ctx, errors } = await open(states.fresh);
    await page.waitForSelector('#screen-dashboard.active');
    expect(await page.getAttribute('#route-test', 'aria-current')).toBe('step');
    expect(await page.getAttribute('#route-level', 'class')).toContain('is-upcoming');
    const cta = page.locator('#ctaSection a.fp-btn--primary');
    expect(await cta.getAttribute('href')).toContain('student-initial-test.html');
    expect(await cta.textContent()).toContain('Hacer la prueba de nivel');
    expect(await page.textContent('#dashSubtitle')).toContain('Empecemos con tu prueba de nivel.');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('after the test, before a level: the level waypoint is current and says awaiting review', async () => {
    const { page, ctx } = await open(states.review);
    await page.waitForSelector('#screen-dashboard.active');
    expect(await page.getAttribute('#route-level', 'aria-current')).toBe('step');
    expect(await page.getAttribute('#route-test', 'class')).toContain('is-completed');
    expect(await page.textContent('#ms-level-card')).toContain('En revisión');
    await ctx.close();
  });

  it('mid-course: Day 8 call to action, progress bar, lessons with face icons, Spanish date', async () => {
    const { page, ctx, errors } = await open(states.mid);
    await page.waitForSelector('#screen-dashboard.active');
    expect(await page.getAttribute('#route-course', 'aria-current')).toBe('step');
    expect(await page.textContent('#route-course-meta')).toBe('7 / 20');
    const cta = page.locator('#ctaSection button.fp-btn--primary');
    expect(await cta.textContent()).toContain('Start Day 8 lesson');
    expect(await cta.textContent()).toContain('Empezar la lección del día 8');
    expect(await page.getAttribute('.hub-progress__track', 'aria-valuenow')).toBe('7');
    const shown = '.hub-lessons ul:not(#lesson-history-all) .hub-lesson';
    expect(await page.locator(shown).count()).toBe(5);
    expect(await page.locator(shown + ' svg.fp-icon[role="img"]').count()).toBe(5);
    expect(await page.textContent('#ms-test-desc')).toContain('1 de octubre de 2026');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('"View all lessons" is a real toggle button', async () => {
    const { page, ctx } = await open(states.mid);
    await page.waitForSelector('#screen-dashboard.active');
    const btn = page.locator('button[aria-controls="lesson-history-all"]');
    expect(await btn.getAttribute('aria-expanded')).toBe('false');
    expect(await page.isVisible('#lesson-history-all')).toBe(false);
    await btn.click();
    expect(await btn.getAttribute('aria-expanded')).toBe('true');
    expect(await page.locator('#lesson-history-all .hub-lesson').count()).toBe(2);
    expect(await btn.textContent()).toContain('Ver menos');
    await btn.click();
    expect(await page.isVisible('#lesson-history-all')).toBe(false);
    await ctx.close();
  });

  it('achievements use icons, and locked ones say so in words', async () => {
    const { page, ctx } = await open(states.mid);
    await page.waitForSelector('#screen-dashboard.active');
    expect(await page.locator('.achieve-badge').count()).toBe(6);
    expect(await page.locator('.achieve-badge svg.fp-icon').count()).toBe(6);
    expect(await page.locator('.achieve-badge.unearned').count()).toBe(2);
    expect(await page.locator('.achieve-badge.unearned').first().textContent()).toContain('Bloqueado');
    await ctx.close();
  });

  it('no emoji remain anywhere on the hub (they are icons now)', async () => {
    for (const k of ['fresh', 'review', 'mid']) {
      const { page, ctx } = await open(states[k]);
      await page.waitForSelector('#screen-dashboard.active');
      expect(await page.evaluate(() => document.body.innerText), k).not.toMatch(EMOJI);
      await ctx.close();
    }
  });

  it('fits a phone: no horizontal scroll at 390px, in the longest state', async () => {
    const { page, ctx } = await open(states.mid, { viewport: { width: 390, height: 844 } });
    await page.waitForSelector('#screen-dashboard.active');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(0);
    await ctx.close();
  });

  it('logging out returns to the log in screen', async () => {
    const { page, ctx } = await open(states.mid);
    await page.waitForSelector('#screen-dashboard.active');
    await page.click('button:has-text("Switch student")');
    await page.waitForSelector('#screen-welcome.active');
    expect(await page.evaluate(() => localStorage.getItem('fp_session'))).toBeNull();
    await ctx.close();
  });
});

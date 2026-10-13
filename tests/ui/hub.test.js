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
    expect((await page.textContent('#logoutBtn')).replace(/\s+/g, ' ')).toContain('Log out');
    await page.click('#logoutBtn');
    await page.waitForSelector('#screen-welcome.active');
    expect(await page.evaluate(() => localStorage.getItem('fp_session'))).toBeNull();
    await ctx.close();
  });
});

describe('who sees Spanish: A1, A2, B1 and not-yet-placed students; B2 and up see English only', () => {
  const visibleEs = (page) => page.locator('.fp-bi__es:visible, .fp-es:visible').count();

  for (const level of ['A1', 'A2', 'B1']) {
    it(`${level}: Spanish lines are shown`, async () => {
      const { page, ctx } = await open(LEVEL_PROGRESS({ cefr_level: level, max_day: 3, lessons_completed: 3, lessons: LESSONS.slice(0, 3), test_date: '2026-10-01' }));
      await page.waitForSelector('#screen-dashboard.active');
      expect(await page.evaluate(() => document.documentElement.classList.contains('fp-no-es'))).toBe(false);
      expect(await visibleEs(page)).toBeGreaterThan(10);
      expect(await page.innerText('#ctaSection')).toContain('Empezar la lección del día 4');
      await ctx.close();
    });
  }

  for (const level of ['B2', 'C1', 'C2']) {
    it(`${level}: no Spanish anywhere on the hub, and the layout still holds`, async () => {
      const { page, ctx, errors } = await open(LEVEL_PROGRESS({ cefr_level: level, max_day: 3, lessons_completed: 3, lessons: LESSONS.slice(0, 3), test_date: '2026-10-01' }));
      await page.waitForSelector('#screen-dashboard.active');
      expect(await page.evaluate(() => document.documentElement.classList.contains('fp-no-es'))).toBe(true);
      expect(await visibleEs(page)).toBe(0);
      const text = await page.innerText('#screen-dashboard');
      for (const es of ['Empezar', 'Qué bueno', 'Prueba de nivel', 'Tu curso', 'Bloqueado', 'Completada', 'Logros', 'Día ']) expect(text, es).not.toContain(es);
      expect(text).toContain('Start Day 4 lesson');
      // aria labels follow the same rule (no "Hard / Difícil")
      const labels = await page.$$eval('.hub-lesson svg[role="img"]', (els) => els.map((e) => e.getAttribute('aria-label')));
      expect(labels.every((l) => !l.includes('/'))).toBe(true);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }

  it('a student with no level yet (new, or placement test not graded) still gets Spanish', async () => {
    for (const k of ['fresh', 'review']) {
      const { page, ctx } = await open(states[k]);
      await page.waitForSelector('#screen-dashboard.active');
      expect(await visibleEs(page), k).toBeGreaterThan(10);
      await ctx.close();
    }
  });

  it('logging out brings the Spanish back for the next person at the log in screen', async () => {
    const { page, ctx } = await open(LEVEL_PROGRESS({ cefr_level: 'C1', max_day: 2, lessons_completed: 2, lessons: LESSONS.slice(0, 2), test_date: '2026-10-01' }));
    await page.waitForSelector('#screen-dashboard.active');
    expect(await visibleEs(page)).toBe(0);
    await page.click('#logoutBtn');
    await page.waitForSelector('#screen-welcome.active');
    expect(await page.locator('#screen-welcome .fp-bi__es:visible').count()).toBeGreaterThan(3);
    await ctx.close();
  });

  it('the level is remembered across pages: a B2 student opening the placement-test page sees English only', async () => {
    const t = await newPage(browser, { handlers: {} });
    await t.page.addInitScript(() => localStorage.setItem('fp_cefr_level', 'B2'));
    await t.page.goto(base + '/app.html', { waitUntil: 'load' });
    expect(await t.page.evaluate(() => document.documentElement.classList.contains('fp-no-es'))).toBe(true);
    await t.ctx.close();
  });
});

describe('talking to the teacher is an in-page card, not a floating button', () => {
  it('the request control sits in the hub card and does not float over the content', async () => {
    const { page, ctx } = await open(states.mid);
    await page.waitForSelector('#screen-dashboard.active');
    await page.waitForSelector('#callSlot #fp-call-btn');
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('fp-call-wrap')).position)).not.toBe('fixed');
    expect(await page.textContent('#callSlot')).toContain('Pedir una videollamada');
    const box = await page.locator('#fp-call-btn').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await ctx.close();
  });

  it('requesting a call shows pending with its own Refresh button', async () => {
    const t = await newPage(browser, { handlers: { get_progress: () => states.mid, get_settings: () => ({ found: true }), request_video_call: () => ({ result: 'success' }) } });
    await t.page.goto(base + '/app.html', { waitUntil: 'load' });
    await t.page.waitForSelector('#callSlot #fp-call-btn');
    await t.page.click('#fp-call-btn');
    await t.page.waitForSelector('#fp-call-refresh');
    expect(await t.page.textContent('#fp-call-btn')).toContain('Solicitud pendiente');
    expect(await t.page.getAttribute('#fp-call-btn', 'aria-disabled')).toBe('true');
    await t.ctx.close();
  });
});

describe('log in page: no reload loop, and a way back to the brochure', () => {
  const unauthorized = () => ({ error: 'Unauthorized' });
  const countNavs = (page) => { const urls = []; page.on('framenavigated', (f) => { if (f === page.mainFrame()) urls.push(f.url()); }); return urls; };

  it('a remembered name without a session does not poll the server or reload the page', async () => {
    const t = await newPage(browser, { session: false, handlers: { get_active_call_request: unauthorized, get_progress: unauthorized, get_settings: () => ({ found: true }) } });
    await t.page.addInitScript(() => localStorage.setItem('fp_student_name', 'Maria Lopez'));
    const navs = countNavs(t.page);
    await t.page.goto(base + '/app.html', { waitUntil: 'load' });
    await t.page.waitForTimeout(2500);
    expect(navs.length).toBe(1);
    expect(await t.page.isVisible('#screen-welcome.active')).toBe(true);
    expect(t.calls.filter((c) => c.action === 'get_active_call_request')).toEqual([]);
    await t.ctx.close();
  });

  it('a stale session the server rejects ends on the login screen, not in a reload loop', async () => {
    const t = await newPage(browser, { handlers: { get_progress: unauthorized, get_active_call_request: unauthorized, get_settings: () => ({ found: true }) } });
    const navs = countNavs(t.page);
    await t.page.goto(base + '/app.html', { waitUntil: 'load' });
    await t.page.waitForSelector('#screen-welcome.active');
    await t.page.waitForTimeout(2000);
    expect(navs.length).toBe(1);
    expect(await t.page.evaluate(() => localStorage.getItem('fp_session'))).toBeNull();
    await t.ctx.close();
  });

  it('the log in screen links back to the brochure (logo and a text link, in both languages)', async () => {
    const { page, ctx } = await open(states.mid, { session: false });
    expect(await page.getAttribute('#homeLink', 'href')).toBe('./');
    expect(await page.textContent('#homeLink')).toContain('Volver al inicio');
    expect(await page.locator('#screen-welcome a[href="./"] img.fp-logo--stacked').count()).toBe(1);
    await ctx.close();
  });
});

/**
 * Smoke tests for the student path: login, placement-test start, course name +
 * level, and the record toggle. They exist so the reskin (Phase B/C) cannot
 * silently break the ids and classes the scripts depend on.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve, launch, newPage, LEVEL_PROGRESS } from './harness.js';

let srv, browser, base;
beforeAll(async () => {
  srv = await serve();
  base = srv.url;
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
  srv?.server.close();
});

const open = async (opts, path) => {
  const t = await newPage(browser, opts);
  await t.page.goto(base + path, { waitUntil: 'load' });
  return t;
};

describe('login (app.html)', () => {
  const handlers = {
    login: (p) => (p.password === 'good'
      ? { ok: true, session: 's1', role: 'student', student_name: 'Maria Lopez', expires_at: '2099-01-01T00:00:00Z' }
      : { ok: false, error: 'Wrong email or password.' }),
    get_progress: () => LEVEL_PROGRESS({ lessons_completed: 2, max_day: 2, next_day: 3 }),
    get_settings: () => ({ found: true }),
  };

  it('shows the login form when logged out', async () => {
    const { page, ctx } = await open({ handlers, session: false }, '/app.html');
    expect(await page.isVisible('#screen-welcome.active')).toBe(true);
    for (const id of ['#loginEmail', '#loginPassword', '#btnEnter']) expect(await page.isVisible(id)).toBe(true);
    await ctx.close();
  });

  it('a wrong password stays on the login screen with a message', async () => {
    const { page, ctx } = await open({ handlers, session: false }, '/app.html');
    await page.fill('#loginEmail', 'maria@example.com');
    await page.fill('#loginPassword', 'bad');
    await page.click('#btnEnter');
    await page.waitForSelector('#loginError', { state: 'visible' });
    expect(await page.textContent('#loginError')).toMatch(/wrong email or password/i);
    expect(await page.isVisible('#screen-welcome.active')).toBe(true);
    await ctx.close();
  });

  it('a good login lands on the hub for the server-resolved student', async () => {
    const { page, ctx, errors } = await open({ handlers, session: false }, '/app.html');
    await page.fill('#loginEmail', 'maria@example.com');
    await page.fill('#loginPassword', 'good');
    await page.click('#btnEnter');
    await page.waitForSelector('#screen-dashboard.active');
    expect(await page.textContent('#screen-dashboard')).toContain('Maria Lopez');
    expect(await page.evaluate(() => localStorage.getItem('fp_session'))).toBe('s1');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('placement test (student-initial-test.html)', () => {
  it('prefills the name from the session and starts the test', async () => {
    const { page, ctx, errors } = await open({}, '/src/student-initial-test.html');
    expect(await page.inputValue('#candidateName')).toBe('Maria Lopez');
    expect(await page.isVisible('#screen-cover.active')).toBe(true);
    await page.evaluate(() => startTest());
    await page.waitForSelector('#screen-reading-intro.active');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('the record button toggles: record, stop, record again, with a playback control', async () => {
    const { page, ctx, errors } = await open({}, '/src/student-initial-test.html');
    await page.evaluate(() => { startTest(); showScreen('screen-speaking'); });
    const btn = '#rec-btn-q21';
    expect(await page.textContent('#rec-label-q21')).toMatch(/Record your answer/);
    expect(await page.getAttribute(btn, 'aria-pressed')).toBe('false');
    await page.click(btn);
    await page.waitForSelector(btn + '.is-recording', { timeout: 15000 });
    expect(await page.getAttribute(btn, 'aria-pressed')).toBe('true');
    expect(await page.textContent('#rec-label-q21')).toMatch(/Recording/);
    await page.waitForTimeout(800);
    await page.click(btn);
    await page.waitForSelector(btn + '.is-recorded');
    await page.waitForSelector('#rec-audio-q21');
    expect(await page.textContent('#rec-label-q21')).toMatch(/Recorded\. Tap to record again/);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('course landing (student-course.html)', () => {
  const handlers = { get_progress: () => LEVEL_PROGRESS({ max_day: 7, next_day: 8, lessons_completed: 7 }), get_settings: () => ({ found: true }) };

  it('shows the logged-in name read-only and the server-assigned level, locked', async () => {
    const { page, ctx, errors } = await open({ handlers }, '/src/student-course.html');
    await page.waitForFunction(() => !document.getElementById('btnBeginLesson').disabled);
    expect(await page.inputValue('#studentName')).toBe('Maria Lopez');
    expect(await page.getAttribute('#studentName', 'readonly')).not.toBeNull();
    expect(await page.getAttribute('.level-card[data-level="A2"]', 'class')).toMatch(/selected/);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('a student with no level cannot begin and is told why', async () => {
    const h = { get_progress: () => LEVEL_PROGRESS({ cefr_level: null, test_completed: false }), get_settings: () => ({ found: true }) };
    const { page, ctx } = await open({ handlers: h }, '/src/student-course.html');
    await page.waitForFunction(() => /not set your level/i.test(document.getElementById('levelInstruction').textContent));
    expect(await page.isDisabled('#btnBeginLesson')).toBe(true);
    await ctx.close();
  });
});

describe('shared UI (toast, banner, save overlay) built from component classes', () => {
  const handlers = { get_progress: () => LEVEL_PROGRESS(), get_settings: () => ({ found: true }) };

  it('a toast announces itself, pairs an icon with words, and can be dismissed', async () => {
    const { page, ctx, errors } = await open({ handlers }, '/app.html');
    await page.waitForSelector('#screen-dashboard.active');
    await page.evaluate(() => FP.ui.toast('We could not save that', { variant: 'error' }));
    const t = page.locator('.fp-toast', { hasText: 'We could not save that' });
    expect(await t.getAttribute('role')).toBe('alert');
    expect(await t.locator('svg.fp-icon').count()).toBeGreaterThan(0);
    expect(await t.textContent()).toContain('We could not save that');
    await t.locator('.fp-banner__close').click();
    await page.waitForSelector('.fp-toast:has-text("We could not save that")', { state: 'detached' });
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('the save overlay blocks while open and is gone after hide', async () => {
    const { page, ctx } = await open({ handlers }, '/app.html');
    await page.evaluate(() => FP.showSaveOverlay('Saving your lesson'));
    expect(await page.isVisible('#fp-save-overlay')).toBe(true);
    expect(await page.textContent('#fp-save-msg')).toBe('Saving your lesson');
    await page.evaluate(() => FP.hideSaveOverlay());
    expect(await page.isVisible('#fp-save-overlay')).toBe(false);
    await ctx.close();
  });

  it('the offline banner shows with a Retry action and clears on removeBanner', async () => {
    const { page, ctx } = await open({ handlers }, '/app.html');
    await page.evaluate(() => showOfflineBanner());
    expect(await page.textContent('#fp-offline-banner')).toMatch(/offline/i);
    expect(await page.locator('#fp-offline-banner button', { hasText: 'Retry' }).count()).toBe(1);
    await page.evaluate(() => hideOfflineBanner());
    expect(await page.locator('#fp-offline-banner').count()).toBe(0);
    await ctx.close();
  });
});

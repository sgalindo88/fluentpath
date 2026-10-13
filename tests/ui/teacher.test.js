/**
 * Teacher portal and dashboard (fluentpath-teacher repo) after the Phase C restyle: labelled login,
 * icons not emoji, the off-canvas drawer under 768px (UX-5), in-page confirm instead of confirm(),
 * no hardcoded teacher name (TCH-6), and the cached marks cleared on a student switch (TCH-1).
 * Serves the teacher repo; the backend is stubbed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { serve, launch, newPage } from './harness.js';

const TEACHER_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', 'fluentpath-teacher');
const have = fs.existsSync(TEACHER_ROOT);
const d = have ? describe : describe.skip;

let srv, browser, base;
beforeAll(async () => { if (!have) return; srv = await serve(TEACHER_ROOT); base = srv.url; browser = await launch(); });
afterAll(async () => { await browser?.close(); srv?.server?.close(); });

const EMOJI = /\p{Extended_Pictographic}/u;
const handlers = {
  get_students: () => ({ students: [{ name: 'Maria Lopez' }, { name: 'Carlos Ruiz' }] }),
  get_progress: () => ({ found: true, lessons: [], cefr_level: 'A2', max_day: 0, next_day: 1 }),
  get_call_requests: () => ({ requests: [] }),
  get_class_overview: () => ({ found: true, students: [{ name: 'Maria Lopez', level: 'A2', days_completed: 7, last_active: '2026-10-07', ungraded: 2, attendance_pct: 88, status: 'yellow' }] }),
};

async function openPanel({ viewport = { width: 1280, height: 900 }, asTeacher = true } = {}) {
  const t = await newPage(browser, { handlers, viewport });
  if (asTeacher) await t.page.addInitScript(() => { localStorage.setItem('fp_role', 'teacher'); });
  t.dialogs = [];
  t.page.on('dialog', (x) => { t.dialogs.push(x.message()); x.dismiss(); });
  await t.page.goto(base + '/src/examiner-panel.html?student=Maria%20Lopez', { waitUntil: 'load' });
  await t.page.waitForSelector('#app', { state: 'visible' });
  return t;
}

d('teacher portal', () => {
  it('login has labelled fields, one primary button, a text link for forgot password, and no emoji', async () => {
    const t = await newPage(browser, { handlers, session: false });
    await t.page.goto(base + '/', { waitUntil: 'load' });
    await t.page.waitForSelector('#loginView:not(.fp-hidden)');
    expect(await t.page.locator('label[for="tEmail"]').textContent()).toBe('Email');
    expect(await t.page.locator('label[for="tPassword"]').textContent()).toBe('Password');
    expect(await t.page.locator('#loginView .fp-btn--primary').count()).toBe(1);
    expect(await t.page.isVisible('#portalView')).toBe(false);
    expect(EMOJI.test(await t.page.innerText('body'))).toBe(false);
    expect(await t.page.locator('html.fp-no-es').count()).toBe(1);
    expect(t.errors).toEqual([]);
    await t.ctx.close();
  });

  it('a teacher sees the student list as cards with an arrow icon', async () => {
    const t = await newPage(browser, { handlers });
    await t.page.addInitScript(() => localStorage.setItem('fp_role', 'teacher'));
    await t.page.goto(base + '/', { waitUntil: 'load' });
    await t.page.waitForSelector('.student-card');
    expect(await t.page.locator('.student-card').count()).toBe(2);
    expect(await t.page.locator('.student-card svg.fp-icon').count()).toBe(2);
    expect(await t.page.locator('.student-card').first().getAttribute('href')).toContain('examiner-panel.html?student=Maria%20Lopez');
    expect(t.errors).toEqual([]);
    await t.ctx.close();
  });
});

d('teacher dashboard', () => {
  it('desktop: navy rail with icon links as buttons; no emoji on any panel', async () => {
    const { page, ctx, errors } = await openPanel();
    expect(await page.locator('#sidebar .sb-link').count()).toBe(10);
    expect(await page.locator('#sidebar .sb-link svg.fp-icon').count()).toBe(10);
    expect(await page.getAttribute('#nav-dashboard', 'aria-current')).toBe('page');
    expect(await page.isVisible('#navToggle')).toBe(false);
    for (const id of ['dashboard', 'attendance', 'marking', 'placementtest', 'weekly', 'difficulty', 'progress', 'library', 'profile', 'classoverview']) {
      await page.evaluate((x) => showPanel(x), id);
      expect(EMOJI.test(await page.evaluate(() => document.body.innerText)), 'emoji on ' + id).toBe(false);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('phone: the rail is a drawer; the toggle opens it, Escape and a link close it, and nothing scrolls sideways', async () => {
    const { page, ctx, errors } = await openPanel({ viewport: { width: 390, height: 844 } });
    expect(await page.isVisible('#sidebar')).toBe(false);
    expect(await page.isVisible('#navToggle')).toBe(true);
    expect(await page.getAttribute('#navToggle', 'aria-expanded')).toBe('false');
    await page.click('#navToggle');
    await page.waitForSelector('#sidebar.is-open');
    expect(await page.getAttribute('#navToggle', 'aria-expanded')).toBe('true');
    expect(await page.isVisible('#sidebar')).toBe(true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('sidebar').classList.contains('is-open'));
    expect(await page.evaluate(() => document.activeElement.id)).toBe('navToggle');
    await page.click('#navToggle');
    await page.click('#nav-attendance');
    await page.waitForSelector('#panel-attendance.active');
    expect(await page.evaluate(() => document.getElementById('sidebar').classList.contains('is-open'))).toBe(false);
    for (const id of ['dashboard', 'attendance', 'marking', 'placementtest', 'library', 'profile']) {
      await page.evaluate((x) => showPanel(x), id);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, 'overflow on ' + id).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('the controls are real buttons with 44px targets (tabs, header, rail)', async () => {
    const { page, ctx } = await openPanel();
    await page.evaluate(() => showPanel('marking'));
    expect(await page.locator('.m-tab').first().evaluate((el) => el.tagName)).toBe('BUTTON');
    const small = await page.evaluate(() => [...document.querySelectorAll('.sb-link, .topbar button, .m-tab, .btn-primary, .btn-secondary')]
      .filter((b) => b.offsetParent !== null).map((b) => ({ n: b.id || b.className, h: Math.round(b.getBoundingClientRect().height) })).filter((x) => x.h < 44));
    expect(small).toEqual([]);
    await ctx.close();
  });

  it('TCH-6: no hardcoded teacher name; the greeting uses the name saved in the profile', async () => {
    const { page, ctx } = await openPanel();
    expect(await page.textContent('.panel-title')).not.toContain('Sebastian');
    expect(await page.inputValue('#prof-teacher')).toBe('');
    await page.evaluate(() => showPanel('profile'));
    await page.fill('#prof-teacher', 'Ana Perez');
    await page.evaluate(() => { ex.teacherName = document.getElementById('prof-teacher').value.trim(); saveToLocalStorage(); });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#app', { state: 'visible' });
    expect(await page.textContent('#panel-dashboard .panel-title')).toContain('Good morning, Ana Perez');
    await ctx.close();
  });

  it('TCH-1: switching student clears the cached lesson marks', async () => {
    const { page, ctx } = await openPanel();
    await page.evaluate(() => { localStorage.setItem('fp_lesson_marks', '{"day":3}'); resetStudentState('Carlos Ruiz'); });
    expect(await page.evaluate(() => localStorage.getItem('fp_lesson_marks'))).toBeNull();
    await ctx.close();
  });

  it('Reset grading asks in the page (not window.confirm); cancel is the focused primary action; Escape cancels', async () => {
    const { page, ctx, dialogs } = await openPanel();
    await page.evaluate(() => showPanel('placementtest'));
    await page.click('text=Reset Grading Data');
    await page.waitForSelector('#cdCancel');
    expect(await page.evaluate(() => document.activeElement.id)).toBe('cdCancel');
    expect(await page.getAttribute('.fp-modal', 'role')).toBe('alertdialog');
    expect(await page.textContent('#cdTitle')).toContain('Reset the placement test grading?');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#cdCancel', { state: 'detached' });
    expect(dialogs).toEqual([]);
    await ctx.close();
  });

  it('status lines say it in an icon and words, not colour alone', async () => {
    const { page, ctx } = await openPanel();
    await page.evaluate(() => { showStatus('notes-status', '✓ Notes saved.', false); showStatus('profile-save-status', '⚠ NOT saved to the sheet.', true); });
    expect(await page.textContent('#notes-status')).toBe('Notes saved.');
    expect(await page.locator('#notes-status svg.fp-icon').count()).toBe(1);
    expect(await page.getAttribute('#profile-save-status', 'role')).toBe('alert');
    expect(await page.textContent('#profile-save-status')).toContain('NOT saved');
    await ctx.close();
  });

  it('the class table sorts with real buttons and says which column is sorted', async () => {
    const { page, ctx } = await openPanel();
    await page.evaluate(() => showPanel('classoverview'));
    await page.waitForSelector('.class-table');
    await page.click('.th-sort >> text=Student');
    expect(await page.locator('th[aria-sort="ascending"], th[aria-sort="descending"]').count()).toBe(1);
    expect(await page.locator('th[aria-sort="none"]').count()).toBeGreaterThan(3);
    await ctx.close();
  });

  it('confidence shows a face icon and a word for a word, an index and an old emoji value', async () => {
    const { page, ctx } = await openPanel();
    const out = await page.evaluate(() => ['Good', 2, '😄 Great!', null].map((v) => confidenceHtml(v)));
    expect(out[0]).toContain('Good'); expect(out[1]).toContain('Good'); expect(out[2]).toContain('Great'); expect(out[3]).toBe('—');
    expect(out[0]).toContain('<svg');
    await ctx.close();
  });
});

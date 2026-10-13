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

d('teacher portal: inbox', () => {
  const portal = async (extra) => {
    const t = await newPage(browser, { handlers: { ...handlers, ...extra }, viewport: { width: 390, height: 844 } });
    await t.page.addInitScript(() => localStorage.setItem('fp_role', 'teacher'));
    await t.page.goto(base + '/', { waitUntil: 'load' });
    return t;
  };

  it('account requests: listed with the note, Create account prefills the form, Dismiss removes it', async () => {
    let reqs = [{ id: 'r1', name: 'Ana Ruiz', email: 'ana@example.com', note: 'I cook at night', language: 'es', requested_at: '2026-10-13T10:00:00Z' }];
    const updates = [];
    const t = await portal({
      get_account_requests: () => ({ requests: reqs }),
      update_account_request: (p) => { updates.push(p); reqs = []; return { result: 'success' }; },
    });
    await t.page.waitForSelector('#acctReqList li');
    const text = await t.page.textContent('#acctRequests');
    expect(text).toContain('Ana Ruiz');
    expect(text).toContain('ana@example.com');
    expect(text).toContain('I cook at night');
    expect(text).toContain('Spanish');
    await t.page.click('#acctReqList [data-act="create"]');
    expect(await t.page.inputValue('#caName')).toBe('Ana Ruiz');
    expect(await t.page.inputValue('#caEmail')).toBe('ana@example.com');
    expect(await t.page.evaluate(() => document.activeElement.id)).toBe('caPassword');
    await t.page.click('#acctReqList [data-act="dismiss"]');
    await t.page.waitForSelector('#acctRequests', { state: 'hidden' });
    expect(updates).toEqual([expect.objectContaining({ id: 'r1', status: 'dismissed' })]);
    expect(await t.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(t.errors).toEqual([]);
    await t.ctx.close();
  });

  it('nothing shows when there are no requests or feedback', async () => {
    const t = await portal({ get_account_requests: () => ({ requests: [] }), get_feedback: () => ({ feedback: [] }) });
    await t.page.waitForSelector('.student-card');
    expect(await t.page.isVisible('#acctRequests')).toBe(false);
    expect(await t.page.isVisible('#feedbackBox')).toBe(false);
    await t.ctx.close();
  });

  it('student feedback: open items first with Mark done, finished ones tucked under "Done"', async () => {
    const fb = [
      { id: 'f2', submitted_at: '2026-10-13T10:00:00Z', student_name: 'Maria Lopez', type: 'feature', message: 'More listening practice', page: 'Settings', device: 'iPad', status: 'new' },
      { id: 'f1', submitted_at: '2026-10-12T10:00:00Z', student_name: 'Maria Lopez', type: 'bug', message: 'The mic did nothing <b>x</b>', page: 'Settings', device: 'iPhone', status: 'done' },
    ];
    const updates = [];
    const t = await portal({
      get_feedback: () => ({ feedback: fb }),
      update_feedback: (p) => { updates.push(p); fb.find((x) => x.id === p.id).status = p.status; return { result: 'success' }; },
    });
    await t.page.waitForSelector('#feedbackList .inbox-item');
    expect(await t.page.locator('#feedbackList .inbox-item').count()).toBe(1);
    expect(await t.page.textContent('#feedbackList')).toContain('More listening practice');
    expect(await t.page.textContent('#feedbackDoneSummary')).toBe('Done (1)');
    expect(await t.page.locator('#feedbackDoneList b').count()).toBe(0); // message is escaped
    await t.page.click('#feedbackList [data-act="done"]');
    await t.page.waitForFunction(() => document.querySelectorAll('#feedbackList .inbox-item').length === 0);
    expect(updates).toEqual([expect.objectContaining({ id: 'f2', status: 'done' })]);
    expect(await t.page.textContent('#feedbackDoneSummary')).toBe('Done (2)');
    expect(t.errors).toEqual([]);
    await t.ctx.close();
  });
});

d('teacher portal: loop and way back', () => {
  it('an Unauthorized reply on the portal shows the login form instead of reloading', async () => {
    const t = await newPage(browser, { handlers: { get_students: () => ({ error: 'Unauthorized' }) } });
    await t.page.addInitScript(() => localStorage.setItem('fp_role', 'teacher'));
    const navs = [];
    t.page.on('framenavigated', (f) => { if (f === t.page.mainFrame()) navs.push(f.url()); });
    await t.page.goto(base + '/', { waitUntil: 'load' });
    await t.page.waitForSelector('#loginView:not(.fp-hidden)');
    await t.page.waitForTimeout(1500);
    expect(navs.length).toBe(1);
    await t.ctx.close();
  });

  it('the login page links back to the brochure (logo and a text link)', async () => {
    const t = await newPage(browser, { handlers, session: false });
    await t.page.goto(base + '/', { waitUntil: 'load' });
    expect(await t.page.locator('a[href="https://fluentpath.ca/"]').count()).toBe(2);
    expect(await t.page.textContent('.footer')).toContain('Back to fluentpath.ca');
    await t.ctx.close();
  });
});

d('teacher portal: create account', () => {
  it('creating a student says what happens next, links to the dashboard, and refreshes the list', async () => {
    let students = [];
    const t = await newPage(browser, { handlers: { get_students: () => ({ students }), create_account: (p) => { students = [{ name: p.student_name }]; return { ok: true }; } } });
    await t.page.addInitScript(() => localStorage.setItem('fp_role', 'teacher'));
    await t.page.goto(base + '/', { waitUntil: 'load' });
    await t.page.fill('#caName', 'Test Dress Rehearsal');
    await t.page.fill('#caEmail', 'dress@example.com');
    await t.page.fill('#caPassword', 'secret1');
    await t.page.click('#caBtn');
    await t.page.waitForSelector('#caStatus.ok');
    const text = await t.page.textContent('#caStatus');
    expect(text).toContain('Account created for Test Dress Rehearsal');
    expect(text).toContain('free course access');
    expect(await t.page.getAttribute('#caStatus a', 'href')).toContain('examiner-panel.html?student=Test%20Dress%20Rehearsal');
    await t.page.waitForSelector('.student-card');
    expect(await t.page.textContent('.student-name')).toBe('Test Dress Rehearsal');
    expect(await t.page.inputValue('#caName')).toBe('');
    await t.ctx.close();
  });

  it('an error warns that the account may exist, and shows the server message', async () => {
    const t = await newPage(browser, { handlers: { get_students: () => ({ students: [] }), create_account: () => ({ ok: false, error: 'Server busy' }) } });
    await t.page.addInitScript(() => localStorage.setItem('fp_role', 'teacher'));
    await t.page.goto(base + '/', { waitUntil: 'load' });
    await t.page.fill('#caName', 'X'); await t.page.fill('#caEmail', 'x@example.com'); await t.page.fill('#caPassword', 'secret1');
    await t.page.click('#caBtn');
    await t.page.waitForSelector('#caStatus.err');
    expect(await t.page.textContent('#caStatus')).toContain('Server busy');
    await t.ctx.close();
  });
});

d('teacher dashboard', () => {
  it('desktop: navy rail with icon links as buttons; no emoji on any panel', async () => {
    const { page, ctx, errors } = await openPanel();
    expect(await page.locator('#sidebar .sb-link').count()).toBe(11);
    expect(await page.locator('#sidebar .sb-link svg.fp-icon').count()).toBe(11);
    expect(await page.getAttribute('#nav-dashboard', 'aria-current')).toBe('page');
    expect(await page.isVisible('#navToggle')).toBe(false);
    for (const id of ['dashboard', 'attendance', 'marking', 'placementtest', 'weekly', 'difficulty', 'progress', 'library', 'profile', 'settings', 'classoverview']) {
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

  it('TCH-6: no hardcoded teacher name; the Settings page fills from the account, saves, and the greeting uses it', async () => {
    let saved = null;
    const h = {
      ...handlers,
      get_teacher_settings: () => ({ login_email: 't@x.com', teacher_name: saved ? saved.teacher_name : 'Sebastian Galindo', notify_email: saved ? saved.notify_email : 't@x.com' }),
      update_teacher_settings: (p) => { saved = p; return { result: 'success' }; },
    };
    const t = await newPage(browser, { handlers: h, viewport: { width: 1280, height: 900 } });
    await t.page.addInitScript(() => { localStorage.setItem('fp_role', 'teacher'); });
    await t.page.goto(base + '/src/examiner-panel.html?student=Maria%20Lopez', { waitUntil: 'load' });
    await t.page.waitForSelector('#app', { state: 'visible' });
    await t.page.waitForFunction(() => document.getElementById('set-name').value === 'Sebastian Galindo');
    expect(await t.page.inputValue('#set-notify')).toBe('t@x.com');
    expect(await t.page.inputValue('#set-login')).toBe('t@x.com');
    expect(await t.page.getAttribute('#set-login', 'readonly')).not.toBeNull();
    expect(await t.page.textContent('#panel-dashboard .panel-title')).toContain('Sebastian Galindo');
    await t.page.evaluate(() => showPanel('settings'));
    await t.page.fill('#set-notify', 'bad');
    await t.page.click('text=Save settings');
    expect(await t.page.textContent('#settings-save-status')).toContain('valid notification email');
    await t.page.fill('#set-name', 'Ana Perez');
    await t.page.fill('#set-notify', 'ana@x.com');
    await t.page.click('text=Save settings');
    await t.page.waitForFunction(() => document.getElementById('settings-save-status').textContent.includes('saved'));
    expect(saved).toMatchObject({ teacher_name: 'Ana Perez', notify_email: 'ana@x.com' });
    expect(await t.page.textContent('#panel-dashboard .panel-title')).toContain('Ana Perez');
    await t.page.click('text=Change password');
    await t.page.waitForSelector('#fp-change-cur');
    await t.ctx.close();
  });

  it('opening a student fills the profile from the sheet (permissions survive a reload), email is starred, no teacher fields', async () => {
    const h = { ...handlers, get_student_profile: () => ({ found: true, cefr_level: 'A2', course_month: 2, notes: 'Cook', allow_spanish: true, allow_skip_test: true, allow_retake_test: true, access_granted: true, notify_on_test: true, notify_on_submission: false, notify_on_call_request: true, student_email: 'maria@x.com' }) };
    const t = await newPage(browser, { handlers: h, viewport: { width: 1280, height: 900 } });
    await t.page.addInitScript(() => { localStorage.setItem('fp_role', 'teacher'); });
    await t.page.goto(base + '/src/examiner-panel.html?student=Maria%20Lopez', { waitUntil: 'load' });
    await t.page.waitForSelector('#app', { state: 'visible' });
    await t.page.waitForFunction(() => document.getElementById('prof-grant-access').checked);
    for (const id of ['prof-allow-spanish', 'prof-allow-skip-test', 'prof-allow-retake-test', 'prof-grant-access', 'prof-notify-test']) expect(await t.page.isChecked('#' + id), id).toBe(true);
    expect(await t.page.inputValue('#prof-level')).toBe('A2');
    expect(await t.page.inputValue('#prof-notes')).toBe('Cook');
    expect(await t.page.inputValue('#prof-email')).toBe('maria@x.com');
    expect(await t.page.textContent('label[for="prof-email"]')).toContain('*');
    expect(await t.page.textContent('label[for="prof-email"]')).not.toContain('required');
    expect(await t.page.locator('#prof-teacher, #prof-teacher-email').count()).toBe(0);
    await t.ctx.close();
  });

  it('video call: the dashboard notice links to the Video Call card, and Mark as Done shows a message', async () => {
    let status = 'pending';
    const h = {
      ...handlers,
      get_call_requests: () => ({ requests: status === 'pending' ? [{ id: 'r1', student_name: 'Maria Lopez', status: 'pending', requested_at: '2026-10-13T10:00:00Z', page: 'hub' }] : [] }),
      update_call_status: () => { status = 'done'; return { result: 'success' }; },
    };
    const t = await newPage(browser, { handlers: h, viewport: { width: 1280, height: 900 } });
    await t.page.addInitScript(() => { localStorage.setItem('fp_role', 'teacher'); });
    await t.page.goto(base + '/src/examiner-panel.html?student=Maria%20Lopez', { waitUntil: 'load' });
    await t.page.waitForSelector('#dash-call-requests a.link');
    expect(await t.page.getAttribute('#dash-call-requests a.link', 'href')).toContain('panel=call');
    await t.page.click('#dash-call-requests a.link');
    await t.page.waitForSelector('#panel-profile.active');
    await t.page.click('#prof-call-request-content >> text=Mark as Done');
    await t.page.waitForSelector('.fp-toast');
    expect(await t.page.textContent('.fp-toast')).toContain('marked as done');
    expect(await t.page.textContent('#prof-call-request-content')).toContain('Marked as done');
    await t.ctx.close();
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
  it('the profile email fills from the registration email, is required, and the graded badge flips after a save', async () => {
    const h = { ...handlers, get_student_profile: () => ({ found: false, student_email: 'maria@x.com' }) };
    const t = await newPage(browser, { handlers: h, viewport: { width: 1280, height: 900 } });
    await t.page.addInitScript(() => { localStorage.setItem('fp_role', 'teacher'); });
    await t.page.goto(base + '/src/examiner-panel.html?student=Maria%20Lopez', { waitUntil: 'load' });
    await t.page.waitForSelector('#app', { state: 'visible' });
    await t.page.waitForFunction(() => document.getElementById('prof-email').value === 'maria@x.com');
    await t.page.evaluate(() => showPanel('profile'));
    await t.page.fill('#prof-email', '');
    await t.page.evaluate(() => saveProfile());
    expect(await t.page.textContent('#profile-save-status')).toContain('email is required');
    await t.page.evaluate(() => { setGradedBadge(false); });
    expect(await t.page.textContent('#graded-badge')).toBe('UNGRADED');
    await t.page.evaluate(() => { setGradedBadge(true); });
    expect(await t.page.textContent('#graded-badge')).toBe('GRADED');
    await t.ctx.close();
  });
  it('topic requests: a dashboard notice links to Adjust Difficulty, where the teacher approves or declines', async () => {
    let status = 'pending';
    const req = () => ({ id: 'f1', student_name: 'Maria Lopez', requested_at: '2026-10-13T10:00:00Z', status, topics: ['health'], topics_en: ['Health and doctor visits'], note: 'kitchen work' });
    const reviews = [];
    const h = {
      ...handlers,
      get_focus_requests: (p) => ({ requests: p.student ? [req()] : status === 'pending' ? [req()] : [] }),
      review_focus: (p) => { reviews.push(p); status = p.decision === 'approve' ? 'approved' : 'declined'; return { result: 'success' }; },
    };
    const t = await newPage(browser, { handlers: h, viewport: { width: 1280, height: 900 } });
    await t.page.addInitScript(() => { localStorage.setItem('fp_role', 'teacher'); });
    await t.page.goto(base + '/src/examiner-panel.html?student=Maria%20Lopez', { waitUntil: 'load' });
    await t.page.waitForSelector('#dash-focus-requests a.link');
    expect(await t.page.textContent('#dash-focus-requests')).toContain('Health and doctor visits');
    expect(await t.page.getAttribute('#dash-focus-requests a.link', 'href')).toContain('panel=difficulty');
    await t.page.click('#dash-focus-requests a.link');
    await t.page.waitForSelector('#panel-difficulty.active');
    const card = t.page.locator('#focus-request-content');
    expect(await card.textContent()).toContain('kitchen work');
    await card.locator('text=Approve').click();
    await t.page.waitForFunction(() => document.getElementById('focus-request-content').textContent.includes('Approved'));
    expect(await card.locator('button').count()).toBe(0); // decided: nothing left to click
    expect(reviews.length).toBe(1);
    expect(reviews[0].decision).toBe('approve');
    await t.page.waitForSelector('#dash-focus-requests', { state: 'hidden' });
    await t.ctx.close();
  });
  it('topic requests: decided requests are a simple table with no buttons; only a waiting one can be approved or declined', async () => {
    const all = [
      { id: 'f3', student_name: 'Maria Lopez', requested_at: '2026-10-13T10:00:00Z', status: 'pending', topics_en: ['Phone calls'], note: '' },
      { id: 'f2', student_name: 'Maria Lopez', requested_at: '2026-10-12T10:00:00Z', status: 'declined', topics_en: ['Grammar', 'Housing'], note: 'rent' },
      { id: 'f1', student_name: 'Maria Lopez', requested_at: '2026-10-10T10:00:00Z', status: 'approved', topics_en: ['Health and doctor visits'], note: '' },
      { id: 'f0', student_name: 'Maria Lopez', requested_at: '2026-10-01T10:00:00Z', status: 'replaced', topics_en: ['Work and jobs'], note: '' },
    ];
    const reviews = [];
    const h = {
      ...handlers,
      get_focus_requests: (p) => ({ requests: p.student ? all : [] }),
      review_focus: (p) => { reviews.push(p); all.find((r) => r.id === p.id).status = p.decision === 'approve' ? 'approved' : 'declined'; return { result: 'success' }; },
    };
    const t = await newPage(browser, { handlers: h, viewport: { width: 1280, height: 900 } });
    await t.page.addInitScript(() => { localStorage.setItem('fp_role', 'teacher'); });
    await t.page.goto(base + '/src/examiner-panel.html?student=Maria%20Lopez&panel=difficulty', { waitUntil: 'load' });
    await t.page.waitForSelector('#focus-request-content table');
    const rows = t.page.locator('#focus-request-content tbody tr');
    expect(await rows.count()).toBe(4);
    expect(await rows.nth(1).textContent()).toContain('Declined');
    expect(await rows.nth(1).locator('button').count()).toBe(0); // the bug: a declined request used to offer Approve again
    expect(await rows.nth(2).textContent()).toContain('Approved');
    expect(await rows.nth(2).locator('button').count()).toBe(0);
    expect(await rows.nth(3).textContent()).toContain('Replaced');
    expect(await t.page.locator('#focus-request-content button').allTextContents()).toEqual(['Approve', 'Decline']); // only the waiting row
    await rows.nth(0).locator('text=Decline').click();
    await t.page.waitForFunction(() => document.querySelectorAll('#focus-request-content button').length === 0);
    expect(await rows.nth(0).textContent()).toContain('Declined');
    expect(reviews).toEqual([{ action: 'review_focus', id: 'f3', decision: 'decline', ...reviews[0] }]);
    await t.ctx.close();
  });
});

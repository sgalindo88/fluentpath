/**
 * DATA-2 — placement-test save verification by opaque submission_id.
 * Client id/verify helpers (utils.js) + backend column and retry idempotency.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { loadUtils, loadAppsScriptAuth } from './helpers.js';

describe('newSubmissionId', () => {
  const origWindow = globalThis.window;
  afterEach(() => { globalThis.window = origWindow; });

  it('is text-safe (never a number/date) and unique', () => {
    const u = loadUtils();
    const a = u.newSubmissionId(), b = u.newSubmissionId();
    expect(a).toMatch(/^sub_[a-z0-9]+_[0-9a-f]+$/);
    expect(Number.isNaN(Number(a))).toBe(true);
    expect(a).not.toBe(b);
  });

  it('works without crypto.randomUUID (older iOS Safari)', () => {
    const u = loadUtils();
    globalThis.window = { crypto: { getRandomValues: (arr) => { arr.fill(171); return arr; } } };
    expect(u.newSubmissionId()).toMatch(/^sub_[a-z0-9]+_(ab){16}$/);
  });

  it('works with no crypto at all', () => {
    const u = loadUtils();
    globalThis.window = {};
    expect(u.newSubmissionId()).toMatch(/^sub_[a-z0-9]+_[0-9a-f]+$/);
  });
});

describe('submissionMatches', () => {
  const u = loadUtils();
  it('matches only the exact id', () => {
    expect(u.submissionMatches({ found: true, submission_id: 'sub_x' }, 'sub_x')).toBe(true);
    expect(u.submissionMatches({ found: true, submission_id: ' sub_x ' }, 'sub_x')).toBe(true);
    expect(u.submissionMatches({ found: true, submission_id: 'sub_old' }, 'sub_x')).toBe(false);
  });
  it('rejects an old row with no id, a missing row, and an empty id', () => {
    expect(u.submissionMatches({ found: true }, 'sub_x')).toBe(false);
    expect(u.submissionMatches({ found: false }, 'sub_x')).toBe(false);
    expect(u.submissionMatches(null, 'sub_x')).toBe(false);
    expect(u.submissionMatches({ found: true, submission_id: '' }, '')).toBe(false);
  });
  it('ignores submitted_at entirely (locale strings that used to break verify)', () => {
    const row = { found: true, submitted_at: '2026-09-13, 10:51:19 p.m.', submission_id: 'sub_x' };
    expect(u.submissionMatches(row, 'sub_x')).toBe(true);
  });
});

describe('backend: submission_id column and retry', () => {
  const post = (fp, extra = {}) => fp.POST_HANDLERS._submit_test(
    { candidate_name: 'Maria', submitted_at: '2026-09-13T22:51:19.000Z', reading_score: '10 / 20', ...extra });
  const rows = (fp) => fp._ss.getSheetByName('Initial Test Results').getDataRange().getValues();

  it('adds submission_id to the headers', () => {
    const fp = loadAppsScriptAuth();
    expect(fp.HEADERS['Initial Test Results']).toContain('submission_id');
  });

  it('stores the id and get_test_results returns it', () => {
    const fp = loadAppsScriptAuth();
    post(fp, { submission_id: 'sub_1' });
    const res = fp.GET_HANDLERS.get_test_results({ student: 'Maria' });
    expect(res.found).toBe(true);
    expect(res.submission_id).toBe('sub_1');
  });

  it('a retry with the same id does not append a duplicate row', () => {
    const fp = loadAppsScriptAuth();
    post(fp, { submission_id: 'sub_1' });
    post(fp, { submission_id: 'sub_1' });
    expect(rows(fp).length).toBe(2); // header + one row
    expect(fp._mail.length).toBeLessThanOrEqual(1);
  });

  it('a re-take with a new id appends a new row that verifies as the newest', () => {
    const fp = loadAppsScriptAuth();
    post(fp, { submission_id: 'sub_1' });
    post(fp, { submission_id: 'sub_2' });
    expect(rows(fp).length).toBe(3);
    expect(fp.GET_HANDLERS.get_test_results({ student: 'Maria' }).submission_id).toBe('sub_2');
  });

  it('adds the column to an existing sheet without shifting old rows', () => {
    const fp = loadAppsScriptAuth();
    const old = fp.HEADERS['Initial Test Results'].filter(h => h !== 'submission_id');
    const sheet = fp._ss.insertSheet('Initial Test Results');
    sheet.appendRow(old);
    sheet.appendRow(old.map(h => (h === 'candidate_name' ? 'Maria' : 'x')));
    post(fp, { submission_id: 'sub_9' });
    const all = rows(fp);
    expect(all[0][all[0].length - 1]).toBe('submission_id');
    expect(all[1][all[0].indexOf('candidate_name')]).toBe('Maria');
    expect(all[2][all[0].indexOf('submission_id')]).toBe('sub_9');
  });
});

describe('lessonSaveConfirmed (N-12 / DATA-6)', () => {
  const u = loadUtils();
  const prog = (...ids) => ({ lessons: ids.map((id, i) => ({ day: 3, submission_id: id })) });

  it('confirms only a row carrying our id', () => {
    expect(u.lessonSaveConfirmed(prog('sub_a', 'sub_b'), 'sub_b')).toBe(true);
  });
  it('does NOT confirm an older attempt of the same day (the DATA-6 bug)', () => {
    expect(u.lessonSaveConfirmed(prog('sub_old'), 'sub_new')).toBe(false);
  });
  it('does not confirm rows without an id, or bad replies', () => {
    expect(u.lessonSaveConfirmed({ lessons: [{ day: 3 }] }, 'sub_x')).toBe(false);
    expect(u.lessonSaveConfirmed({ lessons: [] }, 'sub_x')).toBe(false);
    expect(u.lessonSaveConfirmed(null, 'sub_x')).toBe(false);
    expect(u.lessonSaveConfirmed({ error: 'x' }, 'sub_x')).toBe(false);
    expect(u.lessonSaveConfirmed(prog('sub_x'), '')).toBe(false);
  });
});

describe('backend: save_progress submission_id and retry (N-12)', () => {
  const save = (fp, extra = {}) => fp.POST_HANDLERS.save_progress(
    { student_name: 'Maria', day_number: '3', level: 'A1', topic: 'Food', ...extra }, {}, null);
  const progressRows = (fp) => fp._ss.getSheetByName('Course Progress').getDataRange().getValues();

  it('adds submission_id to Course Progress headers', () => {
    const fp = loadAppsScriptAuth();
    expect(fp.HEADERS['Course Progress']).toContain('submission_id');
  });

  it('stores the id and get_progress returns it per lesson', () => {
    const fp = loadAppsScriptAuth();
    save(fp, { submission_id: 'sub_1' });
    const res = fp.GET_HANDLERS.get_progress({ student: 'Maria' });
    expect(res.lessons.length).toBe(1);
    expect(res.lessons[0].submission_id).toBe('sub_1');
  });

  it('a retry with the same id writes no duplicate row and sends no second email', () => {
    const fp = loadAppsScriptAuth();
    save(fp, { submission_id: 'sub_1' });
    const mailAfterFirst = fp._mail.length;
    save(fp, { submission_id: 'sub_1' });
    expect(progressRows(fp).length).toBe(2);
    expect(fp._mail.length).toBe(mailAfterFirst);
  });

  it('a re-do of the same day under a new id is saved and is the one that verifies', () => {
    const fp = loadAppsScriptAuth();
    const u = loadUtils();
    save(fp, { submission_id: 'sub_1' });
    save(fp, { submission_id: 'sub_2' });
    expect(progressRows(fp).length).toBe(3);
    const res = fp.GET_HANDLERS.get_progress({ student: 'Maria' });
    expect(u.lessonSaveConfirmed(res, 'sub_2')).toBe(true);
  });
});

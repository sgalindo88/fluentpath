/**
 * Phase E batch B: the hub's progress read (BE-8, N-20, BE-5).
 *  - only the columns the reply needs are read, never every student's writing and answers
 *  - the cached reply is the light one and really fits the cache (CacheService refuses 100 KB)
 *  - a read does not write: students are listed at create/login, not from get_progress
 */
import { describe, it, expect } from 'vitest';
import { loadAppsScriptAuth } from './helpers.js';

const BIG = 'x'.repeat(5000);

function setup({ students = ['Maria', 'Carlos'], lessons = 20, extraColumns = true } = {}) {
  const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
  fp.POST_HANDLERS.update_settings({ student_name: 'Maria', access_granted: 'true', cefr_level: 'A2' }, {});
  const H = fp.HEADERS['Course Progress'];
  const sh = fp._ss.insertSheet('Course Progress');
  sh.appendRow(H);
  for (const name of students) {
    for (let d = 1; d <= lessons; d++) {
      sh.appendRow(H.map((k) => ({
        student_name: name, day_number: String(d), topic: 'Topic ' + d, lesson_date: '2026-10-' + String(d).padStart(2, '0'),
        time_spent_min: '55', confidence: 'Good', course_id: '1', submission_id: name + '-' + d,
        answers_json: extraColumns ? JSON.stringify({ a: BIG }) : '', writing_response: extraColumns ? BIG : '', speaking_transcript: extraColumns ? BIG : '',
      }[k] ?? '')));
    }
  }
  const M = fp.HEADERS['Lesson Marks'];
  const ms = fp._ss.insertSheet('Lesson Marks');
  ms.appendRow(M);
  ms.appendRow(M.map((k) => ({ student_name: 'Maria', day_number: '2', writing_score: '20', speaking_score: '15', course_id: '1' }[k] ?? '')));
  return { fp, sh };
}

/** Record every getRange call on a sheet: [row, col, numRows, numCols]. */
function spy(sheet) {
  const calls = [];
  const orig = sheet.getRange;
  sheet.getRange = (...a) => { calls.push(a); return orig(...a); };
  return calls;
}

describe('BE-8: the progress read touches only the columns it needs', () => {
  it('never reads the heavy columns (answers, writing, transcripts) and never a whole row block', () => {
    const { fp, sh } = setup();
    const calls = spy(sh);
    fp.handleGetProgress('Maria', undefined, false);
    const H = fp.HEADERS['Course Progress'];
    const heavy = ['answers_json', 'writing_response', 'speaking_transcript', 'student_notes', 'warmup_response'].map((k) => H.indexOf(k) + 1);
    const colsRead = calls.filter((c) => c[0] === 2).map((c) => c[1]); // data reads start at row 2
    for (const c of heavy) expect(colsRead).not.toContain(c);
    expect(calls.every((c) => (c[3] ?? 1) === 1 || c[0] === 1)).toBe(true); // single columns (the header is the one wide read)
  });

  it('the reply is right: this student only, in day order, with the marks joined', () => {
    const { fp } = setup();
    const out = fp.handleGetProgress('Maria', undefined, false);
    expect(out.lessons.length).toBe(20);
    expect(out.lessons.map((l) => parseInt(l.day, 10))).toEqual([...Array(20).keys()].map((i) => i + 1));
    expect(out.lessons[1]).toMatchObject({ day: '2', topic: 'Topic 2', writing_score: '20', speaking_score: '15', submission_id: 'Maria-2', confidence: 'Good', time_spent: '55' });
    expect(out.lessons[0].writing_score).toBeNull();
    expect(out).toMatchObject({ lessons_completed: 20, max_day: 20, next_day: 20, cefr_level: 'A2', course_id: '1' });
    expect(fp.handleGetProgress('Carlos', undefined, false).lessons.length).toBe(20);
  });

  it('maxCompletedDay reads three columns and honours the course', () => {
    const { fp, sh } = setup({ lessons: 5 });
    const calls = spy(sh);
    expect(fp.maxCompletedDay('Maria', '1')).toBe(5);
    expect(fp.maxCompletedDay('Maria', '2')).toBe(0);
    expect(calls.filter((c) => c[0] === 2).length).toBe(6); // 3 columns, twice
  });
});

describe('N-20: the cached reply is light and fits the cache', () => {
  it('omits answers_json by default and includes it when asked (the teacher dashboard)', () => {
    const { fp } = setup({ lessons: 3 });
    expect(fp.handleGetProgress('Maria', undefined, false).lessons[0]).not.toHaveProperty('answers_json');
    const heavy = fp.handleGetProgress('Maria', undefined, true);
    expect(heavy.lessons[0].answers_json).toContain('xxxx');
    expect(heavy.lessons[0].submission_id).toBe('Maria-1');
  });

  it('20 lessons with 5 KB of answers each: the light reply is small and is served from the cache the second time', () => {
    const { fp, sh } = setup();
    const first = fp.handleGetProgress('Maria', undefined, false);
    expect(JSON.stringify(first).length).toBeLessThan(20 * 1024);
    const calls = spy(sh);
    const second = fp.handleGetProgress('Maria', undefined, false);
    expect(calls.length).toBe(0); // no sheet read: the cache answered
    expect(second.lessons.length).toBe(20);
  });

  it('the heavy reply would not fit the cache, is never cached, and never poisons the light one', () => {
    const { fp, sh } = setup();
    const heavy = fp.handleGetProgress('Maria', undefined, true);
    expect(JSON.stringify(heavy).length).toBeGreaterThan(90 * 1024);
    const calls = spy(sh);
    const light = fp.handleGetProgress('Maria', undefined, false);
    expect(calls.length).toBeGreaterThan(0); // nothing was cached by the heavy call
    expect(light.lessons[0]).not.toHaveProperty('answers_json');
    expect(fp.handleGetProgress('Maria', undefined, true).lessons[0].answers_json).toContain('xxxx');
  });

  it('cachePut says so when a value is too big instead of failing silently', () => {
    const fp = loadAppsScriptAuth({});
    expect(fp.cachePut('k', { a: 'x'.repeat(95 * 1024) })).toBe(false);
    expect(fp.cacheGet('k')).toBeNull();
    expect(fp.cachePut('k2', { a: 1 })).toBe(true);
    expect(fp.cacheGet('k2')).toEqual({ a: 1 });
  });

  it('the get_progress endpoint takes include_answers=1 and nothing else turns it on', () => {
    const { fp } = setup({ lessons: 2 });
    expect(fp.GET_HANDLERS.get_progress({ student: 'Maria' }, null).lessons[0]).not.toHaveProperty('answers_json');
    expect(fp.GET_HANDLERS.get_progress({ student: 'Maria', include_answers: 'true' }, null).lessons[0]).not.toHaveProperty('answers_json');
    expect(fp.GET_HANDLERS.get_progress({ student: 'Maria', include_answers: '1' }, null).lessons[0].answers_json).toBeTruthy();
  });
});

describe('BE-5: a read does not write', () => {
  const studentsRows = (fp) => { const sh = fp._ss.getSheetByName('Students'); return sh ? sh.getLastRow() - 1 : 0; };

  it('get_progress no longer adds anyone to the Students tab, even a name nobody has', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    fp.handleGetProgress('Somebody Nobody', undefined, false);
    fp.handleGetProgress('Maria', undefined, false);
    expect(studentsRows(fp)).toBeLessThanOrEqual(0);
  });

  it('logging in registers a student once (covers accounts created before create_account did it)', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    fp.POST_HANDLERS.create_account({ email: 'maria@x.com', student_name: 'Maria', password: 'pw1234', role: 'student' }, {});
    fp._ss.getSheetByName('Students').getRange(2, 1, 1, 2).setValues([['', '']]); // simulate an account that predates the registration
    expect(fp.handleGetStudents().students).toEqual([]);
    expect(fp.POST_HANDLERS.login({ email: 'maria@x.com', password: 'pw1234' }, {})._json.ok).toBe(true);
    expect(fp.POST_HANDLERS.login({ email: 'maria@x.com', password: 'pw1234' }, {})._json.ok).toBe(true);
    expect(fp.handleGetStudents().students.map((s) => s.name)).toEqual(['Maria']);
  });

  it('a teacher logging in is not added to the student list', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    fp.POST_HANDLERS.create_account({ email: 't@x.com', student_name: 'Teach', password: 'pw1234', role: 'teacher' }, {});
    fp.POST_HANDLERS.login({ email: 't@x.com', password: 'pw1234' }, {});
    expect(fp.handleGetStudents().students).toEqual([]);
  });
});

describe('BE-8: the library lookup reads full rows only for matches', () => {
  it('returns the right entries and reads lesson_json only for them', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const H = fp.HEADERS['Lesson Library'];
    const sh = fp._ss.insertSheet('Lesson Library');
    sh.appendRow(H);
    const lesson = (t) => JSON.stringify({ topic: t });
    for (let i = 0; i < 40; i++) {
      const level = ['A1', 'A2', 'B1', 'B2'][i % 4];
      sh.appendRow(H.map((k) => ({ id: 'e' + i, level, day: String(1 + (i % 5)), is_active: i === 9 ? 'false' : 'true', times_served: String(i), created_at: 'x', source_student: 'S', original_difficulty_json: '{}', lesson_json: lesson('L' + i) }[k] ?? '')));
    }
    const calls = spy(sh);
    const out = fp.getLibraryEntries('A2', 2); // i % 4 == 1 and day 2 -> i = 1, 21(day 2? ) etc.
    const expected = [...Array(40).keys()].filter((i) => ['A1', 'A2', 'B1', 'B2'][i % 4] === 'A2' && 1 + (i % 5) === 2 && i !== 9).map((i) => 'e' + i);
    expect(out.map((e) => e.id)).toEqual(expected);
    expect(out[0].lesson.topic).toBe('L' + expected[0].slice(1));
    const fullRows = calls.filter((c) => c[0] >= 2 && (c[3] ?? 1) > 3);
    expect(fullRows.length).toBe(expected.length); // one wide read per match, none for the other rows
  });
});

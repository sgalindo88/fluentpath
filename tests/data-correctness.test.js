/**
 * Phase E batch C: data correctness.
 *  - BE-3 the latest submission goes by timestamp, whatever the date format
 *  - BE-4 the lesson library keeps varied lessons and rotates the ones it serves
 *  - BE-7 the backup pruning only touches backups
 */
import { describe, it, expect } from 'vitest';
import { loadAppsScriptAuth } from './helpers.js';

const PROFILE = { vocabulary_density: 3, sentence_complexity: 3, speaking_duration: 3, writing_length: 3, listening_speed: 3, grammar_complexity: 3 };

function progress(fp, rows) {
  const H = fp.HEADERS['Course Progress'];
  const sh = fp._ss.insertSheet('Course Progress');
  sh.appendRow(H);
  for (const r of rows) sh.appendRow(H.map((k) => r[k] ?? ''));
  const M = fp.HEADERS['Lesson Marks'];
  const ms = fp._ss.insertSheet('Lesson Marks');
  ms.appendRow(M);
  return ms;
}

describe('BE-3: parseSheetTime', () => {
  const fp = loadAppsScriptAuth();
  it('reads Date objects, ISO strings and US locale strings', () => {
    expect(fp.parseSheetTime(new Date('2026-10-02T10:00:00Z'))).toBe(Date.parse('2026-10-02T10:00:00Z'));
    expect(fp.parseSheetTime('2026-10-02T10:00:00.000Z')).toBe(Date.parse('2026-10-02T10:00:00Z'));
    expect(fp.parseSheetTime('10/2/2026, 10:00:00 AM')).not.toBeNull();
  });
  it('returns null (never throws) for blanks and junk', () => {
    for (const v of ['', null, undefined, 'tomorrow', '13/45/2026 x', {}]) expect(fp.parseSheetTime(v)).toBeNull();
  });
});

describe('BE-3: handleGetLatestSubmission', () => {
  it('picks the newest by submitted_at, not the last row', () => {
    const fp = loadAppsScriptAuth();
    progress(fp, [
      { student_name: 'Maria', day_number: '3', submitted_at: '2026-10-03T10:00:00.000Z' },
      { student_name: 'Maria', day_number: '1', submitted_at: '2026-10-01T10:00:00.000Z' },
    ]);
    expect(fp.handleGetLatestSubmission('Maria').day_number).toBe('3');
  });

  it('compares mixed formats (Date object, ISO, locale string) on one timeline', () => {
    const fp = loadAppsScriptAuth();
    progress(fp, [
      { student_name: 'Maria', day_number: '2', submitted_at: new Date('2026-10-02T12:00:00Z') },
      { student_name: 'Maria', day_number: '4', submitted_at: '10/4/2026, 9:00:00 AM' },
      { student_name: 'Maria', day_number: '3', submitted_at: '2026-10-03T12:00:00.000Z' },
    ]);
    expect(fp.handleGetLatestSubmission('Maria').day_number).toBe('4');
  });

  it('a row with an unreadable time never beats a dated one, and does not break', () => {
    const fp = loadAppsScriptAuth();
    progress(fp, [
      { student_name: 'Maria', day_number: '2', submitted_at: '2026-10-02T12:00:00.000Z' },
      { student_name: 'Maria', day_number: '9', submitted_at: '02/10/2026 por la tarde' },
    ]);
    expect(fp.handleGetLatestSubmission('Maria').day_number).toBe('2');
  });

  it('with no readable times at all, behaves as before (last row)', () => {
    const fp = loadAppsScriptAuth();
    progress(fp, [
      { student_name: 'Maria', day_number: '1', submitted_at: 'ayer' },
      { student_name: 'Maria', day_number: '2', submitted_at: 'hoy' },
    ]);
    expect(fp.handleGetLatestSubmission('Maria').day_number).toBe('2');
  });

  it('still prefers an ungraded submission, and ignores other students', () => {
    const fp = loadAppsScriptAuth();
    const ms = progress(fp, [
      { student_name: 'Maria', day_number: '1', submitted_at: '2026-10-01T10:00:00.000Z' },
      { student_name: 'Maria', day_number: '2', submitted_at: '2026-10-02T10:00:00.000Z' },
      { student_name: 'Carlos', day_number: '7', submitted_at: '2026-10-09T10:00:00.000Z' },
    ]);
    const M = fp.HEADERS['Lesson Marks'];
    ms.appendRow(M.map((k) => ({ student_name: 'Maria', day_number: '2', writing_score: '20' }[k] ?? '')));
    const out = fp.handleGetLatestSubmission('Maria');
    expect(out.day_number).toBe('1');
    expect(out.has_marks).toBeUndefined();
  });

  it('falls back to the newest graded one, with its marks, when all are graded', () => {
    const fp = loadAppsScriptAuth();
    const ms = progress(fp, [
      { student_name: 'Maria', day_number: '2', submitted_at: '2026-10-02T10:00:00.000Z' },
      { student_name: 'Maria', day_number: '1', submitted_at: '2026-10-01T10:00:00.000Z' },
    ]);
    const M = fp.HEADERS['Lesson Marks'];
    for (const d of ['1', '2']) ms.appendRow(M.map((k) => ({ student_name: 'Maria', day_number: d, writing_score: '20' }[k] ?? '')));
    const out = fp.handleGetLatestSubmission('Maria');
    expect(out.day_number).toBe('2');
    expect(out.has_marks).toBe(true);
  });

  it('an explicit day is returned unchanged', () => {
    const fp = loadAppsScriptAuth();
    progress(fp, [
      { student_name: 'Maria', day_number: '1', submitted_at: '2026-10-01T10:00:00.000Z', topic: 'One' },
      { student_name: 'Maria', day_number: '2', submitted_at: '2026-10-02T10:00:00.000Z' },
    ]);
    expect(fp.handleGetLatestSubmission('Maria', '1').topic).toBe('One');
  });
});

describe('BE-4: library variety', () => {
  const entry = (id, served, lesson) => ({ id, times_served: served, lesson, difficulty: { difficultyProfile: { ...PROFILE } } });
  const fp = loadAppsScriptAuth();

  it('same sliders but different lesson text is not a duplicate; identical text is', () => {
    const entries = [entry('a', 0, { title: 'Cafe' })];
    expect(fp.nearDuplicateExists(entries, { difficultyProfile: PROFILE }, { title: 'Bus' })).toBe(false);
    expect(fp.nearDuplicateExists(entries, { difficultyProfile: PROFILE }, { title: 'Cafe' })).toBe(true);
  });

  it('different sliders are never a duplicate', () => {
    const entries = [entry('a', 0, { title: 'Cafe' })];
    expect(fp.nearDuplicateExists(entries, { difficultyProfile: { ...PROFILE, writing_length: 5 } }, { title: 'Cafe' })).toBe(false);
  });

  it('serves the least-served matching entry', () => {
    const entries = [entry('a', 5, {}), entry('b', 1, {}), entry('c', 3, {})];
    for (let i = 0; i < 20; i++) expect(fp.findLibraryMatch(entries, { difficultyProfile: PROFILE }).id).toBe('b');
  });

  it('rotates among equally-served entries', () => {
    const entries = [entry('a', 2, {}), entry('b', 2, {}), entry('c', 2, {})];
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(fp.findLibraryMatch(entries, { difficultyProfile: PROFILE }).id);
    expect(seen.size).toBe(3);
  });

  it('lenient pass also picks the least served; no match still returns null', () => {
    const far = { ...PROFILE, vocabulary_density: 5, sentence_complexity: 5 }; // distance 4: lenient only
    const mk = (id, served) => ({ id, times_served: served, lesson: {}, difficulty: { difficultyProfile: { ...PROFILE } } });
    const out = fp.findLibraryMatch([mk('a', 4), mk('b', 0)], { difficultyProfile: far });
    expect(out.id).toBe('b');
    expect(fp.findLibraryMatch([mk('a', 0)], { difficultyProfile: { ...PROFILE, vocabulary_density: 1, sentence_complexity: 1, grammar_complexity: 1, writing_length: 1, listening_speed: 1, speaking_duration: 1 } })).toBeNull();
  });

  function libSheet(f) {
    const sh = f._ss.insertSheet('Lesson Library');
    sh.appendRow(f.HEADERS['Lesson Library']);
    return sh;
  }

  it('addToLibrary keeps a different lesson for the same sliders, rejects a repeat', () => {
    const f = loadAppsScriptAuth();
    const sh = libSheet(f);
    expect(f.addToLibrary('A1', 1, { title: 'Cafe' }, { difficultyProfile: PROFILE }, 'Maria')).toBe(true);
    expect(f.addToLibrary('A1', 1, { title: 'Bus' }, { difficultyProfile: PROFILE }, 'Maria')).toBe(true);
    expect(f.addToLibrary('A1', 1, { title: 'Bus' }, { difficultyProfile: PROFILE }, 'Maria')).toBe(false);
    expect(sh.getLastRow()).toBe(3);
  });

  it('a (level, day) bucket stops at the cap; other days are unaffected', () => {
    const f = loadAppsScriptAuth();
    libSheet(f);
    for (let i = 0; i < f.LIBRARY_BUCKET_CAP; i++) expect(f.addToLibrary('A1', 1, { title: 'L' + i }, { difficultyProfile: PROFILE }, 'M')).toBe(true);
    expect(f.addToLibrary('A1', 1, { title: 'one more' }, { difficultyProfile: PROFILE }, 'M')).toBe(false);
    expect(f.addToLibrary('A1', 2, { title: 'other day' }, { difficultyProfile: PROFILE }, 'M')).toBe(true);
    expect(f.LIBRARY_BUCKET_CAP).toBe(12);
  });
});

describe('BE-7: backup pruning', () => {
  const day = (n) => new Date(Date.UTC(2026, 9, n));
  it('keeps the 7 newest backups and trashes only older backups', () => {
    const fp = loadAppsScriptAuth();
    const b = fp._drive.backups;
    for (let n = 1; n <= 9; n++) b.push({ name: 'FluentPath Backup 2026-10-0' + n, created: day(n), mime: 'sheets', trashed: false });
    fp.dailyBackup(); // adds today's, so 10 backups
    const alive = b.filter((f) => !f.trashed);
    expect(alive.length).toBe(7);
    expect(b.filter((f) => f.trashed).map((f) => f.name).sort()).toEqual([
      'FluentPath Backup 2026-10-01', 'FluentPath Backup 2026-10-02', 'FluentPath Backup 2026-10-03',
    ]);
  });

  it('never trashes a spreadsheet that is not a backup, or a non-spreadsheet, even when old', () => {
    const fp = loadAppsScriptAuth();
    const b = fp._drive.backups;
    b.push({ name: 'Budget 2025', created: new Date('2020-01-01'), mime: 'sheets', trashed: false });
    b.push({ name: 'FluentPath Backup notes.txt', created: new Date('2020-01-01'), mime: 'text', trashed: false });
    for (let n = 1; n <= 9; n++) b.push({ name: 'FluentPath Backup 2026-10-0' + n, created: day(n), mime: 'sheets', trashed: false });
    fp.dailyBackup();
    expect(b.find((f) => f.name === 'Budget 2025').trashed).toBe(false);
    expect(b.find((f) => f.mime === 'text').trashed).toBe(false);
    expect(b.filter((f) => f.trashed && f.mime === 'sheets').length).toBe(3);
  });
});

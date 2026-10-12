/**
 * Small Phase A items: fp_lang survives the logout purge; pre-scoping
 * checkpoints are adopted by their owner (and only their owner).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

function installLocalStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  globalThis.localStorage = {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
  return m;
}

function loadConfig() {
  globalThis.window = { FP: {} };
  globalThis.location = { hostname: 'localhost', pathname: '/' };
  globalThis.document = { getElementsByTagName: () => [{ src: 'x/config.js', parentNode: { insertBefore() {} }, nextSibling: null }], createElement: () => ({ remove() {} }) };
  (0, eval)(readFileSync(resolve(ROOT, 'src/scripts/config.js'), 'utf-8') + '\n;globalThis.__FP = FP;');
  return globalThis.__FP;
}

function loadCheckpoint() {
  const code = readFileSync(resolve(ROOT, 'src/scripts/checkpoint.js'), 'utf-8');
  (0, eval)(code + '\n;globalThis.__CK = Checkpoint;');
  return globalThis.__CK;
}

describe('FP.purgeStudentState', () => {
  it('removes student state but keeps fp_lang', () => {
    const store = installLocalStorage({
      fp_lang: 'es', fp_student_name: 'Maria', fp_cefr_level: 'A1', fp_last_lesson_day: '4',
      fp_ckpt_test_a: '{}', other_key: 'keep-me',
    });
    loadConfig().purgeStudentState();
    expect([...store.keys()].sort()).toEqual(['fp_lang', 'other_key']);
  });

  it('is safe when nothing is stored', () => {
    installLocalStorage({});
    expect(() => loadConfig().purgeStudentState()).not.toThrow();
  });
});

describe('Checkpoint.load: pre-scoping (legacy) keys', () => {
  let store;
  beforeEach(() => { store = installLocalStorage({ fp_student_name: 'Maria Lopez' }); });

  const legacy = (name, extra = {}) => JSON.stringify({ screen: 'screen-q5', candidateName: name, _savedAt: 5, ...extra });

  it('adopts the logged-in student\'s own unscoped checkpoint and moves it', () => {
    store.set('fp_ckpt_test_b', legacy('maria lopez'));
    const ck = loadCheckpoint();
    const data = ck.load('test');
    expect(data && data.screen).toBe('screen-q5');
    expect(store.has('fp_ckpt_test_b')).toBe(false);       // old key gone
    expect(store.has('fp_ckpt_maria-lopez_test_b')).toBe(true); // now scoped
  });

  it('adopts a lesson checkpoint (studentName field) and a single-key legacy one', () => {
    store.set('fp_ckpt_lesson', JSON.stringify({ lessonContent: {}, studentName: 'Maria Lopez', _savedAt: 3 }));
    const data = loadCheckpoint().load('lesson');
    expect(data && data.lessonContent).toBeTruthy();
    expect(store.has('fp_ckpt_lesson')).toBe(false);
  });

  it('does NOT adopt another student\'s checkpoint (DATA-1)', () => {
    store.set('fp_ckpt_test_a', legacy('Someone Else'));
    const ck = loadCheckpoint();
    expect(ck.load('test')).toBeNull();
    expect(store.has('fp_ckpt_test_a')).toBe(true); // untouched
  });

  it('does NOT adopt a checkpoint with no owner name in it', () => {
    store.set('fp_ckpt_test_a', JSON.stringify({ screen: 'x', _savedAt: 1 }));
    expect(loadCheckpoint().load('test')).toBeNull();
  });

  it('does not overwrite a newer scoped checkpoint', () => {
    store.set('fp_ckpt_maria-lopez_test_a', JSON.stringify({ screen: 'new', candidateName: 'Maria Lopez', _savedAt: 99 }));
    store.set('fp_ckpt_test_a', legacy('Maria Lopez'));
    expect(loadCheckpoint().load('test').screen).toBe('new');
  });

  it('ignores corrupt legacy data', () => {
    store.set('fp_ckpt_test_a', '{not json');
    expect(loadCheckpoint().load('test')).toBeNull();
  });

  it('clear() still removes both scoped and unscoped keys', () => {
    store.set('fp_ckpt_test_a', legacy('Someone Else'));
    const ck = loadCheckpoint();
    ck.clear('test');
    expect(store.has('fp_ckpt_test_a')).toBe(false);
  });
});

/**
 * Sprint 0 backend-integrity tests — BE-1 (LockService) and BE-2 (cache
 * invalidation). Both are silent-corruption bugs: nothing errors, the data is
 * just quietly wrong, so they need explicit coverage.
 */
import { describe, it, expect } from 'vitest';
import { loadAppsScriptAuth } from './helpers.js';

/* ═══════════════════════════════════════════════════════════════
   BE-1 — mutating work is serialized behind the script lock
   ═══════════════════════════════════════════════════════════════ */

describe('BE-1 — withScriptLock', () => {
  it('takes and releases the lock around the callback', () => {
    const fp = loadAppsScriptAuth({});
    const before = { ...fp._lockLog };
    const out = fp.withScriptLock(() => 'done');
    expect(out).toBe('done');
    expect(fp._lockLog.waits).toBe(before.waits + 1);
    expect(fp._lockLog.releases).toBe(before.releases + 1);
  });

  it('releases the lock even when the callback throws', () => {
    const fp = loadAppsScriptAuth({});
    const before = { ...fp._lockLog };
    expect(() => fp.withScriptLock(() => { throw new Error('boom'); })).toThrow('boom');
    expect(fp._lockLog.releases).toBe(before.releases + 1);
  });

  it('is reentrant — a nested call does not re-acquire or double-release', () => {
    // upsertByStudent and safeAppendRow are reachable both directly and from an
    // already-locked POST handler; re-acquiring would deadlock or, worse,
    // release the outer lock early and let a concurrent write interleave.
    const fp = loadAppsScriptAuth({});
    const before = { ...fp._lockLog };
    const out = fp.withScriptLock(() => fp.withScriptLock(() => 'inner'));
    expect(out).toBe('inner');
    expect(fp._lockLog.waits).toBe(before.waits + 1);
    expect(fp._lockLog.releases).toBe(before.releases + 1);
  });

  it('surfaces a clear, retryable message when the lock cannot be obtained', () => {
    const fp = loadAppsScriptAuth({});
    fp._lockLog.failNext = true;
    expect(() => fp.withScriptLock(() => 'never')).toThrow(/Server busy/);
  });

  it('does not leave the depth counter raised after a contention failure', () => {
    const fp = loadAppsScriptAuth({});
    fp._lockLog.failNext = true;
    expect(() => fp.withScriptLock(() => 'never')).toThrow();
    // A later call must still genuinely acquire the lock.
    const before = { ...fp._lockLog };
    fp.withScriptLock(() => 'ok');
    expect(fp._lockLog.waits).toBe(before.waits + 1);
  });

  it('locks a mutating POST through doPost', () => {
    const fp = loadAppsScriptAuth({ APP_SECRET: 'app', AUTH_ENFORCED: 'true' });
    const teacher = fp.createSession({ email: 't@x.com', role: 'teacher', student_name: '' });
    const before = { ...fp._lockLog };
    const out = fp.doPost({
      parameter: {
        action: 'update_settings', token: 'app', session: teacher.token,
        student_name: 'Maria', cefr_level: 'A2',
      },
      postData: null,
    });
    expect(JSON.parse(out.getContent()).result).toBe('success');
    expect(fp._lockLog.waits).toBeGreaterThan(before.waits);
    expect(fp._lockLog.releases).toBeGreaterThan(before.releases);
  });

  it('does not take the lock for a request rejected at the auth gate', () => {
    const fp = loadAppsScriptAuth({ APP_SECRET: 'app', AUTH_ENFORCED: 'true' });
    const before = { ...fp._lockLog };
    const out = fp.doPost({
      parameter: { action: 'update_settings', token: 'app', student_name: 'Maria' },
      postData: null,
    });
    expect(JSON.parse(out.getContent()).error).toBe('Unauthorized');
    expect(fp._lockLog.waits).toBe(before.waits);
  });

  it('exempts ai_summary so a slow AI call cannot stall every other write', () => {
    expect(loadAppsScriptAuth({}).UNLOCKED_POST['ai_summary']).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════
   BE-2 — the progress cache is actually invalidated
   ═══════════════════════════════════════════════════════════════ */

describe('BE-2 — cacheInvalidateStudent', () => {
  it('clears the course-suffixed progress key the reader actually writes', () => {
    // handleGetProgress caches under progress_<name>_c<courseId>, but
    // invalidation only removed the bare progress_<name> — so the hub served up
    // to 5 minutes of stale progress after every save.
    const fp = loadAppsScriptAuth({});
    fp.cachePut('progress_maria_c1', { lessons_completed: 3 });
    fp.cacheInvalidateStudent('Maria');
    expect(fp.cacheGet('progress_maria_c1')).toBeNull();
  });

  it('clears progress across every course a student can be promoted through', () => {
    const fp = loadAppsScriptAuth({});
    for (let c = 1; c <= 6; c++) fp.cachePut('progress_maria_c' + c, { course: c });
    fp.cacheInvalidateStudent('Maria');
    for (let c = 1; c <= 6; c++) expect(fp.cacheGet('progress_maria_c' + c)).toBeNull();
  });

  it('clears the legacy unsuffixed key and the settings key', () => {
    const fp = loadAppsScriptAuth({});
    fp.cachePut('progress_maria', { legacy: true });
    fp.cachePut('settings_maria', { cefr_level: 'A2' });
    fp.cacheInvalidateStudent('Maria');
    expect(fp.cacheGet('progress_maria')).toBeNull();
    expect(fp.cacheGet('settings_maria')).toBeNull();
  });

  it('is case- and whitespace-insensitive on the student name', () => {
    const fp = loadAppsScriptAuth({});
    fp.cachePut('progress_maria_c1', { lessons_completed: 3 });
    fp.cacheInvalidateStudent('  MARIA  ');
    expect(fp.cacheGet('progress_maria_c1')).toBeNull();
  });

  it('leaves another student untouched', () => {
    const fp = loadAppsScriptAuth({});
    fp.cachePut('progress_maria_c1', { who: 'maria' });
    fp.cachePut('progress_jose_c1', { who: 'jose' });
    fp.cacheInvalidateStudent('Maria');
    expect(fp.cacheGet('progress_jose_c1')).toEqual({ who: 'jose' });
  });

  it('a save_progress write invalidates the cached read', () => {
    const fp = loadAppsScriptAuth({ APP_SECRET: 'app' });
    fp.POST_HANDLERS.update_settings({ student_name: 'Maria', access_granted: 'true' }, {});
    fp.cachePut('progress_maria_c1', { lessons_completed: 0, stale: true });
    fp.POST_HANDLERS.save_progress(
      { student_name: 'Maria', day_number: '1', level: 'A1' }, {},
      { role: 'student', student_name: 'Maria' });
    expect(fp.cacheGet('progress_maria_c1')).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════
   Deploy verification — ?action=health must identify the running code
   ═══════════════════════════════════════════════════════════════ */

describe('health — deploy verification', () => {
  const health = (props = {}) => loadAppsScriptAuth(props).GET_HANDLERS.health({});

  it('reports a backend version', () => {
    // Apps Script cannot be asked which version a live web app is serving, so
    // a push that was never promoted looks exactly like a successful deploy.
    expect(health().version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reports the AI budget knobs, which prove AI-1 shipped without a version bump', () => {
    const h = health();
    expect(h.ai_max_tokens).toBeGreaterThanOrEqual(8192);
    expect(h.ai_thinking_budget).toBeDefined();
  });

  it('still answers without any auth, so an uptime monitor can call it', () => {
    const fp = loadAppsScriptAuth({ APP_SECRET: 'app', AUTH_ENFORCED: 'true' });
    const out = JSON.parse(fp.doGet({ parameter: { action: 'health' } }).getContent());
    expect(out.error).toBeUndefined();
    expect(out.version).toBeDefined();
  });

  it('does not leak secret values', () => {
    const h = health({ APP_SECRET: 'super-secret', AI_API_KEY: 'key-123' });
    const blob = JSON.stringify(h);
    expect(blob).not.toContain('super-secret');
    expect(blob).not.toContain('key-123');
    expect(h.app_secret).toBe('set');
  });
});

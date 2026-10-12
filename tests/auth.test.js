/**
 * Phase 1 auth tests — accounts, password hashing, sessions, and the
 * server-derived identity that closes the ?student= impersonation hole.
 *
 * These use loadAppsScriptAuth(), which installs in-memory Spreadsheet /
 * Cache / Properties / Utilities mocks so the real apps-script.js code runs
 * end-to-end against a fake backend.
 */
import { describe, it, expect } from 'vitest';
import { loadAppsScriptAuth } from './helpers.js';

describe('password hashing', () => {
  it('is stable for the same plain+salt+pepper', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    expect(fp.hashPassword('hunter2', 'salt-a')).toBe(fp.hashPassword('hunter2', 'salt-a'));
  });

  it('differs for a wrong password', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    expect(fp.hashPassword('hunter2', 'salt-a')).not.toBe(fp.hashPassword('hunter3', 'salt-a'));
  });

  it('differs for a different salt', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    expect(fp.hashPassword('hunter2', 'salt-a')).not.toBe(fp.hashPassword('hunter2', 'salt-b'));
  });

  it('differs for a different pepper', () => {
    // One load; flip the pepper between hashes (loading twice would clobber the
    // shared globalThis.PropertiesService and defeat the comparison).
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep-1' });
    const h1 = fp.hashPassword('hunter2', 'salt-a');
    fp._store.PW_PEPPER = 'pep-2';
    expect(fp.hashPassword('hunter2', 'salt-a')).not.toBe(h1);
  });

  it('verifyPassword accepts the right password and rejects the wrong one', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const hash = fp.hashPassword('hunter2', 'salt-a');
    expect(fp.verifyPassword('hunter2', 'salt-a', hash)).toBe(true);
    expect(fp.verifyPassword('nope', 'salt-a', hash)).toBe(false);
  });
});

describe('safeEquals', () => {
  it('is false on length mismatch and true on exact match', () => {
    const fp = loadAppsScriptAuth();
    expect(fp.safeEquals('abc', 'abcd')).toBe(false);
    expect(fp.safeEquals('abc', 'abc')).toBe(true);
    expect(fp.safeEquals('abc', 'abd')).toBe(false);
  });
});

describe('truthy', () => {
  it('treats true/1/yes (any case) as true, everything else false', () => {
    const fp = loadAppsScriptAuth();
    ['true', 'TRUE', '1', 'yes', 'Yes'].forEach((v) => expect(fp.truthy(v)).toBe(true));
    ['false', '0', '', 'no', null, undefined].forEach((v) => expect(fp.truthy(v)).toBe(false));
  });
});

describe('resolveEffectiveStudent', () => {
  it('forces a student session to its own name', () => {
    const fp = loadAppsScriptAuth();
    const session = { role: 'student', student_name: 'Maria' };
    expect(fp.resolveEffectiveStudent(session, 'Jorge')).toBe('Maria');
  });

  it('honors the requested student for a teacher session', () => {
    const fp = loadAppsScriptAuth();
    const session = { role: 'teacher', student_name: '' };
    expect(fp.resolveEffectiveStudent(session, 'Jorge')).toBe('Jorge');
  });

  it('honors the requested student when there is no session (grace)', () => {
    const fp = loadAppsScriptAuth();
    expect(fp.resolveEffectiveStudent(null, 'Jorge')).toBe('Jorge');
  });
});

describe('sessions', () => {
  function makeAccount(fp) {
    fp.POST_HANDLERS.create_account(
      { email: 'maria@x.com', student_name: 'Maria', password: 'pw123', role: 'student' },
      {}
    );
    return fp.findAccountByEmail('maria@x.com');
  }

  it('createSession then validateSession round-trips', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const account = makeAccount(fp);
    const session = fp.createSession(account);
    const back = fp.validateSession(session.token);
    expect(back).not.toBeNull();
    expect(back.student_name).toBe('Maria');
    expect(back.role).toBe('student');
  });

  it('validateSession returns null for an unknown token', () => {
    const fp = loadAppsScriptAuth();
    expect(fp.validateSession('does-not-exist')).toBeNull();
    expect(fp.validateSession('')).toBeNull();
  });

  it('validateSession returns null after revoke', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const session = fp.createSession(makeAccount(fp));
    fp.revokeSession(session.token);
    expect(fp.validateSession(session.token)).toBeNull();
  });

  it('serves from cache on the second lookup', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const session = fp.createSession(makeAccount(fp));
    expect(fp._cache.has('session_' + globalThis.hashSessionToken(session.token))).toBe(true); // N-6: keyed by the hash
    expect(fp.validateSession(session.token).student_name).toBe('Maria');
  });
});

describe('create_account + login handlers', () => {
  it('creates an account and logs in with the right password', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const created = fp.POST_HANDLERS.create_account(
      { email: 'Maria@X.com', student_name: 'Maria', password: 'pw123', role: 'student' },
      {}
    );
    expect(created._json.ok).toBe(true);

    const ok = fp.POST_HANDLERS.login({ email: 'maria@x.com', password: 'pw123' }, {});
    expect(ok._json.ok).toBe(true);
    expect(ok._json.role).toBe('student');
    expect(ok._json.student_name).toBe('Maria');
    expect(typeof ok._json.session).toBe('string');
  });

  it('rejects a wrong password with a generic message', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    fp.POST_HANDLERS.create_account(
      { email: 'maria@x.com', student_name: 'Maria', password: 'pw123', role: 'student' }, {});
    const bad = fp.POST_HANDLERS.login({ email: 'maria@x.com', password: 'WRONG' }, {});
    expect(bad._json.ok).toBe(false);
    expect(bad._json.error).toBe('Invalid email or password');
  });

  it('rejects duplicate email on create_account', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    fp.POST_HANDLERS.create_account(
      { email: 'maria@x.com', student_name: 'Maria', password: 'pw123', role: 'student' }, {});
    expect(() => fp.POST_HANDLERS.create_account(
      { email: 'maria@x.com', student_name: 'Maria2', password: 'pw9', role: 'student' }, {}
    )).toThrow(/already exists/);
  });

  it('rate-limits after 10 failed attempts per email', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    fp.POST_HANDLERS.create_account(
      { email: 'maria@x.com', student_name: 'Maria', password: 'pw123', role: 'student' }, {});
    for (let i = 0; i < 10; i++) fp.POST_HANDLERS.login({ email: 'maria@x.com', password: 'x' }, {});
    const limited = fp.POST_HANDLERS.login({ email: 'maria@x.com', password: 'pw123' }, {});
    expect(limited._json.ok).toBe(false);
    expect(limited._json.error).toMatch(/too many/i);
  });
});

describe('isCourseUnlocked', () => {
  it('is true when paid is truthy', () => {
    const fp = loadAppsScriptAuth();
    expect(fp.isCourseUnlocked({ paid: 'true', access_granted: '' })).toBe(true);
    expect(fp.isCourseUnlocked({ paid: true })).toBe(true);
    expect(fp.isCourseUnlocked({ paid: '1' })).toBe(true);
  });

  it('is true when access_granted is truthy (mixed case)', () => {
    const fp = loadAppsScriptAuth();
    expect(fp.isCourseUnlocked({ paid: '', access_granted: 'TRUE' })).toBe(true);
    expect(fp.isCourseUnlocked({ access_granted: 'Yes' })).toBe(true);
  });

  it('is false when both are falsey or the row is missing', () => {
    const fp = loadAppsScriptAuth();
    expect(fp.isCourseUnlocked({ paid: '', access_granted: 'false' })).toBe(false);
    expect(fp.isCourseUnlocked({ paid: 'no', access_granted: '0' })).toBe(false);
    expect(fp.isCourseUnlocked(null)).toBe(false);
    expect(fp.isCourseUnlocked({})).toBe(false);
  });
});

describe('enforceCourseAccess', () => {
  function grant(fp, name, fields) {
    fp.POST_HANDLERS.update_settings(Object.assign({ student_name: name }, fields), {});
  }

  it('throws Course locked for a student with no access', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    grant(fp, 'Maria', {}); // settings row exists but neither paid nor granted
    const session = { role: 'student', student_name: 'Maria' };
    expect(() => fp.enforceCourseAccess(session, 'Maria')).toThrow(/course locked/i);
  });

  it('passes a student the teacher granted access to', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    grant(fp, 'Maria', { access_granted: 'true' });
    const session = { role: 'student', student_name: 'Maria' };
    expect(() => fp.enforceCourseAccess(session, 'Maria')).not.toThrow();
  });

  it('passes a paid student', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    grant(fp, 'Maria', { paid: 'true' });
    expect(() => fp.enforceCourseAccess({ role: 'student', student_name: 'Maria' }, 'Maria')).not.toThrow();
  });

  it('never gates a teacher session', () => {
    const fp = loadAppsScriptAuth();
    expect(() => fp.enforceCourseAccess({ role: 'teacher', student_name: '' }, 'Maria')).not.toThrow();
  });

  it('never gates during the grace window (no session)', () => {
    const fp = loadAppsScriptAuth();
    expect(() => fp.enforceCourseAccess(null, 'Maria')).not.toThrow();
  });
});

describe('save_progress gating', () => {
  it('rejects a locked student session and accepts an unlocked one', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    fp.POST_HANDLERS.update_settings({ student_name: 'Maria' }, {}); // create locked row
    const session = { role: 'student', student_name: 'Maria' };
    const params = { student_name: 'Maria', day_number: '1', level: 'A1' };
    expect(() => fp.POST_HANDLERS.save_progress(params, {}, session)).toThrow(/course locked/i);

    fp.POST_HANDLERS.update_settings({ student_name: 'Maria', access_granted: 'true', cefr_level: 'A1' }, {});
    expect(() => fp.POST_HANDLERS.save_progress(params, {}, session)).not.toThrow();
  });
});

describe('validateTeacherToken', () => {
  it('grants access for a valid teacher session', () => {
    const fp = loadAppsScriptAuth({ APP_SECRET: 'app', AUTH_ENFORCED: 'true' });
    const session = fp.createSession({ email: 't@x.com', role: 'teacher', student_name: '' });
    expect(fp.validateTeacherToken({ token: 'app', session: session.token })).toBe(true);
  });

  it('denies a student session for teacher actions when enforced', () => {
    const fp = loadAppsScriptAuth({ APP_SECRET: 'app', AUTH_ENFORCED: 'true' });
    const session = fp.createSession({ email: 's@x.com', role: 'student', student_name: 'Sam' });
    expect(fp.validateTeacherToken({ token: 'app', session: session.token })).toBe(false);
  });

  it('falls back to the legacy TEACHER_SECRET during the grace window', () => {
    const fp = loadAppsScriptAuth({ APP_SECRET: 'app', TEACHER_SECRET: 'tsec' });
    expect(fp.validateTeacherToken({ token: 'app', teacher_token: 'tsec' })).toBe(true);
    expect(fp.validateTeacherToken({ token: 'app', teacher_token: 'wrong' })).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════
   Sprint 0 — SEC-1: auth fails CLOSED when a secret is missing
   ═══════════════════════════════════════════════════════════════ */

describe('SEC-1 — missing secrets fail closed', () => {
  it('validateToken denies every request when APP_SECRET is unset', () => {
    const fp = loadAppsScriptAuth({}); // no APP_SECRET configured
    expect(fp.validateToken({ token: 'anything' })).toBe(false);
    expect(fp.validateToken({})).toBe(false);
  });

  it('validateToken still accepts the correct token when APP_SECRET is set', () => {
    const fp = loadAppsScriptAuth({ APP_SECRET: 'app' });
    expect(fp.validateToken({ token: 'app' })).toBe(true);
    expect(fp.validateToken({ token: 'wrong' })).toBe(false);
  });

  it('validateTeacherToken denies grace-window access when TEACHER_SECRET is unset', () => {
    // The pre-fix behaviour returned true here, which — combined with the
    // publicly reachable legacy examiner page — let anyone write grades.
    // Deleting TEACHER_SECRET (runbook Stage I1) must CLOSE this path.
    const fp = loadAppsScriptAuth({ APP_SECRET: 'app' }); // grace mode, no TEACHER_SECRET
    expect(fp.authEnforced()).toBe(false);
    expect(fp.validateTeacherToken({ token: 'app' })).toBe(false);
    expect(fp.validateTeacherToken({ token: 'app', teacher_token: 'guess' })).toBe(false);
  });

  it('a valid teacher session still works with no TEACHER_SECRET set', () => {
    const fp = loadAppsScriptAuth({ APP_SECRET: 'app' });
    const session = fp.createSession({ email: 't@x.com', role: 'teacher', student_name: '' });
    expect(fp.validateTeacherToken({ token: 'app', session: session.token })).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════
   Sprint 0 — SEC-2: the paid AI proxy is rate limited
   ═══════════════════════════════════════════════════════════════ */

describe('SEC-2 — AI proxy rate limiting', () => {
  it('rateLimited allows up to max, then blocks', () => {
    const fp = loadAppsScriptAuth({});
    for (let i = 0; i < 3; i++) expect(fp.rateLimited('k', 3, 60)).toBe(false);
    expect(fp.rateLimited('k', 3, 60)).toBe(true);
  });

  it('counts each key separately', () => {
    const fp = loadAppsScriptAuth({});
    expect(fp.rateLimited('a', 1, 60)).toBe(false);
    expect(fp.rateLimited('a', 1, 60)).toBe(true);
    expect(fp.rateLimited('b', 1, 60)).toBe(false);
  });

  it('prefers the server-resolved session over the client-supplied name', () => {
    const fp = loadAppsScriptAuth({});
    const subject = fp.rateLimitSubject({ student_name: 'Maria' }, 'SomeoneElse');
    expect(subject).toBe('s:maria');
  });

  it('falls back to the requested name, then to a shared anon bucket', () => {
    const fp = loadAppsScriptAuth({});
    expect(fp.rateLimitSubject(null, 'Maria')).toBe('n:maria');
    expect(fp.rateLimitSubject(null, '')).toBe('anon');
  });

  it('enforceAiRateLimit throws once the hourly cap is reached', () => {
    const fp = loadAppsScriptAuth({});
    for (let i = 0; i < 2; i++) fp.enforceAiRateLimit('lesson', 's:maria', 2);
    expect(() => fp.enforceAiRateLimit('lesson', 's:maria', 2)).toThrow(/Rate limit exceeded/);
  });

  it('one student hitting the cap does not block another', () => {
    const fp = loadAppsScriptAuth({});
    fp.enforceAiRateLimit('lesson', 's:maria', 1);
    expect(() => fp.enforceAiRateLimit('lesson', 's:maria', 1)).toThrow();
    expect(() => fp.enforceAiRateLimit('lesson', 's:jose', 1)).not.toThrow();
  });

  it('generate_lesson refuses once the student is over the lesson cap', () => {
    const fp = loadAppsScriptAuth({ APP_SECRET: 'app' });
    fp.POST_HANDLERS.update_settings({ student_name: 'Maria', access_granted: 'true', cefr_level: 'A1' }, {});
    const params = { student: 'Maria', level: 'A1', day: '1', topic: 'greetings' };
    const session = { role: 'student', student_name: 'Maria' };
    // Burn the hourly allowance without invoking the (unmocked) AI provider.
    for (let i = 0; i < 10; i++) fp.enforceAiRateLimit('lesson', 's:maria', 10);
    expect(() => fp.GET_HANDLERS.generate_lesson(params, session)).toThrow(/Rate limit exceeded/);
  });

  it('the course-access check runs BEFORE the rate limit is spent', () => {
    // A locked student must not consume another student's... or their own...
    // hourly allowance on a request that was going to be refused anyway.
    const fp = loadAppsScriptAuth({ APP_SECRET: 'app' });
    const params = { student: 'Locked', level: 'A1', day: '1', topic: 'greetings' };
    const session = { role: 'student', student_name: 'Locked' };
    expect(() => fp.GET_HANDLERS.generate_lesson(params, session)).toThrow(/Course locked/);
    expect(fp.rateLimited('ai_rl_lesson_s:locked', 1, 60)).toBe(false); // budget untouched
  });
});

/* ═══════════════════════════════════════════════════════════════
   FluentPath — Shared Configuration
   ─────────────────────────────────────────────────────────────
   Single source of truth for endpoints, CEFR levels, and
   localStorage keys. Included by every HTML page.
   ═══════════════════════════════════════════════════════════════ */

var FP = window.FP || {};

// ── Environment ─────────────────────────────────────────────
// 'production' on the live hosts, 'development' everywhere else.
// In development mode a visual DEV banner is shown.
FP.ENV = (function () {
  if (typeof location === 'undefined') return 'development';
  var prodHosts = ['sgalindo88.github.io', 'fluentpath.ca', 'www.fluentpath.ca', 'teacher.fluentpath.ca'];
  return prodHosts.indexOf(location.hostname) >= 0 ? 'production' : 'development';
})();

// ── Site role / cross-site URLs ─────────────────────────────
// The student app and the teacher dashboard live on separate origins
// (fluentpath.ca vs teacher.fluentpath.ca). A page is the teacher site when
// its hostname starts with "teacher."; this also lets each side link to the
// other and lets the teacher login gate enforce role === 'teacher'.
FP.IS_TEACHER_SITE = (typeof location !== 'undefined') && location.hostname.indexOf('teacher.') === 0;
FP.STUDENT_URL = 'https://fluentpath.ca';
FP.TEACHER_URL = 'https://teacher.fluentpath.ca';

// ── Endpoints ────────────────────────────────────────────────
// Production webhook — always set here as the default.
// For local development, override FP.WEBHOOK_URL in config.local.js
// to point to a separate "FluentPath - Dev" Apps Script deployment.
FP.WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwsicAxs8wunL5Eg_G0wXYbE1JuN-aqWdP5Fv6Bry4jfWyWm58PfhYcH3Pat-g4P9fX/exec';
FP.FORMSPREE_ENDPOINT = 'https://formspree.io/f/mpqoorna';

// ── Auth Token ──────────────────────────────────────────────
// SEC-5: FP.APP_TOKEN IS INTENTIONALLY PUBLIC AND IS NOT AN AUTHORIZATION
// BOUNDARY. It is served to every browser from this file and is in git history.
// Treat it as a speed bump against drive-by traffic only.
//
// Real authorization is the per-user session issued at login and validated
// server-side on every request (see the SEC-5 audit table in apps-script.js,
// above TEACHER_ACTIONS: no mutating action authorizes on this token alone).
// Never add a backend action that trusts this token by itself.
//
// The old public TEACHER_TOKEN has been removed; teacher access is proven by a
// teacher session. For local dev against a different Apps Script deployment,
// override in config.local.js.
FP.APP_TOKEN = '04eaecb3a0ccb2dc91c6b0da61a8d875';

// ── CEFR Levels ──────────────────────────────────────────────
FP.LEVELS = {
  A1: { name: 'Beginner',            theme: 'Everyday Survival',    name_es: 'Principiante',        theme_es: 'Supervivencia diaria' },
  A2: { name: 'Elementary',          theme: 'Community & Life',     name_es: 'Elemental',           theme_es: 'Comunidad y vida' },
  B1: { name: 'Intermediate',        theme: 'The Workplace',        name_es: 'Intermedio',          theme_es: 'El trabajo' },
  B2: { name: 'Upper-Intermediate',  theme: 'Career & Society',     name_es: 'Intermedio alto',     theme_es: 'Carrera y sociedad' },
  C1: { name: 'Advanced',            theme: 'Professional Mastery', name_es: 'Avanzado',            theme_es: 'Dominio profesional' },
  C2: { name: 'Proficiency',         theme: 'Full Fluency',         name_es: 'Dominio',             theme_es: 'Fluidez total' },
};

// ── Course Constants ─────────────────────────────────────────
FP.COURSE_DAYS = 20;
FP.TEST_TOTAL_MARKS = 80;
FP.LESSON_DURATION_MIN = 90;

// ── localStorage Keys ────────────────────────────────────────
FP.KEYS = {
  STUDENT_NAME:     'fp_student_name',
  TEST_COMPLETED:   'fp_test_completed',
  TEST_DATE:        'fp_test_date',
  TEST_SCORE:       'fp_test_score',
  CEFR_LEVEL:       'fp_cefr_level',
  LAST_LESSON_DAY:  'fp_last_lesson_day',
  LAST_LESSON_DATE: 'fp_last_lesson_date',
  HUB_CACHE:        'fp_hub_cache',
  TEACHER_STATE:    'fluentpath_teacher',
  LESSON_MARKS:     'fp_lesson_marks',
  COURSE_ID:        'fp_course_id',
  // Session (set at login, read by api.js on every webhook call)
  SESSION:          'fp_session',
  SESSION_EXP:      'fp_session_exp',
  ROLE:             'fp_role',
};

// ── Session helpers ──────────────────────────────────────────
// The login response (POST ?action=login) returns a session token, role, the
// server-resolved student_name, and an expiry. We persist the token/role/exp
// here; api.js injects the token into every webhook call, and pages use
// getSession() to decide whether to show the app or the login screen.
FP.getSession = function () {
  try {
    var token = localStorage.getItem(FP.KEYS.SESSION);
    if (!token) return null;
    var exp = localStorage.getItem(FP.KEYS.SESSION_EXP);
    if (exp && new Date(exp).getTime() < Date.now()) { FP.clearSession(); return null; }
    return token;
  } catch (e) { return null; }
};

FP.clearSession = function () {
  try {
    localStorage.removeItem(FP.KEYS.SESSION);
    localStorage.removeItem(FP.KEYS.SESSION_EXP);
    localStorage.removeItem(FP.KEYS.ROLE);
  } catch (e) { /* ignore */ }
};

/**
 * DATA-1: wipe ALL per-student state from this device.
 *
 * Project rule: reset ALL student state unconditionally when switching students.
 * Clearing only the session and fp_student_name left the next student on a
 * shared/family/library device inheriting the previous student's CEFR level,
 * day counter, cached personalised lessons, achievements and unfinished
 * checkpoints — every `fp_*` key except those two.
 *
 * Collects keys first, then removes, because removing inside an index-based
 * localStorage loop reindexes it and silently skips entries.
 */
// Device preferences, not student data: they survive the purge. fp_lang is the
// landing page's EN/ES choice (index.html); wiping it on logout dropped a
// Spanish-speaking family back to English.
FP.PURGE_KEEP = ['fp_lang'];

FP.purgeStudentState = function () {
  try {
    var doomed = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('fp_') === 0 && FP.PURGE_KEEP.indexOf(k) === -1) doomed.push(k);
    }
    for (var j = 0; j < doomed.length; j++) localStorage.removeItem(doomed[j]);
  } catch (e) { /* storage unavailable — nothing to purge */ }
};

/** Redirect to the appropriate login screen (teacher dashboard vs student app). */
FP.redirectToLogin = function () {
  var inSrc = location.pathname.indexOf('/src/') >= 0;
  var root = inSrc ? '../' : './';
  location.href = root + (FP.IS_TEACHER_SITE ? 'teacher.html' : 'app.html');
};

// ── Load config.local.js (optional, gitignored) ─────────
// Only loads if the file exists. In production (GitHub Pages) the file
// is absent and this silently skips it — no 404 in the console.
(function () {
  if (FP.ENV === 'production') return; // skip in production — file won't exist
  var scripts = document.getElementsByTagName('script');
  var thisScript = scripts[scripts.length - 1];
  var basePath = thisScript.src.substring(0, thisScript.src.lastIndexOf('/') + 1);
  var s = document.createElement('script');
  s.src = basePath + 'config.local.js';
  s.onerror = function () { s.remove(); };
  thisScript.parentNode.insertBefore(s, thisScript.nextSibling);
})();

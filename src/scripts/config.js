/* ═══════════════════════════════════════════════════════════════
   FluentPath — Shared Configuration
   ─────────────────────────────────────────────────────────────
   Single source of truth for endpoints, CEFR levels, and
   localStorage keys. Included by every HTML page.
   ═══════════════════════════════════════════════════════════════ */

var FP = window.FP || {};

// ── Environment ─────────────────────────────────────────────
// 'production' on GitHub Pages, 'development' everywhere else.
// In development mode a visual DEV banner is shown.
FP.ENV = (typeof location !== 'undefined' && location.hostname === 'sgalindo88.github.io')
  ? 'production' : 'development';

// ── Endpoints ────────────────────────────────────────────────
// Production webhook — always set here as the default.
// For local development, override FP.WEBHOOK_URL in config.local.js
// to point to a separate "FluentPath - Dev" Apps Script deployment.
FP.WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwsicAxs8wunL5Eg_G0wXYbE1JuN-aqWdP5Fv6Bry4jfWyWm58PfhYcH3Pat-g4P9fX/exec';
FP.FORMSPREE_ENDPOINT = 'https://formspree.io/f/mpqoorna';

// ── Auth Tokens ─────────────────────────────────────────────
// These are placeholder values. Override them in config.local.js
// (gitignored) with the real secrets that match your Apps Script
// Script Properties (APP_SECRET and TEACHER_SECRET).
FP.APP_TOKEN = '';
FP.TEACHER_TOKEN = '';

// ── CEFR Levels ──────────────────────────────────────────────
FP.LEVELS = {
  A1: { name: 'Beginner',            theme: 'Everyday Survival',    colour: '#b8471e' },
  A2: { name: 'Elementary',           theme: 'Community & Life',     colour: '#c9933a' },
  B1: { name: 'Intermediate',         theme: 'The Workplace',        colour: '#2e6e45' },
  B2: { name: 'Upper-Intermediate',   theme: 'Career & Society',     colour: '#1e4d8c' },
  C1: { name: 'Advanced',             theme: 'Professional Mastery', colour: '#5b3e8a' },
  C2: { name: 'Proficiency',          theme: 'Full Fluency',         colour: '#1a1208' },
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
};

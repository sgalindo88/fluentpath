/* ═══════════════════════════════════════════════════════════════
   FluentPath — Shared Utilities
   ═══════════════════════════════════════════════════════════════ */

/** Escape a string for safe insertion into innerHTML.
 *  Covers &, <, >, double-quotes, and single-quotes so values
 *  are also safe inside quoted HTML attributes and onclick handlers. */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Date Formatting ─────────────────────────────────────────

/** Format a date string as "10 April 2026" (long) or "10 Apr" (short).
 *  @param {string} dateStr - ISO date or date-like string
 *  @param {string} [style='long'] - 'long' or 'short'
 */
function formatDate(dateStr, style) {
  if (!dateStr) return '';
  try {
    var str = String(dateStr);
    var d = new Date(str.length > 10 ? str : str + 'T00:00:00');
    if (isNaN(d.getTime())) return str;
    if (style === 'short') {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return String(dateStr); }
}

/** Format a lesson date as short: "10 Apr".
 *  Handles ISO timestamps and plain date strings. */
function formatLessonDate(raw) {
  return formatDate(raw, 'short');
}

// ── Time Formatting ─────────────────────────────────────────

/** Format a time_spent value (minutes) as "Xm". Filters out
 *  malformed clock strings like "8:53:11 a.m." */
function formatTimeSpent(val) {
  if (!val) return '';
  var n = parseInt(val, 10);
  if (isNaN(n) || String(val).includes(':')) return '';
  return n + 'm';
}

/** Format a duration in milliseconds as "Xm Ys". */
function formatDuration(ms) {
  var totalSec = Math.round(ms / 1000);
  var mins = Math.floor(totalSec / 60);
  var secs = totalSec % 60;
  return mins + 'm ' + secs + 's';
}

/** Format a play time in milliseconds as "Xs listened" or "Xm Ys listened". */
function formatPlayTime(ms) {
  var s = Math.round(ms / 1000);
  return s < 60 ? s + 's listened' : Math.floor(s / 60) + 'm ' + (s % 60) + 's listened';
}

/** Human-readable time-ago string (bilingual). */
function timeAgo(timestamp) {
  if (!timestamp) return '';
  var mins = Math.round((Date.now() - timestamp) / 60000);
  if (mins < 1) return 'just now / justo ahora';
  if (mins < 60) return mins + ' min ago / hace ' + mins + ' min';
  var hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h ago / hace ' + hrs + 'h';
  return 'over a day ago / hace más de un día';
}

// ── localStorage Cleanup ────────────────────────────────

/** Maximum age for cached entries (30 days in ms). */
var LS_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

/**
 * Clean up stale localStorage entries on app load.
 * - Removes lesson caches (fp_lesson_*) older than 30 days
 * - Removes hub cache if older than 30 days
 * - Warns in console if localStorage usage exceeds 4MB
 *
 * Call once on page load (e.g. from hub.js or api.js).
 */
function cleanupLocalStorage() {
  try {
    var now = Date.now();
    var keysToRemove = [];

    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;

      // Check timestamped entries (fp_lesson_*, fp_hub_cache)
      if (key.startsWith('fp_lesson_') || key === 'fp_hub_cache') {
        try {
          var raw = localStorage.getItem(key);
          var parsed = JSON.parse(raw);
          // Check _ts (timestamp we add) or _savedAt (checkpoint format)
          var ts = parsed && (parsed._ts || parsed._savedAt);
          if (ts && (now - ts) > LS_MAX_AGE) {
            keysToRemove.push(key);
          }
          // If no timestamp, add one for future cleanup
          if (parsed && !parsed._ts) {
            parsed._ts = now;
            localStorage.setItem(key, JSON.stringify(parsed));
          }
        } catch (e) {
          // Unparseable — remove it
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(function(k) {
      localStorage.removeItem(k);
    });

    if (keysToRemove.length > 0) {
      console.log('[FluentPath] Cleaned up ' + keysToRemove.length + ' stale localStorage entries.');
    }

    // Warn if approaching storage limit (~5MB for most browsers)
    var totalSize = 0;
    for (var j = 0; j < localStorage.length; j++) {
      var k = localStorage.key(j);
      if (k) totalSize += (localStorage.getItem(k) || '').length;
    }
    var sizeMB = (totalSize / (1024 * 1024)).toFixed(1);
    if (totalSize > 4 * 1024 * 1024) {
      console.warn('[FluentPath] localStorage usage is ' + sizeMB + 'MB — approaching the 5MB browser limit.');
    }
  } catch (e) { /* localStorage unavailable */ }
}


/** DATA-2: opaque id for one placement-test submission. Prefixed so Sheets
 *  can never coerce it to a number or date. crypto.randomUUID is missing on
 *  older iOS Safari, so fall back to getRandomValues, then Math.random. */
function newSubmissionId() {
  var hex;
  try {
    var c = window.crypto;
    if (c && c.randomUUID) {
      hex = c.randomUUID().replace(/-/g, '');
    } else if (c && c.getRandomValues) {
      var a = new Uint8Array(16);
      c.getRandomValues(a);
      hex = Array.prototype.map.call(a, function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
    }
  } catch (e) { hex = null; }
  if (!hex) {
    hex = '';
    for (var i = 0; i < 4; i++) hex += Math.floor(Math.random() * 0x100000000).toString(16);
  }
  return 'sub_' + Date.now().toString(36) + '_' + hex;
}

/** DATA-2: true only when the server's newest test row carries exactly our id. */
function submissionMatches(data, submissionId) {
  return !!(submissionId && data && data.found &&
    String(data.submission_id || '').trim() === String(submissionId));
}

/** N-12 / DATA-6: a get_progress reply confirms THIS lesson save only if one of
 *  its lesson rows carries exactly our submission_id (a day-number match would
 *  also pass for an older attempt of the same day). */
function lessonSaveConfirmed(progress, submissionId) {
  if (!submissionId || !progress || !Array.isArray(progress.lessons)) return false;
  return progress.lessons.some(function (l) {
    return String(l && l.submission_id || '').trim() === String(submissionId);
  });
}

/** N-14: today's date (or `d`) as YYYY-MM-DD in the device's LOCAL time zone.
 *  toISOString() is UTC, so a Toronto student after ~8 pm got tomorrow's date. */
function localDateString(d) {
  d = d || new Date();
  var m = d.getMonth() + 1, day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

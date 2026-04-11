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

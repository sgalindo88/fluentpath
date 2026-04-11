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

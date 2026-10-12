import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { loadUtils } from './helpers.js';

let u;
beforeAll(() => { u = loadUtils(); });

// ── escHtml ─────────────────────────────────────────────

describe('escHtml', () => {
  it('escapes &, <, >, double-quotes, single-quotes', () => {
    expect(u.escHtml('a & b < c > d "e" \'f\'')).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;'
    );
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(u.escHtml(null)).toBe('');
    expect(u.escHtml(undefined)).toBe('');
    expect(u.escHtml('')).toBe('');
    expect(u.escHtml(0)).toBe('');
  });

  it('converts numbers to string', () => {
    expect(u.escHtml(42)).toBe('42');
  });

  it('blocks XSS payloads', () => {
    expect(u.escHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;'
    );
    expect(u.escHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('handles onclick injection via single quotes', () => {
    const input = "');alert('xss');//";
    const result = u.escHtml(input);
    expect(result).not.toContain("'");
    expect(result).toContain('&#39;');
  });
});

// ── formatDate ──────────────────────────────────────────

describe('formatDate', () => {
  it('formats ISO date as long by default', () => {
    const result = u.formatDate('2026-04-10');
    expect(result).toMatch(/10/);
    expect(result).toMatch(/April/);
    expect(result).toMatch(/2026/);
  });

  it('formats ISO date as short', () => {
    const result = u.formatDate('2026-04-10', 'short');
    expect(result).toMatch(/10/);
    expect(result).toMatch(/Apr/);
    expect(result).not.toMatch(/2026/);
  });

  it('handles ISO timestamps', () => {
    const result = u.formatDate('2026-04-10T04:00:00.000Z', 'short');
    expect(result).toMatch(/Apr/);
  });

  it('returns empty for null/empty', () => {
    expect(u.formatDate(null)).toBe('');
    expect(u.formatDate('')).toBe('');
  });

  it('returns input for invalid dates', () => {
    expect(u.formatDate('not-a-date')).toBe('not-a-date');
  });
});

// ── formatLessonDate ────────────────────────────────────

describe('formatLessonDate', () => {
  it('returns short format', () => {
    expect(u.formatLessonDate('2026-04-10')).toMatch(/10.*Apr/);
  });

  it('returns empty for falsy', () => {
    expect(u.formatLessonDate(null)).toBe('');
  });
});

// ── formatTimeSpent ─────────────────────────────────────

describe('formatTimeSpent', () => {
  it('formats numeric minutes', () => {
    expect(u.formatTimeSpent(45)).toBe('45m');
    expect(u.formatTimeSpent('90')).toBe('90m');
  });

  it('returns empty for falsy', () => {
    expect(u.formatTimeSpent(null)).toBe('');
    expect(u.formatTimeSpent('')).toBe('');
    expect(u.formatTimeSpent(0)).toBe('');
  });

  it('filters clock strings', () => {
    expect(u.formatTimeSpent('8:53:11 a.m.')).toBe('');
    expect(u.formatTimeSpent('12:00')).toBe('');
  });
});

// ── formatDuration ──────────────────────────────────────

describe('formatDuration', () => {
  it('formats milliseconds as Xm Ys', () => {
    expect(u.formatDuration(90000)).toBe('1m 30s');
    expect(u.formatDuration(0)).toBe('0m 0s');
    expect(u.formatDuration(3661000)).toBe('61m 1s');
  });
});

// ── formatPlayTime ──────────────────────────────────────

describe('formatPlayTime', () => {
  it('shows seconds for < 60s', () => {
    expect(u.formatPlayTime(30000)).toBe('30s listened');
  });

  it('shows minutes + seconds for >= 60s', () => {
    expect(u.formatPlayTime(90000)).toBe('1m 30s listened');
  });
});

// ── timeAgo ─────────────────────────────────────────────

describe('timeAgo', () => {
  it('returns empty for falsy', () => {
    expect(u.timeAgo(null)).toBe('');
    expect(u.timeAgo(0)).toBe('');
  });

  it('returns "just now" for recent timestamps', () => {
    expect(u.timeAgo(Date.now())).toMatch(/just now/);
  });

  it('returns minutes for recent past', () => {
    expect(u.timeAgo(Date.now() - 5 * 60000)).toMatch(/5 min ago/);
  });

  it('returns hours for older timestamps', () => {
    expect(u.timeAgo(Date.now() - 3 * 3600000)).toMatch(/3h ago/);
  });

  it('returns "over a day" for very old timestamps', () => {
    expect(u.timeAgo(Date.now() - 25 * 3600000)).toMatch(/over a day/);
  });
});

// ── localDateString (N-14) ──────────────────────────────

describe('localDateString', () => {
  const origTZ = process.env.TZ;
  afterEach(() => {
    if (origTZ === undefined) delete process.env.TZ; else process.env.TZ = origTZ;
  });

  it('uses the local day in UTC-5 after 8 pm (the bug: UTC said tomorrow)', () => {
    process.env.TZ = 'America/Toronto'; // EDT = UTC-4 in September
    const d = new Date('2026-09-14T01:30:00Z'); // 9:30 pm on the 13th in Toronto
    expect(d.toISOString().split('T')[0]).toBe('2026-09-14'); // old behaviour
    expect(u.localDateString(d)).toBe('2026-09-13');
  });

  it('is correct in winter UTC-5 just before and after local midnight', () => {
    process.env.TZ = 'America/Toronto'; // EST = UTC-5
    expect(u.localDateString(new Date('2026-01-15T04:59:59Z'))).toBe('2026-01-14'); // 23:59:59 local
    expect(u.localDateString(new Date('2026-01-15T05:00:00Z'))).toBe('2026-01-15'); // 00:00:00 local
  });

  it('zero-pads month and day and handles year end', () => {
    process.env.TZ = 'America/Toronto';
    expect(u.localDateString(new Date('2026-03-05T17:00:00Z'))).toBe('2026-03-05');
    expect(u.localDateString(new Date('2027-01-01T04:30:00Z'))).toBe('2026-12-31');
  });

  it('defaults to now and matches YYYY-MM-DD', () => {
    expect(u.localDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

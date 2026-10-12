/**
 * FLOW-1 / DATA-3 / N-15 client side: the day and level shown to the student
 * come from the server reply; the hub counts days by max day, not rows.
 * student-lesson.js and hub.js touch the DOM at load, so lift out the pure
 * functions by name instead of executing the whole script.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function lift(file, name, env = {}) {
  const src = readFileSync(resolve(import.meta.dirname, '..', file), 'utf-8');
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found in ' + file);
  // brace-match the function body
  let i = src.indexOf('{', start), depth = 0, end = i;
  for (; end < src.length; end++) {
    if (src[end] === '{') depth++;
    else if (src[end] === '}' && --depth === 0) break;
  }
  const body = src.slice(start, end + 1);
  return new Function(...Object.keys(env), body + '\nreturn ' + name + ';')(...Object.values(env));
}

describe('resolveCourseState (student-lesson.js)', () => {
  const FP = { COURSE_DAYS: 20 };
  const resolveCourseState = lift('src/scripts/student-lesson.js', 'resolveCourseState', { FP });

  it('trusts the server level and next day over the cache', () => {
    expect(resolveCourseState({ cefr_level: 'B1', next_day: 4 }, 'A1', '9'))
      .toEqual({ level: 'B1', dayNumber: 4 });
  });

  it('a promotion (new level, day 1 of course 2) overrides stale local values', () => {
    expect(resolveCourseState({ cefr_level: 'B1', next_day: 1 }, 'A2', '20'))
      .toEqual({ level: 'B1', dayNumber: 1 });
  });

  it('falls back to the hub cache when the server could not be reached', () => {
    expect(resolveCourseState(null, 'A2', '5')).toEqual({ level: 'A2', dayNumber: 6 });
  });

  it('has no level when neither the server nor the cache knows one', () => {
    expect(resolveCourseState({ found: false }, null, null).level).toBe('');
  });

  it('never goes below day 1 or above the last day', () => {
    expect(resolveCourseState({ cefr_level: 'A1', next_day: 0 }, null, '0').dayNumber).toBe(1);
    expect(resolveCourseState({ cefr_level: 'A1', next_day: 99 }, null, null).dayNumber).toBe(20);
    expect(resolveCourseState(null, 'A1', '40').dayNumber).toBe(20);
  });
});

describe('daysCompleted (hub.js, N-15)', () => {
  const daysCompleted = lift('src/scripts/hub.js', 'daysCompleted');

  it('uses the highest saved day, not the number of rows', () => {
    expect(daysCompleted({ lessons_completed: 5, max_day: 3 })).toBe(3);
  });

  it('falls back to the row count for older cached progress', () => {
    expect(daysCompleted({ lessons_completed: 4 })).toBe(4);
    expect(daysCompleted(null)).toBe(0);
  });

  it('treats max_day 0 as zero days, not as missing', () => {
    expect(daysCompleted({ lessons_completed: 2, max_day: 0 })).toBe(0);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { loadAppsScriptFunctions } from './helpers.js';

let fn;
beforeAll(() => { fn = loadAppsScriptFunctions(); });

// ── recycleProbability ──────────────────────────────────

describe('recycleProbability', () => {
  it('returns 0 for 0-4 entries (seed phase)', () => {
    expect(fn.recycleProbability(0)).toBe(0);
    expect(fn.recycleProbability(1)).toBe(0);
    expect(fn.recycleProbability(4)).toBe(0);
  });

  it('returns 0.5 for 5-9 entries', () => {
    expect(fn.recycleProbability(5)).toBe(0.5);
    expect(fn.recycleProbability(7)).toBe(0.5);
    expect(fn.recycleProbability(9)).toBe(0.5);
  });

  it('returns 0.8 for 10+ entries', () => {
    expect(fn.recycleProbability(10)).toBe(0.8);
    expect(fn.recycleProbability(100)).toBe(0.8);
  });
});

// ── findLibraryMatch ────────────────────────────────────

describe('findLibraryMatch', () => {
  const defaultProfile = {
    vocabulary_density: 3, sentence_complexity: 3,
    speaking_duration: 3, writing_length: 3,
    listening_speed: 3, grammar_complexity: 3,
  };

  function makeEntry(profile, focusTags) {
    return {
      id: 'test',
      difficulty: { difficultyProfile: profile || { ...defaultProfile }, focusTags: focusTags || [] },
    };
  }

  it('returns strict match when all sliders within ±1', () => {
    const entries = [makeEntry({ ...defaultProfile, vocabulary_density: 4 })];
    const difficulty = { difficultyProfile: defaultProfile, focusTags: [] };
    expect(fn.findLibraryMatch(entries, difficulty)).toBe(entries[0]);
  });

  it('returns null when no match within ±1 or Manhattan ≤ 4', () => {
    // All sliders off by 3 → Manhattan = 18, way over 4
    const farProfile = {
      vocabulary_density: 1, sentence_complexity: 1,
      speaking_duration: 1, writing_length: 1,
      listening_speed: 1, grammar_complexity: 1,
    };
    const entries = [makeEntry(farProfile)];
    const difficulty = {
      difficultyProfile: {
        vocabulary_density: 5, sentence_complexity: 5,
        speaking_duration: 5, writing_length: 5,
        listening_speed: 5, grammar_complexity: 5,
      },
      focusTags: [],
    };
    expect(fn.findLibraryMatch(entries, difficulty)).toBeNull();
  });

  it('falls back to lenient match (Manhattan ≤ 4)', () => {
    // One slider off by 2, rest match → Manhattan = 2, within lenient
    const entries = [makeEntry({ ...defaultProfile, vocabulary_density: 5 })];
    // Strict fails (off by 2), lenient passes (dist = 2)
    const difficulty = { difficultyProfile: defaultProfile, focusTags: [] };
    expect(fn.findLibraryMatch(entries, difficulty)).toBe(entries[0]);
  });

  it('strict match requires focus tag overlap when incoming has tags', () => {
    const entries = [makeEntry(defaultProfile, ['Grammar'])];
    const difficulty = { difficultyProfile: defaultProfile, focusTags: ['Vocabulary'] };
    // Sliders match (strict), but tags don't overlap → falls to lenient
    // Lenient ignores tags, so it matches
    const result = fn.findLibraryMatch(entries, difficulty);
    expect(result).toBe(entries[0]); // matched via lenient
  });

  it('handles null/missing difficulty gracefully', () => {
    const entries = [makeEntry()];
    expect(fn.findLibraryMatch(entries, null)).toBe(entries[0]);
    expect(fn.findLibraryMatch(entries, {})).toBe(entries[0]);
    expect(fn.findLibraryMatch([], null)).toBeNull();
  });
});

// ── nearDuplicateExists ─────────────────────────────────

describe('nearDuplicateExists', () => {
  const defaultProfile = {
    vocabulary_density: 3, sentence_complexity: 3,
    speaking_duration: 3, writing_length: 3,
    listening_speed: 3, grammar_complexity: 3,
  };

  function makeEntry(profile) {
    return { difficulty: { difficultyProfile: profile || { ...defaultProfile } } };
  }

  it('returns true for exact duplicate', () => {
    const entries = [makeEntry()];
    expect(fn.nearDuplicateExists(entries, { difficultyProfile: defaultProfile })).toBe(true);
  });

  it('returns false when any slider differs', () => {
    const entries = [makeEntry({ ...defaultProfile, vocabulary_density: 4 })];
    expect(fn.nearDuplicateExists(entries, { difficultyProfile: defaultProfile })).toBe(false);
  });

  it('returns false for empty entries', () => {
    expect(fn.nearDuplicateExists([], { difficultyProfile: defaultProfile })).toBe(false);
  });

  it('handles null difficulty (defaults to 3)', () => {
    const entries = [makeEntry()]; // all 3s
    expect(fn.nearDuplicateExists(entries, null)).toBe(true); // null → all default 3
  });
});

// ── requireParam ────────────────────────────────────────

describe('requireParam', () => {
  it('returns trimmed value for valid param', () => {
    expect(fn.requireParam({ name: '  Alice  ' }, 'name')).toBe('Alice');
  });

  it('throws for missing param', () => {
    expect(() => fn.requireParam({}, 'name')).toThrow('Missing required parameter: name');
  });

  it('throws for blank param', () => {
    expect(() => fn.requireParam({ name: '   ' }, 'name')).toThrow('Missing required parameter: name');
  });

  it('throws for null param', () => {
    expect(() => fn.requireParam({ name: null }, 'name')).toThrow('Missing required parameter: name');
  });
});

// ── validateScore ───────────────────────────────────────

describe('validateScore', () => {
  it('returns number for valid score', () => {
    expect(fn.validateScore('15', 0, 25)).toBe(15);
    expect(fn.validateScore(0, 0, 100)).toBe(0);
  });

  it('throws for out of range', () => {
    expect(() => fn.validateScore(26, 0, 25)).toThrow('Score out of range');
    expect(() => fn.validateScore(-1, 0, 25)).toThrow('Score out of range');
  });

  it('throws for non-numeric', () => {
    expect(() => fn.validateScore('abc', 0, 25)).toThrow('Score out of range');
  });
});

// ── validateDate ────────────────────────────────────────

describe('validateDate', () => {
  it('returns trimmed string for valid date', () => {
    expect(fn.validateDate('2026-04-10')).toBe('2026-04-10');
  });

  it('returns empty for falsy', () => {
    expect(fn.validateDate('')).toBe('');
    expect(fn.validateDate(null)).toBe('');
  });

  it('throws for invalid date', () => {
    expect(() => fn.validateDate('not-a-date')).toThrow('Invalid date');
  });
});

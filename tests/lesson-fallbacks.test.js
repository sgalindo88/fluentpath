/**
 * The built-in beginner lessons (A1, A2) used when the generator is down and the library has nothing
 * for the level. They must be real lessons: same shape the generator is validated against, and a
 * Spanish line for every text a beginner reads (like a generated A1/A2 lesson).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadAppsScriptAuth } from './helpers.js';

function loadFallbacks() {
  globalThis.window = globalThis.window || globalThis;
  globalThis.FP = {};
  const code = readFileSync(resolve(import.meta.dirname, '../src/scripts/lesson-fallbacks.js'), 'utf-8');
  (0, eval)(code);
  return globalThis.FP.fallbackLessons;
}

const sets = loadFallbacks();
const fp = loadAppsScriptAuth({});

describe('beginner stand-by lessons', () => {
  it('there are at least two for A1 and two for A2, and none for other levels (they use the built-in ones)', () => {
    expect(sets.A1.length).toBeGreaterThanOrEqual(2);
    expect(sets.A2.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(sets).sort()).toEqual(['A1', 'A2']);
  });

  for (const level of ['A1', 'A2']) {
    sets[level].forEach((lesson, i) => {
      describe(`${level} lesson ${i + 1}: ${lesson.topic}`, () => {
        it('passes the same validation as a generated lesson', () => {
          expect(fp.isValidLesson(lesson)).toBe(true);
        });

        it('has a Spanish line for every text the student reads', () => {
          const need = (obj, keys, where) => keys.forEach((k) => { if (obj[k] !== undefined) expect(obj[k + '_es'], `${where}.${k}_es`).toBeTruthy(); });
          need(lesson, ['topic', 'objective'], 'lesson');
          for (const sec of ['warmup', 'vocabulary', 'listening', 'speaking', 'practice', 'writing', 'review']) need(lesson[sec], ['title', 'instruction', 'prompt'], sec);
          lesson.vocabulary.words.forEach((w) => need(w, ['definition', 'exampleSentence'], 'word ' + w.word));
          [...lesson.listening.questions, ...lesson.practice.questions].forEach((q) => need(q, ['question'], 'question ' + q.id));
          lesson.speaking.drills.forEach((d) => need(d, ['tip'], 'drill ' + d.id));
          need(lesson.speaking, ['conversationPrompt'], 'speaking');
          expect(lesson.review.keyTakeaways_es.length).toBe(lesson.review.keyTakeaways.length);
        });

        it('is sized for a beginner: short writing goal, 4 words, 2 listening and 3 practice questions', () => {
          expect(lesson.writing.minWords).toBeLessThanOrEqual(level === 'A1' ? 20 : 40);
          expect(lesson.vocabulary.words.length).toBe(4);
          expect(lesson.listening.questions.length).toBe(2);
          expect(lesson.practice.questions.length).toBe(3);
          expect(lesson.listening.audioText.split(/\s+/).length).toBeLessThanOrEqual(40);
        });
      });
    });
  }
});

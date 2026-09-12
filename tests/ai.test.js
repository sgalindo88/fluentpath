/**
 * AI-1g — coverage for the lesson-generation path.
 *
 * This was the single most important untested path in the codebase, and the
 * reason AI-1 went unnoticed: every failure mode here degrades to a fallback
 * lesson rather than an error, so nothing ever went red.
 *
 * The canned responses below are shaped from the real P0-1 probe run
 * (2026-09-11) against gemini-2.5-flash.
 */
import { describe, it, expect } from 'vitest';
import { loadAppsScriptAuth } from './helpers.js';

/** A structurally complete lesson, as the prompt asks for. */
const LESSON = {
  topic: 'Greetings & Introductions',
  objective: 'Greet people and introduce yourself.',
  warmup: { title: 'Warm up', instruction: 'Think', prompt: 'Who did you greet today?' },
  vocabulary: { title: 'Words', instruction: 'Use these', words: [{ word: 'hello', pronunciation: '/həˈloʊ/', partOfSpeech: 'interjection', definition: 'a greeting', exampleSentence: 'Hello!' }] },
  listening: { title: 'Listen', instruction: 'Listen', audioText: 'Good morning.', questions: [{ id: 'l1', question: 'Q', options: ['A', 'B', 'C', 'D'], correct: 0 }] },
  speaking: { title: 'Speak', instruction: 'Repeat', drills: [{ id: 's1', phrase: 'Nice to meet you', tip: 'stress MEET' }], conversationPrompt: 'Introduce yourself.' },
  practice: { title: 'Practice', instruction: 'Choose', questions: [{ id: 'p1', question: 'Q', options: ['A', 'B', 'C', 'D'], correct: 0 }] },
  writing: { title: 'Write', instruction: 'Write', prompt: 'Introduce yourself.', minWords: 20 },
  review: { title: 'Review', keyTakeaways: ['one', 'two', 'three'] },
};

const geminiOk = (text, finishReason = 'STOP') => () => ({
  getResponseCode: () => 200,
  getContentText: () => JSON.stringify({
    candidates: [{ finishReason, content: { parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 935, candidatesTokenCount: 2169, totalTokenCount: 3104 },
  }),
});

/** Capture the outgoing request so we can assert on what we actually send. */
function captureRequest(fp, respond) {
  const seen = {};
  fp._setFetch((url, opts) => {
    seen.url = url;
    seen.payload = JSON.parse(opts.payload);
    return respond();
  });
  return seen;
}

const generate = (fp, opts = {}) =>
  fp.GET_HANDLERS.generate_lesson(
    { level: 'A1', day: '1', topic: 'greetings & introductions', spanish: 'true', ...opts },
    null);

/* ═══════════════════════════════════════════════════════════════
   AI-1b/c/d — what we send
   ═══════════════════════════════════════════════════════════════ */

describe('AI-1 — request configuration', () => {
  it('sends a token budget large enough for a Spanish A1 lesson', () => {
    // The probe measured 2169 output tokens for exactly this lesson. 4096 was
    // not the problem on its own — 4096 MINUS dynamic thinking was.
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    const seen = captureRequest(fp, geminiOk(JSON.stringify(LESSON)));
    generate(fp);
    expect(seen.payload.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(8192);
  });

  it('pins the thinking budget so it cannot eat the output allowance', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    const seen = captureRequest(fp, geminiOk(JSON.stringify(LESSON)));
    generate(fp);
    expect(seen.payload.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('asks for raw JSON when the caller will parse the result', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    const seen = captureRequest(fp, geminiOk(JSON.stringify(LESSON)));
    generate(fp);
    expect(seen.payload.generationConfig.responseMimeType).toBe('application/json');
  });

  it('does NOT force JSON on ai_summary, which returns prose to the teacher', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    const teacher = fp.createSession({ email: 't@x.com', role: 'teacher', student_name: '' });
    const seen = captureRequest(fp, geminiOk('Maria made steady progress this week.'));
    const out = fp.POST_HANDLERS.ai_summary({ prompt: 'Summarise the week' }, null, teacher);
    expect(seen.payload.generationConfig.responseMimeType).toBeUndefined();
    expect(out._json.summary).toBe('Maria made steady progress this week.');
  });
});

/* ═══════════════════════════════════════════════════════════════
   AI-1e — failure modes are named, not swallowed
   ═══════════════════════════════════════════════════════════════ */

describe('AI-1e — finish reasons', () => {
  it('reports a truncated response as a token-limit problem, not a parse error', () => {
    // The exact failure the P0-1 probe reproduced: MAX_TOKENS, partial JSON,
    // and an error message that pointed at the parser instead of the budget.
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    fp._setFetch(geminiOk('{"topic":"Greetings","objective":"Greet peo', 'MAX_TOKENS'));
    const out = generate(fp);
    expect(out.error).toMatch(/output token limit/i);
    expect(out.error).not.toMatch(/Could not parse/);
  });

  it('names the budget knobs in the error so the fix is obvious', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    fp._setFetch(geminiOk('{"topic":', 'MAX_TOKENS'));
    expect(generate(fp).error).toMatch(/AI_MAX_TOKENS|AI_THINKING_BUDGET/);
  });

  it('distinguishes a safety refusal from a truncation', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    fp._setFetch(geminiOk('', 'SAFETY'));
    expect(generate(fp).error).toMatch(/refused/i);
  });

  it('passes a normal STOP response straight through', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    fp._setFetch(geminiOk(JSON.stringify(LESSON)));
    const out = generate(fp);
    expect(out.found).toBe(true);
    expect(out.lesson.topic).toBe('Greetings & Introductions');
  });

  it('catches truncation on anthropic too', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k', AI_PROVIDER: 'anthropic' });
    fp._setFetch(() => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"topic":' }],
      }),
    }));
    expect(generate(fp).error).toMatch(/output token limit/i);
  });

  it('catches truncation on openai too', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k', AI_PROVIDER: 'openai' });
    fp._setFetch(() => ({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({
        choices: [{ finish_reason: 'length', message: { content: '{"topic":' } }],
      }),
    }));
    expect(generate(fp).error).toMatch(/output token limit/i);
  });
});

/* ═══════════════════════════════════════════════════════════════
   AI-1f — a failure reaches the teacher
   ═══════════════════════════════════════════════════════════════ */

describe('AI-1f — failures are recorded', () => {
  const errorRows = (fp) => {
    const sheet = fp._ss.getSheetByName('Error Log');
    if (!sheet) return [];
    return sheet.getRange(1, 1, sheet.getLastRow(), 5).getValues().slice(1);
  };

  it('writes a truncated generation to the Error Log', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    fp._setFetch(geminiOk('{"topic":', 'MAX_TOKENS'));
    generate(fp, { student: 'Maria' });
    const rows = errorRows(fp).filter((r) => r[1] === 'generate_lesson');
    expect(rows.length).toBe(1);
    expect(rows[0][2]).toBe('Maria');
    expect(String(rows[0][3])).toMatch(/output token limit/i);
  });

  it('writes unparseable output to the Error Log with the tail that broke it', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    fp._setFetch(geminiOk('{"topic":"Greetings","objective":"Greet peo'));  // STOP, still invalid
    const out = generate(fp, { student: 'Maria' });
    expect(out.error).toMatch(/Could not parse/);
    const rows = errorRows(fp).filter((r) => r[1] === 'generate_lesson');
    expect(rows.length).toBe(1);
    expect(String(rows[0][4])).toMatch(/tail/);
  });

  it('records nothing when generation succeeds', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    fp._setFetch(geminiOk(JSON.stringify(LESSON)));
    generate(fp, { student: 'Maria' });
    expect(errorRows(fp).filter((r) => r[1] === 'generate_lesson').length).toBe(0);
  });
});

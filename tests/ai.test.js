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

/* ═══════════════════════════════════════════════════════════════
   BE-6 — provider hardening
   ═══════════════════════════════════════════════════════════════ */

const reply = (code, text) => ({ getResponseCode: () => code, getContentText: () => text });

describe('BE-6 — the HTTP status is read before the body is parsed', () => {
  it('a gateway error page names the status instead of "Unexpected token <"', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    fp._setFetch(() => reply(502, '<html><body><h1>Bad gateway</h1></body></html>'));
    const out = generate(fp);
    expect(out.error).toMatch(/HTTP 502/);
    expect(out.error).toMatch(/Bad gateway/);
    expect(out.error).not.toMatch(/Unexpected token/);
    expect(out.error_code).toBe('ai_unavailable');
  });

  it('a 200 that is not JSON is reported as such', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    fp._setFetch(() => reply(200, 'OK'));
    const out = generate(fp);
    expect(out.error).toMatch(/not JSON/);
    expect(out.error_code).toBe('ai_unavailable');
  });

  it('a provider error body keeps its own message and a rate limit gets its own code', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    fp._setFetch(() => reply(429, JSON.stringify({ error: { message: 'Quota exceeded' } })));
    const out = generate(fp);
    expect(out.error).toMatch(/Quota exceeded/);
    expect(out.error_code).toBe('ai_rate_limited');
  });
});

describe('BE-6 — one retry on a transient failure, none on a hopeless one', () => {
  it('retries a 503 once after a pause and serves the lesson', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    let calls = 0;
    fp._setFetch(() => (++calls === 1 ? reply(503, '{"error":{"message":"overloaded"}}') : geminiOk(JSON.stringify(LESSON))()));
    const out = generate(fp);
    expect(out.found).toBe(true);
    expect(calls).toBe(2);
    expect(fp._sleeps).toEqual([1500]);
  });

  it('retries a network failure once', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    let calls = 0;
    fp._setFetch(() => { if (++calls === 1) throw new Error('DNS error'); return geminiOk(JSON.stringify(LESSON))(); });
    expect(generate(fp).found).toBe(true);
    expect(calls).toBe(2);
  });

  it('gives up after the second failure and says so', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    let calls = 0;
    fp._setFetch(() => { calls++; return reply(503, '{"error":{"message":"overloaded"}}'); });
    const out = generate(fp);
    expect(calls).toBe(2);
    expect(out.error).toMatch(/overloaded/);
    expect(out.error_code).toBe('ai_unavailable');
  });

  it('never retries a 400 or 403 (a bad key stays a bad key)', () => {
    for (const code of [400, 401, 403]) {
      const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
      let calls = 0;
      fp._setFetch(() => { calls++; return reply(code, '{"error":{"message":"API key not valid"}}'); });
      expect(generate(fp).error).toMatch(/API key not valid/);
      expect(calls).toBe(1);
      expect(fp._sleeps).toEqual([]);
    }
  });

  it('a network failure twice is reported as unreachable', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    fp._setFetch(() => { throw new Error('connection reset'); });
    const out = generate(fp);
    expect(out.error).toMatch(/unreachable/);
    expect(out.error).toMatch(/connection reset/);
  });
});

describe('BE-6 — a multi-block Anthropic reply', () => {
  it('joins every text block and ignores the others', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k', AI_PROVIDER: 'anthropic' });
    const json = JSON.stringify(LESSON);
    fp._setFetch(() => reply(200, JSON.stringify({
      stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: 'let me plan' },
        { type: 'text', text: json.slice(0, 40) },
        { type: 'text', text: json.slice(40) },
      ],
    })));
    const out = generate(fp);
    expect(out.found).toBe(true);
    expect(out.lesson.topic).toBe('Greetings & Introductions');
  });
});

describe('BE-6 — finding the JSON object in a reply', () => {
  it('parses plain JSON and fenced JSON', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    expect(fp.extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(fp.extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('finds the object when the model added chatter before and after', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    expect(fp.extractJsonObject('Here is your lesson:\n{"a":{"b":[1,2]}}\nHope this helps!')).toEqual({ a: { b: [1, 2] } });
  });

  it('is not fooled by braces and escaped quotes inside strings', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    expect(fp.extractJsonObject('Sure! {"q":"Say \\"hi\\" {now}","n":2} done {x}')).toEqual({ q: 'Say "hi" {now}', n: 2 });
  });

  it('throws when there is no object or it is cut off', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    expect(() => fp.extractJsonObject('no json here')).toThrow(/no JSON object/);
    expect(() => fp.extractJsonObject('{"a":{"b":1}')).toThrow(/not closed/);
  });

  it('a lesson wrapped in chatter is now served (it used to fall back)', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    fp._setFetch(geminiOk('Here is the lesson plan you asked for:\n' + JSON.stringify(LESSON) + '\nLet me know if you want changes.'));
    const out = generate(fp);
    expect(out.found).toBe(true);
    expect(out.source).toBe('fresh');
  });
});

/* ═══════════════════════════════════════════════════════════════
   AI-1f part 2 — a library lesson for the same level instead of a level-agnostic built-in
   ═══════════════════════════════════════════════════════════════ */

describe('AI-1f part 2 — library fallback', () => {
  const seed = (fp, rows) => {
    const h = fp.HEADERS['Lesson Library'];
    let sh = fp._ss.getSheetByName('Lesson Library');
    if (!sh) { sh = fp._ss.insertSheet('Lesson Library'); sh.appendRow(h); }
    rows.forEach((r) => sh.appendRow(h.map((k) => ({ id: 'e' + Math.random(), is_active: 'true', times_served: 0, created_at: 'x', source_student: 'S', original_difficulty_json: '{}', ...r })[k] ?? '')));
    return sh;
  };
  const lessonWith = (topic) => JSON.stringify({ ...LESSON, topic });
  const down = (fp) => fp._setFetch(() => reply(503, '{"error":{"message":"overloaded"}}'));

  it('serves the library lesson for the same level with the nearest day, flagged as a fallback', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    seed(fp, [
      { level: 'A1', day: 3, lesson_json: lessonWith('Day three') },
      { level: 'A1', day: 9, lesson_json: lessonWith('Day nine') },
      { level: 'B1', day: 8, lesson_json: lessonWith('Wrong level') },
    ]);
    down(fp);
    const out = generate(fp, { day: '1' });
    expect(out).toMatchObject({ found: true, source: 'library-fallback', fallback: true, fallback_reason: 'ai_unavailable' });
    expect(out.lesson.topic).toBe('Day three'); // nearest to day 1 of the right level
    expect(out.fallback_day).toBe(3);
  });

  it('skips inactive and invalid entries, and prefers the less-served one on a tie', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    seed(fp, [
      { level: 'A1', day: 1, is_active: 'false', lesson_json: lessonWith('Inactive') },
      { level: 'A1', day: 1, lesson_json: '{"topic":"broken"}' },
      { level: 'A1', day: 2, times_served: 9, lesson_json: lessonWith('Popular') },
      { level: 'A1', day: 2, times_served: 1, lesson_json: lessonWith('Fresh one') },
    ]);
    down(fp);
    expect(generate(fp, { day: '1' }).lesson.topic).toBe('Fresh one');
  });

  it('works for truncated and unparseable replies too, and records the reason', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    seed(fp, [{ level: 'A1', day: 1, lesson_json: lessonWith('Stand-by') }]);
    fp._setFetch(geminiOk('{"topic":', 'MAX_TOKENS'));
    expect(generate(fp, { day: '1' })).toMatchObject({ fallback: true, fallback_reason: 'ai_truncated' });
    fp._setFetch(geminiOk('{"topic":"x","objective":"cut'));
    expect(generate(fp, { day: '1' })).toMatchObject({ fallback: true, fallback_reason: 'ai_invalid' });
  });

  it('never writes a fallback back to the library', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    const sh = seed(fp, [{ level: 'A1', day: 5, lesson_json: lessonWith('Stand-by') }]);
    down(fp);
    generate(fp, { day: '1' });
    expect(sh.getLastRow()).toBe(2);
  });

  it('with nothing in the library the page still gets the error and its code (it shows its built-in lesson)', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    down(fp);
    const out = generate(fp);
    expect(out.found).toBeUndefined();
    expect(out.error_code).toBe('ai_unavailable');
    expect(out.error).toMatch(/Lesson generation failed/);
  });

  it('a missing AI key is logged and still falls back', () => {
    const fp = loadAppsScriptAuth({});
    seed(fp, [{ level: 'A1', day: 1, lesson_json: lessonWith('Stand-by') }]);
    expect(generate(fp, { day: '1' })).toMatchObject({ found: true, fallback: true });
    expect(fp._ss.getSheetByName('Error Log').getLastRow()).toBeGreaterThan(1);
  });

  it('a fresh lesson is still preferred when the AI works', () => {
    const fp = loadAppsScriptAuth({ AI_API_KEY: 'k' });
    seed(fp, [{ level: 'A1', day: 1, lesson_json: lessonWith('Stand-by') }]);
    fp._setFetch(geminiOk(JSON.stringify(LESSON)));
    expect(generate(fp, { day: '1' })).toMatchObject({ source: 'fresh' });
  });
});

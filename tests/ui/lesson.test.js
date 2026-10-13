/**
 * Course landing and the 7-step lesson (student-course.html) after the Phase C restyle:
 * bilingual chrome (Spanish for A1/A2/B1, English only for B2+), icons not emoji, answer tiles
 * with word + icon verdicts, mic button states, in-page messages (no alert), the header call
 * control, and the full finish/save/verify flow against a stubbed backend.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { serve, launch, newPage, LEVEL_PROGRESS } from './harness.js';

let srv, browser, base;
beforeAll(async () => { srv = await serve(); base = srv.url; browser = await launch(); });
afterAll(async () => { await browser?.close(); srv?.server.close(); });

const EMOJI = /\p{Extended_Pictographic}/u;

const LESSON = {
  topic: 'At the Clinic', topic_es: 'En la clínica',
  objective: 'Book a visit.', objective_es: 'Reservar una cita.',
  warmup: { title: 'Think', title_es: 'Piensa', instruction: 'Answer in English.', instruction_es: 'Responde en inglés.', prompt: 'When did you last see a doctor?', prompt_es: '¿Cuándo viste a un médico?' },
  vocabulary: { title: 'Words', title_es: 'Palabras', instruction: 'Tap each word.', instruction_es: 'Toca cada palabra.', words: [
    { word: "o'clock", pronunciation: '/əˈklɒk/', partOfSpeech: 'adverb', definition: 'Used when telling the hour', definition_es: 'Se usa al decir la hora', exampleSentence: "It is two o'clock.", exampleSentence_es: 'Son las dos en punto.' },
    { word: 'refund', pronunciation: '/ˈriːfʌnd/', partOfSpeech: 'noun', definition: 'Money returned', exampleSentence: 'I want a refund.' },
  ] },
  listening: { title: 'Front desk', instruction: 'Listen, then answer.', audioText: 'Hello, this is the front desk.', questions: [
    { id: 'l1', question: 'Who is calling?', question_es: '¿Quién llama?', options: ['A doctor', 'The front desk', 'A customer'], correct: 1 },
    { id: 'l2', question: 'What is it about?', options: ['A refund', 'A visit', 'A bill'], correct: 1 },
  ] },
  speaking: { title: 'Phrases', instruction: 'Repeat clearly.', drills: [
    { id: 's1', phrase: "I'd like to make an appointment.", tip: 'Link the words.', tip_es: 'Une las palabras.' },
  ], conversationPrompt: 'Call a clinic and book a visit.' },
  practice: { title: 'Quick check', instruction: 'Choose the best answer.', questions: [
    { id: 'p1', question: 'Which word means money returned?', options: ['cash', 'refund', 'receipt'], correct: 1 },
  ] },
  writing: { title: 'Write', instruction: 'Write a message.', prompt: 'Write to your boss.', minWords: 5 },
  review: { title: 'Key points', keyTakeaways: ['You learned two words.', 'You practised a phone call.'] },
};

function makeHandlers(extra = {}, level = 'A2') {
  const saved = [];
  return {
    saved,
    handlers: {
      get_progress: () => {
        const lessons = saved.map((p) => ({ day: p.day_number, submission_id: p.submission_id, topic: p.topic }));
        return LEVEL_PROGRESS({ cefr_level: level, max_day: 2, next_day: 3, lessons });
      },
      get_settings: () => ({ found: true }),
      generate_lesson: () => ({ found: true, lesson: LESSON }),
      save_progress: (params) => { saved.push(params); return { result: 'success' }; },
      save_audio: () => ({ result: 'success', audio_json: '{"s1":"x"}' }),
      ...extra,
    },
  };
}

async function open({ level = 'A2', handlers, viewport } = {}) {
  const h = handlers || makeHandlers({}, level).handlers;
  const t = await newPage(browser, { handlers: h, viewport });
  await t.page.addInitScript((l) => localStorage.setItem('fp_cefr_level', l), level);
  t.dialogs = [];
  t.page.on('dialog', (d) => {
    if (d.type() === 'beforeunload') return d.accept(); // leaving a lesson in progress asks first
    t.dialogs.push(d.message()); d.dismiss();
  });
  await t.page.goto(base + '/src/student-course.html', { waitUntil: 'load' });
  await t.page.waitForFunction(() => !document.getElementById('btnBeginLesson').disabled);
  return t;
}
const begin = async (page) => { await page.click('#btnBeginLesson'); await page.waitForSelector('#activityWrap .activity-card'); };
const next = async (page) => { await page.click('#btnNext'); await page.waitForTimeout(150); };

describe('course landing', () => {
  it('is bilingual, shows the level tiles read-only, and has one primary button', async () => {
    const { page, ctx, errors } = await open();
    const text = await page.innerText('#screen-landing');
    for (const es of ['Tu camino hacia un mejor inglés', 'Tu nombre', 'Fecha de hoy', 'Comenzar la lección de hoy', 'Tu nivel: A2 · Elemental', 'Principiante']) expect(text).toContain(es);
    expect(await page.locator('#screen-landing .fp-btn--primary').count()).toBe(1);
    expect(await page.getAttribute('.level-card[data-level="A2"]', 'class')).toMatch(/is-selected/);
    expect(await page.getAttribute('.level-card[data-level="A2"]', 'aria-current')).toBe('true');
    expect(await page.getAttribute('.level-card[data-level="B1"]', 'aria-disabled')).toBe('true');
    expect(await page.getAttribute('.level-card[data-level="B1"]', 'class')).toMatch(/is-locked/);
    expect(await page.locator('.level-card.is-selected').count()).toBe(1);
    expect(EMOJI.test(await page.evaluate(() => document.body.innerText))).toBe(false);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('the video call request is a help card above Continue (not in the header) and nothing floats', async () => {
    const { page, ctx } = await open();
    await page.waitForSelector('#callSlot #fp-call-btn', { state: 'attached' });
    expect(await page.locator('.lesson-header #fp-call-btn').count()).toBe(0);
    expect(await page.locator('.lesson-help #fp-call-btn').count()).toBe(1);
    expect(await page.locator('.fp-fab').count()).toBe(0);
    await page.click('#btnBeginLesson');
    await page.waitForSelector('#activityWrap .activity-card');
    expect(await page.textContent('.lesson-help')).toContain('¿Necesitas ayuda?');
    expect(await page.isVisible('.lesson-help #fp-call-btn')).toBe(true);
    // the Continue button sits after the content, never over it
    const [pos, helpBottom, navTop] = await page.evaluate(() => [getComputedStyle(document.getElementById('lessonNav')).position, document.querySelector('.lesson-help').getBoundingClientRect().bottom, document.getElementById('lessonNav').getBoundingClientRect().top]);
    expect(pos).toBe('static');
    expect(navTop).toBeGreaterThanOrEqual(helpBottom);
    await ctx.close();
  });

  it('no i18n runtime is loaded: no tap-to-translate underlines or language switcher', async () => {
    const { page, ctx } = await open();
    expect(await page.evaluate(() => typeof I18n)).toBe('undefined');
    await ctx.close();
  });

  it('a student with no level cannot begin: a warning, in both languages', async () => {
    const { handlers } = makeHandlers({ get_progress: () => LEVEL_PROGRESS({ cefr_level: null, test_completed: false }) });
    const t = await newPage(browser, { handlers });
    await t.page.goto(base + '/src/student-course.html', { waitUntil: 'load' });
    await t.page.waitForFunction(() => /not set your level/i.test(document.getElementById('levelInstruction').textContent));
    expect(await t.page.textContent('#levelInstruction')).toContain('Tu profesor aún no ha asignado tu nivel');
    expect(await t.page.getAttribute('#levelInstruction', 'class')).toContain('fp-banner--warning');
    expect(await t.page.isDisabled('#btnBeginLesson')).toBe(true);
    await t.ctx.close();
  });
});

describe('who sees Spanish in the lesson', () => {
  for (const level of ['A1', 'A2', 'B1']) {
    it(`${level}: Spanish lines (static and from the lesson data) are shown`, async () => {
      const { page, ctx } = await open({ level });
      await begin(page);
      expect(await page.innerText('#screen-lesson')).toContain('Paso 1 de 7');
      expect(await page.innerText('#activityWrap')).toContain('En la clínica');
      expect(await page.innerText('#activityWrap')).toContain('Objetivo de hoy');
      await ctx.close();
    });
  }
  for (const level of ['B2', 'C1', 'C2']) {
    it(`${level}: English only, on every step`, async () => {
      const { page, ctx } = await open({ level });
      expect(await page.locator('.fp-bi__es:visible').count()).toBe(0);
      await begin(page);
      for (let i = 0; i < 7; i++) {
        expect(await page.locator('.fp-bi__es:visible').count(), 'step ' + (i + 1)).toBe(0);
        expect(await page.innerText('#screen-lesson')).not.toMatch(/Paso \d|Objetivo de hoy|En la clínica/);
        if (i < 6) await next(page);
      }
      await ctx.close();
    });
  }
});

describe('the steps', () => {
  it('the header shows a segmented bar and "Step N of 7", and Continue becomes Finish on the last step', async () => {
    const { page, ctx, errors } = await open();
    await begin(page);
    expect(await page.locator('#stepDots .fp-steps__seg').count()).toBe(7);
    expect(await page.locator('#stepDots .is-current').count()).toBe(1);
    expect(await page.textContent('#stepCountLabel')).toContain('Step 1 of 7');
    expect(await page.getAttribute('#stepDots', 'aria-valuenow')).toBe('1');
    expect(await page.textContent('#btnNext')).toContain('Continue');
    await next(page);
    expect(await page.locator('#stepDots .is-completed').count()).toBe(1);
    expect(await page.textContent('#stepCountLabel')).toContain('Step 2 of 7');
    for (let i = 0; i < 5; i++) await next(page);
    expect(await page.textContent('#stepCountLabel')).toContain('Step 7 of 7');
    expect(await page.textContent('#btnNext')).toContain('Finish lesson');
    expect(await page.textContent('#btnNext')).toContain('Terminar la lección');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('vocabulary: a word reveals its meaning (aria-expanded); a word with an apostrophe plays without breaking (N-19)', async () => {
    const { page, ctx, errors } = await open();
    await begin(page);
    await next(page);
    const first = page.locator('.vocab-item').first();
    expect(await first.locator('.vocab-toggle').getAttribute('aria-expanded')).toBe('false');
    expect(await first.locator('.vi-def').isVisible()).toBe(false);
    await first.locator('.vocab-toggle').click();
    expect(await first.locator('.vocab-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(await first.locator('.vi-def').isVisible()).toBe(true);
    expect(await first.locator('.vi-def').innerText()).toContain('Se usa al decir la hora');
    expect(await first.locator('.vocab-hear').getAttribute('data-word')).toBe("o'clock");
    await first.locator('.vocab-hear').click();
    await page.evaluate(() => { window.__spoken = []; window.speakEnglish = (t) => window.__spoken.push(t); });
    await first.locator('.vocab-hear').click();
    expect(await page.evaluate(() => window.__spoken)).toEqual(["o'clock"]);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('listening: answer tiles are a radiogroup; a right and a wrong answer say so in words and icons', async () => {
    const { page, ctx, errors, dialogs } = await open();
    await begin(page);
    await next(page); await next(page);
    const groups = page.locator('.mcq-options');
    expect(await groups.count()).toBe(2);
    expect(await groups.first().getAttribute('role')).toBe('radiogroup');
    expect(await groups.first().locator('[role="radio"]').count()).toBe(3);
    // arrow keys move between options
    await groups.first().locator('.mcq-opt').first().focus();
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.activeElement.querySelector('.opt-text').textContent)).toBe('The front desk');
    // right answer
    await groups.first().locator('.mcq-opt').nth(1).click();
    const right = groups.first().locator('.mcq-opt').nth(1);
    expect(await right.getAttribute('class')).toContain('is-correct');
    expect(await right.getAttribute('aria-checked')).toBe('true');
    expect(await right.textContent()).toContain('Correct');
    expect(await right.textContent()).toContain('Correcto');
    expect(await right.locator('svg.fp-icon').count()).toBeGreaterThan(0);
    expect(await page.textContent('#lf-l1')).toContain('¡Correcto!');
    // wrong answer: the chosen tile says Incorrect, the right one is revealed
    await page.locator('.mcq-options').nth(1).locator('.mcq-opt').nth(0).click();
    const wrong = page.locator('.mcq-options').nth(1).locator('.mcq-opt').nth(0);
    expect(await wrong.getAttribute('class')).toContain('is-wrong');
    expect(await wrong.textContent()).toContain('Incorrect');
    expect(await page.locator('.mcq-options').nth(1).locator('.is-correct').count()).toBe(1);
    expect(await page.textContent('#lf-l2')).toContain('The correct answer was B.');
    // a second click does nothing and nothing is counted twice
    await wrong.click();
    expect(await page.evaluate(() => [state.answers.listening_total, state.answers.listening_correct])).toEqual([2, 1]);
    expect(await page.evaluate(() => state.answers.listening_l1_is_right)).toBe(1);
    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('listening: play shows a stop control and the plays left; no emoji anywhere on the step', async () => {
    const { page, ctx } = await open();
    await begin(page);
    await next(page); await next(page);
    await page.evaluate(() => { window.speakEnglish = () => {}; });
    expect(await page.textContent('#listenPlays')).toContain('3 plays left');
    await page.click('#listenBtn');
    expect(await page.isVisible('#listenStopBtn')).toBe(true);
    expect(await page.textContent('#listenPlays')).toContain('2 plays left');
    expect(await page.textContent('#listenPlays')).toContain('Quedan 2 reproducciones');
    await page.click('#listenStopBtn');
    expect(await page.isVisible('#listenBtn')).toBe(true);
    expect(await page.textContent('#listenStatus')).toContain('Tap to listen again');
    expect(EMOJI.test(await page.evaluate(() => document.body.innerText))).toBe(false);
    await ctx.close();
  });

  it('speaking: record, stop, record again with the mic button states and a playback control; the recordings note is shown (N-24)', async () => {
    const { page, ctx, errors, dialogs } = await open();
    await begin(page);
    for (let i = 0; i < 3; i++) await next(page);
    expect(await page.textContent('.rec-note')).toContain('If you close or reload this page first, they are lost.');
    expect(await page.textContent('.rec-note')).toContain('se pierden');
    const btn = '#drill-btn-s1';
    expect(await page.getAttribute(btn, 'class')).toContain('fp-mic-btn');
    expect(await page.textContent('#drill-label-s1')).toMatch(/Record yourself/);
    await page.click(btn);
    await page.waitForSelector(btn + '.is-recording', { timeout: 15000 });
    expect(await page.getAttribute(btn, 'aria-pressed')).toBe('true');
    await page.waitForTimeout(700);
    await page.click(btn);
    await page.waitForSelector(btn + '.is-recorded');
    await page.waitForSelector('#drill-audio-s1 audio');
    expect(await page.textContent('#drill-label-s1')).toMatch(/Recorded\. Tap to record again/);
    // free speaking
    await page.click('#convBtn');
    await page.waitForSelector('#convBtn.is-recording', { timeout: 15000 });
    await page.waitForTimeout(700);
    await page.click('#convBtn');
    await page.waitForSelector('#convBtn.is-recorded');
    await page.waitForSelector('#conv-audio audio');
    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('speaking: no microphone support gives an in-page message, never an alert', async () => {
    const { page, ctx, dialogs } = await open();
    await begin(page);
    for (let i = 0; i < 3; i++) await next(page);
    await page.evaluate(() => { window.canRecordAudio = () => false; window.canTranscribe = () => false; });
    await page.evaluate(() => { document.getElementById('drill-btn-s1').disabled = false; });
    await page.click('#drill-btn-s1');
    expect(await page.textContent('#rec-msg-s1')).toContain('Recording is not available');
    expect(await page.textContent('#rec-msg-s1')).toContain('La grabación no está disponible');
    expect(await page.getAttribute('#rec-msg-s1', 'class')).toContain('is-error');
    expect(dialogs).toEqual([]);
    await ctx.close();
  });

  it('writing: the counter reaches its goal with an icon and words; skip disables the box and records [SKIPPED]', async () => {
    const { page, ctx } = await open();
    await begin(page);
    for (let i = 0; i < 5; i++) await next(page);
    expect(await page.textContent('#writing-wc')).toContain('0 words · aim for 5+');
    await page.fill('#writing-resp', 'one two three');
    expect(await page.textContent('#writing-wc')).toContain('3 words · aim for 5+');
    await page.fill('#writing-resp', 'one two three four five six');
    expect(await page.getAttribute('#writing-wc', 'class')).toContain('is-ok');
    expect(await page.locator('#writing-wc svg.fp-icon').count()).toBe(1);
    expect(await page.textContent('#writing-wc')).toContain('6 palabras. Meta alcanzada.');
    await page.check('#writing-skip');
    expect(await page.isDisabled('#writing-resp')).toBe(true);
    expect(await page.evaluate(() => state.answers.writing)).toBe('[SKIPPED]');
    await page.uncheck('#writing-skip');
    expect(await page.isDisabled('#writing-resp')).toBe(false);
    expect(await page.evaluate(() => state.answers.writing)).toBe('one two three four five six');
    await ctx.close();
  });

  it('review: the rating is four faces with words, a radiogroup; the value kept is a plain word', async () => {
    const { page, ctx } = await open();
    await begin(page);
    for (let i = 0; i < 6; i++) await next(page);
    const faces = page.locator('.conf-btn');
    expect(await faces.count()).toBe(4);
    expect(await page.getAttribute('.conf-group', 'role')).toBe('radiogroup');
    for (let i = 0; i < 4; i++) expect(await faces.nth(i).locator('svg.fp-icon').count()).toBe(1);
    expect((await page.locator('.conf-group').innerText()).replace(/\s+/g, ' ')).toMatch(/Hard.*Difícil.*OK.*Normal.*Good.*Bien.*Great.*Genial/);
    expect(EMOJI.test(await page.evaluate(() => document.body.innerText))).toBe(false);
    await faces.nth(2).click();
    expect(await faces.nth(2).getAttribute('aria-checked')).toBe('true');
    expect(await faces.nth(0).getAttribute('aria-checked')).toBe('false');
    expect(await faces.nth(2).getAttribute('class')).toContain('is-selected');
    await ctx.close();
  });
});

describe('offline lesson notice', () => {
  it('when the generator is down the built-in lesson shows a bilingual notice in the page flow, not floating over the step bar', async () => {
    const { handlers } = makeHandlers({ generate_lesson: () => ({ found: false }) });
    const { page, ctx } = await open({ handlers });
    await begin(page);
    const notice = page.locator('#lessonNotice .fp-banner--warning');
    expect(await notice.textContent()).toContain('Offline lesson');
    expect(await notice.textContent()).toContain('Lección sin conexión');
    expect(await notice.evaluate((el) => getComputedStyle(el).position)).toBe('static');
    const [head, note] = await page.evaluate(() => [document.querySelector('.lesson-head').getBoundingClientRect().bottom, document.querySelector('#lessonNotice').getBoundingClientRect().top]);
    expect(note).toBeGreaterThanOrEqual(head);
    await ctx.close();
  });
});

describe('when no personalised lesson comes back (AI-1f part 2, N-22)', () => {
  const topicOf = (page) => page.textContent('#activityWrap .ac-heading');

  it('an A1 student gets the A1 beginner lesson (with Spanish), not the level-agnostic one', async () => {
    const { handlers } = makeHandlers({ generate_lesson: () => ({ error: 'Lesson generation failed: overloaded', error_code: 'ai_unavailable' }) }, 'A1');
    const { page, ctx } = await open({ level: 'A1', handlers });
    await begin(page);
    expect(await topicOf(page)).toContain('Hello! My Name Is');
    expect(await topicOf(page)).toContain('¡Hola! Me llamo');
    expect(await page.textContent('#lessonNotice')).toContain('Offline lesson');
    await ctx.close();
  });

  it('an A2 student gets an A2 lesson and a B1 student the built-in one', async () => {
    for (const [level, expected] of [['A2', /Asking for Directions/], ['B1', /Making an Appointment|Shopping and Prices|At the Workplace|At the Doctor|Family and Neighbours/]]) {
      const { handlers } = makeHandlers({ generate_lesson: () => ({ found: false }) }, level);
      const { page, ctx } = await open({ level, handlers });
      await begin(page);
      expect(await topicOf(page)).toMatch(expected);
      await ctx.close();
    }
  });

  it('a stand-by lesson from the library is shown with its own notice and is NOT cached', async () => {
    const { handlers } = makeHandlers({ generate_lesson: () => ({ found: true, lesson: LESSON, source: 'library-fallback', fallback: true, fallback_reason: 'ai_unavailable' }) });
    const { page, ctx } = await open({ handlers });
    await begin(page);
    const note = await page.textContent('#lessonNotice');
    expect(note).toContain('practice lesson for your level');
    expect(note).toContain('lección de práctica para tu nivel');
    expect(await topicOf(page)).toContain('At the Clinic');
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('fp_lesson_')))).toEqual([]);
    await ctx.close();
  });

  it('a rate-limit reply says so (it is not "the generator is down")', async () => {
    const { handlers } = makeHandlers({ generate_lesson: () => ({ error: 'Rate limit exceeded: too many lesson requests', error_code: 'rate_limited' }) });
    const { page, ctx } = await open({ handlers });
    await begin(page);
    const note = await page.textContent('#lessonNotice');
    expect(note).toContain('asked for many lessons in the last hour');
    expect(note).toContain('Pediste muchas lecciones');
    expect(note).not.toContain('generator is unavailable');
    await ctx.close();
  });

  it('a normal fresh lesson is cached and shows no notice', async () => {
    const { page, ctx } = await open();
    await begin(page);
    expect(await page.locator('#lessonNotice .fp-banner').count()).toBe(0);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('fp_lesson_')).length)).toBe(1);
    await ctx.close();
  });
});

describe('pause', () => {
  it('pausing opens a dialog with focus on Resume; resuming closes it and returns focus', async () => {
    const { page, ctx } = await open();
    await begin(page);
    await page.click('#navPause');
    expect(await page.isVisible('#fp-pause-overlay')).toBe(true);
    expect(await page.evaluate(() => document.activeElement.id)).toBe('pauseResume');
    expect(await page.textContent('#pauseTitle')).toContain('En pausa');
    expect(await page.getAttribute('#navTimer', 'class')).toContain('paused');
    await page.click('#pauseResume');
    expect(await page.isVisible('#fp-pause-overlay')).toBe(false);
    expect(await page.evaluate(() => document.activeElement.id)).toBe('navPause');
    await ctx.close();
  });
});

describe('finishing', () => {
  async function goToEnd(page) {
    await begin(page);
    await page.fill('#warmup-resp', 'Last year.');
    for (let i = 0; i < 5; i++) await next(page);
    await page.fill('#writing-resp', 'Hello boss I will be late');
    await next(page);
    await page.locator('.conf-btn').nth(2).click();
    await next(page); // Finish
  }

  it('will not finish without a face rating (the note stays optional); picking a face clears the message', async () => {
    const { handlers, saved } = makeHandlers();
    const { page, ctx } = await open({ handlers });
    await begin(page);
    for (let i = 0; i < 6; i++) await next(page);
    await next(page); // Finish with no rating
    expect(await page.isVisible('#confError')).toBe(true);
    expect(await page.isVisible('#screen-complete')).toBe(false);
    expect(saved.length).toBe(0);
    await page.locator('.conf-btn').nth(1).click();
    expect(await page.isVisible('#confError')).toBe(false);
    await ctx.close();
  });

  it('saves with a plain-word rating, verifies, and says so in both languages; View progress appears', async () => {
    const { handlers, saved } = makeHandlers();
    const { page, ctx, errors, dialogs } = await open({ handlers });
    await goToEnd(page);
    await page.waitForFunction(() => !document.getElementById('btnViewProgress').classList.contains('fp-hidden'), null, { timeout: 15000 });
    expect(saved.length).toBe(1);
    expect(saved[0].confidence).toBe('Good');
    expect(saved[0].warmup_response).toBe('Last year.');
    expect(saved[0].writing_response).toBe('Hello boss I will be late');
    const status = await page.textContent('#saveStatus');
    expect(status).toContain('Your progress is saved.');
    expect(status).toContain('Tu progreso se guardó.');
    expect(await page.getAttribute('#saveStatus', 'class')).toContain('ok');
    expect(await page.textContent('#screen-complete')).toContain('¡Lección completada!');
    expect(await page.locator('#screen-complete svg.fp-icon').count()).toBeGreaterThan(2);
    expect(EMOJI.test(await page.evaluate(() => document.getElementById('screen-complete').innerText))).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('fp_last_lesson_day'))).toBe('3');
    expect(dialogs).toEqual([]);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('when the save cannot be confirmed it says so, keeps the checkpoint, and offers Try saving again', async () => {
    const { handlers } = makeHandlers({ get_progress: () => LEVEL_PROGRESS({ max_day: 2, next_day: 3, lessons: [] }) });
    const { page, ctx } = await open({ handlers });
    await begin(page);
    for (let i = 0; i < 6; i++) await next(page);
    await page.locator('.conf-btn').nth(2).click();
    await next(page);
    await page.waitForSelector('#retryLessonBtn', { timeout: 20000 });
    expect(await page.getAttribute('#saveStatus', 'class')).toContain('warn');
    expect(await page.textContent('#saveStatus')).toContain('No pudimos confirmar');
    expect(await page.textContent('#retryLessonBtn')).toContain('Intentar guardar de nuevo');
    expect(await page.evaluate(() => localStorage.getItem('fp_last_lesson_day'))).not.toBe('3');
    await ctx.close();
  });
});

describe('resuming an unfinished lesson', () => {
  it('puts typed answers back after a reload', async () => {
    const { page, ctx } = await open();
    await begin(page);
    await page.fill('#warmup-resp', 'I saw a doctor last week.');
    await page.evaluate(() => saveLessonCheckpoint());
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#ckptResume');
    await page.click('#ckptResume');
    await page.waitForSelector('#screen-lesson.active');
    expect(await page.inputValue('#warmup-resp')).toBe('I saw a doctor last week.');
    expect(await page.textContent('#stepCountLabel')).toContain('Step 1 of 7');
    await ctx.close();
  });
});

describe('resume dialog (checkpoint.js)', () => {
  async function withCheckpoint(level = 'A2') {
    const t = await open({ level });
    await begin(t.page);
    await t.page.evaluate(() => saveLessonCheckpoint());
    await t.page.reload({ waitUntil: 'load' });
    await t.page.waitForSelector('#ckptResume');
    return t;
  }

  it('is the shared modal: bilingual, icon not emoji, a saved time, one primary action, focus on Resume', async () => {
    const { page, ctx } = await withCheckpoint();
    expect(await page.getAttribute('.fp-ckpt', 'role')).toBe('alertdialog');
    expect(await page.locator('.fp-scrim.is-open .fp-ckpt').count()).toBe(1);
    const text = await page.innerText('.fp-ckpt');
    for (const t of ['Resume Your Lesson?', '¿Continuar tu Lección?', 'Continuar', 'Empezar de nuevo', 'Saved', 'Guardado']) expect(text).toContain(t);
    expect(EMOJI.test(text)).toBe(false);
    expect(await page.locator('.fp-ckpt svg.fp-icon').count()).toBe(1);
    expect(await page.locator('.fp-ckpt .fp-btn--primary').count()).toBe(1);
    expect(await page.evaluate(() => document.activeElement.id)).toBe('ckptResume');
    await ctx.close();
  });

  it('waits for a choice: no countdown, Escape does nothing, Tab stays inside', async () => {
    const { page, ctx } = await withCheckpoint();
    expect(await page.locator('.ckpt-countdown').count()).toBe(0);
    await page.keyboard.press('Escape');
    expect(await page.isVisible('#ckptResume')).toBe(true);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement.id)).toBe('ckptRestart');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement.id)).toBe('ckptResume');
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement.id)).toBe('ckptRestart');
    await ctx.close();
  });

  it('Start over asks first: the safe choice is primary and focused; keeping returns to the dialog; saved work survives until confirmed', async () => {
    const { page, ctx } = await withCheckpoint();
    await page.click('#ckptRestart');
    const text = await page.innerText('.fp-ckpt');
    for (const t of ['Start over?', '¿Empezar de nuevo?', 'cannot be undone', 'No se puede deshacer']) expect(text).toContain(t);
    expect(await page.evaluate(() => document.activeElement.id)).toBe('ckptKeep');
    expect(await page.locator('.fp-ckpt .fp-btn--primary').count()).toBe(1);
    expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('fp_ckpt_')))).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.isVisible('#ckptKeep')).toBe(true);
    await page.click('#ckptKeep');
    expect(await page.isVisible('#ckptResume')).toBe(true);
    expect(await page.evaluate(() => document.activeElement.id)).toBe('ckptResume');
    await page.click('#ckptResume');
    await page.waitForSelector('#screen-lesson.active');
    await ctx.close();
  });

  it('the source has no auto-resume timer', () => {
    const src = readFileSync(new URL('../../src/scripts/checkpoint.js', import.meta.url), 'utf-8');
    expect(src).not.toMatch(/AUTO_RESUME|setInterval|style="width/);
  });

  it('B2 sees English only; Start over clears the saved lesson', async () => {
    const { page, ctx } = await withCheckpoint('B2');
    expect(await page.locator('.fp-ckpt .fp-bi__es:visible').count()).toBe(0);
    await page.click('#ckptRestart');
    expect(await page.innerText('.fp-ckpt')).toContain('Start over?');
    expect(await page.locator('.fp-ckpt .fp-bi__es:visible').count()).toBe(0);
    await page.click('#ckptConfirm');
    await page.waitForSelector('.fp-ckpt', { state: 'detached' });
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('fp_ckpt_')))).toEqual([]);
    expect(await page.isVisible('#screen-landing.active')).toBe(true);
    await ctx.close();
  });
});

describe('fits a phone', () => {
  it('no horizontal scroll at 390px and every control is at least 44px on every step, in the longest (Spanish) state', async () => {
    const { page, ctx } = await open({ level: 'A1', viewport: { width: 390, height: 844 } });
    await begin(page);
    for (let i = 0; i < 7; i++) {
      if (i === 2) { await page.locator('.mcq-opt').first().click(); }
      if (i === 6) await page.locator('.conf-btn').first().click();
      const r = await page.evaluate(() => {
        const small = [...document.querySelectorAll('#screen-lesson button, #screen-lesson .skip-label, .lesson-header button, .lesson-header a')]
          .filter((b) => b.offsetParent !== null && !b.closest('.fp-hidden'))
          .map((b) => ({ n: (b.id || b.className || b.tagName), h: Math.round(b.getBoundingClientRect().height) }))
          .filter((x) => x.h < 44);
        return { overflow: document.documentElement.scrollWidth - window.innerWidth, small };
      });
      expect(r.overflow, 'overflow on step ' + (i + 1)).toBeLessThanOrEqual(0);
      expect(r.small, 'small targets on step ' + (i + 1)).toEqual([]);
      if (i < 6) await next(page);
    }
    await ctx.close();
  });
});

describe('N-23: the call request names the real day', () => {
  async function requestedDay(resumeFromDay) {
    const seen = [];
    const { handlers } = makeHandlers({ request_video_call: (params) => { seen.push(params); return { result: 'success' }; } });
    const { page, ctx } = await open({ handlers });
    await begin(page); // the control lives in the lesson's help card
    if (resumeFromDay) {
      await page.evaluate((d) => { state.dayNumber = d; saveLessonCheckpoint(); }, resumeFromDay);
      await page.reload({ waitUntil: 'load' });
      await page.waitForSelector('#ckptResume');
      await page.click('#ckptResume');
      await page.waitForSelector('#screen-lesson.active');
    }
    await page.click('#fp-call-btn');
    await page.waitForSelector('#fp-call-wrap.is-pending');
    await ctx.close();
    return String(seen[0].day_number);
  }

  it('sends the day the server chose (3), not the placeholder 1', async () => {
    expect(await requestedDay()).toBe('3');
  });

  it('after resuming a saved lesson it sends the resumed lesson\'s day, not the server\'s next day', async () => {
    expect(await requestedDay(7)).toBe('7');
  });
});

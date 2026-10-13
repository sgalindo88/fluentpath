/**
 * Placement test (student-initial-test.html) after the Phase C restyle: bilingual chrome,
 * icons not emoji, in-page messages (no alert), keyboard-friendly answer groups, and the
 * full submit flow against a stubbed backend.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve, launch, newPage } from './harness.js';

let srv, browser, base;
beforeAll(async () => { srv = await serve(); base = srv.url; browser = await launch(); });
afterAll(async () => { await browser?.close(); srv?.server.close(); });

const EMOJI = /\p{Extended_Pictographic}/u;
const open = async (opts = {}, level) => {
  const t = await newPage(browser, opts);
  if (level) await t.page.addInitScript((l) => localStorage.setItem('fp_cefr_level', l), level);
  t.dialogs = [];
  t.page.on('dialog', (d) => {
    if (d.type() === 'beforeunload') return d.accept(); // leaving a test in progress asks first
    t.dialogs.push(d.message()); d.dismiss();
  });
  await t.page.goto(base + '/src/student-initial-test.html', { waitUntil: 'load' });
  return t;
};
const start = (page) => page.evaluate(() => startTest());

describe('cover', () => {
  it('is bilingual, with the four parts as icon cards and one primary button', async () => {
    const { page, ctx } = await open();
    const text = await page.innerText('#screen-cover');
    for (const es of ['Prueba de nivel', 'Lectura', 'Escritura', 'Comprensión auditiva', 'Expresión oral', 'Comenzar la prueba', 'Tu nombre']) expect(text).toContain(es);
    expect(await page.locator('#screen-cover .overview-card svg.fp-icon').count()).toBe(4);
    expect(await page.locator('#screen-cover .fp-btn--primary').count()).toBe(1);
    expect(await page.getAttribute('#candidateName', 'placeholder')).toBe('Full name / Nombre completo');
    await ctx.close();
  });

  it('an empty name shows an in-page message (no alert), marks the field, and does not start', async () => {
    const { page, ctx, dialogs } = await open();
    await page.fill('#candidateName', '');
    await page.click('#btnStartTest');
    const err = page.locator('#screen-cover .fp-field-error');
    await err.waitFor();
    expect(await err.textContent()).toContain('Escribe tu nombre.');
    expect(await page.getAttribute('#candidateName', 'aria-invalid')).toBe('true');
    expect(await page.isVisible('#screen-cover.active')).toBe(true);
    await page.fill('#candidateName', 'Maria');
    await page.click('#btnStartTest');
    await page.waitForSelector('#screen-reading-intro.active');
    expect(await page.locator('#screen-cover .fp-field-error').count()).toBe(0);
    expect(dialogs).toEqual([]);
    await ctx.close();
  });
});

describe('video call request', () => {
  it('is a help card on the question screens (not in the header), hidden on the cover and results', async () => {
    const { page, ctx, errors } = await open();
    expect(await page.isVisible('#testHelp')).toBe(false);
    await start(page);
    await page.waitForSelector('#screen-reading-intro.active');
    await page.waitForSelector('#testHelp #fp-call-btn');
    expect(await page.isVisible('#testHelp')).toBe(true);
    expect(await page.textContent('#testHelp')).toContain('¿Necesitas ayuda?');
    expect(await page.locator('.test-header #fp-call-btn').count()).toBe(0);
    expect(await page.locator('.fp-fab').count()).toBe(0);
    await page.evaluate(() => showScreen('screen-results'));
    expect(await page.isVisible('#testHelp')).toBe(false);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('who sees Spanish', () => {
  it('an unplaced student sees both languages', async () => {
    const { page, ctx } = await open();
    expect(await page.locator('.fp-bi__es:visible').count()).toBeGreaterThan(10);
    await ctx.close();
  });
  it('B2 and up see English only, on every screen', async () => {
    const { page, ctx } = await open({}, 'B2');
    await start(page);
    for (const id of ['screen-cover', 'screen-reading-intro', 'screen-reading', 'screen-writing', 'screen-listening', 'screen-speaking', 'screen-results']) {
      await page.evaluate((x) => showScreen(x), id);
      expect(await page.locator('.fp-bi__es:visible, .fp-es:visible').count(), id).toBe(0);
    }
    expect(await page.getAttribute('#candidateName', 'placeholder')).toBe('Full name');
    await ctx.close();
  });
});

describe('section intros', () => {
  it('each part has an icon, a Spanish description, counts and a primary button', async () => {
    const { page, ctx } = await open();
    await start(page);
    const cases = [['reading', 'Leerás un texto corto'], ['writing', 'Completarás tareas'], ['listening', 'Toca reproducir'], ['speaking', 'Lee cada pregunta en voz alta']];
    for (const [part, es] of cases) {
      await page.evaluate((x) => showScreen(x), `screen-${part}-intro`);
      const intro = page.locator(`#screen-${part}-intro`);
      expect(await intro.locator('.si-icon svg.fp-icon').count(), part).toBe(1);
      expect(await intro.innerText(), part).toContain(es);
      expect(await intro.locator('.fp-btn--primary').count(), part).toBe(1);
    }
    await ctx.close();
  });
});

describe('multiple choice', () => {
  it('answer tiles form a radiogroup; arrow keys move between them; choosing locks the group', async () => {
    const { page, ctx } = await open();
    await start(page);
    await page.evaluate(() => showScreen('screen-reading'));
    const grid = page.locator('#q1-card .options-grid');
    expect(await grid.getAttribute('role')).toBe('radiogroup');
    expect(await grid.getAttribute('aria-labelledby')).toBeTruthy();
    const first = grid.locator('.option-btn').first();
    await first.focus();
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.activeElement.querySelector('.opt-letter').textContent)).toBe('B');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp'); // wraps to D
    expect(await page.evaluate(() => document.activeElement.querySelector('.opt-letter').textContent)).toBe('D');
    await page.evaluate(() => document.querySelector('#q1-card .option-btn').click()); // A (wrong)
    expect(await grid.locator('.option-btn[aria-checked="true"]').count()).toBe(1);
    expect(await grid.locator('.option-btn:not(:disabled)').count()).toBe(0);
    await ctx.close();
  });

  it('a wrong answer says so in words and icon, shows the right one, and explains in both languages', async () => {
    const { page, ctx } = await open();
    await start(page);
    await page.evaluate(() => showScreen('screen-reading'));
    await page.evaluate(() => document.querySelector('#q1-card .option-btn').click()); // A is wrong, B is right
    const card = page.locator('#q1-card');
    expect(await card.locator('.option-btn.wrong .fp-answer__verdict').textContent()).toContain('Not quite');
    expect(await card.locator('.option-btn.correct .fp-answer__verdict').textContent()).toContain('Correct');
    expect(await card.locator('.option-btn.wrong svg.fp-icon').count()).toBeGreaterThan(0);
    const fb = await card.locator('#q1-fb').textContent();
    expect(fb).toContain('The correct answer is B.');
    expect(fb).toContain('La respuesta correcta es B.');
    await ctx.close();
  });

  it('a right answer scores and confirms bilingually', async () => {
    const { page, ctx } = await open();
    await start(page);
    await page.evaluate(() => showScreen('screen-reading'));
    await page.evaluate(() => document.querySelectorAll('#q1-card .option-btn')[1].click());
    expect(await page.textContent('#q1-fb')).toContain('Correct! +2 marks');
    expect(await page.textContent('#q1-fb')).toContain('¡Correcto! +2 puntos');
    expect(await page.evaluate(() => state.answers.q1.correct)).toBe(true);
    await ctx.close();
  });

  it('Q19 is a group of toggle buttons that submits after two picks', async () => {
    const { page, ctx } = await open();
    await start(page);
    await page.evaluate(() => showScreen('screen-listening'));
    expect(await page.getAttribute('#q19-options', 'role')).toBe('group');
    await page.evaluate(() => toggleMulti('q19', 'B'));
    expect(await page.getAttribute('#q19-B', 'aria-pressed')).toBe('true');
    await page.evaluate(() => toggleMulti('q19', 'C'));
    expect(await page.textContent('#q19-fb')).toContain('Both answers found');
    expect(await page.evaluate(() => state.answers.q19.marks)).toBe(2);
    await ctx.close();
  });
});

describe('writing', () => {
  it('choosing a task marks it pressed and updates the placeholder', async () => {
    const { page, ctx } = await open();
    await start(page);
    await page.evaluate(() => showScreen('screen-writing'));
    await page.click('#taskA');
    expect(await page.getAttribute('#taskA', 'aria-pressed')).toBe('true');
    expect(await page.getAttribute('#taskB', 'aria-pressed')).toBe('false');
    expect(await page.getAttribute('#q14', 'placeholder')).toContain('informal email');
    expect(await page.getAttribute('#q14', 'placeholder')).toContain('correo informal');
    await ctx.close();
  });

  it('the word counter says it in words and icons: ok in range, over past 150', async () => {
    const { page, ctx } = await open();
    await start(page);
    await page.evaluate(() => showScreen('screen-writing'));
    await page.fill('#q14', Array(130).fill('word').join(' '));
    expect(await page.getAttribute('#wordCount', 'class')).toContain('is-ok');
    expect(await page.locator('#wordCount svg.fp-icon').count()).toBe(1);
    expect(await page.textContent('#wordCount')).toContain('130 words');
    expect(await page.textContent('#wordCount')).toContain('130 palabras');
    await page.fill('#q14', Array(170).fill('word').join(' '));
    expect(await page.getAttribute('#wordCount', 'class')).toContain('is-over');
    expect(await page.textContent('#wordCount')).toContain('aim for 120–150');
    await ctx.close();
  });

  it('skipping a question disables its field and records [SKIPPED]; unskipping restores it', async () => {
    const { page, ctx } = await open();
    await start(page);
    await page.evaluate(() => showScreen('screen-writing'));
    const skip = page.locator('#q11').locator('xpath=ancestor::div[contains(@class,"question-card")]').locator('.skip-label input');
    await skip.check();
    expect(await page.isDisabled('#q11')).toBe(true);
    expect(await page.evaluate(() => state.textAnswers.q11)).toBe('[SKIPPED]');
    await skip.uncheck();
    expect(await page.isDisabled('#q11')).toBe(false);
    await ctx.close();
  });
});

describe('listening audio', () => {
  it('play shows Playing… and a stop control; after three plays the button is disabled and says so', async () => {
    const { page, ctx } = await open();
    await start(page);
    await page.evaluate(() => showScreen('screen-listening'));
    for (let i = 0; i < 3; i++) {
      await page.click('#playBtn');
      expect(await page.textContent('#audioStatus')).toContain('Playing');
      expect(await page.isVisible('#stopBtn')).toBe(true);
      await page.click('#stopBtn');
    }
    expect(await page.isDisabled('#playBtn')).toBe(true);
    expect(await page.textContent('#audioPlaysLeft')).toContain('No plays left');
    expect(await page.textContent('#audioPlaysLeft')).toContain('Sin reproducciones');
    expect(await page.textContent('#audioStatus')).toContain('Ya no hay más reproducciones');
    await ctx.close();
  });
});

describe('results and submit', () => {
  it('a failed save shows an alert banner with a Retry button; a saved test shows success', async () => {
    const { page, ctx } = await open();
    await page.evaluate(() => showResultsScreen(false, bi('We could not confirm your results were saved.', 'No pudimos confirmar.'), false));
    expect(await page.getAttribute('#submissionBanner', 'role')).toBe('alert');
    expect(await page.locator('#submissionBanner #retrySubmitBtn').textContent()).toContain('Reintentar el envío');
    await page.evaluate(() => showResultsScreen(true, bi('Your results have been saved.', 'Tus resultados se guardaron.'), true));
    expect(await page.getAttribute('#submissionBanner', 'class')).toContain('fp-banner--success');
    expect(await page.locator('#cefrTitle').textContent()).toContain('Guía de niveles CEFR');
    expect(await page.locator('.cefr-table tbody tr').count()).toBe(6);
    await ctx.close();
  });

  it('end to end: answers and two recordings are sent, the row is verified, and the student is thanked in both languages', async () => {
    const seen = { order: [] };
    const handlers = {
      save_audio: (p, body) => { seen.audio = JSON.parse(body); seen.order.push('save_audio'); return { result: 'success', audio_json: JSON.stringify({ q21: 'fileid_q21_abcdef', q22: 'fileid_q22_abcdef' }) }; },
      submit_test: (p) => { seen.test = p; seen.order.push('submit_test'); return {}; },
      get_test_results: () => ({ found: true, submission_id: seen.test && seen.test.submission_id }),
    };
    const { page, ctx, errors, dialogs } = await open({ handlers });
    await start(page);
    await page.evaluate(() => { showScreen('screen-reading'); document.querySelectorAll('#q1-card .option-btn')[1].click(); showScreen('screen-speaking'); });
    for (const q of ['q21', 'q22']) {
      await page.click('#rec-btn-' + q);
      await page.waitForSelector(`#rec-btn-${q}.is-recording`, { timeout: 15000 });
      await page.waitForTimeout(700);
      await page.click('#rec-btn-' + q);
      await page.waitForSelector(`#rec-btn-${q}.is-recorded`);
    }
    await page.evaluate(() => finishTest());
    await page.waitForSelector('#screen-results.active', { timeout: 20000 });
    expect(seen.order).toEqual(['save_audio', 'submit_test']);
    expect(seen.test.speaking_audio_json).toContain('fileid_q21_abcdef');
    expect(seen.audio.day_number).toBe('test');
    const banner = await page.textContent('#submissionBanner');
    expect(banner).toContain('Your results have been saved');
    expect(banner).toContain('Tus resultados se guardaron');
    expect(errors).toEqual([]);
    expect(dialogs).toEqual([]);
    await ctx.close();
  });
});

describe('talking to the teacher', () => {
  it('the call button in the help card is full width on a phone and 44px tall, and does not float', async () => {
    const { page, ctx } = await open({ viewport: { width: 390, height: 844 } });
    await start(page);
    await page.waitForSelector('#testHelp #fp-call-btn');
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('fp-call-wrap')).position)).not.toBe('fixed');
    expect(await page.getAttribute('#fp-call-btn', 'aria-label')).toBe('Request a video call / Pedir una videollamada');
    expect(await page.isVisible('#fp-call-btn .fp-call__label')).toBe(true);
    const box = await page.locator('#fp-call-btn').boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await ctx.close();
  });
});

describe('call request feedback', () => {
  it('shows "Sending request" at once and three quick taps send one request and show one message', async () => {
    let calls = 0;
    const { page, ctx } = await open({
      handlers: { request_video_call: () => { calls++; return { result: 'success' }; } },
    });
    await start(page);
    await page.waitForSelector('#testHelp #fp-call-btn');
    await page.evaluate(() => {
      const b = document.getElementById('fp-call-btn');
      b.click(); b.click(); b.click();
    });
    expect(await page.textContent('#fp-call-btn')).toContain('Sending request');
    await page.waitForSelector('#fp-call-wrap.is-pending');
    expect(calls).toBe(1);
    expect(await page.locator('.fp-toast').count()).toBe(1);
    await ctx.close();
  });
});

describe('interrupted recording', () => {
  it('a recording running when the page is hidden is stopped with a message', async () => {
    const { page, ctx } = await open();
    await start(page);
    await page.evaluate(() => {
      speakingRecorders.q21 = { recording: true, recorder: null, recognition: null, chunks: [], transcript: '' };
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(await page.evaluate(() => speakingRecorders.q21.recording)).toBe(false);
    expect(await page.textContent('#rec-status-q21')).toContain('stopped because you left');
    await ctx.close();
  });
});

describe('resume dialog', () => {
  it('the placement test offers the same bilingual modal after a reload, and Resume puts the student back', async () => {
    const { page, ctx, errors } = await open();
    await page.fill('#candidateName', 'Maria');
    await start(page);
    await page.waitForSelector('#screen-reading-intro.active');
    await page.evaluate(() => saveTestCheckpoint());
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#ckptResume');
    expect(await page.innerText('.fp-ckpt')).toContain('¿Continuar tu Prueba?');
    expect(await page.innerText('.fp-ckpt')).not.toMatch(EMOJI);
    await page.click('#ckptResume');
    await page.waitForSelector('#screen-reading-intro.active');
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

describe('quality gates', () => {
  it('no emoji remain anywhere in the page (they are icons now)', async () => {
    const { page, ctx } = await open();
    await start(page);
    for (const id of ['screen-results', 'screen-speaking']) await page.evaluate((x) => showScreen(x), id);
    const text = await page.evaluate(() => document.body.textContent);
    expect(text).not.toMatch(EMOJI);
    await ctx.close();
  });

  it('fits a phone: no horizontal scroll on any screen at 390px', async () => {
    const { page, ctx } = await open({ viewport: { width: 390, height: 844 } });
    await start(page);
    for (const id of ['screen-cover', 'screen-reading-intro', 'screen-reading', 'screen-writing-intro', 'screen-writing', 'screen-listening-intro', 'screen-listening', 'screen-speaking-intro', 'screen-speaking', 'screen-results']) {
      await page.evaluate((x) => showScreen(x), id);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, id).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  });

  it('every control on every screen is at least 44px tall', async () => {
    const { page, ctx } = await open();
    await start(page);
    const small = [];
    for (const id of ['screen-cover', 'screen-reading', 'screen-writing', 'screen-listening', 'screen-speaking']) {
      await page.evaluate((x) => showScreen(x), id);
      const found = await page.evaluate(() => [...document.querySelectorAll('.screen.active button, .screen.active .skip-label, .screen.active input:not([type=checkbox]), .screen.active textarea')]
        .filter((e) => e.offsetParent !== null).map((e) => [e.id || e.className, Math.round(e.getBoundingClientRect().height)]).filter(([, h]) => h < 44));
      small.push(...found);
    }
    expect(small).toEqual([]);
    await ctx.close();
  });
});

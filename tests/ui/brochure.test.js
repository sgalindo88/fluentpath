/**
 * Public brochure (index.html) after the Phase C restyle: tokens/components, self-hosted fonts
 * (no Google Fonts), a primary call to action, the EN/ES toggle, and a phone layout.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve, launch, newPage } from './harness.js';

let srv, browser, base;
beforeAll(async () => { srv = await serve(); base = srv.url; browser = await launch(); });
afterAll(async () => { await browser?.close(); srv?.server.close(); });

const EMOJI = /\p{Extended_Pictographic}/u;
const open = async (viewport, lang) => {
  const t = await newPage(browser, { session: false, viewport });
  t.external = [];
  t.page.on('request', (r) => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:')) t.external.push(u); });
  await t.page.goto(base + '/' + (lang ? '?lang=' + lang : ''), { waitUntil: 'load' });
  return t;
};

describe('brochure', () => {
  it('has one primary call to action to the app, the three route stops and the price note; no emoji, no external fonts', async () => {
    const { page, ctx, errors, external } = await open({ width: 1024, height: 800 }, 'en');
    expect(await page.locator('.fp-btn--primary:visible').count()).toBe(1);
    expect(await page.textContent('.hero-cta')).toContain('Request a free account');
    expect(await page.getAttribute('.hero-login', 'href')).toBe('app.html');
    // it no longer promises the test straight away: you need an account first
    expect(await page.textContent('.cta-note')).toContain('You need an account');
    expect(await page.textContent('body')).not.toContain('No payment, no account fees');
    expect(await page.locator('.stop').count()).toBe(3);
    expect(await page.textContent('.pricing')).toContain('always free');
    expect(EMOJI.test(await page.innerText('body'))).toBe(false);
    expect(external.filter((u) => /fonts\.(googleapis|gstatic)/.test(u))).toEqual([]);
    expect(await page.evaluate(() => document.body.innerText)).not.toContain('Fluentora');
    expect(await page.textContent('.site-footer')).toContain('fluentpath.ca');
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('the language toggle switches every string to Spanish and back', async () => {
    const { page, ctx } = await open({ width: 1024, height: 800 }, 'en');
    await page.click('#langToggle');
    expect(await page.getAttribute('html', 'lang')).toBe('es');
    expect(await page.textContent('.tagline')).toContain('Inglés para tu vida');
    expect(await page.textContent('.hero-cta')).toContain('Solicita una cuenta gratis');
    expect(await page.textContent('#langToggle')).toBe('English');
    await page.click('#langToggle');
    expect(await page.getAttribute('html', 'lang')).toBe('en');
    await ctx.close();
  });

  it('fits a phone in Spanish: no horizontal scroll, 44px controls, the CTA is full width', async () => {
    const { page, ctx } = await open({ width: 390, height: 844 }, 'es');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const small = await page.evaluate(() => [...document.querySelectorAll('a.fp-btn')].map((a) => ({ n: a.textContent.trim(), h: Math.round(a.getBoundingClientRect().height) })).filter((x) => x.h < 44));
    expect(small).toEqual([]);
    const w = await page.locator('.hero-cta').evaluate((el) => Math.round(el.getBoundingClientRect().width));
    expect(w).toBeGreaterThan(340);
    await ctx.close();
  });
  it('Request a free account opens a form; it checks name and email, sends once with the language, and says what happens next', async () => {
    const calls = [];
    const t = await newPage(browser, { session: false, handlers: { request_account: (p) => { calls.push(p); return { ok: true }; } } });
    const { page, ctx, errors } = t;
    await page.goto(base + '/?lang=es', { waitUntil: 'load' });
    expect(await page.isVisible('#requestCard')).toBe(false);
    expect(await page.getAttribute('#requestBtn', 'aria-expanded')).toBe('false');
    await page.click('#requestBtn');
    expect(await page.isVisible('#requestCard')).toBe(true);
    expect(await page.getAttribute('#requestBtn', 'aria-expanded')).toBe('true');
    expect(await page.evaluate(() => document.activeElement.id)).toBe('reqName');
    await page.click('#reqSend');
    expect(await page.textContent('#reqMsg')).toContain('escribe tu nombre');
    await page.fill('#reqName', 'Ana Ruiz');
    await page.fill('#reqEmail', 'not-an-email');
    await page.click('#reqSend');
    expect(await page.textContent('#reqMsg')).toContain('correo electrónico válido');
    expect(calls.length).toBe(0);
    await page.fill('#reqEmail', 'ana@example.com');
    await page.fill('#reqNote', 'I cook at night');
    await page.click('#reqSend');
    await page.waitForFunction(() => document.getElementById('reqMsg').textContent.includes('Gracias'));
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ action: 'request_account', name: 'Ana Ruiz', email: 'ana@example.com', note: 'I cook at night', language: 'es', website: '' });
    expect(await page.inputValue('#reqName')).toBe('');
    expect(await page.isDisabled('#reqSend')).toBe(false);
    expect(errors).toEqual([]);
    await ctx.close();
  });

  it('shows a friendly message when the server refuses or is unreachable, and keeps what was typed', async () => {
    for (const [reply, text] of [[{ ok: false, error: 'Too many requests. Please try again later.' }, 'Too many requests'], [{ ok: false, error: 'Please enter a valid email address.' }, 'valid email']]) {
      const t = await newPage(browser, { session: false, handlers: { request_account: () => reply } });
      await t.page.goto(base + '/?lang=en', { waitUntil: 'load' });
      await t.page.click('#requestBtn');
      await t.page.fill('#reqName', 'Ana Ruiz');
      await t.page.fill('#reqEmail', 'ana@example.com');
      await t.page.click('#reqSend');
      await t.page.waitForFunction((x) => document.getElementById('reqMsg').textContent.includes(x), text);
      expect(await t.page.inputValue('#reqName')).toBe('Ana Ruiz');
      await t.ctx.close();
    }
  });

  it('the form fits a phone in Spanish with 44px controls', async () => {
    const t = await newPage(browser, { session: false, viewport: { width: 390, height: 844 } });
    await t.page.goto(base + '/?lang=es', { waitUntil: 'load' });
    await t.page.click('#requestBtn');
    expect(await t.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const small = await t.page.$$eval('#requestCard input:not(#reqWebsite), #requestCard button, .hero-login', (els) => els.filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.id || e.className));
    expect(small).toEqual([]);
    await t.ctx.close();
  });
});

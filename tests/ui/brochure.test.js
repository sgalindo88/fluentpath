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
    expect(await page.locator('.fp-btn--primary').count()).toBe(1);
    expect(await page.getAttribute('.hero-cta', 'href')).toBe('app.html');
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
    expect(await page.textContent('.hero-cta')).toContain('Haz la prueba de nivel gratis');
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
});

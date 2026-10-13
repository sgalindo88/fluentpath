/**
 * Guards for the design rules that are easy to break by editing one stylesheet.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const dir = resolve(import.meta.dirname, '..', 'src/styles');
const files = readdirSync(dir).filter((f) => f.endsWith('.css') && f !== 'tokens.css');
const rules = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' '), body: m[2] }));

describe('16px form controls (iOS Safari zooms below 16px, on iPad too)', () => {
  for (const f of files) {
    it(`${f}: no rule sets a form control smaller than 16px`, () => {
      const bad = rules(readFileSync(resolve(dir, f), 'utf-8'))
        .filter(({ sel }) => /(^|[\s,>+~])(input|textarea|select)\b|text-input-area|writing-area|\.fg\b|mark-notes/.test(sel))
        .filter(({ body }) => {
          const m = body.match(/font-size\s*:\s*([0-9.]+)px/);
          return m && Number(m[1]) < 16;
        })
        .map(({ sel }) => sel);
      // labels inside .fg / .speaking-input are not form controls
      expect(bad.filter((s) => !/label|\.multi-note/.test(s))).toEqual([]);
    });
  }

  it('mobile.css no longer forces 16px with !important (the base rule covers every width)', () => {
    expect(readFileSync(resolve(dir, 'mobile.css'), 'utf-8')).not.toMatch(/font-size:\s*16px\s*!important/);
  });
});

describe('typeface', () => {
  it('no stylesheet asks for the retired serif fonts or the Google Fonts CDN', () => {
    for (const f of files) {
      const css = readFileSync(resolve(dir, f), 'utf-8');
      expect(css, f).not.toMatch(/Playfair|Source Serif|fonts\.googleapis/);
    }
  });
  it('Light 300 is not used (the design drops it)', () => {
    for (const f of files) expect(readFileSync(resolve(dir, f), 'utf-8'), f).not.toMatch(/font-weight:\s*300\b/);
  });
});

/**
 * Icon helper (src/scripts/icons.js, generated from Material Symbols Rounded).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { execFileSync } from 'child_process';

let FP;
beforeAll(() => {
  const code = readFileSync(resolve(import.meta.dirname, '..', 'src/scripts/icons.js'), 'utf-8');
  FP = new Function('window', code + '\nreturn FP;')({}); // no `document`: hydration is skipped
});

describe('FP.icon', () => {
  it('has the 49 distinct icons of the design list (51 uses; edit and description are used twice) plus 5 extras', () => {
    expect(Object.keys(FP.ICONS).length).toBe(55); // + play_arrow, celebration, lock, replay, menu, arrow_back
    for (const n of ['play_arrow', 'celebration', 'lock', 'replay', 'menu']) expect(FP.ICONS[n], n).toBeTruthy();
    for (const n of ['mic', 'stop', 'check_small', 'close_small', 'arrow_right_alt', 'order_approve', 'keep', 'wand_stars', 'sentiment_very_satisfied'])
      expect(FP.ICONS[n], n).toBeTruthy();
  });

  it('returns an inline currentColor svg, decorative by default', () => {
    const svg = FP.icon('mic');
    expect(svg).toMatch(/^<svg class="fp-icon" viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="M/);
    expect(svg).not.toMatch(/fill="#|style=/); // colour comes from CSS currentColor
  });

  it('uses the filled glyph by default only where the spec says Fill 1, and honours an override', () => {
    expect(FP.icon('mic')).toContain(FP.ICONS.mic[1]);              // outline
    expect(FP.icon('stop')).toContain(FP.ICONS.stop[2]);            // spec: filled
    expect(FP.icon('mic', { fill: true })).toContain(FP.ICONS.mic[2]);
    expect(FP.icon('stop', { fill: false })).toContain(FP.ICONS.stop[1]);
    expect(FP.ICONS.mic[1]).not.toBe(FP.ICONS.mic[2]);
  });

  it('a label makes it a named image, escaped; size and class are applied', () => {
    const svg = FP.icon('pause', { label: 'Pause "lesson" <b>', size: 'sm', className: 'x' });
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Pause &quot;lesson&quot; &lt;b>"');
    expect(svg).not.toContain('aria-hidden');
    expect(svg).toContain('class="fp-icon fp-icon--sm x"');
  });

  it('an unknown name yields an empty string instead of throwing', () => {
    expect(FP.icon('does_not_exist')).toBe('');
  });
});

describe('generated file', () => {
  it('is current with scripts/build-icons.mjs', () => {
    expect(() => execFileSync('node', ['scripts/build-icons.mjs', '--check'], { cwd: resolve(import.meta.dirname, '..'), stdio: 'pipe' })).not.toThrow();
  });
});

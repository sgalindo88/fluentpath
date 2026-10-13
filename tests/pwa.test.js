/**
 * Brand and install assets (Phase B): theme colour, apple-touch-icon, manifest,
 * favicon, logos. Checks the student repo's pages; the same files are synced to
 * the teacher repo (sync:check guards that).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const root = (p) => resolve(import.meta.dirname, '..', p);
const read = (p) => readFileSync(root(p), 'utf-8');
const PAGES = [['index.html', ''], ['app.html', ''], ['src/student-course.html', '../'], ['src/student-initial-test.html', '../']];

describe('page heads', () => {
  for (const [page, pfx] of PAGES) {
    it(`${page} declares theme colour, touch icon, manifest and favicon`, () => {
      const html = read(page);
      expect(html).toContain('<meta name="theme-color" content="#1E2A38">');
      expect(html).toContain(`<link rel="apple-touch-icon" href="${pfx}apple-touch-icon.png">`);
      expect(html).toContain(`<link rel="manifest" href="${pfx}manifest.webmanifest">`);
      expect(html).toContain(`<link rel="icon" href="${pfx}favicon.svg" type="image/svg+xml">`);
      expect(html).toContain('<meta name="apple-mobile-web-app-title" content="FluentPath">');
    });
  }
});

describe('manifest', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  it('is installable: standalone, brand colours, 192 and 512 icons that exist', () => {
    expect(m.name).toBe('FluentPath');
    expect(m.display).toBe('standalone');
    expect(m.theme_color).toBe('#1E2A38');
    expect(m.background_color).toBe('#F7F5F0');
    const sizes = m.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const i of m.icons) expect(existsSync(root(i.src)), i.src).toBe(true);
    expect(existsSync(root(m.start_url))).toBe(true);
  });
});

describe('brand assets', () => {
  it('the favicon is the approved mark without the design file\'s 96px preview frame', () => {
    const svg = read('favicon.svg');
    expect(svg).toContain('viewBox="0 0 16 16"');
    expect(svg).not.toMatch(/width="96"|border:|style=/);
    expect(svg).toContain('#FF6F61'); // the coral dot is immutable
  });
  it('the three logos are present and carry no shadows or filters', () => {
    for (const f of ['logo-primary-horizontal', 'logo-stacked', 'logo-submark-f']) {
      const svg = read(`src/img/${f}.svg`);
      expect(svg).toContain('<svg');
      expect(svg).not.toMatch(/drop-shadow|<filter|box-shadow|text-shadow/);
    }
  });
  it('each logo has a cream variant for navy surfaces (the dot stays coral)', () => {
    for (const f of ['logo-primary-horizontal', 'logo-stacked', 'logo-submark-f']) {
      const dark = read(`src/img/${f}.svg`), light = read(`src/img/${f}-light.svg`);
      expect(dark).toContain('color: #1E2A38');
      expect(light).toContain('color: #F7F5F0');
      expect(light).toContain('#FF6F61');
      expect(light.replace('#F7F5F0', '#1E2A38')).toBe(dark); // the only difference is the ink colour
    }
  });
  it('the app icons are PNGs of the right size', () => {
    const dim = (f) => { const b = readFileSync(root(f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
    expect(dim('apple-touch-icon.png')).toEqual([180, 180]);
    expect(dim('icon-192x192.png')).toEqual([192, 192]);
    expect(dim('icon-512x512.png')).toEqual([512, 512]);
  });
});

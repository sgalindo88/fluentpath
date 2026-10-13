/**
 * Clean URLs: every link the app produces points at /app, /src/student-course, ... (no .html).
 * GitHub Pages serves both, so old addresses keep working; this guards the links we write.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const STUDENT = resolve(import.meta.dirname, '..');
const TEACHER = resolve(STUDENT, '..', 'fluentpath-teacher');
const read = (root, p) => readFileSync(resolve(root, p), 'utf-8');
const list = (root, dir, ext) => (existsSync(resolve(root, dir)) ? readdirSync(resolve(root, dir)).filter((f) => f.endsWith(ext)).map((f) => dir + '/' + f) : []);

// a link to one of our own pages with an extension
const OWN_PAGE = /(href\s*=\s*|location\.href\s*=\s*|location\.replace\()\s*['"]?[^'"\s>]*(app|index|teacher|student-course|student-initial-test|examiner-panel)\.html/;

describe('no code writes a .html link to its own pages', () => {
  const files = (root) => [
    ...['index.html', 'app.html'].filter((f) => existsSync(resolve(root, f))),
    ...list(root, 'src', '.html'),
    ...list(root, 'src/scripts', '.js').filter((f) => !f.endsWith('icons.js')),
  ];
  for (const [name, root] of [['student repo', STUDENT], ['teacher repo', TEACHER]]) {
    if (!existsSync(root)) continue;
    for (const f of files(root)) {
      it(`${name}: ${f}`, () => {
        const offenders = read(root, f).split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => OWN_PAGE.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
        expect(offenders.map(([n, l]) => n + ': ' + l.trim().slice(0, 90))).toEqual([]);
      });
    }
  }
});

describe('the backend writes clean links in emails and Stripe return URLs', () => {
  const code = read(STUDENT, 'apps-script.js');
  it('no emailed or redirect link ends in .html', () => {
    const lines = code.split('\n').filter((l) => /(Url\(\)|base)\s*\+\s*'\/[^']*\.html/.test(l) && !/^\s*\/\//.test(l));
    expect(lines.map((l) => l.trim().slice(0, 100))).toEqual([]);
  });
  it('the fallback base URLs are the real sites, not the old github.io address', () => {
    expect(code).not.toContain('sgalindo88.github.io');
    expect(code).toContain("|| 'https://fluentpath.ca'");
    expect(code).toContain("|| 'https://teacher.fluentpath.ca'");
  });
});

describe('the service workers cache the clean addresses too', () => {
  it('student shell has /app, /src/student-course and /src/student-initial-test', () => {
    const sw = read(STUDENT, 'sw.js');
    for (const p of ["'./app'", "'./src/student-course'", "'./src/student-initial-test'"]) expect(sw).toContain(p);
  });
  it('teacher shell has /src/examiner-panel', () => {
    if (!existsSync(TEACHER)) return;
    expect(read(TEACHER, 'sw.js')).toContain("'./src/examiner-panel'");
  });
});

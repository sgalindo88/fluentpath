/**
 * Browser smoke-test harness: serves the repo root on a random port and drives
 * the real pages in Chromium with a stubbed Apps Script backend (no network, no
 * Google). Run with `npm run test:ui`. Not part of `npm test` (needs a browser).
 *
 * Browser: $FP_CHROME if set, else Playwright's own chromium, else the newest
 * chromium in the local Playwright cache. CI installs it with
 * `npx playwright-core install chromium`.
 */
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const ROOT = path.resolve(import.meta.dirname, '..', '..');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

export function serve(root = ROOT) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

function findChrome() {
  if (process.env.FP_CHROME) return process.env.FP_CHROME;
  try { const p = chromium.executablePath(); if (p && fs.existsSync(p)) return p; } catch (e) { /* fall through */ }
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (fs.existsSync(cache)) {
    const dirs = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
      const exe = path.join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined; // let Playwright report the missing browser
}

export async function launch() {
  return chromium.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
}

export const LEVEL_PROGRESS = (over = {}) => ({
  found: true, test_completed: true, cefr_level: 'A2', total_score: 34, lessons_completed: 0,
  max_day: 0, next_day: 1, course_id: '1', course_unlocked: true, lessons: [], ...over,
});

/**
 * New context + page with the backend stubbed. `handlers` maps action → fn(params, body).
 * `session` seeds a logged-in student. Every request to script.google.com is recorded in `calls`.
 */
export async function newPage(browser, { handlers = {}, session = true, viewport = { width: 820, height: 1180 } } = {}) {
  const ctx = await browser.newContext({ viewport, permissions: ['microphone'], serviceWorkers: 'block' });
  const calls = [];
  await ctx.route(/script\.google\.com/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const params = Object.fromEntries(url.searchParams);
    const body = req.postData() || '';
    try { Object.assign(params, Object.fromEntries(new URLSearchParams(body))); } catch (e) { /* json body */ }
    calls.push({ action: params.action, params, body });
    const h = handlers[params.action];
    const out = h ? h(params, body) : { found: false };
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
  });
  await ctx.route(/formspree\.io/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); // keep tests offline-clean
  if (session) {
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('fp_session', 'stub');
        localStorage.setItem('fp_session_exp', '2099-01-01T00:00:00Z');
        localStorage.setItem('fp_role', 'student');
        localStorage.setItem('fp_student_name', 'Maria Lopez');
        localStorage.setItem('fp_achievements', '[]');
      } catch (e) { /* ignore */ }
    });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, calls, errors };
}

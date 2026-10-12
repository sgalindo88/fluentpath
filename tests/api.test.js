/**
 * api.js tests — N-1: save_audio must carry the student session.
 * api.js touches window/navigator at load, so stub just enough of them.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CODE = readFileSync(resolve(import.meta.dirname, '..', 'src/scripts/api.js'), 'utf-8');
const WEBHOOK = 'https://script.google.com/macros/s/ABC/exec';

function loadApi({ session = 'sess-123', token = 'tok-abc' } = {}) {
  const fp = {
    WEBHOOK_URL: WEBHOOK,
    APP_TOKEN: token,
    getSession: () => session,
  };
  globalThis.window = { FP: fp };
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  globalThis.document = { addEventListener() {} };
  (0, eval)(CODE + '\n;globalThis.__FP = FP;');
  return globalThis.__FP;
}

describe('FP.api.appendToken', () => {
  it('adds token and session to a webhook URL', () => {
    const FP = loadApi();
    const url = FP.api.appendToken(WEBHOOK + '?action=save_audio');
    expect(url).toContain('action=save_audio');
    expect(url).toContain('token=tok-abc');
    expect(url).toContain('session=sess-123');
  });

  it('leaves non-webhook URLs untouched', () => {
    const FP = loadApi();
    expect(FP.api.appendToken('https://formspree.io/f/x')).toBe('https://formspree.io/f/x');
  });
});

describe('FP.api.postText (save_audio upload)', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ result: 'success', audio_json: '{}' }) }));
    globalThis.fetch = fetchMock;
  });

  it('sends the session in the URL and the body untouched', async () => {
    const FP = loadApi();
    const body = JSON.stringify({ action: 'save_audio', recordings: { s1: { data: 'A'.repeat(50000), ext: 'mp4' } } });
    const json = await FP.api.postText(WEBHOOK + '?action=save_audio', body);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('action=save_audio');
    expect(url).toContain('session=sess-123');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('text/plain');
    expect(opts.body).toBe(body); // not truncated
    expect(json.result).toBe('success');
  });

  it('omits session when the student is logged out', async () => {
    const FP = loadApi({ session: null });
    await FP.api.postText(WEBHOOK + '?action=save_audio', '{}');
    expect(fetchMock.mock.calls[0][0]).not.toContain('session=');
  });

  it('rejects on an Unauthorized reply instead of reporting success', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ error: 'Unauthorized' }) }));
    const FP = loadApi();
    FP.clearSession = () => {};
    FP.redirectToLogin = () => {};
    await expect(FP.api.postText(WEBHOOK + '?action=save_audio', '{}')).rejects.toThrow('Unauthorized');
  });
});

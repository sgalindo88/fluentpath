/**
 * Service worker offline POST queue (N-3 / SW-3 / SW-2).
 *
 * sw.js is evaluated with stubs. The fake IndexedDB is STRICT: like the real
 * one, a transaction auto-commits once its requests drain, and using it after
 * that throws TransactionInactiveError. That is exactly what broke the old
 * replayQueue (store.delete after an async fetch), so these tests fail on it.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SW_PATH = process.env.SW_UNDER_TEST || resolve(import.meta.dirname, '..', 'sw.js');
const SW_CODE = readFileSync(SW_PATH, 'utf-8');
const URL_EXEC = 'https://script.google.com/macros/s/ABC/exec';

function makeFakeIndexedDB() {
  const rows = new Map();
  let nextId = 1;
  const tick = (fn) => setTimeout(fn, 0);

  function makeTx(mode) {
    const tx = { pending: 0, done: false, oncomplete: null, onerror: null };
    const run = (fn) => {
      if (tx.done) throw new Error('TransactionInactiveError');
      if (mode === 'readonly' && fn.writes) throw new Error('ReadOnlyError');
      const req = { result: undefined, onsuccess: null, onerror: null };
      tx.pending++;
      tick(() => {
        req.result = fn();
        if (req.onsuccess) req.onsuccess({ target: req });
        tx.pending--;
        if (tx.pending === 0) {
          tx.done = true;
          tick(() => tx.oncomplete && tx.oncomplete());
        }
      });
      return req;
    };
    const w = (fn) => { fn.writes = true; return fn; };
    tx.objectStore = () => ({
      add: (v) => run(w(() => { const id = nextId++; rows.set(id, { ...v, id }); })),
      getAll: () => run(() => [...rows.values()].map((r) => ({ ...r }))),
      delete: (id) => run(w(() => { rows.delete(id); })),
      put: (v) => run(w(() => { rows.set(v.id, { ...v }); })),
    });
    return tx;
  }

  const db = {
    objectStoreNames: { contains: () => true },
    transaction: (_store, mode) => makeTx(mode || 'readonly'),
  };
  return {
    open: () => {
      const req = {};
      tick(() => req.onsuccess && req.onsuccess({ target: { result: db } }));
      return req;
    },
    _rows: rows,
  };
}

function loadSw({ fetchImpl } = {}) {
  const idb = makeFakeIndexedDB();
  const fetchMock = vi.fn(fetchImpl || (async () => new Response('{}', { status: 200 })));
  const listeners = {};
  const self = {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), matchAll: async () => [] },
    location: { origin: 'https://fluentpath.ca' },
  };
  const api = new Function('self', 'indexedDB', 'fetch', 'caches', `${SW_CODE}
    return { handlePost, replayQueue, isQueueable, queuePost };`)(self, idb, fetchMock, { keys: async () => [], open: async () => ({ addAll: async () => {} }) });
  return { ...api, idb, fetchMock, self, listeners };
}

const post = (url, body, type = 'application/x-www-form-urlencoded') =>
  new Request(url, { method: 'POST', body, headers: { 'Content-Type': type } });
const offline = async () => { throw new TypeError('Failed to fetch'); };
const ok = (obj) => async () => new Response(JSON.stringify(obj), { status: 200 });

describe('isQueueable', () => {
  const { isQueueable } = loadSw();
  it('queues ordinary student saves', () => {
    expect(isQueueable(URL_EXEC, 'action=save_progress&student_name=M')).toBe(true);
    expect(isQueueable(URL_EXEC, 'candidate_name=M&reading_score=3')).toBe(true); // test submit (no action)
    expect(isQueueable(URL_EXEC + '?action=save_audio', '{"recordings":{}}')).toBe(true);
  });
  it('never queues auth actions (form, query string, or JSON body)', () => {
    for (const a of ['login', 'logout', 'request_reset', 'reset_password', 'create_account']) {
      expect(isQueueable(URL_EXEC, `action=${a}&email=x`)).toBe(false);
      expect(isQueueable(URL_EXEC + `?action=${a}`, '{}')).toBe(false);
      expect(isQueueable(URL_EXEC, `{"action":"${a}"}`)).toBe(false);
    }
  });
  it('never queues anything carrying a password', () => {
    expect(isQueueable(URL_EXEC, 'action=x&password=hunter2')).toBe(false);
    expect(isQueueable(URL_EXEC, 'new_password=abc&action=y')).toBe(false);
    expect(isQueueable(URL_EXEC, '{"password":"abc"}')).toBe(false);
  });
});

describe('handlePost', () => {
  it('queues a failed save and answers 202', async () => {
    const sw = loadSw({ fetchImpl: offline });
    const resp = await sw.handlePost(post(URL_EXEC, 'action=save_progress&student_name=M'));
    expect(resp.status).toBe(202);
    expect(sw.idb._rows.size).toBe(1);
  });

  it('does NOT queue a failed login: the page sees a network error, nothing stored', async () => {
    const sw = loadSw({ fetchImpl: offline });
    await expect(sw.handlePost(post(URL_EXEC, 'action=login&email=a@b.c&password=pw'))).rejects.toThrow('Failed to fetch');
    expect(sw.idb._rows.size).toBe(0);
  });

  it('passes a successful POST straight through', async () => {
    const sw = loadSw({ fetchImpl: ok({ result: 'success' }) });
    const resp = await sw.handlePost(post(URL_EXEC, 'action=save_progress'));
    expect(resp.status).toBe(200);
    expect(sw.idb._rows.size).toBe(0);
  });
});

describe('replayQueue', () => {
  async function seed(sw, n = 1) {
    for (let i = 0; i < n; i++) await sw.queuePost(URL_EXEC, `action=save_progress&n=${i}`, 'application/x-www-form-urlencoded');
  }

  it('drains the queue: each accepted item is deleted (the N-3 bug left them forever)', async () => {
    const sw = loadSw({ fetchImpl: ok({ result: 'success' }) });
    await seed(sw, 3);
    const r = await sw.replayQueue();
    expect(r).toEqual({ replayed: 3, dropped: 0 });
    expect(sw.idb._rows.size).toBe(0);
    // A second replay (the next `online` event) must not re-POST anything.
    sw.fetchMock.mockClear();
    await sw.replayQueue();
    expect(sw.fetchMock).not.toHaveBeenCalled();
  });

  it('keeps items while still offline or on a 5xx, and does not count them', async () => {
    const sw = loadSw({ fetchImpl: offline });
    await seed(sw, 2);
    expect(await sw.replayQueue()).toEqual({ replayed: 0, dropped: 0 });
    expect(sw.idb._rows.size).toBe(2);
    sw.fetchMock.mockImplementation(async () => new Response('x', { status: 503 }));
    expect(await sw.replayQueue()).toEqual({ replayed: 0, dropped: 0 });
    expect(sw.idb._rows.size).toBe(2);
  });

  it('does not treat {error:"Unauthorized"} as success: drops it (can never succeed)', async () => {
    const sw = loadSw({ fetchImpl: ok({ error: 'Unauthorized' }) });
    await seed(sw, 1);
    expect(await sw.replayQueue()).toEqual({ replayed: 0, dropped: 1 });
    expect(sw.idb._rows.size).toBe(0);
  });

  it('retries a server-side error up to 5 attempts, then drops it', async () => {
    const sw = loadSw({ fetchImpl: ok({ result: 'error', message: 'Could not obtain lock' }) });
    await seed(sw, 1);
    for (let i = 1; i < 5; i++) {
      expect(await sw.replayQueue()).toEqual({ replayed: 0, dropped: 0 });
      expect([...sw.idb._rows.values()][0].attempts).toBe(i);
    }
    expect(await sw.replayQueue()).toEqual({ replayed: 0, dropped: 1 });
    expect(sw.idb._rows.size).toBe(0);
  });

  it('only one replay runs at a time (overlapping online events)', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const sw = loadSw({ fetchImpl: async () => { await gate; return new Response('{}', { status: 200 }); } });
    await seed(sw, 2);
    const a = sw.replayQueue();
    const b = sw.replayQueue();
    expect(b).toBe(a);
    release();
    await a;
    expect(sw.fetchMock).toHaveBeenCalledTimes(2); // not 4
  });

  it('releases the lock after a failure so later replays can run', async () => {
    const sw = loadSw({ fetchImpl: ok({ result: 'success' }) });
    await seed(sw, 1);
    await sw.replayQueue();
    await seed(sw, 1);
    expect((await sw.replayQueue()).replayed).toBe(1);
  });
});

describe('SW-2: activation', () => {
  it('does not call clients.claim()', () => {
    const sw = loadSw();
    sw.listeners.activate({ waitUntil: () => {} });
    expect(sw.self.clients.claim).not.toHaveBeenCalled();
  });
});

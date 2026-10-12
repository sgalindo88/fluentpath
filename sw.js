/* ═══════════════════════════════════════════════════════════════
   FluentPath — Service Worker
   ─────────────────────────────────────────────────────────────
   Strategies:
     - App shell (HTML, CSS, JS): cache-first, update in background
     - API GET requests: stale-while-revalidate (serve cache, refresh)
     - API POST requests: try network, queue in IndexedDB on failure
     - Google Fonts: cache-first (long-lived)
   ═══════════════════════════════════════════════════════════════ */

var CACHE_VERSION = 'fp-v16'; // bumped: Sprint 0 — DATA-1 state purge, DATA-2 verified submit, SEC-5 token docs
// App shell paths are relative to the service worker's location (project root).
// This works on both GitHub Pages (/fluentpath/sw.js) and localhost (/sw.js).
// STUDENT-scoped: only the student site's files. The teacher dashboard lives in
// a separate repo (teacher.fluentpath.ca); its service worker is generated from
// this file by scripts/sync-shared.mjs. (Effective on next CACHE_VERSION bump.)
var APP_SHELL = [
  './',
  './index.html',
  './app.html',
  './favicon.svg',
  './src/student-initial-test.html',
  './src/student-course.html',
  './src/scripts/config.js',
  './src/scripts/api.js',
  './src/scripts/utils.js',
  './src/scripts/checkpoint.js',
  './src/scripts/hub.js',
  './src/scripts/student-test.js',
  './src/scripts/student-lesson.js',
  './src/scripts/call-request.js',
  './src/scripts/password-reset.js',
  './src/scripts/i18n.js',
  './src/styles/theme.css',
  './src/styles/mobile.css',
  './src/styles/hub.css',
  './src/styles/student-test.css',
  './src/styles/student-lesson.css',
];

var API_CACHE = 'fp-api-v5';
var POST_QUEUE_DB = 'fp-post-queue';
var POST_QUEUE_STORE = 'requests';

// ── INSTALL: pre-cache app shell ────────────────────────

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_SHELL).catch(function (err) {
        console.warn('[SW] Some app shell files failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE: clean old caches ──────────────────────────

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (k) { return k !== CACHE_VERSION && k !== API_CACHE; })
          .map(function (k) { return caches.delete(k); })
      );
    })
  );
  // SW-2: no clients.claim(). Claiming would hand an already-open page (e.g. a
  // student mid-lesson) to a new worker whose cache holds newer JS/CSS than the
  // HTML that page loaded. New workers take over pages on their next load.
});

// ── FETCH: routing by request type ──────────────────────

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  // Skip non-GET/non-POST, chrome-extension, etc.
  if (event.request.method !== 'GET' && event.request.method !== 'POST') return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // ── POST requests: try network, queue on failure ──
  if (event.request.method === 'POST') {
    event.respondWith(handlePost(event.request));
    return;
  }

  // ── Google Fonts: cache-first (they rarely change) ──
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(event.request, CACHE_VERSION));
    return;
  }

  // ── API requests (Apps Script) — pass through to network ──
  // Apps Script uses 302 redirects which can cause issues with SW caching.
  // Let all API calls go directly to the network without SW interception.
  if (url.hostname.includes('script.google.com')) {
    return; // don't call event.respondWith — browser handles it normally
  }

  // ── App shell (local files) ──
  if (url.origin === self.location.origin) {
    // HTML pages use network-first so users always get fresh content when online
    if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
      event.respondWith(networkFirst(event.request, CACHE_VERSION));
    } else {
      // CSS, JS, etc. use cache-first (they change less frequently)
      event.respondWith(cacheFirst(event.request, CACHE_VERSION));
    }
    return;
  }
});

// ── STRATEGIES ──────────────────────────────────────────

function networkFirst(request, cacheName) {
  return fetch(request).then(function (response) {
    if (response.ok) {
      var clone = response.clone();
      caches.open(cacheName).then(function (cache) { cache.put(request, clone); });
    }
    return response;
  }).catch(function () {
    // Network failed — try cache
    return caches.match(request).then(function (cached) {
      return cached || new Response('Offline — please reconnect and try again.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      });
    });
  });
}

function cacheFirst(request, cacheName) {
  return caches.match(request).then(function (cached) {
    if (cached) return cached;
    return fetch(request).then(function (response) {
      if (response.ok) {
        var clone = response.clone();
        caches.open(cacheName).then(function (cache) { cache.put(request, clone); });
      }
      return response;
    });
  }).catch(function () {
    // Offline and not in cache — return a basic fallback
    return new Response('Offline — please reconnect and try again.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  });
}

function staleWhileRevalidate(request) {
  return caches.open(API_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      var fetchPromise = fetch(request).then(function (response) {
        if (response.ok) {
          // Only cache successful API responses (skip error JSON like { error: "..." })
          var cacheClone = response.clone();
          var checkClone = response.clone();
          checkClone.text().then(function (text) {
            try {
              var body = JSON.parse(text);
              if (body.error) return; // don't cache error responses
            } catch (e) { /* not JSON — cache it */ }
            cache.put(request, cacheClone);
          }).catch(function () { cache.put(request, cacheClone); });
        }
        return response;
      }).catch(function () {
        // Network failed — return cached or error
        return cached || new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      // Return cached immediately if available, otherwise wait for network
      return cached || fetchPromise;
    });
  });
}

// ── POST QUEUE (IndexedDB) ──────────────────────────────

function openPostQueue() {
  return new Promise(function (resolve, reject) {
    var req = indexedDB.open(POST_QUEUE_DB, 1);
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(POST_QUEUE_STORE)) {
        db.createObjectStore(POST_QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = function (e) { resolve(e.target.result); };
    req.onerror = function (e) { reject(e.target.error); };
  });
}

function queuePost(url, body, contentType) {
  return openPostQueue().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(POST_QUEUE_STORE, 'readwrite');
      tx.objectStore(POST_QUEUE_STORE).add({
        url: url,
        body: body,
        contentType: contentType,
        timestamp: Date.now(),
      });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function (e) { reject(e.target.error); };
    });
  });
}

// N-3: requests that must NEVER be queued. They carry credentials, and a
// queued login would be replayed later (and the page was told "queued", which
// it reads as a generic failure while the password sat in IndexedDB).
// N-5: nor may teacher writes (grades, settings, level, attendance...). A queued
// grade would be replayed after the 12-hour teacher session has expired, and the
// teacher was told "saved offline" about the step that sets a student's level.
// Offline, the page must see a real network error and say so.
var NO_QUEUE_ACTIONS = [
  'login', 'logout', 'request_reset', 'reset_password', 'create_account',
  'save_marks', 'update_settings', 'save_attendance', 'delete_library_entry',
  'promote_student', 'send_call_link', 'ai_summary'
];
var MAX_REPLAY_ATTEMPTS = 5;

/** True if a failed POST may be queued for later. Pure; takes the URL and raw body. */
function isQueueable(url, body) {
  var text = String(body || '');
  var action = '';
  try { action = new URL(url).searchParams.get('action') || ''; } catch (e) { /* ignore */ }
  if (!action) {
    var m = /(?:^|&)action=([^&]*)/.exec(text);
    if (m) { try { action = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { action = m[1]; } }
  }
  if (!action) {
    var j = /"action"\s*:\s*"([^"]*)"/.exec(text);
    if (j) action = j[1];
  }
  if (NO_QUEUE_ACTIONS.indexOf(action.trim()) !== -1) return false;
  // Examiner Results (the placement-test grade) is identified by sheet_name, not action.
  if (/(?:^|&)sheet_name=Examiner(?:\+|%20)Results(?:&|$)/.test(text)) return false;
  // Belt and braces: never persist anything carrying a password field.
  if (/(?:^|&)(?:new_|old_)?password=/.test(text) || /"(?:new_|old_)?password"\s*:/.test(text)) return false;
  return true;
}

/** Read every queued item in ONE transaction, resolved only once it has data. */
function readQueue() {
  return openPostQueue().then(function (db) {
    return new Promise(function (resolve, reject) {
      var req = db.transaction(POST_QUEUE_STORE, 'readonly').objectStore(POST_QUEUE_STORE).getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function (e) { reject(e.target.error); };
    });
  });
}

/** Each write gets its OWN transaction: one opened before an async fetch has
 *  already auto-committed by the time the fetch returns (the N-3 bug). */
function writeQueue(mutate) {
  return openPostQueue().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(POST_QUEUE_STORE, 'readwrite');
      mutate(tx.objectStore(POST_QUEUE_STORE));
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function (e) { reject(e.target.error); };
    });
  });
}

/**
 * Decide what a replay response means.
 *   'done'  - the server accepted it: delete.
 *   'retry' - transient (5xx / 429 / 408): leave it, try again later.
 *   'drop'  - Unauthorized: this request can never succeed, delete.
 *   'fail'  - any other rejection ({error}/{result:'error'}/4xx): count an attempt.
 * Apps Script answers 200 even for errors, so the body must be read.
 */
function classifyReplay(resp) {
  if (!resp.ok) {
    var transient = resp.status >= 500 || resp.status === 429 || resp.status === 408;
    return Promise.resolve(transient ? 'retry' : 'fail');
  }
  return resp.text().then(function (text) {
    var body = null;
    try { body = JSON.parse(text); } catch (e) { return 'done'; }
    if (body && (body.error === 'Unauthorized' || body.message === 'Unauthorized')) return 'drop';
    if (body && (body.error || body.result === 'error')) return 'fail';
    return 'done';
  });
}

var replayInFlight = null;

/** Replay the queue. Only one replay runs at a time (overlapping `online`
 *  events used to re-POST every item concurrently). Resolves { replayed, dropped }. */
function replayQueue() {
  if (replayInFlight) return replayInFlight;
  replayInFlight = doReplay().then(function (r) {
    replayInFlight = null;
    return r;
  }, function (err) {
    replayInFlight = null;
    throw err;
  });
  return replayInFlight;
}

function doReplay() {
  var result = { replayed: 0, dropped: 0 };
  return readQueue().then(function (items) {
    var chain = Promise.resolve();
    items.forEach(function (item) {
      chain = chain.then(function () {
        return fetch(item.url, {
          method: 'POST',
          headers: { 'Content-Type': item.contentType },
          body: item.body,
        }).then(classifyReplay).then(function (outcome) {
          if (outcome === 'done') {
            result.replayed++;
            return writeQueue(function (store) { store.delete(item.id); });
          }
          if (outcome === 'drop') {
            result.dropped++;
            return writeQueue(function (store) { store.delete(item.id); });
          }
          if (outcome === 'fail') {
            var attempts = (item.attempts || 0) + 1;
            if (attempts >= MAX_REPLAY_ATTEMPTS) {
              result.dropped++;
              return writeQueue(function (store) { store.delete(item.id); });
            }
            item.attempts = attempts;
            return writeQueue(function (store) { store.put(item); });
          }
          // 'retry': leave it in the queue
        }).catch(function () {
          // Network error — still offline; leave in queue
        });
      });
    });
    return chain;
  }).then(function () { return result; });
}

function handlePost(request) {
  var clonedRequest = request.clone();
  return fetch(request).catch(function (err) {
    // Network failed — queue the POST for later, unless it must not be queued
    return clonedRequest.text().then(function (body) {
      if (!isQueueable(clonedRequest.url, body)) throw err; // page sees a real network error
      return queuePost(
        clonedRequest.url,
        body,
        clonedRequest.headers.get('Content-Type') || 'application/x-www-form-urlencoded'
      ).then(function () {
        return new Response(JSON.stringify({ result: 'queued', message: 'Saved offline — will sync when connection returns.' }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      });
    });
  });
}

// ── ONLINE EVENT: replay queued POSTs ───────────────────

self.addEventListener('message', function (event) {
  if (event.data === 'replay-queue') {
    replayQueue().then(function (r) {
      if (r.replayed > 0 || r.dropped > 0) {
        self.clients.matchAll().then(function (clients) {
          clients.forEach(function (client) {
            client.postMessage({ type: 'queue-replayed', count: r.replayed, dropped: r.dropped });
          });
        });
      }
    });
  }
});

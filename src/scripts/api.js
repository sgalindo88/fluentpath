/* ═══════════════════════════════════════════════════════════════
   FluentPath — Shared Fetch Wrapper
   ─────────────────────────────────────────────────────────────
   Consistent timeout, error handling, and encoding for all API
   calls. Included by every HTML page after config.js.
   ═══════════════════════════════════════════════════════════════ */

var FP = window.FP || {};

FP.api = (function () {
  var DEFAULT_TIMEOUT = 30000; // 30 seconds

  /**
   * Internal fetch with AbortController timeout.
   * @param {string} url
   * @param {RequestInit} opts - fetch options
   * @param {number} [timeout] - ms before abort (default 30 000)
   * @returns {Promise<Response>}
   */
  function _fetch(url, opts, timeout) {
    var ms = timeout || DEFAULT_TIMEOUT;
    var controller = new AbortController();
    opts.signal = controller.signal;

    var timer = setTimeout(function () {
      controller.abort();
    }, ms);

    return fetch(url, opts)
      .then(function (resp) {
        clearTimeout(timer);
        return resp;
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          throw new Error('Request timed out after ' + ms / 1000 + 's');
        }
        throw err;
      });
  }

  /**
   * Encode an object as application/x-www-form-urlencoded.
   * Values are truncated to `maxLen` chars (default 10 000) to prevent data loss
   * on long writing responses and speaking transcripts.
   */
  function _encodeForm(payload, maxLen) {
    var limit = maxLen || 10000;
    return Object.keys(payload)
      .map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(String(payload[k]).substring(0, limit));
      })
      .join('&');
  }

  /**
   * Append auth query parameters (app token + session) to a webhook URL.
   * Only applies to the Apps Script webhook — other endpoints (Formspree, etc.)
   * are left untouched. The public teacher_token is gone; teacher authority now
   * rides on the session, which the server validates by role.
   */
  function _appendToken(url) {
    if (!FP.WEBHOOK_URL || url.indexOf(FP.WEBHOOK_URL) !== 0) return url;
    var parts = [];
    if (FP.APP_TOKEN) parts.push('token=' + encodeURIComponent(FP.APP_TOKEN));
    var session = FP.getSession && FP.getSession();
    if (session) parts.push('session=' + encodeURIComponent(session));
    if (!parts.length) return url;
    var sep = url.indexOf('?') === -1 ? '?' : '&';
    return url + sep + parts.join('&');
  }

  /**
   * Inspect a parsed webhook response: if the server rejected us as
   * Unauthorized (it answers 200 with { error: 'Unauthorized' }), drop the
   * stale session and bounce to the login screen. Otherwise pass data through.
   */
  function _checkAuth(data) {
    if (data && (data.error === 'Unauthorized' || data.message === 'Unauthorized')) {
      if (FP.clearSession) FP.clearSession();
      if (FP.redirectToLogin) FP.redirectToLogin();
      throw new Error('Unauthorized');
    }
    return data;
  }

  /**
   * GET request that returns parsed JSON.
   * Auth tokens are appended automatically.
   * @param {string} url
   * @param {object} [options]
   * @param {number} [options.timeout]
   * @returns {Promise<any>} parsed JSON body
   */
  function get(url, options) {
    var opt = options || {};
    return _fetch(_appendToken(url), { method: 'GET', redirect: 'follow' }, opt.timeout)
      .then(function (resp) {
        if (!resp.ok) throw new Error('GET failed: ' + resp.status);
        return resp.json();
      })
      .then(_checkAuth);
  }

  /**
   * POST form-urlencoded in no-cors mode (Google Apps Script webhooks).
   * Returns true on send — response is opaque so we can't inspect it.
   * @param {string} url
   * @param {object} payload - key/value pairs
   * @param {object} [options]
   * @param {number} [options.timeout]
   * @param {number} [options.maxValueLength] - truncate values (default 2 000)
   * @returns {Promise<true>}
   */
  function postForm(url, payload, options) {
    var opt = options || {};
    // Inject auth tokens into the payload for Apps Script requests only
    var authedPayload = Object.assign({}, payload);
    var isWebhook = FP.WEBHOOK_URL && url.indexOf(FP.WEBHOOK_URL) === 0;
    var session = FP.getSession && FP.getSession();
    if (isWebhook && FP.APP_TOKEN) authedPayload.token = FP.APP_TOKEN;
    if (isWebhook && session) authedPayload.session = session;
    return _fetch(
      url,
      {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: _encodeForm(authedPayload, opt.maxValueLength),
      },
      opt.timeout
    ).then(function () {
      return true;
    });
  }

  /**
   * POST JSON with readable response (Formspree, Apps Script proxy, etc.).
   * @param {string} url
   * @param {object} payload
   * @param {object} [options]
   * @param {number}  [options.timeout]
   * @param {object}  [options.headers] - extra headers merged in
   * @returns {Promise<any>} parsed JSON body
   */
  function postJson(url, payload, options) {
    var opt = options || {};
    var headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (opt.headers) {
      Object.keys(opt.headers).forEach(function (k) {
        headers[k] = opt.headers[k];
      });
    }
    // For JSON posts, append token as query parameter (body is JSON, not form data)
    return _fetch(
      _appendToken(url),
      {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      },
      opt.timeout
    )
      .then(function (resp) {
        if (!resp.ok) throw new Error('POST failed: ' + resp.status);
        return resp.json();
      })
      .then(_checkAuth);
  }

  /**
   * POST form-urlencoded with a READABLE JSON response (CORS mode).
   * Unlike postForm (no-cors, fire-and-forget) and postJson (application/json,
   * which triggers a CORS preflight Apps Script can't answer), this sends a
   * "simple" request — no preflight — so the cross-origin response is readable.
   * Use it for endpoints whose reply we need to act on: login, logout,
   * create_account, create_checkout. Auth token + session are injected.
   */
  function postRead(url, payload, options) {
    var opt = options || {};
    var authed = Object.assign({}, payload);
    var isWebhook = FP.WEBHOOK_URL && url.indexOf(FP.WEBHOOK_URL) === 0;
    var session = FP.getSession && FP.getSession();
    if (isWebhook && FP.APP_TOKEN) authed.token = FP.APP_TOKEN;
    if (isWebhook && session) authed.session = session;
    return _fetch(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: _encodeForm(authed, opt.maxValueLength),
      },
      opt.timeout
    )
      .then(function (resp) {
        if (!resp.ok) throw new Error('POST failed: ' + resp.status);
        return resp.json();
      })
      .then(_checkAuth);
  }

  /**
   * POST a pre-serialised body as text/plain (a "simple" request, so no CORS
   * preflight) with a READABLE JSON response. Used for large JSON bodies such
   * as audio uploads. The body travels untouched (no truncation); auth token
   * and session go in the query string, where the backend reads them.
   */
  function postText(url, bodyString, options) {
    var opt = options || {};
    return _fetch(
      _appendToken(url),
      {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: bodyString,
      },
      opt.timeout
    )
      .then(function (resp) {
        if (!resp.ok) throw new Error('POST failed: ' + resp.status);
        return resp.json();
      })
      .then(_checkAuth);
  }

  return {
    get: get,
    postForm: postForm,
    postJson: postJson,
    postRead: postRead,
    postText: postText,
    appendToken: _appendToken,
  };
})();

// ══════════════════════════════════════════════════════
// SAVE OVERLAY — blocks interaction during async saves
// ══════════════════════════════════════════════════════

/**
 * Show a full-screen overlay that blocks all interaction.
 * @param {string} [message] - text to display (default "Saving…")
 */
FP.showSaveOverlay = function (message, isHtml) {
  var el = document.getElementById('fp-save-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fp-save-overlay';
    el.className = 'fp-scrim';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'fp-save-msg');
    el.innerHTML =
      '<div class="fp-modal fp-wait">' +
      '<span class="fp-spinner" aria-hidden="true"></span>' +
      '<div id="fp-save-msg" class="fp-wait__msg">Saving…</div>' +
      '</div>';
    (document.body || document.documentElement).appendChild(el);
  }
  var msg = document.getElementById('fp-save-msg');
  if (isHtml) msg.innerHTML = message;
  else msg.textContent = message || 'Saving…';
  el.classList.add('is-open');
};

/**
 * Update the overlay message without hiding it.
 * @param {string} message
 */
FP.updateSaveOverlay = function (message, isHtml) {
  var m = document.getElementById('fp-save-msg');
  if (!m) return;
  if (isHtml) m.innerHTML = message;
  else m.textContent = message;
};

/**
 * Hide the save overlay.
 */
FP.hideSaveOverlay = function () {
  var el = document.getElementById('fp-save-overlay');
  if (el) el.classList.remove('is-open');
};

// ══════════════════════════════════════════════════════
// STARTUP — run once on every page load
// ══════════════════════════════════════════════════════

if (typeof cleanupLocalStorage === 'function') cleanupLocalStorage();

// ══════════════════════════════════════════════════════
// DEV BANNER — shown in development mode
// ══════════════════════════════════════════════════════

if (FP.ENV === 'development') {
  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.createElement('div');
    banner.id = 'fp-dev-banner';
    banner.className = 'fp-dev-banner';
    banner.textContent = 'DEV MODE';
    document.body.appendChild(banner);
  });
}

// ══════════════════════════════════════════════════════
// SERVICE WORKER — offline resilience
// ══════════════════════════════════════════════════════

if ('serviceWorker' in navigator) {
  // Service worker must be at the root to control all pages.
  // Compute the root-relative path to sw.js from any page depth.
  var base = location.pathname.substring(0, location.pathname.lastIndexOf('/') + 1);
  var rootBase = base.replace(/src\/$/, '').replace(/legacy\/$/, '');
  var swPath = rootBase + 'sw.js';

  navigator.serviceWorker
    .register(swPath)
    .then(function (reg) {
      // Check for updates every 30 minutes
      setInterval(
        function () {
          reg.update();
        },
        30 * 60 * 1000
      );
    })
    .catch(function (err) {
      console.warn('[FluentPath] Service worker registration failed:', err);
    });

  // When coming back online, tell the SW to replay queued POSTs
  window.addEventListener('online', function () {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('replay-queue');
    }
  });

  // Listen for messages from the SW (e.g. queue replayed)
  navigator.serviceWorker.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'queue-replayed') {
      console.log(
        '[FluentPath] Replayed ' +
          event.data.count +
          ' offline request(s)' +
          (event.data.dropped ? ', dropped ' + event.data.dropped + ' that the server rejected.' : '.')
      );
    }
  });
}

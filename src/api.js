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

    var timer = setTimeout(function () { controller.abort(); }, ms);

    return fetch(url, opts).then(function (resp) {
      clearTimeout(timer);
      return resp;
    }).catch(function (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error('Request timed out after ' + (ms / 1000) + 's');
      }
      throw err;
    });
  }

  /**
   * Encode an object as application/x-www-form-urlencoded.
   * Values are truncated to `maxLen` chars (default 2 000) to match existing behaviour.
   */
  function _encodeForm(payload, maxLen) {
    var limit = maxLen || 2000;
    return Object.keys(payload).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(String(payload[k]).substring(0, limit));
    }).join('&');
  }

  /**
   * GET request that returns parsed JSON.
   * @param {string} url
   * @param {object} [options]
   * @param {number} [options.timeout]
   * @returns {Promise<any>} parsed JSON body
   */
  function get(url, options) {
    var opt = options || {};
    return _fetch(url, { method: 'GET', redirect: 'follow' }, opt.timeout)
      .then(function (resp) {
        if (!resp.ok) throw new Error('GET failed: ' + resp.status);
        return resp.json();
      });
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
    return _fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: _encodeForm(payload, opt.maxValueLength),
    }, opt.timeout).then(function () { return true; });
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
    var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (opt.headers) {
      Object.keys(opt.headers).forEach(function (k) { headers[k] = opt.headers[k]; });
    }
    return _fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    }, opt.timeout).then(function (resp) {
      if (!resp.ok) throw new Error('POST failed: ' + resp.status);
      return resp.json();
    });
  }

  return { get: get, postForm: postForm, postJson: postJson };
})();


// ══════════════════════════════════════════════════════
// SAVE OVERLAY — blocks interaction during async saves
// ══════════════════════════════════════════════════════

/**
 * Show a full-screen overlay that blocks all interaction.
 * @param {string} [message] - text to display (default "Saving…")
 */
FP.showSaveOverlay = function (message) {
  var el = document.getElementById('fp-save-overlay');
  if (!el) {
    // Inject keyframes
    if (!document.getElementById('fp-spin-style')) {
      var s = document.createElement('style');
      s.id = 'fp-spin-style';
      s.textContent = '@keyframes fp-spin{to{transform:rotate(360deg)}}';
      (document.head || document.documentElement).appendChild(s);
    }
    el = document.createElement('div');
    el.id = 'fp-save-overlay';
    el.style.cssText =
      'position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;' +
      'background:rgba(26,18,8,0.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);';
    el.innerHTML =
      '<div style="background:white;border-radius:12px;padding:32px 40px;text-align:center;max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.25);">' +
        '<div style="width:36px;height:36px;border:3px solid #e8e2d9;border-top-color:#b8471e;border-radius:50%;' +
          'animation:fp-spin 0.8s linear infinite;margin:0 auto 16px;"></div>' +
        '<div id="fp-save-msg" style="font-size:17px;font-weight:600;color:#1a1208;line-height:1.5;">Saving…</div>' +
      '</div>';
    (document.body || document.documentElement).appendChild(el);
  }
  document.getElementById('fp-save-msg').textContent = message || 'Saving…';
  el.style.display = 'flex';
};

/**
 * Update the overlay message without hiding it.
 * @param {string} message
 */
FP.updateSaveOverlay = function (message) {
  var m = document.getElementById('fp-save-msg');
  if (m) m.textContent = message;
};

/**
 * Hide the save overlay.
 */
FP.hideSaveOverlay = function () {
  var el = document.getElementById('fp-save-overlay');
  if (el) el.style.display = 'none';
};

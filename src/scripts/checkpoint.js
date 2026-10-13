/* ═══════════════════════════════════════════════════════════════
   FluentPath — Checkpoint / Session Recovery
   ─────────────────────────────────────────────────────────────
   Generic save/load/clear API for localStorage checkpointing,
   plus a bilingual recovery modal UI.

   Load BEFORE the page's main script (e.g. in <head>):
     <script src="checkpoint.js"></script>

   Usage in page scripts:
     Checkpoint.save('test', { screen, answers, ... });
     const data = Checkpoint.load('test');
     Checkpoint.clear('test');
     Checkpoint.showRecoveryModal({ onResume, onStartOver });
   ═══════════════════════════════════════════════════════════════ */

const Checkpoint = (() => {
  'use strict';

  const PREFIX = 'fp_ckpt_';
  const VERSION = 2; // increment when checkpoint structure changes

  /**
   * DATA-1: scope every checkpoint to the logged-in student.
   *
   * Keys used to be 'fp_ckpt_<key>_<slot>', shared by whoever was on the
   * device — so two students on one phone/tablet could be offered each other's
   * half-finished test or lesson to "resume". Returns '' when nobody is logged
   * in, which keeps pre-login behaviour unchanged.
   */
  function scope() {
    try {
      var who = (localStorage.getItem('fp_student_name') || '').toLowerCase().trim();
      return who ? who.replace(/[^a-z0-9]+/g, '-') + '_' : '';
    } catch (e) {
      return '';
    }
  }

  /** Fully-qualified base key for the current student. */
  function baseKey(key) {
    return PREFIX + scope() + key;
  }

  /* ── Core API (double-buffer) ──────────────────────────── */
  // Alternates writes between _a and _b slots. On load, picks the
  // newest valid slot. A crash during save corrupts at most one slot.

  var writeSlot = {}; // tracks which slot to write next per key

  function save(key, data) {
    try {
      data._savedAt = Date.now();
      data._version = VERSION;
      var slot = writeSlot[key] === 'b' ? 'a' : 'b';
      writeSlot[key] = slot;
      localStorage.setItem(baseKey(key) + '_' + slot, JSON.stringify(data));
    } catch (e) {
      /* quota exceeded or unavailable */
    }
  }

  /**
   * One-time migration of checkpoints written BEFORE they were student-scoped
   * (keys 'fp_ckpt_<key>_a|_b|<none>'). load() only reads scoped keys, so a
   * student who was mid-test across the upgrade could never resume, and the
   * orphan was never cleaned. We adopt an unscoped checkpoint only when the
   * name stored inside it matches the logged-in student; otherwise it may be
   * someone else's and is left alone (DATA-1: never offer another student's
   * work). Adopted keys move to the scoped name and the old key is removed.
   */
  function _migrateUnscoped(key) {
    try {
      var mine = scope();
      if (!mine) return; // nobody logged in: scoped and unscoped keys are the same
      var who = (localStorage.getItem('fp_student_name') || '').toLowerCase().trim();
      ['_a', '_b', ''].forEach(function (suffix) {
        var oldKey = PREFIX + key + suffix;
        var raw = localStorage.getItem(oldKey);
        if (!raw) return;
        var data;
        try {
          data = JSON.parse(raw);
        } catch (e) {
          return;
        }
        var owner = String((data && (data.studentName || data.candidateName)) || '')
          .toLowerCase()
          .trim();
        if (!owner || owner !== who) return;
        var newKey = baseKey(key) + suffix;
        if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, raw);
        localStorage.removeItem(oldKey);
      });
    } catch (e) {
      /* storage unavailable */
    }
  }

  function load(key) {
    _migrateUnscoped(key);
    var a = _loadSlot(key, 'a');
    var b = _loadSlot(key, 'b');
    // Also try the old single-key format (migration from pre-double-buffer)
    var legacy = _loadLegacy(key);

    // Pick the newest valid checkpoint
    var candidates = [a, b, legacy].filter(function (c) {
      return c !== null;
    });
    if (candidates.length === 0) return null;

    // Filter out incompatible versions
    candidates = candidates.filter(function (c) {
      return !c._version || c._version === VERSION;
    });
    if (candidates.length === 0) return null;

    // Return the one with the most recent _savedAt
    candidates.sort(function (x, y) {
      return (y._savedAt || 0) - (x._savedAt || 0);
    });
    return candidates[0];
  }

  function _loadSlot(key, slot) {
    try {
      var raw = localStorage.getItem(baseKey(key) + '_' + slot);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _loadLegacy(key) {
    try {
      var raw = localStorage.getItem(baseKey(key));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clear(key) {
    try {
      var base = baseKey(key);
      localStorage.removeItem(base + '_a');
      localStorage.removeItem(base + '_b');
      localStorage.removeItem(base); // legacy single-key
      // Also drop any unscoped keys written before checkpoints were
      // student-scoped, so they can't linger and be offered to someone else.
      if (base !== PREFIX + key) {
        localStorage.removeItem(PREFIX + key + '_a');
        localStorage.removeItem(PREFIX + key + '_b');
        localStorage.removeItem(PREFIX + key);
      }
    } catch (e) {}
  }

  function has(key) {
    return load(key) !== null;
  }

  /* ── Recovery modal ─────────────────────────────────────── */
  // Built from the shared modal component (fp-scrim / fp-modal). It waits for the student's
  // choice: no countdown, and Escape does not resume or start over by surprise (UX-4).

  /** "5 min ago" / "hace 5 min" as two plain strings. */
  function agoParts(ts) {
    var mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return ['just now', 'justo ahora'];
    if (mins < 60) return [mins + ' min ago', 'hace ' + mins + ' min'];
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return [hrs + 'h ago', 'hace ' + hrs + 'h'];
    return ['over a day ago', 'hace más de un día'];
  }

  /** English with an optional Spanish line (hidden for B2+ by the fp-no-es rule). */
  function bi(en, es) {
    return es ? FP.ui.bi(en, es) : esc(en);
  }

  function showRecoveryModal(opts) {
    var overlay = document.createElement('div');
    overlay.className = 'fp-scrim has-sheet is-open';
    var ago = opts.savedAt ? agoParts(opts.savedAt) : null;
    overlay.innerHTML =
      '<div class="fp-modal fp-ckpt" role="alertdialog" aria-modal="true" aria-labelledby="ckptTitle" aria-describedby="ckptMsg">' +
      '<div class="fp-ckpt__icon">' +
      FP.icon('keep', { size: 'lg' }) +
      '</div>' +
      '<h2 class="fp-modal__title" id="ckptTitle">' +
      bi(opts.title || 'Resume?', opts.titleEs) +
      '</h2>' +
      '<p class="fp-ckpt__msg" id="ckptMsg">' +
      bi(opts.message || 'You have unsaved progress.', opts.messageEs) +
      '</p>' +
      (ago ? '<p class="fp-ckpt__time">' + bi('Saved ' + ago[0], 'Guardado ' + ago[1]) + '</p>' : '') +
      '<div class="fp-ckpt__actions">' +
      '<button type="button" class="fp-btn fp-btn--primary fp-btn--block" id="ckptResume">' +
      bi('Resume', 'Continuar') +
      '</button>' +
      '<button type="button" class="fp-btn fp-btn--text" id="ckptRestart">' +
      bi('Start over', 'Empezar de nuevo') +
      '</button>' +
      '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var modal = overlay.querySelector('.fp-ckpt');
    var mainHtml = modal.innerHTML;

    // Keep Tab inside the dialog; Escape is deliberately not a choice.
    function onKeydown(e) {
      if (e.key !== 'Tab') return;
      var btns = Array.prototype.slice.call(modal.querySelectorAll('button'));
      var first = btns[0],
        last = btns[btns.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeydown);

    function cleanup() {
      document.removeEventListener('keydown', onKeydown);
      overlay.remove();
    }

    function showMain() {
      modal.innerHTML = mainHtml;
      modal.setAttribute('aria-labelledby', 'ckptTitle');
      modal.setAttribute('aria-describedby', 'ckptMsg');
      modal.querySelector('#ckptResume').onclick = function () {
        cleanup();
        if (opts.onResume) opts.onResume();
      };
      modal.querySelector('#ckptRestart').onclick = showConfirm;
      modal.querySelector('#ckptResume').focus();
    }

    // "Start over" throws the saved work away, so it asks first. The safe choice is the primary one.
    function showConfirm() {
      modal.innerHTML =
        '<div class="fp-ckpt__icon">' +
        FP.icon('warning', { size: 'lg' }) +
        '</div>' +
        '<h2 class="fp-modal__title" id="ckptConfirmTitle">' +
        bi('Start over?', '¿Empezar de nuevo?') +
        '</h2>' +
        '<p class="fp-ckpt__msg" id="ckptConfirmMsg">' +
        bi(
          'Your saved answers will be deleted. This cannot be undone.',
          'Tus respuestas guardadas se borrarán. No se puede deshacer.'
        ) +
        '</p>' +
        '<div class="fp-ckpt__actions">' +
        '<button type="button" class="fp-btn fp-btn--primary fp-btn--block" id="ckptKeep">' +
        bi('No, keep my progress', 'No, conservar mi progreso') +
        '</button>' +
        '<button type="button" class="fp-btn fp-btn--text" id="ckptConfirm">' +
        bi('Yes, start over', 'Sí, empezar de nuevo') +
        '</button>' +
        '</div>';
      modal.setAttribute('aria-labelledby', 'ckptConfirmTitle');
      modal.setAttribute('aria-describedby', 'ckptConfirmMsg');
      modal.querySelector('#ckptKeep').onclick = showMain;
      modal.querySelector('#ckptConfirm').onclick = function () {
        cleanup();
        if (opts.onStartOver) opts.onStartOver();
      };
      modal.querySelector('#ckptKeep').focus();
    }

    showMain();
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  return { save, load, clear, has, showRecoveryModal };
})();

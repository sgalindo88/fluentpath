/* ═══════════════════════════════════════════════════════════════
   English Path — Checkpoint / Session Recovery
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

  const PREFIX = 'ep_ckpt_';

  /* ── Core API ───────────────────────────────────────────── */

  function save(key, data) {
    try {
      data._savedAt = Date.now();
      localStorage.setItem(PREFIX + key, JSON.stringify(data));
    } catch (e) { /* quota exceeded or unavailable */ }
  }

  function load(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clear(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) {}
  }

  function has(key) {
    try { return localStorage.getItem(PREFIX + key) !== null; } catch (e) { return false; }
  }

  /* ── Time-ago helper ────────────────────────────────────── */
  function timeAgo(timestamp) {
    if (!timestamp) return '';
    const mins = Math.round((Date.now() - timestamp) / 60000);
    if (mins < 1) return 'just now / justo ahora';
    if (mins < 60) return mins + ' min ago / hace ' + mins + ' min';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + 'h ago / hace ' + hrs + 'h';
    return 'over a day ago / hace ms de un da';
  }

  /* ── Inject modal CSS ───────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('ckpt-styles')) return;
    const s = document.createElement('style');
    s.id = 'ckpt-styles';
    s.textContent = `
      .ckpt-overlay {
        position: fixed; inset: 0;
        background: rgba(26, 18, 8, 0.55);
        z-index: 10001;
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
        animation: ckptFadeIn 0.25s ease both;
      }
      @keyframes ckptFadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
      .ckpt-modal {
        background: var(--paper, #f5f0e8);
        border: 1px solid var(--rule, #c8bfa8);
        border-radius: 8px;
        max-width: 420px;
        width: 100%;
        padding: 32px 28px;
        box-shadow: 0 12px 40px rgba(26, 18, 8, 0.3);
        text-align: center;
        animation: ckptSlideUp 0.3s ease both;
      }
      @keyframes ckptSlideUp {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .ckpt-icon {
        font-size: 36px;
        margin-bottom: 12px;
      }
      .ckpt-title {
        font-family: 'Playfair Display', Georgia, serif;
        font-size: 22px;
        font-weight: 700;
        color: var(--ink, #1a1208);
        margin-bottom: 4px;
      }
      .ckpt-title-es {
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 14px;
        font-weight: 300;
        font-style: italic;
        color: var(--muted, #6b5f4e);
        margin-bottom: 16px;
      }
      .ckpt-message {
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 15px;
        font-weight: 300;
        color: var(--ink, #1a1208);
        line-height: 1.6;
        margin-bottom: 4px;
      }
      .ckpt-message-es {
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 13px;
        font-weight: 300;
        font-style: italic;
        color: var(--muted, #6b5f4e);
        line-height: 1.5;
        margin-bottom: 8px;
      }
      .ckpt-time {
        font-size: 12px;
        color: var(--muted, #6b5f4e);
        margin-bottom: 24px;
      }
      .ckpt-actions {
        display: flex;
        gap: 12px;
      }
      .ckpt-btn {
        flex: 1;
        padding: 14px 16px;
        border-radius: 6px;
        font-family: 'Playfair Display', Georgia, serif;
        font-size: 15px;
        font-style: italic;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
        min-height: 48px;
      }
      .ckpt-btn-resume {
        background: var(--ink, #1a1208);
        color: var(--paper, #f5f0e8);
      }
      .ckpt-btn-resume:hover {
        background: var(--rust, #b8471e);
      }
      .ckpt-btn-restart {
        background: transparent;
        border: 1.5px solid var(--rule, #c8bfa8);
        color: var(--ink, #1a1208);
      }
      .ckpt-btn-restart:hover {
        border-color: var(--ink, #1a1208);
      }
      .ckpt-btn-sub {
        display: block;
        font-size: 0.72em;
        font-style: italic;
        opacity: 0.7;
        margin-top: 2px;
        font-family: 'Source Serif 4', Georgia, serif;
      }
      @media (max-width: 400px) {
        .ckpt-actions { flex-direction: column; }
        .ckpt-modal { padding: 24px 20px; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ── Recovery modal ─────────────────────────────────────── */
  function showRecoveryModal(opts) {
    injectCSS();

    const savedAt = opts.savedAt || null;

    const overlay = document.createElement('div');
    overlay.className = 'ckpt-overlay';
    overlay.innerHTML = `
      <div class="ckpt-modal">
        <div class="ckpt-icon">📌</div>
        <div class="ckpt-title">${esc(opts.title || 'Resume?')}</div>
        <div class="ckpt-title-es">${esc(opts.titleEs || '')}</div>
        <div class="ckpt-message">${esc(opts.message || 'You have unsaved progress.')}</div>
        <div class="ckpt-message-es">${esc(opts.messageEs || '')}</div>
        <div class="ckpt-time">${savedAt ? '⏱ Saved ' + timeAgo(savedAt) : ''}</div>
        <div class="ckpt-actions">
          <button class="ckpt-btn ckpt-btn-resume" id="ckptResume">
            Resume
            <span class="ckpt-btn-sub">Continuar</span>
          </button>
          <button class="ckpt-btn ckpt-btn-restart" id="ckptRestart">
            Start Over
            <span class="ckpt-btn-sub">Empezar de Nuevo</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('ckptResume').onclick = () => {
      overlay.remove();
      if (opts.onResume) opts.onResume();
    };
    document.getElementById('ckptRestart').onclick = () => {
      overlay.remove();
      if (opts.onStartOver) opts.onStartOver();
    };
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  return { save, load, clear, has, showRecoveryModal };
})();

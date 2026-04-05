/* ═══════════════════════════════════════════════════════════════
   English Path — Video Call Component
   Uses Jitsi Meet (free, no accounts required).

   Usage:
     <script src="video-call.js"></script>
     <script>
       VideoCall.init({
         studentName: 'John Doe',
         date: '2026-04-05',       // optional, defaults to today
         role: 'student'           // 'student' or 'teacher'
       });
     </script>

   Both teacher and student get the same room name (derived from
   the student's name + date), so they auto-join the same call.
   ═══════════════════════════════════════════════════════════════ */

const VideoCall = (() => {
  'use strict';

  const JITSI_DOMAIN = 'meet.jit.si';
  let roomName = '';
  let displayName = '';
  let role = 'student';
  let panelState = 'collapsed'; // collapsed | expanded
  let container = null;
  let initialized = false;

  /* ── Room name generation ─────────────────────────────────── */
  function generateRoom(name, dateStr) {
    const clean = (name || 'student')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const d = dateStr || new Date().toISOString().split('T')[0];
    return 'EnglishPath-' + clean + '-' + d.replace(/-/g, '');
  }

  function getRoomUrl() {
    return 'https://' + JITSI_DOMAIN + '/' + roomName;
  }

  /* ── Inject styles ────────────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('vc-styles')) return;
    const style = document.createElement('style');
    style.id = 'vc-styles';
    style.textContent = `
      /* ── Video Call Panel ── */
      .vc-panel {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 10000;
        font-family: 'Source Serif 4', Georgia, serif;
        transition: all 0.3s ease;
      }

      /* ── Collapsed: Floating Button ── */
      .vc-btn-join {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 22px;
        background: #1a1208;
        color: #f5f0e8;
        border: none;
        border-radius: 50px;
        cursor: pointer;
        font-family: 'Playfair Display', Georgia, serif;
        font-size: 15px;
        font-style: italic;
        box-shadow: 0 4px 20px rgba(26, 18, 8, 0.25);
        transition: background 0.2s, transform 0.2s;
      }
      .vc-btn-join:hover {
        background: #b8471e;
        transform: translateY(-2px);
      }
      .vc-btn-join svg {
        width: 20px;
        height: 20px;
        fill: currentColor;
      }

      /* ── Pulse indicator when collapsed ── */
      .vc-pulse {
        width: 8px;
        height: 8px;
        background: #2e6e45;
        border-radius: 50%;
        animation: vcPulse 2s ease infinite;
      }
      @keyframes vcPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.4); }
      }

      /* ── Expanded: Video Container ── */
      .vc-expanded {
        width: 380px;
        height: 320px;
        background: #1a1208;
        border-radius: 10px;
        overflow: hidden;
        box-shadow: 0 8px 40px rgba(26, 18, 8, 0.35);
        display: flex;
        flex-direction: column;
        animation: vcSlideUp 0.3s ease both;
      }
      @keyframes vcSlideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .vc-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 14px;
        background: #1a1208;
        border-bottom: 1px solid #333;
        min-height: 40px;
      }
      .vc-toolbar-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .vc-room-label {
        font-size: 11px;
        color: #c9933a;
        font-weight: 600;
        letter-spacing: 0.15em;
        text-transform: uppercase;
      }
      .vc-toolbar-right {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .vc-tool-btn {
        background: transparent;
        border: none;
        color: #f5f0e8;
        cursor: pointer;
        padding: 6px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
        font-size: 12px;
      }
      .vc-tool-btn:hover {
        background: rgba(245, 240, 232, 0.1);
      }
      .vc-tool-btn svg {
        width: 16px;
        height: 16px;
        fill: currentColor;
      }

      .vc-iframe-wrap {
        flex: 1;
        position: relative;
      }
      .vc-iframe-wrap iframe {
        width: 100%;
        height: 100%;
        border: 0;
      }
      .vc-iframe-loading {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #6b5f4e;
        font-size: 13px;
        font-style: italic;
      }

      /* ── Copy feedback ── */
      .vc-copied {
        position: absolute;
        bottom: 48px;
        right: 0;
        background: #2e6e45;
        color: white;
        font-size: 11px;
        padding: 5px 12px;
        border-radius: 4px;
        animation: vcFade 2s ease both;
        pointer-events: none;
      }
      @keyframes vcFade {
        0% { opacity: 0; transform: translateY(4px); }
        15% { opacity: 1; transform: translateY(0); }
        75% { opacity: 1; }
        100% { opacity: 0; }
      }

      /* ── Responsive ── */
      @media (max-width: 600px) {
        .vc-expanded {
          width: calc(100vw - 24px);
          height: 260px;
          right: 12px;
          bottom: 12px;
        }
        .vc-panel {
          bottom: 12px;
          right: 12px;
        }
        .vc-btn-join {
          padding: 12px 18px;
          font-size: 14px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── SVG icons ─────────────────────────────────────────────── */
  const ICONS = {
    camera: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>',
    popout: '<svg viewBox="0 0 24 24"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
    minimize: '<svg viewBox="0 0 24 24"><path d="M19 13H5v-2h14v2z"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
  };

  /* ── Build collapsed UI ───────────────────────────────────── */
  function buildCollapsed() {
    container.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'vc-btn-join';
    btn.innerHTML = ICONS.camera + ' Join Video Call <span class="vc-pulse"></span>';
    btn.onclick = expand;
    container.appendChild(btn);
    panelState = 'collapsed';
  }

  /* ── Build expanded UI ────────────────────────────────────── */
  function buildExpanded() {
    container.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'vc-expanded';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'vc-toolbar';

    const left = document.createElement('div');
    left.className = 'vc-toolbar-left';
    left.innerHTML = '<span class="vc-room-label">Live</span>';

    const right = document.createElement('div');
    right.className = 'vc-toolbar-right';

    // Copy link button
    const btnCopy = document.createElement('button');
    btnCopy.className = 'vc-tool-btn';
    btnCopy.title = 'Copy room link';
    btnCopy.innerHTML = ICONS.copy;
    btnCopy.onclick = copyLink;

    // Pop-out button
    const btnPop = document.createElement('button');
    btnPop.className = 'vc-tool-btn';
    btnPop.title = 'Open in new tab';
    btnPop.innerHTML = ICONS.popout;
    btnPop.onclick = popout;

    // Minimize button
    const btnMin = document.createElement('button');
    btnMin.className = 'vc-tool-btn';
    btnMin.title = 'Minimise';
    btnMin.innerHTML = ICONS.minimize;
    btnMin.onclick = collapse;

    // End call button
    const btnEnd = document.createElement('button');
    btnEnd.className = 'vc-tool-btn';
    btnEnd.title = 'End call';
    btnEnd.style.color = '#b8471e';
    btnEnd.innerHTML = ICONS.close;
    btnEnd.onclick = endCall;

    right.append(btnCopy, btnPop, btnMin, btnEnd);
    toolbar.append(left, right);

    // Iframe container
    const iframeWrap = document.createElement('div');
    iframeWrap.className = 'vc-iframe-wrap';
    iframeWrap.innerHTML = '<div class="vc-iframe-loading">Connecting&hellip;</div>';

    const iframe = document.createElement('iframe');
    iframe.allow = 'camera; microphone; fullscreen; display-capture; autoplay';
    iframe.src = getRoomUrl() + '#config.prejoinPageEnabled=false'
      + '&userInfo.displayName=' + encodeURIComponent(displayName);
    iframe.onload = () => {
      const loading = iframeWrap.querySelector('.vc-iframe-loading');
      if (loading) loading.remove();
    };
    iframeWrap.appendChild(iframe);

    panel.append(toolbar, iframeWrap);
    container.appendChild(panel);
    panelState = 'expanded';
  }

  /* ── Actions ──────────────────────────────────────────────── */
  function expand() {
    buildExpanded();
  }

  function collapse() {
    buildCollapsed();
  }

  function popout() {
    window.open(getRoomUrl(), '_blank');
  }

  function endCall() {
    buildCollapsed();
  }

  function copyLink() {
    const url = getRoomUrl();
    navigator.clipboard.writeText(url).then(() => {
      const tip = document.createElement('div');
      tip.className = 'vc-copied';
      tip.textContent = 'Link copied!';
      container.appendChild(tip);
      setTimeout(() => tip.remove(), 2200);
    }).catch(() => {
      prompt('Copy this link:', url);
    });
  }

  /* ── Show / Hide ──────────────────────────────────────────── */
  function show() {
    if (container) container.style.display = 'block';
  }

  function hide() {
    if (container) container.style.display = 'none';
  }

  /* ── Get room name (for external use) ─────────────────────── */
  function getRoom() {
    return roomName;
  }

  function getUrl() {
    return getRoomUrl();
  }

  /* ── Init ──────────────────────────────────────────────────── */
  function init(opts) {
    if (initialized) {
      // Update room if re-init with new params
      displayName = opts.studentName || displayName;
      role = opts.role || role;
      roomName = generateRoom(opts.studentName, opts.date);
      if (panelState === 'collapsed') buildCollapsed();
      show();
      return;
    }

    displayName = opts.studentName || 'Participant';
    role = opts.role || 'student';
    roomName = generateRoom(opts.studentName, opts.date);

    injectCSS();

    container = document.createElement('div');
    container.className = 'vc-panel';
    container.style.display = 'block';
    document.body.appendChild(container);

    buildCollapsed();
    initialized = true;
  }

  /* ── Public API ────────────────────────────────────────────── */
  return { init, show, hide, expand, collapse, popout, getRoom, getUrl };
})();

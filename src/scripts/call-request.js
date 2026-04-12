/* ═══════════════════════════════════════════════════════════════
   FluentPath — Video Call Request System (replaces Jitsi)
   ─────────────────────────────────────────────────────────────
   Student flow:
     1. Student clicks "Request a Video Call with Your Teacher"
     2. POST request_video_call → email sent to teacher
     3. Button changes to "Request pending..." with Refresh button
     4. Page polls on load + tab focus + manual refresh
     5. When teacher sends link: banner + button becomes "Join Call"
     6. Student can Dismiss to clear the request

   Usage in each page:
     CallRequest.init({ page: 'hub'|'test'|'lesson', dayNumber: 5 });
   ═══════════════════════════════════════════════════════════════ */

var CallRequest = (function () {
  var state = {
    page: 'hub',
    dayNumber: '',
    currentRequest: null, // { id, status, call_link, ... }
    btnEl: null,
    bannerEl: null,
  };

  function getStudentName() {
    try { return localStorage.getItem('fp_student_name') || ''; } catch (e) { return ''; }
  }

  function apiGet(action, params) {
    var url = FP.WEBHOOK_URL + '?action=' + action;
    Object.keys(params || {}).forEach(function (k) {
      url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    });
    return FP.api.get(url, { timeout: 15000 });
  }

  function apiPost(action, payload) {
    return FP.api.postForm(FP.WEBHOOK_URL, Object.assign({ action: action }, payload));
  }

  // ── UI ─────────────────────────────────────────────────

  function ensureButton() {
    if (state.btnEl) return state.btnEl;
    var btn = document.createElement('button');
    btn.id = 'fp-call-btn';
    btn.style.cssText =
      'position:fixed;bottom:24px;right:24px;z-index:199;' +
      'background:var(--ink,#1a1208);color:var(--paper,#f5f0e8);' +
      'border:none;padding:12px 20px;font-size:13px;font-weight:600;' +
      'cursor:pointer;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.2);' +
      'font-family:"Source Serif 4",serif;display:flex;align-items:center;gap:8px;';
    btn.onclick = onButtonClick;
    document.body.appendChild(btn);
    state.btnEl = btn;
    return btn;
  }

  function ensureBanner() {
    if (state.bannerEl) return state.bannerEl;
    var banner = document.createElement('div');
    banner.id = 'fp-call-banner';
    banner.style.cssText =
      'display:none;position:fixed;top:0;left:0;right:0;z-index:300;' +
      'background:#2e6e45;color:white;' +
      'padding:10px 16px;font-size:13px;font-family:"Source Serif 4",serif;' +
      'align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;';
    document.body.appendChild(banner);
    state.bannerEl = banner;
    return banner;
  }

  function renderButton() {
    var btn = ensureButton();
    if (!state.currentRequest) {
      btn.innerHTML = '📹 <span>Request a Video Call</span>';
      btn.disabled = false;
      btn.style.opacity = '1';
      return;
    }
    if (state.currentRequest.status === 'pending') {
      btn.innerHTML = '⏳ <span>Request pending…</span> <span style="font-size:11px;text-decoration:underline;opacity:0.8;cursor:pointer;" onclick="event.stopPropagation();CallRequest.refresh()">Refresh</span>';
      btn.disabled = false;
      btn.style.opacity = '0.85';
      return;
    }
    if (state.currentRequest.status === 'sent' && state.currentRequest.call_link) {
      btn.innerHTML = '📹 <span>Join Teacher\'s Call</span>';
      btn.style.background = 'var(--green,#2e6e45)';
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.onclick = function () { window.open(state.currentRequest.call_link, '_blank'); };
      return;
    }
  }

  function renderBanner() {
    var banner = ensureBanner();
    if (!state.currentRequest || state.currentRequest.status !== 'sent' || !state.currentRequest.call_link) {
      banner.style.display = 'none';
      return;
    }
    var link = state.currentRequest.call_link;
    banner.innerHTML =
      '<span>📹 Your teacher sent a call link:</span>' +
      '<a href="' + escHtml(link) + '" target="_blank" style="background:white;color:var(--green,#2e6e45);padding:4px 14px;border-radius:4px;font-weight:700;text-decoration:none;">Join Call</a>' +
      '<button onclick="CallRequest.dismiss()" style="background:transparent;color:white;border:1px solid rgba(255,255,255,0.5);padding:4px 10px;font-size:12px;cursor:pointer;border-radius:4px;">Dismiss</button>';
    banner.style.display = 'flex';
  }

  // ── ACTIONS ────────────────────────────────────────────

  async function onButtonClick() {
    if (state.currentRequest) return; // already have a request
    var name = getStudentName();
    if (!name) { alert('Please enter your name first.'); return; }
    try {
      await apiPost('request_video_call', {
        student_name: name,
        page: state.page,
        day_number: state.dayNumber || ''
      });
      // Optimistic update — we don't get the id back from no-cors POST
      state.currentRequest = { status: 'pending', call_link: '' };
      renderButton();
      showToast('Request sent — your teacher will send you a call link soon.');
      // Poll after 3s to pick up the real id
      setTimeout(refresh, 3000);
    } catch (e) {
      showToast('Could not send request. Please try again.', true);
    }
  }

  async function refresh() {
    var name = getStudentName();
    if (!name) return;
    try {
      var data = await apiGet('get_active_call_request', { student: name });
      if (data && data.found) {
        state.currentRequest = data;
      } else {
        state.currentRequest = null;
      }
      renderButton();
      renderBanner();
    } catch (e) { /* silent — keep current state */ }
  }

  async function dismiss() {
    if (!state.currentRequest || !state.currentRequest.id) {
      state.currentRequest = null;
      renderButton();
      renderBanner();
      return;
    }
    try {
      await apiPost('update_call_status', { id: state.currentRequest.id, status: 'dismissed' });
    } catch (e) { /* silent */ }
    state.currentRequest = null;
    renderButton();
    renderBanner();
  }

  function showToast(msg, isError) {
    var toast = document.createElement('div');
    toast.style.cssText =
      'position:fixed;bottom:80px;right:24px;z-index:400;' +
      'background:' + (isError ? 'var(--rust,#b8471e)' : 'var(--ink,#1a1208)') + ';' +
      'color:var(--paper,#f5f0e8);' +
      'padding:12px 18px;border-radius:6px;font-size:13px;font-weight:600;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:320px;' +
      'font-family:"Source Serif 4",serif;';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.transition = 'opacity 0.4s';
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 400);
    }, 3500);
  }

  // ── INIT ───────────────────────────────────────────────

  function init(opts) {
    state.page = (opts && opts.page) || 'hub';
    state.dayNumber = (opts && opts.dayNumber) || '';
    if (!getStudentName()) return; // no name yet — don't show button
    ensureButton();
    renderButton();
    refresh();
    // Check again when tab becomes visible
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refresh();
    });
  }

  return { init: init, refresh: refresh, dismiss: dismiss };
})();

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
    btn.type = 'button';
    btn.className = 'fp-btn fp-btn--secondary fp-fab';
    btn.onclick = onButtonClick;
    document.body.appendChild(btn);
    state.btnEl = btn;
    return btn;
  }

  function renderButton() {
    var btn = ensureButton();
    btn.disabled = false;
    btn.classList.remove('is-pending', 'fp-btn--primary');
    btn.classList.add('fp-btn--secondary');
    if (!state.currentRequest) {
      btn.innerHTML = '📹 <span>Request a Video Call</span>';
      return;
    }
    if (state.currentRequest.status === 'pending') {
      btn.classList.add('is-pending');
      btn.innerHTML = '⏳ <span>Request pending…</span> <span class="fp-fab__refresh" onclick="event.stopPropagation();CallRequest.refresh()">Refresh</span>';
      return;
    }
    if (state.currentRequest.status === 'sent' && state.currentRequest.call_link) {
      btn.classList.remove('fp-btn--secondary');
      btn.classList.add('fp-btn--primary');
      btn.innerHTML = '📹 <span>Join Teacher\'s Call</span>';
      btn.onclick = function () { window.open(state.currentRequest.call_link, '_blank'); };
      return;
    }
  }

  function renderBanner() {
    if (!state.currentRequest || state.currentRequest.status !== 'sent' || !state.currentRequest.call_link) {
      FP.ui.removeBanner('fp-call-banner');
      return;
    }
    FP.ui.banner({
      id: 'fp-call-banner', variant: 'success', position: 'top',
      html: '📹 Your teacher sent a call link.',
      actions: [
        { label: 'Join Call', href: state.currentRequest.call_link },
        { label: 'Dismiss', onclick: function () { CallRequest.dismiss(); } },
      ],
    });
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
    FP.ui.toast(msg, { variant: isError ? 'error' : 'info' });
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

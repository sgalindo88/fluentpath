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
    wrapEl: null,
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

  var bi = FP.ui.bi;

  /** The floating control: a wrapper (fixed bottom-right) holding the main button and, while
   *  a request is pending, a separate Refresh button (never a button nested in a button). */
  function ensureButton() {
    if (state.btnEl) return state.btnEl;
    var wrap = document.createElement('div');
    wrap.id = 'fp-call-wrap';
    wrap.className = 'fp-fab';
    var btn = document.createElement('button');
    btn.id = 'fp-call-btn';
    btn.type = 'button';
    btn.className = 'fp-btn fp-btn--secondary';
    btn.onclick = onButtonClick;
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    state.btnEl = btn;
    state.wrapEl = wrap;
    return btn;
  }

  function renderButton() {
    var btn = ensureButton();
    var wrap = state.wrapEl;
    var oldRefresh = document.getElementById('fp-call-refresh');
    if (oldRefresh) oldRefresh.remove();
    btn.disabled = false;
    btn.onclick = onButtonClick;
    btn.classList.remove('fp-btn--primary');
    btn.classList.add('fp-btn--secondary');
    wrap.classList.remove('is-pending');
    if (!state.currentRequest) {
      btn.innerHTML = FP.icon('videocam') + bi('Request a video call', 'Pedir una videollamada');
      return;
    }
    if (state.currentRequest.status === 'pending') {
      wrap.classList.add('is-pending');
      btn.setAttribute('aria-disabled', 'true');
      btn.onclick = null;
      btn.innerHTML = FP.icon('hourglass_top') + bi('Request pending…', 'Solicitud pendiente…');
      var r = document.createElement('button');
      r.id = 'fp-call-refresh';
      r.type = 'button';
      r.className = 'fp-btn fp-btn--secondary';
      r.innerHTML = bi('Refresh', 'Actualizar');
      r.onclick = refresh;
      wrap.appendChild(r);
      return;
    }
    btn.removeAttribute('aria-disabled');
    if (state.currentRequest.status === 'sent' && state.currentRequest.call_link) {
      btn.classList.remove('fp-btn--secondary');
      btn.classList.add('fp-btn--primary');
      btn.innerHTML = FP.icon('videocam') + bi("Join teacher's call", 'Unirme a la llamada del profesor');
      btn.onclick = function () { window.open(state.currentRequest.call_link, '_blank'); };
    }
  }

  function renderBanner() {
    if (!state.currentRequest || state.currentRequest.status !== 'sent' || !state.currentRequest.call_link) {
      FP.ui.removeBanner('fp-call-banner');
      return;
    }
    FP.ui.banner({
      id: 'fp-call-banner', variant: 'success', position: 'top',
      html: bi('Your teacher sent a call link.', 'Tu profesor te envió un enlace para la llamada.'),
      actions: [
        { label: 'Join call · Unirme', href: state.currentRequest.call_link },
        { label: 'Dismiss · Descartar', onclick: function () { CallRequest.dismiss(); } },
      ],
    });
  }

  // ── ACTIONS ────────────────────────────────────────────

  async function onButtonClick() {
    if (state.currentRequest) return; // already have a request
    var name = getStudentName();
    if (!name) { showToast(bi('Please log in first.', 'Inicia sesión primero.'), true, true); return; }
    try {
      await apiPost('request_video_call', {
        student_name: name,
        page: state.page,
        day_number: state.dayNumber || ''
      });
      // Optimistic update — we don't get the id back from no-cors POST
      state.currentRequest = { status: 'pending', call_link: '' };
      renderButton();
      showToast(bi('Request sent. Your teacher will send you a call link soon.', 'Solicitud enviada. Tu profesor te enviará un enlace pronto.'), false, true);
      // Poll after 3s to pick up the real id
      setTimeout(refresh, 3000);
    } catch (e) {
      showToast(bi('Could not send the request. Please try again.', 'No pudimos enviar la solicitud. Inténtalo de nuevo.'), true, true);
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

  function showToast(msg, isError, isHtml) {
    FP.ui.toast(msg, { variant: isError ? 'error' : 'success', html: !!isHtml });
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

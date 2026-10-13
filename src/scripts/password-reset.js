/* ═══════════════════════════════════════════════════════════════
   FluentPath — Shared password-reset UI
   ─────────────────────────────────────────────────────────────
   Self-contained modal used by BOTH the student app and the teacher
   portal (loaded after config.js + api.js). Two flows:
     • Forgot password  → FP.passwordReset.openForgot() (from the login screen)
                          → POST request_reset → emails a one-time link.
     • Set new password → arriving with ?reset=TOKEN shows the reset form
                          → POST reset_password.
   The backend is the source of truth; this only drives the UI.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  var FP = window.FP || (window.FP = {});
  var resetToken = null;
  var opener = null; // element to give focus back to on close

  function el(id) { return document.getElementById(id); }
  var bi = function (en, es) { return FP.ui.bi(en, es); };

  /** Known server messages → [English, Spanish]. Unknown ones are shown as sent. */
  var SERVER = {
    'Password must be at least 6 characters.': ['Password must be at least 6 characters.', 'La contraseña debe tener al menos 6 caracteres.'],
    'This reset link is invalid or has expired.': ['This reset link is invalid or has expired.', 'Este enlace no es válido o ya venció.'],
    'This reset link has already been used.': ['This reset link has already been used.', 'Este enlace ya se usó.'],
    'Invalid reset link.': ['Invalid reset link.', 'Enlace no válido.'],
    'Account not found.': ['Account not found.', 'No encontramos la cuenta.'],
  };

  /** Show a message under the form. kind: 'error' | 'success'. `html` is already escaped. */
  function setMsg(id, html, kind) {
    var m = el(id);
    if (!m) return;
    if (!html) { m.innerHTML = ''; m.className = 'fp-hidden'; return; }
    m.className = kind === 'success' ? 'fp-banner fp-banner--success' : 'fp-field-error';
    m.innerHTML = FP.icon(kind === 'success' ? 'check' : 'warning', { size: 'sm', className: kind === 'success' ? 'fp-banner__icon' : '' }) + '<span>' + html + '</span>';
  }

  function injectModal() {
    if (el('fp-reset-modal')) return;
    var modal = document.createElement('div');
    modal.id = 'fp-reset-modal';
    modal.className = 'fp-scrim has-sheet';
    modal.innerHTML =
      '<div class="fp-modal fp-reset" role="dialog" aria-modal="true" aria-labelledby="fp-reset-title">' +
        '<button type="button" class="fp-modal__close" id="fp-reset-x" aria-label="Close · Cerrar">' + FP.icon('close_small') + '</button>' +
        '<div id="fp-view-forgot" class="fp-reset__view" style="display:none;">' +
          '<h2 class="fp-modal__title" id="fp-reset-title">' + bi('Reset your password', 'Restablece tu contraseña') + '</h2>' +
          '<p class="fp-reset__sub">' + bi("Enter your email and we'll send you a link to set a new password.", 'Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.') + '</p>' +
          '<div class="fp-field"><label class="fp-label" for="fp-reset-email">' + bi('Email', 'Correo electrónico') + '</label>' +
          '<input class="fp-input" type="email" id="fp-reset-email" placeholder="you@example.com" autocomplete="username" autocapitalize="none" spellcheck="false"></div>' +
          '<div id="fp-reset-msg" class="fp-hidden" role="status"></div>' +
          '<button type="button" class="fp-btn fp-btn--primary fp-btn--block" id="fp-reset-send">' + bi('Send reset link', 'Enviar enlace') + '</button>' +
          '<button type="button" class="fp-btn fp-btn--text" id="fp-reset-cancel">' + bi('Back to log in', 'Volver a iniciar sesión') + '</button>' +
        '</div>' +
        '<div id="fp-view-set" class="fp-reset__view" style="display:none;">' +
          '<h2 class="fp-modal__title">' + bi('Set a new password', 'Crea una contraseña nueva') + '</h2>' +
          '<p class="fp-reset__sub">' + bi('Choose a new password for your account.', 'Elige una contraseña nueva para tu cuenta.') + '</p>' +
          '<div class="fp-field"><label class="fp-label" for="fp-reset-pw">' + bi('New password (at least 6 characters)', 'Contraseña nueva (mínimo 6 caracteres)') + '</label>' +
          '<input class="fp-input" type="password" id="fp-reset-pw" autocomplete="new-password"></div>' +
          '<div class="fp-field"><label class="fp-label" for="fp-reset-pw2">' + bi('Confirm new password', 'Confirma la contraseña nueva') + '</label>' +
          '<input class="fp-input" type="password" id="fp-reset-pw2" autocomplete="new-password"></div>' +
          '<div id="fp-reset-msg2" class="fp-hidden" role="alert"></div>' +
          '<button type="button" class="fp-btn fp-btn--primary fp-btn--block" id="fp-reset-save">' + bi('Save new password', 'Guardar contraseña nueva') + '</button>' +
          '<button type="button" class="fp-btn fp-btn--text" id="fp-reset-cancel2">' + bi('Cancel', 'Cancelar') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    el('fp-reset-send').addEventListener('click', submitForgot);
    el('fp-reset-save').addEventListener('click', submitReset);
    el('fp-reset-cancel').addEventListener('click', hide);
    el('fp-reset-cancel2').addEventListener('click', hide);
    el('fp-reset-x').addEventListener('click', hide);
    modal.addEventListener('keydown', onKeydown);
  }

  /** Escape closes; Tab stays inside the dialog. */
  function onKeydown(e) {
    if (e.key === 'Escape') { hide(); return; }
    if (e.key !== 'Tab') return;
    var items = el('fp-reset-modal').querySelectorAll('button, input, a[href]');
    var vis = Array.prototype.filter.call(items, function (n) { return n.offsetParent !== null && !n.disabled; });
    if (!vis.length) return;
    var first = vis[0], last = vis[vis.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function show(view) {
    injectModal();
    opener = document.activeElement;
    el('fp-view-forgot').style.display = view === 'forgot' ? 'block' : 'none';
    el('fp-view-set').style.display = view === 'set' ? 'block' : 'none';
    el('fp-reset-modal').classList.add('is-open');
    var focusTarget = el(view === 'forgot' ? 'fp-reset-email' : 'fp-reset-pw');
    if (focusTarget) focusTarget.focus();
  }
  function hide() {
    var m = el('fp-reset-modal');
    if (m) m.classList.remove('is-open');
    if (opener && opener.focus) { try { opener.focus(); } catch (e) { /* ignore */ } }
  }

  async function submitForgot() {
    var email = (el('fp-reset-email').value || '').trim();
    setMsg('fp-reset-msg', '');
    if (!email) { setMsg('fp-reset-msg', bi('Please enter your email.', 'Escribe tu correo.'), 'error'); return; }
    var btn = el('fp-reset-send'), label = btn.innerHTML;
    btn.disabled = true; btn.classList.add('is-loading'); btn.innerHTML = bi('Sending…', 'Enviando…');
    try {
      await FP.api.postRead(FP.WEBHOOK_URL + '?action=request_reset', { email: email });
      // Generic by design: never reveals whether the email exists.
      setMsg('fp-reset-msg', bi('If an account exists for that email, a reset link is on its way. Check your inbox (and spam).',
        'Si existe una cuenta con ese correo, te enviamos un enlace. Revisa tu bandeja de entrada (y el spam).'), 'success');
    } catch (e) {
      setMsg('fp-reset-msg', bi('Could not send the reset link. Please try again.', 'No pudimos enviar el enlace. Inténtalo de nuevo.'), 'error');
    } finally {
      btn.disabled = false; btn.classList.remove('is-loading'); btn.innerHTML = label;
    }
  }

  async function submitReset() {
    var pw = el('fp-reset-pw').value || '';
    var pw2 = el('fp-reset-pw2').value || '';
    setMsg('fp-reset-msg2', '');
    if (pw.length < 6) { setMsg('fp-reset-msg2', bi('Password must be at least 6 characters.', 'La contraseña debe tener al menos 6 caracteres.'), 'error'); return; }
    if (pw !== pw2) { setMsg('fp-reset-msg2', bi('Passwords do not match.', 'Las contraseñas no coinciden.'), 'error'); return; }
    var btn = el('fp-reset-save'), label = btn.innerHTML;
    btn.disabled = true; btn.classList.add('is-loading'); btn.innerHTML = bi('Saving…', 'Guardando…');
    try {
      // 'reset_token', not 'token': api.js reserves 'token' for the app token.
      var res = await FP.api.postRead(FP.WEBHOOK_URL + '?action=reset_password', { reset_token: resetToken, password: pw });
      if (res && res.ok) {
        if (FP.clearSession) FP.clearSession(); // any old session was revoked server-side
        el('fp-view-set').innerHTML =
          '<h2 class="fp-modal__title">' + bi('Password updated', 'Contraseña actualizada') + '</h2>' +
          '<p class="fp-reset__sub">' + bi('Your password has been changed. You can now log in with it.', 'Cambiamos tu contraseña. Ya puedes iniciar sesión con ella.') + '</p>' +
          '<button type="button" class="fp-btn fp-btn--primary fp-btn--block" id="fp-reset-done">' + bi('Log in', 'Iniciar sesión') + '</button>';
        el('fp-reset-done').addEventListener('click', hide);
        el('fp-reset-done').focus();
      } else {
        var known = res && SERVER[res.error];
        setMsg('fp-reset-msg2', known ? bi(known[0], known[1])
          : bi('Could not reset your password. The link may have expired.', 'No pudimos cambiar tu contraseña. Es posible que el enlace haya vencido.'), 'error');
      }
    } catch (e) {
      setMsg('fp-reset-msg2', bi('Could not reach the server. Please try again.', 'No pudimos conectarnos con el servidor. Inténtalo de nuevo.'), 'error');
    } finally {
      if (btn && btn.isConnected) { btn.disabled = false; btn.classList.remove('is-loading'); btn.innerHTML = label; }
    }
  }

  FP.passwordReset = {
    openForgot: function () { setMsg('fp-reset-msg', ''); show('forgot'); },
  };

  // Auto-init: an email link lands at <site>/?reset=TOKEN.
  function init() {
    var token = new URLSearchParams(location.search).get('reset');
    if (!token) return;
    resetToken = token;
    show('set');
    // Strip the token from the URL so it isn't bookmarked or leaked via history.
    try { window.history.replaceState({}, '', location.pathname); } catch (e) { /* ignore */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ═══════════════════════════════════════════════════════════════
   FluentPath — UI helpers: toasts and banners built from the
   component classes in components.css (no style.cssText anywhere).
   ─────────────────────────────────────────────────────────────
   FP.ui.toast('Saved', { variant: 'success' })
   FP.ui.banner({ id, variant, position, html, actions })
   Variants: info | success | warning | error | offline.
   Every variant pairs its colour with an icon and words (never colour alone).
   Load after config.js, utils.js and icons.js.
   ═══════════════════════════════════════════════════════════════ */

var FP = window.FP || {};

FP.ui = (function () {
  var ICON = { info: 'lightbulb', success: 'check', warning: 'warning', error: 'warning', offline: 'warning' };
  var MIN_TOAST_MS = 6000; // spec: toasts last at least 6 seconds and can be dismissed

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function iconFor(variant) {
    return FP.icon ? FP.icon(ICON[variant] || ICON.info, { className: 'fp-banner__icon' }) : '';
  }

  function closeButton(onClose) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'fp-banner__close';
    b.setAttribute('aria-label', 'Dismiss');
    b.innerHTML = FP.icon ? FP.icon('close_small') : '&times;';
    b.addEventListener('click', onClose);
    return b;
  }

  function region() {
    var r = document.getElementById('fp-toast-region');
    if (!r) {
      r = document.createElement('div');
      r.id = 'fp-toast-region';
      r.className = 'fp-toast-region';
      document.body.appendChild(r);
    }
    return r;
  }

  /**
   * Show a toast. `message` is plain text unless opts.html is true (then the caller
   * has already escaped it). Returns the element.
   */
  function toast(message, opts) {
    opts = opts || {};
    var variant = opts.variant || 'info';
    var el = document.createElement('div');
    el.className = 'fp-toast fp-banner fp-banner--' + variant;
    el.setAttribute('role', variant === 'error' ? 'alert' : 'status');
    el.innerHTML = (opts.iconHtml !== undefined ? opts.iconHtml : iconFor(variant)) +
      '<div class="fp-banner__body">' + (opts.html ? message : esc(message)) + '</div>';
    var gone = false;
    function remove() {
      if (gone) return;
      gone = true;
      el.classList.add('is-leaving');
      setTimeout(function () { el.remove(); }, 400);
    }
    el.appendChild(closeButton(remove));
    region().appendChild(el);
    setTimeout(remove, Math.max(opts.duration || 0, MIN_TOAST_MS));
    return el;
  }

  /**
   * Create or replace a banner with a stable id.
   * opts: { id, variant, position: 'top'|'bottom'|'below-header'|undefined (in flow),
   *         html (trusted/escaped), actions: [{ label, onclick (function), className }] }
   */
  function banner(opts) {
    var id = opts.id;
    var el = id && document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      if (id) el.id = id;
      document.body.appendChild(el);
    }
    var variant = opts.variant || 'info';
    el.className = 'fp-banner fp-banner--' + variant +
      (opts.position ? ' fp-banner--' + opts.position : '');
    el.setAttribute('role', variant === 'error' ? 'alert' : 'status');
    el.innerHTML = iconFor(variant) + '<div class="fp-banner__body">' + (opts.html || '') + '</div>';
    if (opts.actions && opts.actions.length) {
      var box = document.createElement('div');
      box.className = 'fp-banner__actions';
      opts.actions.forEach(function (a) {
        var btn = document.createElement(a.href ? 'a' : 'button');
        if (a.href) { btn.href = a.href; btn.target = '_blank'; btn.rel = 'noopener'; } else { btn.type = 'button'; }
        btn.className = 'fp-btn fp-btn--secondary ' + (a.className || '');
        btn.textContent = a.label;
        if (a.onclick) btn.addEventListener('click', a.onclick);
        box.appendChild(btn);
      });
      el.appendChild(box);
    }
    el.classList.remove('fp-hidden');
    return el;
  }

  function removeBanner(id) {
    var el = document.getElementById(id);
    if (el) el.remove();
  }

  /** English with its Spanish line underneath. Both arguments are plain text (escaped here). */
  function bi(en, es) {
    return '<span class="fp-bi">' + esc(en) + '<span class="fp-bi__es" lang="es">' + esc(es) + '</span></span>';
  }

  /** "1 de octubre de 2026" / short "1 oct" for a YYYY-MM-DD or ISO string. */
  function dateEs(dateStr, style) {
    if (!dateStr) return '';
    try {
      var str = String(dateStr);
      var d = new Date(str.length > 10 ? str : str + 'T00:00:00');
      if (isNaN(d.getTime())) return str;
      return style === 'short'
        ? d.toLocaleDateString('es', { day: 'numeric', month: 'short' })
        : d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return String(dateStr); }
  }

  return { toast: toast, banner: banner, removeBanner: removeBanner, bi: bi, dateEs: dateEs, esc: esc };
})();

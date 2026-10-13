/* ═══════════════════════════════════════════════════════════════
   FluentPath — Student settings screen (app.html)
   ─────────────────────────────────────────────────────────────
   "What do you want to practise?": the student picks topics and an optional note and
   sends them to the teacher (POST request_focus). The teacher approves or declines;
   only approved topics steer future lessons. The password card is wired in hub.js.
   ═══════════════════════════════════════════════════════════════ */
/* global showScreen */ // from hub.js
(function () {
  var FP = window.FP;
  var bi = FP.ui.bi;

  // ids must match FOCUS_TOPICS in apps-script.js (tests check this)
  var TOPICS = [
    { id: 'work', en: 'Work and jobs', es: 'Trabajo y empleo' },
    { id: 'interviews', en: 'Job interviews', es: 'Entrevistas de trabajo' },
    { id: 'health', en: 'Health and doctor visits', es: 'Salud y visitas al médico' },
    { id: 'shopping', en: 'Shopping and money', es: 'Compras y dinero' },
    { id: 'housing', en: 'Renting and housing', es: 'Alquiler y vivienda' },
    { id: 'transport', en: 'Travel and transport', es: 'Viajes y transporte' },
    { id: 'school', en: 'School and children', es: 'Escuela y niños' },
    { id: 'phone', en: 'Phone calls', es: 'Llamadas telefónicas' },
    { id: 'smalltalk', en: 'Small talk and neighbours', es: 'Conversación y vecinos' },
    { id: 'paperwork', en: 'Government and paperwork', es: 'Trámites y documentos' },
    { id: 'pronunciation', en: 'Pronunciation', es: 'Pronunciación' },
    { id: 'grammar', en: 'Grammar', es: 'Gramática' },
  ];
  var MAX = 5;
  var selected = {};

  function el(id) {
    return document.getElementById(id);
  }
  function count() {
    return Object.keys(selected).length;
  }

  function renderChips() {
    var box = el('focusChips');
    box.innerHTML = TOPICS.map(function (t) {
      var on = !!selected[t.id];
      return (
        '<button type="button" class="focus-chip' +
        (on ? ' is-selected' : '') +
        '" data-topic="' +
        t.id +
        '" aria-pressed="' +
        on +
        '">' +
        (on ? FP.icon('check', { size: 'sm' }) : '') +
        bi(t.en, t.es) +
        '</button>'
      );
    }).join('');
  }

  function msg(html, kind) {
    var m = el('focusMsg');
    if (!html) {
      m.className = 'fp-hidden';
      m.innerHTML = '';
      return;
    }
    m.className = kind === 'success' ? 'fp-banner fp-banner--success' : 'fp-field-error';
    m.innerHTML =
      FP.icon(kind === 'success' ? 'check' : 'warning', {
        size: 'sm',
        className: kind === 'success' ? 'fp-banner__icon' : '',
      }) +
      '<span>' +
      html +
      '</span>';
  }

  /** What happened to the last request, in words and an icon. */
  function renderStatus(r) {
    var box = el('focusStatus');
    if (!r || !r.found) {
      box.innerHTML = '';
      return;
    }
    var map = {
      pending: [
        'info',
        'lightbulb',
        'Sent. Your teacher has not looked at it yet.',
        'Enviado. Tu profesor todavía no lo ha revisado.',
      ],
      approved: [
        'success',
        'check',
        'Your teacher said yes. Your next lessons will use these topics.',
        'Tu profesor dijo que sí. Tus próximas lecciones usarán estos temas.',
      ],
      declined: [
        'warning',
        'warning',
        'Your teacher is not using this request for now. You can send a different one.',
        'Tu profesor no usará esta solicitud por ahora. Puedes enviar otra distinta.',
      ],
    }[r.status];
    if (!map) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML =
      '<div class="fp-banner fp-banner--' +
      map[0] +
      '" role="status">' +
      FP.icon(map[1], { className: 'fp-banner__icon' }) +
      '<div class="fp-banner__body">' +
      bi(map[2], map[3]) +
      '</div></div>';
  }

  function applyRequest(r) {
    selected = {};
    if (r && r.found) {
      (r.topics || []).forEach(function (id) {
        selected[id] = true;
      });
      el('focusNote').value = r.note || '';
    }
    updateCount();
    renderChips();
    renderStatus(r);
  }

  function updateCount() {
    var n = el('focusNote').value.length;
    el('focusCount').textContent = n + ' / 200';
  }

  function load() {
    msg('');
    var name = localStorage.getItem('fp_student_name') || '';
    if (!name) return;
    FP.api
      .get(FP.WEBHOOK_URL + '?action=get_my_focus&student=' + encodeURIComponent(name))
      .then(function (r) {
        if (r && !r.error) applyRequest(r);
      })
      .catch(function () {
        /* offline: the form still works once the connection is back */
      });
  }

  function open() {
    renderChips();
    updateCount();
    showScreen('screen-settings');
    load();
    el('settingsBackBtn').focus({ preventScroll: true });
  }

  function send() {
    msg('');
    if (!count() && !el('focusNote').value.trim()) {
      msg(bi('Choose a topic or write a note first.', 'Primero elige un tema o escribe una nota.'), 'error');
      return;
    }
    var btn = el('focusSend');
    var label = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.innerHTML = bi('Sending…', 'Enviando…');
    FP.api
      .postRead(FP.WEBHOOK_URL + '?action=request_focus', {
        topics: JSON.stringify(Object.keys(selected)),
        note: el('focusNote').value,
        student_name: localStorage.getItem('fp_student_name') || '',
      })
      .then(function (res) {
        if (res && res.result === 'success') {
          renderStatus({ found: true, status: 'pending' });
          msg(bi('Sent to your teacher. Thank you!', '¡Enviado a tu profesor! ¡Gracias!'), 'success');
        } else {
          var raw = (res && (res.message || res.error)) || '';
          msg(
            /Too many/.test(raw)
              ? bi('Too many requests. Please try again later.', 'Demasiadas solicitudes. Inténtalo más tarde.')
              : bi('Could not send. Please try again.', 'No se pudo enviar. Inténtalo de nuevo.'),
            'error'
          );
        }
      })
      .catch(function () {
        msg(
          bi(
            'Could not reach the server. Please try again.',
            'No pudimos conectarnos con el servidor. Inténtalo de nuevo.'
          ),
          'error'
        );
      })
      .then(function () {
        btn.disabled = false;
        btn.classList.remove('is-loading');
        btn.innerHTML = label;
      });
  }

  function init() {
    el('settingsBtn').addEventListener('click', open);
    el('settingsBackBtn').addEventListener('click', function () {
      showScreen('screen-dashboard');
    });
    el('focusSend').addEventListener('click', send);
    el('focusNote').addEventListener('input', updateCount);
    el('focusChips').addEventListener('click', function (e) {
      var b = e.target.closest('.focus-chip');
      if (!b) return;
      var id = b.getAttribute('data-topic');
      if (selected[id]) delete selected[id];
      else if (count() >= MAX) {
        msg(
          bi(
            'You can choose up to 5 topics. Tap one to remove it.',
            'Puedes elegir hasta 5 temas. Toca uno para quitarlo.'
          ),
          'error'
        );
        return;
      } else selected[id] = true;
      msg('');
      renderChips();
      var again = el('focusChips').querySelector('[data-topic="' + id + '"]');
      if (again) again.focus();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  FP.hubSettings = { TOPICS: TOPICS };
})();

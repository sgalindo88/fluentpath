/* ═══════════════════════════════════════════════════════════════
   English Path — Internationalisation & UX Helper
   ─────────────────────────────────────────────────────────────
   Self-contained: injects its own CSS, builds a language selector,
   and translates UI chrome (buttons, headings, instructions).

   Supported languages:  en (default), es (Spanish)
   Adding a language:    add a key to TRANSLATIONS and LANG_META.

   Include AFTER the page's own scripts:
     <script src="i18n.js"></script>
   ═══════════════════════════════════════════════════════════════ */

const I18n = (() => {
  'use strict';

  /* ── Language metadata ──────────────────────────────────── */
  const LANG_META = {
    en: { label: 'English', flag: '🇬🇧' },
    es: { label: 'Español', flag: '🇪🇸' },
  };

  const LS_KEY = 'ep_lang';
  let currentLang = 'en';

  /* ── Visual cues — section icons ────────────────────────── */
  const SECTION_ICONS = {
    'Reading':    '📖',
    'Writing':    '✍️',
    'Listening':  '🎧',
    'Speaking':   '🗣️',
    'Warm-Up':    '☀️',
    'Vocabulary':  '📝',
    'Listening Comprehension': '🎧',
    'Practice':   '💪',
    'Review':     '📋',
    'Pronunciation': '🎤',
  };

  /* ═════════════════════════════════════════════════════════
     SPANISH TRANSLATIONS
     ═════════════════════════════════════════════════════════ */
  const TRANSLATIONS = { es: {

    /* ── Buttons / CTAs ─────────────────────────────────── */
    'Continue':                     'Continuar',
    'Continue →':                   'Continuar →',
    'Refresh':                      'Actualizar',
    'Take the Placement Test':      'Hacer la Prueba de Nivel',
    'Begin Test →':                 'Comenzar Prueba →',
    'Begin Today\'s Lesson →':      'Comenzar la Lección de Hoy →',
    'Start Next Lesson →':          'Comenzar la Siguiente Lección →',
    '← Back':                       '← Atrás',
    'Start Reading →':              'Comenzar Lectura →',
    'Continue to Writing →':        'Continuar a Escritura →',
    'Start Writing →':              'Comenzar Escritura →',
    'Continue to Listening →':      'Continuar a Comprensión Auditiva →',
    'Start Listening →':            'Comenzar Comprensión Auditiva →',
    'Continue to Speaking →':       'Continuar a Expresión Oral →',
    'Start Speaking →':             'Comenzar Expresión Oral →',
    'Finish Lesson ✓':              'Terminar Lección ✓',
    'Submit Test':                  'Enviar Prueba',

    /* ── Hub page ───────────────────────────────────────── */
    'Your journey to fluency starts here.':
      'Tu camino hacia la fluidez comienza aquí.',
    'Your Name':                    'Tu Nombre',
    'Enter your full name':         'Escribe tu nombre completo',
    'Use the same name your teacher has on file.':
      'Usa el mismo nombre que tu profesor tiene registrado.',
    'Here is your learning journey.':
      'Este es tu recorrido de aprendizaje.',
    'Not you? Switch student':      '¿No eres tú? Cambiar estudiante',
    'Phase One':                    'Fase Uno',
    'Phase Two':                    'Fase Dos',
    'Placement Test':               'Prueba de Nivel',
    'Your Level':                   'Tu Nivel',
    'Your Course':                  'Tu Curso',
    'Take the English proficiency test so your teacher can find the right level for you.':
      'Haz la prueba de inglés para que tu profesor encuentre el nivel adecuado para ti.',
    'After your teacher reviews the test, you will be assigned a level.':
      'Después de que tu profesor revise la prueba, se te asignará un nivel.',
    'A 20-day personalised course with daily lessons tailored to your level.':
      'Un curso personalizado de 20 días con lecciones diarias adaptadas a tu nivel.',
    'Your first step is the placement test. It takes about 40 minutes.':
      'Tu primer paso es la prueba de nivel. Toma unos 40 minutos.',
    'Your teacher will review your test soon. Check back later.':
      'Tu profesor revisará tu prueba pronto. Vuelve más tarde.',
    'You have completed the English Path course. Talk to your teacher about next steps.':
      'Has completado el curso English Path. Habla con tu profesor sobre los próximos pasos.',
    'Let\'s begin with your placement test.':
      'Comencemos con tu prueba de nivel.',
    'Your test is being reviewed by your teacher.':
      'Tu profesor está revisando tu prueba.',
    'You\'re ready to start your course!':
      '¡Estás listo para comenzar tu curso!',
    'Congratulations — you\'ve completed the course!':
      '¡Felicidades — has completado el curso!',
    'Looking up your progress…':
      'Buscando tu progreso…',
    'Completed':                    'Completado',
    'Awaiting review':              'Esperando revisión',
    'Complete':                     'Completo',

    /* ── Test page ──────────────────────────────────────── */
    'English Proficiency Test':     'Prueba de Nivel de Inglés',
    'A comprehensive assessment of speaking, writing, listening and reading skills':
      'Una evaluación completa de las habilidades de habla, escritura, comprensión auditiva y lectura',
    'Full name *':                  'Nombre completo *',
    'Date':                         'Fecha',
    'Part 01':                      'Parte 01',
    'Part 02':                      'Parte 02',
    'Part 03':                      'Parte 03',
    'Part 04':                      'Parte 04',
    'Reading':                      'Lectura',
    'Writing':                      'Escritura',
    'Listening':                    'Comprensión Auditiva',
    'Speaking':                     'Expresión Oral',
    'General Placement':            'Nivel General',
    'You will read a short passage and answer comprehension questions, followed by vocabulary and grammar questions.':
      'Leerás un texto corto y responderás preguntas de comprensión, seguidas de preguntas de vocabulario y gramática.',
    'You will complete sentence transformation tasks and write a short text of 120–150 words.':
      'Completarás tareas de transformación de oraciones y escribirás un texto corto de 120–150 palabras.',
    'Press play to listen to the audio recording, then answer the comprehension questions below. You may play the audio up to 3 times.':
      'Presiona play para escuchar la grabación, luego responde las preguntas de comprensión. Puedes reproducirlo hasta 3 veces.',
    'Read this passage carefully, then answer the questions below.':
      'Lee este texto con cuidado, luego responde las preguntas.',
    'Choose the best answer:':      'Elige la mejor respuesta:',
    'Write your response here…':    'Escribe tu respuesta aquí…',
    '✓ Correct!':                   '✓ ¡Correcto!',

    /* ── Course page ────────────────────────────────────── */
    'Your Path to Better English':  'Tu Camino hacia un Mejor Inglés',
    'CEFR English Course':          'Curso de Inglés CEFR',
    'Your Journey to Fluency':      'Tu Camino hacia la Fluidez',
    'Step-by-step daily lessons built for busy adults. Vocabulary, pronunciation, speaking — at your pace, on your schedule.':
      'Lecciones diarias paso a paso diseñadas para adultos ocupados. Vocabulario, pronunciación, conversación — a tu ritmo, en tu horario.',
    'Select your level below. If you are not sure, ask your teacher.':
      'Selecciona tu nivel. Si no estás seguro, pregúntale a tu profesor.',
    'Your Full Name':               'Tu Nombre Completo',
    'Today\'s Date':                'Fecha de Hoy',
    'e.g. Maria Gonzalez':          'ej. María González',
    'Waiting for Approval':         'Esperando Aprobación',
    'Your lesson has been sent to your teacher for review. Please wait — this usually takes just a few minutes.':
      'Tu lección ha sido enviada a tu profesor para revisión. Por favor espera — normalmente toma solo unos minutos.',
    'Your lesson must be approved by your teacher before it starts.':
      'Tu lección debe ser aprobada por tu profesor antes de comenzar.',
    'You can leave this page open. It will start automatically when approved.':
      'Puedes dejar esta página abierta. Comenzará automáticamente cuando sea aprobada.',
    'Loading your personalised lesson…':
      'Cargando tu lección personalizada…',
    'Checking for approval…':       'Verificando aprobación…',
    'Demo mode — starting automatically…':
      'Modo demostración — comenzando automáticamente…',
    'Lesson Complete!':             '¡Lección Completada!',
    'Great work today. You\'ve finished all the activities. Your progress has been saved.':
      'Excelente trabajo hoy. Has terminado todas las actividades. Tu progreso ha sido guardado.',
    'Time Spent':                   'Tiempo',
    'Activities Done':              'Actividades',
    'Day of Month':                 'Día del Mes',
    '✓ Progress saved to your record.':
      '✓ Progreso guardado en tu registro.',
    'Demo mode — progress not saved to sheet (no webhook configured).':
      'Modo demostración — progreso no guardado (sin conexión configurada).',

    /* ── Activity labels ────────────────────────────────── */
    'WARM-UP':                      'CALENTAMIENTO',
    'VOCABULARY':                   'VOCABULARIO',
    'LISTENING COMPREHENSION':      'COMPRENSIÓN AUDITIVA',
    'PRACTICE':                     'PRÁCTICA',
    'REVIEW':                       'REPASO',
    'TODAY\'S OBJECTIVE':           'OBJETIVO DE HOY',
    'COMPREHENSION QUESTIONS':      'PREGUNTAS DE COMPRENSIÓN',
    'Answer what you heard':        'Responde lo que escuchaste',
    'AUDIO':                        'AUDIO',
    'Press play — up to 3 times':   'Presiona play — hasta 3 veces',
    'Hear model':                   'Escuchar modelo',
    'Record yourself':              'Grabarte',
    'DRILL · PRONUNCIATION':        'EJERCICIO · PRONUNCIACIÓN',
    'FREE SPEAKING TASK':           'TAREA DE CONVERSACIÓN LIBRE',
    'THINK ABOUT THIS':             'PIENSA EN ESTO',
    'PRACTICE WITH THESE WORDS':    'PRACTICA CON ESTAS PALABRAS',
    'Tap to see meaning':           'Toca para ver el significado',
    '🔊 Hear it':                   '🔊 Escuchar',
    'No plays left':                'No quedan reproducciones',
    'Speech recognition is not available in this browser. Please use Chrome.':
      'El reconocimiento de voz no está disponible en este navegador. Por favor usa Chrome.',

    /* ── Level names ────────────────────────────────────── */
    'Beginner':                     'Principiante',
    'Elementary':                   'Elemental',
    'Intermediate':                 'Intermedio',
    'Upper-Intermediate':           'Intermedio Alto',
    'Advanced':                     'Avanzado',
    'Proficiency':                  'Dominio',
    'Everyday Survival':            'Vida Cotidiana',
    'Community & Life':             'Comunidad y Vida',
    'The Workplace':                'El Trabajo',
    'Career & Society':             'Carrera y Sociedad',
    'Professional Mastery':         'Dominio Profesional',
    'Full Fluency':                 'Fluidez Total',

    /* ── Confidence buttons ─────────────────────────────── */
    'Hard':                         'Difícil',
    'OK':                           'OK',
    'Good':                         'Bien',
    'Great!':                       '¡Excelente!',

  }};

  /* ═════════════════════════════════════════════════════════
     CSS — injected once
     ═════════════════════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('i18n-styles')) return;
    const s = document.createElement('style');
    s.id = 'i18n-styles';
    s.textContent = `
      /* ── Translation hint (shown below English text) ── */
      .i18n-hint {
        display: block;
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 0.78em;
        font-weight: 300;
        font-style: italic;
        color: var(--muted, #6b5f4e);
        margin-top: 2px;
        line-height: 1.4;
        pointer-events: none;
      }
      /* Inside buttons: tighter, lighter */
      button .i18n-hint,
      a .i18n-hint,
      .btn-cta .i18n-hint,
      .btn-enter .i18n-hint {
        font-size: 0.72em;
        margin-top: 3px;
        opacity: 0.8;
        color: inherit;
      }
      /* Inside dark buttons, keep readable */
      .btn-nav.primary .i18n-hint,
      .btn-next .i18n-hint,
      .btn-start .i18n-hint,
      .btn-begin .i18n-hint,
      .btn-enter .i18n-hint,
      .btn-cta:not(.secondary) .i18n-hint {
        opacity: 0.7;
      }
      /* Uppercase labels */
      .i18n-hint-upper {
        text-transform: uppercase;
        letter-spacing: 0.15em;
        font-style: normal;
      }

      /* ── Section icon (prepended to headings) ── */
      .i18n-icon {
        margin-right: 6px;
        font-style: normal;
      }

      /* ── Language selector widget ── */
      .i18n-selector {
        position: fixed;
        top: 58px;
        right: 12px;
        z-index: 300;
        display: flex;
        gap: 2px;
        background: var(--cream, #ede8dc);
        border: 1px solid var(--rule, #c8bfa8);
        border-radius: 20px;
        padding: 3px;
        box-shadow: 0 2px 8px rgba(26,18,8,0.1);
        font-family: 'Source Serif 4', Georgia, serif;
      }
      .i18n-lang-btn {
        padding: 5px 12px;
        border: none;
        background: transparent;
        cursor: pointer;
        font-size: 12px;
        font-family: inherit;
        border-radius: 16px;
        color: var(--muted, #6b5f4e);
        transition: all 0.2s;
        white-space: nowrap;
      }
      .i18n-lang-btn:hover {
        background: rgba(26,18,8,0.05);
      }
      .i18n-lang-btn.active {
        background: var(--ink, #1a1208);
        color: var(--paper, #f5f0e8);
        font-weight: 600;
      }

      /* ── Hub welcome: prominent selector ── */
      .i18n-welcome-selector {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin: 24px 0 8px;
      }
      .i18n-welcome-btn {
        padding: 8px 18px;
        border: 1.5px solid var(--rule, #c8bfa8);
        background: transparent;
        cursor: pointer;
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 14px;
        border-radius: 24px;
        color: var(--ink, #1a1208);
        transition: all 0.2s;
      }
      .i18n-welcome-btn:hover {
        border-color: var(--ink, #1a1208);
      }
      .i18n-welcome-btn.active {
        background: var(--ink, #1a1208);
        color: var(--paper, #f5f0e8);
        border-color: var(--ink, #1a1208);
      }

      /* ── Hide selector on very small heights ── */
      @media (max-width: 600px) {
        .i18n-selector { top: 50px; right: 8px; padding: 2px; }
        .i18n-lang-btn { padding: 4px 10px; font-size: 11px; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ═════════════════════════════════════════════════════════
     Language selector widgets
     ═════════════════════════════════════════════════════════ */
  function buildFloatingSelector() {
    if (document.querySelector('.i18n-selector')) return;
    const wrap = document.createElement('div');
    wrap.className = 'i18n-selector';
    Object.entries(LANG_META).forEach(([code, meta]) => {
      const btn = document.createElement('button');
      btn.className = 'i18n-lang-btn' + (code === currentLang ? ' active' : '');
      btn.textContent = meta.flag + ' ' + meta.label;
      btn.onclick = () => setLang(code);
      wrap.appendChild(btn);
    });
    document.body.appendChild(wrap);
  }

  function buildWelcomeSelector() {
    const target = document.querySelector('.welcome-divider');
    if (!target || document.querySelector('.i18n-welcome-selector')) return;
    const wrap = document.createElement('div');
    wrap.className = 'i18n-welcome-selector';
    Object.entries(LANG_META).forEach(([code, meta]) => {
      const btn = document.createElement('button');
      btn.className = 'i18n-welcome-btn' + (code === currentLang ? ' active' : '');
      btn.textContent = meta.flag + ' ' + meta.label;
      btn.onclick = () => setLang(code);
      wrap.appendChild(btn);
    });
    target.insertAdjacentElement('afterend', wrap);
  }

  function updateSelectorUI() {
    document.querySelectorAll('.i18n-lang-btn, .i18n-welcome-btn').forEach(btn => {
      const isActive = btn.textContent.includes(LANG_META[currentLang].label);
      btn.classList.toggle('active', isActive);
    });
  }

  /* ═════════════════════════════════════════════════════════
     Translation engine
     ═════════════════════════════════════════════════════════ */

  function getDict() {
    return TRANSLATIONS[currentLang] || null;
  }

  /** Remove all translation hints from the page */
  function clearHints() {
    document.querySelectorAll('.i18n-hint, .i18n-icon').forEach(el => el.remove());
    // Restore original placeholders
    document.querySelectorAll('[data-i18n-original-ph]').forEach(el => {
      el.placeholder = el.dataset.i18nOriginalPh;
      delete el.dataset.i18nOriginalPh;
    });
  }

  /** Look up a translation, trying exact match then trimmed */
  function t(text) {
    const dict = getDict();
    if (!dict) return null;
    const trimmed = text.trim();
    return dict[trimmed] || dict[trimmed.replace(/\s+/g, ' ')] || null;
  }

  /** Add a .i18n-hint child to an element */
  function addHint(el, translation, uppercase) {
    if (!translation) return;
    if (el.querySelector('.i18n-hint')) return; // already has one
    const span = document.createElement('span');
    span.className = 'i18n-hint' + (uppercase ? ' i18n-hint-upper' : '');
    span.textContent = translation;
    el.appendChild(span);
  }

  /** Add a section icon before an element's text */
  function addIcon(el, icon) {
    if (!icon) return;
    if (el.querySelector('.i18n-icon')) return;
    const span = document.createElement('span');
    span.className = 'i18n-icon';
    span.textContent = icon;
    span.setAttribute('aria-hidden', 'true');
    el.insertBefore(span, el.firstChild);
  }

  /* ── Translate buttons ──────────────────────────────────── */
  function translateButtons() {
    const selectors = [
      'button', '.btn-cta', '.btn-enter', '.btn-nav',
      '.btn-next', '.btn-back', '.btn-start', '.btn-begin',
    ];
    document.querySelectorAll(selectors.join(',')).forEach(btn => {
      // Get only direct text (not child element text)
      const directText = getDirectText(btn);
      const translation = t(directText);
      if (translation) addHint(btn, translation);
    });
  }

  /* ── Translate headings ─────────────────────────────────── */
  function translateHeadings() {
    document.querySelectorAll('h1, h2, h3, .milestone-title, .dash-greeting').forEach(el => {
      const text = getDirectText(el);
      const translation = t(text);
      if (translation) addHint(el, translation);
    });
  }

  /* ── Translate paragraphs & descriptions ────────────────── */
  function translateParagraphs() {
    const selectors = [
      '.welcome-header p',
      '.login-hint',
      '.milestone-desc',
      '.milestone-label',
      '.cta-section p',
      '.dash-subtitle',
      '.loading-center p',
      '.section-desc',
      '.section-intro p',
      '.intro-desc',
      '.screen p',
      '.activity-card > p',
      '.step-header + p',
    ];
    document.querySelectorAll(selectors.join(',')).forEach(el => {
      const text = el.textContent.trim();
      const translation = t(text);
      if (translation) addHint(el, translation);
    });
  }

  /* ── Translate labels ───────────────────────────────────── */
  function translateLabels() {
    document.querySelectorAll('label, .label, .field-label').forEach(el => {
      const text = getDirectText(el).replace(/\s*\*\s*$/, '');
      const translation = t(text);
      if (translation) addHint(el, translation);
    });
  }

  /* ── Translate uppercase activity labels ─────────────────── */
  function translateActivityLabels() {
    // These are typically in spans/divs with uppercase styling
    const allEls = document.querySelectorAll(
      '.step-label, .activity-label, .section-label, .step-type'
    );
    allEls.forEach(el => {
      const text = el.textContent.trim();
      const translation = t(text);
      if (translation) addHint(el, translation, true);
    });
    // Also scan for uppercase text patterns in any element
    document.querySelectorAll('div, span, p').forEach(el => {
      if (el.children.length > 2) return; // skip containers
      const text = el.textContent.trim();
      if (text === text.toUpperCase() && text.length > 3 && text.length < 40) {
        const translation = t(text);
        if (translation && !el.querySelector('.i18n-hint')) {
          addHint(el, translation, true);
        }
      }
    });
  }

  /* ── Translate placeholders ─────────────────────────────── */
  function translatePlaceholders() {
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
      const original = el.placeholder;
      const translation = t(original);
      if (translation) {
        if (!el.dataset.i18nOriginalPh) {
          el.dataset.i18nOriginalPh = original;
        }
        el.placeholder = translation;
      }
    });
  }

  /* ── Translate status badges ────────────────────────────── */
  function translateBadges() {
    document.querySelectorAll('.badge, .save-status, .status-text').forEach(el => {
      const text = el.textContent.trim();
      const translation = t(text);
      if (translation) addHint(el, translation);
    });
  }

  /* ── Add visual cue icons to section headings ───────────── */
  function addSectionIcons() {
    document.querySelectorAll('h1, h2, h3, .step-title, .section-title').forEach(el => {
      const text = getDirectText(el).trim();
      for (const [keyword, icon] of Object.entries(SECTION_ICONS)) {
        if (text.includes(keyword)) {
          addIcon(el, icon);
          break;
        }
      }
    });
  }

  /* ── Translate level cards ──────────────────────────────── */
  function translateLevelCards() {
    document.querySelectorAll('.level-card, .level-item').forEach(card => {
      card.querySelectorAll('div, span, p').forEach(el => {
        const text = el.textContent.trim();
        const translation = t(text);
        if (translation && !el.querySelector('.i18n-hint') && el.children.length === 0) {
          addHint(el, translation);
        }
      });
    });
  }

  /* ── Translate confidence buttons ───────────────────────── */
  function translateConfidenceButtons() {
    document.querySelectorAll('.conf-btn').forEach(btn => {
      const text = getDirectText(btn).replace(/[😕😐🙂😄]/g, '').trim();
      const translation = t(text);
      if (translation) addHint(btn, translation);
    });
  }

  /* ═════════════════════════════════════════════════════════
     Utilities
     ═════════════════════════════════════════════════════════ */

  /** Get only the direct text of an element (not child elements) */
  function getDirectText(el) {
    let text = '';
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    });
    return text.trim();
  }

  /* ═════════════════════════════════════════════════════════
     Apply / remove translations
     ═════════════════════════════════════════════════════════ */

  function apply() {
    clearHints();
    if (currentLang === 'en') return;
    translateButtons();
    translateHeadings();
    translateParagraphs();
    translateLabels();
    translateActivityLabels();
    translatePlaceholders();
    translateBadges();
    translateLevelCards();
    translateConfidenceButtons();
    addSectionIcons();
  }

  /* ═════════════════════════════════════════════════════════
     MutationObserver — re-translate on dynamic DOM changes
     ═════════════════════════════════════════════════════════ */
  let debounceTimer = null;
  function observeDOM() {
    const observer = new MutationObserver(() => {
      if (currentLang === 'en') return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(apply, 200);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /* ═════════════════════════════════════════════════════════
     Public API
     ═════════════════════════════════════════════════════════ */

  function setLang(lang) {
    if (!LANG_META[lang]) return;
    currentLang = lang;
    localStorage.setItem(LS_KEY, lang);
    updateSelectorUI();
    apply();
  }

  function getLang() {
    return currentLang;
  }

  function init() {
    // Load saved preference
    const saved = localStorage.getItem(LS_KEY);
    if (saved && LANG_META[saved]) currentLang = saved;

    injectCSS();
    buildFloatingSelector();
    buildWelcomeSelector();
    apply();
    observeDOM();
  }

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay to let page scripts run first
    setTimeout(init, 50);
  }

  return { setLang, getLang, apply, init };
})();

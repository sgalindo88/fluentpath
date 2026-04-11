/* ═══════════════════════════════════════════════════════════════
   FluentPath — Level-Aware Translation System
   ─────────────────────────────────────────────────────────────
   Translation mode is determined by the student's CEFR level:

     A1/A2  → spanish-primary : UI in Spanish, English as help text
     B1/B2  → tap-to-translate: UI in English, tap any text for Spanish tooltip
     C1     → teacher-gated   : UI in English, Spanish toggle requires teacher approval
     C2     → english-only    : No translation available
     (test) → tap-to-translate: Default for placement test (level unknown)

   Usage:
     <script src="i18n.js"></script>
     <script>I18n.setLevel('B1');</script>   // or 'A1','test','C2', etc.
   ═══════════════════════════════════════════════════════════════ */

const I18n = (() => {
  'use strict';

  /* ── Mode constants ─────────────────────────────────────── */
  const MODE_SPANISH_PRIMARY = 'spanish-primary';  // A1, A2
  const MODE_TAP_TRANSLATE   = 'tap-to-translate';  // B1, B2, test
  const MODE_TEACHER_GATED   = 'teacher-gated';     // C1
  const MODE_ENGLISH_ONLY    = 'english-only';       // C2

  let mode = null;         // set by setLevel()
  let level = null;
  let teacherApproved = false;  // for C1 gated mode
  let teacherApprovalChecked = false; // skip re-fetch after first check
  let initialized = false;

  /* ── Visual cues — section icons ────────────────────────── */
  const SECTION_ICONS = {
    'Reading':    '📖', 'Lectura':    '📖',
    'Writing':    '✍️', 'Escritura':  '✍️',
    'Listening':  '🎧', 'Comprensión Auditiva': '🎧',
    'Speaking':   '🗣️', 'Expresión Oral': '🗣️',
    'Warm-Up':    '☀️', 'Calentamiento': '☀️',
    'Vocabulary': '📝', 'Vocabulario': '📝',
    'Listening Comprehension': '🎧',
    'Practice':   '💪', 'Práctica': '💪',
    'Review':     '📋', 'Repaso': '📋',
    'Pronunciation': '🎤', 'Pronunciación': '🎤',
  };

  /* ═════════════════════════════════════════════════════════
     SPANISH TRANSLATIONS (English → Spanish)
     ═════════════════════════════════════════════════════════ */
  const ES = {

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
    'You have completed the FluentPath course. Talk to your teacher about next steps.':
      'Has completado el curso FluentPath. Habla con tu profesor sobre los próximos pasos.',
    'Let\'s begin with your placement test.':
      'Comencemos con tu prueba de nivel.',
    'Your test is being reviewed by your teacher.':
      'Tu profesor está revisando tu prueba.',
    'You\'re ready to start your course!':
      '¡Estás listo para comenzar tu curso!',
    'Congratulations — you\'ve completed the course!':
      '¡Felicidades — has completado el curso!',
    'Looking up your progress…':    'Buscando tu progreso…',
    'Completed':                    'Completado',
    'Awaiting review':              'Esperando revisión',
    'Complete':                     'Completo',

    /* ── Test page ──────────────────────────────────────── */
    'FluentPath Placement Test':    'Prueba de Nivel FluentPath',
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
    'FluentPath Course':            'Curso FluentPath',
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

    /* ── Course UI (static strings) ─────────────────────── */
    'Skip this question':           'Saltar esta pregunta',
    'Skip this writing task':       'Saltar esta tarea de escritura',
    'Type your answer here…':       'Escribe tu respuesta aquí…',
    'Write your sentences here…':   'Escribe tus oraciones aquí…',
    'Any notes for your teacher or yourself? What was hard? What was easy?':
      '¿Notas para tu profesor o para ti? ¿Qué fue difícil? ¿Qué fue fácil?',
    'Jot down a few ideas before speaking…':
      'Anota algunas ideas antes de hablar…',
    'WRITING TASK':                 'TAREA DE ESCRITURA',
    'YOUR TASK':                    'TU TAREA',
    'KEY TAKEAWAYS':                'PUNTOS CLAVE',
    'HOW DID YOU FEEL?':            'CÓMO TE SENTISTE?',
    'Step':                         'Paso',
    'of':                           'de',

    /* ── Step structure titles ──────────────────────────── */
    'Let\'s Get Started':           'Comencemos',
    'New Words Today':              'Palabras Nuevas de Hoy',
    'Listen & Understand':          'Escucha y Comprende',
    'PRONUNCIATION':                'PRONUNCIACIÓN',
    'Speak & Be Understood':        'Habla y Hazte Entender',
    'Put It All Together':          'Ponlo Todo Junto',
    'Write It Down':                'Escríbelo',
    'WRITING':                      'ESCRITURA',
    'What Did You Learn?':          'Qué Aprendiste?',
    'What You Learned Today':       'Lo Que Aprendiste Hoy',

    /* ── Vocabulary practice ────────────────────────────── */
    'Use them in sentences':        'Úsalas en oraciones',
    'Choose any 2 of today\'s words and write your own sentence using each one.':
      'Elige 2 de las palabras de hoy y escribe una oración con cada una.',

    /* ── Listening ──────────────────────────────────────── */
    '3 plays left':                 '3 reproducciones restantes',
    'Playing…':                     'Reproduciendo…',
    'Click to listen again':        'Haz clic para escuchar de nuevo',
    'No more plays':                'No más reproducciones',
    'No audio available.':          'No hay audio disponible.',

    /* ── Speaking / recording ───────────────────────────── */
    'FREE SPEAKING':                'CONVERSACIÓN LIBRE',
    'Press to start speaking — aim for 30+ seconds':
      'Presiona para empezar a hablar — intenta 30+ segundos',
    'Recording… speak clearly':     'Grabando… habla con claridad',
    'Recording saved. You can record again if you want.':
      'Grabación guardada. Puedes grabar de nuevo si quieres.',
    'Speech recognition requires Chrome browser.':
      'El reconocimiento de voz requiere el navegador Chrome.',
    '🎤 Record again':              '🎤 Grabar de nuevo',
    '🎤 Try again':                 '🎤 Intentar de nuevo',
    '🎤 Record yourself':           '🎤 Grábate',

    /* ── Speaking feedback ──────────────────────────────── */
    '✓ Great job! Your pronunciation was clear.':
      '✓ ¡Excelente! Tu pronunciación fue clara.',
    '💡 Keep practicing — try again and speak slowly.':
      '💡 Sigue practicando — intenta de nuevo y habla despacio.',

    /* ── Practice / comprehension ───────────────────────── */
    'COMPREHENSION & PRACTICE':     'COMPRENSIÓN Y PRÁCTICA',

    /* ── Writing word count ─────────────────────────────── */
    'words':                        'palabras',
    'aim for':                      'intenta escribir',

    /* ── Review / completion ────────────────────────────── */
    'LESSON REVIEW':                'REPASO DE LA LECCIÓN',
    'How did today go?':            '¿Cómo te fue hoy?',
    'Rate your confidence today and leave yourself a note.':
      'Califica tu confianza hoy y déjate una nota.',
    'Course Day':                   'Día del Curso',
    'Saving your progress…':        'Guardando tu progreso…',
    'Not rated':                    'Sin calificar',
    'View Progress & Next Lesson →': 'Ver Progreso y Siguiente Lección →',
  };

  /* Build reverse dictionary (Spanish → English) for spanish-primary mode */
  const EN_FROM_ES = {};
  Object.entries(ES).forEach(([en, es]) => { EN_FROM_ES[es] = en; });

  /* ═════════════════════════════════════════════════════════
     CSS — injected once
     ═════════════════════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('i18n-styles')) return;
    const s = document.createElement('style');
    s.id = 'i18n-styles';
    s.textContent = `
      /* ── Help text (secondary language shown below primary) ── */
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
      button .i18n-hint, a .i18n-hint,
      .btn-cta .i18n-hint, .btn-enter .i18n-hint {
        font-size: 0.72em; margin-top: 3px; opacity: 0.8; color: inherit;
      }
      .btn-nav.primary .i18n-hint, .btn-next .i18n-hint,
      .btn-start .i18n-hint, .btn-begin .i18n-hint,
      .btn-enter .i18n-hint, .btn-cta:not(.secondary) .i18n-hint {
        opacity: 0.7;
      }
      .i18n-hint-upper {
        text-transform: uppercase; letter-spacing: 0.15em; font-style: normal;
      }

      /* ── Section icon ── */
      .i18n-icon {
        margin-right: 6px; font-style: normal;
      }

      /* ── Tap-to-translate tooltip ── */
      .i18n-tappable {
        cursor: help;
        border-bottom: 1px dotted var(--rule, #c8bfa8);
        transition: border-color 0.2s;
      }
      .i18n-tappable:hover {
        border-bottom-color: var(--rust, #b8471e);
      }
      .i18n-tooltip {
        position: absolute;
        z-index: 9999;
        background: var(--ink, #1a1208);
        color: var(--paper, #f5f0e8);
        padding: 8px 14px;
        border-radius: 6px;
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 13px;
        font-style: italic;
        max-width: 320px;
        line-height: 1.5;
        box-shadow: 0 4px 16px rgba(26,18,8,0.3);
        animation: i18nFadeIn 0.15s ease both;
        pointer-events: none;
      }
      .i18n-tooltip::after {
        content: '';
        position: absolute;
        top: -6px;
        left: 20px;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-bottom: 6px solid var(--ink, #1a1208);
      }
      @keyframes i18nFadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }

      /* ── C1 gated mode: small indicator ── */
      .i18n-c1-toggle {
        position: fixed; top: 58px; right: 12px; z-index: 300;
        display: flex; align-items: center; gap: 6px;
        background: var(--cream, #ede8dc); border: 1px solid var(--rule, #c8bfa8);
        border-radius: 20px; padding: 4px 12px;
        box-shadow: 0 2px 8px rgba(26,18,8,0.1);
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 12px; color: var(--muted, #6b5f4e);
        cursor: pointer; transition: all 0.2s;
      }
      .i18n-c1-toggle:hover { border-color: var(--ink, #1a1208); }
      .i18n-c1-toggle.active {
        background: var(--ink, #1a1208); color: var(--paper, #f5f0e8);
      }
      .i18n-c1-toggle.disabled {
        opacity: 0.35; cursor: not-allowed; pointer-events: none;
      }

      /* ── Mode indicator badge ── */
      .i18n-mode-badge {
        position: fixed; top: 58px; right: 12px; z-index: 300;
        background: var(--cream, #ede8dc); border: 1px solid var(--rule, #c8bfa8);
        border-radius: 20px; padding: 4px 12px;
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 11px; color: var(--muted, #6b5f4e);
        box-shadow: 0 2px 8px rgba(26,18,8,0.1);
      }

      @media (max-width: 600px) {
        .i18n-c1-toggle, .i18n-mode-badge { top: 50px; right: 8px; font-size: 10px; padding: 3px 10px; }
        .i18n-tooltip { max-width: calc(100vw - 32px); font-size: 12px; }
      }
    `;
    document.head.appendChild(s);
  }

  /* ═════════════════════════════════════════════════════════
     Translation lookup
     ═════════════════════════════════════════════════════════ */
  function t(text) {
    const trimmed = (text || '').trim();
    return ES[trimmed] || ES[trimmed.replace(/\s+/g, ' ')] || null;
  }

  function tReverse(text) {
    const trimmed = (text || '').trim();
    return EN_FROM_ES[trimmed] || EN_FROM_ES[trimmed.replace(/\s+/g, ' ')] || null;
  }

  function getDirectText(el) {
    let text = '';
    el.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    });
    return text.trim();
  }

  /* ═════════════════════════════════════════════════════════
     MODE: spanish-primary (A1/A2)
     Show Spanish as the main text, English as small help below
     ═════════════════════════════════════════════════════════ */
  function applySpanishPrimary() {
    // Swap text content to Spanish, add English as hint
    const selectors = [
      'button', '.btn-cta', '.btn-enter', '.btn-nav',
      '.btn-next', '.btn-back', '.btn-start', '.btn-begin',
      'h1', 'h2', 'h3', '.milestone-title', '.dash-greeting',
      'label', '.label', '.field-label',
    ];
    document.querySelectorAll(selectors.join(',')).forEach(el => {
      if (el.dataset.i18nSwapped) return;
      const directText = getDirectText(el);
      const spanish = t(directText);
      if (spanish) {
        // Save original English
        el.dataset.i18nSwapped = 'true';
        el.dataset.i18nOriginal = directText;
        // Replace text node with Spanish
        el.childNodes.forEach(node => {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
            node.textContent = node.textContent.replace(directText, spanish);
          }
        });
        // Add English as help text below
        const hint = document.createElement('span');
        hint.className = 'i18n-hint';
        hint.textContent = directText;
        el.appendChild(hint);
      }
    });

    // Paragraphs and descriptions (including dynamically rendered course content)
    const pSelectors = [
      '.welcome-header p', '.login-hint', '.milestone-desc',
      '.milestone-label', '.cta-section p', '.dash-subtitle',
      '.loading-center p', '.section-desc', '.section-intro p',
      '.intro-desc', '.screen p', '.activity-card > p', '.step-header + p',
      '.ac-heading', '.ac-body', '.ai-status',
    ];
    document.querySelectorAll(pSelectors.join(',')).forEach(el => {
      if (el.dataset.i18nSwapped) return;
      const text = el.textContent.trim();
      const spanish = t(text);
      if (spanish) {
        el.dataset.i18nSwapped = 'true';
        el.dataset.i18nOriginal = text;
        const hint = document.createElement('span');
        hint.className = 'i18n-hint';
        hint.textContent = text;
        el.textContent = spanish;
        el.appendChild(hint);
      }
    });

    // Placeholders
    document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
      const ph = el.placeholder;
      const spanish = t(ph);
      if (spanish && !el.dataset.i18nOriginalPh) {
        el.dataset.i18nOriginalPh = ph;
        el.placeholder = spanish;
      }
    });

    // Uppercase labels (including dynamically rendered course content)
    document.querySelectorAll('.step-label, .activity-label, .section-label, .step-type, .ac-label, .ai-label').forEach(el => {
      if (el.dataset.i18nSwapped) return;
      const text = el.textContent.trim();
      const spanish = t(text);
      if (spanish) {
        el.dataset.i18nSwapped = 'true';
        el.dataset.i18nOriginal = text;
        const hint = document.createElement('span');
        hint.className = 'i18n-hint i18n-hint-upper';
        hint.textContent = text;
        el.textContent = spanish;
        el.appendChild(hint);
      }
    });

    // Translate step counter pattern: "Step X of Y" → "Paso X de Y"
    // Target common leaf text elements instead of scanning every DOM node
    document.querySelectorAll('span, div, p, strong, em, small, b, i, a, label, td, li').forEach(el => {
      if (el.children.length > 0 || el.dataset.i18nSwapped) return;
      var txt = el.textContent.trim();
      var stepMatch = txt.match(/^Step (\d+) of (\d+)$/);
      if (stepMatch) {
        el.dataset.i18nSwapped = 'true';
        el.dataset.i18nOriginal = txt;
        el.textContent = 'Paso ' + stepMatch[1] + ' de ' + stepMatch[2];
        var hint = document.createElement('span');
        hint.className = 'i18n-hint';
        hint.textContent = txt;
        el.appendChild(hint);
      }
    });

    // Translate nav/lesson label patterns containing level themes
    ['navInfo', 'lessonLabel'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el || el.dataset.i18nSwapped) return;
      var txt = el.textContent.trim();
      var translated = txt;
      // Replace known theme names
      Object.keys(ES).forEach(function(en) {
        if (txt.includes(en) && ES[en]) {
          translated = translated.replace(en, ES[en]);
        }
      });
      // Replace "Day" with "Día"
      translated = translated.replace(/\bDay\b/g, 'Día');
      if (translated !== txt) {
        el.dataset.i18nSwapped = 'true';
        el.dataset.i18nOriginal = txt;
        var hint = document.createElement('span');
        hint.className = 'i18n-hint';
        hint.textContent = txt;
        el.textContent = translated;
        el.appendChild(hint);
      }
    });

    // Translate dynamic content that has _es fields (bilingual AI lessons)
    document.querySelectorAll('.ac-heading, .ac-body').forEach(function(el) {
      if (el.dataset.i18nSwapped) return;
      var text = el.textContent.trim();
      var spanish = t(text);
      // Check if a sibling or data attribute has Spanish
      var esAttr = el.dataset.es;
      if (esAttr) {
        el.dataset.i18nSwapped = 'true';
        el.dataset.i18nOriginal = text;
        var hint = document.createElement('span');
        hint.className = 'i18n-hint';
        hint.textContent = text;
        el.textContent = esAttr;
        el.appendChild(hint);
      } else if (spanish) {
        el.dataset.i18nSwapped = 'true';
        el.dataset.i18nOriginal = text;
        var hint = document.createElement('span');
        hint.className = 'i18n-hint';
        hint.textContent = text;
        el.textContent = spanish;
        el.appendChild(hint);
      }
    });

    // Translate inline styled elements (prompts, instructions inside cards)
    document.querySelectorAll('[style*="italic"], [style*="uppercase"]').forEach(function(el) {
      if (el.dataset.i18nSwapped || el.children.length > 1) return;
      var text = el.textContent.trim();
      var spanish = t(text);
      if (spanish) {
        el.dataset.i18nSwapped = 'true';
        el.dataset.i18nOriginal = text;
        var hint = document.createElement('span');
        hint.className = 'i18n-hint';
        hint.textContent = text;
        el.textContent = spanish;
        el.appendChild(hint);
      }
    });

    addSectionIcons();
  }

  /* ═════════════════════════════════════════════════════════
     MODE: tap-to-translate (B1/B2/test)
     English UI, tap any translatable text for a tooltip
     ═════════════════════════════════════════════════════════ */
  let activeTooltip = null;

  function applyTapToTranslate() {
    const selectors = [
      'button', '.btn-cta', '.btn-enter', '.btn-nav',
      '.btn-next', '.btn-back', '.btn-start', '.btn-begin',
      'h1', 'h2', 'h3', '.milestone-title',
      'label', '.label', '.field-label',
      '.welcome-header p', '.login-hint', '.milestone-desc',
      '.milestone-label', '.cta-section p', '.dash-subtitle',
      '.section-desc', '.section-intro p', '.intro-desc',
      '.screen p', '.activity-card > p',
      '.step-label', '.activity-label', '.section-label', '.step-type',
      '.ac-label', '.ac-heading', '.ac-body', '.ai-label', '.ai-status',
    ];

    document.querySelectorAll(selectors.join(',')).forEach(el => {
      if (el.dataset.i18nTap) return;
      const text = getDirectText(el) || el.textContent.trim();
      const spanish = t(text);
      if (spanish) {
        el.dataset.i18nTap = 'true';
        el.classList.add('i18n-tappable');
        el.addEventListener('click', function(e) {
          e.stopPropagation();
          showTooltip(el, spanish);
        });
      }
    });

    addSectionIcons();
  }

  function showTooltip(el, text) {
    dismissTooltip();
    const rect = el.getBoundingClientRect();
    const tip = document.createElement('div');
    tip.className = 'i18n-tooltip';
    tip.textContent = text;
    document.body.appendChild(tip);
    // Position below the element
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + window.scrollX;
    let top = rect.bottom + window.scrollY + 8;
    // Keep within viewport
    if (left + tipRect.width > window.innerWidth - 16) {
      left = window.innerWidth - tipRect.width - 16;
    }
    if (left < 8) left = 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    activeTooltip = tip;
    // Auto-dismiss after 4 seconds
    setTimeout(dismissTooltip, 4000);
  }

  function dismissTooltip() {
    if (activeTooltip) {
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  /* ═════════════════════════════════════════════════════════
     MODE: teacher-gated (C1)
     English UI with a toggle that requires teacher approval
     ═════════════════════════════════════════════════════════ */
  function applyTeacherGated() {
    // Build a small toggle button
    if (document.querySelector('.i18n-c1-toggle')) return;
    const toggle = document.createElement('div');
    toggle.className = 'i18n-c1-toggle' + (teacherApproved ? '' : ' disabled');
    toggle.textContent = teacherApproved ? '🇪🇸 Tap text for Spanish' : '🇪🇸 Spanish (needs approval)';
    if (teacherApproved) {
      toggle.onclick = function() {
        toggle.classList.toggle('active');
        if (toggle.classList.contains('active')) {
          applyTapToTranslate();
          toggle.textContent = '🇪🇸 Tap text for Spanish ✓';
        } else {
          clearAll();
          toggle.textContent = '🇪🇸 Tap text for Spanish';
          addSectionIcons();
        }
      };
    }
    document.body.appendChild(toggle);
    addSectionIcons();
  }

  /** Check teacher approval from Google Sheets (cached after first fetch) */
  async function checkTeacherApproval() {
    if (teacherApprovalChecked) return;
    teacherApprovalChecked = true;
    const name = localStorage.getItem('fp_student_name') || '';
    if (!name) return;
    const webhook = (FP && FP.WEBHOOK_URL) || '';
    if (!webhook || webhook.includes('YOUR_')) return;
    try {
      const url = webhook + '?action=get_settings&student=' + encodeURIComponent(name);
      const data = await FP.api.get(url);
      if (data && data.found && data.allow_spanish) {
        teacherApproved = true;
        // Rebuild the toggle
        const existing = document.querySelector('.i18n-c1-toggle');
        if (existing) existing.remove();
        applyTeacherGated();
      }
    } catch (e) {}
  }

  /* ═════════════════════════════════════════════════════════
     Shared helpers
     ═════════════════════════════════════════════════════════ */
  function addSectionIcons() {
    document.querySelectorAll('h1, h2, h3, .step-title, .section-title').forEach(el => {
      if (el.dataset.i18nIcon) return; // attribute check instead of querySelector
      const text = getDirectText(el).trim();
      for (const [keyword, icon] of Object.entries(SECTION_ICONS)) {
        if (text.includes(keyword)) {
          el.dataset.i18nIcon = 'true';
          const span = document.createElement('span');
          span.className = 'i18n-icon';
          span.textContent = icon;
          span.setAttribute('aria-hidden', 'true');
          el.insertBefore(span, el.firstChild);
          break;
        }
      }
    });
  }

  function clearAll() {
    // Pass 1: remove all injected elements
    document.querySelectorAll('.i18n-hint, .i18n-icon, .i18n-tooltip').forEach(el => el.remove());
    // Pass 2: restore all i18n state in a single query
    document.querySelectorAll('[data-i18n-swapped], [data-i18n-tap], [data-i18n-original-ph], [data-i18n-icon]').forEach(el => {
      if (el.dataset.i18nSwapped) {
        const original = el.dataset.i18nOriginal;
        if (original) {
          el.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
              node.textContent = original;
            }
          });
        }
        delete el.dataset.i18nSwapped;
        delete el.dataset.i18nOriginal;
      }
      if (el.dataset.i18nOriginalPh) {
        el.placeholder = el.dataset.i18nOriginalPh;
        delete el.dataset.i18nOriginalPh;
      }
      if (el.dataset.i18nTap) {
        el.classList.remove('i18n-tappable');
        delete el.dataset.i18nTap;
      }
      if (el.dataset.i18nIcon) {
        delete el.dataset.i18nIcon;
      }
    });
  }

  function showModeBadge(text) {
    if (document.querySelector('.i18n-mode-badge')) return;
    const badge = document.createElement('div');
    badge.className = 'i18n-mode-badge';
    badge.textContent = text;
    document.body.appendChild(badge);
  }

  /* ═════════════════════════════════════════════════════════
     Apply the current mode
     ═════════════════════════════════════════════════════════ */
  function apply() {
    if (!mode) return;
    switch (mode) {
      case MODE_SPANISH_PRIMARY:
        applySpanishPrimary();
        break;
      case MODE_TAP_TRANSLATE:
        applyTapToTranslate();
        break;
      case MODE_TEACHER_GATED:
        applyTeacherGated();
        break;
      case MODE_ENGLISH_ONLY:
        addSectionIcons();
        break;
    }
  }

  /* ═════════════════════════════════════════════════════════
     MutationObserver — re-apply on dynamic DOM changes
     ═════════════════════════════════════════════════════════ */
  let debounceTimer = null;
  function observeDOM() {
    const observer = new MutationObserver(() => {
      if (!mode || mode === MODE_ENGLISH_ONLY) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(apply, 250);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /* ═════════════════════════════════════════════════════════
     Public API
     ═════════════════════════════════════════════════════════ */

  function modeForLevel(lvl) {
    if (!lvl) return MODE_TAP_TRANSLATE;
    const l = lvl.toUpperCase();
    if (l === 'A1' || l === 'A2') return MODE_SPANISH_PRIMARY;
    if (l === 'B1' || l === 'B2') return MODE_TAP_TRANSLATE;
    if (l === 'C1') return MODE_TEACHER_GATED;
    if (l === 'C2') return MODE_ENGLISH_ONLY;
    if (l === 'TEST') return MODE_TAP_TRANSLATE;
    return MODE_TAP_TRANSLATE;
  }

  function setLevel(lvl) {
    level = lvl;
    mode = modeForLevel(lvl);
    clearAll();
    // Remove any existing UI from previous mode
    document.querySelectorAll('.i18n-c1-toggle, .i18n-mode-badge').forEach(el => el.remove());
    apply();
    if (mode === MODE_TEACHER_GATED) checkTeacherApproval();
  }

  function init(opts) {
    if (initialized) return;
    initialized = true;
    injectCSS();

    // Determine level from opts, localStorage, or default
    const lvl = (opts && opts.level)
      || localStorage.getItem('fp_cefr_level')
      || null;

    level = lvl;
    mode = modeForLevel(lvl);

    // Dismiss tooltip on click anywhere
    document.addEventListener('click', dismissTooltip);

    apply();
    observeDOM();
    if (mode === MODE_TEACHER_GATED) checkTeacherApproval();
  }

  // Auto-init when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    setTimeout(() => init(), 50);
  }

  return { init, setLevel, apply, modeForLevel };
})();

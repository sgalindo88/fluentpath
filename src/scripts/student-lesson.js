// ══════════════════════════════════════════════════════
// CONFIG — teacher sets these
// ══════════════════════════════════════════════════════
const GOOGLE_SHEET_WEBHOOK = FP.WEBHOOK_URL;

// ══════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════
let state = {
  studentName: '',
  teacherCode: '',
  level: null,
  lessonDate: '',
  submissionId: null, // N-12: one opaque id per lesson attempt (verify + idempotent retry)
  dayNumber: 1,
  lessonContent: null, // AI-generated lesson plan
  steps: [],
  currentStep: 0,
  startTime: null,
  answers: {}, // student responses per step
  timerInterval: null,
  timeElapsed: 0, // seconds
  pollInterval: null,
};

const LESSON_DURATION = FP.LESSON_DURATION_MIN * 60; // seconds

const LEVEL_THEMES = {
  A1: { name: 'Beginner', name_es: 'Principiante', theme: 'Everyday Survival', theme_es: 'Vida diaria' },
  A2: { name: 'Elementary', name_es: 'Elemental', theme: 'Community & Life', theme_es: 'Comunidad y vida' },
  B1: { name: 'Intermediate', name_es: 'Intermedio', theme: 'The Workplace', theme_es: 'El trabajo' },
  B2: {
    name: 'Upper-Intermediate',
    name_es: 'Intermedio alto',
    theme: 'Career & Society',
    theme_es: 'Carrera y sociedad',
  },
  C1: { name: 'Advanced', name_es: 'Avanzado', theme: 'Professional Mastery', theme_es: 'Dominio profesional' },
  C2: { name: 'Proficiency', name_es: 'Dominio total', theme: 'Full Fluency', theme_es: 'Fluidez total' },
};

// Step types for a full 90-min lesson
const STEP_STRUCTURE = [
  {
    type: 'warmup',
    label: 'Warm-up',
    label_es: 'Calentamiento',
    title: "Let's Get Started",
    title_es: 'Comencemos',
    duration: 10,
  },
  {
    type: 'vocabulary',
    label: 'Vocabulary',
    label_es: 'Vocabulario',
    title: 'New Words Today',
    title_es: 'Palabras nuevas de hoy',
    duration: 20,
  },
  {
    type: 'listening',
    label: 'Listening',
    label_es: 'Comprensión auditiva',
    title: 'Listen & Understand',
    title_es: 'Escucha y comprende',
    duration: 15,
  },
  {
    type: 'speaking',
    label: 'Pronunciation',
    label_es: 'Pronunciación',
    title: 'Speak & Be Understood',
    title_es: 'Habla y hazte entender',
    duration: 20,
  },
  {
    type: 'practice',
    label: 'Practice',
    label_es: 'Práctica',
    title: 'Put It All Together',
    title_es: 'Junta todo lo aprendido',
    duration: 15,
  },
  {
    type: 'writing',
    label: 'Writing',
    label_es: 'Escritura',
    title: 'Write It Down',
    title_es: 'Escríbelo',
    duration: 15,
  },
  {
    type: 'review',
    label: 'Review',
    label_es: 'Repaso',
    title: 'What Did You Learn?',
    title_es: '¿Qué aprendiste?',
    duration: 5,
  },
];

// ══════════════════════════════════════════════════════
// SMALL HELPERS
// ══════════════════════════════════════════════════════
/** Static bilingual text (both arguments are plain text and are escaped). */
const bi = FP.ui.bi;

/**
 * AI-supplied text with its optional Spanish line (`*_es` fields). English always shows;
 * the Spanish line is hidden for B2/C1/C2 by the `fp-no-es` class (see ui.js).
 */
function biText(en, es) {
  if (!es) return escHtml(en);
  return '<span class="fp-bi">' + escHtml(en) + '<span class="fp-bi__es" lang="es">' + escHtml(es) + '</span></span>';
}

function $(id) {
  return document.getElementById(id);
}
function setHidden(el, hidden) {
  if (el) el.classList.toggle('fp-hidden', !!hidden);
}

/** Plural helper for the small counters ("1 word", "3 words"). */
function plural(n, one, many) {
  return n === 1 ? one : many;
}

// ══════════════════════════════════════════════════════
// CHECKPOINT (session recovery)
// ══════════════════════════════════════════════════════
const CKPT_KEY = 'lesson';
let ckptInterval = null;

function saveLessonCheckpoint() {
  if (!state.lessonContent || !state.steps.length) return;
  // Collect current textarea values from the DOM
  const domAnswers = Object.assign({}, state.answers);
  var wr = $('writing-resp');
  if (wr && !wr.disabled) domAnswers['writing'] = wr.value;
  var rn = $('review-notes');
  if (rn && !rn.disabled) domAnswers['review_notes'] = rn.value;

  Checkpoint.save(CKPT_KEY, {
    studentName: state.studentName,
    level: state.level,
    lessonDate: state.lessonDate,
    dayNumber: state.dayNumber,
    submissionId: state.submissionId,
    lessonContent: state.lessonContent,
    currentStep: state.currentStep,
    answers: domAnswers,
    timeElapsed: state.timeElapsed,
  });
}

function startLessonAutoSave() {
  if (ckptInterval) return;
  saveLessonCheckpoint();
  ckptInterval = setInterval(saveLessonCheckpoint, 5000);
}

function clearLessonCheckpoint() {
  if (ckptInterval) {
    clearInterval(ckptInterval);
    ckptInterval = null;
  }
  Checkpoint.clear(CKPT_KEY);
}

function tryResumeLesson() {
  var data = Checkpoint.load(CKPT_KEY);
  if (!data || !data.lessonContent) return;
  Checkpoint.showRecoveryModal({
    title: 'Resume Your Lesson?',
    titleEs: '¿Continuar tu Lección?',
    message:
      'You have an unfinished lesson (Day ' + data.dayNumber + '). Would you like to pick up where you left off?',
    messageEs: 'Tienes una lección sin terminar (Día ' + data.dayNumber + '). ¿Quieres continuar donde lo dejaste?',
    savedAt: data._savedAt,
    onResume: function () {
      lessonInProgress = true;
      // Restore state
      state.studentName = data.studentName;
      state.level = data.level;
      state.lessonDate = data.lessonDate;
      state.dayNumber = data.dayNumber;
      state.submissionId = data.submissionId || newSubmissionId();
      state.lessonContent = data.lessonContent;
      state.answers = data.answers || {};
      state.timeElapsed = data.timeElapsed || 0;
      state.startTime = new Date(Date.now() - state.timeElapsed * 1000);
      FP.ui.setLevel(state.level);

      // Rebuild steps and set position
      state.steps = buildSteps(state.lessonContent);
      state.currentStep = Math.min(data.currentStep || 0, state.steps.length - 1);

      showScreen('screen-lesson');
      showLessonChrome();
      startTimer(data.timeElapsed || 0); // resume from the saved elapsed time

      buildStepDots();
      renderStep();
      setHidden($('lessonNav'), false);
      startLessonAutoSave();
    },
    onStartOver: function () {
      clearLessonCheckpoint();
    },
  });
}

// ══════════════════════════════════════════════════════
// SCREEN CONTROL
// ══════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo(0, 0);
}

/** Header details that only make sense once a lesson is running: day badge, timer, pause. */
function showLessonChrome() {
  var info = LEVEL_THEMES[state.level] || { theme: '', theme_es: '' };
  var day = $('navDay');
  day.innerHTML =
    escHtml('Day ' + state.dayNumber + ' / ' + FP.COURSE_DAYS) +
    FP.ui.es('Día ' + state.dayNumber + ' / ' + FP.COURSE_DAYS);
  setHidden(day, false);
  setHidden($('navTimer'), false);
  setHidden($('navPause'), false);
  $('lessonLabel').innerHTML = bi(
    'Day ' + state.dayNumber + ' · ' + state.level + ' · ' + info.theme,
    'Día ' + state.dayNumber + ' · ' + state.level + ' · ' + info.theme_es
  );
}

// ══════════════════════════════════════════════════════
// LEVEL DISPLAY (the level itself is assigned by the teacher — see loadCourseState)
// ══════════════════════════════════════════════════════
/** Set the message under the form: variant 'info' | 'warning'. `html` is already escaped. */
function setLevelMessage(html, variant) {
  var el = $('levelInstruction');
  el.className = 'fp-banner fp-banner--' + (variant || 'info') + ' level-instruction';
  el.querySelector('.fp-banner__body').innerHTML = html;
  var icon = el.querySelector('.fp-banner__icon');
  if (icon) icon.outerHTML = FP.icon(variant === 'warning' ? 'warning' : 'lightbulb', { className: 'fp-banner__icon' });
}

function lockLevelGrid(levelCode) {
  // The tiles are display only: the chosen level is highlighted, the others stay locked.
  document.querySelectorAll('.level-card').forEach(function (c) {
    var mine = c.dataset.level === levelCode;
    c.classList.toggle('selected', mine);
    c.classList.toggle('is-selected', mine);
    c.classList.toggle('is-locked', !mine);
    if (mine) {
      c.removeAttribute('aria-disabled');
      c.setAttribute('aria-current', 'true');
    } else {
      c.setAttribute('aria-disabled', 'true');
      c.removeAttribute('aria-current');
    }
  });
  var info = LEVEL_THEMES[levelCode] || { name: '', name_es: '' };
  setLevelMessage(
    '<span class="fp-bi">Your level: <strong>' +
      escHtml(levelCode + ' · ' + info.name) +
      '</strong>' +
      '<span class="fp-bi__es" lang="es">Tu nivel: <strong>' +
      escHtml(levelCode + ' · ' + info.name_es) +
      '</strong></span></span>' +
      '<span class="fp-bi">Assigned by your teacher. Contact them if this needs to change.' +
      '<span class="fp-bi__es" lang="es">Lo asigna tu profesor. Habla con tu profesor si debe cambiar.</span></span>',
    'info'
  );
}

// ══════════════════════════════════════════════════════
// START COURSE
// ══════════════════════════════════════════════════════
function startCourse() {
  // FLOW-1: name, level and day all come from the server (loadCourseState);
  // the landing page no longer lets the student type or pick any of them.
  if (!state.studentName || !state.level || !state.dayNumber) return;
  state.lessonDate = $('lessonDate').value || localDateString();
  beginLesson();
}

/** The video-call request lives in a help card at the end of each step (not in the header). */
function initCallControl() {
  if (typeof CallRequest !== 'undefined') {
    CallRequest.init({ page: 'lesson', dayNumber: state.dayNumber, mount: '#callSlot' });
  }
}

/**
 * Pure: decide level and day from a get_progress reply, falling back to what
 * the hub last cached when the server could not be reached. The server
 * re-validates both on generate_lesson and save_progress, so a stale fallback
 * can at worst be refused, never filed under the wrong day.
 */
function resolveCourseState(progress, cachedLevel, cachedLastDay) {
  var level = (progress && progress.cefr_level) || cachedLevel || '';
  var day =
    (progress && parseInt(progress.next_day, 10)) || Math.min((parseInt(cachedLastDay, 10) || 0) + 1, FP.COURSE_DAYS);
  return { level: level, dayNumber: Math.max(1, Math.min(day, FP.COURSE_DAYS)) };
}

async function loadCourseState() {
  var btn = $('btnBeginLesson');
  btn.disabled = true;
  var progress = null;
  try {
    progress = await FP.api.get(
      GOOGLE_SHEET_WEBHOOK + '?action=get_progress&student=' + encodeURIComponent(state.studentName),
      { timeout: 15000 }
    );
  } catch (e) {
    console.warn('[FluentPath] Could not load course state, using the hub cache:', e.message);
  }
  var cs = resolveCourseState(
    progress,
    localStorage.getItem(FP.KEYS.CEFR_LEVEL),
    localStorage.getItem(FP.KEYS.LAST_LESSON_DAY)
  );
  if (progress && progress.found) {
    try {
      if (progress.cefr_level) localStorage.setItem(FP.KEYS.CEFR_LEVEL, progress.cefr_level);
      localStorage.setItem(FP.KEYS.LAST_LESSON_DAY, String(progress.max_day || 0));
    } catch (_) {}
  }
  if (!cs.level) {
    setLevelMessage(
      '<span class="fp-bi">Your teacher has not set your level yet. Take the placement test from the hub, then come back here.' +
        '<span class="fp-bi__es" lang="es">Tu profesor aún no ha asignado tu nivel. Haz la prueba de nivel en el inicio y vuelve aquí.</span></span>',
      'warning'
    );
    return;
  }
  state.level = cs.level;
  state.dayNumber = cs.dayNumber;
  FP.ui.setLevel(state.level);
  lockLevelGrid(cs.level);
  btn.disabled = false;
  initCallControl(); // now that the day is known
}

// ══════════════════════════════════════════════════════
// BEGIN LESSON — fetch AI content and render
// ══════════════════════════════════════════════════════
// ── beforeunload — warn when lesson is in progress ──
var lessonInProgress = false;
function onBeforeUnload(e) {
  if (lessonInProgress) {
    e.preventDefault();
  }
}
window.addEventListener('beforeunload', onBeforeUnload);

function waitMessage(en, es) {
  return (
    '<div class="lesson-wait" role="status"><span class="fp-spinner" aria-hidden="true"></span><p class="fp-wait__msg">' +
    bi(en, es) +
    '</p></div>'
  );
}

async function beginLesson() {
  lessonInProgress = true;
  state.submissionId = newSubmissionId(); // N-12
  showScreen('screen-lesson');
  state.startTime = new Date();
  startTimer();
  showLessonChrome();

  // Fetch AI lesson content with a 45-second safety timeout
  $('activityWrap').innerHTML = waitMessage('Loading your personalised lesson…', 'Cargando tu lección personalizada…');

  var lessonTimeout = setTimeout(function () {
    $('activityWrap').innerHTML = waitMessage(
      'This is taking longer than expected. Please keep this page open.',
      'Esto está tardando más de lo esperado. Mantén esta página abierta.'
    );
  }, 45000);

  const lessonData = await generateLesson();
  clearTimeout(lessonTimeout);
  state.lessonContent = lessonData;
  state.steps = buildSteps(lessonData);
  state.currentStep = 0;

  buildStepDots();
  renderStep();
  setHidden($('lessonNav'), false);
  startLessonAutoSave();
}

// ══════════════════════════════════════════════════════
// AI LESSON GENERATION
// Calls the Apps Script proxy (which calls the AI provider) to generate a fresh lesson
// per (level, day). Cached in localStorage so reloads don't waste API calls.
// Falls back to a varied offline library if anything goes wrong.
// ══════════════════════════════════════════════════════
async function generateLesson() {
  // DATA-1: scope the cache by student. Keyed on (level, day) alone, two
  // students at the same level and day on one device shared a cached lesson —
  // including one personalised to the other's teacher-set difficulty profile.
  const cacheStudent = String(state.studentName || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-');
  const cacheKey = 'fp_lesson_' + (cacheStudent ? cacheStudent + '_' : '') + state.level + '_d' + state.dayNumber;
  const isSpanishLevel = state.level === 'A1' || state.level === 'A2';

  // 1. Cache check — never re-generate the same day twice
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.topic) {
        console.log('[FluentPath] Using cached lesson for', cacheKey);
        return parsed;
      }
    }
  } catch (_) {
    /* ignore parse errors */
  }

  // 2. Call Apps Script → AI provider
  // Passing the student name lets apps-script fold the teacher's
  // difficulty profile, focus areas, and AI instructions into the prompt.
  try {
    const url =
      GOOGLE_SHEET_WEBHOOK +
      '?' +
      [
        'action=generate_lesson',
        'level=' + encodeURIComponent(state.level),
        'day=' + encodeURIComponent(state.dayNumber),
        'spanish=' + (isSpanishLevel ? 'true' : 'false'),
        'student=' + encodeURIComponent(state.studentName || ''),
      ].join('&');

    const data = await FP.api.get(url, { timeout: 60000 });

    if (data && data.found && data.lesson && data.lesson.topic) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data.lesson));
      } catch (_) {}
      return data.lesson;
    }

    if (data && data.error) {
      console.warn('[FluentPath] Lesson generation error:', data.error);
    } else {
      console.warn('[FluentPath] Lesson generation returned no lesson');
    }
  } catch (e) {
    console.warn('[FluentPath] Lesson generation request failed:', e.message);
  }

  // 3. Fallback — varied library, with a banner so the teacher notices AI is offline
  showFallbackBanner();
  return getFallbackLesson(state.level, state.dayNumber);
}

/** Tell the student (and, through them, the teacher) that the lesson generator is offline. In the page flow, under the step bar. */
function showFallbackBanner() {
  var box = $('lessonNotice');
  if (!box || box.firstChild) return;
  box.innerHTML = bannerHtml(
    'warning',
    bi(
      'Offline lesson. Please tell your teacher the lesson generator is unavailable.',
      'Lección sin conexión. Avisa a tu profesor que el generador de lecciones no está disponible.'
    )
  );
}

// Five hand-curated fallback lessons that cycle by (day - 1) % 5.
// Only used when AI generation fails — student sees the offline banner so the
// teacher knows to fix the API key. Each lesson is a complete, distinct scenario
// for an adult immigrant learner.
const FALLBACK_LESSONS = [
  // ── 0: Appointments & phone calls ──
  {
    topic: 'Making an Appointment',
    objective: 'Make and confirm an appointment over the phone.',
    warmup: {
      title: 'Think About Your Day',
      instruction: 'Take a moment to think and answer in English.',
      prompt: 'When was the last time you had an appointment? Describe it in 2-3 sentences.',
    },
    vocabulary: {
      title: 'Phone & Appointment Words',
      instruction: 'Click each word to see its meaning. Then try to use it in a sentence.',
      words: [
        {
          word: 'appointment',
          pronunciation: '/əˈpɔɪntmənt/',
          partOfSpeech: 'noun',
          definition: 'A meeting arranged for a specific time',
          exampleSentence: "I have a doctor's appointment at 3pm.",
        },
        {
          word: 'available',
          pronunciation: '/əˈveɪləbəl/',
          partOfSpeech: 'adjective',
          definition: 'Free to use or accessible',
          exampleSentence: 'Is this seat available?',
        },
        {
          word: 'confirm',
          pronunciation: '/kənˈfɜːm/',
          partOfSpeech: 'verb',
          definition: 'To make sure something is correct',
          exampleSentence: 'Please confirm your reservation.',
        },
        {
          word: 'urgent',
          pronunciation: '/ˈɜːdʒənt/',
          partOfSpeech: 'adjective',
          definition: 'Requiring immediate action',
          exampleSentence: 'This is urgent — I need help now.',
        },
      ],
    },
    listening: {
      title: 'At the Front Desk',
      instruction: 'Listen to the conversation. Then answer the questions.',
      audioText:
        "Hi, this is Maria calling from the front desk. I'm calling to confirm your appointment for tomorrow at two o'clock. If you need to reschedule, please call us back as soon as possible. We look forward to seeing you.",
      questions: [
        {
          id: 'l1',
          question: 'Who is calling?',
          options: ['A doctor', 'Maria from the front desk', 'A customer', 'A manager'],
          correct: 1,
        },
        {
          id: 'l2',
          question: 'What is the purpose of the call?',
          options: [
            'To cancel an appointment',
            'To make a complaint',
            'To confirm an appointment',
            'To ask for directions',
          ],
          correct: 2,
        },
      ],
    },
    speaking: {
      title: 'Phone Phrases',
      instruction: 'Repeat each phrase clearly. Focus on stress and rhythm.',
      drills: [
        {
          id: 's1',
          phrase: 'Could I speak to the manager, please?',
          tip: 'Stress "manager" — COUld I SPEAK to the MANager, PLEASE?',
        },
        {
          id: 's2',
          phrase: "I'd like to make an appointment.",
          tip: "Notice the linking: I'd-like-to — blend the words smoothly.",
        },
      ],
      conversationPrompt:
        'Imagine you are calling a clinic to book an appointment. Record yourself making the call. Include: your name, the reason for the appointment, and ask what times are available.',
    },
    practice: {
      title: 'Quick Check',
      instruction: 'Choose the best answer.',
      questions: [
        {
          id: 'p1',
          question: 'You need to see a doctor urgently. What do you say on the phone?',
          options: [
            'I want a pizza.',
            'I need to make an urgent appointment.',
            'Are you open tomorrow?',
            'Where is the clinic?',
          ],
          correct: 1,
        },
        {
          id: 'p2',
          question: 'Which word means "to make certain something is correct"?',
          options: ['cancel', 'ignore', 'confirm', 'forget'],
          correct: 2,
        },
        {
          id: 'p3',
          question: 'Fill in the blank: "Is this time _____ for you?"',
          options: ['urgent', 'available', 'confirmed', 'appointment'],
          correct: 1,
        },
      ],
    },
    writing: {
      title: 'Write a Message',
      instruction: 'Write your response in the box below.',
      prompt:
        "Write a short text message to your boss explaining that you need to leave early today for a doctor's appointment. Be polite and professional.",
      minWords: 30,
    },
    review: {
      title: "Today's Key Points",
      keyTakeaways: [
        'You learned 4 useful words: appointment, available, confirm, urgent.',
        'You practised phone phrases for making appointments.',
        'You wrote a professional message in English.',
      ],
    },
  },

  // ── 1: Shopping & money ──
  {
    topic: 'Shopping and Prices',
    objective: 'Ask about prices, make a purchase, and handle returns at a store.',
    warmup: {
      title: 'Your Last Purchase',
      instruction: 'Think about something you bought recently.',
      prompt: 'What was the last thing you bought? How much did it cost? Describe it in 2-3 sentences.',
    },
    vocabulary: {
      title: 'Shopping Words',
      instruction: 'Click each word to see its meaning. Then try to use it in a sentence.',
      words: [
        {
          word: 'receipt',
          pronunciation: '/rɪˈsiːt/',
          partOfSpeech: 'noun',
          definition: 'A paper showing what you paid for',
          exampleSentence: 'Please keep your receipt for the return.',
        },
        {
          word: 'refund',
          pronunciation: '/ˈriːfʌnd/',
          partOfSpeech: 'noun',
          definition: 'Money returned to you for an item',
          exampleSentence: 'I would like a refund, please.',
        },
        {
          word: 'discount',
          pronunciation: '/ˈdɪskaʊnt/',
          partOfSpeech: 'noun',
          definition: 'A reduction in the normal price',
          exampleSentence: 'Is there a student discount?',
        },
        {
          word: 'cash',
          pronunciation: '/kæʃ/',
          partOfSpeech: 'noun',
          definition: 'Paper money and coins',
          exampleSentence: 'Do you accept cash or only card?',
        },
        {
          word: 'expensive',
          pronunciation: '/ɪkˈspɛnsɪv/',
          partOfSpeech: 'adjective',
          definition: 'Costing a lot of money',
          exampleSentence: 'This jacket is too expensive for me.',
        },
      ],
    },
    listening: {
      title: 'At the Cash Register',
      instruction: 'Listen carefully and answer the questions.',
      audioText:
        "Good afternoon. Your total comes to twenty-four dollars and fifty cents. Will that be cash or card today? We also have a sale on all winter items — twenty percent off if you'd like to add anything else. And here's your receipt. Have a great day!",
      questions: [
        {
          id: 'l1',
          question: 'How much does the customer need to pay?',
          options: ['$14.50', '$24.50', '$20.00', '$24.00'],
          correct: 1,
        },
        {
          id: 'l2',
          question: 'What is on sale today?',
          options: ['All items', 'Winter items', 'Summer items', 'Nothing'],
          correct: 1,
        },
      ],
    },
    speaking: {
      title: 'Shopping Phrases',
      instruction: 'Repeat each phrase clearly. Focus on rising intonation for questions.',
      drills: [
        { id: 's1', phrase: 'How much does this cost?', tip: 'Rising tone at the end — How much does this COST?' },
        {
          id: 's2',
          phrase: 'Do you accept credit cards?',
          tip: 'Stress "credit CARDS" — make it clear what you mean.',
        },
      ],
      conversationPrompt:
        "You bought a shirt yesterday but it's the wrong size. Record yourself asking the cashier for a refund or exchange. Include: what you bought, why you want to return it, and what you'd prefer instead.",
    },
    practice: {
      title: 'Quick Check',
      instruction: 'Choose the best answer.',
      questions: [
        {
          id: 'p1',
          question: 'Which word means "money returned to you"?',
          options: ['receipt', 'discount', 'refund', 'cash'],
          correct: 2,
        },
        {
          id: 'p2',
          question: 'What do you ask if you want a lower price?',
          options: ['Is there a discount?', 'Where is the bathroom?', 'What time is it?', 'Can I have a bag?'],
          correct: 0,
        },
        {
          id: 'p3',
          question: 'Fill in the blank: "Could I have a _____, please? I need it to return this item."',
          options: ['refund', 'receipt', 'discount', 'price'],
          correct: 1,
        },
      ],
    },
    writing: {
      title: 'Write a Complaint',
      instruction: 'Write your response in the box below.',
      prompt:
        'Write a short email to a store explaining that the shoes you bought online arrived damaged. Politely ask for a refund or replacement.',
      minWords: 30,
    },
    review: {
      title: "Today's Key Points",
      keyTakeaways: [
        'You learned 5 shopping words: receipt, refund, discount, cash, expensive.',
        'You practised asking about prices and requesting refunds.',
        'You wrote a polite complaint message.',
      ],
    },
  },

  // ── 2: At work ──
  {
    topic: 'At the Workplace',
    objective: 'Communicate about your schedule, ask for time off, and report a problem at work.',
    warmup: {
      title: 'Your Workday',
      instruction: 'Think about your typical day at work.',
      prompt: 'What time do you start work? What is the first thing you do? Describe it in 2-3 sentences.',
    },
    vocabulary: {
      title: 'Workplace Words',
      instruction: 'Click each word to see its meaning. Then try to use it in a sentence.',
      words: [
        {
          word: 'shift',
          pronunciation: '/ʃɪft/',
          partOfSpeech: 'noun',
          definition: 'A scheduled period of work',
          exampleSentence: 'My shift starts at 6am tomorrow.',
        },
        {
          word: 'supervisor',
          pronunciation: '/ˈsuːpəvaɪzə/',
          partOfSpeech: 'noun',
          definition: 'The person who manages your work',
          exampleSentence: 'I need to talk to my supervisor.',
        },
        {
          word: 'paycheck',
          pronunciation: '/ˈpeɪtʃɛk/',
          partOfSpeech: 'noun',
          definition: 'The money you receive for your work',
          exampleSentence: 'I get my paycheck every two weeks.',
        },
        {
          word: 'overtime',
          pronunciation: '/ˈəʊvətaɪm/',
          partOfSpeech: 'noun',
          definition: 'Extra hours worked beyond the normal schedule',
          exampleSentence: 'I worked 5 hours of overtime last week.',
        },
        {
          word: 'break',
          pronunciation: '/breɪk/',
          partOfSpeech: 'noun',
          definition: 'A short rest period during work',
          exampleSentence: 'We get a 30-minute break for lunch.',
        },
      ],
    },
    listening: {
      title: 'Asking for Time Off',
      instruction: 'Listen to the conversation between an employee and supervisor.',
      audioText:
        "Excuse me, Linda? I'm sorry to bother you, but I need to ask for next Friday off. My daughter has a school event in the morning. I can switch shifts with Carlos if that helps. I just wanted to give you plenty of notice.",
      questions: [
        {
          id: 'l1',
          question: 'What does the employee need?',
          options: ['A pay raise', 'A day off', 'A new uniform', 'A break'],
          correct: 1,
        },
        {
          id: 'l2',
          question: 'What does the employee offer to do?',
          options: ['Work overtime', 'Switch shifts with Carlos', 'Bring her daughter to work', 'Quit her job'],
          correct: 1,
        },
      ],
    },
    speaking: {
      title: 'Polite Workplace Phrases',
      instruction: 'Repeat each phrase. Focus on a calm, polite tone.',
      drills: [
        {
          id: 's1',
          phrase: "I'm sorry to bother you, but I have a question.",
          tip: 'Soften your voice — start politely so your supervisor is open to listening.',
        },
        {
          id: 's2',
          phrase: 'Could I take my break now, please?',
          tip: 'Use rising intonation on "please" to sound polite.',
        },
      ],
      conversationPrompt:
        'Imagine you need to leave work two hours early for a family emergency. Record yourself talking to your supervisor. Include: a polite opening, the reason, and offering to make up the hours.',
    },
    practice: {
      title: 'Quick Check',
      instruction: 'Choose the best answer.',
      questions: [
        {
          id: 'p1',
          question: 'Which word means "extra hours worked"?',
          options: ['shift', 'break', 'overtime', 'paycheck'],
          correct: 2,
        },
        {
          id: 'p2',
          question: 'Who do you talk to if you have a problem at work?',
          options: ['Your customer', 'Your supervisor', 'Your neighbour', 'Your doctor'],
          correct: 1,
        },
        {
          id: 'p3',
          question: 'Fill in the blank: "My _____ starts at 9am and ends at 5pm."',
          options: ['paycheck', 'break', 'shift', 'supervisor'],
          correct: 2,
        },
      ],
    },
    writing: {
      title: 'Email Your Supervisor',
      instruction: 'Write your response in the box below.',
      prompt:
        'Write a short, polite email to your supervisor asking for next Tuesday off because you have a doctor appointment. Offer to work an extra shift to cover.',
      minWords: 30,
    },
    review: {
      title: "Today's Key Points",
      keyTakeaways: [
        'You learned 5 workplace words: shift, supervisor, paycheck, overtime, break.',
        'You practised polite ways to talk to your supervisor.',
        'You wrote a professional time-off request.',
      ],
    },
  },

  // ── 3: Health & doctor ──
  {
    topic: 'At the Doctor',
    objective: 'Describe symptoms to a doctor and understand basic medical instructions.',
    warmup: {
      title: 'How Do You Feel?',
      instruction: 'Think about how your body feels today.',
      prompt: 'When was the last time you felt sick? What was wrong? Describe it in 2-3 sentences.',
    },
    vocabulary: {
      title: 'Health Words',
      instruction: 'Click each word to see its meaning. Then try to use it in a sentence.',
      words: [
        {
          word: 'symptom',
          pronunciation: '/ˈsɪmptəm/',
          partOfSpeech: 'noun',
          definition: 'A sign that you are sick',
          exampleSentence: 'A headache is a common symptom of the flu.',
        },
        {
          word: 'prescription',
          pronunciation: '/prɪˈskrɪpʃən/',
          partOfSpeech: 'noun',
          definition: "A doctor's written order for medicine",
          exampleSentence: 'I need to fill my prescription at the pharmacy.',
        },
        {
          word: 'pain',
          pronunciation: '/peɪn/',
          partOfSpeech: 'noun',
          definition: 'A bad feeling in your body when you are hurt or sick',
          exampleSentence: 'I have a sharp pain in my back.',
        },
        {
          word: 'fever',
          pronunciation: '/ˈfiːvə/',
          partOfSpeech: 'noun',
          definition: 'A high body temperature',
          exampleSentence: 'My son has a fever of 102 degrees.',
        },
        {
          word: 'allergy',
          pronunciation: '/ˈælədʒi/',
          partOfSpeech: 'noun',
          definition: 'A bad reaction your body has to something',
          exampleSentence: 'I have an allergy to peanuts.',
        },
      ],
    },
    listening: {
      title: "In the Doctor's Office",
      instruction: 'Listen to the conversation between a patient and doctor.',
      audioText:
        "So tell me, what brings you in today? I see — a sore throat for three days now. Any fever? Yes, a small one yesterday. Okay, let me take a look. Open your mouth and say 'ah'. Mm-hm. I think you have a throat infection. I'm going to write you a prescription for some antibiotics. Take one pill twice a day for seven days.",
      questions: [
        {
          id: 'l1',
          question: 'How long has the patient had a sore throat?',
          options: ['One day', 'Two days', 'Three days', 'A week'],
          correct: 2,
        },
        {
          id: 'l2',
          question: 'What does the doctor prescribe?',
          options: ['Vitamins', 'Antibiotics', 'Pain killers', 'Cough syrup'],
          correct: 1,
        },
      ],
    },
    speaking: {
      title: 'Describing How You Feel',
      instruction: 'Repeat each phrase. Focus on clear pronunciation of the body parts.',
      drills: [
        { id: 's1', phrase: 'I have a pain in my chest.', tip: 'Stress "PAIN" — make it clear this is the problem.' },
        { id: 's2', phrase: 'I am allergic to penicillin.', tip: 'Pronounce "allergic" carefully: a-LER-jik.' },
      ],
      conversationPrompt:
        'You have had a bad headache for two days. Record yourself talking to a doctor. Include: how long you have had the headache, where the pain is, and any other symptoms.',
    },
    practice: {
      title: 'Quick Check',
      instruction: 'Choose the best answer.',
      questions: [
        {
          id: 'p1',
          question: 'What is a "symptom"?',
          options: ['A type of medicine', 'A sign that you are sick', 'A doctor', 'A hospital'],
          correct: 1,
        },
        {
          id: 'p2',
          question: 'Where do you go to get medicine?',
          options: ['The bank', 'The pharmacy', 'The school', 'The post office'],
          correct: 1,
        },
        {
          id: 'p3',
          question: 'Fill in the blank: "I need to fill my _____ at the drugstore."',
          options: ['symptom', 'fever', 'prescription', 'allergy'],
          correct: 2,
        },
      ],
    },
    writing: {
      title: 'Note for Your Doctor',
      instruction: 'Write your response in the box below.',
      prompt:
        'Write a short note describing your symptoms to a doctor. Include at least three symptoms and how long you have had them.',
      minWords: 30,
    },
    review: {
      title: "Today's Key Points",
      keyTakeaways: [
        'You learned 5 health words: symptom, prescription, pain, fever, allergy.',
        'You practised describing how you feel to a doctor.',
        'You wrote a clear note about your health.',
      ],
    },
  },

  // ── 4: Family & community ──
  {
    topic: 'Family and Neighbours',
    objective: 'Talk about your family and have small talk with a neighbour.',
    warmup: {
      title: 'About Your Family',
      instruction: 'Think about the people closest to you.',
      prompt: 'Who do you live with? Tell me a little about one family member. Describe in 2-3 sentences.',
    },
    vocabulary: {
      title: 'Family & Community Words',
      instruction: 'Click each word to see its meaning. Then try to use it in a sentence.',
      words: [
        {
          word: 'neighbour',
          pronunciation: '/ˈneɪbə/',
          partOfSpeech: 'noun',
          definition: 'A person who lives near you',
          exampleSentence: 'My neighbour is very friendly.',
        },
        {
          word: 'relative',
          pronunciation: '/ˈrɛlətɪv/',
          partOfSpeech: 'noun',
          definition: 'A member of your family',
          exampleSentence: 'I have many relatives in Mexico.',
        },
        {
          word: 'borrow',
          pronunciation: '/ˈbɒrəʊ/',
          partOfSpeech: 'verb',
          definition: 'To use something that belongs to someone else',
          exampleSentence: 'Can I borrow your pen?',
        },
        {
          word: 'invite',
          pronunciation: '/ɪnˈvaɪt/',
          partOfSpeech: 'verb',
          definition: 'To ask someone to come somewhere',
          exampleSentence: 'We invited our neighbours for dinner.',
        },
        {
          word: 'together',
          pronunciation: '/təˈɡɛðə/',
          partOfSpeech: 'adverb',
          definition: 'With another person or group',
          exampleSentence: 'My family eats dinner together every night.',
        },
      ],
    },
    listening: {
      title: 'Meeting a Neighbour',
      instruction: 'Listen to two neighbours meeting in the hallway.',
      audioText:
        "Hi there! I think we're new neighbours. My name is Sandra, I just moved into apartment 4B last week. Oh nice to meet you! I'm Pablo, I live in 4C with my wife and two kids. Welcome to the building. If you ever need anything — sugar, a tool, anything — just knock on our door.",
      questions: [
        {
          id: 'l1',
          question: 'Who just moved in?',
          options: ['Pablo', 'Sandra', "Pablo's wife", 'A child'],
          correct: 1,
        },
        {
          id: 'l2',
          question: 'How does Pablo respond?',
          options: ['He ignores her', 'He is angry', 'He is friendly and helpful', 'He is too busy'],
          correct: 2,
        },
      ],
    },
    speaking: {
      title: 'Friendly Small Talk',
      instruction: 'Repeat each phrase. Focus on a warm, friendly tone.',
      drills: [
        {
          id: 's1',
          phrase: 'Nice to meet you. How are you settling in?',
          tip: 'Smile while you say it — a friendly tone makes a big difference.',
        },
        {
          id: 's2',
          phrase: 'If you need anything, just let me know.',
          tip: 'Say it slowly and warmly — this is a kind offer.',
        },
      ],
      conversationPrompt:
        'A new neighbour just moved into your building. Record yourself introducing yourself. Include: your name, how long you have lived there, and offering to help with something.',
    },
    practice: {
      title: 'Quick Check',
      instruction: 'Choose the best answer.',
      questions: [
        {
          id: 'p1',
          question: 'Who is a "relative"?',
          options: ['A friend at work', 'A member of your family', 'Your boss', 'A stranger'],
          correct: 1,
        },
        {
          id: 'p2',
          question: 'Which is a friendly thing to say to a new neighbour?',
          options: ['Go away.', 'Welcome to the building!', 'I am too busy.', 'What do you want?'],
          correct: 1,
        },
        {
          id: 'p3',
          question: 'Fill in the blank: "Can I _____ your ladder for an hour?"',
          options: ['invite', 'borrow', 'together', 'neighbour'],
          correct: 1,
        },
      ],
    },
    writing: {
      title: 'Note for a Neighbour',
      instruction: 'Write your response in the box below.',
      prompt:
        'Write a short, friendly note to a new neighbour. Introduce yourself, welcome them, and offer to help if they need anything.',
      minWords: 30,
    },
    review: {
      title: "Today's Key Points",
      keyTakeaways: [
        'You learned 5 community words: neighbour, relative, borrow, invite, together.',
        'You practised friendly phrases for meeting new people.',
        'You wrote a welcoming note to a neighbour.',
      ],
    },
  },
];

function getFallbackLesson(level, day) {
  const dayNum = parseInt(day, 10) || 1;
  const idx = (dayNum - 1) % FALLBACK_LESSONS.length;
  // Return a deep clone so render code can't mutate the shared template across days
  return JSON.parse(JSON.stringify(FALLBACK_LESSONS[idx]));
}

// ══════════════════════════════════════════════════════
// BUILD STEPS FROM LESSON CONTENT
// ══════════════════════════════════════════════════════
function buildSteps(lesson) {
  return [
    { type: 'warmup', data: lesson.warmup, meta: STEP_STRUCTURE[0] },
    { type: 'vocabulary', data: lesson.vocabulary, meta: STEP_STRUCTURE[1] },
    { type: 'listening', data: lesson.listening, meta: STEP_STRUCTURE[2] },
    { type: 'speaking', data: lesson.speaking, meta: STEP_STRUCTURE[3] },
    { type: 'practice', data: lesson.practice, meta: STEP_STRUCTURE[4] },
    { type: 'writing', data: lesson.writing, meta: STEP_STRUCTURE[5] },
    { type: 'review', data: lesson.review, meta: STEP_STRUCTURE[6] },
  ];
}

// ══════════════════════════════════════════════════════
// STEP BAR: eight-pixel segments, "Step 3 of 7" beside them
// ══════════════════════════════════════════════════════
function buildStepDots() {
  $('stepDots').innerHTML = state.steps
    .map((s, i) => `<div class="fp-steps__seg step-dot${i === 0 ? ' is-current' : ''}" id="dot-${i}"></div>`)
    .join('');
  $('stepDots').setAttribute('aria-valuemax', String(state.steps.length));
}

function updateStepDots() {
  state.steps.forEach((_, i) => {
    const dot = $(`dot-${i}`);
    if (!dot) return;
    dot.className = 'fp-steps__seg step-dot';
    if (i < state.currentStep) dot.classList.add('is-completed');
    else if (i === state.currentStep) dot.classList.add('is-current');
  });
  const n = state.currentStep + 1,
    total = state.steps.length;
  $('stepCountLabel').innerHTML = bi(`Step ${n} of ${total}`, `Paso ${n} de ${total}`);
  $('stepDots').setAttribute('aria-valuenow', String(n));
  $('stepDots').setAttribute('aria-valuetext', FP.ui.label(`Step ${n} of ${total}`, `Paso ${n} de ${total}`));
}

/** The big button: "Continue", or "Finish lesson" on the last step. */
function updateNextButton() {
  const last = state.currentStep === state.steps.length - 1;
  $('btnNext').innerHTML = last
    ? '<span class="fp-bi">Finish lesson<span class="fp-bi__es" lang="es">Terminar la lección</span></span>' +
      FP.icon('check')
    : '<span class="fp-bi">Continue<span class="fp-bi__es" lang="es">Continuar</span></span>' +
      FP.icon('arrow_right_alt');
}

// ══════════════════════════════════════════════════════
// RENDER STEP
// ══════════════════════════════════════════════════════
function renderStep() {
  const step = state.steps[state.currentStep];
  const meta = step.meta;
  const data = step.data;

  // Update header
  $('stepNumBadge').textContent = state.currentStep + 1;
  $('stepTypeLabel').innerHTML = bi(meta.label, meta.label_es);
  $('stepTitleLabel').innerHTML = data.title ? biText(data.title, data.title_es) : bi(meta.title, meta.title_es);

  updateStepDots();
  updateNextButton();

  // Render activity
  const wrap = $('activityWrap');
  wrap.innerHTML = '';

  switch (step.type) {
    case 'warmup':
      renderWarmup(wrap, data);
      break;
    case 'vocabulary':
      renderVocabulary(wrap, data);
      break;
    case 'listening':
      renderListening(wrap, data);
      break;
    case 'speaking':
      renderSpeaking(wrap, data);
      break;
    case 'practice':
      renderPractice(wrap, data);
      break;
    case 'writing':
      renderWriting(wrap, data);
      break;
    case 'review':
      renderReview(wrap, data);
      break;
  }

  FP.ui.localizeAttrs(wrap); // placeholders and aria-labels carry their Spanish in data-*-es
  restoreStepInputs(wrap);

  // Focus management: a screen reader hears the new step's title; the keyboard does not pop up.
  const title = $('stepTitleLabel');
  title.tabIndex = -1;
  title.focus({ preventScroll: true });
}

// ── Events: one set of delegated listeners for everything the steps render ──
function initLessonEvents() {
  const wrap = $('activityWrap');
  wrap.addEventListener('click', function (e) {
    const t = e.target.closest('[data-act]');
    if (!t || !wrap.contains(t)) return;
    switch (t.dataset.act) {
      case 'reveal':
        revealWord(t.closest('.vocab-item'));
        break;
      case 'hear-word':
        speakWord(t.dataset.word);
        break;
      case 'mcq':
        selectMcq(t);
        break;
      case 'listen-play':
        playListening();
        break;
      case 'listen-stop':
        stopListening();
        break;
      case 'hear-model':
        speakText(t.dataset.phrase);
        break;
      case 'drill':
        startDrill(t.dataset.id, t.dataset.phrase);
        break;
      case 'conv':
        toggleConvRecording();
        break;
      case 'conf':
        selectConfidence(t);
        break;
    }
  });
  wrap.addEventListener('input', function (e) {
    const key = e.target.dataset && e.target.dataset.answerKey;
    if (!key) return;
    if (key === 'writing') updateWritingWC(e.target, parseInt(e.target.dataset.min, 10) || 50);
    else saveAnswer(key, e.target.value);
  });
  wrap.addEventListener('change', function (e) {
    if (e.target.dataset && e.target.dataset.skipFor) toggleSkip(e.target);
  });
  // Radio groups (answer tiles, confidence faces): arrows move between options, one tab stop per group.
  wrap.addEventListener('keydown', function (e) {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    const group = e.target.closest('[role="radiogroup"]');
    if (!group) return;
    const radios = Array.from(group.querySelectorAll('[role="radio"]'));
    const at = radios.indexOf(e.target);
    if (at < 0) return;
    e.preventDefault();
    const next = radios[(at + step + radios.length) % radios.length];
    radios.forEach((b) => {
      b.tabIndex = b === next ? 0 : -1;
    });
    next.focus();
  });
}

// ── Building blocks ──
/** A writing/answer box. `min` makes it a word-counted writing task. */
function answerBox(id, key, o) {
  return (
    '<textarea class="fp-textarea writing-area' +
    (o.short ? ' writing-area--short' : '') +
    '" id="' +
    id +
    '" data-answer-key="' +
    key +
    '"' +
    (o.min ? ' data-min="' + o.min + '"' : '') +
    ' placeholder="' +
    FP.ui.esc(o.ph[0]) +
    '" data-ph-es="' +
    FP.ui.esc(o.ph[1]) +
    '"' +
    ' aria-label="' +
    FP.ui.esc(o.label[0]) +
    '" data-label-es="' +
    FP.ui.esc(o.label[1]) +
    '"></textarea>'
  );
}
function skipLabel(inputId, key, en, es, checkboxId) {
  return (
    '<label class="skip-label"><input type="checkbox"' +
    (checkboxId ? ' id="' + checkboxId + '"' : '') +
    ' data-skip-for="' +
    inputId +
    '" data-skip-key="' +
    key +
    '">' +
    bi(en, es) +
    '</label>'
  );
}
function promptBox(labelEn, labelEs, innerHtml) {
  return (
    '<div class="prompt-box"><span class="prompt-box__label">' + bi(labelEn, labelEs) + '</span>' + innerHtml + '</div>'
  );
}
/** A banner with an icon (info | warning | success | error); `html` is already escaped. */
function bannerHtml(variant, html, extraClass) {
  const icon = { info: 'lightbulb', warning: 'warning', success: 'check', error: 'warning' }[variant] || 'lightbulb';
  return (
    '<div class="fp-banner fp-banner--' +
    variant +
    (extraClass ? ' ' + extraClass : '') +
    '" role="note">' +
    FP.icon(icon, { className: 'fp-banner__icon' }) +
    '<div class="fp-banner__body">' +
    html +
    '</div></div>'
  );
}

/** After a resume the typed answers are put back (and a skipped box stays skipped). */
function restoreStepInputs(wrap) {
  wrap.querySelectorAll('textarea[data-answer-key]').forEach(function (ta) {
    const v = state.answers[ta.dataset.answerKey];
    if (v === '[SKIPPED]') {
      const cb = wrap.querySelector('input[data-skip-for="' + ta.id + '"]');
      if (cb) {
        cb.checked = true;
        ta.disabled = true;
      }
    } else if (typeof v === 'string' && v) {
      ta.value = v;
      if (ta.dataset.answerKey === 'writing') updateWritingWC(ta, parseInt(ta.dataset.min, 10) || 50, true);
    }
  });
  wrap.querySelectorAll('.mcq-options').forEach(function (group) {
    const key = group.dataset.prefix === 'l' ? 'listening' : 'practice';
    const saved = state.answers[key + '_' + group.dataset.qid];
    if (saved !== undefined) applyMcqResult(group, parseInt(saved, 10), parseInt(group.dataset.correct, 10));
  });
  const conf = state.answers['confidence'];
  const confBtn = conf != null && wrap.querySelector('.conf-btn[data-val="' + conf + '"]');
  if (confBtn) selectConfidence(confBtn, true);
}

// ── WARMUP ──
function renderWarmup(wrap, data) {
  var lc = state.lessonContent || {};
  wrap.innerHTML = `
    <div class="activity-card">
      <div class="ac-label">${bi("Today's objective", 'Objetivo de hoy')}</div>
      <h3 class="ac-heading">${lc.topic ? biText(lc.topic, lc.topic_es) : bi("Today's topic", 'El tema de hoy')}</h3>
      <div class="ac-body">${biText(lc.objective || '', lc.objective_es)}</div>
    </div>
    <div class="activity-card">
      <div class="ac-label">${bi('Warm-up', 'Calentamiento')}</div>
      <div class="ac-body">${biText(data.instruction, data.instruction_es)}</div>
      ${promptBox('Think about this', 'Piensa en esto', biText(data.prompt, data.prompt_es))}
      ${answerBox('warmup-resp', 'warmup', { short: true, ph: ['Type your answer here…', 'Escribe tu respuesta aquí…'], label: ['Your answer', 'Tu respuesta'] })}
      ${skipLabel('warmup-resp', 'warmup', 'Skip this question', 'Omitir esta pregunta')}
    </div>
  `;
}

// ── VOCABULARY ──
function renderVocabulary(wrap, data) {
  const list = data.words || [];
  const words = list
    .map(
      (w, i) => `
    <div class="vocab-item">
      <div class="vocab-row">
        <button type="button" class="vocab-toggle" data-act="reveal" aria-expanded="false" aria-controls="vdef-${i}">
          <span class="vi-word">${escHtml(w.word)}</span>
          <span class="vi-pron">${escHtml(w.pronunciation || '')}${w.partOfSpeech ? ' · ' + escHtml(w.partOfSpeech) : ''}</span>
          <span class="vi-hint">${bi('Tap to see meaning', 'Toca para ver el significado')}</span>
        </button>
        <button type="button" class="vocab-hear" data-act="hear-word" data-word="${escHtml(w.word)}" aria-label="${escHtml(FP.ui.label('Hear the word', 'Escuchar la palabra') + ': ' + w.word)}">${FP.icon('volume_up')}</button>
      </div>
      <div class="vi-def" id="vdef-${i}">
        <strong>${biText(w.definition, w.definition_es)}</strong>
        <span class="vi-example">${biText('"' + (w.exampleSentence || '') + '"', w.exampleSentence_es ? '"' + w.exampleSentence_es + '"' : '')}</span>
      </div>
    </div>
  `
    )
    .join('');

  wrap.innerHTML = `
    <div class="activity-card">
      <div class="ac-label">${bi('Vocabulary · ' + list.length + ' ' + plural(list.length, 'word', 'words'), 'Vocabulario · ' + list.length + ' ' + plural(list.length, 'palabra', 'palabras'))}</div>
      <div class="ac-body">${biText(data.instruction, data.instruction_es)}</div>
      <div class="vocab-grid">${words}</div>
    </div>
    <div class="activity-card">
      <div class="ac-label">${bi('Practice with these words', 'Practica con estas palabras')}</div>
      <h3 class="ac-heading">${bi('Use them in sentences', 'Úsalas en oraciones')}</h3>
      <div class="ac-body">${bi("Choose any 2 of today's words and write your own sentence using each one.", 'Elige 2 de las palabras de hoy y escribe una oración con cada una.')}</div>
      ${answerBox('vocab-practice', 'vocab_practice', { short: true, ph: ['Write your sentences here…', 'Escribe tus oraciones aquí…'], label: ['Your sentences', 'Tus oraciones'] })}
      ${skipLabel('vocab-practice', 'vocab_practice', 'Skip this question', 'Omitir esta pregunta')}
    </div>
  `;
}

function revealWord(item) {
  if (!item) return;
  const open = item.classList.toggle('revealed');
  const toggle = item.querySelector('.vocab-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/** N-19: the word arrives as data, never pasted into a script, so an apostrophe cannot break it. */
function speakWord(word) {
  speakEnglish(word);
}

// ── Multiple choice (listening and practice) ──
/** One question as a radiogroup of answer tiles. prefix: 'l' (listening) or 'p' (practice). */
function mcqBlock(prefix, q, qi) {
  const qt = 'qt-' + prefix + qi;
  const qid = escHtml(q.id);
  const opts = (q.options || [])
    .map(
      (o, oi) =>
        '<button type="button" class="fp-answer mcq-opt" id="' +
        prefix +
        'o-' +
        qid +
        '-' +
        oi +
        '" role="radio" aria-checked="false" tabindex="' +
        (oi === 0 ? 0 : -1) +
        '" data-act="mcq" data-i="' +
        oi +
        '">' +
        '<span class="opt-letter" aria-hidden="true">' +
        String.fromCharCode(65 + oi) +
        '</span><span class="opt-text">' +
        escHtml(o) +
        '</span></button>'
    )
    .join('');
  return (
    '<div class="q-block"><div class="q-text" id="' +
    qt +
    '">' +
    (qi + 1) +
    '. ' +
    biText(q.question, q.question_es) +
    '</div>' +
    '<div class="mcq-options" role="radiogroup" aria-labelledby="' +
    qt +
    '" data-prefix="' +
    prefix +
    '" data-qid="' +
    qid +
    '" data-correct="' +
    String(parseInt(q.correct, 10)) +
    '">' +
    opts +
    '</div>' +
    '<div class="q-feedback" id="' +
    prefix +
    'f-' +
    qid +
    '" aria-live="polite"></div></div>'
  );
}

function verdictHtml(ok) {
  return (
    '<span class="fp-answer__verdict">' +
    FP.icon(ok ? 'check_small' : 'close_small', { size: 'sm' }) +
    (ok ? bi('Correct', 'Correcto') : bi('Incorrect', 'Incorrecto')) +
    '</span>'
  );
}

/** Show the result on a question's tiles and feedback line. Pure display: it records nothing. */
function applyMcqResult(group, chosen, correct) {
  group.dataset.answered = '1';
  const opts = Array.from(group.querySelectorAll('.mcq-opt'));
  opts.forEach(function (el, i) {
    el.classList.add('is-answered');
    el.setAttribute('aria-checked', i === chosen ? 'true' : 'false');
    el.tabIndex = i === chosen ? 0 : -1;
  });
  const chosenEl = opts[chosen],
    correctEl = opts[correct];
  const letter = String.fromCharCode(65 + correct);
  const fb = $(group.dataset.prefix + 'f-' + group.dataset.qid);
  let fbHtml, fbClass;
  if (chosen === correct) {
    if (chosenEl) {
      chosenEl.classList.add('is-correct');
      chosenEl.insertAdjacentHTML('beforeend', verdictHtml(true));
    }
    fbHtml = FP.icon('check') + '<div>' + bi('Correct!', '¡Correcto!') + '</div>';
    fbClass = 'correct-fb';
  } else {
    if (chosenEl) {
      chosenEl.classList.add('is-wrong');
      chosenEl.insertAdjacentHTML('beforeend', verdictHtml(false));
    }
    if (correctEl) {
      correctEl.classList.add('is-correct');
      correctEl.insertAdjacentHTML('beforeend', verdictHtml(true));
    }
    fbHtml =
      FP.icon('close_small') +
      '<div>' +
      (group.dataset.prefix === 'l'
        ? bi('The correct answer was ' + letter + '.', 'La respuesta correcta era ' + letter + '.')
        : bi('Not quite. The answer was ' + letter + '.', 'Casi. La respuesta era ' + letter + '.')) +
      '</div>';
    fbClass = 'wrong-fb';
  }
  if (fb) {
    fb.className = 'q-feedback show ' + fbClass;
    fb.innerHTML = fbHtml;
  }
}

function selectMcq(btn) {
  const group = btn.closest('.mcq-options');
  if (!group || group.dataset.answered) return;
  const qid = group.dataset.qid;
  const correct = parseInt(group.dataset.correct, 10);
  const chosen = parseInt(btn.dataset.i, 10);
  applyMcqResult(group, chosen, correct);

  const key = group.dataset.prefix === 'l' ? 'listening' : 'practice';
  saveAnswer(`${key}_${qid}`, chosen);
  saveAnswer(`${key}_${qid}_correct`, correct);
  saveAnswer(`${key}_${qid}_is_right`, chosen === correct ? 1 : 0);
  // Track the score
  if (!state.answers[key + '_total']) state.answers[key + '_total'] = 0;
  if (!state.answers[key + '_correct']) state.answers[key + '_correct'] = 0;
  state.answers[key + '_total']++;
  if (chosen === correct) state.answers[key + '_correct']++;
}

// ── LISTENING ──
let listeningPlays = 0;
const MAX_PLAYS = 3;

function playsLeftHtml(left) {
  return left === 0
    ? bi('No plays left', 'No quedan reproducciones')
    : bi(
        left + ' ' + plural(left, 'play', 'plays') + ' left',
        'Quedan ' + left + ' ' + plural(left, 'reproducción', 'reproducciones')
      );
}

function renderListening(wrap, data) {
  listeningPlays = 0;
  courseListenStart = null;
  courseListenTotal = 0;
  const qs = (data.questions || []).map((q, qi) => mcqBlock('l', q, qi)).join('');

  wrap.innerHTML = `
    <div class="activity-card">
      <div class="ac-label">${bi('Listening comprehension', 'Comprensión auditiva')}</div>
      <div class="ac-body">${biText(data.instruction, data.instruction_es)}</div>
      <div class="audio-box fp-audio" id="listenBox">
        <button type="button" class="fp-audio__play" id="listenBtn" data-act="listen-play" aria-label="Play audio" data-label-es="Reproducir audio">${FP.icon('play_arrow')}</button>
        <button type="button" class="fp-audio__play is-stop fp-hidden" id="listenStopBtn" data-act="listen-stop" aria-label="Stop audio" data-label-es="Detener audio">${FP.icon('stop')}</button>
        <div class="audio-info">
          <span class="ai-label">Audio</span>
          <span class="ai-status" id="listenStatus" aria-live="polite">${bi('Press play. You can listen up to 3 times.', 'Toca reproducir. Puedes escuchar hasta 3 veces.')}</span>
          <span class="ai-time fp-hidden" id="listenPlayTime"></span>
        </div>
        <div class="fp-audio__plays audio-plays" id="listenPlays">${playsLeftHtml(MAX_PLAYS)}</div>
      </div>
    </div>
    <div class="activity-card">
      <div class="ac-label">${bi('Comprehension questions', 'Preguntas de comprensión')}</div>
      <h3 class="ac-heading">${bi('Answer what you heard', 'Responde lo que escuchaste')}</h3>
      ${qs}
    </div>
  `;
}

var courseListenStart = null;
var courseListenTotal = 0;

function playListening() {
  if (listeningPlays >= MAX_PLAYS) return;
  if (!window.speechSynthesis) {
    $('listenStatus').innerHTML = bi(
      'Audio is not available on this device. Ask your teacher to read the text with you on the video call.',
      'El audio no está disponible en este dispositivo. Pide a tu profesor que lea el texto contigo en la videollamada.'
    );
    return;
  }
  listeningPlays++;
  var left = MAX_PLAYS - listeningPlays;
  $('listenPlays').innerHTML = playsLeftHtml(left);
  $('listenStatus').innerHTML = bi('Playing…', 'Reproduciendo…');
  setHidden($('listenBtn'), true);
  setHidden($('listenStopBtn'), false);
  $('listenStopBtn').focus({ preventScroll: true });
  courseListenStart = Date.now();
  if (left === 0) $('listenBox').classList.add('is-spent');
  var text = state.steps[state.currentStep]?.data?.audioText || 'No audio available.';
  speakText(text, function () {
    finishCourseListening(left);
  });
}

function stopListening() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  finishCourseListening(MAX_PLAYS - listeningPlays);
}

function finishCourseListening(left) {
  if (courseListenStart) {
    courseListenTotal += Date.now() - courseListenStart;
    courseListenStart = null;
  }
  var stopBtn = $('listenStopBtn'),
    playBtn = $('listenBtn');
  if (!stopBtn || !playBtn) return; // the student already moved on
  var hadFocus = document.activeElement === stopBtn;
  setHidden(stopBtn, true);
  setHidden(playBtn, false);
  if (left === 0) playBtn.disabled = true;
  else if (hadFocus) playBtn.focus({ preventScroll: true });
  $('listenStatus').innerHTML =
    left > 0
      ? bi('Tap to listen again', 'Toca para escuchar de nuevo')
      : bi('No more plays', 'No hay más reproducciones');
  var ptEl = $('listenPlayTime');
  setHidden(ptEl, false);
  var s = Math.round(courseListenTotal / 1000);
  var t = s < 60 ? s + 's' : Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  ptEl.innerHTML = bi(t + ' listened', t + ' escuchados');
}

// Audio recording state (MediaRecorder, per drill + conversation)
let audioRecordings = {}; // { drillId: Blob, 'conversation': Blob }
let convMediaRecorder = null; // active MediaRecorder for conversation prompt

// Shared mic stream — acquired once for the whole speaking step so sequential
// drills don't have to compete for the microphone.
let speakingStream = null;

/** Get (or create) the shared mic stream. Returns null if unavailable. */
async function getSpeakingStream() {
  if (speakingStream && speakingStream.active) return speakingStream;
  const mime = getAudioMimeType();
  if (!window.MediaRecorder || !mime) return null;
  try {
    speakingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return speakingStream;
  } catch (e) {
    console.warn('[FluentPath] Could not acquire mic for audio recording:', e);
    return null;
  }
}

/** Release the shared mic stream (called after lesson is submitted). */
function releaseSpeakingStream() {
  if (speakingStream) {
    speakingStream.getTracks().forEach((t) => t.stop());
    speakingStream = null;
  }
}

/** Return the best supported MIME type for audio recording */
function getAudioMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

/** Extract file extension from MIME type string */
function audioExtension(mime) {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

/** Convert a Blob to a base64 string (returns Promise<string>) */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is data:<mime>;base64,<data>  — strip the prefix
      const b64 = reader.result.split(',')[1];
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload all collected audio recordings to Apps Script / Drive.
 * Returns the speaking_audio_json string to store in Course Progress,
 * or null if nothing was recorded or upload failed.
 */
async function uploadAudioRecordings() {
  if (!window.MediaRecorder) return null;
  const mime = getAudioMimeType();
  const ext = audioExtension(mime);
  const keys = Object.keys(audioRecordings);
  if (keys.length === 0) return null;

  const recordings = {};
  const scores = {};

  for (const key of keys) {
    const blob = audioRecordings[key];
    if (!blob || blob.size === 0) continue;
    try {
      const b64 = await blobToBase64(blob);
      recordings[key] = { data: b64, ext };
    } catch (e) {
      console.warn('[FluentPath] Could not encode audio for', key, e);
    }
    // Phonetic accuracy scores stored in state.answers
    const scoreKey = key === 'conversation' ? null : `drill_${key}_score`;
    if (scoreKey && state.answers[scoreKey] != null) {
      scores[key] = state.answers[scoreKey];
    }
  }

  if (Object.keys(recordings).length === 0) return null;

  const body = {
    action: 'save_audio',
    student_name: state.studentName,
    day_number: state.dayNumber,
    recordings,
    scores,
  };

  try {
    // postText sends text/plain (no CORS preflight; Apps Script reads
    // e.postData.contents regardless) and appends token + session (N-1).
    const json = await FP.api.postText(GOOGLE_SHEET_WEBHOOK + '?action=save_audio', JSON.stringify(body), {
      timeout: 60000,
    });
    if (json.result === 'error') {
      console.error('[FluentPath] Audio upload server error:', json.message);
    }
    if (json.warnings) {
      console.warn('[FluentPath] Audio upload warnings:', json.warnings);
    }
    return json.audio_json || null;
  } catch (e) {
    console.error('[FluentPath] Audio upload failed:', e);
    return null;
  }
}

// ── SPEAKING ──
let recognition = null;
let convRecording = false;

/**
 * IOS-1b: recording the student's voice needs only MediaRecorder and a
 * microphone. Speech recognition (the live transcript and the pronunciation
 * score) is a bonus that iPad/iPhone Safari does not reliably offer, so it must
 * never be what switches recording on or off.
 */
function canRecordAudio() {
  return !!window.MediaRecorder && !!getAudioMimeType();
}
function canTranscribe() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** In-page messages (never alert()): bilingual markup, shown in a status line under the control. */
var MSG_NO_RECORDING = bi(
  'Recording is not available on this device or browser. Update your device and open FluentPath in Safari, or practise aloud with your teacher on the video call.',
  'La grabación no está disponible en este dispositivo o navegador. Actualiza tu dispositivo y abre FluentPath en Safari, o practica en voz alta con tu profesor en la videollamada.'
);
var MSG_MIC_DENIED = bi(
  'Microphone access was denied. Please allow the microphone for this site in your device settings, then tap the microphone again.',
  'Se denegó el acceso al micrófono. Permite el micrófono para este sitio en los ajustes de tu dispositivo y toca el micrófono de nuevo.'
);

/** Show (or clear, with empty html) a message in a status line. kind: 'error' or plain. */
function setRecMsg(id, html, isError) {
  var el = $(id);
  if (!el) return;
  el.className = 'rec-status' + (html ? ' show' : '') + (isError ? ' is-error' : '');
  el.innerHTML = html || '';
}

/** One place for the record button's look (spec 6.6): idle, requesting, recording, recorded, failed. */
const REC_STATES = {
  idle: { icon: 'mic', fill: false, en: 'Record yourself', es: 'Grábate' },
  requesting: { icon: 'mic', fill: false, en: 'Allow the microphone', es: 'Permite el micrófono' },
  recording: { icon: 'stop', fill: true, en: 'Recording… tap to stop', es: 'Grabando… toca para detener' },
  recorded: {
    icon: 'mic',
    fill: false,
    en: 'Recorded. Tap to record again.',
    es: 'Grabado. Toca para grabar de nuevo.',
  },
  failed: {
    icon: 'mic',
    fill: false,
    en: 'Could not record. Tap to try again.',
    es: 'No pudimos grabar. Toca para intentar de nuevo.',
  },
};
const CONV_LABELS = {
  idle: { en: 'Tap to start speaking. Aim for 30+ seconds.', es: 'Toca para empezar a hablar. Intenta 30+ segundos.' },
};
function setMicUi(btn, labelEl, stateName, overrides) {
  if (!btn) return;
  const st = Object.assign({}, REC_STATES[stateName], overrides && overrides[stateName]);
  btn.classList.remove('is-requesting', 'is-recording', 'is-recorded', 'is-failed');
  if (stateName !== 'idle') btn.classList.add('is-' + stateName);
  btn.setAttribute('aria-pressed', stateName === 'recording' ? 'true' : 'false');
  btn.setAttribute('aria-label', FP.ui.label(st.en, st.es));
  btn.innerHTML = FP.icon(st.icon, { fill: st.fill });
  if (labelEl) labelEl.innerHTML = bi(st.en, st.es);
}
function setDrillUi(id, stateName) {
  setMicUi($('drill-btn-' + id), $('drill-label-' + id), stateName);
}
function setConvUi(stateName) {
  setMicUi($('convBtn'), $('convStatus'), stateName, CONV_LABELS);
  var box = $('convRecorder');
  if (box) box.classList.toggle('recording', stateName === 'recording' || stateName === 'requesting');
}

/** Play back the take the student just made, so "recorded" is something they can check. */
var previewUrls = {};
function showRecordingPreview(containerId, blob) {
  var box = $(containerId);
  if (!box) return;
  if (previewUrls[containerId]) URL.revokeObjectURL(previewUrls[containerId]);
  var url = URL.createObjectURL(blob);
  previewUrls[containerId] = url;
  box.innerHTML =
    '<audio class="fp-audio-preview" controls src="' +
    url +
    '" aria-label="' +
    escHtml(FP.ui.label('Your recording', 'Tu grabación')) +
    '"></audio>';
}

function youSaid(text) {
  return '<span class="transcript-label">' + bi('You said:', 'Dijiste:') + '</span>"' + escHtml(text) + '"';
}

function renderSpeaking(wrap, data) {
  const record = canRecordAudio();
  const transcribe = canTranscribe();
  const canRecord = record || transcribe;

  // N-24: recordings live only in this page until the lesson is submitted. Say so.
  let notes;
  if (!canRecord) {
    notes = bannerHtml('warning', MSG_NO_RECORDING, 'rec-note');
  } else if (record) {
    notes = bannerHtml(
      'info',
      bi(
        'Your voice recordings stay on this page until you finish the lesson, then they are sent to your teacher. If you close or reload this page first, they are lost.',
        'Tus grabaciones se quedan en esta página hasta que termines la lección y luego se envían a tu profesor. Si cierras o recargas la página antes, se pierden.'
      ) +
        (transcribe
          ? ''
          : '<div class="fp-mt-3">' +
            bi(
              'Automatic feedback is not available on this device.',
              'La retroalimentación automática no está disponible en este dispositivo.'
            ) +
            '</div>'),
      'rec-note'
    );
  } else {
    notes = bannerHtml(
      'info',
      bi(
        'Your voice cannot be saved on this device, so your teacher will not hear it. You still get feedback as you speak.',
        'Tu voz no se puede guardar en este dispositivo, así que tu profesor no la escuchará. Aun así recibes retroalimentación mientras hablas.'
      ),
      'rec-note'
    );
  }

  const drillList = data.drills || [];
  const drills = drillList
    .map(
      (d) => `
    <div class="activity-card">
      <div class="ac-label">${bi('Drill · Pronunciation', 'Ejercicio · Pronunciación')}</div>
      <div class="drill-phrase">"${escHtml(d.phrase)}"</div>
      <div class="drill-tip">${FP.icon('lightbulb')}<div>${biText(d.tip, d.tip_es)}</div></div>
      <div class="drill-actions">
        <button type="button" class="fp-btn fp-btn--secondary" data-act="hear-model" data-phrase="${escHtml(d.phrase)}">${FP.icon('volume_up')}<span class="fp-bi">Hear the model<span class="fp-bi__es" lang="es">Escuchar el modelo</span></span></button>
        <div class="rec-control">
          <button type="button" class="fp-mic-btn" id="drill-btn-${escHtml(d.id)}" data-act="drill" data-id="${escHtml(d.id)}" data-phrase="${escHtml(d.phrase)}"${canRecord ? '' : ' disabled'}></button>
          <span class="rec-label" id="drill-label-${escHtml(d.id)}"></span>
        </div>
      </div>
      <div class="rec-status" id="rec-msg-${escHtml(d.id)}" role="alert"></div>
      <div id="drill-audio-${escHtml(d.id)}"></div>
      <div id="drill-transcript-${escHtml(d.id)}" class="record-transcript" aria-live="polite"></div>
      <div id="drill-feedback-${escHtml(d.id)}" class="record-feedback" aria-live="polite"></div>
    </div>
  `
    )
    .join('');

  wrap.innerHTML = `
    ${notes}
    ${drills}
    <div class="activity-card">
      <div class="ac-label">${bi('Free speaking task', 'Tarea de conversación libre')}</div>
      <h3 class="ac-heading">${data.conversationPrompt ? biText(data.conversationPrompt, data.conversationPrompt_es) : bi('Speaking practice', 'Práctica de conversación')}</h3>
      <div class="ac-body">${biText(data.instruction || '', data.instruction_es)}</div>
      <div class="recorder-box" id="convRecorder">
        <button type="button" class="fp-mic-btn record-btn" id="convBtn" data-act="conv"${canRecord ? '' : ' disabled'}></button>
        <div class="record-label">${bi('Free speaking', 'Conversación libre')}</div>
        <div class="record-status" id="convStatus" aria-live="polite"></div>
      </div>
      <div class="rec-status" id="conv-msg" role="alert"></div>
      <div id="conv-audio"></div>
      <div id="conv-transcript" class="record-transcript" aria-live="polite"></div>
    </div>
  `;

  drillList.forEach((d) => {
    if (canRecord) setDrillUi(d.id, 'idle');
    else
      $('drill-label-' + d.id).innerHTML = bi(
        'Recording not available on this device',
        'Grabación no disponible en este dispositivo'
      );
  });
  if (canRecord) setConvUi('idle');
  else
    $('convStatus').innerHTML = bi(
      'Recording not available on this device',
      'Grabación no disponible en este dispositivo'
    );
}

// Active drill recorders: { drillId: { rec, mediaRec, phrase } }
var activeDrills = {};

function startDrill(id, phrase) {
  const msgId = 'rec-msg-' + id;
  if (!canRecordAudio() && !canTranscribe()) {
    setRecMsg(msgId, MSG_NO_RECORDING, true);
    return;
  }
  const tEl = $('drill-transcript-' + id);
  const fEl = $('drill-feedback-' + id);

  // If already recording this drill, stop it
  if (activeDrills[id]) {
    stopDrill(id);
    return;
  }

  setRecMsg(msgId, '');
  fEl.className = 'record-feedback';
  fEl.innerHTML = '';
  setDrillUi(id, canRecordAudio() ? 'requesting' : 'recording');
  tEl.classList.add('show');
  tEl.textContent = '…';

  const mime = getAudioMimeType();
  let mediaRec = null;
  const audioChunks = [];

  // IOS-1b: ask for the microphone first, inside the tap that started this.
  const streamPromise = canRecordAudio() ? getSpeakingStream() : Promise.resolve(null);

  var fullTranscript = '';
  const SR = canTranscribe() ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
  let rec = null;
  if (SR) {
    rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (e) => {
      var text = '';
      for (var i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      fullTranscript = text.trim();
      tEl.innerHTML = youSaid(fullTranscript);
    };
    rec.onend = () => {
      // Restart if the user hasn't explicitly stopped
      if (activeDrills[id] && activeDrills[id].rec) {
        try {
          rec.start();
        } catch (e) {}
      }
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        // Recognition is refused. The recording itself may still work (iOS), so
        // drop only the transcript side and keep going if we can record.
        if (activeDrills[id]) activeDrills[id].rec = null;
        if (!canRecordAudio()) {
          setRecMsg(msgId, MSG_MIC_DENIED, true);
          delete activeDrills[id];
          setDrillUi(id, 'failed');
        }
      } else if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
        console.warn('[FluentPath] Speech recognition error:', ev.error, ev.message);
      }
    };
  }

  activeDrills[id] = { rec: rec, mediaRec: null, phrase: phrase, getTranscript: () => fullTranscript };

  if (rec) {
    try {
      rec.start();
    } catch (err) {
      // IOS-1b: a recogniser that will not start must not cost the student the recording.
      console.warn('[FluentPath] Could not start speech recognition:', err);
      activeDrills[id].rec = null;
      rec = null;
      if (!canRecordAudio()) {
        setRecMsg(msgId, MSG_MIC_DENIED, true);
        setDrillUi(id, 'failed');
        delete activeDrills[id];
        return;
      }
    }
  }

  const noCapture = () => {
    // No audio capture. With a working recogniser the transcript still counts;
    // without one there is nothing to record, so say so instead of hanging.
    if (!activeDrills[id]) return;
    if (!activeDrills[id].rec) {
      setRecMsg(msgId, MSG_MIC_DENIED, true);
      delete activeDrills[id];
      setDrillUi(id, 'failed');
    } else {
      setDrillUi(id, 'recording');
    }
  };

  streamPromise
    .then((stream) => {
      if (!activeDrills[id]) return;
      if (!stream) {
        noCapture();
        return;
      }
      mediaRec = new MediaRecorder(stream, { mimeType: mime });
      mediaRec.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunks.push(ev.data);
      };
      mediaRec.onstop = () => {
        if (audioChunks.length > 0) {
          audioRecordings[id] = new Blob(audioChunks, { type: mime });
          showRecordingPreview('drill-audio-' + id, audioRecordings[id]);
        }
      };
      activeDrills[id].mediaRec = mediaRec;
      mediaRec.start();
      setDrillUi(id, 'recording');
    })
    .catch(() => {
      noCapture(); /* audio capture unavailable — transcript still works */
    });
}

function stopDrill(id) {
  const drill = activeDrills[id];
  if (!drill) return;

  delete activeDrills[id];
  if (drill.rec)
    try {
      drill.rec.stop();
    } catch (e) {}
  if (drill.mediaRec && drill.mediaRec.state !== 'inactive')
    try {
      drill.mediaRec.stop();
    } catch (e) {}

  const tEl = $('drill-transcript-' + id);
  const fEl = $('drill-feedback-' + id);
  const said = drill.getTranscript();
  setDrillUi(id, said || drill.mediaRec ? 'recorded' : 'idle');

  if (said) {
    if (tEl) {
      tEl.innerHTML = youSaid(said);
      tEl.classList.add('show');
    }
    const score = similarity(said.toLowerCase(), drill.phrase.toLowerCase());
    if (fEl) {
      if (score > 0.7) {
        fEl.className = 'record-feedback show good';
        fEl.innerHTML =
          FP.icon('check') +
          '<div>' +
          bi('Great job! Your pronunciation was clear.', '¡Excelente! Tu pronunciación fue clara.') +
          '</div>';
      } else {
        fEl.className = 'record-feedback show ok';
        fEl.innerHTML =
          FP.icon('lightbulb') +
          '<div>' +
          bi('Keep practising. Try again and speak slowly.', 'Sigue practicando. Intenta de nuevo y habla despacio.') +
          '</div>';
      }
    }
    saveAnswer(`drill_${id}`, said);
    saveAnswer(`drill_${id}_score`, Math.round(score * 100) / 100);
  } else if (drill.rec || canTranscribe()) {
    if (tEl) tEl.innerHTML = bi('No speech detected. Try again.', 'No se detectó voz. Intenta de nuevo.');
  } else if (tEl) {
    // IOS-1b: recording-only device. There is no transcript to show, but the audio is kept.
    tEl.innerHTML = bi(
      'Recorded. It is sent to your teacher when you finish the lesson.',
      'Grabado. Se envía a tu profesor cuando termines la lección.'
    );
    tEl.classList.add('show');
  }
}

function toggleConvRecording() {
  if (!canRecordAudio() && !canTranscribe()) {
    setRecMsg('conv-msg', MSG_NO_RECORDING, true);
    return;
  }
  const tEl = $('conv-transcript');

  if (!convRecording) {
    convRecording = true;
    setRecMsg('conv-msg', '');
    setConvUi(canRecordAudio() ? 'requesting' : 'recording');

    // Start MediaRecorder using the shared stream (already granted by the drills).
    const mime = getAudioMimeType();
    const audioChunks = [];
    (canRecordAudio() ? getSpeakingStream() : Promise.resolve(null))
      .then((stream) => {
        if (!convRecording) return; // stopped while the microphone prompt was open
        if (!stream) {
          if (!canTranscribe()) {
            // nothing can capture the answer: say so, don't sit on "Recording…"
            setRecMsg('conv-msg', MSG_MIC_DENIED, true);
            convRecording = false;
            setConvUi('failed');
          } else {
            setConvUi('recording');
          }
          return;
        }
        convMediaRecorder = new MediaRecorder(stream, { mimeType: mime });
        convMediaRecorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunks.push(ev.data);
        };
        convMediaRecorder.onstop = () => {
          // Do NOT stop stream.getTracks() — releaseSpeakingStream() handles cleanup.
          if (audioChunks.length > 0) {
            audioRecordings['conversation'] = new Blob(audioChunks, { type: mime });
            showRecordingPreview('conv-audio', audioRecordings['conversation']);
          }
        };
        convMediaRecorder.start();
        setConvUi('recording');
      })
      .catch((err) => {
        console.warn('[FluentPath] MediaRecorder failed for conversation:', err);
        if (convRecording && !canTranscribe()) {
          setRecMsg('conv-msg', MSG_MIC_DENIED, true);
          convRecording = false;
          setConvUi('failed');
        }
      });

    if (!canTranscribe()) {
      recognition = null;
      return;
    } // IOS-1b: audio only; the recorder above is already running
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    let finalText = '';

    recognition.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      tEl.textContent = finalText + interim;
      tEl.classList.add('show');
      saveAnswer('speaking_conv', finalText.trim());
    };
    recognition.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') {
        console.warn('[FluentPath] Conversation speech recognition error:', e.error, e.message);
      }
      // IOS-1b: a refused/failed recogniser ends the transcript, not the recording.
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') recognition = null;
      if (
        e.error !== 'aborted' &&
        e.error !== 'no-speech' &&
        (!convMediaRecorder || convMediaRecorder.state === 'inactive')
      ) {
        convRecording = false;
        setConvUi('idle');
      }
      // Do not stop convMediaRecorder here — the user may click stop manually,
      // and continuous recognition fires onerror transiently without ending the session
    };
    try {
      recognition.start();
    } catch (err) {
      console.warn('[FluentPath] Could not start conversation speech recognition:', err);
      recognition = null; // the recorder keeps going
    }
  } else {
    convRecording = false;
    const hadAudio = !!(convMediaRecorder && convMediaRecorder.state !== 'inactive');
    recognition?.stop();
    if (hadAudio) convMediaRecorder.stop();
    setConvUi(hadAudio || state.answers['speaking_conv'] ? 'recorded' : 'idle');
  }
}

function similarity(a, b) {
  const aW = a.split(' '),
    bW = b.split(' ');
  const match = aW.filter((w) => bW.includes(w)).length;
  return match / Math.max(aW.length, bW.length);
}

// ── PRACTICE ──
function renderPractice(wrap, data) {
  const qs = (data.questions || []).map((q, qi) => mcqBlock('p', q, qi)).join('');

  wrap.innerHTML = `
    <div class="activity-card">
      <div class="ac-label">${bi('Comprehension & practice', 'Comprensión y práctica')}</div>
      <div class="ac-body">${biText(data.instruction, data.instruction_es)}</div>
    </div>
    <div class="activity-card">${qs}</div>
  `;
}

// ── WRITING ──
function wordCountHtml(words, min) {
  const w = plural(words, 'word', 'words'),
    p = plural(words, 'palabra', 'palabras');
  return words >= min
    ? FP.icon('check', { size: 'sm' }) + bi(`${words} ${w}. Goal reached.`, `${words} ${p}. Meta alcanzada.`)
    : bi(`${words} ${w} · aim for ${min}+`, `${words} ${p} · meta: ${min}+`);
}

function renderWriting(wrap, data) {
  const min = data.minWords || 50;
  wrap.innerHTML = `
    <div class="activity-card">
      <div class="ac-label">${bi('Writing task', 'Tarea de escritura')}</div>
      <div class="ac-body">${biText(data.instruction, data.instruction_es)}</div>
      ${promptBox('Your task', 'Tu tarea', biText(data.prompt, data.prompt_es))}
      ${answerBox('writing-resp', 'writing', { min: min, ph: ['Write your response here…', 'Escribe tu respuesta aquí…'], label: ['Your writing', 'Tu texto'] })}
      <div class="wc" id="writing-wc">${wordCountHtml(0, min)}</div>
      ${skipLabel('writing-resp', 'writing', 'Skip this writing task', 'Omitir esta tarea de escritura', 'writing-skip')}
    </div>
  `;
}

function updateWritingWC(el, min) {
  const words = el.value.trim() ? el.value.trim().split(/\s+/).length : 0;
  const wc = $('writing-wc');
  wc.innerHTML = wordCountHtml(words, min);
  wc.classList.toggle('is-ok', words >= min);
  saveAnswer('writing', el.value);
}

/** The "skip" checkbox under a text box: greys the box out and records [SKIPPED] for the teacher. */
function toggleSkip(checkbox) {
  const el = $(checkbox.dataset.skipFor);
  if (!el) return;
  el.disabled = checkbox.checked;
  saveAnswer(checkbox.dataset.skipKey, checkbox.checked ? '[SKIPPED]' : el.value);
}

// ── REVIEW ──
// The value written to the sheet is the plain word; the hub shows old emoji rows and new word rows alike.
const CONFIDENCE = [
  { val: 'Hard', es: 'Difícil', icon: 'sentiment_frustrated' },
  { val: 'OK', es: 'Normal', icon: 'sentiment_neutral' },
  { val: 'Good', es: 'Bien', icon: 'sentiment_satisfied' },
  { val: 'Great', es: 'Genial', icon: 'sentiment_very_satisfied' },
];

function renderReview(wrap, data) {
  const takeaways = (data.keyTakeaways || [])
    .map(
      (t, i) => `
    <li class="takeaway"><span class="fp-waypoint is-completed">${FP.icon('check_small')}</span><span>${biText(t, data.keyTakeaways_es && data.keyTakeaways_es[i])}</span></li>`
    )
    .join('');

  const faces = CONFIDENCE.map(
    (c, i) => `
    <button type="button" class="conf-btn" role="radio" aria-checked="false" tabindex="${i === 0 ? 0 : -1}" data-act="conf" data-val="${i}">${FP.icon(c.icon)}${bi(c.val, c.es)}</button>`
  ).join('');

  wrap.innerHTML = `
    <div class="activity-card">
      <div class="ac-label">${bi('Lesson review', 'Repaso de la lección')}</div>
      <ul class="takeaways">${takeaways}</ul>
    </div>
    <div class="activity-card">
      <div class="ac-label">${bi('Self-assessment', 'Autoevaluación')}</div>
      <h3 class="ac-heading" id="conf-heading">${bi('How did today go?', '¿Cómo te fue hoy?')}</h3>
      <div class="ac-body">${bi('Rate your confidence today and leave yourself a note.', 'Califica tu confianza hoy y déjate una nota.')}</div>
      <div class="conf-group" role="radiogroup" aria-labelledby="conf-heading">${faces}</div>
      ${answerBox('review-notes', 'review_notes', { short: true, ph: ['Notes for your teacher or yourself', 'Notas para tu profesor o para ti'], label: ['Your notes', 'Tus notas'] })}
      ${skipLabel('review-notes', 'review_notes', 'Skip this question', 'Omitir esta pregunta')}
    </div>
  `;
}

function selectConfidence(btn) {
  document.querySelectorAll('.conf-btn').forEach((b) => {
    const on = b === btn;
    b.classList.toggle('is-selected', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  });
  saveAnswer('confidence', parseInt(btn.dataset.val, 10));
}

// ══════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════
function nextStep() {
  if (state.currentStep < state.steps.length - 1) {
    state.currentStep++;
    renderStep();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (ckptInterval) saveLessonCheckpoint();
  } else {
    finishLesson();
  }
}

// ══════════════════════════════════════════════════════
// ANSWER STORAGE
// ══════════════════════════════════════════════════════
function saveAnswer(key, value) {
  state.answers[key] = value;
}

// ══════════════════════════════════════════════════════
// TIMER + PAUSE
// ══════════════════════════════════════════════════════
var paused = false;
var totalPausedTime = 0; // seconds spent paused (reported to teacher)
var pauseStartedAt = 0;
var pauseReturnFocus = null;

function startTimer(initialElapsed) {
  state.timeElapsed = initialElapsed || 0;
  paused = false;
  updateTimerDisplay();
  state.timerInterval = setInterval(() => {
    if (paused) return;
    state.timeElapsed++;
    updateTimerDisplay();
    if (state.timeElapsed >= LESSON_DURATION) {
      clearInterval(state.timerInterval);
    }
  }, 1000);
  setPauseButton(false);
  setHidden($('navPause'), false);
}

function updateTimerDisplay() {
  const remaining = Math.max(0, LESSON_DURATION - state.timeElapsed);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  const el = $('navTimer');
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('paused', paused);
  el.classList.toggle('warning', !paused && remaining < 600);
}

function setPauseButton(isPaused) {
  const btn = $('navPause');
  if (!btn) return;
  btn.innerHTML = FP.icon(isPaused ? 'play_arrow' : 'pause');
  btn.setAttribute(
    'aria-label',
    isPaused ? FP.ui.label('Resume lesson', 'Continuar la lección') : FP.ui.label('Pause lesson', 'Pausar la lección')
  );
}

function togglePause() {
  if (paused) {
    resumeLesson();
  } else {
    pauseLesson();
  }
}

function pauseLesson() {
  paused = true;
  pauseStartedAt = Date.now();
  updateTimerDisplay();
  setPauseButton(true);
  pauseReturnFocus = document.activeElement;
  $('fp-pause-overlay').classList.add('is-open');
  $('pauseResume').focus();
}

function resumeLesson() {
  paused = false;
  if (pauseStartedAt) {
    totalPausedTime += Math.round((Date.now() - pauseStartedAt) / 1000);
    pauseStartedAt = 0;
  }
  updateTimerDisplay();
  setPauseButton(false);
  $('fp-pause-overlay').classList.remove('is-open');
  if (pauseReturnFocus && pauseReturnFocus.focus && document.contains(pauseReturnFocus))
    pauseReturnFocus.focus({ preventScroll: true });
  pauseReturnFocus = null;
}

// Auto-pause when tab is hidden
document.addEventListener('visibilitychange', function () {
  if (document.hidden && !paused && lessonInProgress) {
    pauseLesson();
  }
});

// ══════════════════════════════════════════════════════
// FINISH LESSON
// ══════════════════════════════════════════════════════
// N-12: the lesson counts as done only when the save is VERIFIED. Until then the
// checkpoint is kept (so a reload can resume and re-submit under the same
// submission_id) and the day counter is not advanced.
let lessonEndTime = null;
let lessonAudioJson = null; // set once the recordings have uploaded

async function finishLesson() {
  lessonInProgress = false;
  if (paused) resumeLesson(); // ensure overlay is removed
  // Stop the 5 s autosave and write one final checkpoint; do NOT clear it yet.
  if (ckptInterval) {
    clearInterval(ckptInterval);
    ckptInterval = null;
  }
  saveLessonCheckpoint();
  clearInterval(state.timerInterval);
  try {
    if (recognition) {
      recognition.stop();
      convRecording = false;
    }
  } catch (e) {}
  // Stop any active drill recordings
  try {
    Object.keys(activeDrills).forEach(function (id) {
      stopDrill(id);
    });
  } catch (e) {}

  setHidden($('navPause'), true);
  setHidden($('navTimer'), true);

  lessonEndTime = new Date();
  lessonAudioJson = null;
  const elapsed = Math.round(state.timeElapsed / 60);

  $('stat-time').textContent = elapsed + 'm';
  $('stat-steps').textContent = state.steps.length;
  $('stat-day').textContent = state.dayNumber + ' / ' + FP.COURSE_DAYS;

  showScreen('screen-complete');

  // Identity only; the day counter moves after the save is verified.
  try {
    localStorage.setItem('fp_student_name', state.studentName);
    localStorage.setItem('fp_cefr_level', state.level);
  } catch (e) {
    /* localStorage unavailable */
  }

  await submitLesson();
}

/** The status line on the complete screen: an icon plus bilingual words (kind: '' | 'ok' | 'warn'). */
function setSaveStatus(kind, html) {
  const el = $('saveStatus');
  el.className = 'save-status' + (kind ? ' ' + kind : '');
  el.innerHTML =
    FP.icon(kind === 'ok' ? 'check' : kind === 'warn' ? 'warning' : 'hourglass_top') +
    '<div class="save-status__body">' +
    html +
    '</div>';
}

/**
 * Upload audio, save the lesson, and confirm the row landed. Used by
 * finishLesson and by the Retry button. Safe to repeat: the backend ignores a
 * second save carrying the same submission_id.
 */
async function submitLesson() {
  const oldRetry = $('retryLessonBtn');
  if (oldRetry) oldRetry.remove();
  FP.showSaveOverlay(bi('Saving your lesson. Please wait…', 'Guardando tu lección. Espera un momento…'), true);

  let audioUploadFailed = false;
  try {
    // Upload audio recordings first (may take a few seconds); skip if already done.
    if (
      !lessonAudioJson &&
      !GOOGLE_SHEET_WEBHOOK.includes('YOUR_APPS_SCRIPT') &&
      Object.keys(audioRecordings).length > 0
    ) {
      FP.updateSaveOverlay(bi('Uploading your recordings…', 'Subiendo tus grabaciones…'), true);
      setSaveStatus('', bi('Uploading your recordings. Please wait.', 'Subiendo tus grabaciones. Espera un momento.'));
      lessonAudioJson = await uploadAudioRecordings();
      if (!lessonAudioJson) audioUploadFailed = true;
    }
    releaseSpeakingStream();

    FP.updateSaveOverlay(bi('Saving your progress…', 'Guardando tu progreso…'), true);
    setSaveStatus('', bi('Saving your lesson progress…', 'Guardando el progreso de tu lección…'));
    const sent = await saveProgress(lessonEndTime, lessonAudioJson);

    let verified = false;
    if (sent) {
      FP.updateSaveOverlay(bi('Checking that it saved…', 'Comprobando que se guardó…'), true);
      verified = await verifyLessonSave(state.submissionId);
    }

    if (verified) {
      try {
        localStorage.setItem('fp_last_lesson_day', String(state.dayNumber));
        localStorage.setItem('fp_last_lesson_date', state.lessonDate);
      } catch (e) {
        /* localStorage unavailable */
      }
      clearLessonCheckpoint();
      setViewProgressPrimary(true);
      setSaveStatus('ok', bi('Your progress is saved.', 'Tu progreso se guardó.'));
    } else {
      setSaveStatus(
        'warn',
        bi(
          'We could not confirm your lesson was saved. Tap "Try saving again". Your answers are still saved on this device. Do not close this page.',
          'No pudimos confirmar que tu lección se guardó. Toca "Intentar guardar de nuevo". Tus respuestas siguen guardadas en este dispositivo. No cierres esta página.'
        )
      );
      showLessonRetry($('saveStatus'));
    }
  } finally {
    FP.hideSaveOverlay();
  }
  // The status line is overwritten by the save result, so re-add the audio
  // warning: otherwise the student never learns the teacher can't hear them.
  if (audioUploadFailed) {
    const el = $('saveStatus');
    el.classList.remove('ok');
    el.classList.add('warn');
    el.querySelector('.save-status__body').insertAdjacentHTML(
      'beforeend',
      '<span class="save-status__line">' +
        bi(
          'Your recordings were not uploaded, so your teacher cannot hear them. Please tell your teacher.',
          'Tus grabaciones no se subieron, así que tu profesor no puede escucharlas. Por favor avísale a tu profesor.'
        ) +
        '</span>'
    );
  }
  setHidden($('btnViewProgress'), false);
}

/** N-12 / DATA-6: saved means the sheet returns a lesson row with OUR submission_id. */
async function verifyLessonSave(submissionId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
    try {
      const data = await FP.api.get(
        GOOGLE_SHEET_WEBHOOK + '?action=get_progress&student=' + encodeURIComponent(state.studentName),
        { timeout: 15000 }
      );
      if (lessonSaveConfirmed(data, submissionId)) return true;
    } catch (e) {
      console.warn('[FluentPath] Lesson save verify attempt ' + (attempt + 1) + ' failed:', e.message);
    }
  }
  return false;
}

function showLessonRetry(statusEl) {
  const btn = document.createElement('button');
  btn.id = 'retryLessonBtn';
  btn.type = 'button';
  btn.className = 'fp-btn fp-btn--primary fp-btn--block fp-retry';
  btn.innerHTML = bi('Try saving again', 'Intentar guardar de nuevo');
  btn.addEventListener('click', function () {
    btn.disabled = true;
    submitLesson();
  });
  statusEl.insertAdjacentElement('afterend', btn);
  setViewProgressPrimary(false); // one primary action at a time: the retry
}

/** "View progress" is the primary button once the save is confirmed; while a retry is offered it steps back. */
function setViewProgressPrimary(primary) {
  const a = $('btnViewProgress');
  a.classList.toggle('fp-btn--primary', primary);
  a.classList.toggle('fp-btn--secondary', !primary);
}

async function saveProgress(endTime, speakingAudioJson) {
  if (GOOGLE_SHEET_WEBHOOK.includes('YOUR_APPS_SCRIPT')) return false;

  const writing = $('writing-resp')?.value || state.answers['writing'] || '';
  const notes = $('review-notes')?.value || state.answers['review_notes'] || '';
  const confVal = state.answers['confidence'] != null ? CONFIDENCE[state.answers['confidence']].val : 'Not rated';

  const payload = {
    action: 'save_progress',
    student_name: state.studentName,
    level: state.level,
    lesson_date: state.lessonDate,
    day_number: state.dayNumber,
    start_time: state.startTime?.toLocaleTimeString() || '',
    end_time: endTime.toLocaleTimeString(),
    time_spent_min: Math.round(state.timeElapsed / 60),
    paused_time_min: Math.round(totalPausedTime / 60),
    topic: state.lessonContent?.topic || '',
    confidence: confVal,
    writing_response: writing.substring(0, 2000),
    student_notes: notes.substring(0, 1000),
    warmup_response: (state.answers['warmup'] || '').substring(0, 500),
    speaking_transcript: (state.answers['speaking_conv'] || '').substring(0, 1000),
    answers_json: compactAnswersJson(state.answers, 5000), // DATA-5: always valid JSON
    speaking_audio_json: speakingAudioJson || '',
    submitted_at: new Date().toLocaleString(),
    vocabulary_words: JSON.stringify(
      state.lessonContent && state.lessonContent.vocabulary && state.lessonContent.vocabulary.words
        ? state.lessonContent.vocabulary.words.map(function (w) {
            return w.word;
          })
        : []
    ),
    course_id: localStorage.getItem('fp_course_id') || '1',
    submission_id: state.submissionId || '',
  };

  try {
    await FP.api.postForm(GOOGLE_SHEET_WEBHOOK, payload, { maxValueLength: 5000 });
    return true;
  } catch (e) {
    console.error('[FluentPath] Save progress failed:', e);
    return false;
  }
}

// ══════════════════════════════════════════════════════
// SPEECH SYNTHESIS
// ══════════════════════════════════════════════════════
function speakText(text, onEnd) {
  speakEnglish(text, onEnd);
}

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  // Session guard — the daily course requires a logged-in student.
  if (FP.getSession && !FP.getSession()) {
    FP.redirectToLogin();
    return;
  }

  $('lessonDate').value = localDateString();
  if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

  // FLOW-1b: the name is the logged-in student's, shown read-only.
  var savedName = localStorage.getItem('fp_student_name');
  if (!savedName) {
    FP.redirectToLogin();
    return;
  }
  $('studentName').value = savedName;
  state.studentName = savedName;

  initLessonEvents();
  setPauseButton(false);

  // FLOW-1 / DATA-3: level and day come from the server, not from localStorage.
  loadCourseState();

  tryResumeLesson();

  // Video call request: in the help card (re-initialised with the day once it is known).
  initCallControl();
});

/* ─────────────────────────────────────────────────────────────
   Configuration
   ───────────────────────────────────────────────────────────── */

const WEBHOOK_URL = FP.WEBHOOK_URL;
const LEVEL_INFO = FP.LEVELS;
const COURSE_DAYS = FP.COURSE_DAYS;
const TOTAL_MARKS = FP.TEST_TOTAL_MARKS;

/* ─────────────────────────────────────────────────────────────
   State
   ───────────────────────────────────────────────────────────── */
let studentName = '';
let progress = null; // fetched or built from localStorage
let settings = { allow_skip_test: false, allow_retake_test: false }; // teacher preferences from Google Sheets

/* Bilingual text: English with Spanish beneath (see ui.js). Both args are plain text. */
const bi = FP.ui.bi;
const spanishDate = FP.ui.dateEs;

/** Known server messages, shown in both languages. Unknown ones are shown as sent. */
const SERVER_MESSAGES = {
  'Invalid email or password': ['Wrong email or password.', 'Correo o contraseña incorrectos.'],
  'Too many attempts. Please try again later.': [
    'Too many attempts. Please try again later.',
    'Demasiados intentos. Inténtalo más tarde.',
  ],
};
function serverMessage(msg, fallbackEn, fallbackEs) {
  var known = SERVER_MESSAGES[msg];
  if (known) return bi(known[0], known[1]);
  return msg
    ? FP.ui.esc(msg) + '<span class="fp-bi__es" lang="es">' + FP.ui.esc(fallbackEs) + '</span>'
    : bi(fallbackEn, fallbackEs);
}

/* ─────────────────────────────────────────────────────────────
   Screen Navigation
   ───────────────────────────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─────────────────────────────────────────────────────────────
   Login — email + password → server-issued session
   ───────────────────────────────────────────────────────────── */
/** `html` is already escaped (build it with bi()). Empty clears the message. */
function loginError(html) {
  var el = document.getElementById('loginError');
  if (!el) return;
  if (html) {
    el.innerHTML = FP.icon('warning', { size: 'sm' }) + '<span>' + html + '</span>';
    el.style.display = 'flex';
  } else {
    el.innerHTML = '';
    el.style.display = 'none';
  }
}

function storeSession(res) {
  try {
    localStorage.setItem(FP.KEYS.SESSION, res.session);
    if (res.expires_at) localStorage.setItem(FP.KEYS.SESSION_EXP, res.expires_at);
    if (res.role) localStorage.setItem(FP.KEYS.ROLE, res.role);
  } catch (e) {
    /* storage unavailable */
  }
}

/** The log in button is left disabled ("Logging in…") after a successful log in; put it back
 *  whenever the log in screen is shown again without a page reload (log out, expired session). */
function resetLoginButton() {
  var btn = document.getElementById('btnEnter');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = bi('Log In', 'Iniciar sesión');
  }
}

async function enterHub() {
  var btn = document.getElementById('btnEnter');
  if (btn && btn.disabled) return; // guard against double-submit (Enter + click)
  var email = (document.getElementById('loginEmail').value || '').trim();
  var password = document.getElementById('loginPassword').value || '';
  loginError('');
  if (!email || !password) {
    loginError(bi('Please enter your email and password.', 'Escribe tu correo y tu contraseña.'));
    return;
  }

  // Hashing takes a few seconds server-side — disable the button + show progress
  // so it's clear something is happening and the form can't be submitted twice.
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = bi('Logging in…', 'Iniciando sesión…');
  }
  showScreen('screen-loading');

  function failBack(html) {
    showScreen('screen-welcome');
    loginError(html);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = bi('Log In', 'Iniciar sesión');
    }
  }

  try {
    var res = await FP.api.postRead(WEBHOOK_URL + '?action=login', { email: email, password: password });
    if (!res || !res.ok) {
      failBack(
        serverMessage(
          res && res.error,
          'Login failed. Please try again.',
          'No pudimos iniciar tu sesión. Inténtalo de nuevo.'
        )
      );
      return;
    }
    if (res.role && res.role !== 'student') {
      // A teacher account belongs on the teacher site — send them there.
      location.href = FP.TEACHER_URL;
      return;
    }
    storeSession(res);
    studentName = res.student_name;
    localStorage.setItem('fp_student_name', studentName); // other pages still read this key
    fetchProgress(studentName); // uses the SERVER-returned name, never the typed one (button stays disabled — we navigate to the dashboard)
  } catch (e) {
    failBack(
      bi('Could not reach the server. Please try again.', 'No pudimos conectarnos con el servidor. Inténtalo de nuevo.')
    );
  }
}

/* Allow pressing Enter on the password field */
(function () {
  var pw = document.getElementById('loginPassword');
  if (pw)
    pw.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') enterHub();
    });
})();

/* ─────────────────────────────────────────────────────────────
   Paywall — gated daily course (placement test stays free)
   ───────────────────────────────────────────────────────────── */
function goToCourse() {
  // Only block when the server has explicitly said locked; if course_unlocked
  // is missing (offline/old cache) fail open — the server still enforces it.
  if (progress && progress.course_unlocked === false) {
    openPaywall();
    return;
  }
  location.href = 'src/student-course.html';
}

function openPaywall() {
  var err = document.getElementById('paywallError');
  if (err) err.style.display = 'none';
  showScreen('screen-paywall');
}

async function startCheckout() {
  var err = document.getElementById('paywallError');
  if (err) err.style.display = 'none';
  try {
    var res = await FP.api.postRead(WEBHOOK_URL + '?action=create_checkout', {});
    if (res && res.url) {
      location.href = res.url;
      return;
    }
    throw new Error((res && res.error) || '');
  } catch (e) {
    if (err) {
      err.innerHTML =
        FP.icon('warning', { size: 'sm' }) +
        '<span>' +
        bi('Payment could not be started. Please try again.', 'No pudimos iniciar el pago. Inténtalo de nuevo.') +
        '</span>';
      err.style.display = 'flex';
    }
  }
}

/* Returning from Stripe (?paid=1): the webhook may lag, so poll progress a few
   times until the course shows unlocked, then clean the URL. */
async function handlePaidReturn() {
  for (var i = 0; i < 5; i++) {
    await fetchProgress(studentName);
    if (progress && progress.course_unlocked) break;
    await new Promise(function (r) {
      setTimeout(r, 2000);
    });
  }
  try {
    window.history.replaceState({}, '', location.pathname);
  } catch (e) {
    /* ignore */
  }
}

/* ─────────────────────────────────────────────────────────────
   Fetch Progress from Google Sheet (with localStorage fallback)
   ─────────────────────────────────────────────────────────────
   Fetches progress + settings in parallel, caches the combined
   result as a single JSON entry (fp_hub_cache). Falls back to
   cached state, then individual localStorage keys set by other
   pages (student-course, student-initial-test).
   ───────────────────────────────────────────────────────────── */
async function fetchProgress(name) {
  var enc = encodeURIComponent(name);
  var results = await Promise.all([
    FP.api.get(WEBHOOK_URL + '?action=get_progress&student=' + enc).catch(function () {
      return null;
    }),
    FP.api.get(WEBHOOK_URL + '?action=get_settings&student=' + enc).catch(function () {
      return null;
    }),
  ]);

  var progData = results[0];
  var settData = results[1];

  // Apply remote settings whenever available
  if (settData && settData.found) {
    settings.allow_skip_test = !!settData.allow_skip_test;
    settings.allow_retake_test = !!settData.allow_retake_test;
  }

  if (progData && progData.found) {
    progress = progData;
    // Cache combined state + sync individual keys for other pages
    localStorage.setItem(FP.KEYS.HUB_CACHE, JSON.stringify({ progress: progress, settings: settings }));
    syncIndividualKeys(progress);
    hideOfflineBanner();
    renderDashboard();
    return;
  }

  // Fallback: cached hub state → individual localStorage keys
  var cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(FP.KEYS.HUB_CACHE));
  } catch (e) {}

  if (cached && cached.progress) {
    progress = cached.progress;
    if (!settData && cached.settings) {
      settings.allow_skip_test = !!cached.settings.allow_skip_test;
      settings.allow_retake_test = !!cached.settings.allow_retake_test;
    }
    showOfflineBanner();
  } else {
    progress = buildDefaultProgress();
    // Only show offline banner if we actually tried the network (not first visit with no data)
    if (!progData) showOfflineBanner();
  }

  renderDashboard();
}

/**
 * N-15: days completed = the highest saved day, not the number of rows
 * (a re-do or a duplicate row would otherwise skip a day). Older cached
 * progress without max_day falls back to the row count.
 */
function daysCompleted(d) {
  if (d && d.max_day != null) return Number(d.max_day) || 0;
  return (d && d.lessons_completed) || 0;
}

/** Sync individual localStorage keys so other pages can read them. */
function syncIndividualKeys(d) {
  if (d.test_completed) localStorage.setItem(FP.KEYS.TEST_COMPLETED, 'true');
  if (d.test_date) localStorage.setItem(FP.KEYS.TEST_DATE, d.test_date);
  if (d.cefr_level) localStorage.setItem(FP.KEYS.CEFR_LEVEL, d.cefr_level);
  if (d.total_score) localStorage.setItem(FP.KEYS.TEST_SCORE, String(d.total_score));
  if (daysCompleted(d)) localStorage.setItem(FP.KEYS.LAST_LESSON_DAY, String(daysCompleted(d)));
  if (d.last_lesson_date) localStorage.setItem(FP.KEYS.LAST_LESSON_DATE, d.last_lesson_date);
  if (d.course_id) localStorage.setItem(FP.KEYS.COURSE_ID, String(d.course_id));
}

/** Build progress object from individual localStorage keys (set by other pages). */
function buildDefaultProgress() {
  return {
    found: false,
    test_completed: localStorage.getItem(FP.KEYS.TEST_COMPLETED) === 'true',
    test_date: localStorage.getItem(FP.KEYS.TEST_DATE) || null,
    cefr_level: localStorage.getItem(FP.KEYS.CEFR_LEVEL) || null,
    total_score: localStorage.getItem(FP.KEYS.TEST_SCORE) ? Number(localStorage.getItem(FP.KEYS.TEST_SCORE)) : null,
    lessons_completed: localStorage.getItem(FP.KEYS.LAST_LESSON_DAY)
      ? Number(localStorage.getItem(FP.KEYS.LAST_LESSON_DAY))
      : 0,
    last_lesson_date: localStorage.getItem(FP.KEYS.LAST_LESSON_DATE) || null,
  };
}

/* ─────────────────────────────────────────────────────────────
   Render Dashboard
   ───────────────────────────────────────────────────────────── */
/** Map a stored lesson rating (old rows hold emoji, new ones a word) to a face icon + label. */
function confidenceFace(v) {
  var t = String(v || '');
  var table = [
    [/😕|hard/i, 'sentiment_frustrated', 'Hard', 'Difícil'],
    [/😐|\bok\b/i, 'sentiment_neutral', 'OK', 'Normal'],
    [/🙂|good/i, 'sentiment_satisfied', 'Good', 'Bien'],
    [/😄|😀|great/i, 'sentiment_very_satisfied', 'Great', 'Genial'],
  ];
  for (var k = 0; k < table.length; k++) {
    if (table[k][0].test(t)) return FP.icon(table[k][1], { label: FP.ui.label(table[k][2], table[k][3]) });
  }
  return '';
}

/** Set one waypoint on the route: state is 'completed' | 'current' | 'upcoming'. */
function setRouteStep(id, state, metaText) {
  var li = document.getElementById(id);
  var node = li.querySelector('.fp-waypoint');
  li.classList.remove('is-completed', 'is-current', 'is-upcoming');
  li.classList.add('is-' + state);
  node.className = 'fp-waypoint' + (state === 'upcoming' ? '' : ' is-' + state);
  node.innerHTML = state === 'completed' ? FP.icon('check', { fill: true }) : '';
  if (state === 'current') li.setAttribute('aria-current', 'step');
  else li.removeAttribute('aria-current');
  document.getElementById(id + '-meta').textContent = metaText || '';
  var old = li.querySelector('.fp-sr-only');
  if (old) old.remove();
  var words = {
    completed: ['Completed', 'Completado'],
    current: ['Current step', 'Paso actual'],
    upcoming: ['Coming up', 'Próximo'],
  }[state];
  li.insertAdjacentHTML(
    'beforeend',
    '<span class="fp-sr-only">' + words[0] + '.<span class="fp-es" lang="es"> ' + words[1] + '.</span></span>'
  );
}

function badge(variant, iconName, en, es) {
  return (
    '<span class="fp-badge fp-badge--' +
    variant +
    '">' +
    FP.icon(iconName, { size: 'sm' }) +
    FP.ui.esc(en) +
    FP.ui.es(es) +
    '</span>'
  );
}

function toggleLessonHistory(btn) {
  var list = document.getElementById('lesson-history-all');
  var open = btn.getAttribute('aria-expanded') === 'true';
  list.classList.toggle('fp-hidden', open);
  btn.setAttribute('aria-expanded', open ? 'false' : 'true');
  var n = btn.getAttribute('data-total');
  btn.innerHTML = open ? bi('View all ' + n + ' lessons', 'Ver las ' + n + ' lecciones') : bi('Show less', 'Ver menos');
}

function lessonRowHtml(lesson) {
  var minutes = parseInt(lesson.time_spent, 10);
  var timeStr = !isNaN(minutes) && !String(lesson.time_spent).includes(':') ? minutes + ' min' : '';
  var dateStr = formatLessonDate(lesson.date);
  var face = confidenceFace(lesson.confidence);
  var day = escHtml(String(lesson.day));
  return (
    '<li class="hub-lesson">' +
    '<span><strong>Day ' +
    day +
    FP.ui.es('Día ' + day) +
    '</strong>' +
    (lesson.topic ? ' <span class="hub-lesson__topic">· ' + escHtml(lesson.topic) + '</span>' : '') +
    '</span>' +
    '<span class="hub-lesson__meta">' +
    (timeStr ? '<span>' + timeStr + '</span>' : '') +
    face +
    (dateStr ? '<span>' + escHtml(dateStr) + '</span>' : '') +
    '</span></li>'
  );
}

function renderDashboard() {
  const d = progress;

  // Spanish lines are for A1/A2/B1 (and until a level exists); B2+ see English only.
  FP.ui.setLevel(d.cefr_level);

  // Greeting
  document.getElementById('dashName').textContent = studentName;

  // Determine phase
  const testDone = d.test_completed;
  const hasLevel = !!d.cefr_level;
  const courseDays = daysCompleted(d);
  const courseStarted = courseDays > 0;
  const courseComplete = courseDays >= COURSE_DAYS;
  const courseNum = parseInt(d.course_id || '1', 10);
  const nextDay = Math.min(courseDays + 1, COURSE_DAYS);

  // Subtitle
  var sub;
  if (!testDone) sub = bi("Let's begin with your placement test.", 'Empecemos con tu prueba de nivel.');
  else if (!hasLevel) sub = bi('Your test is being reviewed by your teacher.', 'Tu profesor está revisando tu prueba.');
  else if (!courseStarted) sub = bi("You're ready to start your course!", '¡Todo está listo para empezar tu curso!');
  else if (courseComplete)
    sub = bi("Congratulations, you've completed the course!", '¡Felicitaciones! Completaste el curso.');
  else
    sub = bi(
      'Day ' + courseDays + ' of ' + COURSE_DAYS + ' completed. Keep going!',
      'Completaste ' + courseDays + ' de ' + COURSE_DAYS + ' días. ¡Sigue así!'
    );
  document.getElementById('dashSubtitle').innerHTML = sub;

  // ── The route ──
  setRouteStep(
    'route-test',
    testDone ? 'completed' : 'current',
    testDone && d.total_score ? d.total_score + ' / ' + TOTAL_MARKS : ''
  );
  setRouteStep('route-level', hasLevel ? 'completed' : testDone ? 'current' : 'upcoming', hasLevel ? d.cefr_level : '');
  setRouteStep(
    'route-course',
    courseComplete ? 'completed' : hasLevel ? 'current' : 'upcoming',
    courseStarted ? courseDays + ' / ' + COURSE_DAYS : ''
  );

  // ── Placement test card ──
  const msTestDesc = document.getElementById('ms-test-desc');
  const msTestCard = document.getElementById('ms-test-card');
  if (testDone) {
    msTestDesc.innerHTML = bi(
      'Test completed' + (d.test_date ? ' on ' + formatDate(d.test_date) : '') + '.',
      'Prueba completada' + (d.test_date ? ' el ' + spanishDate(d.test_date) : '') + '.'
    );
    msTestCard.style.display = 'block';
    var testHtml = '<div class="hub-result">' + badge('success', 'check_small', 'Completed', 'Completada');
    if (d.total_score)
      testHtml += '<span class="hub-score">' + escHtml(String(d.total_score)) + ' / ' + TOTAL_MARKS + '</span>';
    testHtml += '</div>';
    if (settings.allow_retake_test) {
      testHtml +=
        '<p class="hub-retake"><a href="src/student-initial-test.html">Re-take the placement test' +
        FP.ui.es('Repetir la prueba de nivel') +
        '</a>' +
        ' <span class="hub-sub">' +
        bi('(approved by your teacher)', '(aprobado por tu profesor)') +
        '</span></p>';
    }
    msTestCard.innerHTML = testHtml;
  } else {
    msTestDesc.innerHTML = bi(
      'Take the English proficiency test so your teacher can find the right level for you.',
      'Haz la prueba de inglés para que tu profesor encuentre el nivel adecuado para ti.'
    );
    msTestCard.style.display = 'none';
  }

  // ── Level card ──
  const msLevelDesc = document.getElementById('ms-level-desc');
  const msLevelCard = document.getElementById('ms-level-card');
  if (hasLevel) {
    const info = LEVEL_INFO[d.cefr_level] || { name: d.cefr_level, theme: '', name_es: d.cefr_level, theme_es: '' };
    msLevelDesc.innerHTML = bi(
      'Your teacher has placed you at level ' + d.cefr_level + '.',
      'Tu profesor te asignó el nivel ' + d.cefr_level + '.'
    );
    msLevelCard.style.display = 'block';
    msLevelCard.innerHTML =
      '<div class="hub-level"><span class="hub-level__code">' +
      escHtml(d.cefr_level) +
      '</span>' +
      '<div><div class="hub-level__name">' +
      escHtml(info.name) +
      FP.ui.es(info.name_es || info.name) +
      '</div>' +
      '<div class="hub-level__theme">' +
      escHtml(info.theme) +
      (info.theme_es ? FP.ui.es(info.theme_es) : '') +
      '</div></div></div>';
  } else if (testDone) {
    msLevelDesc.innerHTML = bi(
      'Your teacher is reviewing your test. You will see your level here once it is ready.',
      'Tu profesor está revisando tu prueba. Verás tu nivel aquí cuando esté listo.'
    );
    msLevelCard.style.display = 'block';
    msLevelCard.innerHTML = badge('warning', 'hourglass_top', 'Awaiting review', 'En revisión');
  } else {
    msLevelDesc.innerHTML = bi(
      'After your teacher reviews the test, you will be assigned a level.',
      'Cuando tu profesor revise la prueba, recibirás tu nivel.'
    );
    msLevelCard.style.display = 'none';
  }

  // ── Course card ──
  const msCourseDesc = document.getElementById('ms-course-desc');
  const msCourseCard = document.getElementById('ms-course-card');
  const courseEn = courseNum > 1 ? 'Course ' + courseNum + ': ' : '';
  const courseEs = courseNum > 1 ? 'Curso ' + courseNum + ': ' : '';
  if (courseStarted) {
    const pct = Math.round((Math.min(courseDays, COURSE_DAYS) / COURSE_DAYS) * 100);
    msCourseDesc.innerHTML = courseComplete
      ? bi(
          courseEn + 'You completed all ' + COURSE_DAYS + ' lessons. Well done!',
          courseEs + 'Completaste las ' + COURSE_DAYS + ' lecciones. ¡Muy bien!'
        )
      : bi(
          courseEn +
            'You have completed ' +
            courseDays +
            ' of ' +
            COURSE_DAYS +
            ' lessons. Next up: Day ' +
            nextDay +
            '.',
          courseEs + 'Completaste ' + courseDays + ' de ' + COURSE_DAYS + ' lecciones. Sigue el día ' + nextDay + '.'
        );
    msCourseCard.style.display = 'block';
    var historyHtml = '';
    if (d.lessons && d.lessons.length > 0) {
      var lessons = d.lessons.slice().sort(function (a, b) {
        return parseInt(a.day || 0) - parseInt(b.day || 0);
      });
      var total = lessons.length;
      var MAX_VISIBLE = 5;
      historyHtml =
        '<div class="hub-lessons"><h3 class="hub-lessons__title">Completed lessons' +
        FP.ui.es('Lecciones completadas') +
        '</h3><ul>' +
        lessons.slice(0, MAX_VISIBLE).map(lessonRowHtml).join('') +
        '</ul>';
      if (total > MAX_VISIBLE) {
        historyHtml +=
          '<ul id="lesson-history-all" class="fp-hidden hub-more">' +
          lessons.slice(MAX_VISIBLE).map(lessonRowHtml).join('') +
          '</ul>' +
          '<button type="button" class="fp-btn fp-btn--text hub-more" aria-expanded="false" aria-controls="lesson-history-all" data-total="' +
          total +
          '" onclick="toggleLessonHistory(this)">' +
          bi('View all ' + total + ' lessons', 'Ver las ' + total + ' lecciones') +
          '</button>';
      }
      historyHtml += '</div>';
    }
    msCourseCard.innerHTML =
      '<div class="hub-progress"><div class="hub-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="' +
      COURSE_DAYS +
      '" aria-valuenow="' +
      Math.min(courseDays, COURSE_DAYS) +
      '">' +
      '<div class="hub-progress__fill" style="width:' +
      pct +
      '%;"></div></div>' +
      '<div class="hub-progress__text">' +
      bi(
        courseDays + ' / ' + COURSE_DAYS + ' lessons completed',
        courseDays + ' / ' + COURSE_DAYS + ' lecciones completadas'
      ) +
      '</div></div>' +
      historyHtml;
  } else if (hasLevel) {
    msCourseDesc.innerHTML = bi(
      'Your course is ready to begin: ' + COURSE_DAYS + ' daily lessons tailored to your level.',
      'Tu curso está listo para empezar: ' + COURSE_DAYS + ' lecciones diarias para tu nivel.'
    );
    msCourseCard.style.display = 'none';
  } else {
    msCourseDesc.innerHTML = bi(
      'A ' + COURSE_DAYS + '-day personalised course with daily lessons tailored to your level.',
      'Un curso personalizado de ' + COURSE_DAYS + ' días con lecciones diarias para tu nivel.'
    );
    msCourseCard.style.display = 'none';
  }

  // ── Next step ──
  const cta = document.getElementById('ctaSection');
  const arrow = FP.icon('arrow_right_alt');
  if (!testDone) {
    var skipHtml = '';
    if (settings.allow_skip_test) {
      skipHtml =
        '<div class="hub-next__extra"><p>' +
        bi(
          'Your teacher has allowed you to start the course without the placement test.',
          'Tu profesor te permite empezar el curso sin la prueba de nivel.'
        ) +
        '</p><button type="button" class="fp-btn fp-btn--secondary" onclick="goToCourse()">' +
        bi('Skip to course', 'Ir al curso') +
        '</button></div>';
    }
    cta.innerHTML =
      '<p class="hub-next__text">' +
      bi(
        'Your first step is the placement test. It takes about 40 minutes.',
        'Tu primer paso es la prueba de nivel. Dura unos 40 minutos.'
      ) +
      '</p>' +
      '<div class="hub-next__actions"><a class="fp-btn fp-btn--primary" href="src/student-initial-test.html">' +
      bi('Take the placement test', 'Hacer la prueba de nivel') +
      arrow +
      '</a></div>' +
      skipHtml;
  } else if (!hasLevel) {
    cta.innerHTML =
      '<p class="hub-next__text">' +
      bi(
        'Your teacher will review your test soon. Check back later.',
        'Tu profesor revisará tu prueba pronto. Vuelve más tarde.'
      ) +
      '</p>' +
      '<div class="hub-next__actions"><button type="button" class="fp-btn fp-btn--secondary" onclick="refreshProgress()">' +
      bi('Refresh', 'Actualizar') +
      '</button></div>';
  } else if (courseComplete) {
    cta.innerHTML =
      '<p class="hub-next__text">' +
      bi(
        'You have completed the FluentPath course. Talk to your teacher about next steps.',
        'Completaste el curso de FluentPath. Habla con tu profesor sobre los próximos pasos.'
      ) +
      '</p>';
  } else {
    cta.innerHTML =
      '<p class="hub-next__text">' +
      bi(
        'Ready for Day ' + nextDay + '? Your teacher will be with you on the video call.',
        '¿Todo listo para el día ' + nextDay + '? Tu profesor estará contigo en la videollamada.'
      ) +
      '</p>' +
      '<div class="hub-next__actions"><button type="button" class="fp-btn fp-btn--primary" onclick="goToCourse()">' +
      bi('Start Day ' + nextDay + ' lesson', 'Empezar la lección del día ' + nextDay) +
      arrow +
      '</button></div>';
  }

  renderAchievements(d);
  // The call button is set up at page load only when a session already exists. After a fresh log in
  // (no reload) it must be set up here, once per student.
  if (typeof CallRequest !== 'undefined' && callInitFor !== studentName) {
    callInitFor = studentName;
    CallRequest.init({ page: 'hub', mount: '#callSlot' });
  }
  showScreen('screen-dashboard');
}
var callInitFor = '';

/* ─────────────────────────────────────────────────────────────
   Refresh progress (re-fetch from sheet)
   ───────────────────────────────────────────────────────────── */
function refreshProgress() {
  showScreen('screen-loading');
  fetchProgress(studentName);
}

/* ─────────────────────────────────────────────────────────────
   Logout — switch student
   ───────────────────────────────────────────────────────────── */
function logout() {
  var session = FP.getSession && FP.getSession();
  if (session) {
    // Fire-and-forget server-side revoke; don't block the UI on it.
    try {
      FP.api.postRead(WEBHOOK_URL + '?action=logout', { session: session });
    } catch (e) {
      /* ignore */
    }
  }
  if (FP.clearSession) FP.clearSession();
  callInitFor = ''; // the next log in sets the call button up again
  // DATA-1: purge EVERY fp_* key, not just the name. Anything left behind is
  // inherited by the next student to log in on this device.
  if (FP.purgeStudentState) {
    FP.purgeStudentState();
  } else {
    try {
      localStorage.removeItem('fp_student_name');
    } catch (e) {
      /* ignore */
    }
  }
  FP.ui.setLevel(null); // the log in screen shows Spanish
  studentName = '';
  progress = null;
  settings = { allow_skip_test: false, allow_retake_test: false };
  previousAchievements = [];
  var emailEl = document.getElementById('loginEmail');
  if (emailEl) emailEl.value = '';
  var pwEl = document.getElementById('loginPassword');
  if (pwEl) pwEl.value = '';
  loginError('');
  resetLoginButton();
  showScreen('screen-welcome');
}

/* ─────────────────────────────────────────────────────────────
   Achievements
   ───────────────────────────────────────────────────────────── */

var ACHIEVEMENTS = [
  {
    id: 'first_steps',
    icon: 'target',
    name: 'First Steps',
    name_es: 'Primeros pasos',
    test: function (d) {
      return d.test_completed;
    },
  },
  {
    id: 'level_up',
    icon: 'bar_chart',
    name: 'Level Placed',
    name_es: 'Nivel asignado',
    test: function (d) {
      return !!d.cefr_level;
    },
  },
  {
    id: 'day_one',
    icon: 'description',
    name: 'Day One',
    name_es: 'Primer día',
    test: function (d) {
      return daysCompleted(d) >= 1;
    },
  },
  {
    id: 'five_streak',
    icon: 'local_fire_department',
    name: '5 Days Done',
    name_es: '5 días completados',
    test: function (d) {
      return daysCompleted(d) >= 5;
    },
  },
  {
    id: 'halfway',
    icon: 'star',
    name: 'Halfway There',
    name_es: 'A mitad de camino',
    test: function (d) {
      return daysCompleted(d) >= Math.floor(COURSE_DAYS / 2);
    },
  },
  {
    id: 'graduate',
    icon: 'school',
    name: 'Course Complete',
    name_es: 'Curso completo',
    test: function (d) {
      return daysCompleted(d) >= COURSE_DAYS;
    },
  },
];

/** Previously earned achievement IDs (stored in localStorage to detect new ones). */
var previousAchievements = [];
try {
  previousAchievements = JSON.parse(localStorage.getItem('fp_achievements') || '[]');
} catch (e) {
  previousAchievements = [];
}

function renderAchievements(d) {
  var section = document.getElementById('achievementsSection');
  if (!section) return;

  var earned = [];
  var badges = ACHIEVEMENTS.map(function (a) {
    var isEarned = a.test(d);
    if (isEarned) earned.push(a.id);
    return (
      '<li class="achieve-badge ' +
      (isEarned ? 'earned' : 'unearned') +
      '">' +
      FP.icon(a.icon, { fill: isEarned }) +
      '<span>' +
      escHtml(a.name) +
      '<span class="fp-bi__es" lang="es">' +
      escHtml(a.name_es) +
      '</span></span>' +
      (isEarned
        ? '<span class="fp-sr-only">Earned.<span class="fp-es" lang="es"> Logrado.</span></span>'
        : '<span class="achieve-state">Locked' + FP.ui.es('Bloqueado') + '</span>') +
      '</li>'
    );
  }).join('');

  section.style.display = 'block';
  section.innerHTML =
    '<h2 class="achieve-title">Achievements' +
    FP.ui.es('Logros') +
    '</h2>' +
    '<ul class="achieve-grid">' +
    badges +
    '</ul>';

  // Show toast for newly unlocked achievements
  var newlyEarned = earned.filter(function (id) {
    return previousAchievements.indexOf(id) < 0;
  });
  if (newlyEarned.length > 0) {
    newlyEarned.forEach(function (id) {
      var a = ACHIEVEMENTS.find(function (a) {
        return a.id === id;
      });
      if (a) showAchievementToast(a);
    });
    try {
      localStorage.setItem('fp_achievements', JSON.stringify(earned));
    } catch (e) {}
    previousAchievements = earned;
  } else if (earned.length > 0) {
    try {
      localStorage.setItem('fp_achievements', JSON.stringify(earned));
    } catch (e) {}
  }
}

function showAchievementToast(achievement) {
  FP.ui.toast(
    'Achievement unlocked: <strong>' +
      escHtml(achievement.name) +
      '</strong>' +
      '<span class="fp-bi__es" lang="es">Logro desbloqueado: ' +
      escHtml(achievement.name_es) +
      '</span>',
    { variant: 'success', html: true, iconHtml: FP.icon(achievement.icon, { className: 'fp-banner__icon' }) }
  );
}

/* ─────────────────────────────────────────────────────────────
   Offline Banner
   ───────────────────────────────────────────────────────────── */
function showOfflineBanner() {
  FP.ui.banner({
    id: 'fp-offline-banner',
    variant: 'offline',
    position: 'bottom',
    html: bi('You are offline. Showing saved data.', 'Sin conexión. Mostrando datos guardados.'),
    actions: [
      {
        html: 'Retry' + FP.ui.es('Reintentar'),
        onclick: function () {
          refreshProgress();
        },
      },
    ],
  });
}

function hideOfflineBanner() {
  FP.ui.removeBanner('fp-offline-banner');
}

/* ─────────────────────────────────────────────────────────────
   Auto-login if a valid (non-expired) session exists
   ───────────────────────────────────────────────────────────── */
// An 'Unauthorized' reply while we are on this page means: show the login screen (not reload).
FP.isLoginPage = true;
FP.onLoginRequired = function () {
  resetLoginButton();
  showScreen('screen-welcome');
};

(function init() {
  var teacherLink = document.getElementById('teacherLink');
  if (teacherLink) teacherLink.href = FP.TEACHER_URL;

  var changePw = document.getElementById('changePasswordBtn');
  if (changePw)
    changePw.addEventListener('click', function () {
      FP.passwordReset.openChange();
    });

  var session = FP.getSession && FP.getSession();
  var saved = localStorage.getItem('fp_student_name');
  if (session && saved) {
    studentName = saved;
    showScreen('screen-loading');
    if (new URLSearchParams(location.search).get('paid') === '1') {
      handlePaidReturn(); // came back from Stripe — poll until unlocked
    } else {
      fetchProgress(saved);
    }
  } else {
    // No valid session → make sure no stale session lingers, then show login.
    if (!session && FP.clearSession) FP.clearSession();
    showScreen('screen-welcome');
  }
})();

/* ─────────────────────────────────────────────────────────────
   Initialize video call request button
   ───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
  if (typeof CallRequest !== 'undefined') {
    CallRequest.init({ page: 'hub', mount: '#callSlot' });
  }
});

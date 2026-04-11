/* ─────────────────────────────────────────────────────────────
   Configuration
   ───────────────────────────────────────────────────────────── */

const WEBHOOK_URL   = FP.WEBHOOK_URL;
const LEVEL_INFO    = FP.LEVELS;
const COURSE_DAYS   = FP.COURSE_DAYS;
const TOTAL_MARKS   = FP.TEST_TOTAL_MARKS;

/* ─────────────────────────────────────────────────────────────
   State
   ───────────────────────────────────────────────────────────── */
let studentName = '';
let progress = null; // fetched or built from localStorage
let settings = { allow_skip_test: false, allow_retake_test: false }; // teacher preferences from Google Sheets

/* ─────────────────────────────────────────────────────────────
   Screen Navigation
   ───────────────────────────────────────────────────────────── */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ─────────────────────────────────────────────────────────────
   Enter Hub
   ───────────────────────────────────────────────────────────── */
function enterHub() {
  const input = document.getElementById('studentName');
  const name = input.value.trim().substring(0, 100);
  if (!name) { input.focus(); return; }
  if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(name)) {
    input.setCustomValidity('Please use only letters, spaces, hyphens, and apostrophes.');
    input.reportValidity();
    return;
  }
  input.setCustomValidity('');

  studentName = name;
  localStorage.setItem('fp_student_name', name);
  showScreen('screen-loading');
  fetchProgress(name);
}

/* Allow pressing Enter on the name field */
document.getElementById('studentName').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') enterHub();
});

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
    FP.api.get(WEBHOOK_URL + '?action=get_progress&student=' + enc).catch(function() { return null; }),
    FP.api.get(WEBHOOK_URL + '?action=get_settings&student=' + enc).catch(function() { return null; }),
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
    renderDashboard();
    return;
  }

  // Fallback: cached hub state → individual localStorage keys
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(FP.KEYS.HUB_CACHE)); } catch (e) {}

  if (cached && cached.progress) {
    progress = cached.progress;
    if (!settData && cached.settings) {
      settings.allow_skip_test = !!cached.settings.allow_skip_test;
      settings.allow_retake_test = !!cached.settings.allow_retake_test;
    }
  } else {
    progress = buildDefaultProgress();
  }

  renderDashboard();
}

/** Sync individual localStorage keys so other pages can read them. */
function syncIndividualKeys(d) {
  if (d.test_completed)    localStorage.setItem(FP.KEYS.TEST_COMPLETED, 'true');
  if (d.test_date)         localStorage.setItem(FP.KEYS.TEST_DATE, d.test_date);
  if (d.cefr_level)        localStorage.setItem(FP.KEYS.CEFR_LEVEL, d.cefr_level);
  if (d.total_score)       localStorage.setItem(FP.KEYS.TEST_SCORE, String(d.total_score));
  if (d.lessons_completed) localStorage.setItem(FP.KEYS.LAST_LESSON_DAY, String(d.lessons_completed));
  if (d.last_lesson_date)  localStorage.setItem(FP.KEYS.LAST_LESSON_DATE, d.last_lesson_date);
}

/** Build progress object from individual localStorage keys (set by other pages). */
function buildDefaultProgress() {
  return {
    found: false,
    test_completed:    localStorage.getItem(FP.KEYS.TEST_COMPLETED) === 'true',
    test_date:         localStorage.getItem(FP.KEYS.TEST_DATE) || null,
    cefr_level:        localStorage.getItem(FP.KEYS.CEFR_LEVEL) || null,
    total_score:       localStorage.getItem(FP.KEYS.TEST_SCORE) ? Number(localStorage.getItem(FP.KEYS.TEST_SCORE)) : null,
    lessons_completed: localStorage.getItem(FP.KEYS.LAST_LESSON_DAY) ? Number(localStorage.getItem(FP.KEYS.LAST_LESSON_DAY)) : 0,
    last_lesson_date:  localStorage.getItem(FP.KEYS.LAST_LESSON_DATE) || null,
  };
}

/* ─────────────────────────────────────────────────────────────
   Render Dashboard
   ───────────────────────────────────────────────────────────── */
function renderDashboard() {
  const d = progress;

  // Greeting
  document.getElementById('dashName').textContent = studentName;

  // Determine phase
  const testDone  = d.test_completed;
  const hasLevel  = !!d.cefr_level;
  const courseDays = d.lessons_completed || 0;
  const courseStarted = courseDays > 0;
  const courseComplete = courseDays >= COURSE_DAYS;

  // Subtitle
  const subtitle = document.getElementById('dashSubtitle');
  if (!testDone)          subtitle.textContent = 'Let\'s begin with your placement test.';
  else if (!hasLevel)     subtitle.textContent = 'Your test is being reviewed by your teacher.';
  else if (!courseStarted) subtitle.textContent = 'You\'re ready to start your course!';
  else if (courseComplete) subtitle.textContent = 'Congratulations — you\'ve completed the course!';
  else                     subtitle.textContent = 'Day ' + courseDays + ' of ' + COURSE_DAYS + ' completed. Keep going!';

  // ── Milestone 1: Placement Test ──
  const msTest = document.getElementById('ms-test');
  const msTestDesc = document.getElementById('ms-test-desc');
  const msTestCard = document.getElementById('ms-test-card');

  if (testDone) {
    msTest.classList.add('done');
    msTest.classList.remove('active');
    msTestDesc.textContent = 'Test completed' + (d.test_date ? ' on ' + formatDate(d.test_date) : '') + '.';
    msTestCard.style.display = 'block';
    msTestCard.innerHTML = '<span class="badge badge-done">Completed</span>';
    if (d.total_score) {
      msTestCard.innerHTML += ' <span style="margin-left:8px;font-size:14px;color:var(--muted);">' + d.total_score + ' / ' + TOTAL_MARKS + '</span>';
    }
    if (settings.allow_retake_test) {
      msTestCard.innerHTML += '<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--rule);">' +
        '<a href="src/student-initial-test.html" style="font-size:13px;color:var(--rust);text-decoration:none;">↩ Re-take Placement Test</a>' +
        '<span style="font-size:11px;color:var(--muted);margin-left:8px;">(approved by your teacher)</span></div>';
    }
  } else {
    msTest.classList.add('active');
    msTestDesc.textContent = 'Take the English proficiency test so your teacher can find the right level for you.';
  }

  // ── Milestone 2: Level Assignment ──
  const msLevel = document.getElementById('ms-level');
  const msLevelDesc = document.getElementById('ms-level-desc');
  const msLevelCard = document.getElementById('ms-level-card');

  if (hasLevel) {
    msLevel.classList.add('done');
    msLevel.classList.remove('active');
    const info = LEVEL_INFO[d.cefr_level] || { name: d.cefr_level, theme: '', colour: 'var(--ink)' };
    msLevelDesc.textContent = 'Your teacher has placed you at level ' + d.cefr_level + '.';
    msLevelCard.style.display = 'block';
    msLevelCard.innerHTML =
      '<span class="badge badge-level">' + d.cefr_level + '</span> ' +
      '<span style="font-size:15px;font-weight:600;margin-left:6px;">' + escHtml(info.name) + '</span>' +
      '<br><span style="font-size:13px;color:var(--muted);font-style:italic;">' + escHtml(info.theme) + '</span>';
  } else if (testDone) {
    msLevel.classList.add('active');
    msLevelDesc.textContent = 'Your teacher is reviewing your test. You will see your level here once it is ready.';
    msLevelCard.style.display = 'block';
    msLevelCard.innerHTML = '<span class="badge badge-pending">Awaiting review</span>';
  } else {
    msLevelDesc.textContent = 'After your teacher reviews the test, you will be assigned a level.';
  }

  // ── Milestone 3: Course ──
  const msCourse = document.getElementById('ms-course');
  const msCourseDesc = document.getElementById('ms-course-desc');
  const msCourseCard = document.getElementById('ms-course-card');

  if (courseComplete) {
    msCourse.classList.add('done');
    msCourse.classList.remove('active');
    msCourseDesc.textContent = 'You completed all ' + COURSE_DAYS + ' lessons. Well done!';
    msCourseCard.style.display = 'block';
    msCourseCard.innerHTML =
      '<span class="badge badge-done">Complete</span>' +
      '<div class="progress-track" style="margin-top:12px;"><div class="progress-fill" style="width:100%;"></div></div>' +
      '<div class="progress-text">' + COURSE_DAYS + ' / ' + COURSE_DAYS + ' lessons</div>';
  } else if (courseStarted) {
    msCourse.classList.add('active');
    const pct = Math.round((courseDays / COURSE_DAYS) * 100);
    const nextDay = courseDays + 1;
    msCourseDesc.textContent = 'You have completed ' + courseDays + ' of ' + COURSE_DAYS + ' lessons. Next up: Day ' + nextDay + '.';
    msCourseCard.style.display = 'block';

    // Build lesson history sorted by day number
    var historyHtml = '';
    if (d.lessons && d.lessons.length > 0) {
      var lessons = d.lessons.slice().sort(function(a, b) {
        return parseInt(a.day || 0) - parseInt(b.day || 0);
      });
      var total = lessons.length;
      var MAX_VISIBLE = 5;

      function lessonRowHtml(lesson) {
        var timeStr = formatTimeSpent(lesson.time_spent);
        var dateStr = formatLessonDate(lesson.date);
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--cream);border-radius:4px;font-size:13px;">' +
          '<div><strong>Day ' + escHtml(String(lesson.day)) + '</strong>' +
          (lesson.topic ? ' <span style="color:var(--muted);">· ' + escHtml(lesson.topic) + '</span>' : '') + '</div>' +
          '<div style="display:flex;gap:12px;align-items:center;">' +
          (timeStr ? '<span style="font-size:11px;color:var(--muted);">' + timeStr + '</span>' : '') +
          (lesson.confidence ? '<span style="font-size:11px;">' + escHtml(lesson.confidence) + '</span>' : '') +
          (dateStr ? '<span style="font-size:11px;color:var(--muted);">' + escHtml(dateStr) + '</span>' : '') +
          '</div></div>';
      }

      historyHtml = '<div style="margin-top:16px;border-top:1px solid var(--rule);padding-top:12px;">' +
        '<div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:8px;">Completed Lessons</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;">';

      // Show first N lessons (Day 1, 2, 3…), hide the rest
      var visible = total <= MAX_VISIBLE ? lessons : lessons.slice(0, MAX_VISIBLE);
      visible.forEach(function(lesson) { historyHtml += lessonRowHtml(lesson); });

      // Hidden overflow with toggle
      if (total > MAX_VISIBLE) {
        historyHtml += '</div>' +
          '<div id="lesson-history-all" style="display:none;flex-direction:column;gap:6px;margin-top:6px;">';
        lessons.slice(MAX_VISIBLE).forEach(function(lesson) { historyHtml += lessonRowHtml(lesson); });
        historyHtml += '</div>' +
          '<a href="#" id="lesson-history-toggle" onclick="' +
            "var el=document.getElementById('lesson-history-all');var lnk=document.getElementById('lesson-history-toggle');" +
            "if(el.style.display==='none'){el.style.display='flex';lnk.textContent='Show less';}else{el.style.display='none';lnk.textContent='View all " + total + " lessons';}" +
            "return false;" +
          '" style="display:block;text-align:center;margin-top:10px;font-size:13px;color:var(--rust);text-decoration:none;font-style:italic;">View all ' + total + ' lessons</a>';
      } else {
        historyHtml += '</div>';
      }
      historyHtml += '</div>';
    }

    msCourseCard.innerHTML =
      '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%;"></div></div>' +
      '<div class="progress-text">' + courseDays + ' / ' + COURSE_DAYS + ' lessons completed</div>' +
      historyHtml;
  } else if (hasLevel) {
    msCourse.classList.add('active');
    msCourseDesc.textContent = 'Your course is ready to begin — ' + COURSE_DAYS + ' daily lessons tailored to your level.';
  } else {
    msCourseDesc.textContent = 'A ' + COURSE_DAYS + '-day personalised course with daily lessons tailored to your level.';
  }

  // ── CTA Section ──
  const cta = document.getElementById('ctaSection');

  if (!testDone) {
    var skipHtml = '';
    if (settings.allow_skip_test) {
      skipHtml =
        '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--rule);">' +
        '<p style="font-size:13px;color:var(--muted);margin-bottom:10px;">Your teacher has allowed you to start the course without the placement test.</p>' +
        '<a class="btn-cta secondary" href="src/student-course.html">Skip to Course</a>' +
        '</div>';
    }
    cta.innerHTML =
      '<p>Your first step is the placement test. It takes about 40 minutes.</p>' +
      '<a class="btn-cta" href="src/student-initial-test.html">Take the Placement Test</a>' +
      skipHtml;
  } else if (!hasLevel) {
    cta.innerHTML =
      '<p>Your teacher will review your test soon. Check back later.</p>' +
      '<button class="btn-cta secondary" onclick="refreshProgress()">Refresh</button>';
  } else if (courseComplete) {
    cta.innerHTML =
      '<p>You have completed the FluentPath course. Talk to your teacher about next steps.</p>';
  } else {
    const nextDay = courseDays + 1;
    cta.innerHTML =
      '<p>Ready for Day ' + nextDay + '? Your teacher will be with you on the video call.</p>' +
      '<a class="btn-cta" href="src/student-course.html">Start Day ' + nextDay + ' Lesson</a>';
  }

  showScreen('screen-dashboard');
}

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
  studentName = '';
  progress = null;
  document.getElementById('studentName').value = '';
  showScreen('screen-welcome');
}

/* ─────────────────────────────────────────────────────────────
   Auto-login if returning student
   ───────────────────────────────────────────────────────────── */
(function init() {
  const saved = localStorage.getItem('fp_student_name');
  if (saved) {
    document.getElementById('studentName').value = saved;
    // Auto-enter for returning students
    studentName = saved;
    showScreen('screen-loading');
    fetchProgress(saved);
  }
})();

// ══════════════════════════════════════════════════════
// SETUP GUIDE — fill in both values below
//
// ── EMAIL (Formspree) ──────────────────────────────
// 1. Go to https://formspree.io and sign up (free)
// 2. Click "New Form" → name it "English Test Results"
// 3. Copy your endpoint (looks like https://formspree.io/f/abcdefgh)
// 4. Paste it below
//
// ── GOOGLE SHEET (Apps Script) ────────────────────
// 1. Open a new Google Sheet
// 2. Click Extensions → Apps Script
// 3. Delete any existing code and paste the script from
//    the GOOGLE_APPS_SCRIPT_CODE comment block below
// 4. Click Deploy → New deployment → Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 5. Copy the Web app URL and paste it below
//
// GOOGLE_APPS_SCRIPT_CODE:
// ─────────────────────────────────────────────────
// NOTE: The test sends form-encoded data (not JSON).
// Use this Apps Script — it reads e.parameter instead of e.postData.
//
// function doPost(e) {
//   var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
//   var params = e.parameter;  // form-encoded fields land here
//   var headers = [
//     'submitted_at','candidate_name','date',
//     'reading_score','listening_score','auto_total',
//     'writing_score','speaking_score','mcq_answers',
//     'q11_passive_voice','q12_combined_sentence','q13_error_correction',
//     'q14_writing_task','q20_dictation',
//     'q21_speaking_notes','q22_speaking_notes',
//     'q23_speaking_notes','q24_speaking_notes'
//   ];
//   if (sheet.getLastRow() === 0) {
//     sheet.appendRow(headers);
//   }
//   sheet.appendRow(headers.map(function(h) { return params[h] || ''; }));
//   return ContentService
//     .createTextOutput(JSON.stringify({ result: 'success' }))
//     .setMimeType(ContentService.MimeType.JSON);
// }
// ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════
const FORMSPREE_ENDPOINT   = FP.FORMSPREE_ENDPOINT;
const GOOGLE_SHEET_WEBHOOK = FP.WEBHOOK_URL;

// Bilingual text (English, Spanish beneath; Spanish hidden for B2+ by ui.js). Test items
// (passages, questions, answer options) stay English: they are what is being tested.
const bi = FP.ui.bi;
const esOnly = FP.ui.es;
/** Icon + bilingual message, for feedback banners and statuses. `html` is already escaped. */
const iconMsg = (icon, html, opts) => FP.icon(icon, Object.assign({ size: 'sm' }, opts || {})) + '<span>' + html + '</span>';
const playsLeftHtml = (left) => left === 0
  ? bi('No plays left', 'Sin reproducciones')
  : bi(left + (left === 1 ? ' play left' : ' plays left'), left + (left === 1 ? ' reproducción' : ' reproducciones'));

// ── STATE ──
const state = {
  answers: {},
  textAnswers: {},
  chosenTask: null,
  q19selected: new Set(),
  transcriptOpen: false,
  startTime: null,
  endTime: null,
  listeningPlays: 0,
  dictationPlays: 0,
};
const MAX_PLAYS = 3;

const CORRECT_ANSWERS = { q1:'B',q2:'C',q3:'C',q4:'C',q5:'B',q6:'A',q7:'C',q8:'B',q9:'B',q10:'B',q15:'B',q16:'C',q17:'C',q18:'C' };
const MCQ_MARKS = { q1:2,q2:2,q3:2,q4:2,q5:2,q6:2,q7:2,q8:2,q9:2,q10:2,q15:2,q16:2,q17:2,q18:2 };

// ── CHECKPOINT (session recovery) ──
const CKPT_KEY = 'test';
let ckptInterval = null;

function saveTestCheckpoint() {
  const screen = document.querySelector('.screen.active')?.id;
  if (!screen || screen === 'screen-cover' || screen === 'screen-results' || screen === 'screen-submitting') return;
  const textValues = {};
  ['q11','q12','q13','q14','q20','q21','q22','q23','q24'].forEach(id => {
    const el = document.getElementById(id);
    if (el) textValues[id] = el.value;
  });
  Checkpoint.save(CKPT_KEY, {
    screen,
    candidateName: document.getElementById('candidateName').value,
    candidateDate: document.getElementById('candidateDate').value,
    answers: state.answers,
    textAnswers: state.textAnswers,
    textValues,
    chosenTask: state.chosenTask,
    q19selected: [...state.q19selected],
    startTime: state.startTime ? state.startTime.toISOString() : null,
    submissionId: state.submissionId || null,
    listeningPlays: state.listeningPlays,
    dictationPlays: state.dictationPlays,
  });
}

function startTestAutoSave() {
  if (ckptInterval) return;
  saveTestCheckpoint();
  ckptInterval = setInterval(saveTestCheckpoint, 5000);
}

function clearTestCheckpoint() {
  if (ckptInterval) { clearInterval(ckptInterval); ckptInterval = null; }
  Checkpoint.clear(CKPT_KEY);
}

function tryResumeTest() {
  const data = Checkpoint.load(CKPT_KEY);
  if (!data || !data.screen) return;
  Checkpoint.showRecoveryModal({
    title: 'Resume Your Test?',
    titleEs: '¿Continuar tu Prueba?',
    message: 'You have an unfinished test. Would you like to pick up where you left off?',
    messageEs: 'Tienes una prueba sin terminar. ¿Quieres continuar donde lo dejaste?',
    savedAt: data._savedAt,
    onResume: function() {
      testInProgress = true;
      document.getElementById('candidateName').value = data.candidateName || '';
      document.getElementById('candidateDate').value = data.candidateDate || '';
      state.answers = data.answers || {};
      state.textAnswers = data.textAnswers || {};
      state.chosenTask = data.chosenTask || null;
      state.q19selected = new Set(data.q19selected || []);
      state.startTime = data.startTime ? new Date(data.startTime) : new Date();
      // DATA-2: keep the id across reload so a save that landed is recognised.
      // A checkpoint from before this fix has none; mint one.
      state.submissionId = data.submissionId || newSubmissionId();
      state.listeningPlays = data.listeningPlays || 0;
      state.dictationPlays = data.dictationPlays || 0;
      // Restore textarea values
      if (data.textValues) {
        Object.entries(data.textValues).forEach(function(pair) {
          var el = document.getElementById(pair[0]);
          if (el) el.value = pair[1];
        });
      }
      // Restore task choice visual
      if (data.chosenTask) chooseTask(data.chosenTask);
      // Restore audio play counts display
      var playsLeft = MAX_PLAYS - state.listeningPlays;
      document.getElementById('audioPlaysLeft').innerHTML = playsLeftHtml(Math.max(playsLeft, 0));
      if (playsLeft <= 0) document.getElementById('playBtn').disabled = true;
      var dPlays = MAX_PLAYS - state.dictationPlays;
      document.getElementById('dictPlaysLeft').innerHTML = playsLeftHtml(Math.max(dPlays, 0));
      if (dPlays <= 0) document.getElementById('dictPlayBtn').disabled = true;
      showScreen(data.screen);
      startTestAutoSave();
    },
    onStartOver: function() {
      clearTestCheckpoint();
    }
  });
}

// ── SCREEN MANAGEMENT ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateNav(id);
  updateProgress(id);
  // the help card (call request) shows on the question and intro screens only
  document.getElementById('testHelp').classList.toggle('fp-hidden', ['screen-cover', 'screen-submitting', 'screen-results'].includes(id));
  if (ckptInterval) saveTestCheckpoint();
  // Focus management: move focus to first interactive element in new screen
  setTimeout(function() {
    var screen = document.getElementById(id);
    if (!screen) return;
    var target = screen.querySelector('button:not(:disabled), textarea, input, [tabindex="0"]');
    if (target) target.focus();
  }, 100);
}

function updateNav(id) {
  const labels = {
    'screen-cover':          ['General placement', 'Prueba general'],
    'screen-reading-intro':  ['Part 01 · Reading', 'Parte 01 · Lectura'],
    'screen-reading':        ['Part 01 · Reading', 'Parte 01 · Lectura'],
    'screen-writing-intro':  ['Part 02 · Writing', 'Parte 02 · Escritura'],
    'screen-writing':        ['Part 02 · Writing', 'Parte 02 · Escritura'],
    'screen-listening-intro':['Part 03 · Listening', 'Parte 03 · Comprensión auditiva'],
    'screen-listening':      ['Part 03 · Listening', 'Parte 03 · Comprensión auditiva'],
    'screen-speaking-intro': ['Part 04 · Speaking', 'Parte 04 · Expresión oral'],
    'screen-speaking':       ['Part 04 · Speaking', 'Parte 04 · Expresión oral'],
    'screen-results':        ['Results', 'Resultados'],
  };
  const l = labels[id];
  document.getElementById('navSection').innerHTML = l ? bi(l[0], l[1]) : '';
}

const screenOrder = ['screen-cover','screen-reading-intro','screen-reading','screen-writing-intro','screen-writing','screen-listening-intro','screen-listening','screen-speaking-intro','screen-speaking','screen-results'];

function updateProgress(id) {
  const idx = screenOrder.indexOf(id);
  const pct = idx < 0 ? 0 : Math.round((idx / (screenOrder.length - 1)) * 100);
  document.getElementById('progressBar').style.width = pct + '%';
  const outer = document.querySelector('.progress-bar-outer');
  if (outer) outer.setAttribute('aria-valuenow', String(pct));
}

// ── beforeunload — warn when test is in progress ──
var testInProgress = false;
function onBeforeUnload(e) { if (testInProgress) { e.preventDefault(); } }
window.addEventListener('beforeunload', onBeforeUnload);

// ── START ──
function setFieldError(inputEl, html) {
  let msg = inputEl.parentElement.querySelector('.fp-field-error');
  if (!html) {
    inputEl.classList.remove('is-error');
    inputEl.removeAttribute('aria-invalid');
    if (msg) msg.remove();
    return;
  }
  inputEl.classList.add('is-error');
  inputEl.setAttribute('aria-invalid', 'true');
  if (!msg) {
    msg = document.createElement('div');
    msg.className = 'fp-field-error';
    msg.setAttribute('role', 'alert');
    inputEl.insertAdjacentElement('afterend', msg);
  }
  msg.innerHTML = iconMsg('warning', html);
}

function startTest() {
  const nameEl = document.getElementById('candidateName');
  const dateEl = document.getElementById('candidateDate');
  setFieldError(nameEl, '');
  if (!nameEl.value.trim()) {
    setFieldError(nameEl, bi('Please write your name.', 'Escribe tu nombre.'));
    nameEl.focus();
    return;
  }
  if (!dateEl.value) dateEl.value = localDateString();
  testInProgress = true;
  state.startTime = new Date();
  state.submissionId = newSubmissionId(); // DATA-2
  showScreen('screen-reading-intro');
  startTestAutoSave();
}

// ── MCQ ──
function verdictHtml(ok) {
  return '<span class="fp-answer__verdict">' + FP.icon(ok ? 'check_small' : 'close_small', { size: 'sm' }) +
    (ok ? bi('Correct', 'Correcto') : bi('Not quite', 'No exactamente')) + '</span>';
}

function selectMCQ(qId, letter, isCorrect) {
  if (state.answers[qId]) return; // already answered
  state.answers[qId] = { selected: letter, correct: isCorrect };

  const btns = document.querySelectorAll(`[onclick*="'${qId}'"]`);
  btns.forEach(btn => {
    btn.disabled = true;
    const btnLetter = btn.querySelector('.opt-letter').textContent.trim();
    const correctLetter = CORRECT_ANSWERS[qId];
    btn.setAttribute('aria-checked', btnLetter === letter ? 'true' : 'false');
    if (btnLetter === correctLetter) { btn.classList.add('correct'); btn.insertAdjacentHTML('beforeend', verdictHtml(true)); }
    else if (btnLetter === letter && !isCorrect) { btn.classList.add('wrong'); btn.insertAdjacentHTML('beforeend', verdictHtml(false)); }
  });

  const fb = document.getElementById(qId + '-fb');
  if (fb) {
    fb.setAttribute('aria-live', 'polite');
    fb.classList.add('show');
    if (isCorrect) {
      const m = MCQ_MARKS[qId] || 2;
      fb.classList.add('correct-fb');
      fb.innerHTML = iconMsg('check_small', bi('Correct! +' + m + ' marks', '¡Correcto! +' + m + ' puntos'));
    } else {
      fb.classList.add('wrong-fb');
      fb.innerHTML = iconMsg('close_small', bi('Not quite. The correct answer is ' + CORRECT_ANSWERS[qId] + '.', 'No exactamente. La respuesta correcta es ' + CORRECT_ANSWERS[qId] + '.'));
    }
  }
  updateScoreDisplay();
}

// ── MULTI-SELECT Q19 ──
const Q19_CORRECT = new Set(['B','C']);
function toggleMulti(qId, letter) {
  if (state.answers[qId + '_submitted']) return;
  const btn = document.getElementById(qId + '-' + letter);
  if (state.q19selected.has(letter)) {
    state.q19selected.delete(letter);
    btn.classList.remove('selected');
    btn.setAttribute('aria-pressed', 'false');
  } else {
    state.q19selected.add(letter);
    btn.classList.add('selected');
    btn.setAttribute('aria-pressed', 'true');
  }
  // Auto-submit when 2 selected
  if (state.q19selected.size >= 2) submitQ19();
}

function submitQ19() {
  state.answers['q19_submitted'] = true;
  const correct = [...state.q19selected].every(l => Q19_CORRECT.has(l)) && state.q19selected.size === 2;
  const partialCorrect = [...state.q19selected].filter(l => Q19_CORRECT.has(l)).length;

  document.querySelectorAll('[id^="q19-"]').forEach(btn => {
    if (!btn.classList.contains('q-feedback') && btn.tagName === 'BUTTON') {
      btn.disabled = true;
      const letter = btn.id.replace('q19-','');
      if (Q19_CORRECT.has(letter)) { btn.classList.add('correct'); btn.insertAdjacentHTML('beforeend', verdictHtml(true)); }
      else if (state.q19selected.has(letter)) { btn.classList.add('wrong'); btn.insertAdjacentHTML('beforeend', verdictHtml(false)); }
    }
  });

  const fb = document.getElementById('q19-fb');
  fb.setAttribute('aria-live', 'polite');
  fb.classList.add('show');
  if (correct) {
    fb.classList.add('correct-fb');
    fb.innerHTML = iconMsg('check_small', bi('Correct! Both answers found. +2 marks', '¡Correcto! Encontraste las dos respuestas. +2 puntos'));
    state.answers['q19'] = { correct: true, marks: 2 };
  } else if (partialCorrect > 0) {
    fb.classList.add('info-fb');
    fb.innerHTML = iconMsg('lightbulb', bi(`Partly correct. ${partialCorrect} of 2 correct answers selected. +${partialCorrect} mark${partialCorrect>1?'s':''}.`,
      `Parcialmente correcto. Elegiste ${partialCorrect} de 2 respuestas correctas. +${partialCorrect} punto${partialCorrect>1?'s':''}.`));
    state.answers['q19'] = { correct: false, marks: partialCorrect };
  } else {
    fb.classList.add('wrong-fb');
    fb.innerHTML = iconMsg('close_small', bi('Not quite. Neither answer was correct. The correct answers are: At reception and On the website.',
      'No exactamente. Ninguna respuesta fue correcta. Las respuestas correctas son: At reception y On the website.'));
    state.answers['q19'] = { correct: false, marks: partialCorrect };
  }
  updateScoreDisplay();
}

// ── TEXT ANSWERS ──
function saveText(qId) {
  state.textAnswers[qId] = document.getElementById(qId).value;
}

function toggleSkipQ(checkbox, qId) {
  var el = document.getElementById(qId);
  if (checkbox.checked) {
    el.required = false;
    el.disabled = true; // :disabled styles the field as skipped
    state.textAnswers[qId] = '[SKIPPED]';
  } else {
    el.required = true;
    el.disabled = false;
    state.textAnswers[qId] = el.value;
  }
}

function updateWordCount() {
  const text = document.getElementById('q14').value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const wc = document.getElementById('wordCount');
  const inRange = words >= 120 && words <= 150;
  const over = words > 150;
  wc.className = 'word-count' + (inRange ? ' is-ok' : over ? ' is-over' : '');
  wc.innerHTML = (inRange ? FP.icon('check_small', { size: 'sm' }) : over ? FP.icon('warning', { size: 'sm' }) : '') +
    '<span>' + bi(words + ' words' + (over ? ' (aim for 120–150)' : ''), words + ' palabras' + (over ? ' (intenta escribir 120–150)' : '')) + '</span>';
  saveText('q14');
}

function chooseTask(opt) {
  state.chosenTask = opt;
  [['A', 'taskA'], ['B', 'taskB']].forEach(([o, id]) => {
    const b = document.getElementById(id);
    b.classList.toggle('chosen', opt === o);
    b.setAttribute('aria-pressed', opt === o ? 'true' : 'false');
  });
  const q14 = document.getElementById('q14');
  q14.setAttribute('data-placeholder-en', opt === 'A' ? 'Write your informal email here (120–150 words)…' : 'Write your opinion paragraph here (120–150 words)…');
  q14.setAttribute('data-ph-es', opt === 'A' ? 'Escribe aquí tu correo informal (120–150 palabras)…' : 'Escribe aquí tu párrafo de opinión (120–150 palabras)…');
  FP.ui.localizeAttrs(q14.parentElement);
}

// ── SCORE DISPLAY ──
function getMCQScore() {
  let total = 0;
  Object.keys(CORRECT_ANSWERS).forEach(qId => {
    if (state.answers[qId]?.correct) total += (MCQ_MARKS[qId] || 2);
  });
  if (state.answers['q19']) total += state.answers['q19'].marks || 0;
  return total;
}

function updateScoreDisplay() {
  // Live score intentionally hidden from candidate
}

// ── SECTION FINISH ──
function finishReading() {
  showScreen('screen-writing-intro');
}

// ── AUDIO: Text-to-Speech ──
const LISTENING_TEXT = "Hello, and welcome to the Westfield Community Centre. My name is Diane, and I am the programme coordinator. I would like to let you know about a few changes this month. First, the yoga class on Wednesday evenings has moved to Thursday at seven p.m. Second, the swimming pool will be closed for maintenance from the fourteenth to the twentieth of this month. If you have any questions, please speak to reception or visit our website. Thank you, and have a great day.";
const DICTATION_TEXT = "Although the weather was unpredictable, they decided to go ahead with the outdoor festival.";

// ── SPEAKING: Speech Recognition for Q21-Q24 ──
var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
// ── SPEAKING (Q21–Q24): record the student's voice ──
// Recording needs only MediaRecorder and a microphone. Speech recognition (the
// live transcript) is a bonus that iPad/iPhone Safari does not reliably offer,
// so it must never be what switches recording on or off. The recordings are
// uploaded when the test is submitted (uploadSpeakingAudio) and played back in
// the teacher's placement-test panel.
var speakingRecorders = {};   // { q21: { recognition, recorder, chunks, recording, transcript } }
var speakingAudio = {};       // { q21: Blob }, the latest take for each question
var speakingStream = null;
var speakingAudioJson = null; // set once uploaded; a retry reuses it instead of re-uploading

const MSG_NO_SPEAKING = () => bi(
  'Voice recording is not available on this device. That is fine: write your ideas in the box above and your teacher will listen to you on the video call.',
  'La grabación de voz no está disponible en este dispositivo. No hay problema: escribe tus ideas en el cuadro de arriba y tu profesor te escuchará en la videollamada.');
const MSG_NO_MIC = () => bi(
  'We could not use the microphone. Allow microphone access for this site in your browser settings, then tap the microphone again.',
  'No pudimos usar el micrófono. Permite el acceso al micrófono para este sitio en la configuración del navegador y toca el micrófono de nuevo.');

/** Show a message in a question's status line. kind: 'error' or '' (plain). `html` is escaped markup. */
function setRecStatus(qId, html, kind) {
  const el = document.getElementById('rec-status-' + qId);
  el.style.display = html ? 'block' : 'none';
  el.className = 'rec-status' + (kind === 'error' ? ' is-error' : '');
  el.innerHTML = html || '';
}

/** One place for the record button's look (spec 6.6): idle, requesting, recording, recorded, failed. */
const REC_STATES = {
  idle:       { icon: 'mic',  fill: false, en: 'Record your answer',            es: 'Graba tu respuesta' },
  requesting: { icon: 'mic',  fill: false, en: 'Allow the microphone',          es: 'Permite el micrófono' },
  recording:  { icon: 'stop', fill: true,  en: 'Recording… tap to stop',        es: 'Grabando… toca para detener' },
  recorded:   { icon: 'mic',  fill: false, en: 'Recorded. Tap to record again.', es: 'Grabado. Toca para grabar de nuevo.' },
  failed:     { icon: 'mic',  fill: false, en: 'Could not record. Tap to try again.', es: 'No pudimos grabar. Toca para intentar de nuevo.' },
};
function setRecUi(qId, stateName) {
  const st = REC_STATES[stateName];
  const btn = document.getElementById('rec-btn-' + qId);
  btn.classList.remove('is-requesting', 'is-recording', 'is-recorded', 'is-failed');
  if (stateName !== 'idle') btn.classList.add('is-' + stateName);
  btn.setAttribute('aria-pressed', stateName === 'recording' ? 'true' : 'false');
  btn.setAttribute('aria-label', FP.ui.label(st.en, st.es));
  btn.innerHTML = FP.icon(st.icon, { fill: st.fill });
  document.getElementById('rec-label-' + qId).innerHTML = bi(st.en, st.es);
}

function getAudioMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}
function audioExtension(mime) { return mime.includes('mp4') ? 'mp4' : 'webm'; }
function canRecordAudio() { return !!window.MediaRecorder && !!getAudioMimeType(); }

async function getSpeakingStream() {
  if (speakingStream && speakingStream.active) return speakingStream;
  try {
    speakingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return speakingStream;
  } catch (e) {
    console.warn('[FluentPath] Could not acquire mic for audio recording:', e);
    return null;
  }
}

function releaseSpeakingStream() {
  if (speakingStream) {
    speakingStream.getTracks().forEach(function (t) { t.stop(); });
    speakingStream = null;
  }
}

function blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function stopSpeakingRec(qId) {
  var rec = speakingRecorders[qId];
  if (!rec || !rec.recording) return;
  rec.recording = false;
  if (rec.recognition) { try { rec.recognition.stop(); } catch (e) {} }
  if (rec.recorder && rec.recorder.state !== 'inactive') { try { rec.recorder.stop(); } catch (e) {} }
  setRecStatus(qId, '');
  // With a recording the state is "recorded" (and a player appears); a transcript-only device just goes back to idle.
  setRecUi(qId, canRecordAudio() ? 'recorded' : 'idle');
  state.textAnswers[qId + '_transcript'] = rec.transcript;
}

async function toggleSpeakingRec(qId) {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!canRecordAudio() && !SR) {
    // IOS-1c: do not send an iPad/iPhone user off to install another browser.
    // The notes box above is the answer; the teacher listens on the video call.
    setRecStatus(qId, MSG_NO_SPEAKING());
    return;
  }

  var rec = speakingRecorders[qId];
  if (!rec) rec = speakingRecorders[qId] = { recognition: null, recorder: null, chunks: [], recording: false, starting: false, transcript: '' };
  if (rec.recording) { stopSpeakingRec(qId); return; }
  if (rec.starting) return; // a second tap while the mic permission prompt is open

  // One question at a time.
  Object.keys(speakingRecorders).forEach(function (k) { if (k !== qId) stopSpeakingRec(k); });

  var transcriptEl = document.getElementById('rec-transcript-' + qId);
  setRecStatus(qId, '');

  // Ask for the microphone first, inside the tap that started this (iOS requires it).
  var stream = null;
  if (canRecordAudio()) {
    rec.starting = true;
    setRecUi(qId, 'requesting');
    stream = await getSpeakingStream();
    rec.starting = false;
    if (!stream && !SR) {
      setRecUi(qId, 'failed');
      setRecStatus(qId, MSG_NO_MIC(), 'error');
      return;
    }
  }

  rec.transcript = '';
  rec.recording = true;
  setRecUi(qId, 'recording');

  if (stream) {
    var mime = getAudioMimeType();
    rec.chunks = [];
    rec.recorder = new MediaRecorder(stream, { mimeType: mime });
    rec.recorder.ondataavailable = function (ev) { if (ev.data && ev.data.size > 0) rec.chunks.push(ev.data); };
    rec.recorder.onstop = function () {
      if (!rec.chunks.length) return;
      speakingAudio[qId] = new Blob(rec.chunks, { type: mime });
      speakingAudioJson = null; // the take changed: upload again at submit
      var player = document.getElementById('rec-audio-' + qId);
      if (!player) {
        player = document.createElement('audio');
        player.id = 'rec-audio-' + qId;
        player.controls = true;
        player.className = 'fp-audio-preview';
        document.getElementById('rec-status-' + qId).insertAdjacentElement('afterend', player);
      }
      if (player.src) URL.revokeObjectURL(player.src);
      player.src = URL.createObjectURL(speakingAudio[qId]);
    };
    rec.recorder.start();
  }

  if (SR) {
    var recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onresult = function (event) {
      var text = '';
      for (var i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      rec.transcript = text;
      transcriptEl.style.display = 'block';
      transcriptEl.textContent = text || '…';
    };
    recognition.onerror = function (e) {
      // The recording is what matters; a refused or failed recogniser only costs the transcript.
      if (e.error !== 'aborted' && e.error !== 'no-speech' && e.error !== 'not-allowed' && e.error !== 'service-not-allowed') {
        console.warn('[FluentPath] Speech recognition error:', e.error);
      }
    };
    recognition.onend = function () {
      if (rec.recording) { try { recognition.start(); } catch (e) {} }
    };
    rec.recognition = recognition;
    try { recognition.start(); } catch (err) { rec.recognition = null; }
  }
}

/**
 * Upload the Q21–Q24 recordings (once) and return the speaking_audio_json string
 * for the sheet row, or '' if nothing was recorded or the upload failed. A failed
 * upload must not block the test: the written answers still go in.
 */
async function uploadSpeakingAudio() {
  if (speakingAudioJson) return speakingAudioJson;
  var keys = Object.keys(speakingAudio);
  if (!keys.length) return '';
  var recordings = {};
  for (var k = 0; k < keys.length; k++) {
    var blob = speakingAudio[keys[k]];
    if (!blob || !blob.size) continue;
    try { recordings[keys[k]] = { data: await blobToBase64(blob), ext: audioExtension(blob.type || '') }; }
    catch (e) { console.warn('[FluentPath] Could not encode audio for', keys[k], e); }
  }
  if (!Object.keys(recordings).length) return '';
  try {
    var json = await FP.api.postText(GOOGLE_SHEET_WEBHOOK + '?action=save_audio',
      JSON.stringify({ action: 'save_audio', day_number: 'test', recordings: recordings }), { timeout: 90000 });
    if (json && json.result === 'error') console.error('[FluentPath] Audio upload server error:', json.message);
    speakingAudioJson = (json && json.audio_json) || null;
    return speakingAudioJson || '';
  } catch (e) {
    console.error('[FluentPath] Audio upload failed:', e);
    return '';
  }
}

function speakText(text, onEnd) {
  speakEnglish(text, onEnd); // shared voice: same as the lessons (utils.js)
}

// ── Listening and dictation audio: play/stop, plays left, time listened ──
const AUDIO_UI = {
  listening: { box: 'listeningAudioBox', play: 'playBtn', stop: 'stopBtn', status: 'audioStatus', time: 'audioPlayTime', left: 'audioPlaysLeft',
    again: ['Tap play to listen again', 'Toca reproducir para escuchar otra vez'] },
  dictation: { box: 'dictationAudioBox', play: 'dictPlayBtn', stop: 'dictStopBtn', status: 'dictAudioStatus', time: 'dictPlayTime', left: 'dictPlaysLeft',
    again: ['Tap play to hear it again', 'Toca reproducir para oírla otra vez'] },
};
const audioClock = { listening: { start: null, total: 0 }, dictation: { start: null, total: 0 } };

function audioPlayStart(kind, left) {
  const u = AUDIO_UI[kind];
  document.getElementById(u.left).innerHTML = playsLeftHtml(left);
  document.getElementById(u.status).innerHTML = bi('Playing…', 'Reproduciendo…');
  document.getElementById(u.play).style.display = 'none';
  const stop = document.getElementById(u.stop);
  stop.style.display = 'inline-flex';
  stop.focus(); // the play button just vanished: keep keyboard focus on the control that replaces it
  audioClock[kind].start = Date.now();
}

function audioPlayEnd(kind, left) {
  const u = AUDIO_UI[kind], clock = audioClock[kind];
  if (clock.start) { clock.total += Date.now() - clock.start; clock.start = null; }
  document.getElementById(u.stop).style.display = 'none';
  const play = document.getElementById(u.play);
  play.style.display = 'inline-flex';
  document.getElementById(u.status).innerHTML = left > 0 ? bi(u.again[0], u.again[1]) : bi('No more plays available', 'Ya no hay más reproducciones');
  const t = document.getElementById(u.time);
  t.style.display = 'inline';
  t.innerHTML = bi('Listened for ' + formatPlayTime(clock.total), 'Escuchado: ' + formatPlayTime(clock.total));
  if (left === 0) { play.disabled = true; document.getElementById(u.box).classList.add('is-exhausted'); }
  else play.focus();
}

function playListeningAudio() {
  if (state.listeningPlays >= MAX_PLAYS) return;
  state.listeningPlays++;
  var left = MAX_PLAYS - state.listeningPlays;
  audioPlayStart('listening', left);
  speakText(LISTENING_TEXT, function() { audioPlayEnd('listening', left); });
}
function stopListeningAudio() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  audioPlayEnd('listening', MAX_PLAYS - state.listeningPlays);
}

function playDictationAudio() {
  if (state.dictationPlays >= MAX_PLAYS) return;
  state.dictationPlays++;
  var left = MAX_PLAYS - state.dictationPlays;
  audioPlayStart('dictation', left);
  speakText(DICTATION_TEXT, function() { audioPlayEnd('dictation', left); });
}
function stopDictationAudio() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  audioPlayEnd('dictation', MAX_PLAYS - state.dictationPlays);
}

// Preload voices on page load
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

// ── FINAL RESULTS — auto-submit ──
async function finishTest() {
  var wasRecording = Object.keys(speakingRecorders).some(function (k) { return speakingRecorders[k].recording; });
  Object.keys(speakingRecorders).forEach(stopSpeakingRec);
  if (wasRecording) await new Promise(function (r) { setTimeout(r, 400); }); // let the recorder hand over its last chunk
  testInProgress = false;
  state.endTime = new Date();
  showScreen('screen-submitting');
  await submitResults();
}

function showResultsScreen(submissionOk, submissionMsg, verified) {
  // DATA-2: keep the checkpoint until the save is CONFIRMED. Clearing it here
  // unconditionally is what turned a failed submission into 40 minutes of lost
  // work with nothing left to retry from.
  if (verified) clearTestCheckpoint();
  // Time summary
  const duration = state.endTime && state.startTime ? state.endTime - state.startTime : null;
  const timeSummary = document.getElementById('timeSummary');
  const timeItems = [
    ['Started', 'Inicio', state.startTime ? state.startTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'],
    ['Finished', 'Fin', state.endTime ? state.endTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'],
    ['Duration', 'Duración', duration ? formatDuration(duration) : '—'],
  ];
  timeSummary.innerHTML = timeItems.map(([en, es, value]) =>
    '<div class="ts-item"><div class="ts-label">' + bi(en, es) + '</div><div class="ts-value">' + value + '</div></div>').join('');

  // Submission banner (message is already escaped, bilingual markup)
  const banner = document.getElementById('submissionBanner');
  banner.classList.remove('fp-hidden', 'fp-banner--success', 'fp-banner--error');
  if (submissionOk) {
    banner.classList.add('fp-banner--success');
    banner.setAttribute('role', 'status');
    banner.innerHTML = FP.icon('check', { className: 'fp-banner__icon' }) + '<div class="fp-banner__body">' + submissionMsg + '</div>';
  } else {
    banner.classList.add('fp-banner--error');
    banner.setAttribute('role', 'alert');
    banner.innerHTML = FP.icon('warning', { className: 'fp-banner__icon' }) + '<div class="fp-banner__body">' + submissionMsg + '</div>';
    // Give the student a way out rather than a dead end.
    const retry = document.createElement('button');
    retry.id = 'retrySubmitBtn';
    retry.type = 'button';
    retry.className = 'fp-btn fp-btn--primary';
    retry.innerHTML = bi('Retry submission', 'Reintentar el envío');
    retry.setAttribute('onclick', 'retrySubmission()');
    banner.appendChild(retry);
  }

  // Save progress to localStorage so the hub page can track status.
  // Only mark the test complete once the save is confirmed — otherwise the hub
  // would advance the student past a placement test that never arrived.
  try {
    localStorage.setItem('fp_student_name', document.getElementById('candidateName').value.trim());
    if (verified) localStorage.setItem('fp_test_completed', 'true');
    localStorage.setItem('fp_test_date', document.getElementById('candidateDate').value);
    localStorage.setItem('fp_test_submitted_at', new Date().toISOString());
  } catch(e) { /* localStorage unavailable */ }

  showScreen('screen-results');
}

// ── DUAL SUBMISSION (Email + Google Sheet) ──
async function submitResults() {
  FP.showSaveOverlay(bi('Submitting your test results…', 'Enviando los resultados de tu prueba…'), true);

  const missingFormspree = FORMSPREE_ENDPOINT.includes('YOUR_FORM_ID_HERE');
  const missingSheet     = GOOGLE_SHEET_WEBHOOK.includes('YOUR_SCRIPT_ID_HERE');

  // Build payload
  const mcqDetail = Object.keys(CORRECT_ANSWERS).map(q => {
    const ans = state.answers[q];
    return `${q.toUpperCase()}: ${ans ? ans.selected + (ans.correct ? ' ✓' : ' ✗ (correct: ' + CORRECT_ANSWERS[q] + ')') : 'Not answered'}`;
  }).join('\n');
  const q19ans    = state.answers['q19'];
  const q19detail = q19ans ? `Q19: ${[...state.q19selected].join(',')} — ${q19ans.marks}/2 marks` : 'Q19: Not answered';

  let readingScore = 0;
  ['q1','q2','q3','q4','q5','q6','q7','q8','q9','q10'].forEach(q => { if (state.answers[q]?.correct) readingScore += 2; });
  let listeningScore = 0;
  ['q15','q16','q17','q18'].forEach(q => { if (state.answers[q]?.correct) listeningScore += 2; });
  if (q19ans) listeningScore += q19ans.marks || 0;

  const duration = state.endTime && state.startTime
    ? formatDuration(state.endTime - state.startTime)
    : 'unknown';

  // Typed notes plus, when the device could transcribe, what was said. The audio
  // itself travels separately (speaking_audio_json).
  const speakingAnswer = (q) => {
    const notes = (state.textAnswers[q] || '').trim();
    const said = (state.textAnswers[q + '_transcript'] || '').trim();
    const recorded = !!speakingAudio[q];
    const parts = [];
    if (notes) parts.push(notes);
    if (said) parts.push('[Spoken] ' + said);
    if (!parts.length) return recorded ? '(audio recording only)' : '(blank)';
    return parts.join('\n');
  };

  const payload = {
    submitted_at:           new Date().toLocaleString(),
    candidate_name:         document.getElementById('candidateName').value || '(not provided)',
    test_date:              document.getElementById('candidateDate').value || '',
    start_time:             state.startTime ? state.startTime.toLocaleTimeString() : '',
    end_time:               state.endTime   ? state.endTime.toLocaleTimeString()   : '',
    duration:               duration,
    reading_score:          `${readingScore} / 20`,
    listening_score:        `${listeningScore} / 15`,
    auto_total:             `${readingScore + listeningScore} / 30`,
    writing_score:          'Pending examiner review (/ 25)',
    speaking_score:         'Pending examiner review (/ 20)',
    mcq_answers:            mcqDetail + '\n' + q19detail,
    q11_passive_voice:      state.textAnswers['q11'] || '(blank)',
    q12_combined_sentence:  state.textAnswers['q12'] || '(blank)',
    q13_error_correction:   state.textAnswers['q13'] || '(blank)',
    q14_writing_task:       `[Option ${state.chosenTask || '?'}] ${state.textAnswers['q14'] || '(blank)'}`,
    q20_dictation:          state.textAnswers['q20'] || '(blank)',
    q21_speaking_notes:     speakingAnswer('q21'),
    q22_speaking_notes:     speakingAnswer('q22'),
    q23_speaking_notes:     speakingAnswer('q23'),
    q24_speaking_notes:     speakingAnswer('q24'),
  };

  // DATA-2: one opaque id per test attempt (minted at startTest, kept in the
  // checkpoint). The sheet row carries it and verify matches it exactly, so
  // neither locale nor timezone matters, and a retry of a save that already
  // landed is recognised (and ignored server-side) instead of duplicated.
  if (!state.submissionId) state.submissionId = newSubmissionId();
  const submissionId = state.submissionId;
  // The sheet row gets the id (and the server's own timestamp); the Formspree
  // email keeps its original readable fields.
  const sheetPayload = Object.assign({ action: 'submit_test' }, payload, {
    submission_id: submissionId, // the server stamps submitted_at
  });

  const results = { email: 'skipped', sheet: 'skipped', verified: false };

  // ── Formspree (email) ──
  if (!missingFormspree) {
    try {
      await FP.api.postJson(FORMSPREE_ENDPOINT, payload);
      results.email = 'ok';
    } catch { results.email = 'error'; }
  }

  // ── Speaking recordings → Drive (before the row, so the row can reference them) ──
  if (!missingSheet && Object.keys(speakingAudio).length) {
    FP.updateSaveOverlay(bi('Uploading your recordings…', 'Subiendo tus grabaciones…'), true);
    sheetPayload.speaking_audio_json = await uploadSpeakingAudio();
  }
  releaseSpeakingStream(); // the mic is no longer needed

  // ── Google Sheet (form-encoded + no-cors — required for Apps Script) ──
  // NOTE: postForm uses mode:'no-cors', so the response is opaque and it
  // resolves true even on a 500, an auth rejection or a quota error. 'sent' here
  // means SENT, NOT SAVED — only verifySubmission below can confirm a save.
  if (!missingSheet) {
    try {
      await FP.api.postForm(GOOGLE_SHEET_WEBHOOK, sheetPayload);
      results.sheet = 'sent';
    } catch { results.sheet = 'error'; }

    if (results.sheet === 'sent') {
      FP.updateSaveOverlay(bi('Confirming your results were saved…', 'Confirmando que tus resultados se guardaron…'), true);
      results.verified = await verifySubmission(submissionId);
    }
  }

  // ── Determine outcome message then show results screen ──
  // DATA-2: the ONLY thing that counts as saved is a verified read-back. The
  // checkpoint is kept unless we confirmed the save, so a failed submission can
  // be retried instead of losing 40 minutes of work.
  const bothUnconfigured = missingFormspree && missingSheet;

  let ok, msg;
  if (bothUnconfigured) {
    ok = false;
    msg = bi('Submission is not set up. Please ask your teacher to set up the test.', 'El envío no está configurado. Pide a tu profesor que configure la prueba.');
  } else if (results.verified) {
    ok = true;
    msg = results.email === 'ok'
      ? bi('Your results have been saved and emailed to your teacher.', 'Tus resultados se guardaron y se enviaron por correo a tu profesor.')
      : bi('Your results have been saved.', 'Tus resultados se guardaron.');
  } else if (results.email === 'ok') {
    ok = false;
    msg = bi('We emailed your results to your teacher, but could not confirm they were saved. Tap "Retry submission". Your answers are still saved on this device.',
      'Enviamos tus resultados por correo a tu profesor, pero no pudimos confirmar que se guardaron. Toca "Reintentar el envío". Tus respuestas siguen guardadas en este dispositivo.');
  } else {
    ok = false;
    msg = bi('We could not confirm your results were saved. Tap "Retry submission". Your answers are still saved on this device. Do not close this page.',
      'No pudimos confirmar que tus resultados se guardaron. Toca "Reintentar el envío". Tus respuestas siguen guardadas en este dispositivo. No cierres esta página.');
  }

  FP.hideSaveOverlay();
  showResultsScreen(ok, msg, results.verified);
}

/**
 * DATA-2: confirm the submission actually reached the sheet.
 *
 * postForm is fire-and-forget (no-cors), so this reads the student's newest
 * test row back and requires its submission_id to equal ours exactly. An old
 * row from a previous attempt has a different (or no) id, so it can't pass.
 *
 * Retries a few times because Apps Script writes and the sheet read can lag.
 */
async function verifySubmission(submissionId) {
  const who = (function () {
    try { return localStorage.getItem('fp_student_name') || ''; } catch (e) { return ''; }
  })() || (document.getElementById('candidateName').value || '').trim();

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
    try {
      const data = await FP.api.get(
        GOOGLE_SHEET_WEBHOOK + '?action=get_test_results&student=' + encodeURIComponent(who),
        { timeout: 15000 });
      if (submissionMatches(data, submissionId)) return true;
    } catch (e) {
      console.warn('[FluentPath] Submission verify attempt ' + (attempt + 1) + ' failed:', e.message);
    }
  }
  return false;
}

/**
 * DATA-2: re-send the submission from the results screen.
 *
 * Checks first whether the original attempt actually landed — verification can
 * fail on a read blip even though the write succeeded, and re-posting blindly
 * would append a duplicate row to Initial Test Results.
 */
async function retrySubmission() {
  const btn = document.getElementById('retrySubmitBtn');
  if (btn) { btn.disabled = true; btn.classList.add('is-loading'); btn.innerHTML = bi('Retrying…', 'Reintentando…'); }

  if (state.submissionId) {
    FP.showSaveOverlay(bi('Checking whether your results arrived…', 'Revisando si llegaron tus resultados…'), true);
    const alreadyLanded = await verifySubmission(state.submissionId);
    FP.hideSaveOverlay();
    if (alreadyLanded) {
      showResultsScreen(true, bi('Your results have been saved.', 'Tus resultados se guardaron.'), true);
      return;
    }
  }
  await submitResults();
}

function restartTest() {
  testInProgress = false;
  clearTestCheckpoint();
  state.submissionId = null; // DATA-2: a new attempt gets a new id (minted at startTest)
  // Reset state
  state.answers = {};
  state.textAnswers = {};
  state.chosenTask = null;
  state.q19selected = new Set();
  state.transcriptOpen = false;
  state.startTime = null;
  state.endTime = null;
  state.listeningPlays = 0;
  state.dictationPlays = 0;

  // Reset speaking recordings
  Object.keys(speakingRecorders).forEach(stopSpeakingRec);
  speakingRecorders = {};
  speakingAudio = {};
  speakingAudioJson = null;
  releaseSpeakingStream();
  ['q21', 'q22', 'q23', 'q24'].forEach(function (q) {
    var player = document.getElementById('rec-audio-' + q);
    if (player) { if (player.src) URL.revokeObjectURL(player.src); player.remove(); }
    var st = document.getElementById('rec-status-' + q);
    if (st) { st.style.display = 'none'; st.textContent = ''; }
    var tr = document.getElementById('rec-transcript-' + q);
    if (tr) { tr.style.display = 'none'; tr.textContent = ''; }
    setRecUi(q, 'idle');
  });

  // Reset all MCQ buttons
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = false;
    btn.classList.remove('selected','correct','wrong');
    if (btn.getAttribute('role') === 'radio') btn.setAttribute('aria-checked', 'false');
    else if (btn.hasAttribute('aria-pressed')) btn.setAttribute('aria-pressed', 'false');
    btn.tabIndex = btn.dataset.firstOption === '1' ? 0 : (btn.getAttribute('role') === 'radio' ? -1 : 0);
    const v = btn.querySelector('.fp-answer__verdict');
    if (v) v.remove();
  });

  // Reset all feedbacks
  document.querySelectorAll('.q-feedback').forEach(fb => {
    fb.className = 'q-feedback';
    fb.innerHTML = '';
  });

  // Reset text inputs
  document.querySelectorAll('.text-input-area').forEach(el => el.value = '');
  updateWordCount();

  // Reset task choice
  ['taskA', 'taskB'].forEach(id => { const b = document.getElementById(id); b.classList.remove('chosen'); b.setAttribute('aria-pressed', 'false'); });

  // Reset audio players
  Object.keys(AUDIO_UI).forEach(kind => {
    const u = AUDIO_UI[kind];
    audioClock[kind] = { start: null, total: 0 };
    document.getElementById(u.status).innerHTML = kind === 'listening'
      ? bi('Press play to listen. You can play it up to 3 times.', 'Toca reproducir para escuchar. Puedes escucharlo hasta 3 veces.')
      : bi('Press play to hear the sentence', 'Toca reproducir para escuchar la oración');
    document.getElementById(u.left).innerHTML = playsLeftHtml(MAX_PLAYS);
    const play = document.getElementById(u.play);
    play.disabled = false; play.style.display = 'inline-flex';
    document.getElementById(u.stop).style.display = 'none';
    const t = document.getElementById(u.time); t.style.display = 'none'; t.textContent = '';
    document.getElementById(u.box).classList.remove('is-exhausted');
  });
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  // Reset submission banner
  const banner = document.getElementById('submissionBanner');
  if (banner) { banner.classList.add('fp-hidden'); banner.classList.remove('fp-banner--error'); banner.classList.add('fp-banner--success'); banner.innerHTML = ''; }

  // Reset nav score
  document.getElementById('navScore').textContent = '';

  showScreen('screen-cover');
}

/**
 * UX-10: each single-answer question is a radiogroup (arrow keys move between options,
 * one tab stop per group, Space/Enter chooses); Q19 is a group of toggle buttons; the
 * Q14 task choice reports which task is pressed. Done here once instead of on 24 blocks.
 */
function enhanceOptionGroups() {
  document.querySelectorAll('.options-grid').forEach((grid, i) => {
    const prompt = grid.closest('.question-card')?.querySelector('.q-prompt');
    if (prompt) { if (!prompt.id) prompt.id = 'qp-' + i; grid.setAttribute('aria-labelledby', prompt.id); }
    const opts = Array.from(grid.querySelectorAll('.option-btn'));
    if (grid.id === 'q19-options') {
      grid.setAttribute('role', 'group');
      opts.forEach(b => b.setAttribute('aria-pressed', 'false'));
      return;
    }
    grid.setAttribute('role', 'radiogroup');
    opts.forEach((b, k) => {
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.tabIndex = k === 0 ? 0 : -1;
      if (k === 0) b.dataset.firstOption = '1';
    });
    grid.addEventListener('keydown', e => {
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (!(e.key in keys)) return;
      const enabled = opts.filter(b => !b.disabled);
      const at = enabled.indexOf(document.activeElement);
      if (at < 0 || !enabled.length) return;
      e.preventDefault();
      const next = enabled[(at + keys[e.key] + enabled.length) % enabled.length];
      enabled.forEach(b => { b.tabIndex = b === next ? 0 : -1; });
      next.focus();
    });
  });
  ['taskA', 'taskB'].forEach(id => document.getElementById(id).setAttribute('aria-pressed', 'false'));
}

// Set today's date on load
window.addEventListener('DOMContentLoaded', () => {
  enhanceOptionGroups();
  // Session guard — the placement test requires a logged-in student (free, not public).
  if (FP.getSession && !FP.getSession()) { FP.redirectToLogin(); return; }

  document.getElementById('candidateDate').value = localDateString();

  // Auto-fill name from hub (localStorage)
  var nameField = document.getElementById('candidateName');
  var savedName = localStorage.getItem('fp_student_name');
  if (savedName) nameField.value = savedName;

  tryResumeTest();

  // Initialize video call request button (re-init when student enters name)
  function initCallRequest() {
    if (typeof CallRequest !== 'undefined') CallRequest.init({ page: 'test', mount: '#callSlot' });
  }
  initCallRequest();
  nameField.addEventListener('blur', initCallRequest);
});

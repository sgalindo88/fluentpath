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
      document.getElementById('audioPlaysLeft').textContent = playsLeft > 0 ? playsLeft + ' plays left' : 'No plays left';
      var dPlays = MAX_PLAYS - state.dictationPlays;
      document.getElementById('dictPlaysLeft').textContent = dPlays > 0 ? dPlays + ' plays left' : 'No plays left';
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
    'screen-cover': 'General Placement',
    'screen-reading-intro': 'Part 01 · Reading',
    'screen-reading': 'Part 01 · Reading',
    'screen-writing-intro': 'Part 02 · Writing',
    'screen-writing': 'Part 02 · Writing',
    'screen-listening-intro': 'Part 03 · Listening',
    'screen-listening': 'Part 03 · Listening',
    'screen-speaking-intro': 'Part 04 · Speaking',
    'screen-speaking': 'Part 04 · Speaking',
    'screen-results': 'Results',
  };
  document.getElementById('navSection').textContent = labels[id] || '';
}

const screenOrder = ['screen-cover','screen-reading-intro','screen-reading','screen-writing-intro','screen-writing','screen-listening-intro','screen-listening','screen-speaking-intro','screen-speaking','screen-results'];

function updateProgress(id) {
  const idx = screenOrder.indexOf(id);
  const pct = idx < 0 ? 0 : Math.round((idx / (screenOrder.length - 1)) * 100);
  document.getElementById('progressBar').style.width = pct + '%';
}

// ── beforeunload — warn when test is in progress ──
var testInProgress = false;
function onBeforeUnload(e) { if (testInProgress) { e.preventDefault(); } }
window.addEventListener('beforeunload', onBeforeUnload);

// ── START ──
function startTest() {
  const nameEl = document.getElementById('candidateName');
  const dateEl = document.getElementById('candidateDate');
  if (!nameEl.value.trim()) {
    nameEl.style.borderColor = 'var(--rust)';
    nameEl.focus();
    nameEl.placeholder = 'Name is required *';
    return;
  }
  if (!dateEl.value) {
    dateEl.style.borderColor = 'var(--rust)';
    dateEl.focus();
    return;
  }
  nameEl.style.borderColor = '';
  dateEl.style.borderColor = '';
  if (!dateEl.value) dateEl.value = localDateString();
  testInProgress = true;
  state.startTime = new Date();
  state.submissionId = newSubmissionId(); // DATA-2
  showScreen('screen-reading-intro');
  startTestAutoSave();
}

// ── MCQ ──
function selectMCQ(qId, letter, isCorrect) {
  if (state.answers[qId]) return; // already answered
  state.answers[qId] = { selected: letter, correct: isCorrect };

  const card = document.getElementById(qId + '-card') || document.querySelector(`[id^="${qId}"]`)?.closest('.question-card');
  const btns = document.querySelectorAll(`[onclick*="'${qId}'"]`);

  btns.forEach(btn => {
    btn.disabled = true;
    const btnLetter = btn.querySelector('.opt-letter').textContent.trim();
    const correctLetter = CORRECT_ANSWERS[qId];
    if (btnLetter === correctLetter) btn.classList.add('correct');
    else if (btnLetter === letter && !isCorrect) btn.classList.add('wrong');
  });

  const fb = document.getElementById(qId + '-fb');
  if (fb) {
    fb.setAttribute('aria-live', 'polite');
    fb.classList.add('show');
    if (isCorrect) {
      fb.classList.add('correct-fb');
      fb.textContent = '✓ Correct! +' + (MCQ_MARKS[qId] || 2) + ' marks';
    } else {
      fb.classList.add('wrong-fb');
      fb.textContent = '✗ Incorrect. The correct answer is ' + CORRECT_ANSWERS[qId] + '.';
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
  } else {
    state.q19selected.add(letter);
    btn.classList.add('selected');
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
      if (Q19_CORRECT.has(letter)) btn.classList.add('correct');
      else if (state.q19selected.has(letter)) btn.classList.add('wrong');
    }
  });

  const fb = document.getElementById('q19-fb');
  fb.setAttribute('aria-live', 'polite');
  fb.classList.add('show');
  if (correct) {
    fb.classList.add('correct-fb');
    fb.textContent = '✓ Correct! Both answers found. +2 marks';
    state.answers['q19'] = { correct: true, marks: 2 };
  } else {
    fb.classList.add(partialCorrect > 0 ? 'info-fb' : 'wrong-fb');
    fb.textContent = partialCorrect > 0 ? `Partially correct. ${partialCorrect}/2 correct answers selected. +${partialCorrect} mark${partialCorrect>1?'s':''}.` : '✗ Neither answer was correct. Correct answers: Reception and the Website.';
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
    el.disabled = true;
    el.style.opacity = '0.4';
    state.textAnswers[qId] = '[SKIPPED]';
  } else {
    el.required = true;
    el.disabled = false;
    el.style.opacity = '';
    state.textAnswers[qId] = el.value;
  }
}

function updateWordCount() {
  const text = document.getElementById('q14').value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  const wc = document.getElementById('wordCount');
  wc.textContent = words + ' words';
  wc.style.color = (words >= 120 && words <= 150) ? 'var(--green)' : words > 150 ? 'var(--rust)' : 'var(--muted)';
  saveText('q14');
}

function chooseTask(opt) {
  state.chosenTask = opt;
  document.getElementById('taskA').classList.toggle('chosen', opt === 'A');
  document.getElementById('taskB').classList.toggle('chosen', opt === 'B');
  document.getElementById('q14').placeholder = opt === 'A'
    ? 'Write your informal email here (120–150 words)…'
    : 'Write your opinion paragraph here (120–150 words)…';
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

const MSG_NO_SPEAKING = 'Voice recording is not available on this device. That is fine: write your ideas in the box above and your teacher will listen to you on the video call. / ' +
  'La grabación de voz no está disponible en este dispositivo. No hay problema: escribe tus ideas en el cuadro de arriba y tu profesor te escuchará en la videollamada.';
const MSG_NO_MIC = 'We could not use the microphone. Allow microphone access for this site in your browser settings, then tap Record again. / ' +
  'No pudimos usar el micrófono. Permite el acceso al micrófono para este sitio en la configuración del navegador y toca Grabar de nuevo.';

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
  var btn = document.getElementById('rec-btn-' + qId);
  var statusEl = document.getElementById('rec-status-' + qId);
  btn.textContent = '🎤 Record again';
  btn.style.background = 'var(--ink)';
  statusEl.style.display = 'block';
  statusEl.textContent = canRecordAudio()
    ? '✓ Recording saved. Tap Record again to replace it. / Grabación guardada. Toca Grabar de nuevo para reemplazarla.'
    : 'Recording stopped.';
  state.textAnswers[qId + '_transcript'] = rec.transcript;
}

async function toggleSpeakingRec(qId) {
  var statusEl = document.getElementById('rec-status-' + qId);
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!canRecordAudio() && !SR) {
    // IOS-1c: do not send an iPad/iPhone user off to install another browser.
    // The notes box above is the answer; the teacher listens on the video call.
    statusEl.style.display = 'block';
    statusEl.textContent = MSG_NO_SPEAKING;
    return;
  }

  var rec = speakingRecorders[qId];
  if (!rec) rec = speakingRecorders[qId] = { recognition: null, recorder: null, chunks: [], recording: false, starting: false, transcript: '' };
  if (rec.recording) { stopSpeakingRec(qId); return; }
  if (rec.starting) return; // a second tap while the mic permission prompt is open

  // One question at a time.
  Object.keys(speakingRecorders).forEach(function (k) { if (k !== qId) stopSpeakingRec(k); });

  var btn = document.getElementById('rec-btn-' + qId);
  var transcriptEl = document.getElementById('rec-transcript-' + qId);
  statusEl.style.display = 'block';

  // Ask for the microphone first, inside the tap that started this (iOS requires it).
  var stream = null;
  if (canRecordAudio()) {
    rec.starting = true;
    stream = await getSpeakingStream();
    rec.starting = false;
    if (!stream && !SR) { statusEl.textContent = MSG_NO_MIC; return; }
  }

  rec.transcript = '';
  rec.recording = true;
  btn.textContent = '■ Stop Recording';
  btn.style.background = 'var(--rust)';
  statusEl.textContent = 'Recording… speak now. / Grabando… habla ahora.';

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
        player.style.cssText = 'display:block;width:100%;max-width:360px;margin-top:8px;';
        statusEl.insertAdjacentElement('afterend', player);
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

// ── Listening audio with stop button and play-time tracking ──
let listeningPlayStart = null;
let listeningTotalTime = 0;
let dictationPlayStart = null;
let dictationTotalTime = 0;

function playListeningAudio() {
  if (state.listeningPlays >= MAX_PLAYS) return;
  state.listeningPlays++;
  var left = MAX_PLAYS - state.listeningPlays;
  document.getElementById('audioPlaysLeft').textContent = left === 0 ? 'No plays left' : left + ' play' + (left === 1 ? '' : 's') + ' left';
  document.getElementById('audioStatus').textContent = 'Playing…';
  document.getElementById('playBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = 'flex';
  listeningPlayStart = Date.now();
  if (left === 0) {
    document.getElementById('listeningAudioBox').style.opacity = '0.7';
  }
  speakText(LISTENING_TEXT, function() {
    finishListeningPlay(left);
  });
}

function stopListeningAudio() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  var left = MAX_PLAYS - state.listeningPlays;
  finishListeningPlay(left);
}

function finishListeningPlay(left) {
  if (listeningPlayStart) {
    listeningTotalTime += Date.now() - listeningPlayStart;
    listeningPlayStart = null;
  }
  document.getElementById('stopBtn').style.display = 'none';
  document.getElementById('playBtn').style.display = 'flex';
  document.getElementById('audioStatus').textContent = left > 0 ? 'Click to listen again' : 'No more plays available';
  var ptEl = document.getElementById('audioPlayTime');
  ptEl.style.display = 'inline';
  ptEl.textContent = ' · ' + formatPlayTime(listeningTotalTime);
  if (left === 0) {
    document.getElementById('playBtn').style.opacity = '0.4';
    document.getElementById('playBtn').style.cursor = 'default';
  }
}

function playDictationAudio() {
  if (state.dictationPlays >= MAX_PLAYS) return;
  state.dictationPlays++;
  var left = MAX_PLAYS - state.dictationPlays;
  document.getElementById('dictPlaysLeft').textContent = left === 0 ? 'No plays left' : left + ' play' + (left === 1 ? '' : 's') + ' left';
  document.getElementById('dictAudioStatus').textContent = 'Playing…';
  document.getElementById('dictPlayBtn').style.display = 'none';
  document.getElementById('dictStopBtn').style.display = 'flex';
  dictationPlayStart = Date.now();
  if (left === 0) {
    document.getElementById('dictationAudioBox').style.opacity = '0.7';
  }
  speakText(DICTATION_TEXT, function() {
    finishDictationPlay(left);
  });
}

function stopDictationAudio() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  var left = MAX_PLAYS - state.dictationPlays;
  finishDictationPlay(left);
}

function finishDictationPlay(left) {
  if (dictationPlayStart) {
    dictationTotalTime += Date.now() - dictationPlayStart;
    dictationPlayStart = null;
  }
  document.getElementById('dictStopBtn').style.display = 'none';
  document.getElementById('dictPlayBtn').style.display = 'flex';
  document.getElementById('dictAudioStatus').textContent = left > 0 ? 'Click to hear again' : 'No more plays available';
  var ptEl = document.getElementById('dictPlayTime');
  ptEl.style.display = 'inline';
  ptEl.textContent = ' · ' + formatPlayTime(dictationTotalTime);
  if (left === 0) {
    document.getElementById('dictPlayBtn').style.opacity = '0.4';
    document.getElementById('dictPlayBtn').style.cursor = 'default';
  }
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
  timeSummary.innerHTML = [
    { label: 'Started', value: state.startTime ? state.startTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—' },
    { label: 'Finished', value: state.endTime ? state.endTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—' },
    { label: 'Duration', value: duration ? formatDuration(duration) : '—' },
  ].map(item => `<div><div style="font-size:9px;letter-spacing:0.25em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:4px;">${item.label}</div><div style="font-family:'Playfair Display',serif;font-size:22px;font-weight:700;color:var(--ink);">${item.value}</div></div>`).join('');

  // Submission banner
  const banner = document.getElementById('submissionBanner');
  if (submissionOk) {
    banner.style.display = 'block';
    banner.textContent = '✓ ' + submissionMsg;
  } else {
    banner.style.borderColor = 'var(--rust)';
    banner.style.background = '#fdecea';
    banner.style.color = 'var(--rust)';
    banner.style.display = 'block';
    banner.textContent = submissionMsg;
    // Give the student a way out rather than a dead end.
    const retry = document.createElement('button');
    retry.id = 'retrySubmitBtn';
    retry.textContent = 'Retry submission';
    retry.setAttribute('onclick', 'retrySubmission()');
    retry.style.cssText =
      'display:block;margin:12px auto 0;padding:10px 24px;font-size:14px;cursor:pointer;' +
      'background:var(--rust);color:white;border:none;border-radius:4px;font-family:inherit;';
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
  FP.showSaveOverlay('Submitting your test results…');

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
    FP.updateSaveOverlay('Uploading your recordings…');
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
      FP.updateSaveOverlay('Confirming your results were saved…');
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
    msg = '⚠️ Submission endpoints not configured. Please ask your examiner to set up the test.';
  } else if (results.verified) {
    ok = true;
    msg = results.email === 'ok'
      ? 'Your results have been saved and emailed to your examiner.'
      : 'Your results have been saved.';
  } else if (results.email === 'ok') {
    ok = false;
    msg = '⚠️ We emailed your results to your examiner, but could not confirm they were saved. ' +
          'Please tap "Retry submission" — your answers are still saved on this device.';
  } else {
    ok = false;
    msg = '⚠️ We could not confirm your results were saved. Please tap "Retry submission". ' +
          'Your answers are still saved on this device — do not close this page.';
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
  if (btn) { btn.disabled = true; btn.textContent = 'Retrying…'; }

  if (state.submissionId) {
    FP.showSaveOverlay('Checking whether your results arrived…');
    const alreadyLanded = await verifySubmission(state.submissionId);
    FP.hideSaveOverlay();
    if (alreadyLanded) {
      showResultsScreen(true, 'Your results have been saved.', true);
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
    var b = document.getElementById('rec-btn-' + q);
    if (b) { b.textContent = '🎤 Record your answer'; b.style.background = 'var(--ink)'; }
  });

  // Reset all MCQ buttons
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = false;
    btn.classList.remove('selected','correct','wrong');
  });

  // Reset all feedbacks
  document.querySelectorAll('.q-feedback').forEach(fb => {
    fb.className = 'q-feedback';
    fb.textContent = '';
  });

  // Reset text inputs
  document.querySelectorAll('.text-input-area').forEach(el => el.value = '');
  document.getElementById('wordCount').textContent = '0 words';

  // Reset task choice
  document.getElementById('taskA').classList.remove('chosen');
  document.getElementById('taskB').classList.remove('chosen');

  // Reset audio players
  document.getElementById('audioStatus').textContent = 'Press play to listen — you may play this up to 3 times';
  document.getElementById('playBtn').textContent = '▶';
  document.getElementById('audioPlaysLeft').textContent = '3 plays left';
  document.getElementById('listeningAudioBox').style.opacity = '';
  document.getElementById('listeningAudioBox').style.cursor = '';
  document.getElementById('dictAudioStatus').textContent = 'Press play to hear the sentence';
  document.getElementById('dictPlayBtn').textContent = '▶';
  document.getElementById('dictPlaysLeft').textContent = '3 plays left';
  document.getElementById('dictationAudioBox').style.opacity = '';
  document.getElementById('dictationAudioBox').style.cursor = '';
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  // Reset submission banner
  const banner = document.getElementById('submissionBanner');
  if (banner) { banner.style.display = 'none'; banner.textContent = ''; }

  // Reset nav score
  document.getElementById('navScore').textContent = '';

  showScreen('screen-cover');
}

// Set today's date on load
window.addEventListener('DOMContentLoaded', () => {
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
    if (typeof CallRequest !== 'undefined') CallRequest.init({ page: 'test' });
  }
  initCallRequest();
  nameField.addEventListener('blur', initCallRequest);
});

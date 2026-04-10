/* ═══════════════════════════════════════════════════════════════
   FluentPath — Google Apps Script (Web App)
   ─────────────────────────────────────────────────────────────
   Deployment:
     1. Open script.google.com → create or edit project
     2. Paste this entire file into Code.gs
     3. Set the Claude API key in Script Properties:
        Project Settings (gear icon) → Script Properties → Add:
          Property: CLAUDE_API_KEY
          Value:    sk-ant-... (your key)
        Optional override:
          Property: CLAUDE_MODEL
          Value:    claude-haiku-4-5  (default; or claude-sonnet-4-6 for higher quality)
     4. Deploy → New deployment → Web app
        - Execute as: Me
        - Who has access: Anyone
     5. Copy the deployment URL and use it in the platform

   Handles all GET (reads + AI lesson generation) and POST (writes) for FluentPath.
   ═══════════════════════════════════════════════════════════════ */

// ══════════════════════════════════════════════════════
// CLAUDE API CONFIG
// ══════════════════════════════════════════════════════
var CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
var CLAUDE_DEFAULT_MODEL = 'claude-haiku-4-5';
var CLAUDE_MAX_TOKENS = 4096;

// ══════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════

/** Get a sheet by name, creating it with headers if it doesn't exist */
function getOrCreateSheet(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  }
  return sheet;
}

/** Read all rows from a sheet and return as array of objects */
function sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var results = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[String(headers[j]).trim()] = data[i][j];
    }
    results.push(obj);
  }
  return results;
}

/** Find the last row matching a student name (case-insensitive) */
function findLastByStudent(sheetName, headers, studentName) {
  var sheet = getOrCreateSheet(sheetName, headers);
  var rows = sheetToObjects(sheet);
  var match = null;
  var nameKey = null;

  // Try common column names for student
  var nameColumns = ['candidate_name', 'student_name', 'name'];
  for (var k = 0; k < nameColumns.length; k++) {
    if (rows.length > 0 && rows[0].hasOwnProperty(nameColumns[k])) {
      nameKey = nameColumns[k];
      break;
    }
  }
  if (!nameKey) return null;

  var target = String(studentName).toLowerCase().trim();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][nameKey]).toLowerCase().trim() === target) {
      match = rows[i];
    }
  }
  return match;
}

/**
 * Ensure the sheet's header row contains every column in `expectedHeaders`.
 * Missing columns are appended on the right (existing columns and data are
 * left in place). Returns the actual header row after extension.
 */
function ensureSheetHeaders(sheet, expectedHeaders) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(expectedHeaders);
    sheet.getRange(1, 1, 1, expectedHeaders.length).setFontWeight('bold');
    return expectedHeaders.slice();
  }
  var actual = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h).trim(); });
  var missing = expectedHeaders.filter(function(h) { return actual.indexOf(h) < 0; });
  if (missing.length === 0) return actual;

  var startCol = actual.length + 1;
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing]);
  sheet.getRange(1, startCol, 1, missing.length).setFontWeight('bold');
  return actual.concat(missing);
}

/** Upsert a row: update if student exists, insert if not.
 *  Matches data fields against the sheet's ACTUAL header row (not the
 *  HEADERS constant) so adding new columns to HEADERS doesn't misalign
 *  rows in existing sheets. Auto-extends the sheet with any missing columns. */
function upsertByStudent(sheetName, headers, studentName, data) {
  var sheet = getOrCreateSheet(sheetName, headers);
  var actualHeaders = ensureSheetHeaders(sheet, headers);

  var nameColIndex = -1;
  var nameColumns = ['student_name', 'candidate_name', 'name'];
  for (var k = 0; k < nameColumns.length; k++) {
    nameColIndex = actualHeaders.indexOf(nameColumns[k]);
    if (nameColIndex >= 0) break;
  }

  var target = String(studentName).toLowerCase().trim();
  var existingRow = -1;

  if (nameColIndex >= 0 && sheet.getLastRow() > 1) {
    var nameValues = sheet.getRange(2, nameColIndex + 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < nameValues.length; i++) {
      if (String(nameValues[i][0]).toLowerCase().trim() === target) {
        existingRow = i + 2; // 1-based, skipping header row
        break;
      }
    }
  }

  // Build the row using ACTUAL sheet headers — preserves alignment if the
  // sheet has extra columns or a different order than the constant.
  var rowData = actualHeaders.map(function(h) {
    return data[h] !== undefined ? data[h] : '';
  });

  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }
}


// ══════════════════════════════════════════════════════
// SHEET DEFINITIONS (headers for each tab)
// ══════════════════════════════════════════════════════

var HEADERS = {
  'Initial Test Results': [
    'submitted_at', 'candidate_name', 'test_date', 'start_time', 'end_time', 'duration',
    'reading_score', 'listening_score', 'auto_total',
    'writing_score', 'speaking_score', 'mcq_answers',
    'q11_passive_voice', 'q12_combined_sentence', 'q13_error_correction',
    'q14_writing_task', 'q20_dictation',
    'q21_speaking_notes', 'q22_speaking_notes',
    'q23_speaking_notes', 'q24_speaking_notes'
  ],
  'Examiner Results': [
    'graded_at', 'candidate_name', 'test_date', 'examiner',
    'reading_score', 'writing_score', 'listening_score', 'speaking_score',
    'total_score', 'cefr_level',
    'examiner_feedback',
    'score_q11', 'score_q12', 'score_q13', 'score_q14', 'score_q20',
    'score_q21', 'score_q22', 'score_q23', 'score_q24',
    'notes_q11', 'notes_q12', 'notes_q13', 'notes_q14',
    'notes_q21', 'notes_q22', 'notes_q23', 'notes_q24'
  ],
  'Course Progress': [
    'submitted_at', 'action', 'student_name', 'level',
    'lesson_date', 'day_number', 'start_time', 'end_time',
    'time_spent_min', 'topic', 'confidence',
    'writing_response', 'student_notes', 'warmup_response',
    'speaking_transcript', 'answers_json'
  ],
  'Settings': [
    'student_name', 'teacher_name', 'cefr_level',
    'allow_spanish', 'allow_skip_test', 'allow_retake_test',
    'course_month', 'updated_at', 'notes',
    'difficulty_json'
  ],
  'Lesson Marks': [
    'graded_at', 'teacher_name', 'student_name',
    'lesson_date', 'day_number', 'level',
    'writing_score', 'speaking_score', 'total_score',
    'writing_breakdown', 'speaking_breakdown', 'overall_feedback'
  ],
  'Students': [
    'student_name', 'date_joined'
  ],
  'Lesson Library': [
    'id', 'level', 'day', 'created_at', 'source_student',
    'original_difficulty_json', 'lesson_json', 'is_active', 'times_served'
  ]
};


// ══════════════════════════════════════════════════════
// doGET — handles all read requests
// ══════════════════════════════════════════════════════

function doGet(e) {
  var action = (e.parameter.action || '').trim();
  var student = (e.parameter.student || '').trim();
  var result = { found: false };

  try {
    if (action === 'get_progress') {
      result = handleGetProgress(student);

    } else if (action === 'get_settings') {
      result = handleGetSettings(student);

    } else if (action === 'get_test_results') {
      result = handleGetTestResults(student);

    } else if (action === 'get_latest_submission') {
      result = handleGetLatestSubmission(student);

    } else if (action === 'get_students') {
      result = handleGetStudents();

    } else if (action === 'generate_lesson') {
      result = handleGenerateLesson(
        e.parameter.level,
        parseInt(e.parameter.day, 10),
        e.parameter.topic,
        String(e.parameter.spanish || '').toLowerCase() === 'true',
        student
      );

    } else if (action === 'get_library') {
      result = handleGetLibrary();

    } else if (action === 'get_library_entry') {
      result = handleGetLibraryEntry(e.parameter.id);

    } else {
      result = { error: 'Unknown action: ' + action };
    }
  } catch (err) {
    result = { error: err.message };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}


// ── GET: get_progress ──────────────────────────────────
// Returns the student's journey status for the hub page
function handleGetProgress(studentName) {
  if (!studentName) return { found: false };

  var result = {
    found: false,
    test_completed: false,
    test_date: null,
    cefr_level: null,
    total_score: null,
    lessons_completed: 0,
    last_lesson_date: null,
    lessons: []
  };

  // Check if placement test was taken
  var testRow = findLastByStudent('Initial Test Results', HEADERS['Initial Test Results'], studentName);
  if (testRow) {
    result.found = true;
    result.test_completed = true;
    result.test_date = testRow['test_date'] || testRow['date'] || null;
  }

  // Check if test has been graded (CEFR level assigned)
  var gradedRow = findLastByStudent('Examiner Results', HEADERS['Examiner Results'], studentName);
  if (gradedRow) {
    result.found = true;
    result.cefr_level = gradedRow['cefr_level'] || null;
    result.total_score = gradedRow['total_score'] || null;
  }

  // Check course progress
  var progressSheet = getOrCreateSheet('Course Progress', HEADERS['Course Progress']);
  var progressRows = sheetToObjects(progressSheet);
  var target = String(studentName).toLowerCase().trim();
  var lessons = [];

  for (var i = 0; i < progressRows.length; i++) {
    var name = String(progressRows[i]['student_name'] || '').toLowerCase().trim();
    if (name === target) {
      result.found = true;
      lessons.push({
        day: progressRows[i]['day_number'],
        topic: progressRows[i]['topic'] || '',
        date: progressRows[i]['lesson_date'] || '',
        time_spent: progressRows[i]['time_spent_min'] || '',
        confidence: progressRows[i]['confidence'] || ''
      });
    }
  }

  result.lessons = lessons;
  result.lessons_completed = lessons.length;
  if (lessons.length > 0) {
    result.last_lesson_date = lessons[lessons.length - 1].date;
  }

  // Auto-register student in Students tab if not already present
  var studentsSheet = getOrCreateSheet('Students', HEADERS['Students']);
  var studentsRows = sheetToObjects(studentsSheet);
  var alreadyRegistered = false;
  for (var s = 0; s < studentsRows.length; s++) {
    var sName = studentsRows[s]['student_name'] || studentsRows[s]['Student Name'] || '';
    if (String(sName).toLowerCase().trim() === target) {
      alreadyRegistered = true;
      break;
    }
  }
  if (!alreadyRegistered) {
    studentsSheet.appendRow([studentName, new Date().toISOString().split('T')[0]]);
  }

  return result;
}


// ── GET: get_students ─────────────────────────────────
// Returns list of all registered students
function handleGetStudents() {
  var sheet = getOrCreateSheet('Students', HEADERS['Students']);
  var rows = sheetToObjects(sheet);
  var students = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var name = row['student_name'] || row['Student Name'] || '';
    var joined = row['date_joined'] || row['Date joined'] || '';
    // Format Date objects to YYYY-MM-DD string
    if (joined instanceof Date) {
      joined = joined.toISOString().split('T')[0];
    }
    if (name) {
      students.push({ name: String(name), date_joined: String(joined) });
    }
  }
  return { found: true, students: students };
}


// ── GET: get_settings ──────────────────────────────────
// Returns teacher preferences for a student
function handleGetSettings(studentName) {
  if (!studentName) return { found: false };

  var row = findLastByStudent('Settings', HEADERS['Settings'], studentName);
  if (!row) return { found: false };

  return {
    found: true,
    allow_spanish: String(row['allow_spanish']).toLowerCase() === 'true',
    allow_skip_test: String(row['allow_skip_test']).toLowerCase() === 'true',
    allow_retake_test: String(row['allow_retake_test']).toLowerCase() === 'true',
    cefr_level: row['cefr_level'] || null,
    teacher_name: row['teacher_name'] || null
  };
}


// ── GET: get_test_results ──────────────────────────────
// Returns the student's placement test submission AND any existing graded results
function handleGetTestResults(studentName) {
  if (!studentName) return { found: false };

  var row = findLastByStudent('Initial Test Results', HEADERS['Initial Test Results'], studentName);
  if (!row) return { found: false };

  row['found'] = true;

  // Also check if the test has already been graded (Examiner Results)
  var graded = findLastByStudent('Examiner Results', HEADERS['Examiner Results'], studentName);
  if (graded) {
    row['graded'] = true;
    row['graded_reading_score'] = graded['reading_score'] || '';
    row['graded_writing_score'] = graded['writing_score'] || '';
    row['graded_listening_score'] = graded['listening_score'] || '';
    row['graded_speaking_score'] = graded['speaking_score'] || '';
    row['graded_total_score'] = graded['total_score'] || '';
    row['graded_cefr_level'] = graded['cefr_level'] || '';
    row['graded_feedback'] = graded['examiner_feedback'] || '';
    // Individual question notes
    row['graded_notes_q11'] = graded['notes_q11'] || '';
    row['graded_notes_q12'] = graded['notes_q12'] || '';
    row['graded_notes_q13'] = graded['notes_q13'] || '';
    row['graded_notes_q14'] = graded['notes_q14'] || '';
    row['graded_notes_q21'] = graded['notes_q21'] || '';
    row['graded_notes_q22'] = graded['notes_q22'] || '';
    row['graded_notes_q23'] = graded['notes_q23'] || '';
    row['graded_notes_q24'] = graded['notes_q24'] || '';
    // Individual question scores (if saved)
    row['graded_q11'] = graded['score_q11'] || '';
    row['graded_q12'] = graded['score_q12'] || '';
    row['graded_q13'] = graded['score_q13'] || '';
    row['graded_q14'] = graded['score_q14'] || '';
    row['graded_q20'] = graded['score_q20'] || '';
    row['graded_q21'] = graded['score_q21'] || '';
    row['graded_q22'] = graded['score_q22'] || '';
    row['graded_q23'] = graded['score_q23'] || '';
    row['graded_q24'] = graded['score_q24'] || '';
  }

  return row;
}


// ── GET: get_latest_submission ─────────────────────────
// Returns the most recent lesson submission (prefers ungraded; falls back to latest graded)
// Also includes existing marks if the submission has been graded
function handleGetLatestSubmission(studentName) {
  if (!studentName) return { found: false };

  // Get all course progress rows for this student
  var progressSheet = getOrCreateSheet('Course Progress', HEADERS['Course Progress']);
  var progressRows = sheetToObjects(progressSheet);
  var target = String(studentName).toLowerCase().trim();

  // Get all graded days for this student (with their marks data)
  var marksSheet = getOrCreateSheet('Lesson Marks', HEADERS['Lesson Marks']);
  var marksRows = sheetToObjects(marksSheet);
  var gradedDays = {};
  for (var j = 0; j < marksRows.length; j++) {
    if (String(marksRows[j]['student_name'] || '').toLowerCase().trim() === target) {
      gradedDays[String(marksRows[j]['day_number'])] = marksRows[j];
    }
  }

  // Find the latest ungraded submission; track latest overall as fallback
  var latestUngraded = null;
  var latestOverall = null;
  for (var i = 0; i < progressRows.length; i++) {
    var name = String(progressRows[i]['student_name'] || '').toLowerCase().trim();
    if (name === target) {
      latestOverall = progressRows[i];
      var dayNum = String(progressRows[i]['day_number'] || '');
      if (!gradedDays[dayNum]) {
        latestUngraded = progressRows[i];
      }
    }
  }

  // Prefer ungraded; fall back to latest submission
  var latest = latestUngraded || latestOverall;
  if (!latest) return { found: false };

  latest['found'] = true;

  // Attach existing marks if this day has been graded
  var dayKey = String(latest['day_number'] || '');
  var marks = gradedDays[dayKey];
  if (marks) {
    latest['has_marks'] = true;
    latest['marks_writing_score'] = marks['writing_score'] || '';
    latest['marks_speaking_score'] = marks['speaking_score'] || '';
    latest['marks_total_score'] = marks['total_score'] || '';
    latest['marks_writing_breakdown'] = marks['writing_breakdown'] || '';
    latest['marks_speaking_breakdown'] = marks['speaking_breakdown'] || '';
    latest['marks_overall_feedback'] = marks['overall_feedback'] || '';
  }

  return latest;
}


// ── GET: generate_lesson ───────────────────────────────
// Checks the Lesson Library first (decisions 3–6, 9); falls back to fresh
// Claude generation when needed. Returns { found, lesson, source } where
// source is 'library' | 'rewrite' | 'fresh'.
function handleGenerateLesson(level, day, topic, allowSpanish, studentName) {
  if (!level || !day || !topic) {
    return { error: 'Missing required parameter (level, day, topic)' };
  }

  var props  = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('CLAUDE_API_KEY');
  if (!apiKey) return { error: 'CLAUDE_API_KEY not set in Script Properties' };
  var model = props.getProperty('CLAUDE_MODEL') || CLAUDE_DEFAULT_MODEL;

  // Load teacher's difficulty profile for this student (if any)
  var difficulty = null;
  if (studentName) {
    var settingsRow = findLastByStudent('Settings', HEADERS['Settings'], studentName);
    if (settingsRow && settingsRow['difficulty_json']) {
      try { difficulty = JSON.parse(String(settingsRow['difficulty_json'])); }
      catch (parseErr) { console.warn('Could not parse difficulty_json for ' + studentName + ': ' + parseErr.message); }
    }
  }

  // Decision 5: non-empty aiInstructions → skip library entirely (serve fresh, no write-back)
  var hasCustomInstructions = !!(difficulty && (difficulty.aiInstructions || '').trim().length > 0);

  // ── Library lookup (non-blocking — any failure falls through to fresh generation) ──
  if (!hasCustomInstructions) {
    try {
      var entries      = getLibraryEntries(level, day);
      var recycleChance = recycleProbability(entries.length);

      if (entries.length > 0 && Math.random() < recycleChance) {
        var match = findLibraryMatch(entries, difficulty || {});
        if (match && match.lesson) {
          try { incrementTimesServed(match.id); } catch (e) {}
          return { found: true, lesson: match.lesson, source: 'library' };
        }

        // Option C: no direct match — rewrite closest entry for this difficulty
        var closest = findClosestEntry(entries, difficulty || {});
        if (closest && closest.lesson) {
          try {
            var rewritten = rewriteLessonForDifficulty(closest.lesson, difficulty || {}, level, day, apiKey, model);
            try { addToLibrary(level, day, rewritten, difficulty || {}, studentName); } catch (e) {}
            return { found: true, lesson: rewritten, source: 'rewrite' };
          } catch (rewriteErr) {
            console.warn('Option-C rewrite failed, generating fresh: ' + rewriteErr.message);
            // fall through to fresh generation below
          }
        }
      }
    } catch (libLookupErr) {
      console.warn('Library lookup failed (non-fatal), generating fresh: ' + libLookupErr.message);
      // fall through to fresh generation — the library never blocks a lesson
    }
  }

  // ── Fresh generation ────────────────────────────────
  var prompt = buildLessonPrompt(level, day, topic, allowSpanish, difficulty);

  try {
    var resp = UrlFetchApp.fetch(CLAUDE_API_URL, {
      method:      'post',
      contentType: 'application/json',
      headers:     { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload:     JSON.stringify({ model: model, max_tokens: CLAUDE_MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }),
      muteHttpExceptions: true
    });

    var code = resp.getResponseCode();
    var body = JSON.parse(resp.getContentText());

    if (code >= 400) {
      var msg = (body && body.error && body.error.message) || ('HTTP ' + code);
      return { error: 'Claude API error: ' + msg };
    }
    if (!body.content || !body.content.length || body.content[0].type !== 'text') {
      return { error: 'Claude API returned no text content' };
    }

    // Strip markdown code fences if Claude wrapped the JSON despite instructions
    var text = body.content[0].text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();

    var lesson;
    try { lesson = JSON.parse(text); }
    catch (parseErr) { return { error: 'Could not parse lesson JSON: ' + parseErr.message }; }

    // Decision 6: custom-instructed lessons never enter the library
    if (!hasCustomInstructions) {
      try { addToLibrary(level, day, lesson, difficulty || {}, studentName); } catch (e) {
        console.warn('Library write failed (non-fatal): ' + e.message);
      }
    }

    return { found: true, lesson: lesson, source: 'fresh' };
  } catch (err) {
    return { error: 'Lesson generation failed: ' + err.message };
  }
}

/** Build the lesson prompt sent to Claude. Mirrors the structure expected by student-course.html. */
function buildLessonPrompt(level, day, topic, allowSpanish, difficulty) {
  var levelInfo = {
    'A1': { name: 'Beginner',           theme: 'Everyday Survival' },
    'A2': { name: 'Elementary',         theme: 'Community & Life' },
    'B1': { name: 'Intermediate',       theme: 'The Workplace' },
    'B2': { name: 'Upper-Intermediate', theme: 'Career & Society' },
    'C1': { name: 'Advanced',           theme: 'Professional Mastery' },
    'C2': { name: 'Proficiency',        theme: 'Full Fluency' }
  };
  var info = levelInfo[level] || levelInfo['B1'];
  var minWordsMap = { A1: 20, A2: 40, B1: 80, B2: 120, C1: 180, C2: 250 };
  var minWords = minWordsMap[level] || 80;

  var prompt =
    'You are an expert English language teacher designing a lesson for an adult immigrant learner.\n\n' +
    'LEVEL: ' + level + ' (' + info.name + ') — Theme: ' + info.theme + '\n' +
    'DAY: ' + day + ' of 20\n' +
    'FOCUS: vocabulary, pronunciation, speaking (also include listening and writing tasks)\n' +
    "TODAY'S TOPIC: " + topic + '\n\n' +
    'Generate a complete 90-minute lesson plan in JSON format. Return ONLY valid JSON, no markdown, no explanation.\n\n' +
    'JSON structure:\n' +
    '{\n' +
    '  "topic": "lesson topic title",\n' +
    '  "objective": "one sentence: what the student will be able to do after this lesson",\n' +
    '  "warmup": {\n' +
    '    "title": "warm-up title",\n' +
    '    "instruction": "instruction for student",\n' +
    '    "prompt": "a simple question or task to get them thinking"\n' +
    '  },\n' +
    '  "vocabulary": {\n' +
    '    "title": "vocabulary set title",\n' +
    '    "instruction": "how to use these words",\n' +
    '    "words": [\n' +
    '      { "word": "", "pronunciation": "/phonetic/", "partOfSpeech": "", "definition": "", "exampleSentence": "" }\n' +
    '    ]\n' +
    '  },\n' +
    '  "listening": {\n' +
    '    "title": "listening title",\n' +
    '    "instruction": "instruction",\n' +
    '    "audioText": "a paragraph (3-5 sentences) to be read aloud — realistic dialogue or monologue",\n' +
    '    "questions": [\n' +
    '      { "id": "l1", "question": "", "options": ["A","B","C","D"], "correct": 0 },\n' +
    '      { "id": "l2", "question": "", "options": ["A","B","C","D"], "correct": 1 }\n' +
    '    ]\n' +
    '  },\n' +
    '  "speaking": {\n' +
    '    "title": "speaking/pronunciation title",\n' +
    '    "instruction": "instruction",\n' +
    '    "drills": [\n' +
    '      { "id": "s1", "phrase": "phrase to practice", "tip": "pronunciation tip" },\n' +
    '      { "id": "s2", "phrase": "phrase to practice", "tip": "pronunciation tip" }\n' +
    '    ],\n' +
    '    "conversationPrompt": "an open-ended speaking prompt for the student to respond to"\n' +
    '  },\n' +
    '  "practice": {\n' +
    '    "title": "practice activity title",\n' +
    '    "instruction": "instruction",\n' +
    '    "questions": [\n' +
    '      { "id": "p1", "question": "", "options": ["A","B","C","D"], "correct": 0 },\n' +
    '      { "id": "p2", "question": "", "options": ["A","B","C","D"], "correct": 2 },\n' +
    '      { "id": "p3", "question": "", "options": ["A","B","C","D"], "correct": 1 }\n' +
    '    ]\n' +
    '  },\n' +
    '  "writing": {\n' +
    '    "title": "writing title",\n' +
    '    "instruction": "instruction",\n' +
    '    "prompt": "writing prompt",\n' +
    '    "minWords": ' + minWords + '\n' +
    '  },\n' +
    '  "review": {\n' +
    '    "title": "review title",\n' +
    '    "keyTakeaways": ["takeaway 1", "takeaway 2", "takeaway 3"]\n' +
    '  }\n' +
    '}\n\n' +
    'Include 4-6 vocabulary words, 2 listening questions, 2 speaking drills, and 3 practice questions. ' +
    'Make the content REALISTIC and USEFUL for someone who works full time. Use everyday situations: work, shopping, ' +
    'health, family, neighbours, renting, public transport, etc. Level ' + level + ' appropriately. ' +
    "Each day's lesson must be NEW and DIFFERENT — do not reuse words, phrases, or scenarios from a generic template.";

  // Fold in teacher-set difficulty profile, focus areas, and free-form instructions
  var guidance = buildTeacherGuidanceBlock(difficulty, level, minWords);
  if (guidance) {
    prompt += '\n\n' + guidance;
  }

  if (allowSpanish && (level === 'A1' || level === 'A2')) {
    prompt += '\n\nIMPORTANT: This student speaks Spanish. For EVERY text field (title, instruction, prompt, ' +
      'question, conversationPrompt, tip, definition, exampleSentence, keyTakeaways), add a Spanish translation ' +
      'using an "_es" suffix key. For example:\n' +
      '  "title": "Think About Your Day",\n' +
      '  "title_es": "Piensa en Tu Día",\n' +
      '  "definition": "a meeting arranged in advance",\n' +
      '  "definition_es": "una reunión organizada con anticipación"\n' +
      'Include "_es" keys for ALL user-facing strings. Vocabulary words themselves stay in English ' +
      '(they are learning English), but definitions and example sentences need "_es" translations.';
  }

  return prompt;
}

/** Translate the teacher's 1-5 difficulty sliders, focus tags, and free-form
 *  AI instructions into a TEACHER GUIDANCE block appended to the lesson prompt.
 *  Returns null if there's nothing to add. */
function buildTeacherGuidanceBlock(difficulty, level, defaultMinWords) {
  if (!difficulty || typeof difficulty !== 'object') return null;

  var profile = difficulty.difficultyProfile || {};
  var focusTags = difficulty.focusTags || [];
  var instructions = (difficulty.aiInstructions || '').trim();

  var hasProfile = Object.keys(profile).length > 0;
  var hasFocus = focusTags && focusTags.length > 0;
  var hasInstructions = instructions.length > 0;
  if (!hasProfile && !hasFocus && !hasInstructions) return null;

  // Map a 1-5 slider to a short qualitative descriptor
  function describe(val, axis) {
    var n = parseInt(val, 10);
    if (!n || n < 1 || n > 5) return null;
    var scale = {
      1: 'much lower than ' + level + ' standard',
      2: 'slightly lower than ' + level + ' standard',
      3: 'standard for ' + level,
      4: 'slightly higher than ' + level + ' standard',
      5: 'much higher than ' + level + ' standard'
    };
    return axis + ': ' + scale[n] + ' (level ' + n + '/5)';
  }

  var lines = [];

  if (hasProfile) {
    var labels = {
      vocabulary_density:  'Vocabulary density (number of new words)',
      sentence_complexity: 'Sentence complexity in examples',
      speaking_duration:   'Speaking task length',
      writing_length:      'Writing task minimum length',
      listening_speed:     'Listening passage pacing',
      grammar_complexity:  'Grammar structures introduced'
    };
    Object.keys(labels).forEach(function(key) {
      if (profile[key] != null) {
        var line = describe(profile[key], labels[key]);
        if (line) lines.push('- ' + line);
      }
    });

    // Concrete numeric overrides where they apply
    if (profile.vocabulary_density) {
      var vd = parseInt(profile.vocabulary_density, 10);
      var vocabCount = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 8 }[vd];
      if (vocabCount) lines.push('- Use exactly ' + vocabCount + ' vocabulary words.');
    }
    if (profile.writing_length) {
      var wl = parseInt(profile.writing_length, 10);
      var ratio = { 1: 0.6, 2: 0.8, 3: 1.0, 4: 1.3, 5: 1.6 }[wl];
      if (ratio) {
        var adjusted = Math.round(defaultMinWords * ratio);
        lines.push('- Set writing.minWords to ' + adjusted + '.');
      }
    }
  }

  if (hasFocus) {
    lines.push('- Focus areas to emphasise this lesson: ' + focusTags.join(', ') + '.');
  }

  if (hasInstructions) {
    lines.push('- Additional teacher instructions: ' + instructions);
  }

  return 'TEACHER GUIDANCE (override defaults above where they conflict):\n' + lines.join('\n');
}


// ══════════════════════════════════════════════════════
// LESSON LIBRARY — helpers
// ══════════════════════════════════════════════════════

var SLIDER_KEYS = [
  'vocabulary_density', 'sentence_complexity', 'speaking_duration',
  'writing_length', 'listening_speed', 'grammar_complexity'
];

/**
 * Returns the probability (0–1) that a given library coverage count should
 * trigger a recycle attempt rather than fresh generation (decision 3).
 *   0–4  → 0   (100% fresh — seed phase)
 *   5–9  → 0.5 (50% recycle)
 *   10+  → 0.8 (80% recycle)
 */
function recycleProbability(entryCount) {
  if (entryCount < 5)  return 0;
  if (entryCount < 10) return 0.5;
  return 0.8;
}

/** Load all active entries for a (level, day) bucket, with parsed difficulty + lesson objects. */
function getLibraryEntries(level, day) {
  var sheet  = getOrCreateSheet('Lesson Library', HEADERS['Lesson Library']);
  var rows   = sheetToObjects(sheet);
  var result = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r['level']).trim() !== String(level).trim()) continue;
    if (parseInt(r['day'], 10) !== parseInt(day, 10)) continue;
    if (String(r['is_active']).trim() === 'false') continue;
    var entry = {
      id:             String(r['id']).trim(),
      level:          r['level'],
      day:            r['day'],
      created_at:     r['created_at'],
      source_student: r['source_student'],
      times_served:   parseInt(r['times_served'], 10) || 0,
      difficulty:     null,
      lesson:         null
    };
    try { if (r['original_difficulty_json']) entry.difficulty = JSON.parse(String(r['original_difficulty_json'])); } catch (e) {}
    try { if (r['lesson_json'])              entry.lesson     = JSON.parse(String(r['lesson_json']));              } catch (e) {}
    result.push(entry);
  }
  return result;
}

/**
 * Walk strict → lenient → null (decision 4).
 * Strict:  all 6 sliders within ±1; if incoming difficulty has focusTags, ≥1 must overlap.
 * Lenient: Manhattan distance across all 6 sliders ≤ 4; focus tags ignored.
 */
function findLibraryMatch(entries, difficulty) {
  var profile  = (difficulty && difficulty.difficultyProfile) ? difficulty.difficultyProfile : {};
  var incoming = (difficulty && difficulty.focusTags)         ? difficulty.focusTags          : [];

  function sv(prof, k) { return parseInt(prof[k], 10) || 3; }

  // Strict pass
  for (var i = 0; i < entries.length; i++) {
    var ep     = (entries[i].difficulty && entries[i].difficulty.difficultyProfile) ? entries[i].difficulty.difficultyProfile : {};
    var efTags = (entries[i].difficulty && entries[i].difficulty.focusTags)         ? entries[i].difficulty.focusTags          : [];
    var strictOk = SLIDER_KEYS.every(function(k) { return Math.abs(sv(profile, k) - sv(ep, k)) <= 1; });
    var tagOk    = (incoming.length === 0) || incoming.some(function(t) { return efTags.indexOf(t) >= 0; });
    if (strictOk && tagOk) return entries[i];
  }

  // Lenient pass
  for (var j = 0; j < entries.length; j++) {
    var ep2  = (entries[j].difficulty && entries[j].difficulty.difficultyProfile) ? entries[j].difficulty.difficultyProfile : {};
    var dist = SLIDER_KEYS.reduce(function(sum, k) { return sum + Math.abs(sv(profile, k) - sv(ep2, k)); }, 0);
    if (dist <= 4) return entries[j];
  }

  return null;
}

/**
 * True if any existing entry at this (level, day) has all 6 sliders
 * identical to `difficulty` — prevents near-duplicate writes (decision 9).
 * Only used on the write path; not for serving.
 */
function nearDuplicateExists(entries, difficulty) {
  var profile = (difficulty && difficulty.difficultyProfile) ? difficulty.difficultyProfile : {};
  function sv(prof, k) { return parseInt(prof[k], 10) || 3; }
  return entries.some(function(e) {
    var ep = (e.difficulty && e.difficulty.difficultyProfile) ? e.difficulty.difficultyProfile : {};
    return SLIDER_KEYS.every(function(k) { return sv(profile, k) === sv(ep, k); });
  });
}

/** Return the entry with the smallest Manhattan distance from `difficulty` (used for option C). */
function findClosestEntry(entries, difficulty) {
  var profile = (difficulty && difficulty.difficultyProfile) ? difficulty.difficultyProfile : {};
  function sv(prof, k) { return parseInt(prof[k], 10) || 3; }
  var best = null, bestDist = Infinity;
  for (var i = 0; i < entries.length; i++) {
    var ep   = (entries[i].difficulty && entries[i].difficulty.difficultyProfile) ? entries[i].difficulty.difficultyProfile : {};
    var dist = SLIDER_KEYS.reduce(function(sum, k) { return sum + Math.abs(sv(profile, k) - sv(ep, k)); }, 0);
    if (dist < bestDist) { bestDist = dist; best = entries[i]; }
  }
  return best;
}

/**
 * Append a lesson to the library, subject to the near-duplicate dedup check (decision 9).
 * Returns true if written, false if skipped (duplicate exists).
 */
function addToLibrary(level, day, lesson, difficulty, sourceStudent) {
  var entries = getLibraryEntries(level, day);
  if (nearDuplicateExists(entries, difficulty || {})) return false;

  var id = 'lib_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
  safeAppendRow('Lesson Library', HEADERS['Lesson Library'], {
    id:                       id,
    level:                    String(level),
    day:                      String(day),
    created_at:               new Date().toISOString(),
    source_student:           sourceStudent || '',
    original_difficulty_json: JSON.stringify(difficulty || {}),
    lesson_json:              JSON.stringify(lesson),
    is_active:                'true',
    times_served:             '0'
  });
  return true;
}

/** Increment the times_served counter for a library entry by id. */
function incrementTimesServed(entryId) {
  var sheet  = getOrCreateSheet('Lesson Library', HEADERS['Lesson Library']);
  var actual = ensureSheetHeaders(sheet, HEADERS['Lesson Library']);
  var idCol  = actual.indexOf('id');
  var tsCol  = actual.indexOf('times_served');
  if (idCol < 0 || tsCol < 0 || sheet.getLastRow() < 2) return;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, actual.length).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === String(entryId).trim()) {
      sheet.getRange(i + 2, tsCol + 1).setValue((parseInt(data[i][tsCol], 10) || 0) + 1);
      return;
    }
  }
}

/**
 * Option C: rewrite a source lesson for a new difficulty profile via Claude.
 * Cheaper than full generation — the topic, structure, and activities stay identical.
 */
function rewriteLessonForDifficulty(sourceLesson, targetDifficulty, level, day, apiKey, model) {
  var defaultMinWords = { A1: 20, A2: 40, B1: 80, B2: 120, C1: 180, C2: 250 }[level] || 80;
  var guidance        = buildTeacherGuidanceBlock(targetDifficulty, level, defaultMinWords);

  var prompt =
    'You are an English language teacher. Adjust the following lesson plan to match a new difficulty profile.\n\n' +
    'Keep the topic, theme, and activity structure identical. Only change vocabulary level, sentence complexity, ' +
    'writing minimum word count, speaking task length, listening passage pacing, and grammar structures.\n\n' +
    'Return ONLY valid JSON in the exact same schema as the input. No markdown, no explanation.\n\n' +
    'SOURCE LESSON:\n' + JSON.stringify(sourceLesson) + '\n\n' +
    (guidance ? 'TARGET DIFFICULTY:\n' + guidance + '\n\n' : '') +
    'LEVEL: ' + level + '  DAY: ' + day;

  var resp = UrlFetchApp.fetch(CLAUDE_API_URL, {
    method:      'post',
    contentType: 'application/json',
    headers:     { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload:     JSON.stringify({ model: model, max_tokens: CLAUDE_MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }),
    muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  var body = JSON.parse(resp.getContentText());
  if (code >= 400) throw new Error('Claude API error on rewrite: ' + ((body.error && body.error.message) || code));
  if (!body.content || !body.content.length || body.content[0].type !== 'text') throw new Error('Empty rewrite response');

  var text = body.content[0].text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(text);
}


// ── GET: get_library ──────────────────────────────────
// Returns all active library entries grouped by (level, day) with counts and
// serve statistics. lesson_json is deliberately excluded — fetch individually
// via get_library_entry when previewing.
function handleGetLibrary() {
  var sheet   = getOrCreateSheet('Lesson Library', HEADERS['Lesson Library']);
  var rows    = sheetToObjects(sheet);
  var grouped = {};
  var totalEntries  = 0;
  var totalRecycled = 0;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r['is_active']).trim() === 'false') continue;
    var key = String(r['level']).trim() + '_' + String(parseInt(r['day'], 10));
    if (!grouped[key]) {
      grouped[key] = { level: String(r['level']).trim(), day: parseInt(r['day'], 10), count: 0, timesServed: 0, entries: [] };
    }
    var ts = parseInt(r['times_served'], 10) || 0;
    grouped[key].count++;
    grouped[key].timesServed += ts;
    totalEntries++;
    totalRecycled += ts;

    grouped[key].entries.push({
      id:                       String(r['id']).trim(),
      created_at:               String(r['created_at'] || ''),
      source_student:           String(r['source_student'] || ''),
      times_served:             ts,
      original_difficulty_json: String(r['original_difficulty_json'] || '')
    });
  }

  return { found: true, totalEntries: totalEntries, totalRecycled: totalRecycled, groups: Object.values(grouped) };
}

// ── GET: get_library_entry ────────────────────────────
// Returns the full row (including lesson_json) for a single entry by id.
function handleGetLibraryEntry(id) {
  if (!id) return { found: false, error: 'Missing id' };
  var sheet = getOrCreateSheet('Lesson Library', HEADERS['Lesson Library']);
  var rows  = sheetToObjects(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['id']).trim() === String(id).trim()) {
      return { found: true, entry: rows[i] };
    }
  }
  return { found: false };
}

// ── POST: delete_library_entry ────────────────────────
// Soft-deletes a library entry by setting is_active = 'false'.
function handleDeleteLibraryEntry(id) {
  if (!id) return { result: 'error', message: 'Missing id' };
  var sheet     = getOrCreateSheet('Lesson Library', HEADERS['Lesson Library']);
  var actual    = ensureSheetHeaders(sheet, HEADERS['Lesson Library']);
  var idCol     = actual.indexOf('id');
  var activeCol = actual.indexOf('is_active');
  if (idCol < 0 || activeCol < 0) return { result: 'error', message: 'Missing columns' };
  if (sheet.getLastRow() < 2) return { result: 'error', message: 'Not found' };
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, actual.length).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === String(id).trim()) {
      sheet.getRange(i + 2, activeCol + 1).setValue('false');
      return { result: 'success' };
    }
  }
  return { result: 'error', message: 'Entry not found' };
}


// ══════════════════════════════════════════════════════
// doPOST — handles all write requests
// ══════════════════════════════════════════════════════

/**
 * Safely append a row to a sheet, matching params to the sheet's
 * ACTUAL header row (not the HEADERS constant). This prevents
 * column misalignment when sheets have old/different headers.
 * Auto-extends the sheet with any missing columns from expectedHeaders.
 */
function safeAppendRow(sheetName, expectedHeaders, params) {
  var sheet = getOrCreateSheet(sheetName, expectedHeaders);
  var actualHeaders = ensureSheetHeaders(sheet, expectedHeaders);

  // Build the row by matching params to actual column headers
  var row = actualHeaders.map(function(header) {
    return params[header] || '';
  });

  sheet.appendRow(row);
}


function doPost(e) {
  var params = e.parameter;
  var action = (params['action'] || '').trim();
  var sheetName = (params['sheet_name'] || '').trim();

  try {
    if (action === 'save_progress') {
      safeAppendRow('Course Progress', HEADERS['Course Progress'], params);

    } else if (action === 'save_marks') {
      safeAppendRow('Lesson Marks', HEADERS['Lesson Marks'], params);

    } else if (action === 'update_settings') {
      // Merge with existing row so partial updates (e.g. just difficulty)
      // don't wipe unrelated fields like teacher_name or cefr_level.
      var existing = findLastByStudent('Settings', HEADERS['Settings'], params['student_name']) || {};
      var data = {};
      HEADERS['Settings'].forEach(function(h) {
        data[h] = (params[h] !== undefined) ? params[h] : (existing[h] || '');
      });
      data['updated_at'] = new Date().toLocaleString();
      upsertByStudent('Settings', HEADERS['Settings'], params['student_name'], data);

    } else if (sheetName === 'Examiner Results') {
      var examData = {};
      HEADERS['Examiner Results'].forEach(function(h) { examData[h] = params[h] || ''; });
      upsertByStudent('Examiner Results', HEADERS['Examiner Results'], params['candidate_name'], examData);

    } else if (action === 'delete_library_entry') {
      return ContentService
        .createTextOutput(JSON.stringify(handleDeleteLibraryEntry(params['id'])))
        .setMimeType(ContentService.MimeType.JSON);

    } else if (!action) {
      // No action specified → student submitted placement test → Initial Test Results
      safeAppendRow('Initial Test Results', HEADERS['Initial Test Results'], params);

    } else {
      // Unknown action — refuse instead of polluting Initial Test Results
      return ContentService
        .createTextOutput(JSON.stringify({ result: 'error', message: 'Unknown action: ' + action }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

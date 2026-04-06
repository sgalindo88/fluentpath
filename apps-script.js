/* ═══════════════════════════════════════════════════════════════
   FluentPath — Google Apps Script (Web App)
   ─────────────────────────────────────────────────────────────
   Deployment:
     1. Open script.google.com → create or edit project
     2. Paste this entire file into Code.gs
     3. Deploy → New deployment → Web app
        - Execute as: Me
        - Who has access: Anyone
     4. Copy the deployment URL and use it in the platform

   Handles all GET (reads) and POST (writes) for FluentPath.
   ═══════════════════════════════════════════════════════════════ */

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

/** Upsert a row: update if student exists, insert if not */
function upsertByStudent(sheetName, headers, studentName, data) {
  var sheet = getOrCreateSheet(sheetName, headers);
  var allData = sheet.getDataRange().getValues();
  if (allData.length === 0) {
    sheet.appendRow(headers);
    allData = [headers];
  }
  var headerRow = allData[0];
  var nameColIndex = -1;
  var nameColumns = ['student_name', 'candidate_name', 'name'];
  for (var k = 0; k < nameColumns.length; k++) {
    for (var j = 0; j < headerRow.length; j++) {
      if (String(headerRow[j]).trim() === nameColumns[k]) {
        nameColIndex = j;
        break;
      }
    }
    if (nameColIndex >= 0) break;
  }

  var target = String(studentName).toLowerCase().trim();
  var existingRow = -1;

  if (nameColIndex >= 0) {
    for (var i = 1; i < allData.length; i++) {
      if (String(allData[i][nameColIndex]).toLowerCase().trim() === target) {
        existingRow = i + 1; // 1-based row number
        break;
      }
    }
  }

  var rowData = headers.map(function(h) { return data[h] !== undefined ? data[h] : ''; });

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
    'course_month', 'updated_at', 'notes'
  ],
  'Lesson Marks': [
    'graded_at', 'teacher_name', 'student_name',
    'lesson_date', 'day_number', 'level',
    'writing_score', 'speaking_score', 'total_score',
    'writing_breakdown', 'speaking_breakdown', 'overall_feedback'
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

    } else if (action === 'check_approval') {
      // Approval workflow removed — always return approved
      result = { approved: true };

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

  return result;
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
// Returns the student's placement test submission
function handleGetTestResults(studentName) {
  if (!studentName) return { found: false };

  var row = findLastByStudent('Initial Test Results', HEADERS['Initial Test Results'], studentName);
  if (!row) return { found: false };

  row['found'] = true;
  return row;
}


// ── GET: get_latest_submission ─────────────────────────
// Returns the most recent ungraded lesson submission
function handleGetLatestSubmission(studentName) {
  if (!studentName) return { found: false };

  // Get all course progress rows for this student
  var progressSheet = getOrCreateSheet('Course Progress', HEADERS['Course Progress']);
  var progressRows = sheetToObjects(progressSheet);
  var target = String(studentName).toLowerCase().trim();

  // Get all graded days for this student
  var marksSheet = getOrCreateSheet('Lesson Marks', HEADERS['Lesson Marks']);
  var marksRows = sheetToObjects(marksSheet);
  var gradedDays = {};
  for (var j = 0; j < marksRows.length; j++) {
    if (String(marksRows[j]['student_name'] || '').toLowerCase().trim() === target) {
      gradedDays[String(marksRows[j]['day_number'])] = true;
    }
  }

  // Find the latest ungraded submission
  var latest = null;
  for (var i = 0; i < progressRows.length; i++) {
    var name = String(progressRows[i]['student_name'] || '').toLowerCase().trim();
    if (name === target) {
      var dayNum = String(progressRows[i]['day_number'] || '');
      if (!gradedDays[dayNum]) {
        latest = progressRows[i];
      }
    }
  }

  if (!latest) return { found: false };

  latest['found'] = true;
  return latest;
}


// ══════════════════════════════════════════════════════
// doPOST — handles all write requests
// ══════════════════════════════════════════════════════

/**
 * Safely append a row to a sheet, matching params to the sheet's
 * ACTUAL header row (not the HEADERS constant). This prevents
 * column misalignment when sheets have old/different headers.
 * If the sheet is empty, writes the expected headers first.
 */
function safeAppendRow(sheetName, expectedHeaders, params) {
  var sheet = getOrCreateSheet(sheetName, expectedHeaders);

  // If the sheet is empty, write the expected headers
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(expectedHeaders);
  }

  // Read the ACTUAL headers from row 1 of the sheet
  var actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  actualHeaders = actualHeaders.map(function(h) { return String(h).trim(); });

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
      var data = {};
      HEADERS['Settings'].forEach(function(h) { data[h] = params[h] || ''; });
      data['updated_at'] = new Date().toLocaleString();
      upsertByStudent('Settings', HEADERS['Settings'], params['student_name'], data);

    } else if (sheetName === 'Examiner Results') {
      safeAppendRow('Examiner Results', HEADERS['Examiner Results'], params);

    } else {
      // Default: student submitted placement test → Initial Test Results
      safeAppendRow('Initial Test Results', HEADERS['Initial Test Results'], params);
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

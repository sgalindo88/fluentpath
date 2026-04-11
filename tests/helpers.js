/**
 * Test helpers for loading FluentPath's global-style JS files into vitest.
 *
 * Since the codebase uses <script> tags (not ES modules), functions are
 * defined as globals. We load them by reading the file and evaluating it
 * in a controlled scope.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * Load a JS file and execute it, making its globals available.
 * Returns an object containing all functions/vars defined in the file.
 */
export function loadScript(relPath, prelude = '') {
  const code = readFileSync(resolve(ROOT, relPath), 'utf-8');
  // Create a function that runs the code and captures globals
  const fn = new Function(prelude + '\n' + code);
  fn();
}

/**
 * Load utils.js and return references to its functions.
 * Since they're declared as `function` statements, they become
 * properties of globalThis when evaluated.
 */
export function loadUtils() {
  const code = readFileSync(resolve(ROOT, 'src/scripts/utils.js'), 'utf-8');
  // Use indirect eval so declarations go to globalThis
  (0, eval)(code);
  return {
    escHtml: globalThis.escHtml,
    formatDate: globalThis.formatDate,
    formatLessonDate: globalThis.formatLessonDate,
    formatTimeSpent: globalThis.formatTimeSpent,
    formatDuration: globalThis.formatDuration,
    formatPlayTime: globalThis.formatPlayTime,
    timeAgo: globalThis.timeAgo,
  };
}

/**
 * Load apps-script.js pure functions into globalThis for testing.
 * Provides minimal mocks for Apps Script APIs that aren't needed.
 */
export function loadAppsScriptFunctions() {
  // Mock Apps Script globals that the file references at parse time
  globalThis.SpreadsheetApp = { getActiveSpreadsheet: () => ({}) };
  globalThis.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null }) };
  globalThis.CacheService = { getScriptCache: () => ({ get: () => null, put: () => {}, removeAll: () => {} }) };
  globalThis.ContentService = {
    createTextOutput: (t) => ({ setMimeType: () => ({ getContent: () => t }) }),
    MimeType: { JSON: 'json' },
  };
  globalThis.UrlFetchApp = { fetch: () => ({}) };
  globalThis.DriveApp = { getRootFolder: () => ({}) };
  globalThis.Utilities = { getUuid: () => 'test-uuid', base64Encode: () => '' };
  globalThis.LockService = { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) };
  globalThis.Logger = { log: () => {} };

  const code = readFileSync(resolve(ROOT, 'apps-script.js'), 'utf-8');
  (0, eval)(code);

  return {
    recycleProbability: globalThis.recycleProbability,
    findLibraryMatch: globalThis.findLibraryMatch,
    nearDuplicateExists: globalThis.nearDuplicateExists,
    findClosestEntry: globalThis.findClosestEntry,
    requireParam: globalThis.requireParam,
    validateScore: globalThis.validateScore,
    validateDate: globalThis.validateDate,
  };
}

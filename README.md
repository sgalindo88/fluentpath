# FluentPath: English tutoring for adult immigrants

[![CI](https://github.com/sgalindo88/fluentpath/actions/workflows/ci.yml/badge.svg)](https://github.com/sgalindo88/fluentpath/actions/workflows/ci.yml)

One-on-one English tutoring for adult immigrants (mostly Spanish speakers, mostly on an iPad or iPhone). A student takes a four-skill placement test, the teacher grades it and sets a CEFR level, and the student then follows a 20-day course of AI-generated daily lessons, with live video calls whenever they need help.

- **Student site:** [fluentpath.ca](https://fluentpath.ca) (this repo, served by GitHub Pages)
- **Teacher site:** [teacher.fluentpath.ca](https://teacher.fluentpath.ca) (separate repo, `fluentpath-teacher`)
- **Backend:** one Google Apps Script web app (`apps-script.js`, lives only in this repo) with Google Sheets as the database and Google Drive for recordings.

Accounts are **invite-only**: a visitor asks for an account on the brochure, the teacher creates it, and the student gets an email with a link to choose their own password.

---

## Table of contents

- [How it fits together](#how-it-fits-together)
- [The student journey](#the-student-journey)
- [Project structure](#project-structure)
- [Student app](#student-app)
- [Shared frontend code](#shared-frontend-code)
- [Design system and Spanish](#design-system-and-spanish)
- [Backend (Apps Script)](#backend-apps-script)
- [Google Sheets schema](#google-sheets-schema)
- [Teacher site](#teacher-site)
- [Offline and the service worker](#offline-and-the-service-worker)
- [Tests, tooling and CI](#tests-tooling-and-ci)
- [Working and deploying](#working-and-deploying)
- [CEFR level reference](#cefr-level-reference)

---

## How it fits together

```
  fluentpath.ca (this repo)                         teacher.fluentpath.ca (fluentpath-teacher repo)
  ┌──────────────────────────┐                      ┌───────────────────────────────┐
  │ index.html  brochure     │                      │ index.html     teacher portal │
  │ app.html    student hub  │                      │ examiner-panel dashboard      │
  │ src/…test   placement    │                      │ (grading, attendance, profile,│
  │ src/…course daily lesson │                      │  difficulty, library, archive)│
  └────────────┬─────────────┘                      └───────────────┬───────────────┘
               │  fetch (GET reads, form POST writes), app token + session
               ▼                                                    ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │  Google Apps Script web app (apps-script.js)                     │
        │  accounts + sessions · course authority · AI lessons · Stripe    │
        │  email (MailApp) · rate limits · script lock                     │
        └───────────────┬───────────────────────────────┬──────────────────┘
                        ▼                               ▼
                Google Sheets (17 tabs)         Google Drive (FluentPath Audios)
```

- **Two repos.** Shared frontend files (`config.js`, `api.js`, `utils.js`, `ui.js`, `icons.js`, `call-request.js`, `password-reset.js`, `checkpoint.js`, the design-system CSS, fonts, logos and the generated service worker) are authored here and copied into the teacher repo by `npm run sync`; `npm run sync:check` fails if they drift.
- **No framework, no build step.** Plain HTML, CSS and vanilla JavaScript. The only generated file is `src/scripts/icons.js` (`npm run icons`).
- **The server decides.** Level, course, day and topic come from the backend, not from the browser; a student session can only ever write as itself.

---

## The student journey

1. **Ask for an account.** The brochure's "Request a free account" form (name, email, optional message, English or Spanish) goes to the teacher by email and appears in the teacher portal.
2. **Account created.** The teacher creates the account (the password is optional). The student is emailed, in English and Spanish, a link that lets them choose their own password (valid 7 days).
3. **Hub.** After logging in the student sees their route: Placement test, Your level, Your course. There is a "Need to talk to your teacher?" card, Settings, and Log out.
4. **Placement test** (80 marks: reading, writing, listening, speaking). It never reveals whether an answer was right. Speaking answers are recorded and uploaded.
5. **Grading.** The teacher marks it, sets the CEFR level and switches on free course access (or the student pays, once payments are live).
6. **Daily lessons.** Seven steps (warm-up, vocabulary, listening, speaking, practice, writing, review), generated for the student's level and day. The teacher grades each lesson and keeps attendance.
7. **Help.** The student can request a video call (the teacher answers with a meeting link by email and on the hub), report a problem, suggest a feature, or ask to practise certain topics (the teacher approves or declines; approved topics only steer future lessons).
8. **Leaving.** The teacher can archive a student (login off, reversible) or permanently delete one (all rows plus Drive recordings).

---

## Project structure

```
fluentpath/
├── index.html                      # Public brochure (EN/ES toggle, account request form)
├── app.html                        # Student app: login, hub, paywall, Settings
├── sw.js                           # Service worker (network-first shell, offline POST queue)
├── apps-script.js                  # Backend (deployed with clasp). Version: BACKEND_VERSION
├── appsscript.json                 # Apps Script manifest (V8, web app, OAuth scopes)
├── manifest.webmanifest, CNAME, favicon.svg, apple-touch-icon.png, icon-*.png
├── .claspignore                    # clasp pushes only apps-script.js and appsscript.json
├── .github/workflows/ci.yml        # lint, format check, unit tests, browser tests
├── src/
│   ├── student-initial-test.html   # Placement test
│   ├── student-course.html         # Daily lesson
│   ├── design-system.html          # Component sheet for design review (not linked, not cached)
│   ├── scripts/
│   │   ├── config.js               # Endpoints, environment, session helpers, levels, storage keys
│   │   ├── config.local.js         # Dev overrides (gitignored)
│   │   ├── api.js                  # Fetch wrapper: token + session, timeouts, Unauthorized handling
│   │   ├── utils.js                # escHtml, local dates, small helpers
│   │   ├── ui.js                   # Bilingual helpers (bi/es/label), level rule, toasts, banners
│   │   ├── icons.js                # GENERATED: Material Symbols icon map (npm run icons)
│   │   ├── hub.js                  # Login, hub dashboard, paywall, achievements
│   │   ├── hub-settings.js         # Settings screen: topic requests, bug reports, feature ideas
│   │   ├── call-request.js         # Video-call request card (hub, test, lesson)
│   │   ├── password-reset.js       # Forgot / set / change password dialogs (shared with teacher)
│   │   ├── student-test.js         # Placement test logic and recording
│   │   ├── student-lesson.js       # Lesson logic: timer, pause, recording, save and verify
│   │   ├── lesson-fallbacks.js     # Bilingual A1 and A2 stand-by lessons (used when the generator is down)
│   │   └── checkpoint.js           # Autosave and the resume dialog
│   ├── styles/                     # tokens, theme, components, hub, student-test, student-lesson, brochure, mobile
│   ├── fonts/                      # Self-hosted Montserrat (WOFF2 + licence)
│   ├── img/                        # Logos (navy and cream variants)
│   └── icons/                      # Icon licence
├── scripts/
│   ├── sync-shared.mjs             # Copy shared files to the teacher repo; owns TEACHER_CACHE_VERSION
│   └── build-icons.mjs             # Build icons.js from @material-symbols/svg-400
└── tests/                          # unit tests (vitest) and browser tests (tests/ui, Playwright)
```

---

## Student app

### `index.html`: brochure

What FluentPath is, three route stops, one-time pricing ("Payments coming soon"), an English/Spanish toggle, and the account-request form. The main button reads **Request a free account**; "Already have an account? Log in" links to `app.html`. The form calls the public `request_account` action (validated and throttled; a hidden honeypot field catches bots; an address that already has an account gets the same "thank you", so nothing leaks).

### `app.html`: login, hub, settings

| Screen | What it does |
|---|---|
| Welcome | Email and password log in, "Forgot password?", links back to the brochure and to the teacher site |
| Loading | While progress and settings are fetched |
| Paywall | Shown when the course is locked and payments are on |
| Dashboard | Route (Placement test → Your level → Your course), next-step card, video-call card, lesson list, achievements |
| Settings | **What do you want to practise?** (up to 5 topics and a note, reviewed by the teacher), **Report a problem**, **Suggest a feature**, **Change password** |

Spanish appears under the English for A1 to B1 and for students without a level; B2 and above see English only. Headers keep Settings and Log out compact; Settings is icon-only on small phones.

### `src/student-initial-test.html`: placement test

80 marks: Reading 20 (auto), Writing 25 (teacher), Listening 15 (10 auto, dictation 5 teacher), Speaking 20 (teacher). Answers show "Answer saved" only, never right or wrong. Instructions, writing options and speaking prompts have Spanish; reading passages, questions and answer options stay English because they are what is tested. Speaking Q21 to Q24 are recorded (MediaRecorder; speech recognition is optional) and uploaded to Drive; the page stops recording if it is hidden. Progress autosaves; a bilingual "Resume your test?" dialog appears after a reload. The save is verified by an opaque `submission_id` before the student sees "saved".

### `src/student-course.html`: daily lesson

Seven steps with a timer, pause dialog and resume after a reload: warm-up, vocabulary (word cards with speech), listening (3 plays), speaking (pronunciation drills and free speaking, both recorded), practice, writing, review with a face rating (required). The server chooses level, course, day and topic. Lessons come from the shared **Lesson Library** when a matching entry exists (the least-served match is offered, up to 12 lessons are kept per level and day), otherwise from the AI provider (and are added to the library). Lessons shaped by a teacher's custom instructions or a student's approved topics are never recycled. If a fresh lesson cannot be made (the provider is retried once first), the server serves a valid library lesson for the same level, flagged as a stand-by; with an empty library the page shows a built-in lesson for the level (bilingual A1 and A2 lessons, five more for B1 and above). A notice says which of "generator unavailable", "stand-by lesson" or "too many lessons this hour" happened, and the Error Log records the reason. Completion is verified by reading the progress back; a failed save shows a Retry button.

---

## Shared frontend code

| File | Role |
|---|---|
| `config.js` | `FP.WEBHOOK_URL`, the public `FP.APP_TOKEN` (not a secret, see the SEC-5 note in `apps-script.js`), environment detection (DEV banner off the production hosts), session helpers, `FP.LEVELS`, storage keys |
| `api.js` | `FP.api.get`, `postRead` (form-encoded, readable response: the one to use for Apps Script), `postForm` (fire and forget), `postText`; injects token and session; an `Unauthorized` reply shows the login screen (never reloads the login page) |
| `ui.js` | `FP.ui.bi(en, es)`, `es()`, `label()`, `setLevel()` (puts `fp-no-es` on `<html>` for B2 to C2), toasts, banners, `FP.icon()` hydration |
| `call-request.js` | The video-call card: request, pending, join link, dismiss. Set up after login, once per student |
| `password-reset.js` | The dialogs for forgot, set (from an email link) and change password |
| `checkpoint.js` | Autosave every 5 s and the resume dialog (no auto-resume; Start over asks first) |
| `hub-settings.js` | The Settings screen (topic requests with `get_my_focus` / `request_focus`, `submit_feedback`) |

---

## Design system and Spanish

- **Tokens** in `tokens.css` (navy `#1E2A38`, cream, ice, coral, green; Montserrat, self-hosted, no third-party requests) and **components** in `components.css` (`fp-btn`, `fp-card`, `fp-field`, `fp-banner`, `fp-scrim` and `fp-modal`, `fp-header`, `fp-mic-btn`, `fp-answer`, and more). `src/design-system.html` renders every component and state.
- **Icons:** Material Symbols Rounded, weight 400, generated into `icons.js` (`FP.icon('mic')` or `<i data-icon="mic">`); no emoji. Answer verdicts are always a word plus an icon, never colour alone.
- **Accessibility and touch:** controls are at least 44px, form controls 16px (no iOS zoom), focus rings are outlines, status messages use `role="status"` or `alert`.
- **Spanish rule.** Static markup: `English<span class="fp-bi__es" lang="es">Español</span>` (a block under the English). B2, C1 and C2 get `fp-no-es` on `<html>`, which hides every Spanish line. Attributes that cannot hold markup use `data-ph-es` and friends, or `FP.ui.label(en, es)`. AI lessons carry `*_es` fields shown the same way. All Spanish copy was written by Claude and needs a native read: `src-files/spanish-review/` (outside the repo) turns every Spanish string into a plain-text CSV and writes corrections back.

---

## Backend (Apps Script)

One `doGet` and one `doPost` dispatch through tables (`GET_HANDLERS`, `POST_HANDLERS`). POST handlers run under a script lock; the AI summary is exempt.

### Setup (Script Properties)

| Property | Required | Purpose |
|---|---|---|
| `APP_SECRET` | yes | App token (public by design, a speed bump only). Must match `FP.APP_TOKEN` |
| `PW_PEPPER` | yes | Pepper for password hashing and the signing key for reset and welcome links |
| `AUTH_ENFORCED` | yes (`true`) | Every write needs a valid session |
| `AI_API_KEY` | yes | Key for the AI provider |
| `AI_PROVIDER` / `AI_MODEL` | no | `gemini` (default), `anthropic` or `openai`; default model `gemini-2.5-flash` |
| `STUDENT_URL` / `TEACHER_URL` | no | Base URLs used in emailed links (defaults to the production sites) |
| `STRIPE_SECRET`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | when payments are on | Checkout and the signed webhook |
| `TEACHER_SECRET` | legacy | Only used while `AUTH_ENFORCED` is off |

### Accounts and sessions

Passwords are salted, peppered, iterated SHA-256. Login creates a server-side session (students about 30 days, teachers about 12 hours); only a hash of the token is stored. Logins are throttled (10 failures per email per 15 minutes). Identity always comes from the session: for a student session the server overwrites `student_name`. Teachers act through a teacher session; the old public teacher token is gone. The full per-action authorisation table is the SEC-5 comment above `TEACHER_ACTIONS` in `apps-script.js`.

### Tokens in GET query strings (N-21)
Apps Script web apps read their GET parameters from the query string, so the app token and the session token travel in the URL of GET reads (`?action=…&token=…&session=…`). This is a known limit of the platform, not something the app can avoid. Keep it harmless: never paste an `/exec?…` URL into a ticket, chat, email or screenshot; the backend never writes a URL or query string anywhere (the Error Log stores only the parameters, with `session`, `token`, `password`, `reset_token` and similar names replaced by `[redacted]`: `redactParams`); the pages and the service worker never log URLs; the service worker lets Apps Script requests pass straight to the network and never caches a page URL that carries `reset`, `token`, `session` or `code`. Writes (POST) carry the session in the body, not the URL. A leaked session ends at log out or expiry (students about 30 days, teachers about 12 hours).

### Actions (overview)

| Who | Actions |
|---|---|
| Anyone with the app token | `login`, `logout`, `request_reset`, `reset_password` (signed single-use token), `request_account` |
| Any session | `change_password`, `request_my_reset`, `update_call_status` |
| Student session | `submit_test`, `save_progress` (course access checked), `save_audio`, `request_video_call`, `create_checkout`, `request_focus`, `submit_feedback`; reads such as `get_progress`, `get_settings`, `generate_lesson`, `get_my_focus`, `get_active_call_request` |
| Teacher session | `create_account`, `archive_student`, `restore_student`, `delete_student`, `save_marks`, `save_attendance`, `update_settings`, `update_teacher_settings`, `review_focus`, `send_call_link`, `update_account_request`, `update_feedback`, `promote_student`, `delete_library_entry`, `ai_summary`; reads such as `get_students`, `get_class_overview`, `get_student_profile`, `get_teacher_settings`, `get_focus_requests`, `get_account_requests`, `get_feedback`, `get_archived_students`, `get_audio`, `get_library`, `get_errors` |
| Stripe | `?stripe=1` webhook: signature checked, replay-guarded, unlock confirmed by a server-to-Stripe re-fetch |

Health check: `…/exec?action=health` returns `status`, the sheet name, which secrets are set, the AI provider and **`version`** (`BACKEND_VERSION`, bumped on every deploy).

### Behaviour worth knowing

- **Email** (MailApp) goes to the one notification address saved in the teacher's Settings: call requests, test and lesson submissions, account requests, topic requests, feedback. Students get call links and the welcome email. Welcome and reset links are signed tokens (7 days and 24 hours), single-use.
- **AI lessons:** a provider-adapter layer; Gemini thinking is pinned off and the token limit is 8192 so lessons are not truncated; the status is checked before parsing, transient failures are retried once, the JSON is found by brace matching, and a failure falls back to a library lesson for the level (see the lesson section); the server rate-limits generation per student (10 an hour).
- **Recordings** are stored under `FluentPath Audios/<student>/<Lesson n or Placement Test>` and are readable only through the teacher-only `get_audio`.
- **Delete a student** removes their rows from every tab and moves their Drive folder to the Drive trash (about 30 days there); the daily spreadsheet backups (7 kept; only files named `FluentPath Backup …` are ever pruned) keep a copy until they rotate out.
- **Topic requests** are suggestions: approved topics reach the lesson prompt as a preference, never as an instruction.
- **Caching:** progress and settings use `CacheService` (5 minutes) and are invalidated on every write. The cached progress reply is deliberately small (no per-lesson answers; the teacher dashboard asks for them with `include_answers=1`) and a value over 90 KB is refused and logged. Hot-path reads (progress, the course-day check, the library lookup) read only the columns they need, and no read writes: the Students tab is filled at account creation and at log in. Plain numbers are written to the sheet (Sheets would parse "10 / 20" as a date).

---

## Google Sheets schema

Tabs are created on first use; headers are defined in `HEADERS` in `apps-script.js`.

| Tab | Purpose |
|---|---|
| **Accounts**, **Sessions** | Logins (email, role, salted hash, `active`) and hashed session tokens |
| **Students** | Student names and join dates (the teacher's list) |
| **Settings** | Per student: level, permissions, notes, difficulty, notification flags, `access_granted`, payment fields |
| **Teacher Settings** | The teacher's name and notification email |
| **Initial Test Results**, **Examiner Results** | Placement test submissions and graded results |
| **Course Progress**, **Lesson Marks** | Completed lessons and the teacher's marks |
| **Attendance**, **Vocabulary Tracker** | Attendance JSON; spaced-repetition words |
| **Lesson Library** | Reusable generated lessons per level and day |
| **Video Call Requests** | Requests, links and status |
| **Focus Requests** | Topic requests and the teacher's decision |
| **Account Requests** | Brochure requests (new, created, dismissed) |
| **Feedback** | Bug reports and feature ideas (new, done) |
| **Error Log** | Server errors |

---

## Teacher site

The teacher dashboard lives in the `fluentpath-teacher` repo (`teacher.fluentpath.ca`): the portal (login, student list, account requests, student feedback, archived students, create account) and the dashboard (class overview, attendance, grade placement test, grade lessons, weekly summaries, adjust difficulty and topic requests, progress tracker, lesson library, student profile with archive and delete, teacher settings). The teacher UI is English only. See that repo's README.

---

## Offline and the service worker

`sw.js` is network-first for HTML, CSS and JS (a page never mixes two deploys), keeps a shell for offline use, and queues writes in IndexedDB for replay (never auth requests or anything with a password). A page navigation is cached by path only and matched ignoring the query, so `/app?paid=1` works offline from the cached `/app`; a URL carrying `reset`, `token`, `session` or `code` is never cached. Bump `CACHE_VERSION` in `sw.js` on every frontend change that must reach returning visitors; the teacher service worker is **generated** and its version is `TEACHER_CACHE_VERSION` in `scripts/sync-shared.mjs`.

---

## Tests, tooling and CI

| Command | What it does |
|---|---|
| `npm test` | Unit tests (vitest): backend logic against an in-memory spreadsheet, auth, Stripe, security, submissions, service worker, icons, CSS guards, PWA |
| `npm run test:ui` | Browser tests (Playwright with Chromium) against a stubbed backend: hub, placement test, lesson, brochure, and the teacher site when it sits next to this repo |
| `npm run lint` | ESLint 9 over `src/scripts/` |
| `npm run format:check` | Prettier over scripts, styles and root pages (not `tests/` and not the teacher repo) |
| `npm run sync` / `sync:check` | Copy shared files to the teacher repo / fail on drift |
| `npm run icons` / `icons:check` | Regenerate / verify `icons.js` |
| `npm run dev` | Static server for local work (`config.local.js` can point at a dev backend) |

CI (`.github/workflows/ci.yml`) runs lint, format check, unit tests and the browser tests.

---

## Working and deploying

1. Work on a short-lived branch in each repo; keep tests green (`npm test`, `npm run test:ui`, lint, `format:check`, `sync:check`, `icons:check`).
2. **Backend changed?** Bump `BACKEND_VERSION`, then `npx clasp push -f`, `npx clasp create-version "<description>"`, `npx clasp deploy -V <n> -i <deployment id> -d "<version>"`, and check `?action=health` shows the new version. Always deploy to the existing deployment id so the `/exec` URL stays the same; do not use `npm run clasp:deploy`.
3. Merge fast-forward only and push **student `master`** and **teacher `main`** (GitHub Pages; allow about 10 minutes for caches, then hard refresh).
4. Add a CHANGELOG entry for the release.

**URLs have no `.html`:** link to `/app`, `/src/student-course`, `/src/student-initial-test` (and the teacher site's `/src/examiner-panel`). GitHub Pages serves both forms, so old links keep working, and `FP.tidyUrl` tidies the address bar of an old one. A test (`tests/clean-urls.test.js`) fails if code writes a `.html` link to one of our own pages.

The project's review, plan and history live in a tracker kept outside the repos (`src-files/docs/review-2026-10.md`).

---

## CEFR level reference

| Level | Name | Theme | Description |
|---|---|---|---|
| **A1** | Beginner | Everyday Survival | Basic greetings, numbers, daily routines |
| **A2** | Elementary | Community & Life | Shopping, directions, social interactions |
| **B1** | Intermediate | The Workplace | Job interviews, emails, workplace communication |
| **B2** | Upper-Intermediate | Career & Society | Presentations, debates, current affairs |
| **C1** | Advanced | Professional Mastery | Academic writing, nuanced discussion, idioms |
| **C2** | Proficiency | Full Fluency | Complex rhetoric, literary analysis, near-native expression |

# FluentPath -- Language Learning & Assessment Platform

A browser-based English language learning and assessment system by **Fluentora**, designed for **adult immigrants** (ages 20--50) who lack the time or resources for formal schooling. The platform supports **one-on-one tutoring** with live video calls and asynchronous self-study.

Two audiences -- **students** taking tests and completing lessons, and **teachers** marking work and managing course progress. All interfaces share a cohesive visual identity (Playfair Display + Source Serif 4 typography, cream/ink/rust palette) and integrate with Google Sheets, the Claude API, and Jitsi Meet.

**Live at:** [sgalindo88.github.io/fluentpath](https://sgalindo88.github.io/fluentpath/)

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [File Descriptions](#file-descriptions)
  - [index.html -- Student Hub](#1-indexhtml--student-hub)
  - [teacher.html -- Teacher Portal](#2-teacherhtml--teacher-portal)
  - [student-initial-test.html -- Placement Test](#3-student-initial-testhtml--placement-test)
  - [student-course.html -- Daily Lesson](#4-student-coursehtml--daily-lesson)
  - [examiner-panel.html -- Teacher Dashboard](#5-examiner-panelhtml--teacher-dashboard)
  - [examiner-marking.html -- Standalone Marking (Legacy)](#6-examiner-markinghtml--standalone-marking-legacy)
- [Shared Utilities](#shared-utilities)
- [Level-Aware Translation System](#level-aware-translation-system)
- [Shared Design System](#shared-design-system)
- [Integration Points](#integration-points)
- [Google Sheets Schema](#google-sheets-schema)
- [Technology Stack](#technology-stack)
- [CEFR Level Reference](#cefr-level-reference)

---

## Architecture Overview

```
  ┌──────────────────┐          ┌──────────────────┐
  │   index.html     │          │  teacher.html     │
  │  (Student Hub)   │          │ (Teacher Portal)  │
  └────────┬─────────┘          └────────┬──────────┘
           │                             │
           │                             ▼
           │                   ┌──────────────────────┐
           │                   │  examiner-panel.html  │
           │                   │  (Teacher Dashboard)  │
           │                   │  - Grade placement test  │
           │                   │  - Grade lessons         │
           │                   │  - Track attendance      │
           │                   │  - Adjust difficulty     │
           │                   └──────────────────────┘
           │
     ┌─────┴──────┐
     │            │
     ▼            ▼
  Phase 1      Phase 2
  Placement    Course
     │            │
     ▼            ▼
  student-     student-
  initial-     course.html
  test.html    (daily lessons)
```

**Phase 1 -- Placement:** Student completes a four-skill proficiency test. The teacher marks it in the dashboard, assigns a CEFR level (A1--C2), and the student is placed into the right course tier. Students can skip the test if the teacher allows it.

**Phase 2 -- Course:** Student works through a 20-day structured course with AI-generated lessons. Each day's lesson is served from the **Lesson Library** when a matching entry exists (recycling activates at 5+ entries per `(level, day)` bucket) or generated fresh by Claude if not. Freshly generated lessons are written back to the library so later students benefit from the pool. Lessons generated with teacher-specific `aiInstructions` are never recycled. All lessons are cached per student/day in localStorage so reloads don't re-bill the API. If the API is unavailable, a 5-lesson offline fallback library cycles by day and a banner notifies the student. The teacher marks submissions, tracks attendance, adjusts difficulty, and writes weekly summaries. No approval workflow -- lessons start immediately.

**Live video calls** are available on all student pages via an optional floating "Join Video Call" button (same as the teacher dashboard).

---

## Project Structure

```
english-course/
├── index.html                     # Student hub / landing portal
├── teacher.html                   # Teacher portal (links to dashboard)
├── README.md                      # This file
├── CHANGELOG.md                   # Version history
├── GOOGLE_SHEETS_SCHEMA.md        # Full database schema documentation
├── apps-script.js                 # Google Apps Script source (paste into Code.gs)
└── src/
    ├── student-initial-test.html  # Placement test (student) — HTML/CSS only
    ├── student-course.html        # Daily lesson (student) — HTML/CSS only
    ├── examiner-panel.html        # Teacher dashboard (all-in-one) — HTML/CSS only
    ├── examiner-marking.html      # Standalone marking (legacy)
    ├── theme.css                  # Shared design tokens (CSS variables, font imports)
    ├── mobile.css                 # Mobile-first enhancements
    └── scripts/
        ├── hub.js                 # Student hub logic (from index.html)
        ├── teacher-portal.js      # Teacher portal logic (from teacher.html)
        ├── student-test.js        # Placement test logic (from student-initial-test.html)
        ├── student-lesson.js      # Daily lesson logic (from student-course.html)
        ├── examiner-panel.js      # Teacher dashboard logic (from examiner-panel.html)
        ├── config.js              # Shared configuration (webhook URL, CEFR levels, storage keys, auth tokens)
        ├── config.local.js        # Auth token overrides (gitignored — never committed)
        ├── api.js                 # Shared fetch wrapper (timeout, error handling, auto-auth)
        ├── utils.js               # Shared utilities (escHtml — XSS-safe for content and attributes)
        ├── video-call.js          # Jitsi Meet optional video panel
        ├── i18n.js                # Level-aware Spanish translation
        └── checkpoint.js          # Session recovery / auto-save
```

---

## File Descriptions

### 1. `index.html` -- Student Hub

**Purpose:** Central landing portal for students. Name-based login, fetches progress from Google Sheets, and displays a journey timeline pointing the student to their next action.

#### Screens

| # | Screen | Description |
|---|--------|-------------|
| 1 | **Welcome** | Name input. Returning students auto-logged-in via localStorage. |
| 2 | **Loading** | Spinner while progress and teacher settings are fetched from Google Sheets. |
| 3 | **Dashboard** | Journey timeline with three milestones and context-aware CTA. |

#### Journey Milestones

| # | Milestone | States |
|---|-----------|--------|
| 1 | **Placement Test** | Not started (CTA + optional "Skip to Course" if teacher allows) / Completed (green, with score) |
| 2 | **Your Level** | Locked / Awaiting review (pending badge) / Assigned (CEFR badge) |
| 3 | **Your Course** | Locked / Ready to begin / In progress (Day X/20 progress bar) / Complete |

#### Key Features

- **Progress tracking** via Google Sheets (`?action=get_progress`) with localStorage fallback
- **Teacher settings check** fetches `allow_skip_test` and `allow_retake_test` from Google Sheets
- **Skip or re-take** placement test options when teacher enables them
- **Completed lessons list** showing day, topic, time spent, confidence, and date
- **Auto-login** for returning students
- **Name validation** -- max 100 characters, letters/accents/hyphens/apostrophes only
- **Context-aware CTA** that always shows the right next action
- **Level-aware translation** via the shared i18n system

---

### 2. `teacher.html` -- Teacher Portal

**Purpose:** Separate landing page for teachers. Fetches registered students from Google Sheets and displays them as selectable cards.

- Branded Fluentora header with "Instructor Access" badge
- **Student picker** -- loads registered student names from the "Students" tab via `get_students` endpoint
- Selecting a student navigates to `src/examiner-panel.html?student={name}`, bypassing the setup screen

---

### 3. `student-initial-test.html` -- Placement Test

**Purpose:** Four-skill English proficiency placement test (Reading, Writing, Listening, Speaking). 80 marks total, 35 auto-graded, 45 requiring teacher review.

#### Screens & Flow

| # | Screen | Description |
|---|--------|-------------|
| 1 | **Cover** | Name, date, optional floating video call button |
| 2--3 | **Reading** | Intro + 10 MCQs on reading passages |
| 4--5 | **Writing** | Intro + 4 tasks (passive voice, sentence combining, error correction, short writing) |
| 6--7 | **Listening** | Intro + 4 MCQs, 1 multi-select, 1 dictation (browser TTS audio, 3-play limit) |
| 8--9 | **Speaking** | Intro + 4 speaking prompts with preparation notes |
| 10 | **Submitting** | Loading spinner |
| 11 | **Results** | Time summary and confirmation |

#### Scoring

| Section | Auto | Teacher | Total |
|---------|------|---------|-------|
| Reading (Q1--Q10) | 20 | -- | 20 |
| Writing (Q11--Q14) | -- | 25 | 25 |
| Listening (Q15--Q20) | 10 | 5 | 15 |
| Speaking (Q21--Q24) | -- | 20 | 20 |
| **Total** | **30** | **50** | **80** |

#### Key Features

- **Name auto-filled** from hub, **date read-only** (auto-calculated)
- **Optional video call** -- floating "Join Video Call" button available for live sessions with teacher; test can begin without connecting
- **Listening stop button** with cumulative play-time tracking (main passage and dictation)
- **Speech recording** on all speaking questions (Q21-Q24) with live transcript and pronunciation feedback
- **Required + skip** -- all writing/speaking text fields are required, with "Skip this question" checkbox
- **Session recovery** -- auto-saves every 5s; bilingual resume/start-over modal on page reload
- **Tap-to-translate** -- default translation mode for the test (B1/B2 style)
- **"Return to FluentPath"** button on results screen (re-take only via teacher-controlled hub setting)
- **Real-time MCQ feedback**, word counter, browser TTS, dual submission (Formspree + Google Sheets)
- **Mobile-optimised** with 48px touch targets, sticky nav, iOS zoom prevention

---

### 4. `student-course.html` -- Daily Lesson

**Purpose:** AI-powered 90-minute daily lesson with 7 sequential activities. Generated by Claude API, personalised to CEFR level and day, requiring teacher approval.

#### 7-Step Lesson

| Step | Type | Duration | Activities |
|------|------|----------|------------|
| 1 | Warm-Up | 10 min | Free-response prompt |
| 2 | Vocabulary | 20 min | Word cards with TTS + practice writing |
| 3 | Listening | 15 min | TTS passage (3-play limit) + MCQs |
| 4 | Speaking | 20 min | Pronunciation drills (speech recognition) + free conversation |
| 5 | Practice | 15 min | MCQ comprehension check |
| 6 | Writing | 15 min | Guided task with word count |
| 7 | Review | 5 min | Key takeaways + confidence self-assessment |

#### Key Features

- **Name, date, and level auto-filled** from hub; level grid locked when assigned by teacher
- **No approval workflow** -- lessons start immediately
- **Optional video call** -- floating "Join Video Call" button available for live sessions with teacher; lesson can begin without connecting
- **Level-aware translation** -- A1/A2 gets bilingual AI content via `_es` keys; B1/B2 gets tap-to-translate
- **41+ translated static strings** covering all UI text (step titles, buttons, status, feedback, labels)
- **`tr()` runtime translation** for JS-set text at A1/A2 level
- **Required + skip** -- all text questions required with "Skip this question" checkbox
- **Listening stop button** with cumulative play-time tracking
- **Pronunciation drills** use toggle recording (user clicks to start and stop); `continuous: true` mode prevents auto-cutoff; null-safe cleanup in `finishLesson`
- **Browser compatibility check** -- speaking step detects unsupported browsers, shows bilingual warning, and disables recording buttons
- **AI lesson generation via Apps Script → Claude API** -- each day's lesson is generated fresh by `claude-haiku-4-5` for the student's level, day, and topic; cached in localStorage by `fp_lesson_<level>_d<day>` so reloads don't re-bill the API
- **Offline fallback library** -- 5 distinct lesson templates (appointments, shopping, workplace, health, family/community) cycled by `(day - 1) % 5`; an "offline" banner appears when the API is unavailable so the teacher notices
- **Lesson generation timeout** -- 60-second `FP.api.get` abort prevents infinite loading; falls through to the offline library on error
- **Session recovery** -- auto-saves lesson content and progress every 5s
- **Course day tracking** -- uses `fp_last_lesson_day + 1`, not day of month
- **Lesson complete** links back to hub with "View Progress & Next Lesson" (hidden until save finishes); save overlay blocks navigation during save
- **Save verification** -- reads back progress from sheet to confirm the save landed; shows warning if not found
- **Forward-only navigation** -- Back button removed to prevent answer loss
- **90-minute countdown timer** with visual warning when <10 min remain

---

### 5. `examiner-panel.html` -- Teacher Dashboard

**Purpose:** All-in-one teaching dashboard. Manages both placement test marking and daily course operations for one student.

#### Panels

| # | Section | Panel | Description |
|---|---------|-------|-------------|
| -- | -- | **Setup** | Fallback student name entry (normally bypassed via teacher portal student picker) |
| 1 | Lessons | **Dashboard** | Stats grid, progress bars, activity feed, teacher notes |
| 2 | Lessons | **Attendance** | 20-day clickable grid (present/absent/unmarked), synced to Google Sheets |
| 4 | Grading | **Grade Placement Test** | Load test from Google Sheets, auto-score reading/listening, manual sliders for writing/speaking, CEFR calculation, save to Sheets |
| 5 | Grading | **Grade Lessons** | Daily lesson submission grading — Writing tab (warmup + vocab + writing task, 25pts), Speaking tab (transcript + audio drills, 20pts), All Responses tab (listening + comprehension with colour-coded chips), Final Score (all four skills combined) |
| 6 | Marking | **Weekly Summaries** | 4-week skill assessments + AI-generated narrative summaries |
| 7 | Course | **Adjust Difficulty** | 6 sliders (vocabulary, grammar, speaking, writing, listening, sentence complexity) + focus area tags |
| 8 | Course | **Progress Tracker** | Lesson-by-lesson record table, skills snapshot with progress bars |
| 9 | Course | **Lesson Library** | 6 × 20 coverage grid colour-coded by entry count; click any cell to list, preview, or soft-delete library entries; stats: total entries, times recycled, days seeded |
| 10 | Student | **Student Profile** | Settings form (name, email, CEFR level, course month, notes) + permission toggles (allow Spanish, skip test, retake test) synced to Google Sheets |

#### Placement Test Marking (Panel 4)

Pulled directly from the "Initial Test Results" Google Sheets tab (no email pasting required):
- **Auto-scored:** Reading Q1--Q10 and Listening Q15--Q19 with colour-coded chips
- **Manual sliders:** Writing Q11--Q13 (0--5 each), Q14 with 4 sub-criteria (0--2.5 each), Speaking Q21--Q24 (0--5 each), Dictation Q20 (0--5)
- **CEFR calculation:** Automatic level assignment from total score
- **Save to Sheets:** Exports graded results to "Examiner Results" tab

#### Key Features

- **Video call** -- floating Jitsi panel joins the same room as the student
- **localStorage persistence** under `fluentpath_teacher` key with auto-save; textarea values (notes, feedback) also restored on reload
- **AI-powered weekly summaries** via Apps Script proxy (server-side Claude API call)
- **Webhook URL hardcoded** -- no user configuration needed
- **No approval workflow** -- lessons start directly, approvals panel removed
- **Auto-populate grading** -- placement test and lesson submissions auto-load when panels open; previously graded scores restored from Google Sheets (individual question scores, breakdowns, notes) with localStorage fallback
- **Lesson picker** -- dropdown populated from `get_all_submissions` endpoint; jump to any submitted day; shows graded/ungraded status per entry
- **Graded/ungraded badge** -- pill badge on submission header shows current grading status
- **All Responses tab** -- listening and comprehension answers displayed as colour-coded chips (green ✓ correct, red ✗ incorrect) matching placement test styling
- **Combined final score** -- lesson total includes Writing (/25) + Speaking (/20) + Listening + Comprehension auto-scores
- **Save overlay** -- full-screen blocking overlay during all async saves (grades, attendance, placement test results)
- **Dashboard stats** -- days completed, attendance %, avg lesson time, lessons graded; recent activity feed with last 5 lessons
- **Google Sheets sync** -- fetches course progress on init, merges with localStorage, syncs CEFR level changes
- **Skills snapshot** -- vocabulary, speaking, writing, and listening progress bars derived from marks and weekly summary ratings
- **Course day tracking** -- uses actual attendance/lesson count, not calendar day
- **Google Sheets integration** for marks and settings (via `safeAppendRow` for column-safe writes; `upsertByStudent` for Examiner Results to avoid duplicates)
- **Course permission toggles** -- allow Spanish UI, skip placement test, retake placement test; synced to Google Sheets Settings tab via `update_settings`
- **Reset grading data** button on the placement test panel for clearing corrupted or stale scoring state
- **Demo data** built in for testing without live data

---

### 6. `examiner-marking.html` -- Standalone Marking (Legacy)

**Purpose:** Original standalone placement test marking tool. Still functional but superseded by the "Mark Placement Test" panel in the Teacher Dashboard. Kept for backwards compatibility. Uses Formspree email import workflow.

---

## Shared Utilities

### `config.js` -- Shared Configuration

- **Webhook URL** -- single source of truth for the Google Apps Script endpoint (previously duplicated in 5 files)
- **Formspree endpoint** -- email delivery endpoint
- **CEFR level metadata** -- `FP.LEVELS` with name, theme, and colour for each level (A1--C2)
- **localStorage keys** -- `FP.KEYS` with standardised key names

### `api.js` -- Shared Fetch Wrapper

- **`FP.api.get(url, options)`** -- GET request with 30-second timeout, returns parsed JSON; throws on non-OK response
- **`FP.api.postForm(url, payload, options)`** -- POST form-urlencoded in `no-cors` mode for Google Apps Script webhooks; auto-encodes payload with optional value length limit (`maxValueLength`, default 2 000)
- **`FP.api.postJson(url, payload, options)`** -- POST JSON with readable response (Formspree, Apps Script proxy); returns parsed JSON
- **`FP.showSaveOverlay(msg)`** / **`FP.updateSaveOverlay(msg)`** / **`FP.hideSaveOverlay()`** -- full-screen blocking overlay with spinner; prevents interaction during async saves across all pages
- All methods use `AbortController` with a configurable timeout (default 30 seconds)

### `utils.js` -- Shared Utilities

- **`escHtml()`** -- HTML-escapes a string for safe `innerHTML` insertion (previously duplicated in 3 files)

### `theme.css` -- Shared Design Tokens

- **CSS custom properties** -- all colour variables (ink, paper, cream, rust, gold, etc.) defined once
- **Google Fonts import** -- Playfair Display + Source Serif 4 loaded once instead of per-page

### `video-call.js` -- Video Calls

- **Optional mode:** Floating panel (collapsed button, expandable iframe) used by all student pages and the teacher dashboard
- **Required mode:** (Available but unused) Embeds Jitsi Meet inline; "Begin" button disabled until connected; connection status bar shows progress
- **Deterministic room names:** `FluentPath-{name}-{YYYYMMDD}` -- teacher and student auto-join the same room
- **Controls:** Copy link, pop-out to new tab, minimise, end call
- **Re-init guard:** `init()` runs once and returns `false` on subsequent calls; use `updateRoom(studentName, date)` to change the room without full re-initialization

### `mobile.css` -- Mobile-First Enhancements

- **iOS zoom prevention:** 16px minimum font-size on all inputs
- **Touch targets:** 48px minimum height (WCAG compliant)
- **Sticky bottom navigation** on mobile for thumb-reachable Continue/Back buttons
- **Full-width buttons**, slimmer topbar (46px), small-phone breakpoint (380px)
- **Desktop hover enhancements** gated behind `(hover: hover)`

### `i18n.js` -- Level-Aware Spanish Translation

See [Level-Aware Translation System](#level-aware-translation-system) below.

### `checkpoint.js` -- Session Recovery

- **Auto-saves every 5 seconds** plus immediate save on screen/step navigation
- **Bilingual recovery modal** (English + Spanish) with time-ago indicator on page reload
- **60-second auto-resume countdown** with shrinking progress bar -- prevents sessions from staying stuck on the modal if student walks away
- **ESC key dismisses** the modal (resumes by default)
- **Placement test:** Saves screen, all MCQ and text answers, play counts, task choice
- **Course lesson:** Saves step, answers, full AI-generated lesson content, elapsed timer
- **Clears automatically** on successful submission or completion

---

## Level-Aware Translation System

Translation behaviour adapts to the student's CEFR level:

| Level | Mode | Behaviour |
|-------|------|-----------|
| **A1 / A2** | Spanish-primary | UI displayed in Spanish. English shown as smaller italic help text below each element. Placeholders swapped to Spanish. |
| **B1 / B2** | Tap-to-translate | UI in English. Translatable text has a dotted underline. Tap/click shows a dark tooltip with the Spanish translation (auto-dismisses after 4 seconds). |
| **Placement test** | Tap-to-translate | Same as B1/B2 (level not yet known). |
| **C1** | Teacher-gated | UI in English. A small toggle appears in the top-right corner, greyed out until the teacher enables `allow_spanish` in Google Sheets. Once approved, clicking the toggle activates tap-to-translate. |
| **C2** | English-only | No translation features. Section icons still shown as visual cues. |

**120+ translated strings** covering buttons, headings, instructions, form labels, placeholders, status messages, activity labels, level names, and confidence ratings.

**Section icons** (📖 ✍️ 🎧 🗣️ ☀️ 📝 💪 📋) auto-injected next to section headings in all modes.

**MutationObserver** re-applies translations when the DOM changes dynamically (lesson steps, hub dashboard, etc.).

---

## Shared Design System

| Element | Value |
|---------|-------|
| **Background** | `#f5f0e8` (warm cream) |
| **Text** | `#1a1208` (dark ink) |
| **Primary accent** | `#b8471e` (rust) |
| **Secondary accent** | `#c9933a` (gold) |
| **Success** | `#2e6e45` (green) |
| **Info** | `#1e4d8c` (blue) |
| **Borders** | `#c8bfa8` (rule) |
| **Muted text** | `#6b5f4e` |
| **Heading font** | Playfair Display (serif, 400/700) |
| **Body font** | Source Serif 4 (serif, 300/400/600) |
| **Max content width** | 680--900px |
| **Animation** | `fadeIn` 0.25--0.3s ease with `translateY` |
| **Responsive breakpoints** | 380px (small phone), 600px (mobile/tablet) |

Print-inspired, academic, warm -- designed to feel calm and professional for adult learners.

---

## Integration Points

### Google Sheets (via Apps Script Webhook)

| File | Direction | Data |
|------|-----------|------|
| `index.html` | Sends / Receives | Student progress + teacher settings; auto-registers new students in Students tab |
| `teacher.html` | Receives | Student list from Students tab (via `get_students`) |
| `student-initial-test.html` | Sends | Test answers, scores, timing |
| `student-course.html` | Sends / Receives | Lesson requests, approval polling, completion data |
| `examiner-panel.html` | Sends / Receives | Marks, approvals, settings, test results fetch, CEFR level |

**Authentication:** All API requests require an `APP_SECRET` token (set in Script Properties). Teacher-only endpoints (grading, settings, attendance, library management) additionally require a `TEACHER_SECRET`. Tokens are auto-injected by `api.js`. See `src/scripts/config.local.js` for frontend setup.

Full schema documented in [`GOOGLE_SHEETS_SCHEMA.md`](GOOGLE_SHEETS_SCHEMA.md).

### Claude API (Anthropic) -- via Apps Script Proxy

| File | Model | Usage |
|------|-------|-------|
| `student-course.html` | `claude-haiku-4-5` (default; configurable via `CLAUDE_MODEL` Script Property) | AI-generated daily lessons via the `generate_lesson` GET action; cached per (level, day) in localStorage |
| `examiner-panel.html` | `claude-sonnet-4-20250514` | AI-drafted weekly summary narratives (routed through Apps Script `ai_summary` action) |

**Setup:** the Apps Script project requires these **Script Properties** (Project Settings → Script Properties → Add):

| Property | Required | Description |
|----------|----------|-------------|
| `CLAUDE_API_KEY` | Yes | Anthropic API key (`sk-ant-...`) |
| `APP_SECRET` | Yes | Random 32-char string shared with frontend `config.local.js` |
| `TEACHER_SECRET` | Yes | Separate secret for teacher-only endpoints |
| `CLAUDE_MODEL` | No | Override default model (default: `claude-haiku-4-5`) |

See the header comment in `apps-script.js` for full deployment steps.

### Jitsi Meet (Video Calls)

| File | Mode | Room Name |
|------|------|-----------|
| `student-initial-test.html` | Optional (floating panel) | `FluentPath-{name}-{YYYYMMDD}` |
| `student-course.html` | Optional (floating panel) | `FluentPath-{name}-{YYYYMMDD}` |
| `examiner-panel.html` | Optional (floating panel) | `FluentPath-{name}-{YYYYMMDD}` |

### Web Speech API (Browser)

| File | Speech Synthesis | Speech Recognition |
|------|-----------------|-------------------|
| `student-initial-test.html` | Listening passages + dictation audio | -- |
| `student-course.html` | Vocabulary pronunciation + listening passages | Pronunciation drills + free conversation |

### Formspree (Email)

| File | Usage |
|------|-------|
| `student-initial-test.html` | POSTs test results as JSON to Formspree endpoint |
| `examiner-marking.html` | Legacy: parses Formspree emails to import test data |

### localStorage (Client-Side)

| Key | Purpose | Set By |
|-----|---------|--------|
| `fp_student_name` | Student auto-login on hub | Hub, test, course |
| `fp_test_completed` | Test completion flag | Test |
| `fp_cefr_level` | Assigned CEFR level | Course |
| `fp_last_lesson_day` | Course progress (day number) | Course |
| `fp_last_lesson_date` | Last lesson date | Course |
| `fp_ckpt_test` | Placement test checkpoint | checkpoint.js |
| `fp_ckpt_lesson` | Course lesson checkpoint | checkpoint.js |
| `fluentpath_teacher` | Full teacher dashboard state | examiner-panel.html |

---

## Google Sheets Schema

The full database schema is documented in [`GOOGLE_SHEETS_SCHEMA.md`](GOOGLE_SHEETS_SCHEMA.md), covering 6 tabs:

| Tab | Purpose |
|-----|---------|
| **Initial Test Results** | Raw student test submissions |
| **Examiner Results** | Graded test results with CEFR levels, individual question scores (`score_q11`--`score_q24`), and per-question notes |
| **Course Progress** | Completed daily lesson records |
| **Settings** | Teacher preferences per student (allow_spanish, allow_skip_test, etc.) |
| **Lesson Approvals** | Approval workflow between student and teacher |
| **Lesson Marks** | Graded daily lesson scores |
| **Students** | Registered student names and join dates (auto-populated on first hub visit) |
| **Attendance** | Per-student attendance JSON and absence notes |

---

## Technology Stack

- **Frontend:** Pure HTML, CSS, and vanilla JavaScript (no frameworks or build tools)
- **Styling:** CSS custom properties, Flexbox, CSS Grid, media queries, print stylesheets, shared `mobile.css`
- **Fonts:** Google Fonts (Playfair Display, Source Serif 4)
- **APIs:** Claude API (lesson generation, summaries), Google Apps Script (data persistence), Formspree (email delivery), Web Speech API (TTS + STT), Jitsi Meet (video calls)
- **Storage:** localStorage (checkpoints, preferences, teacher dashboard state), Google Sheets (shared persistence)
- **Translation:** Level-aware Spanish with 4 modes (spanish-primary, tap-to-translate, teacher-gated, english-only)
- **Hosting:** GitHub Pages at [sgalindo88.github.io/english-course](https://sgalindo88.github.io/english-course/)

---

## CEFR Level Reference

| Level | Name | Theme | Description |
|-------|------|-------|-------------|
| **A1** | Beginner | Everyday Survival | Basic greetings, numbers, daily routines |
| **A2** | Elementary | Community & Life | Shopping, directions, social interactions |
| **B1** | Intermediate | The Workplace | Job interviews, emails, workplace communication |
| **B2** | Upper-Intermediate | Career & Society | Presentations, debates, current affairs |
| **C1** | Advanced | Professional Mastery | Academic writing, nuanced discussion, idioms |
| **C2** | Proficiency | Full Fluency | Complex rhetoric, literary analysis, near-native expression |

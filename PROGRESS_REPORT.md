# FluentPath — Progress Report

**Project:** FluentPath Language Learning & Assessment Platform
**Developer:** Sebastian Galindo
**Report date:** 11 April 2026
**Status:** Pre-launch (functional, in active testing)

---

## Development Timeline

| Day | Date | Commits | Focus |
|-----|------|---------|-------|
| 1 | Apr 5 | 27 | Full platform build — student hub, placement test, daily course, teacher dashboard, mobile support, Spanish translation, session recovery, shared utilities |
| 2 | Apr 6 | 6 | Shared fetch wrapper, hub caching, auto-resume countdown, i18n batching, lesson history pagination, settings toggles |
| 3 | Apr 7 | 2 | Optional video calls (Jitsi Meet), teacher student picker, auto-registration |
| 4 | Apr 9 | 1 | Claude API lesson generation wired through Apps Script with teacher difficulty profiles |
| 5 | Apr 10 | 1 | Lesson library recycling system with coverage grid in teacher dashboard |
| 6 | Apr 11 | 1 | Grading panel overhaul, student save reliability fixes, hub display fixes, attendance persistence, save overlay system |

**Total: 6 development days, 38 commits**

---

## Codebase Size

| File | Lines | Purpose |
|------|------:|---------|
| `src/examiner-panel.html` | 3,128 | Teacher dashboard (all-in-one) |
| `src/student-course.html` | 2,145 | Daily AI-generated lesson (7 activities) |
| `src/student-initial-test.html` | 2,066 | Four-skill placement test (80 marks) |
| `apps-script.js` | 1,347 | Google Apps Script backend (17 endpoints) |
| `src/examiner-marking.html` | 1,121 | Standalone marking (legacy) |
| `src/i18n.js` | 869 | Level-aware Spanish translation (120+ strings) |
| `index.html` | 573 | Student hub / progress portal |
| `src/video-call.js` | 549 | Jitsi Meet integration |
| `CHANGELOG.md` | 498 | Version history |
| `README.md` | 478 | Full technical documentation |
| `src/mobile.css` | 296 | Mobile-first responsive enhancements |
| `src/checkpoint.js` | 285 | Session recovery / auto-save |
| `GOOGLE_SHEETS_SCHEMA.md` | 189 | Database schema documentation |
| `src/api.js` | 165 | Shared fetch wrapper + save overlay |
| `teacher.html` | 115 | Teacher portal (student picker) |
| `src/config.js` | 36 | Shared configuration |
| `src/theme.css` | 23 | Shared design tokens |
| `src/utils.js` | 9 | Shared utilities |
| **Total** | **13,892** | |

---

## Platform Overview

FluentPath is a browser-based English learning platform for adult immigrants, supporting one-on-one tutoring with a teacher dashboard and self-paced student lessons.

### Student-Facing Pages

| Page | Description | Status |
|------|-------------|--------|
| **Student Hub** (`index.html`) | Name-based login, journey timeline with 3 milestones (test → level → course), completed lessons list | Complete |
| **Placement Test** (`student-initial-test.html`) | 4-skill test (Reading, Writing, Listening, Speaking), 80 marks, auto-scored MCQs, session recovery | Complete |
| **Daily Lesson** (`student-course.html`) | 7-step AI-generated lesson (warmup → vocab → listening → speaking → practice → writing → review), 90-min timer | Complete |

### Teacher-Facing Pages

| Page | Description | Status |
|------|-------------|--------|
| **Teacher Portal** (`teacher.html`) | Student picker, links to dashboard | Complete |
| **Teacher Dashboard** (`examiner-panel.html`) | 10-panel all-in-one: dashboard stats, attendance, grade placement test, grade lessons, weekly summaries, difficulty adjustment, progress tracker, lesson library, student profile | Complete |
| **Standalone Marking** (`examiner-marking.html`) | Legacy placement test marking tool | Maintained (superseded by dashboard) |

---

## Features Completed

### Student Experience
- Name-based login with auto-fill across pages
- Placement test with real-time MCQ feedback, word counter, speech recording
- AI-generated daily lessons personalised to CEFR level (A1–C2) and day (1–20)
- Lesson library recycling (reuses past lessons when 5+ exist per level/day bucket)
- Offline fallback library (5 hand-curated lessons) when API is unavailable
- Pronunciation drills with user-controlled recording (toggle start/stop)
- Listening comprehension with play-count limits and cumulative play-time
- Forward-only lesson navigation (prevents answer loss)
- Save verification (reads back from sheet to confirm save landed)
- Session recovery with auto-save every 5 seconds and bilingual resume modal
- Level-aware Spanish translation (4 modes: bilingual, tap-to-translate, teacher-gated, English-only)
- Optional video calls via Jitsi Meet
- Mobile-optimised with 48px touch targets, sticky nav, iOS zoom prevention

### Teacher Experience
- Student picker with auto-registration
- Grade placement test: auto-scored reading/listening, manual sliders for writing/speaking, CEFR calculation
- Grade lessons: Writing tab (warmup + vocab + writing task), Speaking tab (transcript + audio drills), All Responses tab (listening + comprehension with colour-coded correct/incorrect chips), Final Score (all 4 skills combined)
- Lesson picker dropdown to navigate between submitted days
- Graded/ungraded badge on submission header
- Attendance tracking synced to Google Sheets (20-day grid with absence notes)
- Weekly skill summaries with AI-generated narrative
- Difficulty adjustment (6 sliders + focus area tags) synced per student
- Progress tracker with warmup, vocab, listening, practice, writing, speaking, and attendance columns
- Skills snapshot with progress bars
- Lesson library management with coverage grid, preview, and soft-delete
- Course permission toggles (allow Spanish, skip test, retake test)
- Save overlay blocking interaction during all async saves
- Email results to student with full score breakdown

### Backend (Google Apps Script)
- 17 API endpoints (10 GET, 7 POST)
- Claude API proxy for lesson generation and weekly summaries
- Lesson library with recycling, deduplication, and difficulty rewriting
- Column-safe writes (`ensureSheetHeaders` + `safeAppendRow`)
- Upsert pattern for settings, attendance, and examiner results

### Infrastructure
- Shared config, API wrapper, utilities, theme, and checkpoint modules
- Save overlay system (full-screen blocker during async saves)
- Session recovery across placement test and course lessons
- Google Sheets as database (8 tabs: Initial Test Results, Examiner Results, Course Progress, Settings, Lesson Marks, Students, Lesson Library, Attendance)
- Dual submission for placement test (Formspree email + Google Sheets)
- Audio recording upload to Google Drive via Apps Script proxy

---

## Google Sheets Database

| Tab | Rows Written By | Purpose |
|-----|----------------|---------|
| Initial Test Results | Student (test submission) | Raw placement test answers and auto-scores |
| Examiner Results | Teacher (grading) | Graded test results with CEFR level and per-question breakdowns |
| Course Progress | Student (lesson completion) | Daily lesson records with answers, writing, speaking, audio |
| Settings | Teacher (profile/difficulty) | Per-student preferences and difficulty profiles |
| Lesson Marks | Teacher (grading) | Graded daily lesson scores and feedback |
| Students | Auto (first hub visit) | Registered student names and join dates |
| Lesson Library | Auto (lesson generation) | AI-generated lesson cache for recycling |
| Attendance | Teacher (attendance panel) | Per-student attendance JSON and absence notes |

---

## Technology Stack

- **Frontend:** HTML, CSS, vanilla JavaScript (no frameworks, no build tools)
- **Backend:** Google Apps Script (web app deployment)
- **AI:** Claude API (Haiku for lessons, Sonnet for summaries) via server-side proxy
- **Database:** Google Sheets (8 tabs)
- **Video:** Jitsi Meet (optional, floating panel)
- **Speech:** Web Speech API (TTS for listening, STT for speaking drills)
- **Email:** Formspree (placement test results)
- **Audio Storage:** Google Drive (speaking recordings as base64 uploads)
- **Hosting:** GitHub Pages
- **Local Dev:** DDEV

---

## What's Next

Areas for future development:

- **Progress recovery** — handle students who lose data mid-lesson due to browser crashes
- **Reporting** — exportable student progress reports for teachers
- **Multi-student view** — dashboard that shows all students at a glance
- **Notification system** — alert teachers when new submissions arrive
- **Performance** — lazy-load dashboard panels to reduce initial load time

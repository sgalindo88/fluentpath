# Changelog

All notable changes to the FluentPath platform are documented here.

---

## [0.9.0] - 2026-04-05

### Changed — Shared Configuration, Utilities & Theme
- **Created `src/config.js`** — single source of truth for webhook URL, Formspree endpoint, CEFR level metadata (`FP.LEVELS`), and localStorage key names (`FP.KEYS`); removed hardcoded URLs from 5 HTML files
- **Created `src/utils.js`** — shared `escHtml()` function; removed 3 duplicate implementations (index.html, student-course.html, examiner-panel.html)
- **Created `src/theme.css`** — shared CSS custom properties and Google Fonts import; removed duplicate `:root` blocks and font `<link>`/`@import` tags from 5 HTML files
- **Standardised variable names** — all files now reference `FP.WEBHOOK_URL` via local aliases (`WEBHOOK_URL` or `GOOGLE_SHEET_WEBHOOK`)

---

## [0.8.3] - 2026-04-05

### Fixed — Placement Test & Lesson Marking Score Persistence
- **Placement test graded scores now load** — Apps Script `get_test_results` returns previously graded data from "Examiner Results" sheet (individual question scores, notes, feedback, CEFR level)
- **Lesson marking grades now load** — Apps Script `get_latest_submission` returns existing marks from "Lesson Marks" sheet (writing/speaking breakdowns, feedback)
- **Individual question scores saved** — `savePlacementToSheets()` now writes `score_q11`–`score_q24` to the Examiner Results sheet, not just section totals
- **Examiner Results uses upsert** — changed from `safeAppendRow` (duplicate rows on re-grade) to `upsertByStudent` (updates existing row)
- **Placement test sliders persist** — graded slider values, Q14 sub-criteria, and per-question notes saved to localStorage via `savePTGradedState()`; restored on reload from sheet data first, localStorage fallback
- **Lesson marking sliders persist** — writing and speaking slider values saved to localStorage via `saveMarksToLocalStorage()`; restored from sheet breakdown JSON first, localStorage fallback
- **Debounced auto-save** — placement test notes trigger a 2-second debounced save; sliders save immediately

---

## [0.8.2] - 2026-04-05

### Fixed — Teacher Dashboard Data Display
- **Placement test panel layout** — moved panel inside `.main-content` div; was rendering outside the sidebar layout (broken positioning)
- **Dashboard stats populated** — "Avg. Lesson Time" stat now calculates from lesson records; "Recent Lesson Activity" section now shows last 5 lessons with scores and attendance
- **`getCurrentDay()` fixed** — now uses actual course progress (attendance/lesson count) instead of calendar day of month (e.g. April 5 ≠ Day 5)
- **Textarea values restored on reload** — teacher notes, absence notes, writing/speaking feedback, overall feedback, and AI instructions now persist across page reloads via localStorage
- **Profile email restored** — student email now populates both the profile form and the marking send-results form on reload
- **Skills snapshot listening bar** — listening progress bar now calculates from weekly summary ratings instead of always showing 0%; vocabulary bar also uses weekly summary data when available
- **Google Sheets dashboard sync** — `fetchDashboardData()` now fetches course progress from Google Sheets on init, merges lesson records with localStorage, and syncs CEFR level changes

---

## [0.8.1] - 2026-04-05

### Fixed — Bug Fixes & Hardening
- **Placement test auto-score denominator** corrected from `/35` to `/30` (true auto-scored max: Reading 20 + Listening auto 10)
- **Spanish accent marks** fixed in checkpoint.js recovery modal — "hace ms de un da" → "hace más de un día"
- **AI weekly summary** replaced broken direct Anthropic API call (missing auth header + CORS blocked) with Apps Script proxy route and clear fallback message
- **XSS hardening** in teacher dashboard — added `escHtml()` to unescaped Google Sheets data (level, day, date, status) in innerHTML assignments
- **Speech recording browser check** — speaking step now detects unsupported browsers (non-Chrome/Edge), shows bilingual warning banner, and disables recording buttons instead of silently failing
- **Student name validation** on hub — max 100 characters, letters/accents/hyphens/apostrophes only, with `maxlength` attribute and `aria-label` for accessibility
- **Lesson generation timeout** — added 30-second `AbortController` on the Apps Script fetch and a 45-second safety timeout on the loading spinner to prevent infinite loading state

---

## [0.8.0] - 2026-04-05

### Changed — Placement Test Improvements
- **Auto-fill name** from hub (localStorage) and make date read-only
- **Listening stop button** with cumulative play-time tracking for both main passage and dictation
- **Required + skip** on all writing questions (Q11-Q14, Q20) with "Skip this question" checkbox
- **All speaking textareas required** (Q21-Q24)
- **Speech recording** added to speaking section (Q21-Q24) using Web Speech API with live transcript
- **Video call room name** now displayed with shareable link so teacher knows which room to join
- **Translation activated** with `I18n.setLevel('test')` for tap-to-translate mode
- **"Return to FluentPath"** button on results screen (removed "Take Test Again")
- **Re-take test** option on hub when teacher enables `allow_retake_test`

### Changed — Course Page Improvements
- **Auto-fill name, date (read-only), and level** from localStorage
- **Level grid locked** when CEFR level is assigned — greyed out with "Assigned by your teacher" note
- **Approval workflow removed** — `startCourse()` goes straight to lesson generation
- **Course day number** uses last completed + 1 (not day of month)
- **Required + skip** on all text questions (warm-up, vocabulary practice, writing, review notes)
- **Listening stop button** with play-time tracking
- **Pronunciation drill fix** — replaced inline onclick string interpolation with data-attributes to prevent apostrophe SyntaxError
- **Claude API call removed** (CORS blocked from browser) — uses built-in fallback lesson; placeholder for future Apps Script proxy
- **Speech recognition error handling** improved with console logging and mic permission alerts
- **Lesson complete** links back to hub with "View Progress & Next Lesson" button; shows "Course Day X / 20"
- **Hub enhanced** with completed lessons list (day, topic, time, confidence, date)

### Changed — Full Spanish Translation Coverage
- **41 new translation strings** added to `i18n.js`: step titles, listening/speaking status, recording feedback, review section, completion screen, button text
- **`tr()` runtime helper** added to course page for JS-set `.textContent` strings at A1/A2 level
- **`biText()` applied** to all hardcoded template strings in render functions
- **Course content selectors** added to i18n.js (`.ac-label`, `.ac-heading`, `.ac-body`, `.ai-label`, `.ai-status`)
- **AI prompt modified** to generate `_es` suffix keys for bilingual A1/A2 lessons
- **All render functions updated** to use `biText()` for dynamic AI content

### Changed — Teacher Dashboard Fixes
- **Webhook URL hardcoded** — removed from setup screen and profile form
- **Lesson approvals removed** — sidebar link, panel HTML, pending badge, and all approval JS functions
- **Auto-populate marking** — placement test and lesson marking auto-load when panel is opened
- **Null-safe `updateDashboardStats`** — prevents TypeError when elements are missing
- **Writing answers robust** — tries multiple field name formats, shows "(no response)" for empty
- **CORS error handling** — graceful fallback to demo data with console warnings

### Changed — Infrastructure
- **Webhook URLs synced** across all files to new Apps Script deployment
- **Google Apps Script rewritten** (`apps-script.js`) with `doGet` handler for 5 actions, `safeAppendRow` for column-safe writes, and proper CORS support
- **DDEV local server** configured for development (no more push-to-test)
- **Dead approval code removed** from course page (`requestApproval`, `startPolling`, `checkApproval`, `APPROVAL_CHECK_URL`)
- **Skip placement test** option on hub when teacher allows via Google Sheets Settings

---

## [0.7.1] - 2026-04-05

### Added — Skip Placement Test Option
- Student hub now fetches teacher settings on login to check `allow_skip_test`
- When the test hasn't been taken and the teacher allows it, a "Skip to Course" button appears below the main placement test CTA
- Added `allow_skip_test` field to the Settings tab in `GOOGLE_SHEETS_SCHEMA.md`

---

## [0.7.0] - 2026-04-05

### Changed — Level-Aware Translation System
- Rewrote `src/i18n.js` from a single-mode language toggle to a CEFR level-aware system with 4 distinct modes:
  - **A1/A2 (spanish-primary):** UI displayed in Spanish with English as smaller help text below
  - **B1/B2 and placement test (tap-to-translate):** UI in English; tap/click any translatable text to see a Spanish tooltip that auto-dismisses after 4 seconds
  - **C1 (teacher-gated):** UI in English with a toggle that activates tap-to-translate only after teacher approval via Google Sheets
  - **C2 (english-only):** No translation available; section icons only
- Removed the old floating language selector widget
- Course page calls `I18n.setLevel()` when the student selects their level
- Hub and test pages auto-detect level from localStorage (default: tap-to-translate)

---

## [0.6.0] - 2026-04-05

### Changed — Rebranding & Structural Overhaul
- **Rebranded** the entire platform: company name "Fluentora", product name "FluentPath"
  - Updated all page titles, headings, nav bars, footers, and UI text across all files
  - Renamed localStorage keys from `ep_*` to `fp_*` and `englishpath_*` to `fluentpath_*`
  - Updated Jitsi room prefix from `EnglishPath-` to `FluentPath-`
  - "Examiner Panel" renamed to "Teacher Dashboard" throughout
- **Split landing pages:** `index.html` is now student-only; created `teacher.html` as a separate teacher portal with links to the dashboard and marking tools
- **Required video call:** Jitsi Meet now embeds inline on the cover/landing screen of both `student-initial-test.html` and `student-course.html`; the "Begin" button is disabled until the video call connects
- **Spanish gated by teacher approval:** Language selector is greyed out by default; `i18n.js` checks the Google Sheets Settings tab for `allow_spanish` permission before enabling the Spanish toggle
- **Combined teacher interfaces:** Merged placement test marking into `examiner-panel.html` as a new "Mark Placement Test" sidebar panel with auto-scoring, manual sliders, CEFR calculation, and Google Sheets save — pulls test data from the sheet instead of pasting emails; `teacher.html` updated to single dashboard link
- **Google Sheets schema:** Created `GOOGLE_SHEETS_SCHEMA.md` documenting all 6 tabs (Initial Test Results, Examiner Results, Course Progress, Settings, Lesson Approvals, Lesson Marks) with column definitions and API actions

---

## [0.5.0] - 2026-04-05

### Added — Progress Continuity & Recovery (Option E)
- Created `src/checkpoint.js`, a generic save/load/clear API with a bilingual recovery modal
- **Placement test recovery:** State auto-saved every 5 seconds once the test begins (current screen, all MCQ and text answers, play counts, task choice); on page reload, a modal offers "Resume" or "Start Over"
- **Course lesson recovery:** State auto-saved every 5 seconds once the lesson begins (current step, all answers, AI-generated lesson content, elapsed timer); on page reload, a modal offers "Resume" or "Start Over"
- **Immediate save on navigation:** Checkpoint also saved on every screen/step change for minimal data loss
- **Automatic cleanup:** Checkpoint is cleared on test submission, test restart, and lesson completion
- **Bilingual recovery modal:** Title, message, and buttons shown in English and Spanish with a time-ago indicator ("saved 5 min ago / hace 5 min")
- Recovery modal matches the existing design system (cream/ink/rust, Playfair Display headings)

---

## [0.4.0] - 2026-04-05

### Added — Onboarding & UX Simplification (Option D)
- Created `src/i18n.js`, a self-contained internationalisation system with Spanish (es) translations for all student-facing UI
- **Language selector:** Floating widget on all pages + prominent selector on the hub welcome screen; choice persists in localStorage
- **Spanish translations** covering 120+ strings: buttons, headings, instructions, form labels, placeholders, status messages, activity labels, level names, and confidence ratings
- **Visual section icons:** Automatic emoji icons (📖 Reading, ✍️ Writing, 🎧 Listening, 🗣️ Speaking, etc.) prepended to section headings
- **Bilingual display:** Translations appear as subtle italic hints below the English text, so students learn English while understanding instructions in Spanish
- **Dynamic content support:** MutationObserver re-applies translations when the DOM changes (lesson steps, hub dashboard, etc.)
- **Extensible:** Adding a new language requires only a new key in `TRANSLATIONS` and `LANG_META`
- Included in `index.html`, `student-initial-test.html`, and `student-course.html`

---

## [0.3.0] - 2026-04-05

### Added — Mobile-First Enhancements (Option C)
- Created `src/mobile.css`, a shared stylesheet for all student-facing pages
- **iOS zoom prevention:** All inputs and textareas forced to 16px minimum font-size
- **Touch targets:** MCQ options, buttons, and interactive cards enforce 48px minimum height (WCAG compliant)
- **Sticky bottom navigation:** Lesson Continue/Back buttons anchor to the bottom of the viewport on mobile, always within thumb reach
- **Full-width primary buttons** on mobile for easier tapping
- **Larger spacing** between tappable MCQ options (12px gaps) to prevent mis-taps
- **Slimmer topbar** on mobile (46px) with non-essential info hidden
- **Small phone support** (380px breakpoint) with tighter sizing for iPhone SE and similar
- **Desktop hover enhancements** gated behind `(hover: hover)` media query so touch devices are not affected
- **Touch optimisations:** Eliminated 300ms tap delay and removed default tap highlight on all interactive elements
- Included in `index.html`, `student-initial-test.html`, and `student-course.html`

---

## [0.2.0] - 2026-04-05

### Added — Video Call Integration (Option B)
- Created `src/video-call.js`, a self-contained floating video call component using Jitsi Meet (free, no accounts required)
- Deterministic room names generated from student name + date so teacher and student auto-join the same room
- Floating panel in bottom-right corner: collapsed button state and expanded embedded video state
- Pop-out button to open the call in a full browser tab (better for mobile)
- Integrated into `student-initial-test.html` (activates when test starts)
- Integrated into `student-course.html` (activates when lesson begins after approval)
- Integrated into `examiner-panel.html` (available from the dashboard with student name pre-filled)
- Fixed `index.html` hub links to point to `src/` directory after file reorganisation

---

## [0.1.0] - 2026-04-05

### Added — Student Hub Page (Option A)
- Created `index.html` as a student landing portal with name-based login
- Journey timeline showing three milestones: Placement Test, Level Assignment, Course Progress
- Context-aware CTA button that always points to the student's next action
- Fetches progress from Google Sheets (`?action=get_progress`) with localStorage fallback
- Auto-login for returning students via localStorage
- Added localStorage hooks to `student-initial-test.html` (saves test completion on submit)
- Added localStorage hooks to `student-course.html` (saves CEFR level and lesson day on finish)
- Created `README.md` with full platform documentation
- Moved original files into `src/` directory

# Changelog

All notable changes to the FluentPath platform are documented here.

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

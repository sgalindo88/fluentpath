# Changelog

All notable changes to the English Path platform are documented here.

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

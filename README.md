# English Path -- Language Learning & Assessment Platform

A comprehensive, browser-based English language learning and assessment system built as a set of four self-contained HTML applications. The platform serves two audiences -- **students** taking tests and completing lessons, and **teachers/examiners** marking work and managing course progress. All interfaces share a cohesive visual identity (Playfair Display + Source Serif 4 typography, cream/ink/rust colour palette) and integrate with Google Sheets and the Claude API.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [File Descriptions](#file-descriptions)
  - [student-initial-test.html](#1-student-initial-testhtmlstudent-interface--placement-test)
  - [examiner-marking.html](#2-examiner-markinghtmlteacher-interface--test-marking-panel)
  - [student-course.html](#3-student-coursehtmlstudent-interface--daily-lesson)
  - [examiner-panel.html](#4-examiner-panelhtmlteacher-interface--course-dashboard)
- [Shared Design System](#shared-design-system)
- [Integration Points](#integration-points)
- [Technology Stack](#technology-stack)
- [CEFR Level Reference](#cefr-level-reference)

---

## Architecture Overview

The platform follows a two-phase workflow:

```
Phase 1 -- Placement                    Phase 2 -- Course
================================        ================================
Student takes initial test              Student completes daily lessons
  (student-initial-test.html)             (student-course.html)
         |                                       |
         v                                       v
Examiner marks the test                 Examiner manages course progress
  (examiner-marking.html)                 (examiner-panel.html)
         |                                       |
         v                                       v
   CEFR level assigned              Lessons approved, marked, tracked
```

**Phase 1 -- Placement:** A student completes a four-skill English proficiency test. The examiner then marks it, assigns a CEFR level (A1--C2), and the student is placed into the appropriate course tier.

**Phase 2 -- Course:** The student works through a 20-day structured course with AI-generated daily lessons. The examiner approves lessons before they are delivered, marks writing and speaking submissions, tracks attendance, adjusts difficulty, and writes weekly summaries.

---

## File Descriptions

### 1. `student-initial-test.html` -- Student Interface / Placement Test

**Purpose:** A comprehensive English proficiency placement test that evaluates four language skills: Reading, Writing, Listening, and Speaking. Scores 80 marks total, with 35 auto-graded and 45 requiring examiner review.

#### Screens & Flow

| # | Screen | Description |
|---|--------|-------------|
| 1 | **Cover** | Welcome page with candidate name and date inputs |
| 2 | **Reading Intro** | Section overview (Part 01, 10 questions, 20 marks) |
| 3 | **Reading** | 10 multiple-choice questions on reading passages |
| 4 | **Writing Intro** | Section overview (Part 02, 4 tasks, 25 marks) |
| 5 | **Writing** | Passive voice rewriting, sentence combining, error correction, and a choice between an informal email or opinion paragraph (120--150 words) |
| 6 | **Listening Intro** | Section overview (Part 03, 6 questions, 15 marks) |
| 7 | **Listening** | 4 MCQs, 1 multi-select question, and 1 dictation transcription; audio delivered via browser text-to-speech |
| 8 | **Speaking Intro** | Section overview (Part 04, 4 tasks, 20 marks) |
| 9 | **Speaking** | 4 speaking prompts with preparation note areas |
| 10 | **Submitting** | Loading spinner while results are sent |
| 11 | **Results** | Time summary and confirmation banner |

#### Scoring Breakdown

| Section | Questions | Auto-Scored | Examiner-Scored | Total |
|---------|-----------|-------------|-----------------|-------|
| Reading | Q1--Q10 (MCQ) | 20 marks | -- | 20 |
| Writing | Q11--Q14 (text) | -- | 25 marks | 25 |
| Listening | Q15--Q19 (MCQ) + Q20 (dictation) | 10 marks | 5 marks | 15 |
| Speaking | Q21--Q24 (open-ended) | -- | 20 marks | 20 |
| **Total** | **24** | **30** | **50** | **80** |

#### Key Features

- **Real-time MCQ feedback** with colour-coded correct/incorrect indicators
- **Word counter** for the writing task (highlights green at 120--150 words)
- **Browser text-to-speech** (Web Speech API) for listening passages at 0.88x speed, en-GB voice, with a 3-play limit
- **Multi-select question** (Q19) that auto-submits when 2 options are chosen
- **Dual submission** to Formspree (email) and Google Sheets (webhook)
- **Timer** recording test start/end time and duration
- **Progress bar** animating across all screens
- **No data persistence** -- all answers are held in memory only

---

### 2. `examiner-marking.html` -- Teacher Interface / Test Marking Panel

**Purpose:** A marking tool for examiners to grade the placement test. Imports raw submission emails from Formspree, auto-scores objective sections, provides sliders for manual marking of subjective sections, calculates CEFR levels, and exports results.

#### Screens & Flow

| # | Panel | Description |
|---|-------|-------------|
| 1 | **Import** | Full-page textarea where the examiner pastes a Formspree notification email |
| 2 | **Candidate Info** | Displays parsed candidate name, test date; input for examiner name |
| 3 | **Reading** | Auto-scored display of Q1--Q10 with colour-coded chips (green = correct, red = wrong, grey = unanswered) |
| 4 | **Listening** | Auto-scored Q15--Q19 chips + manual slider for Q20 dictation (0--5) |
| 5 | **Writing** | Manual marking with sliders: Q11 (0--5), Q12 (0--5), Q13 (0--5), Q14 (0--10 via 4 sub-criteria at 0--2.5 each: Task, Grammar, Vocabulary, Coherence) |
| 6 | **Speaking** | Manual marking with sliders: Q21--Q24 (0--5 each) for Introduction, Everyday Topics, Extended Speaking, Discussion & Opinion |
| 7 | **Results** | Total score with CEFR level badge, four section cards with progress bars, examiner feedback, email/print/Google Sheets export |

#### Sidebar Navigation

The fixed left sidebar groups panels into logical sections:
- **Candidate** -- Info
- **Auto-Scored** -- Reading, Listening (with live score tallies)
- **Manual Marking** -- Writing, Speaking (with green completion dots)
- **Send** -- Results

A fixed total score box at the bottom displays the running total and CEFR level.

#### CEFR Level Calculation

| Level | Score Range | Description |
|-------|------------|-------------|
| A1 | 0--10 | Beginner |
| A2 | 11--20 | Elementary |
| B1 | 21--35 | Intermediate |
| B2 | 36--50 | Upper-Intermediate |
| C1 | 51--65 | Advanced |
| C2 | 66--80 | Proficiency |

#### Key Features

- **Email parser** using regex to extract structured fields from Formspree notification emails
- **Auto-scoring engine** for all MCQ questions against hardcoded answer keys
- **Live score updates** in topbar and sidebar as the examiner marks
- **Sub-criteria sliders** for the extended writing task (Q14) with 0.5 step increments
- **Examiner notes** textarea per question for qualitative feedback
- **mailto: export** with pre-filled subject and body containing full score breakdown
- **Google Sheets export** via POST to a Google Apps Script webhook
- **Print/PDF mode** with a dedicated print stylesheet that hides interactive controls
- **Re-import** resets the entire panel to allow marking a different student
- **Privacy-first** -- "No data leaves this page" (all parsing is client-side)

---

### 3. `student-course.html` -- Student Interface / Daily Lesson

**Purpose:** An AI-powered daily lesson platform that delivers a structured 90-minute lesson with 7 sequential activities. Lessons are generated by the Claude API, personalised to the student's CEFR level and day in the course, and require teacher approval before starting.

#### Screens & Flow

| # | Screen | Description |
|---|--------|-------------|
| 1 | **Landing** | Student name, date picker, and CEFR level selector grid (A1--C2 with theme descriptions) |
| 2 | **Waiting** | Pulsing hourglass with "Waiting for Approval" message; polls every 10 seconds |
| 3 | **Lesson** | 7-step lesson with step dots, activity content, and back/continue navigation |
| 4 | **Complete** | Star icon, stats grid (time spent, activities done, day number), and save confirmation |

#### 7-Step Lesson Structure

| Step | Type | Duration | Activities |
|------|------|----------|------------|
| 1 | **Warm-Up** | 10 min | Text prompt with free-response textarea |
| 2 | **Vocabulary** | 20 min | Clickable word cards (word, pronunciation, definition, example sentence) with text-to-speech audio; vocabulary practice writing area |
| 3 | **Listening** | 15 min | Audio passage via text-to-speech (3-play limit) + MCQ comprehension questions |
| 4 | **Speaking / Pronunciation** | 20 min | Drill phrases with speech recognition and similarity scoring + free conversation recorder |
| 5 | **Practice** | 15 min | MCQ comprehension check questions |
| 6 | **Writing** | 15 min | Guided writing task with word count tracker and CEFR-appropriate minimum |
| 7 | **Review** | 5 min | Key takeaways display + confidence self-assessment (Hard / OK / Good / Great) |

#### Teacher Approval Workflow

1. Student fills in name, date, and level on the landing screen
2. App POSTs a lesson request to Google Sheet webhook
3. Waiting screen polls for approval every 10 seconds
4. Once the teacher approves (via the examiner-panel), the lesson generates and begins
5. On completion, results are POSTed back to the Google Sheet

*Demo mode:* If webhook URLs are not configured, approval is auto-granted after 3 seconds with a fallback lesson.

#### Key Features

- **AI lesson generation** via Claude Sonnet API, with level-specific topic progressions for all 20 days
- **Speech recognition** (Web Speech API) for pronunciation drills with word-overlap similarity scoring (70% threshold)
- **Free conversation recording** with continuous speech recognition and transcript display
- **Text-to-speech** for vocabulary pronunciation and listening passages (0.85x rate, en-US)
- **90-minute countdown timer** in the top nav with visual warning when < 10 minutes remain
- **Multi-layer progress tracking**: top pixel bar, step dots, step counter text, colour-coded badges
- **Fallback lesson** baked in for offline/API-failure scenarios
- **XSS prevention** with `escHtml()` sanitisation on all user-generated content
- **Progress saved** to Google Sheets on lesson completion with all responses and metadata

---

### 4. `examiner-panel.html` -- Teacher Interface / Course Dashboard

**Purpose:** A comprehensive one-on-one teaching dashboard for managing a student's progress through the English Path course. Covers lesson approval, attendance, marking, difficulty adjustment, progress tracking, and weekly summaries.

#### Panels & Navigation

| # | Section | Panel | Description |
|---|---------|-------|-------------|
| -- | -- | **Setup** | Initial onboarding form (teacher name, student info, webhook URL) |
| 1 | Lessons | **Dashboard** | Daily stats grid (days completed, attendance %, avg lesson time, awaiting approval), progress bars, recent activity feed, teacher notes |
| 2 | Lessons | **Lesson Approvals** | Queue of AI-generated lessons pending review; each item shows day, date, topic, and status with expandable preview (objective, vocabulary, listening text, speaking drill, writing prompt); approve/reject/adjust difficulty/regenerate controls |
| 3 | Lessons | **Attendance** | 20-day clickable grid cycling through present (green check), absent (red cross), and unmarked; today highlighted with gold border; running tallies |
| 4 | Marking | **Mark Writing & Speaking** | JSON submission loader with dual-tab marking interface; Writing (25 pts): Task Completion (8), Grammar & Accuracy (7), Vocabulary Range (5), Coherence & Flow (5); Speaking (20 pts): Fluency & Pace (5), Pronunciation (5), Vocabulary Use (5), Communication (5) |
| 5 | Marking | **Weekly Summaries** | 4-week tabbed view with skill dropdowns (Excellent / Good / Needs Work / Struggling) for vocabulary, speaking, writing, and listening; narrative textarea; AI-generated summary button via Claude API |
| 6 | Course | **Adjust Difficulty** | 6 sliders (1--5 scale): Vocabulary Density, Sentence Complexity, Speaking Duration, Writing Length, Listening Speed, Grammar Complexity; focus area tags (multi-select); custom AI instructions textarea |
| 7 | Course | **Progress Tracker** | Lesson-by-lesson record table (day, topic, writing score, speaking score, attendance), skills snapshot with progress bars |
| 8 | Student | **Student Profile** | Settings form with teacher name, webhook URL, student name, email, CEFR level (A1--C2), course month, and notes |

#### Marking Rubric

| Section | Criteria | Max Points |
|---------|----------|------------|
| **Writing** | Task Completion | 8 |
| | Grammar & Accuracy | 7 |
| | Vocabulary Range | 5 |
| | Coherence & Flow | 5 |
| | **Subtotal** | **25** |
| **Speaking** | Fluency & Pace | 5 |
| | Pronunciation | 5 |
| | Vocabulary Use | 5 |
| | Communication | 5 |
| | **Subtotal** | **20** |
| | **Total** | **45** |

#### Key Features

- **Lesson approval workflow** with live preview of AI-generated content and difficulty adjustment (Easier / As Generated / Harder / Regenerate)
- **AI-powered weekly summaries** via Claude Sonnet API using student context (name, level, week, attendance, skill assessments, teacher notes)
- **LocalStorage persistence** -- all state saved under `englishpath_examiner` key with auto-save on input
- **Google Sheets integration** for saving marks and managing the approval queue via a configurable webhook URL
- **JSON profile export** for backing up or transferring student data
- **Attendance tracking** with a visual 20-day grid and running statistics
- **Granular difficulty control** across 6 dimensions to personalise AI lesson generation
- **Focus area tags** (vocabulary, pronunciation, grammar, etc.) that feed into lesson generation prompts
- **Pending badge** in the topbar showing count of items awaiting action
- **Demo submission data** built in for testing the marking interface without live data
- **Print-ready** with a dedicated print stylesheet hiding all interactive elements

---

## Shared Design System

All four interfaces share a consistent visual language:

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
| **Responsive breakpoint** | 600--768px |

The aesthetic is intentionally print-inspired, academic, and warm -- designed to feel calm and professional for adult learners.

---

## Integration Points

### Google Sheets (via Apps Script Webhook)

All four files communicate with a shared Google Apps Script web app for data persistence:

| File | Direction | Data |
|------|-----------|------|
| `student-initial-test.html` | Sends | Test answers, scores, timing, candidate info |
| `examiner-marking.html` | Sends | Graded scores, CEFR level, examiner feedback |
| `student-course.html` | Sends / Receives | Lesson requests, approval status (polling), completion data |
| `examiner-panel.html` | Sends / Receives | Marks, approval decisions, pending lesson queue |

### Formspree (Email)

| File | Usage |
|------|-------|
| `student-initial-test.html` | POSTs test results as JSON to a Formspree endpoint |
| `examiner-marking.html` | Parses incoming Formspree notification emails to import test data |

### Claude API (Anthropic)

| File | Model | Usage |
|------|-------|-------|
| `student-course.html` | claude-sonnet-4-20250514 | Generates personalised daily lessons based on CEFR level and day |
| `examiner-panel.html` | claude-sonnet-4-20250514 | Generates AI-drafted weekly summary narratives from student performance data |

### Web Speech API (Browser)

| File | Speech Synthesis | Speech Recognition |
|------|-----------------|-------------------|
| `student-initial-test.html` | Listening passages + dictation audio | -- |
| `student-course.html` | Vocabulary pronunciation + listening passages | Pronunciation drills + free conversation |

---

## Technology Stack

- **Frontend:** Pure HTML, CSS, and vanilla JavaScript (no frameworks or build tools)
- **Styling:** CSS custom properties, Flexbox, CSS Grid, media queries, print stylesheets
- **Fonts:** Google Fonts (Playfair Display, Source Serif 4)
- **APIs:** Claude API (lesson generation, summaries), Google Apps Script (data persistence), Formspree (email delivery), Web Speech API (TTS + STT)
- **Storage:** In-memory state (test), localStorage (examiner panel), Google Sheets (shared persistence)
- **Deployment:** Static files -- no server required; open directly in a browser

---

## CEFR Level Reference

The platform supports all six CEFR levels, each with a thematic focus for the 20-day course:

| Level | Name | Theme | Description |
|-------|------|-------|-------------|
| **A1** | Beginner | Everyday Survival | Basic greetings, numbers, daily routines |
| **A2** | Elementary | Community & Life | Shopping, directions, social interactions |
| **B1** | Intermediate | The Workplace | Job interviews, emails, workplace communication |
| **B2** | Upper-Intermediate | Career & Society | Presentations, debates, current affairs |
| **C1** | Advanced | Professional Mastery | Academic writing, nuanced discussion, idioms |
| **C2** | Proficiency | Full Fluency | Complex rhetoric, literary analysis, near-native expression |

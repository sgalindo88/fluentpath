# Lesson Library Update — Design & Proposals

**Status:** Designed 2026-04-09, awaiting client review before implementation.

**Author context:** Sebastian (teacher building FluentPath, pre-launch with one student) wants a recycling system so the platform doesn't pay for fresh AI generation on every student, every day. Goal: first ~5 students per CEFR level seed the library by generating fresh content; later students reuse what's already there with re-personalisation only when needed.

---

## Background

After wiring up `claude-haiku-4-5` lesson generation in the previous commit (the "fix daily lessons being identical" change), every student currently triggers a fresh Claude API call for every (level, day) they visit. This is wasteful: a B1 day-5 lesson is conceptually the same lesson regardless of which student is taking it, and the only thing that should vary across students is the teacher's difficulty profile (`difficultyProfile`, `focusTags`, `aiInstructions` from the Settings sheet).

This update introduces a **lesson library**: a persistent store of previously-generated lessons keyed by `(level, day)`, plus the original difficulty fingerprint they were generated with. New lesson requests check the library first and only fall through to fresh generation when no close match exists.

---

## Algorithm — Decisions Made During Design

These were chosen one-by-one through a Q&A session. Each was picked from 2-4 alternatives; the rejected alternatives are documented in `future-updates.md` where they remain candidates for later.

### 1. Library segmentation: per CEFR level
The library is partitioned by level. A B1 student never sees A1 content and vice versa. The "first 5 students" seed phase is counted per level, not globally — otherwise pre-launch traffic skewed to one level would leave other levels permanently empty.

### 2. Recycling unit: whole lessons (per-lesson, not per-component)
A library entry is a complete 7-step lesson (warmup → vocabulary → listening → speaking → practice → writing → review). When recycling fires, the entire lesson is served as one atomic unit. Per-component mix-and-match (vocab from one source + listening from another) is documented in `future-updates.md` as a future option but rejected for V1 because of the topical-coherence problem (a vocab set about doctors paired with a listening passage about job interviews feels disjointed).

### 3. Tier curve: emergent from library coverage at each `(level, day)`
There is no separate tier counter or per-student tier flag. The tier is read directly from the library state at the moment of generation:

| Library entries at `(level, day)` | Behaviour |
|---|---|
| 0–4 | 100% generate new (seed phase) |
| 5–9 | 50% generate new, 50% try to recycle |
| 10+ | 20% generate new, 80% try to recycle |

This is self-correcting: sparse buckets generate more aggressively, dense buckets recycle more aggressively, no global tier accounting needed. Counting students directly was rejected (documented in this file's earlier draft and in design notes) because student-count-based tiers can produce "tier 3 student gets new content because library happens to be empty" failure modes.

### 4. Difficulty matching: tiered (strict → lenient → Claude rewrite)
When a recycle attempt is triggered, the matcher walks three tiers in order:

1. **Strict match.** All 6 difficulty sliders are within ±1 of the new student's profile, AND at least one focus tag overlaps. If any entry passes, pick one and serve as-is.
2. **Lenient match.** Total Manhattan distance across the 6 sliders is ≤ 4, focus tags ignored. If any entry passes, pick one and serve as-is.
3. **Claude rewrite (option C).** No library entry matches. Pick the closest available entry by Manhattan distance and send it back through Claude with a "rewrite this lesson for difficulty X" prompt. Cheaper than full generation because the input is structured. The result is served and also written back to the library (subject to the dedup rule below).

### 5. `aiInstructions` forces fresh generation (option ii)
If the new student has *non-empty* teacher-written `aiInstructions` ("student works in construction, use job-site vocab"), the library is skipped entirely and a fresh lesson is generated. This is true regardless of what the library contains.

### 6. Custom-instructed lessons never enter the library (option b for the write side)
Symmetric to decision 5: if the *source* student of a generated lesson had non-empty `aiInstructions`, that lesson is single-use — served to that student and **not** written to the library. Reason: a lesson tailored to "construction worker, hard hats, scaffolding" should never be served to a future nurse just because their slider profile happens to match. The "tag library entries with source `aiInstructions` and run a similarity check" alternative is documented in `future-updates.md` but rejected for V1 because free-text matching is hard and the failure modes are subtle.

### 7. Storage: new `Lesson Library` tab on the existing Google Sheet
One row per lesson. Columns:

| Column | Type | Notes |
|---|---|---|
| `id` | string | UUID-ish (`lib_<timestamp>_<rand>`) |
| `level` | string | A1 / A2 / B1 / B2 / C1 / C2 |
| `day` | int | 1–20 |
| `created_at` | string | ISO timestamp |
| `source_student` | string | name of the student whose generation seeded this entry (audit only) |
| `original_difficulty_json` | JSON string | the `difficulty` object that was active when this lesson was generated — used by the matcher |
| `lesson_json` | JSON string | the full lesson object that gets served to the student |

Storage in Google Drive (one JSON file per lesson) was the runner-up and is documented in `future-updates.md` as the migration target once the sheet passes ~3 000 rows.

### 8. Determinism: existing localStorage cache pins the served lesson
No new persistence. The existing `fp_lesson_<level>_d<day>` localStorage cache in `student-course.html` already pins which lesson a given student sees on reload. When the cache is cleared, a re-roll is acceptable (the student has no baseline to compare against).

### 9. Dedup on write
Before writing a freshly-generated or rewritten lesson to the library, check whether an existing entry at the same `(level, day)` has all 6 difficulty sliders identical. If so, skip the write (the new lesson is a near-duplicate of an existing entry). This prevents library bloat from option-C rewrites that produce results very similar to their source.

---

## Implementation Proposals

Three paths, in order of effort. The client should pick one (or hybrid).

### Proposal 1 — Minimal MVP (one PR)

**What ships:**
- New `Lesson Library` sheet with the schema in decision 7.
- New helpers in `apps-script.js`:
  - `getLibraryEntries(level, day)` — read sheet, filter to `(level, day)`, return parsed array.
  - `findLibraryMatch(entries, difficulty)` — strict → lenient walk, returns the picked entry or `null`.
  - `addToLibrary(level, day, lesson, difficulty, sourceStudent)` — append row, with the dedup check.
  - `nearDuplicateExists(entries, difficulty)` — used by `addToLibrary`.
  - `recycleProbability(entryCount)` — returns the new-vs-recycle ratio for a given coverage count.
  - `rewriteLessonForDifficulty(sourceLesson, targetDifficulty, ...)` — option-C Claude rewrite call.
- `handleGenerateLesson` orchestrates: load library → check coverage → maybe match → maybe rewrite → maybe generate fresh → write back (subject to decisions 5 & 6 & 9).
- No teacher-facing UI changes — library accumulates and serves silently.
- No `student-course.html` changes — call signature stays identical.

**Effort:** ~250–300 lines added to `apps-script.js`. No client-side changes.

**Pros:** smallest possible footprint, ships fast, easy to roll back, test by watching the sheet fill up.

**Cons:** no visibility into library contents from the teacher dashboard. Bad lessons can only be removed by manually deleting sheet rows. No cost-savings stats.

---

### Proposal 2 — Phased Rollout (recommended)

**Phase 1 (this PR):** Write-only.
- Add the `Lesson Library` sheet.
- Every Claude generation in `handleGenerateLesson` writes a row (with the dedup check).
- No reads, no recycling, no tier curve.
- Risk: zero — student-facing path is unchanged.
- Outcome: a real seed of generated lessons accumulates. Teacher can eyeball quality and tune the strict/lenient thresholds in phase 2 against actual data.

**Phase 2 (next PR, after ~1–2 weeks of data):** Reads + tier curve.
- Add `getLibraryEntries`, `findLibraryMatch`, `recycleProbability`, `rewriteLessonForDifficulty`.
- `handleGenerateLesson` now consults the library before generating fresh.
- Tier curve activates.

**Phase 3 (later, optional):** Teacher dashboard.
- Add a `Lesson Library` panel in `examiner-panel.html` showing library size per `(level, day)`, entry preview, and a delete button.

**Pros:** de-risks by collecting real data before depending on it for serving. Each phase is small and reversible. Phase 1 is genuinely 30 minutes of work.

**Cons:** cost savings don't materialise until phase 2 ships. More PR churn (3 PRs vs 1).

**Why this is the recommendation:** Phase 1 is so cheap that the cost of phasing is negligible, and the upside is significant — phase 2 ships with confidence because the matching thresholds were tuned against actual difficulty distributions instead of guesses.

---

### Proposal 3 — Comprehensive with Dashboard (one large PR)

**What ships:**
- Everything in proposal 1, PLUS
- New `Lesson Library` panel in `examiner-panel.html`:
  - Grid view of `(level, day)` cells, colour-coded by entry count (red = 0, yellow = 1–4, green = 5–9, blue = 10+).
  - Click a cell → list of entries → click an entry → preview the lesson JSON → "Delete" button.
  - Stats card: total library size, generated-vs-recycled this week, estimated Claude cost saved.
- New `delete_library_entry` POST action in `apps-script.js`.
- Soft-delete via an `is_active` column on library rows (recoverable).

**Effort:** ~250 lines apps-script + ~300 lines new panel UI in `examiner-panel.html`. 2–3 days of focused work.

**Pros:** library curation is part of the daily teacher workflow from day one. Cost savings are visible.

**Cons:** much bigger PR, more to test, the dashboard UI is real surface area that needs maintenance.

---

## Open Questions for the Client

These were not answered during the design Q&A and the implementer should default to my recommendations unless the client overrides:

1. **Strict match thresholds.** I'm proposing all sliders within ±1 + ≥1 focus tag overlap. Client may want this stricter (exact slider match) or looser (within ±2).
2. **Lenient match threshold.** I'm proposing Manhattan distance ≤ 4 across the 6 sliders. Client may want a different number.
3. **Recycle probability curve numbers.** I'm proposing 0–4 → 100% new, 5–9 → 50/50, 10+ → 20% new / 80% recycle. The "10+" cutoff in particular is somewhat arbitrary — client may prefer a smoother curve like 5 → 60/40, 8 → 40/60, 12+ → 20/80.
4. **Option-C rewrite prompt structure.** The proposals assume the rewrite sends the source lesson + a "rewrite for difficulty X" instruction. Client may prefer a different prompting strategy (e.g. only rewrite the components affected by difficulty rather than the whole lesson).
5. **Display indicator when a lesson was recycled.** None of the proposals surface "this lesson came from the library" to the student or teacher. Client may want a small badge in the teacher dashboard.

---

## Continuation Prompt for a Future Claude Session

Use this prompt verbatim in a new Claude Code session once the client has approved a proposal:

```
I'm working on the FluentPath language learning platform and I'm ready to implement the lesson library recycling system. The full design and three implementation proposals are documented in `lesson-library-update.md` at the project root. The client has approved [PROPOSAL 1 / PROPOSAL 2 / PROPOSAL 3 — fill in].

Before writing any code:
1. Read `lesson-library-update.md` end to end. Pay particular attention to the "Algorithm — Decisions Made During Design" section: each numbered decision is non-negotiable unless I tell you otherwise.
2. Read `future-updates.md` so you know which alternatives were *considered and rejected* — do not re-propose them.
3. Read `apps-script.js` to refresh on the current `handleGenerateLesson`, `buildLessonPrompt`, `buildTeacherGuidanceBlock`, `safeAppendRow`, `upsertByStudent`, `ensureSheetHeaders`, `findLastByStudent`, and the `HEADERS` constant. The library code will live in this file and reuse these helpers.
4. Read `src/student-course.html` `generateLesson()` and the surrounding cache logic — note that no client-side changes should be needed for proposal 1 or 2.
5. Read `src/examiner-panel.html` only if implementing proposal 3 (dashboard panel).

When implementing:
- Follow the schema in decision 7 exactly. Do not invent new columns.
- Use `ensureSheetHeaders()` to safely create / extend the Lesson Library sheet — do not duplicate the column-creation logic.
- The `aiInstructions` forces-fresh rule (decisions 5 & 6) is enforced on BOTH the lookup side AND the write side. Both directions are required.
- The dedup check (decision 9) is "all 6 sliders identical at the same `(level, day)`" — not a fuzzy match. Use the existing matcher only for the *serve* path, not the *write* path.
- The recycle probability curve (decision 3) should be a single small helper function — do not scatter the threshold numbers across the codebase.
- When a recycle decision is made, use `Math.random()` against the probability — there is no per-student determinism on the server side. The existing localStorage cache in `student-course.html` is what pins the served lesson on reload.
- Update CHANGELOG.md with the new behaviour. Update README.md if proposal 3 (the new dashboard panel needs documentation).
- Provide a commit message at the end. Do not commit on my behalf — I will commit manually.

Open questions to ask me before implementing (defaults are in `lesson-library-update.md` "Open Questions for the Client" — use those unless I override):
- Strict match thresholds
- Lenient match threshold
- Recycle probability curve numbers
- Whether to surface "recycled" status to the teacher

Start by reading the docs, then ask any clarifying questions, then implement in one focused pass.
```

---

## File References

- `apps-script.js` — `handleGenerateLesson` (line ~474 as of 2026-04-09), `buildLessonPrompt` (~553), `buildTeacherGuidanceBlock` (~655), `HEADERS` constant (~122), `ensureSheetHeaders` (~80), `safeAppendRow` (~720), `upsertByStudent` (~96), `findLastByStudent` (~50)
- `src/student-course.html` — `generateLesson()` (~737), `getFallbackLesson()` (~991), `FALLBACK_LESSONS` (~838)
- `src/examiner-panel.html` — `DIFF_AREAS` constant (~1001), `FOCUS_OPTIONS` (~994), `saveDifficulty()` (~2042), `saveFocusAreas()` (~2106), `buildDifficultyJson()` (~2058), `syncDifficultyToSheet()` (~2068)
- `future-updates.md` — three deferred alternatives (per-component recycling, Drive-folder storage, tagged custom-instruction recycling)

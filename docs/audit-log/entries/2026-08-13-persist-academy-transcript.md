# Audit: 2026-08-13 — persist-academy-transcript
**Trigger:** ad-hoc
**Scope:** academy_courses.transcript column + AI-Assist-to-Assessment
transcript wiring in AcademyBuilderCourse.tsx. Did not touch
AiAssistPanel.tsx, AssessmentEditorTab.tsx, or the edge function.

## Findings
- `aiTranscript` was page-level session state, cleared on courseId
  change and never included in the Save Changes payload, so "Generate
  quiz with AI" reset to disabled on every reload/revisit regardless
  of whether AI Assist had been run.

## Code changes (if this entry accompanies one)
- 832d6f6a: add academy_courses.transcript column; fold transcript
  into Structure-tab formState instead of separate session state.

## Decisions
- Transcript persists on explicit "Save Changes", matching every other
  AI-Assist-populated field, rather than auto-saving on fetch.

## Open questions parked
- transcript_timestamped (also returned by the edge function) is still
  discarded; out of scope for this fix.

# Rock notes

> **Last updated:** 2026-10-31 · **Reconsider by:** 2027-01-31 · **Confidence:** high on the original database rules (run against `unicorn-qa` in a rolled-back transaction), the CRUD SQL policy coverage (static tests only; its migration is not applied), and the screens (unit tests plus a browser walk with faked data); the AI summary's wording quality is not provable offline and has not been used in a real meeting.
>
> **Status: original Notes feature deployed; CRUD extension is local and uncommitted.** The original notes migration is applied to `unicorn-qa` and production (29 Oct 2026). The new CRUD migration has not been applied to any project; its Edge Function is unchanged.

## Why it exists

Rock Review is a yes/no, so what was said about a Rock ("the supplier slipped, the date is now confirmed") used to be lost between meetings. Notes keep a short, dated, executive-level record on each Rock so the next meeting can see how it has moved, without turning Rock Review into a discussion.

## What it is

- **A Notes panel** on the Discuss slide, in the right rail under the status panel, and in the Rock details panel. Type a note or press **Dictate**; **Add note** (or Ctrl/Cmd+Enter) saves it.
- **Each note is a dated record:** who wrote it, when (Sydney time), the meeting it was written in (if any), whether it was dictated, and the Rock's status and milestone progress **at that moment**, read by the database rather than the screen. A change of status between two notes is shown ("At risk → Off track"), so the notes read as a progression.
- **Editable by its author and deletable by its author or a Super Admin**, while the caller is still Vivacity staff. Editing changes only the text and records `edited_at`; the original author, date, meeting, source, Rock status and milestone snapshot stay fixed. Deletion is permanent. The database still permits a deleted meeting to clear its note link. A Rock that has notes cannot be deleted, only archived.
- **Last time.** The panel shows the notes from the most recent *earlier* meeting (or day, for notes written outside a meeting) so the room starts from where it left off.
- **On Company and Team Rocks** the panel also lists the notes written on the Team and Individual Rocks beneath it, each tagged with its Rock, so one place shows how the whole thing is moving.
- **AI summary (on request).** **Write a summary** asks the `summarise-rock-notes` Edge Function for two to five sentences on how the notes have progressed, what the notes suggest the status is, and up to three suggested To-Dos. It is stored as history and marked "written by AI from the notes only"; when newer notes exist it says so. Nothing is created from a suggestion until a person presses **Create To-Do** (a plain To-Do for them, tied to the meeting, due in a week); it can only be created once per summary.

## Dictation across the screens

One microphone and one set of drafts live in `RockNotesDictationProvider`, above the Discuss view and the Rock details panel. Opening the panel or moving through milestones never restarts the microphone or loses text.

**Moving to another Rock is a hand-over, not an instant switch** (fixed 29 Oct 2026 after a real test showed the end of one Rock's note landing on the next). A speech recogniser delivers its last phrase a moment *after* you stop speaking, so pointing the microphone at the next Rock straight away put that tail on the wrong Rock. Now, when you press Next, jump on the rail, change the filter or reach the wrap-up:
1. The Rock you are leaving keeps the microphone while the browser finishes the phrase it is recognising and ends the session (about a second at most).
2. That Rock's note is saved, dictated or typed. The footer strip says "Saving your note for ‘…’", and the new Rock's panel says the microphone moves there in a moment.
3. A fresh session starts for the new Rock, so everything said from then on goes to it. At the wrap-up there is no Rock, so the last note is saved and the microphone turns off.

Pressing Next twice quickly skips the Rock in between (it never gets text). Pressing Stop during the hand-over still saves the Rock you left and leaves the microphone off. Going back to the same Rock during the hand-over simply restarts it. With the microphone off, **Next still saves the note being written** (typed notes included). Stopping the microphone on a slide keeps the text as a draft to review; closing the Discuss view stops it and saves every draft; a failed save keeps the text. Words spoken in the roughly half-second between the old session ending and the new one starting can be missed, as at any browser restart.

A fixed strip in the Discuss footer, beside Next, always says where the microphone is writing ("Listening · notes go to ‘…’", with a Stop button), says when it is saving the Rock just left, confirms each save ("Saved your note for ‘…’") for a few seconds, and warns of an unsaved note ("Next saves it").

## Where the code is

Migration `supabase/migrations/20261028120000_rock_notes.sql` (rollback in `rollback/`): `eos_rock_notes`, `eos_rock_note_summaries`, `add_rock_note()` (staff only, `SECURITY DEFINER`, empty `search_path`; a repeat within 30 seconds returns the first), and `rock_delete_blockers()` extended with `notes`. The local CRUD extension is `supabase/migrations/20261031054829_rock_notes_crud.sql` (rollback in `rollback/`); it adds `edited_at`, allows body-only edits and deletes through staff-author/Super Admin RLS, and preserves the recorded note snapshot. The UI provides edit, confirmed delete, and an edited timestamp. Edge Function `supabase/functions/summarise-rock-notes/` with its pure helpers in `_shared/rock-notes-summary.ts` (prompt, output validation). Frontend: `src/utils/rockNotes.ts`, `src/hooks/useRockNotes.ts`, `src/components/eos/rocks/notes/` (`RockNotesDictation` provider, `RockNotesPanel`), wired in `RockDiscussSlide`, `RockDiscussDialog` (reports the Rock on screen, which triggers the hand-over, and flushes on close), `DictationStatusBar` (the footer strip), `MeetingRocksReview` (hosts the provider) and `RockDetailSheet`.

## Rules worth knowing

- Creation uses `add_rock_note()`; clients receive no direct insert grant. The pending CRUD migration grants body-only update and delete, with RLS limited to a staff author or Super Admin. The notes table's select rule remains unchanged. Summaries are written only by the Edge Function with the service role, which checks `staff.ai.use` before reading anything and uses only a validated Rock id from the request.
- The model is told the notes are quoted data, not instructions, and is told to say only what they support. Its output is validated (length, allowed status values, at most three de-duplicated To-Dos) before it is stored. The notes, not the summary, are the record.
- A "Notes suggest: …" line is the AI's reading of the notes, **not** the Rock's status; nothing changes the status except a person.

## Not done

The CRUD extension is uncommitted and its migration has not been applied; until the migration is released, deployed clients must continue using the existing append-only behavior. The `unicorn-qa` project was read on 31 Oct 2026 and had no Rocks, milestones, notes or milestone links, so no forecast note could be reconciled there. No notification is sent when a note is added. The Rock details panel shows notes only to people who can manage the Rock. Per-meeting notes are not yet pulled into the meeting's minutes. The summary is regenerated by hand, not on a schedule.

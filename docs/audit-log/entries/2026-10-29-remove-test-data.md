# Audit: 2026-10-29 — Removed the test data from production

**Trigger:** Carl's instruction (29 Oct 2026) once testing of Rock Notes, To-Do links and the Discuss view was finished.
**Scope:** production (`yxkgdalkbrriasiyyrwk`) data only. No schema, policy, function or code change.

## What was removed
- The `[TEST] L10 - Rocks cascade preview` meeting (seeded 27 Oct for the Rock Review preview): deleted. Its 7 segments and 13 attendees went with it; it had no To-Dos or issues. Two Rock notes that pointed at it had their meeting link cleared (the one change the append-only rule allows).
- The two `[TEST] Notes sandbox A/B` Company Rocks (seeded 29 Oct): first archived, then, because Carl asked for the test data not to linger in the database, deleted together with their 6 milestones, 2 notes and 1 AI summary. The notes read "Test 1 2 3 test 1 2 3 test 1 2 3" and "4 5 6 7 8 9 10", and the summary described placeholder text. They were the **only** 2 notes and 1 summary in production.

## The append-only rule was lifted once, deliberately
Notes are designed to be a permanent record (an update/delete-refusing trigger, `ON DELETE RESTRICT` on the Rock, and a Rock delete guard), so these could not be deleted through the app and the Rocks were first only archived. At Carl's instruction the trigger `trg_eos_rock_notes_append_only` was disabled and re-enabled **inside one transaction** around a single delete of the two named notes. The same block refused unless: the two Rocks were the archived `[TEST]` ones, the notes table held exactly those 2 notes, each delete removed exactly the expected number of rows, the Rock delete guard reported nothing attached, and the trigger was enabled again before commit. Any failure would have rolled back all of it, including the disabling.

## Backup and verification
- The Rocks, milestones, notes and summary were exported in full beforehand to a local file (`/home/carl/backups/unicorn-prod/test-sandbox-rocks-and-notes_2026-10-29.json`, owner-only permissions, outside the repository).
- Afterwards: 0 `[TEST]` Rocks or milestones; 0 notes and 0 summaries in the table; the trigger present and enabled; the Rock delete guard still reports `notes`; **163 Rocks, 523 milestones, 34 To-Dos, 41 meetings**, identical to the counts before testing began (the earlier 165 and 529 included the test Rocks and their milestones).

## Restore
Re-insert the backup rows (their ids are kept) if ever needed. Nothing else depends on them.

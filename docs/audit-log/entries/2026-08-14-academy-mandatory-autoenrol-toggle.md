# Audit: 2026-08-14 — Academy mandatory auto-enrol made an explicit, entitlement-aware toggle

**Trigger:** ad-hoc — surfaced while bundling mass-enrollment timeline noise (PR #270/#271)
**Scope:** the `academy_courses` auto-enrollment trigger and its course-builder UI; explicitly did not touch existing `academy_enrollments` rows created by the old behavior, the sibling `package_instances` auto-enrol trigger's same entitlement gap, or seat-cap (`academy_max_users`) enforcement — all parked for later.

## Findings

- While investigating why the Client Activity timeline showed mass academy-enrollment bursts, found a live DB trigger, `trg_academy_autoenrol_on_all_clients_publish` / `fn_academy_autoenrol_on_all_clients_publish`, that was **not present in any migration file in this repo** — it existed only on the hosted project, applied directly at some point outside the tracked migration history.
- That trigger fired on every `academy_courses` publish where `available_to_all_clients = true`, inserting one `academy_enrollments` row for **every** active, non-archived, non-disabled user platform-wide — with zero regard for whether the user's tenant had Academy access at all. Confirmed empirically: only 59 of the platform's tenants have `tenants.academy_access_enabled = true`, yet one real burst enrolled users at 63 tenants — the gap is exactly the entitlement check that was missing.
- This conflated two things the product otherwise keeps deliberately separate: `available_to_all_clients` (pure browse/visibility — the course-browse hub already queries `academy_courses` directly, independent of enrollment) versus actual enrollment, which elsewhere in the app only ever happens on genuine intent — a user clicking "Enrol" (`enrol_in_academy_course` RPC, used behind explicit buttons in the browse hub, course list, course detail, and the lesson-preview banner — never as a side effect of merely viewing something) or an admin explicitly assigning users. The trigger's blanket mass-enrol contradicted that pattern and risked enrolling users who would never engage with the course, polluting their own progress/"My Courses" view and skewing completion reporting.
- A real, already-built, already-admin-managed tenant entitlement flag exists — `tenants.academy_access_enabled` (+ `academy_max_users`, `academy_subscription_expires_at`), editable today via `src/pages/superadmin/AcademyTenantAccessPage.tsx` — but the trigger never checked it.
- A parallel auto-enrol pathway also exists (`fn_academy_autoenrol_on_package_instance`, triggered on `package_instances`, via `academy_package_course_rules`) with the identical entitlement gap. Not touched this pass — flagged as a follow-up.
- `academy_enrollments` rows are not just a UI convenience: `academy_lesson_progress`, `academy_assessment_attempts`, and `academy_certificates` all carry mandatory NOT NULL foreign keys to `academy_enrollments.id`, and the RLS policies gating lesson/resource/quiz content have no fallback path for `available_to_all_clients` — they require a real active enrollment row. Ruled out replacing physical enrollment with a pure read-time flag check; that would break lesson access, progress tracking, certificates, and admin reporting outright.

## Code changes (this entry accompanies one)

- Migration `20260814000000_academy_mandatory_autoenrol_toggle.sql` (applied via `apply_migration`):
  - Added `academy_courses.auto_enrol_all_clients boolean not null default false` — every existing course, including the ones already mass-enrolled under the old behavior, defaults to `false`. Nothing auto-enrols anyone going forward unless a course author explicitly opts in.
  - Dropped `trg_academy_autoenrol_on_all_clients_publish` / `fn_academy_autoenrol_on_all_clients_publish`.
  - Added `trg_academy_autoenrol_on_mandatory_publish` / `fn_academy_autoenrol_on_mandatory_publish`: fires only when `auto_enrol_all_clients = true` on publish, and only enrolls users whose tenant has `academy_access_enabled = true` and an unexpired `academy_subscription_expires_at`. `available_to_all_clients` itself is untouched — still pure visibility.
  - Regenerated `src/integrations/supabase/types.ts` (74-line diff, additive only).
- `src/components/academy/builder/PackageRulesTab.tsx`: added a second toggle, "Auto-enrol all eligible clients," nested under "Available to all clients" (auto-enrolling into something clients can't browse doesn't make sense), off by default, with copy steering authors toward self-enrol for ordinary courses.

## Verification (no permanent side effects)

- Validated the new trigger with a real `BEGIN; INSERT INTO academy_courses (...) ; <check academy_enrollments>; ROLLBACK;` — a genuine test of the deployed trigger, not a simulation, undone immediately after. Confirmed:
  - A scratch published course with `auto_enrol_all_clients = true` enrolled all 12 active users at tenant 6372 (Vivacity Coaching & Consulting, `academy_access_enabled = true`).
  - The same scratch course enrolled **zero** users at tenant 7517 (Test RTO A, `academy_access_enabled = false`, `status = cancelled`).
  - Confirmed the scratch course did not exist afterward (clean rollback, zero residue).
- Separately verified the UI: created a disposable draft course, toggled both switches through the real course-builder page, confirmed `auto_enrol_all_clients` persisted correctly to the DB while the course stayed in `draft` (so the trigger's publish guard correctly never fired — zero enrollment rows), then deleted the scratch course.

## Decisions

- Existing `academy_enrollments` rows created by the old ungated trigger are left as-is — no backfill, no retroactive removal. Parked explicitly at the user's request for a separate, deliberate cleanup pass later.
- Declined to also enforce `academy_max_users` (seat cap) at enrollment time — a genuinely separate feature (partial/quota enrollment), not what was asked for here.
- Declined to fix the sibling `package_instances` auto-enrol trigger's identical `academy_access_enabled` gap in this pass — flagged to the user as a related but out-of-scope finding.

## Open questions parked

- Should `fn_academy_autoenrol_on_package_instance` get the same `academy_access_enabled`/expiry gate?
- Should `academy_max_users` be enforced anywhere at enrollment time, and if so, capped or best-effort?
- Should the ~6 courses' worth of enrollment rows created by the old ungated trigger be cleaned up (and if so, how — delete outright, or mark with a distinguishing `source` so they can be identified without deleting)?

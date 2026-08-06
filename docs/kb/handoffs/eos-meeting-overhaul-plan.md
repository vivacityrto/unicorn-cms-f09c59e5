# EOS Meeting Feature Overhaul — Plan

**Status:** Draft — scoping complete, design decisions open, no Lovable prompts written yet.
**Date:** 23 July 2026
**Author:** Carl (session with Claude Code)
**Repos affected:** `unicorn-cms-f09c59e5` (Lovable-managed frontend + Supabase migrations)
**Trigger:** Root `CLAUDE.md` → *Lovable production DB change sessions* applies in full — this plan feeds Prompt 1 (Audit), not implementation. See Process section.

---

## Context

Vivacity runs its own EOS practice (weekly L10, quarterly, and annual strategic planning meetings) inside the same Unicorn 2.0 app it sells to clients — the EOS module is Vivacity-internal only, scoped to tenant `6372`. A live-meeting walkthrough (simulated via a hand-seeded test L10, since prod is the only testable environment) surfaced enough structural issues across template management, meeting creation/recurrence, and the live-meeting experience that the goal shifted from "fix the recurrence bug" to a full overhaul of all three stages.

The throughline discovered across every stage: things get built (versioning, facilitator guidance, seat-based participant seeding, drag-and-drop) and never fully wired in, and there is no single source of truth for identity, permissions, or segment meaning — each is reconstructed by string-matching or duplicated 2-4 times independently.

**Guiding principle for the redesign:** *derive, don't copy.* Every bug found in the recurrence/participants chain traces back to a value being snapshotted-and-copied-forward instead of resolved live from a stable source (a seat, a role, a fixed per-type config). The fix pattern is the same in every stage: replace the copy with a derivation.

---

## Stage 1 — Manage Configurations (renamed from "Manage Template")

**Key finding:** "Template" is the wrong abstraction. Real usage data confirms every meeting type that's actually run (L10, Quarterly, Annual, Same_Page) has had **exactly one** template in use for its entire history — never swapped, never varied. Focus_Day and Custom have templates defined but **zero meetings ever created** of those types. The multi-template CRUD library (duplicate/archive/default-flag/versioning/per-tenant-seeding) exists to support a scenario that has never occurred.

**Scope decision (23 Jul):** a Configuration is not just the agenda. It absorbs everything that's currently split between `eos_agenda_templates` and `eos_meeting_series` for a given meeting type — because for the four fixed types, frequency/facilitator/participants aren't per-instance decisions any more than the agenda is. One Configuration per meeting type, one place to edit all of it.

### Target state
Each Configuration (one per meeting type: L10/Quarterly/Annual/Same_Page) holds:
- **Agenda** — the ordered segment list. Each segment gets an explicit **`segment_type`** field constrained to the real fixed set (`segue | scorecard | rocks | headlines | todos | ids | conclude | general`), shown next to the free-text display name. This replaces the current keyword-matching (`getSegmentType()` in `LiveMeetingView.tsx`, and the independently-hardcoded list in `validate_meeting_agenda`) with a real structural binding — no more silent fallback to a generic textarea because a segment was renamed.
- **Frequency** — weekly / quarterly / annual / on-demand. **Resolved (23 Jul): Same_Page is `on_demand`.** Confirmed against the real data: the one historical Same_Page meeting had `series_id = null` and `template_id = null` — never linked to a series, never even linked to its own template. There's a genuinely well-built system template for it (Check-In → Review V/TO → Clarify Roles and Ownership → Discuss Key Issues → Align on Priorities → Decisions and Next Steps, 120 min total, matching the one real meeting's duration) but it's only ever been used as a one-off reference, not a recurring cadence — on-demand matches actual practice. Cleanup: delete the stray duplicate "Same Page" template that's miscategorized under `meeting_type = 'Custom'` (different, generic, never-used agenda) — it's leftover cruft, not a real second option.
- **Facilitator seat** — which accountability-chart seat auto-fills as Leader on each generated occurrence (relocates the currently-unused `facilitator_seat_id`/`visionary_seat_id`/`integrator_seat_id` columns from `eos_meeting_series` onto this entity).
- **Participant model** — whole roster vs. a required-seats list, as a real editable field rather than an assumption baked into code (today it's always "everyone," with no way to change that without a code edit).

No picking, no duplicating, no "which one is default" — editing means editing *the* configuration for that type, in place.

- Add a **live preview** in the editor so editing a segment shows what will actually render live — this is the "WYSIWYG" fix, not a general page-builder (the widget palette is fixed at 7 types, wired to real data hooks like `useEosScorecardMetrics`/`useEosRocks` — not arbitrary composable blocks).
- **Real drag-and-drop reordering** — `@dnd-kit` is already a dependency and already used elsewhere in this exact EOS module (`accountability/DraggableSeatCard.tsx`, `SwimlaneDragDropProvider.tsx`); the current grip handle is decorative. Reuse the existing pattern rather than inventing one. Also worth checking `AuditTemplateBuilder.tsx`/`PackageBuilderEditor.tsx` for a closer structural precedent before designing from scratch.
- Surface a few currently-hardcoded per-type constants as real config instead: Scorecard's hard cap at 5 metrics (`LiveMeetingView.tsx` `.slice(0, 5)`), Rocks' hardcoded company+team-only filter (excludes individual rocks).
- Stop auto-seeding templates/config on every tenant insert — centralize to the Vivacity tenant only (currently ~2,029 rows exist across tenants for an internal-only feature).

### Technical open question (for the audit, not a product decision)
Does this merge mean `eos_agenda_templates` and `eos_meeting_series` become one literal table, or stay two tables that are always 1:1 per type and presented/edited as a single Configuration entity in the UI? Either resolves the current split, but they have very different migration complexity — leave this for Lovable's audit to cost out rather than deciding upfront.

### Known dead code / cleanup to resolve
- `eos_agenda_template_versions` / `eos_template_audit_log` / `create_template_version` RPC — fully built, zero frontend callers, every edit today silently overwrites with no history.
- Duplicate RPC overloads: `create_meeting_from_template` (one overload references columns — `template_type`, `duration_minutes` — that don't exist on the current schema), `create_meeting_basic`, `seed_system_agenda_templates` (two overloads, three disagreeing "canonical" segment lists floating around).
- Inconsistent JSONB shape (`duration_minutes` vs `duration` key) — some code defends against this (`ApplyTemplateDialog.tsx`), some doesn't (`AgendaTemplateEditor.tsx`, `AgendaTemplateLibrary.tsx` — silently mis-totals as 0).
- No unique constraint enforcing "one config per type" (currently "one default per type," same gap either way).
- `deleteTemplate` mutation defined, never called (dead code).
- Four uncoordinated permission systems currently gate template management (`useRBAC` hardcoded map, `usePermission`/`role_permissions` DB table, `eos_user_roles` per-tenant table, RLS built on the last one) — the purpose-built `agenda_templates:manage` permission is defined and tested but wired to nothing.
- Doc drift to fix once shipped: `docs/eos/quarterly-annual.md` claims the template selector was removed (it wasn't); `docs/eos-audit-report.md` references a table (`eos_agenda_template_segments`) that never existed.

---

## Stage 2 — Create Meeting

**Scope note (23 Jul):** thinner than originally scoped, now that frequency/facilitator seat/participant model live on the Stage 1 Configuration instead of being chosen at scheduling time. For the four fixed types there is nothing left to pick when scheduling — this stage is now about the *mechanics* of instantiating a meeting from its Configuration, not about choosing its properties.

### Target state
- For the four fixed types, scheduling collapses to **type + date** (frequency, facilitator, and participants all derive from that type's Configuration) — no template picker, no facilitator/participant pickers in `MeetingScheduler.tsx`.
- **Facilitator** resolves from the Configuration's **seat** (the accountability chart), not a stored person. Resolution happens at generation/start time and is written as a real `eos_meeting_participants` row (`role='Leader'`) — this *is* a snapshot, deliberately, because "who actually facilitated meeting #37" is a fact worth keeping even after that person leaves the seat.
- **Participants (Members) stop being stored at all** for L10/Quarterly/Annual. Every real meeting of those three invites the entire ~14-person internal roster, unconditionally — so "who's expected" is computed live (active Vivacity internal staff, queried fresh) rather than copied forward. `eos_meeting_attendees` already separately tracks who *actually* attended (with status) — that table is the historical record; the participants list doesn't need to duplicate it. Same_Page uses the Configuration's other participant-model option instead — `required_seats` (Visionary + Integrator specifically), not whole-roster, per its real historical usage (see Stage 1).
- **Recurrence trigger (`auto_generate_next_meeting`)** — confirmed via live DB definition: correctly copies `template_id`/segments to each new occurrence, **never touches participants**. Fix: derive agenda + facilitator from the Configuration at generation time instead of copying from the previous instance — self-healing (a bad prior occurrence can't propagate forward) rather than copy-forward (current behavior).
- Fix the **title bug**: the trigger copies `NEW.title` verbatim, so a generated occurrence can display the wrong date (observed live: a meeting titled "20 Jul" was actually scheduled for 27 Jul). Title should regenerate from the new date, not copy the string.
- Fix the **facilitator picker's silent exclusion**: `get_vivacity_team_directory_staff()` filters out any user with `kpi_pod = 'qa'` — this is why dedicated test/shadow accounts are invisible to every EOS people-picker. Not necessarily wrong behavior, but worth an explicit decision on whether QA accounts should ever be pickable (e.g. behind a flag) rather than silently absent.
- **"Apply Template" becomes "Sync to Configuration."** `ApplyTemplateDialog.tsx` / `apply_template_to_meeting` currently exist to let you pick a different template and reset an existing meeting's agenda to it. Once there's only one Configuration per type, there's nothing to pick — this collapses to a single-click "re-sync this meeting to the current [Type] Configuration" action: no template dropdown, just a confirmation. Since facilitator/participants now also live on the Configuration, sync should re-derive all three (agenda, facilitator seat, participant list) for that instance, not just the agenda — useful if the Configuration changed after this meeting was already scheduled, or a seat-holder changed since. This applies to all four remaining meeting types (Focus_Day/Custom have been removed entirely — see Open Design Decisions).
  - **Notes/progress clarification (23 Jul):** the sync action works by deleting and reinserting `eos_meeting_segments` rows wholesale — this wipes not just segment-level notes text (the free-text field used by Segue/general-fallback segments) but also each segment's `started_at`/`completed_at` progress markers. Meeting-level notes (`eos_meetings.notes`, used for Conclude's "Cascading Messages") and everything in separate tables (issues, headlines, todos, ratings) are untouched either way. **Resolved: "Sync to Configuration" is only offered while the meeting is still `scheduled`** — hidden/disabled once `started_at` is set, so it can never silently rewind a live meeting's progress.

### Known-good, keep as-is
- **Facilitator absence/swap mechanism** (`FacilitatorSelectDialog` → `useFacilitatorChange` → `change_meeting_facilitator` RPC) is well-built: gated to current-Leader/Super Admin/Integrator-or-above, confirm-or-override UI at start-of-meeting. Once the seat-based default actually populates a Leader row, this becomes exactly the right tool for exceptions.

### Advance facilitator reassignment — resolved (23 Jul)
Originally flagged as open: the swap only worked at the literal moment of starting the meeting, with no way to reassign in advance. Resolved: since facilitator now resolves from a seat and gets written as a real row at *generation* time (not just at start), a scheduled-but-not-started meeting already shows who's assigned, days ahead — and `change_meeting_facilitator` already works for `scheduled` (as well as `in_progress`, per the mid-meeting-handoff fix in Stage 3). So this isn't a new mechanism, just a third UI surface for the same dialog/RPC: a "Change Facilitator" action on the meeting's card/detail in the meetings list, available any time before it starts. Same permission model throughout (current Leader, super admin, or Integrator-or-above) — one consistent mechanism across advance / at-start / mid-flight reassignment.

### Handling exceptions to the fixed cadence (23 Jul)

Once L10/Quarterly/Annual mostly run themselves, "scheduling" stops meaning "fill out a form every occurrence" and starts meaning "handle the exceptions to a cadence that otherwise runs on its own." Four scenarios considered:

- **Skip a week entirely** (public holiday, offsite) — not supported today; the generation trigger only advances on `closed`/`completed`, so a week nobody runs never triggers the next one either, and the whole cadence stalls. **Needed:** a "Skip this occurrence" action that marks it as skipped (distinct from actually closed, so history stays honest — a skipped week shouldn't look like it happened) and still counts as advancing the cadence, so the next occurrence generates on schedule.
- **Move a specific occurrence's date** — **confirmed not needed.** Real precedent: a meeting scheduled for Monday was actually started and run on Tuesday, with nobody editing the record's date beforehand. This already works correctly with zero changes, because the next-occurrence math anchors off the *scheduled* date (`OLD.scheduled_date + interval`), not off when the meeting was actually started or closed — running late never drifts the cadence. No reschedule feature needed; "start it whenever, off the original record" is the real and sufficient behavior.
- **Add an extra meeting outside the normal cadence** (something urgent) — already works: a manually-created one-off (not linked to the series) doesn't touch the regular chain at all.
- **Pause the whole cadence** (holiday shutdown) — already mechanically supported via the existing `is_active` flag, which the generation trigger already checks. Resuming just needs to compute the next occurrence fresh from today's date against the fixed cadence rule, not from wherever it left off.

Net new work from this section: only the **Skip** action is a real gap. Move/Add-extra/Pause are already covered by existing or already-planned behavior.

---

## Stage 3 — Do the Meeting

### Confirmed bugs to fix
- **Segment-advance permission mismatch:** the UI shows Next/Previous Segment to any Vivacity staff member (`canControlMeeting = isVivacityStaff || isFacilitator`), but the backing RPCs (`advance_segment`, `go_to_previous_segment`) only permit the Leader or a super admin — everyone else gets an exception toast on click.

  **Resolved (23 Jul, corrected): tighten the UI to match the RPC, and add independent browsing on top.** Only the **current facilitator** gets Next/Previous — no super-admin bypass (corrected from an earlier draft of this note — see the permission model below). Those buttons drive the *live* segment for everyone (`started_at`/`completed_at`, official meeting progress). The current "any staff" UI looseness looks like a workaround for attendee-list sync lag, not a deliberate design choice, and letting multiple people independently drive segment progression risks real conflict. `advance_segment`/`go_to_previous_segment` currently *do* include a super-admin bypass in the RPC itself — that needs to come **out** to match the corrected model (see below).

  On top of that, add **independent browsing** so attendees aren't locked to whatever's live: split the single `currentSegment` concept into two —
  - **Live segment** (server state, facilitator-controlled) — what's officially running.
  - **Viewing segment** (local/client-only, per-user, never written to the DB) — what *this* person's screen is showing. Defaults to following the live segment.

  Mechanism: the segment list already rendered in the sidebar (currently just a status display) becomes **clickable** — clicking any segment (ahead or behind) sets your own local viewing segment, no RPC call, no effect on anyone else, since segment content is already loaded client-side. No new buttons for attendees; the facilitator's Next/Previous remain the only thing that writes to the DB.

  When the facilitator advances and someone else is browsing elsewhere, don't hard-snap them — show a small dismissible "Facilitator moved to [segment] — jump to live" nudge (same pattern as chat apps' "new messages, scroll up" banner). The facilitator's own view snaps immediately on their own action (no nudge needed for your own click) — the nudge is only for other attendees who've independently browsed away.

  **Mid-meeting facilitator handoff (23 Jul):** now that segment control is stricter (facilitator/super-admin only), there needs to be a real way to hand control off mid-meeting rather than getting stuck. This is largely a free fix — `change_meeting_facilitator` (behind `FacilitatorSelectDialog`) already allows the current Leader, a super admin, or anyone Integrator-or-above to reassign, and the RPC doesn't check meeting status at all today. The only gap is the UI only ever opens that dialog from the pre-start "Start Meeting" flow. Fix: add a "Change Facilitator" action inside the live view itself (while `in_progress`), reusing the same dialog/hook/RPC — no new backend logic needed. Complementary guardrail: restrict the RPC to `scheduled`/`in_progress` only, so a *closed* meeting's historical facilitator record can't be silently rewritten after the fact (no such check exists today). Distinct from the Stage 2 open decision below (reassigning a facilitator *before* a meeting starts, from the meeting list, in advance) — that one's still open.
- **Three overlapping "am I allowed to run this" concepts** in one screen: `isFacilitator` (strict, Leader-only), `canControlMeeting` (loose, any staff), `useEosFacilitatorEligible` (any staff, gates the separate guidance panels).

  **Resolved (23 Jul): these collapse into two questions, not one — deliberately keeping super admins out of direct control.** With 8 real Super Admin accounts at Vivacity, most uninvolved in any given meeting, giving all of them blanket control power is a real accidental-interference risk, not a safety net — corrected from an earlier draft of this plan that would have added a super-admin bypass everywhere.
  - **"Can actually run this meeting"** (segment advance, end/close, IDS discuss/solve editing) = **the current facilitator only, full stop.** No super-admin bypass anywhere in this tier. `close_meeting_with_validation` is already correctly Leader-only today — leave it as-is. `advance_segment`/`go_to_previous_segment` currently *do* have a super-admin bypass — remove it, to match. IDS editing stays strict `isFacilitator`, no addition.
  - **"Can change who the facilitator is"** (the narrow escape hatch — handoff, not direct control) = current Leader, super admin, or Integrator-or-above — exactly what `change_meeting_facilitator` already does correctly today. This is the *only* place broader roles get involved, and only for reassigning control to someone else, never for driving the meeting themselves.
  - **"Eligible for facilitator guidance/coaching UI"** (`useEosFacilitatorEligible`) — unrelated to authorization, stays loose (any Vivacity staff) — different purpose (educational prompts/checklists), not a control gate.

  **Content-entry permissions (23 Jul) — who can add/edit what during a live meeting**, confirmed vs. still-to-verify:

  | Segment / action | Who can do it |
  |---|---|
  | Segue notes | Open — any participant |
  | Scorecard entry | **Unconfirmed — verify live during next test meeting** |
  | Rock Review (progress/edit) | Open — any participant (deliberate, from the June audit) |
  | Headlines (add) | Open — any participant |
  | Headlines (delete) | Own headline only |
  | To-Do List (add/toggle) | Open — any participant |
  | IDS (create issue) | Open — any participant |
  | IDS (discuss/solve, status transitions) | **Facilitator only** — the one real exception |
  | Conclude — Cascading Messages | **Unconfirmed — verify live during next test meeting** |
  | Meeting rating (1-10) | Open — each participant submits their own |

  General pattern (seems correct, worth keeping): *contributing* (raising an issue, adding a to-do, sharing a headline, rating the meeting) is open to any participant — matches how L10 is meant to work. Only *processing* an issue through Discuss→Solve is held to the facilitator-only standard, same as segment control and closing.
- **`actual_duration_minutes` never populated** by the real live-meeting close path (`close_meeting_with_validation`) — it's only set by `complete_meeting_instance`, a separate function called from `useMeetingSeries.tsx`, not from the live view. History silently shows planned duration with no "actual unavailable" indication.

  **Resolved (23 Jul):** simple, self-contained fix — add the same calculation `complete_meeting_instance` already uses (`EXTRACT(EPOCH FROM (now() - started_at)) / 60`) into `close_meeting_with_validation`'s existing final `UPDATE eos_meetings SET status = 'closed', ...` statement. No design/permission questions involved.
- **Close validation is advisory-only:** quorum/rating shortfalls are logged but never block closing; only the "must be in-progress" status gate respects `p_force`. The close dialog's "Missing Requirements" styling implies stricter enforcement than the backend performs.

  **Resolved (23 Jul):** make quorum/ratings an actual gate in `close_meeting_with_validation` — unmet + not forced = the close genuinely fails, matching what the UI already implies. Add a real **"Close Anyway"** button to `MeetingCloseValidationDialog` (currently missing entirely, despite the RPC already supporting `p_force`) for legitimate edge cases. This override stays with the facilitator only — same person, same role, no escalated permission — consistent with the facilitator-only control model resolved above.
- **Rating widget rendered three times** (live view post-segments card, close dialog for L10 only, past-meeting summary) for one underlying action — same `eos_meeting_ratings` table each time.

  **Resolved (23 Jul):** `PastMeetingSummary`'s copy stays — it's a genuinely different *read* view (average + who-rated-what) for a completed meeting, not a submission prompt. Of the two submission copies, the **live view's survives, the close dialog's is removed** — the close dialog is only ever seen by the facilitator (only they can close), but rating must be submittable by every participant individually, so it can't live only in a facilitator-only surface. The close dialog instead shows a read-only status line ("6 of 7 required ratings submitted") as part of the same validation summary from the close-gate fix above, not a second copy of the submission UI.
- **`PastMeetingSummary` "Issues Discussed" shows raw issue UUIDs**, not titles/status — looks unfinished.

  **Corrected + resolved (23 Jul):** live-verified against a real meeting (`24c9dd93…`, 08 Jun L10, 4 issues) — the `/eos/meetings/:id/summary` route does **not** use `PastMeetingSummary.tsx` at all. It renders a different page, `EosMeetingSummary.tsx`, backed by the precomputed `eos_meeting_summaries` table (built by `generate_meeting_summary()` on close) via `MeetingSummaryCard` — that path already renders issues correctly (titles, Solved/Carry Forward grouping), confirmed live. `PastMeetingSummary.tsx` — where the raw-UUID bug actually lives — is a separate, redundant dialog only reachable from the meetings list page (`EosMeetings.tsx`), duplicating the same "view a completed meeting" job the real page already does properly. Fix: remove the redundant dialog entirely and have that entry point navigate to the real `/summary` page instead — one correct implementation instead of two, bug disappears with the duplicate.
- **Realtime gaps:** `onTodoChange`/`onPresenceChange` are supported by `useMeetingRealtime` but never wired into `LiveMeetingView` — another attendee's to-do changes won't auto-refresh your view. Segment and headline changes *are* wired.

  **Corrected + resolved (23 Jul):** presence is actually **not** broken — `LiveMeetingView` consumes `onlineUsers` directly from the hook's own return value (updated internally on every sync event regardless of the unused `onPresenceChange` callback prop), feeding `OnlineUsersIndicator` correctly today. The real, remaining gap is **to-do sync only** — genuinely never wired. Fix: add the missing `onTodoChange` callback to the existing `useMeetingRealtime` call, invalidating the to-dos query, mirroring the exact pattern already used for segments/headlines. Small, mechanical, no design decision needed.

  **Realtime lag (from live testing) — do both:** (1) timebox investigating why the Supabase Realtime tenant isn't staying warm between connections — may be infra/project-tier, not fully within app-code control; (2) regardless of root cause, design around it — the actor's own action updates their own screen optimistically/instantly (don't wait for the realtime echo), while other attendees see a lightweight "syncing…" indicator rather than a UI that looks frozen during the lag window.
- **`eos_meeting_attendees` auto-populates the entire roster** the moment a meeting page is opened/loaded (confirmed live — a hand-seeded test meeting with only 1 intended participant ended up with 16 attendee rows we never inserted).

  **Traced + resolved (23 Jul):** the mechanism is `trg_seed_meeting_attendees`, an `AFTER INSERT ON eos_meetings` trigger calling `seed_meeting_attendees()`. It has two parts: **(1)** if the new meeting has a `series_id`, copies attendees from *every other meeting in that series* (not just the previous one, all of them, grouped) — this is the same copy-forward anti-pattern as the participant-copying bug, just for attendees, and arguably worse since it aggregates across the whole series history. **(2)** always mirrors whoever's already in `eos_meeting_participants` into `eos_meeting_attendees` (Leader → 'owner', else → 'attendee').

  Fix: rework part (1) to derive attendees fresh from the Configuration's participant model each time (matching the Stage 2 fix), instead of copying from prior occurrences. Keep part (2) as-is — reasonable once participants are themselves seat/roster-derived rather than stored.

  **Not fully explained:** for our specific test meeting (`series_id = NULL`, participant row inserted *after* the meeting row), neither branch should have produced all 16 rows by the insert order as reconstructed — either the timeline reconstruction is off, or a third mechanism exists that wasn't found via static analysis. Verify the exact mechanism live during the next test meeting, alongside the still-unconfirmed Scorecard-entry and Cascading-Messages permission items.

### Confirmed live during testing (not a code bug, but a real UX finding)
- **Realtime segment sync has a genuine, non-trivial, recurring lag** for other attendees. Traced to the Supabase Realtime service itself repeatedly tearing down and cold-starting its connection ("no connected users" → terminate → later "initializing" + recreate replication slot) rather than staying warm — confirmed via realtime service logs, and confirmed by live testing that the lag was not a one-time warm-up cost (recurred on subsequent segment moves too, not just the first). Root cause of *why* the connection isn't staying warm needs a deeper trace (browser WebSocket lifecycle) before a fix can be scoped — flag as an infra item, not assumed-fixed by anything above. Design implication either way: the live-meeting UX shouldn't assume cross-client sync is instant — the facilitator's own screen should update optimistically on their own action rather than waiting on the realtime echo.

### Dead code — resolved (23 Jul)
Of 7 components in `src/components/eos/facilitator/`, only 2 (`FacilitatorChecklist`, and partially `FacilitatorPrompts`) are wired at all. Resolved into three groups:

- **Finish wiring — all 7 exports of `FacilitatorPrompts.tsx`**: `RockReviewPrompt`, `IDSPrompt`, `ScorecardPrompt`, `MeetingRatingPrompt` (already imported into `LiveMeetingView.tsx`, just never rendered) plus `OffTrackRockPrompt`, `IDSDecisionPrompt`, `QuorumWarningPrompt` (not even imported yet). Small, contextual coaching nudges — drop each into its matching segment. `QuorumWarningPrompt` pairs naturally with the close-validation fix above, surfacing the same warning proactively during the meeting, not just at close.
- **Finish wiring, into Rock Review — `RocksInsights`**: already takes a `rocks` prop, clearly meant to be fed the live meeting's rocks (overdue/no-owner/off-track callouts). Pairs with the Rock Review prompts above.
- **Delete — `FacilitatorHealthPanel`, `FacilitatorOnboardingPanel`, `FacilitatorAlertsPanel`, `QCInsights`**: standalone features that don't belong in a focused, time-boxed live meeting. Health/Onboarding panels are just navigation shortcuts to other existing pages (`/eos/health`, `/eos/onboarding`); Alerts sounds like company-wide monitoring, not this-meeting content; `QCInsights` is explicitly about Quarterly Conversations, an unrelated feature entirely.

Separately: `FacilitatorChecklist`'s "Required Outcomes" list is static illustrative text, not connected to any real data (never checks off, regardless of what actually happened in the meeting) — worth wiring to real segment-completion/outcome-confirmation data while touching this component anyway.

---

## Open Design Decisions (resolve before any Lovable implementation prompt)

| # | Decision | Options on the table |
|---|---|---|
All open decisions are now genuinely resolved — see below. The only remaining unknowns are the two items already flagged for live re-verification during the next test meeting (Scorecard-entry/Cascading-Messages permissions, and the exact `eos_meeting_attendees` seeding mechanism) and the migration mechanics deferred to the Prompt 1 audit (Configuration schema-merge specifics, tenant-scope cleanup dry-run).

**Resolved:**
- Template/Configuration versioning system (23 Jul) — **rip out** the dedicated versioning subsystem (`eos_agenda_template_versions`, `create_template_version`, `restore_template_version`) as dead weight never actually used. Instead, log every Configuration edit into the existing general `audit_eos_events` table — same pattern already used for facilitator changes and meeting auto-generation — giving real "who changed what, when" accountability without maintaining a whole separate versioning system for 4 rarely-edited rows.
- Auth model for managing Configurations (23 Jul) — consolidate onto the newer `usePermission`/`role_permissions` system (already used for scheduling), introducing a real feature key (e.g. `eos.configurations.manage`) used consistently across all three current surfaces (button visibility, in-dialog actions, RLS) instead of three different things being checked today. Who gets the permission (Super Admin + Integrator) doesn't change, just which system decides it. Separate from the live-meeting control-authorization model already resolved in Stage 3 (facilitator/super-admin tiers for running a meeting) — that one's about running a meeting, this one's about editing the Configuration itself.
- Template/Configuration tenant scope (23 Jul) — **centralize to Vivacity tenant only.** Stop `auto_seed_agenda_templates` firing for anything except tenant 6372, and remove the ~2,029 existing orphaned rows scattered across every other tenant — likely falls out naturally from the schema-merge migration (old table dropped/replaced) rather than needing a separate bulk-delete, but either way needs a dry-run/verification pass first per standard production-data-change discipline (confirm nothing unexpectedly references those rows) — deferred to the Prompt 1 audit.
- Focus_Day / Custom meeting types (23 Jul) — **remove entirely.** Zero real meetings of either type have ever been created; consistent with every other simplification in this overhaul (stop maintaining structure for a scenario that's never actually happened). If a genuinely novel meeting need arises later, building a fresh ad-hoc flow at that point is a small, contained task.
- Configuration schema shape (23 Jul) — **merge into one table**, not two kept-in-sync-by-convention. Consistent with the overhaul's central theme (stop splitting one source of truth across places that can drift), and low-risk in practice since only 4 real rows will ever exist once tenant-scope cleanup lands. Exact mechanics (new FK shape on `eos_meetings`, migration ordering) deferred to the Prompt 1 audit to cost out — the directional call is settled.
- Same_Page frequency → `on_demand` (23 Jul) — see Stage 1 target state for reasoning.
- Realtime connection warmth (23 Jul) — do both: timebox investigating the root cause, and design the UX (optimistic own-action updates + "syncing…" indicator for others) to not depend on it regardless. See Stage 3 target state.
- `eos_meeting_attendees` auto-population (23 Jul) — traced to `seed_meeting_attendees()`; fix the series-wide copy-forward branch to derive from the Configuration instead, keep the participant-mirroring branch. Exact mechanism behind our specific test's 16-row outcome still needs live re-verification. See Stage 3 target state.
- Facilitator guidance dead code (23 Jul) — finish wiring `FacilitatorPrompts` (all 7 exports) and `RocksInsights`; delete `FacilitatorHealthPanel`/`FacilitatorOnboardingPanel`/`FacilitatorAlertsPanel`/`QCInsights` as out of scope for the live meeting. See Stage 3 target state.

---

## Design Decisions Gate — Audit Response (23 Jul)

Prompt 1 (full-scope audit) ran against production. Findings confirmed the plan's assumptions (22 L10 / 3 Quarterly / 2 Annual / 1 Same_Page, 0 Focus_Day/Custom; ~2,029 orphaned template rows across non-6372 tenants) and surfaced 5 implementation-mechanics decisions plus 2 gaps. All 5 resolved:

1. **Configuration schema shape** — **Option B: normalized parent + `eos_configuration_segments` child table**, not a single table with a jsonb segments blob. The plan's earlier "merge into one table" resolution was about killing the `eos_agenda_templates`/`eos_meeting_series` split, not about internal segment representation — a child table gives an indexed, queryable `segment_type` column (the actual point of killing keyword-matching) and a natural `position` column for dnd-kit persistence, which a jsonb array does worse on both counts.
2. **Tenant-scope cleanup dry-run** — audit's proposed procedure (backfill table → FK sweep → NULL orphan pointers → halt for approval → delete) approved as designed. Approval to actually delete happens after the dry-run row counts come back, per standard production-data discipline — not granted upfront.
3. **`kpi_pod = 'qa'` exclusion in `get_vivacity_team_directory_staff()`** — **keep excluding, no change.** Resolved 23 Jul (Carl): stays as deliberate behavior, not a bug — documented here instead of left as an unexplained gap.
4. **Same_Page default facilitator seat** — **Integrator**, when both Visionary and Integrator seats are populated. Resolved 23 Jul (Carl): consistent with L10/Quarterly/Annual's Integrator-facilitated default, keeping one pattern across all four recurring types.
5. **"Skip occurrence" state name** — **`skipped`**, not `cancelled_occurrence` — shorter, and avoids inviting confusion with the existing `cancelled` status by not pairing a modifier onto it.

**Gaps surfaced during review, to fold into Prompt 2 rather than block the gate:**
- Scorecard-entry and Cascading-Messages content-entry permissions — flagged back in the Stage 3 findings as "unconfirmed, verify live" — were not addressed by the audit at all. Needs either a live check before the permission model locks in Prompt 2, or an explicit call-out that they ship as-is pending verification.
- No unique constraint proposed for "one Configuration per type" (today's schema only enforces "one default per type," same gap either way, per Stage 1 known-cleanup list). Add `UNIQUE (tenant_id, meeting_type)` to Migration 1's scope on the Configuration parent table.

Gate closed. Proceeding to Prompt 2 (implementation plan).

---

## Process

No Supabase branch — implementation goes straight through Lovable against production. That means the full Lovable production DB-change workflow (root `CLAUDE.md` → *Lovable production DB change sessions*, detailed in `unicorn-kb/handoffs/lovable-production-db-change.md`) applies with no safety net from an isolated branch, so getting the design decisions above resolved *before* Prompt 2 matters more than it would otherwise:

1. **Prompt 1 — Audit** (plan mode ON, read-only, no code) — scoped to this full three-stage plan, not just recurrence. Must surface every open decision above explicitly, per the handoff's audit requirements (FK/RLS/trigger inventory, function-hardening checklist, rollback plan per step).
2. **Design decisions gate** — resolve the table above with Carl before Prompt 2.
3. **Prompt 2 — Implementation plan** (plan mode ON) — migration ordering, lock impact, rollback plan, verification steps.
4. **Prompts 3–N — Phased implementation** (plan mode ON each) — supporting objects → structural changes → data fixes → validation → verification, never combined.
5. **Dry-run** before any live data operation.
6. **Final prompt — Verification and sign-off** (the Dave standard).
7. **Audit entry** in `unicorn-audit/` after shipping, per the standard template — this session's author writes it, Carl reviews via PR, no auto-merge.

---

## Reference

- Live-meeting walkthrough used a hand-seeded test L10 (`d519f0c4-…`, tenant 6372) — fully torn down after testing, no residue.
- Prior related audit: `unicorn-audit/audit/2026-06-03-l10-meeting-fixes.md` (origin of the current recurrence trigger and the Vivacity L10 series).
- Key tables: `eos_meetings`, `eos_meeting_series`, `eos_meeting_segments`, `eos_meeting_participants`, `eos_meeting_attendees`, `eos_agenda_templates`, `eos_agenda_template_versions`, `eos_template_audit_log`.
- Key functions (live definitions pulled during this session): `auto_generate_next_meeting`, `apply_template_to_meeting`, `change_meeting_facilitator`, `is_vivacity_team_safe`, `is_staff`, `is_meeting_participant`, `has_any_eos_role`, `get_vivacity_team_directory_staff`.

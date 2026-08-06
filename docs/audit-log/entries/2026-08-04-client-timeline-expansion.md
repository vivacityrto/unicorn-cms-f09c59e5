# Audit: 2026-08-04 — Client Timeline expansion (notes, logins, messages, Academy, stage progression, page views, package status)

**Trigger:** ad-hoc — schema/trigger changes shipped as hand-written `unicorn-cms-f09c59e5` hotfixes (not routed through Lovable), audit entry required per workspace-root `CLAUDE.md → Lovable production DB change sessions` regardless of route.
**Scope:** Seven phases extending the existing client Timeline feature (`client_timeline_events`) into a comprehensive activity feed per Carl's request — CSC notes (including a previously-unlinked legacy notes system), client-portal logins, client↔CSC messages, Vivacity Academy engagement, stage progression status changes (added mid-session on Carl's follow-up ask), net-new client-portal page-view tracking, and package status transitions (added in a later same-day session, prompted by a Governance Documents visibility investigation). All feed the Ask Viv Assistant RAG corpus for free, since `client_timeline_events` was already a registered ingestion source in `embed-ask-viv-corpus`. Plus a same-session post-ship correction (PR #139) after Carl reported a note wasn't appearing in the Timeline.

## Findings

### Pre-build research
- The Timeline feature was **not greenfield** as initially assumed: `client_timeline_events` already existed as a unified, `event_type`-discriminated append-only table with a mature UI (`ClientTimelineTab.tsx`), search/filter/PDF-export, and an established trigger pattern (`fn_client_note_timeline_trigger` et al.) for wiring new sources in.
- Only client-portal page-view tracking was genuinely new — no analytics/page-view capture of any kind existed anywhere in the codebase before this session.
- A legacy, timeline-unlinked structured-notes system (`documents_notes` / `ClientStructuredNotesTab.tsx`) existed alongside the canonical `client_notes`, serving stage/task-linked notes — Carl confirmed he wanted it wired in too.

### Phase A — legacy structured notes (`hotfix/timeline-phase-a-legacy-notes`, PR #133)
- New trigger `fn_documents_note_timeline_trigger` on `documents_notes` INSERT, mirroring the existing `client_notes` pattern exactly. New event type `structured_note_added`, internal visibility.

### Phase B — client-portal logins (`hotfix/timeline-phase-b-client-login`, PR #134)
- Extended the existing `handle_user_login()` trigger (already fires on every `auth.users.last_sign_in_at` change, staff and portal users alike) to also emit an internal-only `client_login` timeline event when the signed-in user is client-portal (`user_type NOT IN ('Vivacity','Vivacity Team')`).
- Tenant resolution mirrors `ClientTenantContext.tsx`'s existing ambiguity handling: prefer `users.tenant_id`, else resolve via `tenant_users` only if it yields exactly one tenant; skip silently otherwise rather than guess.

### Phase C — client↔CSC messaging (`hotfix/timeline-phase-c-messaging`, PR #135)
- New trigger `fn_tenant_message_timeline_trigger` on `tenant_messages` INSERT, client-visible (`visibility='client'`, `source='unicorn'`).
- **Real pre-existing production bug found and fixed**: the table's original creation (`20260107054614`) added an inline `CHECK (source IN ('system','user'))`. A later migration (`20260210082835`) added a second, intentionally wider constraint (`timeline_valid_source`, allowing `unicorn`/`microsoft`/`system`/`user`) but never dropped the original one. Postgres enforces all CHECK constraints simultaneously, so the *effective* allowed set stayed `{'system','user'}` the entire time — confirmed via `SELECT source, count(*) ... GROUP BY source` that **zero rows with `source='unicorn'` or `'microsoft'` have ever existed in production**. This silently blocked not just this phase but the Microsoft integration's own timeline events since that constraint was added. Fixed by dropping the stale `client_timeline_events_source_check` constraint; the intentional `timeline_valid_source` constraint is untouched. Flagged in the PR as worth a follow-up check on whether any Microsoft-sync edge functions silently swallowed this error historically.
- Also caught (before it ever ran against real data) a column/value-count mismatch in my own first draft of the trigger function — an extra trailing `NULL` in the INSERT.

### Phase D — Vivacity Academy engagement (`hotfix/timeline-phase-d-academy-activity`, PR #136)
- Three triggers: `academy_enrolled` (enrollment INSERT), `academy_lesson_completed` (`is_completed` false/null→true transition on `academy_lesson_progress`, guarded against re-fire), `academy_certificate_issued` (certificate INSERT). All internal-only — confirmed via grep across `src/pages/client` that no Academy engagement detail is shown to clients anywhere today, so this preserves that boundary rather than introducing a new client-visible surface as a side effect.
- Tenant resolution prefers `users.tenant_id` (robust, since `academy_enrollments.tenant_id` is nullable), falling back to the enrollment/certificate row's own `tenant_id`.

### Phase E — stage progression (`hotfix/timeline-phase-e-stage-progression`, PR #137)
- Added mid-session: Carl asked to also include "stage progression, when the status changed" after Phase C shipped.
- New trigger `fn_stage_instance_timeline_trigger` on `stage_instances` (`AFTER UPDATE OF status`), reusing the `stage_status_changed` name already used in this table's existing `client_audit_log` entries (`PackageStagesManager.tsx`). Internal-only, same rationale as Phase D.
- **Scope ambiguity flagged, not resolved**: there are two separate stage-state systems in this codebase by design — `stage_instances` (generic, what this phase wires in — confirmed as the one with real production data and an active UI) and `client_package_stage_state` (a parallel, membership-scoped system with its own `transition_stage_state()` RPC and `stage_state_audit_log`, but no UI found driving it). Flagged in the PR in case Carl meant the other one; not actioned pending his response.

### Phase F — client-portal page-view tracking (`hotfix/timeline-phase-f-page-views`, PR #138)
- New table `client_portal_page_views` (one row per page view, tenant/user/session/path/duration), written only via a new `SECURITY DEFINER` RPC `rpc_log_page_view` — no direct INSERT/UPDATE grant to `authenticated`.
- New hook `usePageViewTracking`, mounted once in `ClientLayout.tsx` (the single wrapper every `/client/*` route passes through), gated off during staff preview/impersonation so CSC QA doesn't pollute a client's own digest.
- Daily digest `fn_generate_portal_activity_digest()`, run via `pg_cron` at 00:15, rolls each user's prior-day page views into a **single** `client_timeline_events` row (`portal_activity_summary`, internal-only) rather than one row per page view — keeps the visible Timeline feed and Ask Viv RAG corpus from being flooded while raw per-page fidelity stays in the dedicated table. Idempotent via the existing `dedupe_key` mechanism (`idx_timeline_events_dedupe`) already used elsewhere on `client_timeline_events` — verified re-running the digest produces no duplicate.
- **Known accepted limitation**: the last page of a browser session (tab closed, no further navigation) never gets its duration closed out — documented in the hook's code comment rather than worked around with a `sendBeacon`-based approach (which can't carry Supabase auth headers).
- Attempted to regenerate `src/integrations/supabase/types.ts` for the new table/RPC via the Supabase MCP tool; the full output (2.5M+ characters, whole-schema dump) wasn't practical to reconcile by hand this session, and `tsc --noEmit` already passes without it. Left as a minor follow-up for the next full type regen.

### Phase G — package status transitions (`hotfix/package-status-timeline-event`, PR #149)
- Added in a separate session, prompted by investigating why Start Training Group's client portal showed no Governance Documents despite ~150 generated documents existing. Root cause of that report: the client portal's `v_client_governance_documents` view only surfaces documents whose package instance has `membership_state = 'active'`; the tenant's package was migrated (cancelled) and its replacement completed within a few days by Dave (`dave@vivacity.com.au`, per `package_instance_state_log`), leaving zero active package instances and no documents visible in the portal. That view-visibility gap is a separate, already-flagged issue and is **not** fixed by this phase.
- Tracing that migration surfaced a real audit gap: `package_instances.membership_state` changes were only logged (`package_instance_state_log`, via the `transition_membership_state` RPC) when made through the proper cancel/hold/finalise UI flows in `ClientPackagesTab.tsx` — and even then, the RPC's audit log was the only trail; the Timeline itself only got an entry if staff completed a manually pre-filled note on a redirected page (cancel/hold), and got nothing at all for finalise/resume. Worse, the raw admin edit screen (`PackageDataManager.tsx`'s "mark complete" toggle) bypassed `transition_membership_state` entirely via a direct `.update()`, leaving **zero** trail (no log row, no timeline entry, no reason, no actor) — confirmed as exactly what happened to one of Start Training Group's package instances.
- Fix, following the Phase E (`stage_status_changed`) pattern exactly: new trigger `fn_package_instance_timeline_trigger` on `public.package_instances` (`AFTER UPDATE OF membership_state`), new event type `package_status_changed`, internal-only. Trigger-based rather than embedded in the RPC so every write path is covered regardless of caller, closing the raw-edit bypass at the source.
- Additionally routed `PackageDataManager.tsx`'s complete-toggle through `transition_membership_state` (per Carl's explicit direction) so that path also gets a `package_instance_state_log` entry (reason + actor), not just a Timeline row — the trigger alone would have logged the transition but not the reason/actor, which only the RPC's own audit table captures.
- Removed the now-redundant manual note-redirect from `ClientPackagesTab.tsx`'s cancel/hold handlers (per Carl's explicit direction) — replaced with `onRefresh?.()`, matching the pattern already used by `handleResumePackage`. The automatic trigger-based entry made the manual step both unreliable (skippable) and redundant.
- Verified live: trigger confirmed present and enabled (`pg_trigger.tgenabled = 'O'`) on `package_instances` immediately after migration apply. Not yet exercised end-to-end against a live cancel/hold/finalise/PackageDataManager-complete action this session — flagged as an open test-plan item on the PR.

### Post-ship correction — Phase A targeted the wrong table (`hotfix/timeline-fix-notes-table-wiring`, PR #139)
- Carl reported a note added via the "Structured Notes" tab (`ClientStructuredNotesTab.tsx`) wasn't appearing in the Timeline. Investigation found Phase A's trigger was wired onto `public.documents_notes` based on research that conflated it with the table that UI actually uses. Confirmed `documents_notes` has **zero rows and zero code references anywhere** in `src/` or `supabase/functions/` — a completely dead table. The real table (via `useNotes.tsx`) is `public.notes`.
- Fixed: retired the dead trigger/function, added the real one on `public.notes` (same event type, `structured_note_added`), and backfilled recent notes so already-existing activity shows up retroactively.
- **Second surprise caught mid-fix**: `public.notes` turned out to hold the full "Unicorn 1" (predecessor system) legacy migration history — **11,340 rows spanning 2014–2026 across 357 tenants**, not just recent CSC notes. An unscoped backfill was run first, found to be far larger than intended (would have flooded every tenant's timeline and the Ask Viv RAG corpus with over a decade of migration-era notes), rolled back cleanly (backfilled rows tagged `metadata.backfilled = true` for easy identification/deletion), and redone scoped to the last 90 days (793 rows / 69 tenants) per Carl's explicit direction after being asked rather than assumed.
- Verified both originally-reported notes (Carl's test note and a Cloudflare onboarding email-imported note, tenant 7547) now appear correctly.

### Cross-cutting
- All six event types added to both the DB `CHECK` constraint (`timeline_valid_event_type`) and `src/types/timeline.ts`'s `TIMELINE_EVENT_TYPES`, plus icon/colour maps, filter chips, and (where relevant) deep links in `TimelineEventCard.tsx` / `ClientTimelineTab.tsx` / `useClientManagementData.tsx`.
- Every migration verified end-to-end against live QA data (Test RTO A, tenant 7517) before merging — real inserts/updates triggered, correct timeline rows confirmed, test data cleaned up and original state restored each time (including a stash-and-recover of an unrelated in-progress WIP branch found at session start, left untouched at the user's request until they'd committed it themselves).
- Merge approach: Carl initially approved a stacked-PR-hold-merge pattern (per the precedent from the Ask Viv Assistant build), then mid-session said to just merge to `main` directly instead — all six phases were merged immediately after each passed its live verification, rather than held as a stack.

## KB changes shipped
- unicorn-kb: no changes this session.

## Codebase observations (read-only)

- unicorn-cms-f09c59e5 @ `82fa95e2` (main, post-merge of PRs #133–#139). Phase G's PR #149 (`hotfix/package-status-timeline-event`) is **open, not yet merged** as of this audit draft — migration already applied live to prod regardless (per this workspace's standing "hotfix migrations apply directly, merge gate is separate" practice); update this SHA once #149 merges.
- Migrations applied to prod (Supabase project `yxkgdalkbrriasiyyrwk`) this session, in order:
  - `20260804010000_wire_documents_notes_into_timeline.sql` — superseded by the fix below; the trigger it created was retired same session.
  - `20260804020000_client_login_timeline_event.sql`
  - `20260804030000_tenant_message_timeline_event.sql` — includes the `client_timeline_events_source_check` stale-constraint fix.
  - `20260804040000_academy_activity_timeline_events.sql`
  - `20260804050000_stage_instance_status_timeline_event.sql`
  - `20260804060000_client_portal_page_view_tracking.sql` — new table `client_portal_page_views`, new RPC `rpc_log_page_view`, new function `fn_generate_portal_activity_digest`, new `pg_cron` job `portal-activity-digest-daily`.
  - `20260804070000_fix_notes_table_timeline_wiring.sql` — retires the dead `documents_notes` trigger, wires `public.notes` (the real table) instead, backfills last-90-days notes (793 rows / 69 tenants) after an unscoped first attempt (11,340 rows / 357 tenants) was rolled back.
  - `20260804080000_package_instance_status_timeline_event.sql` (Phase G, separate later session) — new trigger on `package_instances`, new event type `package_status_changed`.
- New/modified triggers on production tables: `public.notes` (real, per the fix — `documents_notes`'s trigger was retired same session, targeted a confirmed-dead table), `auth.users` (extended `handle_user_login`, not new), `tenant_messages`, `academy_enrollments`, `academy_lesson_progress`, `academy_certificates`, `stage_instances`, `package_instances` (Phase G).
- New RLS: `client_portal_page_views` (staff tenant-scoped SELECT only; all writes via SECURITY DEFINER RPC, no direct grant).

## Decisions
- All six event types confirmed internal-only except messages (client-visible, since clients already see their own messages in the messaging UI itself) — decided via `AskUserQuestion` before implementation began.
- Page-view tracking scoped to raw-fidelity capture + daily digest rather than per-page timeline rows, to avoid flooding the visible feed/RAG corpus while still satisfying "track every page view."

## Open questions parked
- Phase E scope: does "stage progression" refer to `stage_instances` (wired in) or `client_package_stage_state` (not wired in, no UI found driving it)? Flagged in PR #137, awaiting Carl's response.
- Whether any Microsoft-sync edge function code paths silently swallowed the now-fixed `source` CHECK constraint violation historically (Phase C finding) — worth a follow-up check for missing historical Microsoft-sourced timeline events.
- `src/integrations/supabase/types.ts` not regenerated for the Phase F table/RPC (impractical output size this session) — pick up on the next full type regen.
- `public.notes` titles/bodies contain raw HTML markup (e.g. `<p>testing note timeline</p>`) rendered as-is in the timeline card — cosmetic, not fixed this session.
- Only a 90-day window of `public.notes` was backfilled into the timeline; the remaining ~10,500 older rows (2014–the 90-day cutoff) stay unreflected unless a future session is asked to extend the window.
- Phase G not yet exercised end-to-end against a live cancel/hold/finalise/PackageDataManager-complete action — trigger confirmed present and enabled, but no real `package_status_changed` row has been observed yet. Do this before or as part of merging PR #149.
- Phase G's underlying trigger — the `v_client_governance_documents` view hiding all documents for a tenant with zero *active* package instances — is a separate, real bug (also affects Australian National Education College and Yarra College Australia per a live scope check) and remains unfixed. Flagged to Carl during the investigation; not actioned this session pending his decision on the fix approach.

## Tag
audit-2026-08-04-client-timeline-expansion

# Audit: 2026-09-15 — QA-persona flag, Team Leader/CET retirement, Nova multi-role fix

**Trigger:** direct continuation of the same-day System Account/picker-hygiene work (see
[2026-09-15-system-account-role-and-picker-hygiene.md](2026-09-15-system-account-role-and-picker-hygiene.md)) — Carl asked
whether test-persona accounts (`carl+csc@vivacity.com.au` etc.) could be hidden from staff pickers
while retaining full role permissions, which led into a wider RBAC v6 design discussion.
**Scope:** `public.users.kpi_pod`/`is_qa_persona`, `public.dd_unicorn_roles` (Team Leader, CET),
`public.user_roles` (Nova's supplemental CSC grant), every frontend query filtering staff pickers
by `kpi_pod`.

## Findings

- Investigating the "test persona" request required first confirming what RBAC v6 actually decided
  about main-role-vs-subtype. The plan's §13 truth-sync (baselined 2026-09-10, never executed) already
  says: CSC consultant/assistant share a baseline bundle with an optional seat-subtype breadth modifier;
  Integrator is the canonical operations profile and **Team Leader retires into Integrator**; Team
  Member stays migration-only; **CET retires outright (zero current holders)**; multiple approved
  profiles per person are allowed; and the v6 redesign still needs to add a real "seat subtype" concept.
  None of this had been executed in the schema/catalogue — only decided on paper.
- Carl's own example (Nova: an Integrator who also runs the CSC seat) exposed that a single planned
  concept was actually conflating three different things:
  1. **Multiple real roles held by one person** — already solved, live in production today, via
     `public.user_roles` (supplemental role grants) + `check_permission()`'s existing union logic
     (effective roles = primary `unicorn_role` ∪ active `user_roles` grants). Proven precedent: the
     `bulk-generate-automation@vivacity.com.au` account's separate "Bulk Generate Automation"
     supplemental role.
  2. **RBAC v6's future "seat subtype"** — a bounded capability modifier *within* a role (e.g. CSC
     assistant gaining approved AI-context breadth). Not yet built, not needed for either use case in
     this session — deliberately deferred.
  3. **QA/test-persona marking** — a pure visibility flag with zero permission effect, needed for
     `carl+csc@vivacity.com.au`-style test accounts. Distinct from (1) and (2), and from the existing
     `is_system_account` flag (which implies *no* real permissions — wrong for a QA persona that must
     keep its role's full permission set for realistic testing).
- The existing `kpi_pod` column was already informally doing job (3) via a `'qa'` sentinel value, but
  live query confirmed it has **only ever held `null` (622 rows) or `'qa'` (5 rows)** across the entire
  database — it was never used for its nominal purpose (real "KPI pod" team grouping), and even the
  live `kpi-v2` module only ever checks `!== 'qa'`. Formalized this into a dedicated boolean,
  `is_qa_persona`, rather than continuing to overload a legacy column with an unrelated meaning.
- Applying Nova's supplemental CSC role surfaced a separate, deliberately-deferred issue: Nova has
  **two accounts** — `nova@vivacity.com.au` (real) and `nova+csc@vivacity.com.au` (duplicate). The
  supplemental role was added to the real account only; the duplicate was left untouched per Carl's
  explicit instruction ("we will deal with the duplicate account separately later").
- Verification pass on this PR's own migrations caught a missing per-column grant: `is_qa_persona`
  was added without `GRANT SELECT (is_qa_persona) ON public.users TO authenticated` — the same gap
  class as the 2026-08-25 `is_system_account` incident
  ([2026-08-25-grant-authenticated-select-is-system-account.md](2026-08-25-grant-authenticated-select-is-system-account.md)).
  Every frontend `.eq('is_qa_persona', ...)` filter added in this PR would have 403'd for logged-in
  users until this was fixed.

## Code changes (this entry accompanies one)

- Migration `add_qa_persona_flag_and_role_retirements` (already applied via Supabase MCP, committed
  for repo history):
  - `public.users.is_qa_persona boolean NOT NULL DEFAULT false`, with a comment distinguishing it from
    `is_system_account` and the RBAC v6 "seat subtype" concept.
  - Backfills `is_qa_persona = true` for the 5 existing `kpi_pod = 'qa'` rows.
  - Inserts Nova's real account's supplemental `CSC` role into `user_roles`.
  - Sets `dd_unicorn_roles.is_active = false` for `Team Leader` and `CET`, both confirmed zero current
    holders via live query, with a description recording the retirement rationale.
  - `kpi_pod` is **deliberately not dropped** — the DB migration (MCP, immediate) and the frontend
    deploy (Vercel, only on PR merge) are not synchronized, so dropping it now would break any
    still-live old frontend code still querying it during that gap. Drop it as a safe follow-up only
    after this PR is confirmed live in production.
- Migration `migrate_staff_directory_fns_to_qa_persona` (already applied via Supabase MCP, committed
  for repo history): redefines `get_vivacity_team_directory()`, `get_vivacity_team_directory_staff()`,
  `seed_meeting_attendees_from_roles()` to check `is_qa_persona` instead of `kpi_pod`. Incidentally
  found and fixed `sync_l10_meeting_participants()`, which had **no** QA-persona exclusion at all
  before this change — a separate, previously-unknown gap.
- Migration `grant_authenticated_select_is_qa_persona`: adds the missing `authenticated` SELECT grant
  caught during this PR's own verification pass (see Findings above).
- Migrated all 17 frontend call sites off `kpi_pod`/`kpi_role` co-selects to `is_qa_persona`:
  `BulkReassignCscDialog.tsx`, `LiveMeetingView.tsx` (×2), `useFunctionTeamMembers.tsx` (×2),
  `TeamUsers.tsx`, `NewAuditModal.tsx`, `ClientMessagesTab.tsx`, `KpiTasksSection.tsx`,
  `RaiseTicketSheet.tsx`, `KpiTeamSection.tsx` (dropped a now-redundant client-side re-filter, since
  `get_vivacity_team_directory()` already excludes QA personas server-side), plus the 8 files patched
  earlier the same day in the System Account PR that still referenced `kpi_pod` alongside their
  `is_system_account` filter: `useTriageStaffOptions.ts`, `useTenantTeamUsers.tsx`,
  `StageNotesTab.tsx`, `useAccountabilityChart.tsx`, `useCalendarShares.tsx`, `useSeatSuccession.tsx`,
  `TenantNotes.tsx`, `ClientActionItemsTab.tsx`.
- Removed `CET` from active-role arrays: `VIVACITY_STAFF_ROLES` (`src/lib/roles/vivacityRoles.ts`),
  `ACADEMY_TENANT_ACCESS_ROLES` (`src/routes/dashboardRoutes.tsx`) — confirmed zero test/behavioral
  dependencies anywhere in the suite before removing.
  `Team Leader` is initially removed the same way, but reverted after `npm run test:frontend` caught a
  real regression: `src/test/eos/access-control.test.tsx`'s "should grant EOS access to Team Leader"
  failed, because `useRBAC`'s `is_vivacity_team`/`canAccessEOS()` logic is keyed directly off
  `isVivacityStaffRole()`/`VIVACITY_STAFF_ROLES` — removing Team Leader from that array silently
  changes real access-control behavior, not just a picker/dropdown list. `Team Leader` is kept in
  `VIVACITY_STAFF_ROLES`/`ACADEMY_BUILDER_ROLES`/`ACADEMY_TENANT_ACCESS_ROLES`/`VIVACITY_TEAM_ROLES`,
  matching `Team Member`'s existing backward-compat treatment (retired in `dd_unicorn_roles`, zero
  current holders, but still recognized for historical/backward-compat access checks). `Team Member`
  itself is unchanged from the earlier System Account PR's decision (5 disabled/archived legacy
  holders).
- Regenerated `is_qa_persona` into `src/integrations/supabase/types.ts` (Row/Insert/Update).

## Decisions

- Multi-role support (Nova's case) uses the **existing** `user_roles`/`check_permission()`
  infrastructure — no new mechanism was built or needed for it. This is live in production today,
  independent of RBAC v6's own future implementation timeline.
- The real RBAC v6 "seat subtype" (bounded capability modifier within a role) is **not** built in this
  session — confirmed not urgently needed for either the QA-persona or Nova use case, deliberately
  deferred to whenever RBAC v6 implementation reaches that packet.
- `is_qa_persona` was chosen as a plain boolean rather than a text "subtype" field specifically to avoid
  naming/conceptual collision with the real future seat-subtype mechanism.
- `kpi_pod` column: not dropped yet (deployment-ordering safety), tracked as a named follow-up.
- Nova's duplicate account (`nova+csc@vivacity.com.au`): explicitly parked, not touched.

## Verification

- Migration safety guardrail (`node scripts/audit-migrations.mjs --changed-only --base-ref
  origin/main`): 0 blocking after adding allowlist entries `add-qa-persona-flag-and-role-retirements`
  and `migrate-staff-directory-fns-to-qa-persona-function-bodies` (the latter a function-body false
  positive, same shape as prior entries in this file).
- `npm run typecheck` — clean (0 errors), after the `is_qa_persona` types.ts regeneration.
- `LINT_RATCHET_BASE=origin/main npm run lint:ratchet` — 0 regressions (20 files).
- `npm run test:frontend` — 580 passed / 43 skipped after the Team Leader revert (initial run had 2
  failures: the `access-control.test.tsx` real regression above, and a `parse-generated-types.test.ts`
  5s-timeout that reproduced as a pass in isolation (10.66s) — confirmed as environmental flakiness
  from 3 heavy verification jobs running concurrently on an 8GB dev box, not caused by this change).

## Open questions parked

- Dropping `kpi_pod` once this PR is confirmed live in production.
- Consolidating the remaining hand-rolled staff-picker query sites onto a centralized
  `useListableStaff()`-style hook (same recommendation as the System Account entry above) — not done
  here, still a real product-behavior question for narrower consumers like `useTriageStaffOptions`.
- Nova's duplicate account (`nova+csc@vivacity.com.au`) — Carl's call, separately.
- RBAC v6's real "seat subtype" mechanism — not yet built, tracked against the plan's §13/§7 items.

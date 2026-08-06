# Audit: 2026-05-15 — enum-to-dd Phase 4A (`staff_team_type`) and BUG-039 (stale `TEAM_LABELS` dictionary)

**Trigger:** Lovable production DB change session — first sub-phase of Phase 4 (the identity/role enum family) plus a follow-on UI bug surfaced during Phase 4A discovery. A separate medium-priority bug (BUG-038, `users.full_name` empty for 99.4% of users) was also logged during this session but is not yet fixed; it requires Angela/Carl approval before the backfill+trigger migration ships.
**Author:** Khian (Brian)
**Scope:** Phase 4A (`staff_team_type` → `dd_staff_team`), BUG-039 fix (frontend code edit only). Out of scope: BUG-038 (logged, not fixed); Phases 4B (`user_type_enum`), 4C (`tenant_user_role`), 4D (`unicorn_role`); the eventual Phase 4 cleanup migration (`ALTER TYPE ... SET SCHEMA archive` analogous to Phase 3E) — blocked by an open decision on `archive.backup_users.staff_team`.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### Phase 4A — `staff_team_type` → `dd_staff_team` (complete)

Full `enumtodd` skill run completed across all 8 phases. Carl confirmed full Phase 4 sign-off on 15 May 2026.

**Phase 4 organisation (decided 15 May 2026):** sub-phase order chosen by ascending coupling, evidenced by a live DB scan. `staff_team_type` is the lowest-coupling enum in the family — 0 SQL functions referencing the type, 0 RLS policies referencing it, 16 populated rows out of 502 (486 NULL).

**DB changes delivered (migration `20260515061851_a5088ac6-5b94-42ca-8416-887529cab639.sql`):**

- `public.dd_staff_team` created using the strict `dd_accounting_system` standard shape (no `updated_at` — variance from Phase 3 sub-phases which added that column; either form passes Dave Standard).
- Seeded with all 6 values byte-identical to enum labels: `none`/None/1, `business_growth`/Business Growth/2, `client_success`/Client Success/3, `client_experience`/Client Experience/4, `software_development`/Software Development/5, `leadership`/Leadership/6. `none` and `leadership` are defined-but-unused in production data; seeded for parity per skill safety rule.
- RLS enabled with public SELECT policy; writes restricted to service role (no INSERT/UPDATE/DELETE policy for authenticated). Matches Phase 3 sub-phase precedent.
- `public.users.staff_team` changed from `public.staff_team_type` enum to `text NULL` via `USING staff_team::text`. **Nullability preserved**; **no default added** (column had none). 486 NULL rows passed through untouched. FK does not validate NULL values per standard PostgreSQL semantics.
- FK `users_staff_team_fkey` added referencing `dd_staff_team(value)` with `ON UPDATE CASCADE ON DELETE RESTRICT`.
- Pre-flight `DO $$` block: asserted no non-NULL `staff_team` value missing from the seed; asserted `archive.backup_users.staff_team` is still typed as `public.staff_team_type`. RAISE EXCEPTION on either mismatch.
- Post-flight `DO $$` block: asserted total/non-null/null row count parity (502/16/486), column shape (`text`, nullable, no default), partial index `idx_users_staff_team` still present with same nullability-only predicate, `archive.backup_users.staff_team` untouched (still enum-typed), `dd_staff_team` has 6 rows.
- `COMMENT ON TYPE public.staff_team_type` retention notice added — **explicitly names `archive.backup_users.staff_team` as the dependency** that prevents this enum from being archived in the eventual Phase 4 cleanup migration. Notice references `EnumToDdInventory.md "Open Decisions"` for the resolution path.

**Discovery snapshot notable findings:**

- The enum has a non-trivial history: created 6 Jan 2026 with values `csc`/`csc_admin`/`growth`/`leadership`/`other`; hard reset 1 Feb 2026 by migration `20260201235130_4721ee1d-…` which NULL-ed all rows, dropped the type, and recreated it with the current 6 values. The 1 Feb migration also did `ALTER TABLE public.backup_users ALTER COLUMN staff_team TYPE staff_team_type_new USING NULL` against the snapshot table — which is why `archive.backup_users.staff_team` still uses the live enum type today.
- Two columns currently typed as `staff_team_type`: `public.users.staff_team` (live, 16/502 populated) and `archive.backup_users.staff_team` (snapshot, untouched by this migration). Future Phase 4 cleanup migration must decide what to do with the archive column before the enum can be moved to `archive` schema.
- One SQL function references the column: `public.admin_set_tenant_csc_assignment` (and its two prior revisions in migration history). All read the column into a `TEXT` variable and compare `= 'client_success'`. Works pre and post migration with no change required.
- One edge function references the column: `supabase/functions/update-user-role/index.ts` — destructures `staff_team` from request body (line 64), passes through to a `.update()` call (line 111). Its TS type literal at line 13 lists all 6 enum values including the unused `'none'` and `'leadership'`. **This was missed in the original Phase 1 finding** (Phase 1 stated "no edge function consumer"); Lovable's Prompt A audit caught it. Migration is safe because values stay byte-identical; the literal union was added to the do-not-touch list in Prompt B before SQL was generated.
- Partial index `idx_users_staff_team` predicate is nullability-only (`WHERE (staff_team IS NOT NULL)`) — PostgreSQL auto-rebuilt it during `ALTER COLUMN ... TYPE text` with no manual intervention.
- 16 staff users currently populated across 4 distinct teams: `business_growth` (7), `client_success` (5), `client_experience` (2), `software_development` (2). Most recent assignment was 11 May 2026 — feature actively in use.

**Codebase changes:**

- TypeScript types regenerated. `users.staff_team` row-type flips from `Enums['staff_team_type'] | null` to `string | null`. Legacy `Enums.staff_team_type` union remains present in `types.ts` (retention pattern — will disappear at the eventual Phase 4 cleanup migration). My local regeneration via Supabase MCP produced byte-identical output to Lovable's commit (empty diff).
- No app code changes required. Hand-written TEAM_OPTIONS list in `AdminActions.tsx:61-65`, hand-written label dictionary in `TeamUsers.tsx:520-524`, `=== 'client_success'` comparisons in `useMembershipDashboard.tsx`/`ManageTenants.tsx`, and the `update-user-role` edge function all continue working byte-identically.

**Post-deploy verification:** All 4 read-only checks passed (lookup table seeded, column shape, FK constraint, retention comment). Row-count parity and `archive.backup_users.staff_team` untouched-check also passed via the migration's own embedded post-flight block (which would have raised if any drift occurred).

### BUG-039 — `UserProfileCard` team badge never renders (resolved)

**Discovered:** During Lovable's Prompt A audit for Phase 4A — flagged that `src/components/UserProfileCard.tsx` lines 8-14 use the January 2026 enum values (`csc`, `csc_admin`, `growth`, `leadership`, `other`) as `TEAM_LABELS` dictionary keys. The 1 February 2026 enum reset replaced those values with the current 6; the two sibling label dictionaries (`AdminActions.tsx`, `TeamUsers.tsx`) were updated then, but this one was missed. Only `leadership` overlapped between old and new — and no user has `staff_team = 'leadership'` in production.

**Code change delivered (commit `097d5b55`, post-pull verified):**

- `TEAM_LABELS` dictionary in `UserProfileCard.tsx:8-14` replaced with the 5 current value keys: `business_growth` (purple), `client_success` (emerald), `client_experience` (cyan), `software_development` (blue/"Software Dev"), `leadership` (amber). Tailwind colour pattern preserved (`bg-{c}-500/10 text-{c}-700 border-{c}-200`).
- Legacy keys (`csc`, `csc_admin`, `growth`, `other`) removed.
- `'none'` deliberately NOT added — keeps the `user.staff_team && TEAM_LABELS[user.staff_team] && ...` conditional short-circuiting silently for that value (no badge for `'none'`).
- Conditional render at lines 73-77 unchanged.

**Important finding surfaced during resolution:** `UserProfileCard` is **orphaned in the codebase** — defined but **never imported by any page or component** (verified via codebase grep across `src/` and `supabase/`). The only other reference is in `.lovable/plan.md`, which is Lovable's working file, not actual usage. The original "badge never renders" symptom was real, but the deeper reason was that the whole component is dead code, not just that the dictionary keys were wrong.

**Decision:** Keep the fix shipped. It readies the component for future wire-up (e.g. an admin user-grid feature that hasn't been built yet) — when someone imports it later, the team badge will work correctly without re-discovery of the stale keys. The other team-label surfaces (`AdminActions.tsx`, `TeamUsers.tsx`, `ProfileHeader.tsx`) already render staff team labels correctly today.

### BUG-038 — `users.full_name` empty for 99.4% of users (logged, not fixed)

**Discovered:** During Phase 4A discovery — when querying the 16 Vivacity staff users with `staff_team` populated, 14 of 16 had `NULL` `full_name`. Broadened to a live scan: **499 of 502 users have `full_name = NULL`**, while `first_name` and `last_name` are `NOT NULL` and populated for 100% of users.

**Why this is real:** `full_name` is read by 36 occurrences across 15 files in `src/` for display purposes (calendar shares, certificates, governance delivery history, profile forms, impersonation banner, academy dashboard). Most surfaces likely fall back to `first_name`/`last_name` or email, but the canonical "preferred display name" field is empty for almost everyone. The 3 populated rows have richer names than `first_name + ' ' + last_name` would produce (Carl: `Carl Matheous Simpao`; Khian: `Khian Brian Orcullo Sismundo`), confirming the column is intentionally a "preferred display name override" — but with no backfill and no sync trigger, it's empty by default for everyone who hasn't been manually set.

**Side data-quality finding:** `beverly@vivacity.com.au` has `first_name = 'Beverly '` (trailing whitespace). Single-row issue; can be folded into the BUG-038 fix via `TRIM()` in the backfill UPDATE.

**Status:** Logged as BUG-038 in `BugOrganisation.md` with proposed fix (backfill `full_name = TRIM(first_name) || ' ' || TRIM(last_name) WHERE full_name IS NULL` + sync trigger `BEFORE INSERT OR UPDATE` that only auto-populates when `full_name IS NULL OR ''`, preserving manual overrides). **Not fixed in this session — requires Angela/Carl approval** before the database migration ships. Priority MEDIUM. Cosmetic in most surfaces (fallback exists in component code) but worth fixing because (a) 99.4% data-completeness gap looks bad in any reporting, (b) any new component that forgets the fallback would render empty names, (c) governance/audit/certificate surfaces are client-facing.

### Phase 1A-C — `invite_status` skipped (decision recorded)

Decided 15 May 2026 not to migrate `invite_status` (4 values: `INVITED`, `ACCEPTED`, `REVOKED`, `EXPIRED`). Stable values, no active table-column usage, no operational benefit. `EnumToDdInventory.md` was previously contradictory ("skipped" in one place, "not started" in another); reconciled to `skipped` in both Suggested Migration Phases and Phase Target Summary. Enum may be considered for `archive`-schema move later if/when other unused enums are cleaned up as a group, but no current action.

### Open Decisions added to inventory

Added new Open Decision for the Phase 4 cleanup migration: `archive.backup_users.staff_team` blocks the eventual `ALTER TYPE public.staff_team_type SET SCHEMA archive`. Three resolution options recorded: (a) convert backup column to text too, (b) drop `archive.backup_users` (4 months old at this point), (c) leave the legacy enum in `public` indefinitely. Decision owner: Carl, when Phase 4 cleanup is planned. The retention COMMENT on `public.staff_team_type` (set during Phase 4A) names this dependency so any future enum-archive scan surfaces it automatically.

---

## KB changes shipped

- `EnumToDdInventory.md` updated (workspace root, not unicorn-kb subrepo):
  - `staff_team_type` row in Enum Inventory: `Yes` → `Converted`, status → `implemented — 15 May 2026`, notes include FK target + retention reason.
  - Phase 4 row in Suggested Migration Phases: `not started` → `in progress`, 4A marked implemented, TS regen status recorded.
  - Phase 4A row in Phase Target Summary: `not started` → `implemented — 15 May 2026` with full implementation detail including pre/post-flight assertions, archive-column-untouched check, edge-function note, BUG-038/BUG-039 cross-references, migration filename.
  - Phase 1A-C row reconciled: status → `skipped`, target → `n/a — skipped`, decision date recorded.
  - Open Decisions: new entry for `archive.backup_users.staff_team` Phase 4 cleanup blocker (3 resolution options + decision owner).
- `BugOrganisation.md` updated:
  - BUG-039 cluster header changed to ✅ RESOLVED (15 May 2026); resolution paragraph added with commit SHA; orphaned-component finding documented.
  - BUG-039 summary table row changed to ✅ Resolved / DONE.
  - BUG-038 cluster added (MEDIUM PRIORITY, awaiting Angela/Carl approval); summary table row added.

> Note: `EnumToDdInventory.md` and `BugOrganisation.md` both live in the workspace root (`c:\Users\brian\unicornworkspace\`), not in `unicorn-kb/`. No SHA in `unicorn-kb` to record.

---

## Codebase observations (read-only)

- unicorn @ `097d5b55` (HEAD of `main` post BUG-039 fix): Phase 4A migration present (`supabase/migrations/20260515061851_a5088ac6-5b94-42ca-8416-887529cab639.sql`); `UserProfileCard.tsx` lines 8-14 updated to current `staff_team_type` values; `src/integrations/supabase/types.ts` regenerated with `dd_staff_team` table type and FK relationship registered on `users.staff_team`.
- Codebase grep confirms `UserProfileCard` is orphaned — no imports anywhere in `src/` or `supabase/`.
- The hand-written team-label dictionaries in `AdminActions.tsx:61-65` and `TeamUsers.tsx:520-524` were left untouched per Phase 4A do-not-touch list. Future cleanup could replace all three (including the now-correct `UserProfileCard` one) with a hook reading from `dd_staff_team` — separate enhancement, out of scope.

---

## Decisions

- **Phase 4 sub-phase order locked by coupling, not by feature priority.** Lowest-coupling enum first (`staff_team_type`), heaviest-coupling enum last (`unicorn_role`, with 56 SQL functions and 87 RLS policies). Rationale: build pattern confidence on the smallest blast radius before tackling 4D, which will likely need a multi-stage rollout rather than a single migration.
- **Strict `dd_accounting_system` shape used for `dd_staff_team`** (no `updated_at` column or trigger). Variance from Phase 3 sub-phases which added that column. Both forms pass Dave Standard #1; either is acceptable. Going strict for Phase 4A — Phase 3 sub-phases can stand as-is.
- **BUG-039 fix kept despite orphaned-component finding.** Cost is zero; future wire-up gets correct behaviour for free.
- **BUG-038 NOT fixed in this session.** Requires Angela/Carl approval — the migration touches every user row, adds a trigger, and embeds a TRIM-based normalisation that has side-effects on display names. Risk of unintended changes if rolled into Phase 4A's session.
- **Phase 1A-C `invite_status` formally skipped.** No further action; inventory file reconciled.
- **Open Decision for Phase 4 cleanup `archive.backup_users.staff_team` dependency**: deferred until Phase 4D ships and the team is ready to retire the four Phase 4 legacy enums together. No calendar date.

---

## Follow-on items

- **BUG-038** (`users.full_name` empty for 99.4% of users): waiting on Angela/Carl approval. Once cleared, write a single migration: backfill `UPDATE users SET full_name = TRIM(first_name) || ' ' || TRIM(last_name) WHERE full_name IS NULL`, then add `BEFORE INSERT OR UPDATE` trigger that sets `full_name` only when it's NULL or empty (preserves the 3 manual overrides). Logged with detailed proposal in `BugOrganisation.md`.
- **Phase 4B `user_type_enum`**: ready to start. Moderate coupling (4 SQL functions + 4 RLS policies referencing the enum type; 502 rows; 3 of 6 values in use). First Phase 4 sub-phase with mixed-case + space-containing values (`'Client Parent'`, `'Vivacity Team'`) — first test of FK validation against non-snake-case values.
- **Phase 4C `tenant_user_role`**: cross-table migration (`tenant_users.relationship_role` + `user_invitations.relationship_role`). Target name `dd_relationship_role` locked by Decisions Approved #2 (13 May 2026).
- **Phase 4D `unicorn_role`**: heaviest-coupling enum in the entire project (56 SQL functions + 87 RLS policies). Requires its own multi-stage rollout plan, not single-migration. Phase 0 of 4D should propose: shadow column? gradual policy rewrite? feature-flag rollout? — decide before Phase 6.
- **Phase 4 cleanup migration** (analogous to Phase 3E): blocked by `archive.backup_users.staff_team` dependency. Surface for Carl when 4D is complete and the team is ready.
- **Permanent DROP of archived Phase 3 enums** (the four notification family enums archived 15 May 2026): no action yet; revisit in 30 days (15 June 2026) or earlier if Phase 4 cleanup begins.
- **`UserProfileCard` orphan**: if the team plans an admin user-grid view, this is a ready-to-wire component. If not, consider deleting it or moving to `archive`-prefixed file in a future hygiene pass.

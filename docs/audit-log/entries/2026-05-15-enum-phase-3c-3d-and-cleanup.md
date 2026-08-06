# Audit: 2026-05-15 — enum-to-dd Phase 3C, Phase 3D, and Phase 3E cleanup (notification family complete)

**Trigger:** Lovable production DB change session — final three migrations of the notification-family enum-to-`dd_` rollout (Phase 3C `notification_delivery_target`, Phase 3D `notification_integration_status`, plus a Phase 3E cleanup that archived all four notification legacy enums to the `archive` schema).
**Author:** Khian (Brian)
**Scope:** Phase 3C, Phase 3D, and Phase 3E cleanup. Out of scope: Phase 1A-C (`invite_status` — still not started); Phase 4 (`tenant_user_role`, `unicorn_role`, `user_type_enum`, `staff_team_type` — blocked pending Carl + Dave sign-off); Phase 5 (broad workflow/EOS enums). BUG-036 (notification outbox cron) and BUG-037 (audit email cron) — already covered in the previous audit on this date.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### Phase 3C — `notification_delivery_target` → `dd_notification_delivery_target` (complete)

Full `enumtodd` skill run completed across all 8 phases. Carl + Dave sign-off confirmed before Phase 7.

**DB changes delivered (migration `20260515034325_5f016a59-f0ac-4bdb-bf5a-e0bc48f7dcaa.sql`):**

- `public.dd_notification_delivery_target` created using the `dd_accounting_system` standard shape.
- Seeded with both values byte-identical to enum labels: `dm` / Direct Message, `channel` / Channel.
- RLS enabled with public `SELECT` policy; writes restricted to service role (no INSERT/UPDATE/DELETE policy for authenticated).
- `notification_rules.delivery_target` changed from `public.notification_delivery_target` enum to `text NOT NULL` via `USING delivery_target::text`. Default reset to `'dm'::text`.
- FK `notification_rules_delivery_target_fkey` added referencing `dd_notification_delivery_target(value)` with `ON UPDATE CASCADE ON DELETE RESTRICT`.
- Pre-flight check asserting no `notification_rules` row had a `delivery_target` value missing from the new lookup. Post-flight check asserting row-count parity and value validity. Migration embeds both safety blocks via `DO $$ ... $$` with `set_config('phase3c.notification_rules_before', ...)`.
- `COMMENT ON TYPE public.notification_delivery_target` retention notice: do not drop until Phase 3D complete. Legacy enum retained for rollback safety.

**Discovery snapshot results:**

- `notification_rules` had **0 rows** at migration time. Zero backfill risk.
- No SQL function, trigger, view, or RLS policy referenced the enum or its values.
- 3 RLS policies on `notification_rules` filter on `user_uuid` and `is_vivacity_team_user()` — none touched.

**Codebase changes:**

- TypeScript types regenerated. `notification_rules.delivery_target` flips to `string` in `Database["public"]["Tables"]`; legacy `notification_delivery_target: "dm" | "channel"` retained in `Enums` block (expected until Phase 3E archive).
- No app code changes required. `useTeamsNotifications.tsx:18` keeps its hand-written `DeliveryTarget = 'dm' | 'channel'` union (intentional — confirmed in Phase 4 do-not-touch list). Edge function `process-notification-outbox/index.ts:31` already typed `delivery_target: string`; no enum dependency.

**Post-deploy verification:** All 4 read-only checks passed.

### Phase 3D — `notification_integration_status` → `dd_notification_integration_status` (complete)

Full `enumtodd` skill run completed across all 8 phases. Carl + Dave sign-off confirmed before Phase 7.

**DB changes delivered (migration `20260515042352_5f907b4f-2618-4028-9955-7048d48b9b88.sql`):**

- `public.dd_notification_integration_status` created using the `dd_accounting_system` standard shape.
- Seeded with all 3 values byte-identical to enum labels: `connected` / Connected, `disconnected` / Disconnected, `error` / Error.
- RLS enabled with public `SELECT` policy; service-role writes only.
- `user_notification_integrations.status` changed from `public.notification_integration_status` enum to `text NOT NULL` via `USING status::text`. Default reset to `'disconnected'::text`.
- FK `user_notification_integrations_status_fkey` added referencing `dd_notification_integration_status(value)` with `ON UPDATE CASCADE ON DELETE RESTRICT`.
- Pre-flight + post-flight safety blocks via `set_config('phase3d.row_count_before', ...)`. Asserts row-count parity, value validity, and pre-flight coverage check.
- `COMMENT ON TYPE public.notification_integration_status` retention notice: "Final notification-family enum in the conversion chain. Eligible for archival cleanup once Phase 3D verified in production."

**Discovery snapshot results:**

- `user_notification_integrations` had **0 rows** at migration time. The Teams integration feature is wired up but has no live users yet.
- 3 enum consumers identified in codebase:
  - `useTeamsNotifications.tsx:36` — hand-written union (string-literal, unaffected by enum changes).
  - `useTeamsNotifications.tsx:148, 186` — writes `'connected'` / `'disconnected'`.
  - `TeamsIntegrationCard.tsx:31` — `=== 'connected'` comparison.
- **One late-discovery finding by Lovable's audit (not in the Phase 4 blast radius):** `process-notification-outbox/index.ts:240` does `.eq('status', 'connected')` — an active value comparison at the edge function. My Phase 4 had described this as "reads the row, never reads `.status` field" which was wrong. It filters integrations by `status = 'connected'` before sending notifications. The migration is still safe because `'connected'` stays byte-identical; the filter continues working. Risk label was not upgraded — but the implementation plan (Prompt B) was edited to correctly describe this consumer before sending Prompt C to Lovable.
- Cross-referenced with Outlook calendar sync (`useOutlookConnectionStatus.tsx` — `connection_status` with `'expired'`) and TGA (`tga_status`) — both confirmed as unrelated different domains.
- `'error'` value preserved in seed for parity. Never written by any app or edge code today. Reserved for future failure-state writers (e.g. background reconciliation jobs).

**Codebase changes:**

- TypeScript types regenerated. `user_notification_integrations.status` flips to `string`. Legacy `notification_integration_status: "connected" | "disconnected" | "error"` retained in `Enums` block (until Phase 3E).
- No app code changes required.

**Post-deploy verification:** All 4 read-only checks passed.

### Phase 3E — Legacy notification enum archival (cleanup, complete)

After Phase 3D completed, ran a comprehensive safety scan to verify the four legacy notification enums were genuinely orphaned in the database. Cleanup approved on the strength of the scan and applied in a single migration.

**Safety scan results (all empty — confirming orphaned status):**

- 0 columns in any schema still typed as any of the 4 enums.
- 0 SQL functions referencing the enum names (body, args, return).
- 0 views referencing them.
- 0 RLS policies referencing them.
- 0 triggers referencing them.
- 0 `pg_depend` non-implicit dependents.
- All 4 enum types confirmed still present in `public`. `archive` schema exists; no name collisions there.

**DB changes delivered (migration `20260515044354_224f389e-2911-4d81-bb86-86bb384ed08b.sql`):**

- Pre-flight `DO $$` block: scans all schemas for any column still typed as any of the 4 legacy enums. `RAISE EXCEPTION` if any found.
- Four `ALTER TYPE public.<enum> SET SCHEMA archive` statements moving:
  - `notification_event_type` → `archive.notification_event_type`
  - `notification_status` → `archive.notification_status`
  - `notification_delivery_target` → `archive.notification_delivery_target`
  - `notification_integration_status` → `archive.notification_integration_status`
- Retention `COMMENT ON TYPE` on each archived enum naming its `dd_` superseder and stating "Permanent DROP requires Carl/Dave sign-off after a documented stable period in production."
- Post-flight `DO $$` block: verified 4 enums in `archive` and 0 in `public`; `dd_` row counts intact (`dd_notification_event` ≥ 10, `dd_notification_status` = 4, `dd_notification_delivery_target` = 2, `dd_notification_integration_status` = 3); all 6 `dd_`-backed columns still `text NOT NULL`; ≥ 6 FKs to `dd_` lookups intact.
- Rollback path documented in trailing comment block (`ALTER TYPE archive.<x> SET SCHEMA public` for each).

**Final TypeScript regeneration (Phase 3 complete):**

- All four legacy enum unions removed from `Database["public"]["Enums"]` because the Supabase type generator only reads `public` schema. Confirmed via grep — 0 matches for `notification_event_type|notification_status|notification_delivery_target|notification_integration_status` in the regenerated `types.ts` `Enums` block.
- `dd_` lookup tables and their FK relationships present and correctly typed.
- Hand-written `DeliveryTarget = 'dm' | 'channel'` union in `useTeamsNotifications.tsx` unaffected — it's a string-literal local type, not a derived type. Same for the `'connected' | 'disconnected' | 'error'` union at line 36.
- My local regeneration produced byte-identical output to Lovable's commit (empty diff). Confirms the generator is deterministic and Lovable's CI regeneration ran correctly.

**Post-deploy verification:** All 5 checks passed.

Per project decision #7 (Carl, 13 May 2026), dead objects moved to `archive` schema, not dropped directly. Permanent `DROP TYPE` deferred until a documented stable period in production has elapsed and Carl/Dave sign off.

### Phase 3 — overall state (notification family complete)

| Phase | Enum | Migration | Status |
|---|---|---|---|
| 3A | `notification_event_type` | 14 May | implemented → archived (3E) |
| 3B | `notification_status` | 15 May | implemented → archived (3E) |
| 3C | `notification_delivery_target` | 15 May | implemented → archived (3E) |
| 3D | `notification_integration_status` | 15 May | implemented → archived (3E) |
| 3E | All four — cleanup | 15 May | archived to `archive` schema |

Final TypeScript regeneration completed after Phase 3E. Phase 3 is **done**. All four notification-family enums now backed by `dd_` lookup tables with FK validation; legacy types retained in `archive` for rollback safety with named-approver retention comments.

---

## KB changes shipped

- unicorn-kb @ `<pending — see follow-up>`: `EnumToDdInventory.md` updated to reflect Phase 3C, 3D, and 3E status. All four notification enum inventory rows now show `Converted` / `implemented — archived`. Phase 3 row in Suggested Migration Phases updated to `done` with full cleanup detail. Phase 3D and new Phase 3E rows added to the Phase Target Summary table with full implementation detail, post-deploy results, and the edge-function reader callout for 3D.

> Note: `EnumToDdInventory.md` lives in the workspace root (`c:\Users\brian\unicornworkspace\EnumToDdInventory.md`), not in `unicorn-kb/` directly. The file was edited in-place; no SHA in `unicorn-kb` to record. If the team later decides this file should live under `unicorn-kb/`, it can move with a separate KB PR.

---

## Codebase observations (read-only)

- unicorn @ `d240b112` (HEAD of `main` post Phase 3E): all four notification enum migrations and the cleanup migration present in `supabase/migrations/`. `src/integrations/supabase/types.ts` regenerated (29-line diff in Lovable's Phase 3E commit removing the four legacy enum unions; final `dd_` relationships intact).
- Migration filenames (in order):
  - Phase 3C: `20260515034325_5f016a59-f0ac-4bdb-bf5a-e0bc48f7dcaa.sql`
  - Phase 3D: `20260515042352_5f907b4f-2618-4028-9955-7048d48b9b88.sql`
  - Phase 3E: `20260515044354_224f389e-2911-4d81-bb86-86bb384ed08b.sql`
- No app code changes required across all three phases. Hand-written string-literal unions in `useTeamsNotifications.tsx` (lines 18 and 36) intentionally retained per do-not-touch lists.

---

## Decisions

- **Phase 3E timing:** opted to run the cleanup the same day as Phase 3D rather than waiting a documented stable period. Justified by: (a) 0-row state in both 3C and 3D target columns making downside risk near-zero, (b) the safety scan confirmed orphan status across 6 dependency vectors, (c) archival (vs DROP) preserves rollback path indefinitely. Permanent DROP is still gated on a stable production period.
- **`'error'` value preservation in `dd_notification_integration_status`:** kept in seed despite being unused by any app or edge code. Reserved for future failure-state writers. Removing it would have been a value rename, which is a separate high-risk migration class per `enumtodd` skill rules.
- **No changes to `useTeamsNotifications.tsx` hand-written unions:** explicit do-not-touch list item in both Prompt B (Phase 3D) and the audit's running notes. Hand-written unions are app-side validation and intentionally independent from the generated enum types — coupling them would tie the hook's correctness to `types.ts` regeneration timing.
- **Edge function consumer found late (Phase 3D):** the `.eq('status', 'connected')` filter at `process-notification-outbox/index.ts:240` was missed by my initial Phase 4 blast radius scan and caught by Lovable's Prompt A audit. Risk label was not upgraded because the value stayed byte-identical, but Prompt B was edited to correctly describe the consumer before SQL generation. Future audits of integration-style enums should grep for `.eq('column_name', '<value>')` patterns explicitly, not just direct property access.

---

## Follow-on items

- **Phase 1A-C — `invite_status`:** still `not started` in the inventory. Access/invite-adjacent name; requires extra sign-off before removal even if enum objects appear unused.
- **Phase 4 — relationship/user role enums** (`tenant_user_role`, `unicorn_role`, `user_type_enum`, `staff_team_type`): blocked pending Carl + Dave sign-off. Highest-risk remaining phase. Deeply coupled across edge functions, RPC/migrations, and access logic.
- **Phase 5 — broad workflow/EOS enums** (`eos_issue_status`, `eos_meeting_type`, `meeting_status`, `eos_todo_status`, EOS role/segment/function types): not started; requires workflow-level staged plan.
- **Permanent DROP of archived notification enums:** deferred until a documented stable period has elapsed. No calendar set; will be triggered by Carl/Dave decision when confident no rollback is needed. Recommend revisiting in 30 days (15 June 2026) or earlier if Phase 4 begins (since Phase 4 will increase total archived-enum surface area and bundling DROP decisions may make sense).

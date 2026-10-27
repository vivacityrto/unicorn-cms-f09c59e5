# Audit: 2026-10-27 — GitHub task sync for Rock milestones

**Trigger:** ad-hoc (Carl's request to sync GitHub/Teams task state to Unicorn milestones; policy option 2 chosen 2026-10-27)
**Scope:** two new tables, two `SECURITY DEFINER` functions and one new Edge Function (`rock-task-sync`), plus a read-only display of linked tasks in the Rock details panel. Target: `1. Unicorn 2.0-dev` (`yxkgdalkbrriasiyyrwk`). **The migration has not been applied to any project, and no event has been received.** Read-only preflight against production was limited to Rock and milestone counts and schema inspection.

## Findings
- GitHub `[task]` issues in `ComplyHub-ai/rto-compass-hub` already carry `Linked: Unicorn milestone UUID …` (crosswalk: `docs/kb/reference/authorization-rbac-assurance/unicorn-rock-task-crosswalk.md` in that repository). Unicorn had no table holding that link, no way to attribute a status change to an automation, and no delivery log. 559 existing milestone events have a null actor, so null cannot be read as "automation".
- The ComplyHub task workflow already publishes a signed-ready event (schemaVersion 1, `projectionKey`, `updatedAt` revision) to a Planner bridge. Reusing that payload avoids a second contract. That bridge is deliberately one-way; GitHub is authoritative.
- Production (tenant 6372) at preflight: the Company Rock has 20 milestones, all `not_started`; the three Individual Rocks have 39 milestone rows, one complete.
- A milestone can have several tasks (decomposed work shares one milestone UUID), so progress has to be evaluated across all linked tasks.
- The existing `update_updated_at_column` trigger uses `NOW()`, which is constant inside one transaction. The "nobody has edited since" check therefore works across separate requests (the real case) but cannot be demonstrated inside a single dry-run transaction without simulating the later edit.

## KB changes shipped
- `docs/kb/codebase-state/rock-task-sync.md`: policy, data model, receiver contract, proposed ComplyHub-side publisher, rollout order.

## Code changes
- `supabase/migrations/20261027130000_rock_task_sync.sql` (additive; no existing object changed): `eos_rock_milestone_task_links` (RLS; select like milestones, no client writes), `eos_task_sync_events` (RLS, service-role only), `recompute_rock_milestone_from_tasks()` and `apply_rock_task_sync_event()` (`SECURITY DEFINER`, `search_path = ''`, execute revoked from `PUBLIC`, `anon`, `authenticated`, granted to `service_role`).
- `supabase/functions/rock-task-sync/index.ts`: fail-closed HMAC receiver (`X-Signature-256`, constant-time compare, 64 KB cap), registered `verify_jwt = false` with the documented `auth-gate: none` opt-out. Calls the RPC with an expected tenant (default 6372) and a repository allowlist.
- `supabase/functions/_shared/webhook-signature.ts`: adds `verifyHmacSha256Hex` (requires the `sha256=` prefix). `_shared/rock-task-sync-payload.ts`: pure payload parser.
- `src/components/eos/rocks/RockDetailSheet.tsx`, `src/utils/rockMilestoneTasks.ts`: linked tasks per milestone, blocked count, derived "Ready for review"; tolerant of the table not existing yet. `src/integrations/supabase/types.ts`: hand-added entries for the new tables and functions, to be replaced by regeneration after the migration is applied.
- `supabase/migration-safety-allowlist.json`: entry `rock-task-sync`, expiring 2026-11-27. All 8 findings are statements inside the two function bodies; the migration writes no rows when applied.

## Verification
- `unicorn-qa`, one rolled-back transaction (migration plus a throwaway Rock and two milestones; nothing left behind, confirmed afterwards): backlog task changes nothing; in-progress task → `in_progress`; repeated event → `duplicate`; older revision → `stale`, link unchanged; open blocked task → `blocked`; task unblocked → released; a sync-set block is released, a block a later edit touched is kept (simulated by moving the recorded timestamp, see Findings); a block restores the prior status when only backlog tasks remain; all tasks closed → status unchanged with `ready_for_review = true`; `complete` milestone untouched; unknown milestone and wrong tenant → `rejected`; closed task only → `in_progress`; re-pointed task updates its link. `authenticated` cannot execute the function; `anon` cannot read the links.
- Frontend, Edge and migration-audit checks: see the PR.

## Decisions
- Option 2 (Carl, 2026-10-27): tasks move a milestone to `in_progress` or `blocked`; when every task is closed the milestone is flagged ready for review and a person marks it complete in Unicorn.
- One-way GitHub → Unicorn. Teams/Planner reaches Unicorn only through GitHub.
- "Ready for review" is derived from the links, not stored, so it cannot drift.
- Sync-made changes are attributed through `eos_task_sync_events`; the existing milestone audit trigger is not modified.
- No GitHub-login → user mapping yet; assignees are stored as logins.

## Deployment
- Not deployed. The Edge Function deploys on merge to `main` (CI) but returns 500 to every request until `ROCK_TASK_SYNC_SECRET` is set. The migration needs Carl's explicit approval and is applied through the Supabase MCP: `unicorn-qa` first, then production.

## Open questions parked
- Owner and timing of the ComplyHub-side publisher and its two repository secrets.
- Whether to backfill the 40 existing task issues once the receiver is live.
- Cross-organisation data flow: task titles and states from `ComplyHub-ai` into Vivacity's Unicorn project. Carl to confirm this is intended.

# Audit: 2026-05-14 — Deployment checklist closure

**Trigger:** Final reconciliation of the 12 May 2026 deployment status checklist (`audit-2026-05-12-deployment-status`). All actionable items reviewed against live DB state.
**Author:** Carl
**Scope:** Supabase project `yxkgdalkbrriasiyyrwk`. One DB change shipped (avatars policy cleanup). All other items closed via prior sessions or confirmed deferred.

---

## Background

The 12 May deployment status audit listed 20+ open items across P0, P1, bugs, tickets, and new issues. This session reconciles final status against all subsequent audit sessions (13–14 May) and closes the two remaining actionable items.

---

## Final checklist status

### Closed in prior sessions

| Ref | Closed by |
|---|---|
| P0-b — canonical audit ledger | `v_workspace_audit_log` (21 branches) + Phase 3 triggers — 14 May |
| P1-a — EOS overlapping SELECT policies | `p1a-eos-select-policy-dedup` — 13 May |
| P1-b — bare `auth.uid()` in RLS (428 policies) | `p1b-rls-auth-uid-subquery` — 13 May |
| P1-c — consult_* tables not hardened | Confirmed already clean — 14 May |
| P1-e — mutable search_path (28 functions) | `p1e-mutable-search-path` — 12 May |
| BUG-001 — bulk-send-invitations primary_contact lookup | `contact-role-canonicalisation` — 12 May |
| BUG-004 — canAccessClientPortal non-contact full-scope | `contact-role-canonicalisation` — 12 May |
| BUG-005 — accept-invitation access_scope mapping | `bug-005-accept-invitation-access-scope` — 13 May |
| TICKET-003 — enrol_as_impersonator tenant match | `ticket-003-enrol-as-impersonator-tenant-match` — 13 May |
| TICKET-007 — acting-user picker auth gate | `ticket-007-acting-user-picker-auth-gate` — 12 May |
| TICKET-008 — RPC error UX | `ticket-008-rpc-error-ux` — 13 May |
| trg_sync_primary_contact — rekeyed on relationship_role | `contact-role-canonicalisation` — 12 May |
| NEW-001 — pdp_cycles direct auth.uid() | Covered by P1-b — 13 May |
| NEW-002 — pdp_cycles tenant admin boolean | `new-002-pdp-cycles-tenant-admin-relationship-role` — 13 May |
| NEW-004 — search_path regression +4 | Covered by P1-e — 12 May |
| NEW-006 — audit_user_events no tenant_id | `new-006-audit-user-events-tenant-id` — 13 May |

### Closed this session

| Ref | Item | Action |
|---|---|---|
| P1-d / NEW-005 | Avatars bucket — 9 overlapping SELECT/write policies | Dropped 8 redundant policies; 4 canonical keepers remain (one per cmd) |

### Deferred — outside scope

| Ref | Item | Reason |
|---|---|---|
| P1-f | No staging environment | Infrastructure decision — not a Lovable/DB item |
| P1-g | Postgres security patches | Supabase-managed — not actionable from this session |
| NEW-003 | generated-docs write path unverified | Bucket has 0 objects; PDP export feature not yet live. Revisit when feature ships |

---

## DB changes shipped

### Migration — avatars policy cleanup

Dropped 8 redundant `storage.objects` policies for the `avatars` bucket:
`Avatars: own avatar list`, `Avatars: super admin list`, `Super Admins can upload any avatar`, `Super Admins can update any avatar`, `Super Admins can delete any avatar`, `Users can upload their own avatar`, `Users can update their own avatar`, `Users can delete their own avatar`.

Kept 4 canonical policies: `Avatar select policy` (broad public read — intentional), `Avatar insert policy`, `Avatar update policy`, `Avatar delete policy`.

Rationale: `Avatar select policy` has no user filter — avatars are public-readable by design. The scoped SELECT policies (`own avatar list`, `super admin list`) could never fire as the broad permissive policy always granted first. The INSERT/UPDATE/DELETE duplicates were covered by the combined `own folder OR super_admin` canonical policies.

**Verification:** `SELECT policyname, cmd FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND (qual LIKE '%avatars%' OR with_check LIKE '%avatars%')` → 4 rows ✅

---

## KB changes shipped

None.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ a171ca97`: No codebase changes. All changes are storage policy layer only.

---

## Decisions

- **NEW-003 deferred**: No write policy exists for `generated-docs` and the bucket is empty (0 objects). Service-role writes are the standard Supabase pattern for edge functions. No fix required until the PDP export feature ships and a write path is confirmed.
- **P1-f / P1-g deferred indefinitely**: Staging environment and Postgres patch status are outside the scope of Lovable/DB sessions. Flagged for Angela/infrastructure discussion separately.

---

## Open questions parked

- **NEW-003**: Confirm the PDP export edge function uses service-role to write to `generated-docs` before the feature goes live to clients.
- **P1-f**: Staging environment — Angela/Carl decision on whether to spin up a second Supabase project.

---

## Tag

`audit-2026-05-14-deployment-checklist-closure`

## Apply 4 confirmed-safe migrations from 18 July stuck batch

Straight application of pre-audited SQL. No design decisions. Each block applied as its own migration under today's date (22 Jul 2026), in order, verbatim from the prompt.

### Migrations (in order)

| # | Timestamp | File | Content |
|---|---|---|---|
| 1 | `20260722040001` | `reconcile_pr19_restrictive_user_roles_role_permissions.sql` | RESTRICTIVE INSERT/UPDATE/DELETE policies on `user_roles` and `role_permissions` gated by `is_super_admin_safe` |
| 2 | `20260722040002` | `reconcile_pr23_restrictive_backstops_5_tables.sql` | RESTRICTIVE ALL on `broadcast_recipients`, `invitation_tokens`, `staff_engagements`, `engagement_exit_interviews`, `tenant_users` + redundant PERMISSIVE `linked_user_select_own_engagement` (kept verbatim as instructed) |
| 3 | `20260722040003` | `reconcile_pr28_revoke_anon_execute_99_trigger_fns.sql` | REVOKE EXECUTE on 99 trigger-only functions from anon/authenticated/PUBLIC (phantom-stripped: 3 removed — `audit_issue_changes`, `enforce_issue_meeting_rules`, `sync_user_type`) |
| 4 | `20260722040004` | `reconcile_pr38_revoke_anon_execute_48_trigger_fns.sql` | REVOKE EXECUTE on 48 more trigger-only functions (phantom-stripped: `sync_rock_owner_from_seat` removed) |

### Approach

- Apply each block via `supabase--migration` in sequence, waiting for approval/execution before the next.
- SQL used verbatim from the prompt — no reformatting, no scope changes.
- Confirm each succeeds without errors (phantom names already stripped, so no "function does not exist" failures expected).
- Report back after all 4 are applied so you can independently verify against live state and origin/main.

### Out of scope

- PR #31 (parked per your note).
- Any behavioral tuning to the redundant `linked_user_select_own_engagement` PERMISSIVE policy.

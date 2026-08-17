# Audit: 2026-08-17 — security advisor residual findings

**Trigger:** Follow-up to the security-remediation consequence audit.
**Scope:** Current Supabase Security Advisor findings for RLS-without-policy tables, `pg_net` in `public`, and executable `SECURITY DEFINER` functions. This was a read-only classification pass; no permissions, schema, data, or Edge Functions were changed.

## Findings

- Seven `rls_enabled_no_policy` notices are deny-by-default tables, not tables exposed without access control. Four are populated historical backfill snapshots (`20`, `2`, `2,037`, and `1,633` estimated rows) and have no database-function references. They should be retained or formally archived only after product/data-retention review; they must not receive permissive catch-all policies merely to silence the advisor.
- `ask_viv_corpus_ingestion_state` (six rows), `email_ticket_counters` (one row), and `kpi_ticket_number_counters` (one row) are similarly RLS-protected with no policies. The two counter tables are accessed only by their internal ticket-number functions. There is no evidence of a user-facing read path to open.
- `pg_net` is installed in `public` (v0.14.0), which the advisor correctly flags. It is not unused: six production notification/reminder paths reference it, including `audit_notify_docs_ready` and `trg_pdp_auto_evidence_on_completion` triggers. A previous reconciliation also established that moving this extension requires privileges unavailable through the project SQL role. No attempted move was made, because changing its schema without a tested, privileged rollout would break notification delivery.
- The advisor lists many public `SECURITY DEFINER` functions as executable. That list includes trigger functions and intentionally public, authorization-checking helpers, so it is an inventory rather than a safe bulk-revoke list. Each candidate needs a caller/trigger/dependency review before its grants or execution mode change. This is the specific safeguard added after earlier hardening changes caused live feature regressions.
- Two current warnings are console/provider actions rather than repository changes: the email OTP expiry exceeds one hour, and the hosted database is `supabase-postgres-15.8.1.085` with outstanding security patches. Both require an owner to change the setting or schedule an upgrade in the Supabase dashboard.

## Decisions

- Treat the seven no-policy RLS notices as documented residual findings, not an immediate user-data exposure. Do not add broad policies.
- Keep `pg_net` in place pending a Supabase-supported, privileged migration plan that rewrites and tests all six call sites together.
- Continue function-grant remediation one function at a time, starting only where the function is neither a trigger nor an intentional externally authorized RPC.

## KB changes shipped

- No KB changes.

## Code changes

- No production code or database changes; this entry records the verification result.

## Open questions parked

- Confirm the retention/archive policy for the four backfill snapshot tables before any removal.
- Obtain a supported privileged path and staging validation plan for moving `pg_net` out of `public`.
- Complete the per-function authorization review of remaining public `SECURITY DEFINER` functions rather than acting on linter output in bulk.
- In Supabase Dashboard, set the email OTP expiry to at most one hour and schedule the available Postgres security-patch upgrade, with normal maintenance-window and rollback planning.

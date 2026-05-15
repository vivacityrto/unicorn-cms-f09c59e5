## Goal

Fix three broken audit-email SQL functions so their `net.http_post` calls succeed. Single migration, three `CREATE OR REPLACE FUNCTION` statements, two literal substitutions per function. Nothing else changes.

## The bug

Each function builds a `jsonb` payload then calls `net.http_post` with:
- `body := v_payload::text` — wrong, `pg_net` expects `jsonb`
- `'Bearer ' || current_setting('app.supabase_service_key', true)` — that GUC is unset, returns `NULL`, so the header becomes `'Bearer '` with no token

Working cron-driven functions (jobs 8, 9) use `private.cron_function_jwt()`, which reads the JWT from `vault.decrypted_secrets`. Verified to exist and return text.

## Affected functions (verbatim except the two lines)

1. `public.audit_send_24hr_confirmation()` — `RETURNS void`, called by cron job 4
2. `public.audit_send_evidence_reminders()` — `RETURNS void`, called by cron job 5
3. `public.audit_notify_docs_ready()` — `RETURNS trigger`, fired by trigger on `evidence_request_items`

For each, only these two lines change inside the `net.http_post(...)` call:

```text
body    := v_payload::text,           ->  body    := v_payload,
'Bearer ' || current_setting('app.supabase_service_key', true)
                                      ->  'Bearer ' || private.cron_function_jwt()
```

Everything else preserved verbatim:
- `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = 'public'`
- All `DECLARE` blocks, loops, payload construction
- `INSERT INTO public.notification_schedule (...)` in function 1
- `UPDATE public.client_audits SET ai_analysis_status = 'pending' ...` and `RETURN NEW;` in function 3
- Trigger guard logic in function 3 (early returns when not transitioning to received/accepted, or items incomplete)

## Migration

One file. Three `CREATE OR REPLACE FUNCTION` blocks (full bodies retyped verbatim from the current `pg_get_functiondef` output, with the two substitutions). No `DROP`, no schema changes, no trigger or cron edits, no touching `notification_schedule`, `evidence_requests`, `client_audits`, or any RLS.

## Verification after migration

Run:

```sql
SELECT proname, pg_get_functiondef(oid)
FROM pg_proc
WHERE proname IN ('audit_send_24hr_confirmation','audit_send_evidence_reminders','audit_notify_docs_ready')
  AND pronamespace = 'public'::regnamespace;
```

Confirm in each:
- contains `body    := v_payload,`
- contains `private.cron_function_jwt()`
- does NOT contain `::text` on `v_payload` or `current_setting('app.supabase_service_key'`

Also confirm no other function/object changed (only three definitions in the migration).

## Risk assessment

- **Backward compatibility**: signatures, return types, and side-effect statements unchanged. Trigger binding to `audit_notify_docs_ready` keeps working (we only replace the body). Cron jobs 4 and 5 keep their existing commands; their next run will execute the fixed body.
- **No-op safety**: each function's outer `FOR ... LOOP` (or trigger early-returns) means zero matching rows = silent no-op, identical to current behaviour.
- **Security**: `SECURITY DEFINER` + `search_path = public` preserved. JWT moves from a never-set GUC to a vault-backed function already trusted by jobs 8/9. No RLS, role, or grant changes. No service-role key exposed to the frontend.
- **Audit trail**: `notification_schedule` insert in function 1 unchanged, so the audit row is still written when (and only when) the email actually dispatches inside the same loop iteration.
- **Out of scope (explicitly not done)**: backfill for the missed Dijan opening_meeting (Angela handling), removal of the legacy `app.supabase_service_key` GUC reference elsewhere, retry/dead-letter logic, edge function changes.

## What I will NOT touch

Any other function, any table/column/policy/trigger, cron schedules or commands, the `notification_schedule` insert, the `client_audits` update inside function 3, the `RETURN NEW;` in function 3, or the legacy GUC reference anywhere else in the codebase.
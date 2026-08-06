# Audit: 2026-05-08 — bug2-bug12-dedupe-index-cleanup

**Trigger:** Ad-hoc — Bugs 2 and 12 from `TobeFixedBugs.md`. Bug 2 required a DB migration; Bug 12 required a smoke test following resolution of Bugs 10 and 11 (see `audit-2026-05-08-dashboard-bugs-9-10-11-fix`).
**Scope:** `user_notifications` table — duplicate index cleanup (Bug 2). Dashboard Today's Focus widget — smoke-test close (Bug 12). No UI, RLS, trigger, or function changes.

---

## Findings

### Bug 2 — Three duplicate unique indexes on `user_notifications.dedupe_key` — RESOLVED

**Pre-fix state (confirmed via `pg_indexes`):**

| Index | Definition | Status |
|---|---|---|
| `user_notifications_dedupe_key_uq` | `UNIQUE (dedupe_key)` — no WHERE clause | Kept |
| `user_notifications_dedupe_key_idx` | `UNIQUE (dedupe_key) WHERE dedupe_key IS NOT NULL` | Kept |
| `idx_user_notifications_dedupe_key` | `UNIQUE (dedupe_key) WHERE dedupe_key IS NOT NULL` | Dropped |

**Root cause:** Three separate migration sprints each created a unique index on `dedupe_key`. The two partial indexes (`idx_` and `_idx`) were byte-for-byte identical — pure duplication from the May 2026 messaging audit sprint.

**Critical finding during diagnosis:** The original `TobeFixedBugs.md` entry had the fix backwards — it recommended keeping `user_notifications_dedupe_key_idx` (partial) and dropping both others, including `_uq`. That would have broken four live callers that use `ON CONFLICT (dedupe_key) DO NOTHING` (no WHERE clause), which requires a non-partial index as its PostgreSQL arbiter:
- `check_membership_utilisation_alerts` (trigger on `time_entries`)
- `fn_tm_on_message_insert` (trigger on `tenant_messages`)
- `generate-notifications` edge function
- `notify-suggestion-submitted` edge function

Two other callers use `ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, which requires the partial index:
- `fn_check_membership_usage_alerts` (trigger on `time_entries`)
- `fn_check_consultant_overload_alert` (trigger on `tenants`)

Correct fix: keep both `_uq` and `_idx`, drop only `idx_` (the duplicate partial). Three indexes reduced to two — correct arbiter coverage maintained for all ON CONFLICT patterns.

**Migration applied:** Supabase migration `20260508023047`.

```sql
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
DROP INDEX IF EXISTS public.idx_user_notifications_dedupe_key;
```

Lock timeout added by Lovable to abort cleanly if a long-running write is in flight. Statement timeout as a safety net.

**Post-apply verification (via `pg_indexes`):**

```
user_notifications_dedupe_key_uq   — confirmed present
user_notifications_dedupe_key_idx  — confirmed present
idx_user_notifications_dedupe_key  — confirmed absent
```

Row counts unchanged: 883 total, 553 with `dedupe_key`, 330 NULL. No data touched.

---

### Bug 12 — Dashboard: Today's Focus widget rendering — CLOSED (smoke test)

**Status:** Confirmed resolved as a direct consequence of Bugs 10 and 11 (fixed in `audit-2026-05-08-dashboard-bugs-9-10-11-fix`). No additional code fix was required.

Consultant complaints about Today's Focus "not rendering correctly" were fully explained by:
1. The 999-days inactivity item appearing for clients with recent activity (Bug 11 — fixed)
2. The "View Tasks" button doing nothing when clicked (Bug 10 — fixed)

No further investigation needed. Bug 12 was a symptom, not a root cause.

---

## KB changes shipped

- `unicorn-kb/reference/dev-guardrails.md` — Trap 8 added: ON CONFLICT arbiter pattern check for index drops. Documents the diagnostic gap that caused the original `TobeFixedBugs.md` entry to have the fix direction wrong. SHA: `fb4022e` (branch: `fix/dev-guardrails-trap-8-on-conflict-index`, PR pending).

---

## Codebase observations

- unicorn-cms-f09c59e5 @ `20260508023047` (Supabase migration): `DROP INDEX IF EXISTS public.idx_user_notifications_dedupe_key` applied with lock and statement timeouts. Codebase commit messages are Lovable-generated ("Changes") and do not map cleanly to individual migrations; Supabase migration version is the authoritative reference.

---

## Decisions

- **Keep two indexes, not one.** The original bug doc assumed one index could serve all ON CONFLICT clauses. The diagnostic revealed two distinct patterns in live code requiring two distinct index types. Reducing to one would require rewriting stored functions — out of scope for a maintenance fix.
- **TobeFixedBugs.md corrected and both bugs cleared.** File now shows no open bugs.
- **Trap 8 added to dev-guardrails.md.** The ON CONFLICT arbiter check is now a named diagnostic step for any future index cleanup work on tables with multiple calling functions.

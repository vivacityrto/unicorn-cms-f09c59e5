# Handoff: Lovable Production Database Change

> **Last updated:** 2026-04-28 · **Reconsider by:** 2026-10-28 · **Confidence:** high.
>
> Use this handoff when implementing a database change via Lovable that touches production schema, constraints, triggers, RLS policies, or data. Established from the staff UUID relink fix (28 April 2026) incorporating Dave's depth requirements.

---

## When to use this handoff

- Any Lovable prompt that generates a Supabase migration
- Changes to FK constraints, RLS policies, triggers, or enums
- Data backfill or repair operations
- Edge functions that write to production tables

Do **not** use for UI-only Lovable changes with no migration.

---

## The workflow

### Before you start

1. Identify the problem clearly — root cause, not just symptom
2. Gather the specific values needed (UUIDs, emails, constraint names, etc.) from Supabase SQL editor before opening Lovable
3. Check whether a similar fix has been done before — search `unicorn-audit/` and `unicorn-kb/codebase-state/`

---

### Prompt 1 — Audit (plan mode ON)

Ask Lovable to conduct a read-only deep dive and produce a written findings report. **No code yet.**

The audit must cover:
- Every FK constraint, trigger, RLS policy, and index touched by the proposed change
- Backward compatibility with existing application code and edge functions
- Lock impact per table (identify high-traffic tables; recommend `NOT VALID` + `VALIDATE CONSTRAINT` strategy)
- Side-effect triggers on cascaded tables
- Rollback plan for every step
- Any design decisions required before coding (surface these explicitly)
- **For column renames or signature changes — call-site grep must use the right heuristic.** "`<table>` and `<column>` in the same file" misses code that destructures `row.column` from a typed object without naming the table nearby, and misses local interface declarations that shadow the DB row type. Pair the column-type signature (e.g. `client_tenant_id?: number | null`) with file-level proximity to the table OR a hook/component name implying it. A literal-string-search alone is not sufficient.
- **For column renames — audit writers FROM the renamed column, not just readers.** When a renamed column is used as the SOURCE value in an INSERT or UPDATE on a DIFFERENT table or column, the rebind must type-check the destination. A live example: the `eos_rocks.client_id → client_tenant_id` rename rebound `v_rock.client_id → v_rock.client_tenant_id` inside `drop_rock_to_issue`'s `INSERT INTO eos_issues (..., client_id, ...) VALUES (..., v_rock.client_tenant_id, ...)`. The rebind looked clean but introduced an integer-into-uuid INSERT-time runtime error (`eos_rocks.client_tenant_id` is integer; `eos_issues.client_id` is uuid). Verification grep should include `INSERT INTO .* VALUES .*<renamed_column>` and `SET .*<other_column>.* = .*<renamed_column>` patterns, and explicitly cross-check destination column types.

When verifying an FK during the audit, use `pg_constraint`, not `information_schema.constraint_column_usage` — the latter omits FKs across implicit int-width casts (see `pinned/conventions.md → Schema introspection`).

**If the session creates or replaces any function**, include this requirement in the audit prompt:

> *"All new or replaced functions must use `SET search_path = ''` (empty string, not `'public'`). All object references in the function body must be fully schema-qualified (e.g. `public.my_function()`, not `my_function()`). `REVOKE ALL ON FUNCTION ... FROM PUBLIC` and explicitly grant only to `authenticated` or `service_role` as appropriate."*

See `pinned/conventions.md → Function hardening` for the full checklist.

End the prompt with: *"Finish with a proposed implementation plan in numbered steps, a risk assessment, and a list of anything that needs a design decision before proceeding."*

Review the findings report with the relevant stakeholder before proceeding.

---

### Design decisions gate

Answer every open question the audit surfaces before moving to Prompt 2. Common decision types:
- Audit-log immutability (cascade historical rows vs. preserve old UUIDs)
- Backfill scope (known accounts only vs. full sweep)
- Dead code cleanup (now vs. deferred)
- Deployment window (off-peak hours for VALIDATE steps on large tables — use 22:00–04:00 AEST)

---

### Prompt 2 — Implementation plan (plan mode ON)

Reply to Lovable with your confirmed decisions and ask for the complete implementation plan before any code is written. The plan must include:

- Migration ordering and deploy schedule
- Per-migration lock impact and safe rollout strategy
- Rollback plan for every migration
- Verification steps (pre and post deploy)
- Off-peak scheduling for any VALIDATE CONSTRAINT steps

Review the plan. Only approve once you are satisfied.

---

### Prompts 3–N — Phased implementation (plan mode ON for each)

Break implementation into independent migrations. Never combine structural changes with data fixes in one prompt. Typical phases:

| Phase | What | Plan mode |
|---|---|---|
| Supporting objects | New tables, helper functions, audit tables | ON — review before implement |
| Structural change | FK constraint changes, trigger rewrites | ON — highest risk, most important to review |
| Data fix | Backfill, UUID corrections, sweep | ON — verify row counts before approving |
| Validation | VALIDATE CONSTRAINT loop (off-peak) | ON — confirm timing before approving |
| Verification | Smoke tests, dry runs, summary report | OFF — read-only |

**Always turn plan mode ON** before pasting a migration prompt. Review Lovable's proposed changes before approving implementation.

---

### Before any live data operation

1. Run `?dry_run=true` (or equivalent) first
2. Paste the dry-run output for review — confirm only the expected rows are affected
3. Run live only after dry-run is verified

---

### Final prompt — Verification and sign-off

Ask Lovable to produce a written summary covering:
- Every DB object changed and how
- What changed in system behaviour
- What stayed the same
- Benefits delivered
- Residual risk assessment with mitigations
- Confirmation that the fix is self-contained (no ongoing manual intervention required)

This is the sign-off document for stakeholder review.

---

## The Dave standard

When a stakeholder requests a thorough review, include this requirement in every prompt:

> *"Please take your time and conduct a thorough deep dive covering every nuance of the codebase and database structures this plan touches. Identify all gaps, improvements, shortcomings, issues, bugs, and conflicts. Ensure the implementation is backward-compatible, audit-complete, and production-ready. Confirm it does not negatively impact any existing functionality, RLS policies, or FK constraints. Finish with a summary of changes, benefits, and a risk assessment."*

---

## Off-peak deployment

VALIDATE CONSTRAINT steps on large tables must run in the off-peak window: **22:00–04:00 AEST**.

High-traffic tables that warrant off-peak VALIDATE:
`audit_log`, `notification_outbox`, `eos_todos`, `meetings`, `email_messages`, `ai_interaction_logs`, `consult_entries`, `ops_time_logs`

Use pg_cron for scheduling. Always set the job to self-unschedule after one run.

---

## After deploy

1. Run verification queries the morning after off-peak steps
2. **Final repo-wide grep against `origin/main`, not the working tree.** The build catches consumers that read the renamed column; it does NOT catch local interface declarations or unused fields. After Lovable reports "build successful", run `git grep "<old name>" origin/main -- 'src/**/*.ts' 'src/**/*.tsx'` and audit every hit before declaring done. Working-tree greps lie when the local copy is behind `origin/main` (always the case mid-session).
3. Confirm affected users can log in / feature works end-to-end
4. Write the audit entry — the dev who ran the session authors it; Carl reviews via PR. Follow the template in `unicorn-audit/README.md`; push to a branch named `audit/YYYY-MM-DD-<slug>`; do not auto-merge.
5. Update `unicorn-audit/INDEX.md`
6. Update any stale KB docs in `unicorn-kb/codebase-state/` if the migration changed documented architecture

---

## Reference

- First use: `unicorn-audit/audit/2026-04-28-staff-uuid-relink-fix.md`
- Audit template: `unicorn-audit/README.md`
- KB hygiene: `unicorn-kb/pinned/kb-hygiene.md`

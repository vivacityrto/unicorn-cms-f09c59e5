# Audit: 2026-05-12 — p1e-mutable-search-path

**Trigger:** P1-e from the 12 May 2026 deployment status audit — 28 functions in the `public` schema missing `SET search_path`, worsened from 24 to 28 since the prior sweep.
**Author:** Carl
**Scope:** `SET search_path` hardening on all 28 affected `public` functions. No body, signature, volatility, or security changes. No RLS, FK, or data changes.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Findings

- All 28 functions had `proconfig IS NULL` — none had been fixed, including the 4 that regressed since the prior count.
- `match_srto_chunks` required special handling: the pgvector `<=>` operator resolves from the `extensions` schema. All other 27 functions use fully-qualified out-of-public references (`auth.uid()`, `net.http_post`, `information_schema.*`, `public.*`) or have no out-of-public references — `SET search_path = 'public'` is safe for all 27.
- 10 of the 28 are trigger functions (fire on every row write) — highest injection surface; patched in the same migration as the remainder.
- `complete_chc_stage_tasks → complete_audit_stage_tasks` and `trg_normalise_tenant_identifier → normalise_abn` are chain-dependency pairs; both ends are in the list and fixed together.
- **Lovable hallucination during Prompt 2** — the first implementation plan Lovable produced used 25 completely fabricated function names not present in this project. Caught by cross-referencing the plan against the live `pg_proc` query. Resolved by re-issuing Prompt 2 with the confirmed name list locked in explicitly. The corrected plan was correct and the implementation verified cleanly.

---

## DB change shipped

### Migration `20260512051450` — `harden_function_search_path_batch_1`

28 `CREATE OR REPLACE FUNCTION` statements. Each adds exactly one line:
- `SET search_path = 'public'` — 27 functions
- `SET search_path = 'public', 'extensions'` — `match_srto_chunks` only (pgvector operator resolution)

Placed after `LANGUAGE` / volatility / `SECURITY DEFINER`, immediately before `AS $function$` — consistent with the `is_vivacity_team_safe` convention.

No body changes. Function OIDs preserved → trigger bindings, grants, and RLS policy references unaffected. Single transaction.

**Functions patched:**
`academy_lesson_set_minutes_from_video`, `academy_set_updated_at`, `acknowledge_audit_report`, `audit_flag_overdue_chcs`, `audit_notify_docs_ready`, `audit_send_24hr_confirmation`, `audit_send_evidence_reminders`, `coerce_audit_appointment_attendees`, `compare_unicorn_import_prefix`, `complete_audit_stage_tasks`, `complete_chc_stage_tasks`, `compliance_set_updated_at`, `generate_certificate_number`, `list_code_tables`, `match_srto_chunks`, `normalise_abn`, `normalise_name`, `release_audit_report`, `rpc_match_clickup_to_rto_membership`, `schedule_audit_phase`, `set_client_audit_updated_at`, `set_default_renewal_date`, `suggest_items_set_updated_at`, `sync_audit_actions_to_client_items`, `sync_primary_contact_on_role`, `training_video_refresh_lesson_minutes`, `trg_normalise_tenant_identifier`, `trg_validate_action_item_priority_status`

**Verification (confirmed via live `pg_proc` query):**
- 28/28 rows returned, all `status = 'OK'`
- All 27 standard functions: `proconfig = ['search_path=public']`
- `match_srto_chunks`: `proconfig = ['search_path=public, extensions']`
- Zero `MISSING` or `OTHER_CONFIG_ONLY` results

---

## Process note

Lovable's Prompt 2 plan fabricated a completely different set of 25 function names. Caught before implementation by running a live `pg_proc` query via MCP. Corrected by re-issuing Prompt 2 with the exact 28 names locked in and explicit instructions to read bodies from `pg_get_functiondef` at implementation time, not from training data. The corrected Prompt 3 implementation was clean.

**Pattern to apply in future P1-e–style sessions:** always verify Lovable's function name list against the live catalog before approving any plan that enumerates DB objects by name. Lovable will silently substitute plausible-sounding names if not anchored to real catalog output.

---

## KB changes shipped

No KB changes required.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` @ `6256a2c1` — migration `20260512051450` (1065 lines, 28 function rewrites).

---

## Decisions

- `SET search_path = 'public'` adopted as the standard for all non-extension functions — consistent with the existing `is_vivacity_team_safe` convention.
- `match_srto_chunks` exception: `SET search_path = 'public', 'extensions'` — standard Supabase pgvector pattern.
- No SECURITY DEFINER added to any function that did not already have it.

---

## Open questions parked

- **Regression watch:** any new function added by Lovable will again be missing `SET search_path` unless explicitly included in the prompt. Recommend adding a standing check to the deployment status audit: `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proconfig IS NULL AND p.prokind = 'f'`. Should be 0.
- **`sync_primary_contact_on_role`** is now patched. This function was rekeyed in the contact-role canonicalisation session earlier today (migration `20260512043150`) without `SET search_path` — that omission is now closed.

---

## Tag

`audit-2026-05-12-p1e-mutable-search-path`

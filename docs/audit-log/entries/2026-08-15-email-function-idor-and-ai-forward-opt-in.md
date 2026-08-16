# Audit: 2026-08-15 — send-email-graph / generate-email-note IDOR + AI forward opt-in

**Trigger:** ad-hoc
**Scope:** IDOR on two email edge functions (`send-email-graph`,
`generate-email-note`) and whether forwarding a linked email body to an
external AI endpoint is covered by client privacy terms. Did not review
other AI edge functions (Ask Viv, draft-finding, minutes, etc.).

## Findings

- `send-email-graph` authenticated the caller, then used the service role
  to load tenant / primary-contact / CSC merge fields for any
  `tenant_id` in the body. `dry_run` returned that `merge_data` as a
  preview, so it was a read oracle, not just a send path. Confirmed live
  helper is `public.has_tenant_access_safe(p_tenant_id bigint, p_user_id uuid)`
  via `pg_proc` on `yxkgdalkbrriasiyyrwk`.
- `generate-email-note` already built an ANON-key client with the
  caller's JWT, then ignored it and fetched `email_messages` with the
  service role — bypassing `email_messages_select` (owner /
  `is_vivacity_team_safe` / `is_super_admin_safe`). Any authenticated
  caller who knew a UUID could read another tenant's email body.
  `emails_restrict_staff_only` is the RESTRICTIVE staff backstop on
  `public.emails` (stage templates). This function reads
  `email_messages` (inbox captures); the equivalent control is the
  caller-scoped select.
- Forwarding that body to `https://ai.gateway.lovable.dev/v1/chat/completions`
  (`google/gemini-3-flash-preview`) is a disclosure to a third-party
  processor. The repo has no DPA / subprocessor schedule naming Lovable
  or Google Gemini for correspondence content. Vivacity's public privacy
  page was not reachable from this session. `docs/kb/reference/ai-use-principles.md`
  Principle 3 requires PII to stay on a controlled, logged path and not
  go to an uncontrolled third-party surface. Treat as **not covered** by
  existing client privacy terms.

## Code changes (if this entry accompanies one)

- `send-email-graph`: require `tenant_id`; call
  `has_tenant_access_safe` before any merge-field read (covers
  `dry_run`). 403 `{ code: "FORBIDDEN" }` on deny.
- `generate-email-note`: fetch the email with the ANON-key + caller JWT
  first; empty row → 404; service role only after that for the opt-in
  check, audit insert, and (not the email body read).
- New `app_settings.ai_email_note_external_forward_enabled` (NOT NULL
  DEFAULT false) plus `validate_ai_feature_override` allow-list update
  so Super Admins can opt a tenant in via the existing
  `ai_feature_overrides` / Admin AI Feature Flags UI. Default remains
  OFF; Super Admin does **not** bypass — the flag is the client's
  consent, not an operator privilege.
- Every external forward writes `client_audit_log` action
  `ai.email_forwarded_external` with caller id, email id, and
  destination **before** the gateway call. Audit insert failure aborts
  the forward.

## Decisions

- Reuse `ai_feature_overrides` rather than a new `tenants.*` column —
  that is the standing explicit per-tenant AI opt-in mechanism.
- Do not add `email_messages_restrict_staff_only`. Live SELECT already
  allows the whole Vivacity team; tightening it would change the inbox
  UI, which is out of scope for this IDOR fix.

## Production apply (same session)

- Migration `ai_email_note_external_forward_opt_in` applied via MCP to
  `yxkgdalkbrriasiyyrwk`. Global flag reads `false`.
- `send-email-graph` v361 and `generate-email-note` v109 deployed with
  `verify_jwt=false` (unchanged). Unauthenticated smoke: both return 401
  missing/invalid auth as expected.

## Open questions parked

- Other AI functions that send client content to the Lovable gateway
  (capture-outlook-email summaries, extract-note-title, etc.) have the
  same privacy shape and are not gated here.

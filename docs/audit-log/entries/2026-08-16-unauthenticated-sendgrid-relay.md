# Audit: 2026-08-16 — unauthenticated-sendgrid-relay

**Trigger:** ad-hoc — kill a live unauthenticated SendGrid relay that the
15 Aug outbound-email hardening left standing, then rotate the exposed
key and triage every bare-UUID edge-function slug.
**Scope:** hosted project `yxkgdalkbrriasiyyrwk`. Edge-function
deployments whose slug is a UUID. `public.email_logs` for abuse
assessment. Did not rotate the SendGrid key in SendGrid itself (no
dashboard / API credential in this environment). No database object
changed.

## Findings

- Four deployments share the display name `send-test-email`:
  - `send-test-email` — named keeper, Super-Admin gated (created 15 Aug 2026).
  - `dcd6c745-f1cf-4f2c-af4e-5644f9c814d7` — 410 stub (already retired).
  - `c22daa64-2f57-47f9-961c-1b7e2ffc38a8` — 410 stub (already retired).
  - `64329f1f-48e1-4374-8ddf-6e66e42d33de` — **still the May 2025
    unauthenticated SendGrid relay** (`verify_jwt=false`, CORS `*`,
    `sgMail.send` to a caller-supplied `recipientEmail`, service-role
    client). Version 109, created/updated 2025-05-20, never touched by
    the 15 Aug hardening.
- The 15 Aug docstring said "Two are retired (410 stub). This named
  slug is the keeper." That count is what allowed `64329f1f` to be
  missed. There were three UUID copies, not two.
- MCP `deploy_edge_function` `name` is validated as
  `/^[A-Za-z][A-Za-z0-9_-]*$/`. Digit-leading slugs cannot be
  overwritten or created through MCP. There is no MCP delete tool and
  no MCP secrets tool. CLI has no `SUPABASE_ACCESS_TOKEN` in this
  environment. Management API `DELETE /v1/projects/{ref}/functions/{slug}`
  exists and is the correct kill path once a token with
  `edge_functions:write` is available.
- `grep -rn "sendgrid\|sgMail\|SENDGRID" supabase/functions/` is empty.
  After `64329f1f` is gone, `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL`
  should be deleted from edge-function secrets. They are **not** in
  `vault.secrets` (that store only has cron JWT/invoke, Mailgun, and
  MAIL_FROM_*).
- `public.email_logs` is empty (0 rows). The live relay inserts
  `template_key`, a column that does not exist on `email_logs`, so
  successful or failed SendGrid sends would not have been recorded
  there. `email_instances` has no `[TEST]` subjects. `email_sends` has
  two Mailgun magic-link rows to a Vivacity address (unrelated). Abuse
  assessment via application tables is therefore **inconclusive**.
- Function edge logs for 2026-08-15 show four hits on `64329f1f`
  (OPTIONS 200, three POST 400) — consistent with the previous
  hardening session probing the live relay without a body. No hits on
  2026-08-13/14, 2026-08-09, 2026-06-30, or 2025-05-20 (`query_logs`
  windows are 24h and older days appear unretained). `61429ee4` and
  `e77f4567` had no hits in the last 24h.
- Live unauthenticated POST `{}` probes this session:
  - `64329f1f` → **400** `Template ID and recipient email are required`
    (SendGrid relay still executing)
  - `dcd6c745` / `c22daa64` → 410 `FUNCTION_RETIRED`
  - `e77f4567` → 410 `FUNCTION_RETIRED` (this session)
  - `61429ee4` → **400** `Unsupported source type: undefined` (mock still live)
  - named `send-test-email` → 401 `Unauthorized` (keeper gate holds)
  - Management API DELETE without a token → 401
- Bare-UUID deployments on the project (complete list, 5):
  | Slug | Display name | verify_jwt | Created | Triage |
  |------|--------------|------------|---------|--------|
  | `dcd6c745-…` | (self) | false | 2025-05-20 | 410 stub (15 Aug) |
  | `c22daa64-…` | (self) | false | 2025-05-20 | 410 stub (15 Aug) |
  | `64329f1f-…` | send-test-email | false | 2025-05-20 | **LIVE SendGrid relay — MCP cannot update** |
  | `e77f4567-…` | clickup-integration | false | 2025-05-20 | Retired this session (410 stub, v110). May 2025 mock, no real ClickUp calls. |
  | `61429ee4-…` | unicorn-data-import | false | 2025-05-20 | May 2025 mock (no real DB/file import). Digit-leading — same MCP block as `64329f1f`. |

## KB changes shipped

- no changes

## Code changes (if this entry accompanies one)

- Corrected the keeper docstring and retired-stub comment so they name
  all three UUID copies and the digit-leading MCP limitation.
- Vendored 410 stubs for `e77f4567` (clickup-integration) and
  `61429ee4` (unicorn-data-import).
- Deployed the clickup stub to prod (`e77f4567` v110). Confirmed the
  pulled body has no service-role key.

## Decisions

- Prefer outright deletion of `64329f1f` over a stub; it has no callers
  worth preserving. Stub only if Management API delete is blocked.
- Treat `SENDGRID_API_KEY` as exposed. Rotate in SendGrid, then delete
  both SendGrid edge secrets. Repo has no remaining SendGrid references.
- Keep enumerating bare-UUID slugs as a standing check — they are
  invisible to name-based greps.

## Open questions parked

- `64329f1f` and `61429ee4` are still live until a Management API /
  dashboard delete (or stub) lands. This session could not present a
  `SUPABASE_ACCESS_TOKEN`.
- SendGrid key rotation is a console action; not done here.
- Function-log retention is 24h per `query_logs` window. A longer
  abuse window needs the dashboard log explorer or SendGrid activity.

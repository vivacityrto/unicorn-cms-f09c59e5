# RBAC v6 — Packet P0.1-a: frontend/static authorization inventory

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Scoping doc:** [P0.1 packet scoping](p0-1-inventory-packet-scoping.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** delivered 2026-09-11; the 14 "no recognized gate" candidates below were manually triaged the same day — see the updated section below. P0.1-b (live read-only Supabase MCP inventory) also delivered — see [P0.1-b](p0-1-b-live-inventory.md).
> **Owner:** Claude Code
> **Dependencies:** none — unblocked by ADR-030 (broad staff tenant-read access is now permanent policy, so this inventory's downstream P1 consumers no longer wait on that decision) but this packet doesn't itself depend on ADR-030's content
> **Exit criteria (this packet):** a versioned, re-runnable static inventory covering every `usePermission()` call, `<PermissionGate>` usage, raw `unicorn_role` comparison, and Edge Function auth-gate status, each with file/line citation
> **Evidence:** generated from `hotfix/rbac-p0-1-static-inventory` at `origin/main@a036072f5`, 2026-09-11
> **Audit entry:** none — read-only static analysis, no schema/RLS/grant/migration/production-data change

## What this is

A generator script, `scripts/generate-rbac-static-inventory.mjs`, walks a real
TypeScript/TSX AST (the `typescript` package — same approach as
`scripts/generate-route-manifest.mjs`) over every `src/**/*.{ts,tsx}` file and
a plain-text scan over every `supabase/functions/*/index.ts`, producing:

1. Every `usePermission()` call site (feature/level arguments, file/line).
2. Every `<PermissionGate>` JSX usage (props, file/line).
3. Every raw `unicorn_role === ` / `!==` comparison (file/line, operator,
   expression text).
4. Every Edge Function's auth-gate status: which of the four named helpers
   (`requireCaller`, `requireSuperAdmin`, `requireSharedSecret`,
   `requireInternalEmailSecret`) it imports, whether it has *any*
   CI-recognized gate at all, and whether it carries the `// auth-gate: none`
   opt-out marker.

Full machine-readable output:
[`data/p0-1-a-static-inventory.json`](data/p0-1-a-static-inventory.json).
Re-run any time with `node scripts/generate-rbac-static-inventory.mjs
[--json] [--out <file>]` — this is a versioned artifact, not a one-time
snapshot.

## Counts (this run)

| Signal | Count |
|---|---:|
| `usePermission()` call sites | 36 |
| `<PermissionGate>` usages | 5 |
| Raw `unicorn_role === ` / `!==` comparisons | 59 |
| Edge Functions scanned | 192 (193 at initial scan; `ai-generate-suggestions` retired same day, see below) |
| — with a named helper (`requireCaller` etc.) | 90 |
| — with some other CI-recognized gate (inline `auth.getUser()`+`check_permission`, cron-secret, webhook signature, `verifyAddinToken`/`authorizeCronInvoke`, etc.) | 89 |
| — opted out via `// auth-gate: none` comment | 8 |
| — **no CI-recognized auth gate at all, after triage** | 5 |

These differ from the scoping doc's earlier estimates (38/6/77/97) because
this is a real AST/text scan of the current tree, not a plain `grep -c` taken
at scoping time — expected drift, not a discrepancy to chase.

## Reconciling against the CI guardrail (important correction made while building this)

The first draft of the generator script only recognized the four named
helpers above and reported "103 Edge Functions with no recognized auth-gate
import." That count was wrong in a misleading direction: it didn't match
`scripts/check-edge-function-auth-gate.sh`, the actual CI guardrail that
gates every PR, which recognizes several other legitimate idioms this
codebase uses side by side (`check_permission`, inline `auth.getUser(`/
`auth.getClaims(`, `verifyAuth(`, `isCronAuthorized(`, `checkSuperAdmin(`,
`MAILGUN_WEBHOOK_SIGNING_KEY`, `constantTimeEqual(`) plus the same-file
`// auth-gate: none` opt-out marker. The generator was corrected to use the
identical pattern before this doc was written, specifically to avoid handing
RBAC v6 planning an inflated, wrong "103 ungated" finding. The two scripts'
patterns should be kept in sync going forward (a comment in the generator
notes this).

## Triage of the original 14 "no CI-recognized auth gate" candidates (2026-09-11)

Manually checked every one against actual source, rather than leaving this
as an unactioned list:

**9 were false positives — real gates the guardrail pattern didn't recognize
by name, now fixed:**
- 7 `addin-*` functions (`addin-diagnostics-usage`, `addin-email-capture`,
  `addin-email-create-task`, `addin-email-link-attachments`,
  `addin-meeting-capture`, `addin-meeting-create-time-draft`) all call
  `verifyAddinToken(req.headers.get('Authorization'), ...)` — a real,
  consistent gate.
- `reconcile-invite-delivery-status` and `sync-outlook-calendar-cron` both
  call `authorizeCronInvoke(req)` — same story.
- Both `scripts/check-edge-function-auth-gate.sh`'s `AUTH_PATTERN` and this
  generator's `GUARDRAIL_AUTH_PATTERN` were updated to recognize
  `verifyAddinToken(` and `authorizeCronInvoke(` so these don't show up as
  false positives in a future audit.

**1 was a real gap, now retired:** `ai-generate-suggestions` had no auth
check of any kind — accepted `tenant_id` straight from the request body,
didn't even verify an `Authorization` header was present, then ran
tenant-scoped EOS queries and called the paid Lovable AI gateway. Reachability
check first (per this repo's standing dead-code-triage practice) found it
was already confirmed orphaned in a 2026-09-08 investigation (its only
frontend caller had been retired, the function itself left untouched at the
time). Retired the Edge Function entirely rather than patch code nobody
calls — see `docs/audit-log/entries/2026-09-11-retire-ai-generate-suggestions.md`.

**4 have no gate for a legitimate reason, not fixed (a naming-pattern fix
wouldn't be appropriate — each needs its own `// auth-gate: none` opt-out
comment, not attempted in this pass):**
- `addin-auth-exchange` — this **is** the login/token-mint endpoint; it
  verifies the caller via Microsoft Graph API before minting anything (and
  explicitly refuses unverified local JWT decoding), so there's no prior
  caller to authenticate — establishing identity is its job.
- `bulk-reassign-team-member` — checks for the header, then delegates the
  actual role check to a `SECURITY DEFINER` RPC (`bulk_reassign_primary_csc`)
  that checks `unicorn_role` internally and maps its errors to 403/400. Real
  gate, just not a pattern the guardrail recognizes.
- `tga-search-training` and `tga-rto-preview` — pure proxies to
  training.gov.au's own public API. No tenant data, no writes, nothing to
  authenticate.

**Parked, not actioned:** `generate-document-description` has no auth
either, but touches no tenant data — a minor AI-cost-abuse surface (anyone
can hit it and burn Lovable AI quota), not a data-security gap. Flagged for
a future hardening pass, not fixed here.

## The 8 functions opted out via `// auth-gate: none`

```
consume-token
mailgun-webhook
mark-token-used
process-notification-queue
send-self-password-reset
set-invite-password
xero-invoice-sync-all
xero-webhook
```

These already carry a same-file justification comment per the guardrail
script's documented exception — not re-audited here.

## What P0.1-a does not cover (deferred to P0.1-b or later)

- Route/nav-entry table — the plan's scoping doc noted `npm run routes`
  (`scripts/generate-route-manifest.mjs`) already covers this with guard-chain
  detail; not duplicated here.
- Live database state: effective RLS policies, functions, triggers, grants,
  role rows, `pg_depend` helper dependency graph. That's P0.1-b (read-only
  Supabase MCP), not started as part of this packet.
- Reconciling these raw call-site counts against the plan's "85 current
  features and 523 role rows" figures — per the scoping doc's open question
  3, left for P1 or a later reconciliation pass, not decided here.

## Verification

Read-only static analysis script; no runtime behavior changed. Full
verification chain run for this packet: `npm run lint:ratchet`, `npm run
typecheck`, `npm run test:frontend`, `npm run test:edge`, `npm run
check:kb-links`, `node scripts/check-kb-doc-size.mjs` — see PR description
for exact results.

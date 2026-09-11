# RBAC v6 — Packet P0.1-a: frontend/static authorization inventory

> **Parent plan:** [RBAC v6 Authorization Implementation and Gate-Streamlining Plan](../../rbac-v6-authorization-implementation-plan-2026-09-01.md)
> **Scoping doc:** [P0.1 packet scoping](p0-1-inventory-packet-scoping.md)
> **Program index:** [Program Index](../../program-index.md)
> **Status:** delivered — P0.1-a only (static, no live database access); P0.1-b (live read-only Supabase MCP inventory) not started
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
| Edge Functions scanned | 193 |
| — with a named helper (`requireCaller` etc.) | 90 |
| — with some other CI-recognized gate (inline `auth.getUser()`+`check_permission`, cron-secret, webhook signature, etc.) | 81 |
| — opted out via `// auth-gate: none` comment | 8 |
| — **no CI-recognized auth gate at all** | 14 |

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

## The 14 functions with no CI-recognized auth gate (real finding, not yet triaged)

```
addin-auth-exchange
addin-diagnostics-usage
addin-email-capture
addin-email-create-task
addin-email-link-attachments
addin-meeting-capture
addin-meeting-create-time-draft
ai-generate-suggestions
bulk-reassign-team-member
generate-document-description
reconcile-invite-delivery-status
sync-outlook-calendar-cron
tga-rto-preview
tga-search-training
```

**Not fixed as part of this packet** — P0.1 is inventory only, not
remediation. This list is a candidate input for a future security-hardening
packet (or an update to `AGENTS.md`'s Edge Function security guardrails
checklist), not an action taken here. Some entries may be legitimate
same-file patterns the guardrail script doesn't recognize yet (worth
checking before assuming all 14 are real gaps) — that triage is explicitly
out of scope for this packet, consistent with the parent scoping doc's
"P0.1 inventories what exists, it does not decide or fix."

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

# Phase 4 P6 slice 8 — AI & integrations characterization (CLOSED)

**Parent plan:** [Codebase Optimization Plan](../../codebase-optimization-plan-2026-08-28.md) · **Program index:** [Program Index](../../program-index.md)

**Branch cut:** `origin/main` at `fdb047e49` (PR #1174 merged)

**Disposition:** **closed 2026-09-11** — every direct Supabase SDK data-layer
call across all four named hotspot files has been extracted into a tested
adapter module. This is a genuine close, not a pause: unlike slices 5/6/7,
no remaining seam is blocked by coupled state or unresolved risk — the
files are simply out of extractable direct-call surface. Independently
verified by both Claude and Codex using two different methods (Claude: a
TypeScript-AST call-expression scanner; Codex: literal + multiline `git
grep` over `origin/main` plus direct source reads) before this doc was
written — see the "Independent verification" section below.

## Candidates and final state

| File | Before | After | Change | Seams |
|---|---:|---:|---:|---:|
| `src/components/client/ClientIntegrationsTab.tsx` | 1,997 | 1,780 | -217 (-10.9%) | 12 |
| `src/hooks/useAskVivAssistantChat.ts` | 176 | 143 | -33 (-18.8%) | 7 |
| `src/components/tenant/TenantClickUpAISearch.tsx` | 197 | 190 | -7 (-3.6%) | 1 |
| `src/pages/IntegrationSettings.tsx` | 367 | 350 | -17 (-4.6%) | 1 |

19 bounded PRs, one seam each, all oracle-1 (focused characterization
tests against a mockable Supabase boundary — every seam here had a real
testable seam, so oracle 2 was never needed): #1147, #1149, #1150, #1152,
#1154, #1155, #1156 (Ask Viv chat hook), #1158, #1159, #1161, #1163,
#1165, #1166, #1168, #1169, #1171, #1172, #1173 (`ClientIntegrationsTab`),
#1174 (`IntegrationSettings`).

## Extracted adapters

**Ask Viv chat (`useAskVivAssistantChat.ts` → 7 adapters):**
`askVivAssistantRequest.ts`, `askVivAssistantUsage.ts`,
`askVivAssistantAccess.ts`, `askVivSuggestedFaqs.ts`,
`askVivAssistantMessages.ts` (conversation reader),
`deleteAskVivAssistantConversation.ts`, `askVivAssistantHistory.ts`
(conversation-list history).

**`ClientIntegrationsTab.tsx` → 12 adapters:** `saveTenantRtoNumber.ts`,
`fetchTgaLinkSyncStatus.ts`, `fetchClientTenantStatus.ts`,
`fetchTenantHeadOfficeTransferDate.ts`, `fetchTgaDebugData.ts`,
`fetchInitialRegistrationContext.ts`, `transferTgaPrimaryContact.ts`,
`transferTgaDetails.ts`, `transferTgaContactsAsUsers.ts` (bulk invite —
RBAC-adjacent, see below), `transferTgaAddresses.ts`.

**`TenantClickUpAISearch.tsx` → 1 adapter:** `saveTenantClickUpAISummaryNote.ts`.

**`IntegrationSettings.tsx` → 1 adapter:** `appIntegrationSettings.ts`
(settings read + two `app_settings` updates).

## The one RBAC-adjacent seam, handled differently

`transferTgaContactsAsUsers` (the bulk `invite-user` Edge Function loop)
was the one seam in this slice that assigns `unicorn_role` and sets
`invite_as` per contact. Per a joint Claude/Codex discussion (agent
coordination board, 2026-09-11), Claude took this one specifically for its
RBAC shape while Codex reviewed the extraction against the file's
already-characterized behavior — the only seam in slice 8 using this
two-agent review pattern instead of single-reviewer merge. Verified before
extracting that `invite-user`'s own server-side authorization (caller role
allowlist, tenant-admin scope, `check_permission` RPC, per-tenant
allowed-role validation) is completely unchanged — this was pure
client-side call-orchestration, no authorization boundary moved.

## Two real corrections made during this slice's closeout (recorded honestly)

1. **Removing a now-unused import isn't safe without checking the whole
   file, not just the lines you touched.** During the bulk-invite
   extraction (PR #1172), a single-line grep (`supabase\.`) reported zero
   remaining calls, so the `supabase` import was removed — but two live
   calls elsewhere in the file (`handleTransferAddresses`'s delete/insert)
   wrapped their method chain to the next line (`await supabase\n
   .from(...)`), which a single-line pattern can't see. Codex's PR review
   caught the resulting `TS2304` typecheck failure; fixed by restoring the
   import (PR #1172's second commit). This is also why
   `handleTransferAddresses` had been missed entirely from the original
   "slice 8 nearly done" estimate — it was extracted as a follow-up seam
   (PR #1173) once the miss was found.
2. **A broken shell-escaped grep can silently report zero matches instead
   of erroring.** `IntegrationSettings.tsx` was also reported clean by an
   earlier grep pass that turned out to be mis-escaped — it actually had 3
   real calls, extracted in PR #1174.

Both misses were the same underlying lesson: a text-pattern search over
source is not a reliable way to answer "does this file have any more direct
Supabase calls" for a file of any real size — a wrapped method chain or a
shell-escaping slip can hide a real call from a narrow grep. The fix that
actually worked: a TypeScript-AST-based call-expression scanner (walks real
parsed call expressions, not text patterns), cross-checked independently by
Codex using a different method (multiline `git grep` plus direct source
reads) before this doc was written.

## Independent verification (the actual close criterion)

Both agents independently confirmed, using different methods, against
`origin/main@fdb047e49`:

- `ClientIntegrationsTab.tsx` — zero direct Supabase SDK data-layer calls.
- `useAskVivAssistantChat.ts` — zero direct calls; delegates entirely to
  its 7 extracted adapters.
- `TenantClickUpAISearch.tsx` — zero `.from`/`.rpc`/`.functions.invoke`/
  `.storage` calls. **One qualification Codex's pass caught that a
  Supabase-call-expression scanner structurally cannot see:** the file
  still makes a raw authenticated `fetch()` to
  `${VITE_SUPABASE_URL}/functions/v1/clickup-ai-search` — a live Edge
  Function network call that bypasses the Supabase JS SDK entirely. This
  is an existing external contract, not a newly discovered extraction
  seam in this slice's own scope, but it means "zero Supabase calls" is
  not quite accurate for this file without that qualifier — "zero SDK
  data-layer calls, one raw Edge Function network call" is the precise
  statement.
- `IntegrationSettings.tsx` — the 3 calls found are now in PR #1174,
  merged.

## What this slice does not cover

- `TenantClickUpAISearch.tsx`'s raw `clickup-ai-search` fetch call (noted
  above) — an existing external contract, not touched by this slice.
- The security-relevant side-finding from RBAC v6 P0.1-a triage
  (`ai-generate-suggestions` retirement, PR #1167) is a separate audit
  entry, not a slice-8 seam — it surfaced during this slice's timeframe
  but belongs to the RBAC v6 program, not this characterization.
- The `session.test.tsx` timer-flush fix (PR #1170) is a test-infrastructure
  fix Codex's slice-8 work surfaced, not a slice-8 extraction seam either.

## Next per the plan

Per the plan's own P6 note: slices 5-8 are all now through their pass
(5 paused, 6 exhausted, 7 paused, 8 closed). The required next step is the
**bounded Phase 4 cross-initiative exit re-audit** — fresh `npm run
metrics`, explicitly including `AdminStageDetail.tsx` (the omitted largest
frontend hotspot), reconciled against RBAC v6/Tenant Operating Model/Client
Health Activity Analytics discovery for any shared file — before declaring
Phase 4 complete or moving to Phase 5. This was Codex's own conclusion
independently, matching the plan's text, in the same joint discussion that
scoped this slice's final seam.

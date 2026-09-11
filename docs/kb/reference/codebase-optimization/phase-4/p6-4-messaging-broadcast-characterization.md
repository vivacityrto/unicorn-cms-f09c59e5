# P6-4 Messaging/Broadcast Characterization

> **Status:** characterization complete; scoping corrected before extraction
> (see "Recommendation, corrected" below) — no code change yet
>
> **Parent plan:** [Codebase Optimization and KB Renewal Plan](../../codebase-optimization-plan-2026-08-28.md) — Phase 4, P6 hotspot slice #4
>
> **Program index:** [Program Index](../../program-index.md)
>
> **Prerequisite:** none — independent of slices #1/#2/#3, taken in the P6 order

## Purpose and non-goals

Characterizes the broadcast-campaign and team-communications messaging
surface before any extraction, per the master plan's Phase 4 rule. No code,
schema, RLS, or trigger change is authorized by this packet.

## Surface inventory

| File | Lines | Role |
|---|---:|---|
| `src/components/client/ClientMessagesTab.tsx` | 1,080 | Client-portal message view/read-state — read-only, out of scope for participant resolution. |
| `src/pages/TeamCommunicationsPage.tsx` | 1,022 | Staff inbox: conversation list, message thread, "start new conversation" flow (own participant-resolution copy), send-message mutation. |
| `src/pages/ClientInboxPage.tsx` | 757 | Client-portal inbox shell wrapping `ClientMessagesTab`/notifications. |
| `src/components/communications/BulkMessageDialog.tsx` | 666 | Campaign command: audience picker, preview, attachment upload, campaign create → queue → send. |
| `supabase/functions/send-broadcast-campaign/index.ts` | 281 | Edge Function: per-tenant conversation creation, participant resolution (own copy), message insert, result totals. |
| `src/components/communications/BulkMessageHistory.tsx` | 154 | Notification result model UI: campaign list + per-recipient delivery/read status. |

Two files noted and ruled **out of scope**: `src/hooks/admin/use-broadcast-obligation.ts`
and `src/components/admin/reporting-obligations/BroadcastPreviewDialog.tsx`
are a different, unrelated "obligation notification" flow with no
`conversation_participants`/`tenant_users` FK path — not part of this seam
despite the similar naming.

## Edge Functions

Only one fronts this surface: `send-broadcast-campaign` (281 lines),
invoked exclusively from `BulkMessageDialog.tsx:294`. `TeamCommunicationsPage.tsx`'s
"start new conversation" and "send message" flows write directly to
Postgres via the browser client — no Edge Function — which is exactly why
the participant-resolution logic ended up duplicated rather than shared.

## Seam 1 — campaign command: not duplicated

`BulkMessageDialog.tsx`'s `sendMutation` (lines 236–325) is the only
campaign-creation call site: insert draft `broadcast_campaigns` row → upload
attachments → `fn_queue_broadcast_campaign` RPC to populate
`broadcast_recipients` from the audience filter → invoke
`send-broadcast-campaign`. `TeamCommunicationsPage.tsx`'s "start new
conversation" is a separate, single-tenant, non-campaign flow with no
`broadcast_campaigns`/`broadcast_recipients` row at all — not a duplicate.

## Seam 2 — participant resolution: still duplicated, already fixed once, one real gap remains

The 2026-08-25 incident's guardrail (batch upsert → catch FK error →
row-by-row retry, logging skipped rows) is present and intact in both
places — it was not reverted or allowed to drift:

| Location | Lines | Pattern |
|---|---:|---|
| `supabase/functions/send-broadcast-campaign/index.ts` | 149–175 | `tenant_users` select → batch `conversation_participants` upsert (`ignoreDuplicates: true`) → on error, per-row retry loop, `console.error` on each skipped row. |
| `src/pages/TeamCommunicationsPage.tsx`'s `NewConversationDialog.handleSubmit` | 866–896 | Byte-for-byte equivalent pattern — same comment content, same fallback shape. |

This is a real duplication risk even though the underlying bug is fixed: a
future edit to one copy (a role filter, a different conflict target) has no
mechanism forcing the other to follow — exactly the failure mode that let
the original bug exist unnoticed in a second call site for as long as it did.
No second copy of the *unfixed* pattern was found; `TeamCommunicationsPage.tsx`'s
other `conversation_participants` writes (lines 379, 399, 432–443, 447) are
single-row calls with no batch-FK exposure.

**A real, currently-live gap found in this pass:** when the row-by-row
fallback skips a participant (no matching `auth.users` row), that tenant's
`broadcast_recipients` row is still marked `sent` and counted in
`total_sent` — only a server-side `console.error` records the skip. Nothing
in `BulkMessageHistory.tsx` (the notification result model UI) or the
success toast ever surfaces it. This is the same class of "no user-facing
signal" gap the 2026-08-25 incident was about, one layer deeper: the
crash-causing failure is fixed, but a silently-skipped individual recipient
still leaves no visible trace anywhere staff would look.

## Seam 3 — notification result model

Two independent result surfaces, fed by different mechanisms:

- **Edge Function response → toast**: `send-broadcast-campaign` returns
  `{ total_sent, total_failed, conversations_created }` — a tenant counts
  as `failed` only if its whole per-tenant `try` block throws (e.g.
  conversation-insert or message-insert failure), never for a
  partially-skipped participant within an otherwise-successful tenant.
  `BulkMessageDialog.tsx`'s `onSuccess` (309–321) turns this into one toast.
- **Read/delivery projection → `BulkMessageHistory.tsx`**: per-recipient
  `broadcast_recipients.delivery_status`/`read_at`/`failure_reason`, fed by
  the idempotent (`read_at IS NULL`-guarded) `fn_mark_conversation_read` RPC.

The `fn_tm_on_message_insert` trigger fans `user_notifications` out off
`conversation_participants` (not `broadcast_recipients` directly), keyed by
`dedupe_key = 'tm:' || message_id || ':' || user_id` with
`ON CONFLICT (dedupe_key) DO NOTHING` (idempotent), wrapped in
`EXCEPTION WHEN OTHERS THEN RAISE WARNING` — notification fan-out is
explicitly best-effort by design, matching the master plan's own note that
this needs a separate atomic-vs-best-effort decision (out of scope here).

## Required characterization — status against the plan's four axes

| Axis | Status |
|---|---|
| Multi-tenant campaign | `send-broadcast-campaign` groups `broadcast_recipients` by `tenant_id` and delivers one conversation per tenant in a loop with per-tenant try/catch — one tenant's failure doesn't affect others. No claim/lock on `campaign_id` guards a duplicate concurrent invocation of the same campaign. |
| Missing auth user | Row-by-row fallback confirmed present and correct in both copies; the gap is visibility, not correctness — see Seam 2 above. |
| Idempotency | The participant upserts (`ignoreDuplicates: true`) and the notification-fan-out trigger (`dedupe_key` + `ON CONFLICT DO NOTHING`) are idempotent. The campaign-send call itself is not fully guarded against a concurrent double-invocation before the status flips from `'queued'` — not verified by any test. |
| Read projection | `fn_mark_conversation_read` → `broadcast_recipients.read_at`, `read_at IS NULL`-guarded, surfaced in `BulkMessageHistory.tsx`. Characterized, no gap found here. |

## Existing test coverage

No dedicated test file exists for this feature area — no `broadcast`,
`campaign`, or `messaging`-named suite in `src/test/`. The only incidental
hit (`src/test/tenant/isolation.test.tsx`, RLS on `conversation_participants`)
is unrelated to broadcast/campaign logic. Same pattern as prior Phase 4
slices: this seam has no existing oracle.

## Recommendation, corrected

The initial framing (extract participant-resolution into "one shared
helper the Edge Function and the browser bundle both call") does not hold
up: there is **no precedent anywhere in this codebase for a Deno Edge
Function importing code from the browser bundle** (`src/`) — confirmed by
searching for any cross-runtime import; none exists. Building that would
mean inventing new build/module-resolution tooling to make Vite and Deno
agree on a shared source file, which is a materially bigger and riskier
undertaking than a bounded Phase 4 seam, not a natural extraction.

**Corrected smallest safe first cut**: fix the real, currently-live gap
found above — a silently-skipped participant should be visible somewhere a
staff member would actually look — in **both** existing copies
independently, each with its own focused test, rather than attempting
genuine code-sharing across runtimes. Concretely: have each fallback path
report its skipped-recipient count/reason back to the caller (the Edge
Function via its existing response payload; `TeamCommunicationsPage.tsx`
via its own toast), and have `send-broadcast-campaign` include skip
information in `broadcast_recipients.failure_reason` (already an existing
column) for skipped rows rather than marking them plain `sent`. This is a
real bug fix with a clear before/after, not a deduplication exercise — the
duplication itself is deferred as a known, accepted risk unless a future
session decides genuine cross-runtime sharing is worth building.

Required oracle: focused tests per the characterization-oracle rule — for
the Edge Function side, a mixed-batch test (valid + one missing-auth-user
row) asserting the skip is surfaced in the response/`failure_reason`, not
just logged; for `TeamCommunicationsPage.tsx`'s side, an equivalent
component/unit test plus a scoped authenticated read-only Playwright check
if the fix touches visible toast/UI copy. The campaign/tenant double-
invocation idempotency gap and the notification-fan-out atomicity decision
are both explicitly deferred as separate, larger follow-ups — they touch
trigger semantics and require a product decision on failure-mode tolerance,
not just a bounded code fix.

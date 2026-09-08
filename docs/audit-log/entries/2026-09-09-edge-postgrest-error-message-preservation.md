# Preserve PostgREST messages in typed Edge Function catches

**Date:** 2026-09-09

**Packet:** Phase 2.6 P5-A follow-up — typed Edge Function error handling

**Scope:** `generate-meeting-recurrence`, `add-missing-packages`,
`send-action-item-due-reminders`, and `sync-clickup-time`

**Hosted state changed:** no — code and tests only; no deployment, schema,
RLS, migration, or production-data operation was performed.

## Decision

PostgREST query calls return plain message-bearing result objects unless
`.throwOnError()` is used. The recent `catch (unknown)` cleanup narrowed only
with `instanceof Error`, changing those objects' useful database messages to
`Unknown error` or `[object Object]` in the affected error responses.

Added a shared structural `getErrorMessage` guard that preserves native
`Error` messages and string `.message` values on PostgREST results, with safe
fallbacks for other thrown values. Focused Node tests cover both forms and
the fallback behavior. The audit checked the other recent Edge typing edits;
they either wrap query errors in `new Error`, read `.message` structurally, or
do not expose a caught error message, so no further files were changed.

## Postflight

- Focused shared-helper and auth-gate tests passed.
- `npm run lint:ratchet`, `npm run lint`, `npm run typecheck`,
  `npm run test:frontend`, `npm run test:edge`, `npm run build`,
  `npm run check:kb-links`, and the KB document-size check passed.
- No authenticated browser run was needed: this is a server-side error
  normalization change with no route, auth, tenant-scope, or data behavior
  beyond preserving an existing error message.

# Audit: 2026-05-13 — TICKET-008 RPC error UX

**Trigger:** TICKET-008 (P1) from the 12 May 2026 deployment status audit — RPC error UX partial; invite/resend/revoke mutations already fixed; other callers showing generic hardcoded messages not yet audited.
**Author:** Carl
**Scope:** `src/hooks/useTimeInbox.tsx` — all toast error descriptions on RPC call failures. No migration, no RLS changes, no other files modified.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Background

The deployment status audit flagged TICKET-008 as partial: the invite/resend/revoke mutations had already been updated to use `extractEdgeError()` to surface structured error detail, but a codebase-wide sweep of other RPC callers had not been done. An Explore agent audit identified `src/hooks/useTimeInbox.tsx` as the only file with multiple generic hardcoded toast descriptions on RPC error paths.

The correct pattern (already used on line 157 of the file at audit time) is:
```typescript
toast({ title: 'Error', description: error.message || 'Failed to update draft', variant: 'destructive' });
```

---

## Findings

- **10 RPC call sites in `useTimeInbox.tsx`** — 3 already used `error.message || '...'`, 7 used hardcoded strings with no error detail surfaced.
- **First pass (Prompt 1):** targeted lines 99, 182, 211 — the three identified in the initial audit. Lovable confirmed these were already fixed in `origin/main` at `e4ac6a3e` ("Made the requested updates") — the file had advanced beyond the local copy used for the audit. Local was 20+ commits behind origin.
- **Second pass (Prompt 2):** origin/main inspection via `git show` revealed 7 further hardcoded strings in bulk/snooze operations added in recent commits (lines 236, 272, 297, 321, 349, 373, 403). All 7 fixed in a single Lovable prompt.
- **No `extractEdgeError` usage needed** — `useTimeInbox.tsx` calls Postgres RPCs directly (not Edge Functions), so `error.message` is the correct surface point. `extractEdgeError` applies to Edge Function `context` payloads only.

---

## Code changes shipped

### Pass 1 — already applied (commit `e4ac6a3e`)

- Line 99: `'Failed to load drafts'` → `error.message || 'Failed to load drafts'`
- Line 183: `'Failed to post draft'` → `error.message || 'Failed to post draft'`
- Line 213: `'Failed to discard draft'` → `error.message || 'Failed to discard draft'`

### Pass 2 — bulk/snooze operations

- Line 236: `'Failed to post drafts'` → `error.message || 'Failed to post drafts'`
- Line 272: `'Failed to update drafts'` → `error.message || 'Failed to update drafts'`
- Line 297: `'Failed to update drafts'` → `error.message || 'Failed to update drafts'`
- Line 321: `'Failed to apply suggestion'` → `error.message || 'Failed to apply suggestion'`
- Line 349: `'Failed to discard drafts'` → `error.message || 'Failed to discard drafts'`
- Line 373: `'Failed to snooze draft'` → `error.message || 'Failed to snooze draft'`
- Line 403: `'Failed to snooze drafts'` → `error.message || 'Failed to snooze drafts'`

All 10 RPC error paths in `useTimeInbox.tsx` now surface `error.message` with a hardcoded fallback. Pattern is consistent with line 157 (`error.message || 'Failed to update draft'`) which was the pre-existing correct example.

---

## KB changes shipped

- `unicorn-kb` PR #34 (`kb/function-search-path-hardening`) — function `SET search_path` hardening conventions, P1-e-ii open decision, Lovable prompt guardrail. Raised during this session following Dave's feedback on P1-e. Not directly related to TICKET-008 but recorded here as same-session KB work.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` — local branch was 20+ commits behind `origin/main` at session start. Pass 1 targets already fixed in `e4ac6a3e`. Pass 2 applied to current `origin/main`.
- `useTimeInbox.tsx` has grown substantially since the 12 May deployment status audit — bulk post, bulk discard, bulk snooze, apply-suggestion operations all added. These introduced the 7 new generic messages.
- `extractEdgeError` remains scoped to `useInviteMutations.ts` — appropriate, as it targets Edge Function error envelopes specifically.

---

## Decisions

- `error.message || '<fallback>'` adopted as the standard for all RPC error toasts in `useTimeInbox.tsx`. Fallback string preserved so the toast is never blank if `error.message` is undefined.
- No `extractEdgeError` applied — not an Edge Function caller.
- No sweep of other hooks warranted at this time — the Explore agent audit confirmed the remainder of the codebase uses `throw error` + `useMutation onError` (which surfaces `error.message` automatically) or fire-and-forget patterns on non-user-facing operations.

---

## Open questions parked

None. TICKET-008 fully closed.

---

## Tag

`audit-2026-05-13-ticket-008-rpc-error-ux`

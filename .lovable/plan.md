# Fix: Vivacity staff risks/opportunities missing from L10 IDS queue

## Root cause (confirmed)

In `src/hooks/useMeetingIssues.tsx`, the query applies `.eq('tenant_id', tenantId)` at the top level. Items created by Vivacity staff on `/risks-opportunities` are stored with `tenant_id = null` (staff profiles have no tenant), so they are silently filtered out even though they are valid backlog items (`meeting_id = null`, `status = 'Open'`).

DB confirms exactly the 2 affected items:
- `0b1bd82c…` — "Rocks must align to Company Goals…" (Open, no meeting, no tenant)
- `5a7a9530…` — "WrkPod Week" (Open, no meeting, no tenant)

Other null-tenant rows are either `Closed`/`In Review` or already attached to a specific meeting — none of those should leak into the backlog and the existing conditions already exclude them.

## Change (single file)

`src/hooks/useMeetingIssues.tsx` — replace the combined `.eq('tenant_id', …)` + `.or(…)` pair with a single nested `.or(…)` that allows null tenant only on the backlog branch:

```text
.or(
  `meeting_id.eq.${meetingId},` +
  `and(meeting_id.is.null,status.eq.Open,or(tenant_id.eq.${tenantId},tenant_id.is.null))`
)
```

And remove the now-redundant top-level `.eq('tenant_id', tenantId)` (it would otherwise cancel the nested null match). Tenant scoping is still enforced on the "this meeting" branch by the meeting itself (a meeting belongs to one tenant) and, defence-in-depth, by RLS on `eos_issues` which already prevents cross-tenant leakage to client users.

Everything else in the hook (ordering, `enabled`, return shape) stays identical.

## Why this is safe

- **Client isolation**: RLS on `eos_issues` is the authoritative boundary. Client (non-Vivacity) users cannot see `tenant_id IS NULL` rows regardless of what the query asks for. The hook change only widens what staff can see, which matches intent.
- **Status guard preserved**: `status.eq.Open` stays inside the `and(...)`, so Closed/In Review null-tenant rows (the majority of current null-tenant rows) remain excluded.
- **Meeting-scoped null-tenant rows**: rows with `tenant_id = null` AND a non-null `meeting_id` only appear via the `meeting_id.eq.${meetingId}` branch, so they stay confined to their meeting.
- **Backlog vs This-Meeting badges** in `IssuesQueue.tsx` use `issue.meeting_id === currentMeetingId`; unaffected.
- **Stats/counts** derive from the same array; will update automatically.
- **`/risks-opportunities` page** uses `useRisksOpportunities`, not touched.

## Verification

1. Open an L10 meeting as a Vivacity SuperAdmin → confirm the 2 null-tenant Open items appear in the queue with the "Backlog" badge.
2. Confirm a tenant-scoped Open backlog item (any existing `meeting_id IS NULL, status='Open', tenant_id=<tenantId>`) still appears.
3. Confirm a null-tenant `Closed`/`In Review` item does NOT appear.
4. Confirm a null-tenant item that has `meeting_id` set to a *different* meeting does NOT appear in this meeting's queue.
5. Sign in as a client Admin for a different tenant → confirm null-tenant items do not appear (RLS guard).

## Risk assessment

- **Scope**: 1 file, 1 query expression. No schema, RLS, types, or component changes.
- **Backward compatibility**: superset of previous results for staff; identical results for client users (blocked by RLS).
- **Audit/compliance**: read-only query change; no audit trail impact.
- **Performance**: nested `or` adds one boolean check; negligible on `eos_issues` volume.
- **Residual risk**: low — only behavioural risk is exposing more null-tenant Open items to staff, which is the desired fix.

## Out of scope (intentionally not touched)

- RLS policies on `eos_issues`
- `useRisksOpportunities`
- `IssuesQueue.tsx` badge/stat logic
- Any other issue-fetching hook
- New tables, columns, or hooks

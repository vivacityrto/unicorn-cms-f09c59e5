## Goal
Stop the linked-email list from going blank when navigating between clients, by scoping React Query invalidations and adding cache lifetime to `useLinkedEmails`.

## Single file touched
`src/hooks/useLinkedEmails.tsx`

## Changes

### 1. Scoped invalidation helper (DRY)
Add a small inline helper inside the hook so all three invalidation sites use the same logic:

```ts
const invalidateLinkedEmails = () => {
  if (options?.clientId !== undefined) {
    queryClient.invalidateQueries({
      queryKey: ["linked-emails", options.clientId, options.packageId, options.taskId],
    });
  } else {
    queryClient.invalidateQueries({ queryKey: ["linked-emails"] });
  }
};
```

Replace the three existing `queryClient.invalidateQueries({ queryKey: ["linked-emails"] })` calls (in `linkEmailMutation.onSuccess`, `updateLinkMutation.onSuccess`, and the enrichment `useEffect`) with `invalidateLinkedEmails()`.

This matches the spec exactly while avoiding three copies of the same branching block.

### 2. Cache lifetime on the list query
Add to the existing `useQuery`:

```ts
staleTime: 5 * 60 * 1000,
gcTime: 10 * 60 * 1000,
```

## Verified call sites (confirms backward compatibility)
- `LinkedEmailsList.tsx` → `useLinkedEmails({ clientId })` — scoped invalidation hits its exact key.
- `ClientEmailsTab.tsx` → `useLinkedEmails({ clientId: tenantId })` — scoped; manual `refetch()` unaffected.
- `ClientStructuredNotesTab.tsx` → `useLinkedEmails({ clientId: tenantId })` — scoped invalidation refreshes its badge.
- `LinkEmailModal.tsx` → `useLinkedEmails()` (no options) — falls through to broad invalidation, preserving today's behaviour.

## Edge cases handled
- `packageId` / `taskId` undefined → keys match the `useQuery` key shape `["linked-emails", clientId, packageId, taskId]` exactly, so invalidation lands.
- Enrichment effect fires on every hook instance; scoping prevents cross-client cache churn but still refreshes the active client.
- `updateLinkMutation` (currently unused in UI) future-proofed with same pattern.

## Out of scope (explicitly not touched)
`LinkEmailModal.tsx`, `ClientEmailsTab.tsx`, `ClientStructuredNotesTab.tsx`, `LinkedEmailsList.tsx`, edge functions, migrations, RLS.

## Risk assessment
- **Low.** Pure client-side cache-key change plus standard staleTime/gcTime. No data, auth, or RLS impact. Broad fallback preserved for the only unscoped caller (`LinkEmailModal`). Worst case if a future caller passes only `packageId`/`taskId` without `clientId`: it falls through to broad invalidation (today's behaviour) — safe.

## Benefits
- Per-client cache survives navigation; no more empty-list flash.
- 5-min `staleTime` cuts redundant network round-trips when toggling tabs.
- 10-min `gcTime` keeps recently viewed clients warm in memory.
- Enrichment no longer thrashes unrelated clients' caches.

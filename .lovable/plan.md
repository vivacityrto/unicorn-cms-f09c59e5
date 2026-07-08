# Fix Retry button count to match its "Failed & Pending" label

Single frontend edit in `src/pages/BulkDocumentJobProgress.tsx`. No logic changes to retry gating, RPC, or elsewhere.

## Change

Right after the existing `eligibleRetry` computation, add a second count `remainingWork` that additionally includes plain `pending` items:

```ts
const remainingWork = items.filter(
  (i) =>
    i.state === "pending" ||
    i.state === "failed" ||
    i.state === "cancelled" ||
    (i.state === "leased" &&
      i.lease_expires_at !== null &&
      new Date(i.lease_expires_at).getTime() < nowMs),
).length;
```

Leave `eligibleRetry` and `canRetry = eligibleRetry > 0 || isStalled` unchanged — they still correctly gate whether the Retry button is enabled (the RPC only resets failed/cancelled/expired-leased).

Update the Retry button label to display `remainingWork` instead of `eligibleRetry`:

```tsx
Retry Failed & Pending{remainingWork > 0 ? ` (${remainingWork})` : ""}
```

## Out of scope

- No changes to `retry_bulk_document_job` RPC, worker, launcher, or gating logic.
- No changes to any other counts, tiles, or bars.

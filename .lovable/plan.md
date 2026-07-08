# Proactive session refresh + surface stall reason

Frontend-only. Two files.

## 1. `src/components/documents/bulk-generate/useBulkGenerateLauncher.ts`

Add a small helper:

```ts
async function refreshSessionBestEffort() {
  try {
    await supabase.auth.refreshSession();
  } catch (e) {
    console.warn("[bulk-generate] refreshSession failed; proceeding anyway", e);
  }
}
```

Call it at the top of the three functions that kick off the worker — `launcherCreate`, `launcherCreateTargeted`, and `launcherRetry` — immediately before their `invokeLauncher(...)` call. Convert each to an `async` function so we can `await` the refresh, keeping the same return type.

Do **not** modify `launcherCancel`, `launcherPreview`, or `launcherPreviewTargeted`.

## 2. `src/pages/BulkDocumentJobProgress.tsx`

Add a helper co-located near `errorCodeLabel` (or just above the component):

```ts
function stalledReasonLabel(reason: string): string {
  switch (reason) {
    case "jwt_near_expiry":
      return "Stalled — session token expired mid-run";
    default:
      return `Stalled — ${reason}`;
  }
}
```

Next to the existing `<JobStatusPill status={job.status} />` in the header, render:

```tsx
{job.status === "stalled" && job.error_summary?.stalled_reason ? (
  <span className="text-xs text-muted-foreground">
    {stalledReasonLabel(job.error_summary.stalled_reason as string)}
  </span>
) : null}
```

`job.error_summary` already comes back from the existing `select("*")` — no query changes.

## Out of scope

- No changes to `launcherCancel`, worker, RPCs, schema, RLS, or edge functions.
- No new queries.

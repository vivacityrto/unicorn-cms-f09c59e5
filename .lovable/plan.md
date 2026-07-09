## Fix: Surface real edge-function error messages in GovernancePublishDialog

### Problem
In `src/components/governance/GovernancePublishDialog.tsx`, `handlePublish` treats non-2xx responses from the `import-sharepoint-template` edge function as thrown errors (supabase-js populates `error`, not `data`). The current `catch` block shows only `err.message`, which is the generic `"Edge Function returned a non-2xx status code"`. The actual reason (missing mappings, drift detected, version not found, wrong status) is on the underlying `Response` at `err.context` and never reaches the user. The `if (data?.error)` branch below `throw error` is unreachable for these cases.

### Change
Replace the `catch` block (lines 41–45) in `handlePublish` to read the JSON body from `err.context` before falling back:

- Try `await err.context.json()`.
- If the body has `error`, use it as the message and read `drift_detected`.
- If drift → `setDriftError(message)`; else → `toast.error(message)`.
- If parsing fails → fall back to `err.message || 'Publish failed'` via `toast.error`.
- Keep `finally { setPublishing(false) }`.

### Scope
- Single file: `src/components/governance/GovernancePublishDialog.tsx`
- Only the `catch`/`finally` in `handlePublish`. The existing `if (data?.error)` block stays untouched (still valid for any future 2xx-with-error-shape responses).
- No changes to the edge function, no schema changes, no other components.

## PART A — Migration
Add nullable `action_link text` column to `public.cohort_send_job_items` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. No other schema changes; no GRANT/RLS changes needed (existing table policies apply).

## PART B — `supabase/functions/cohort-access-sender-worker/index.ts`
After the `record_cohort_item_outcome` RPC call (line 149-151), add:

```ts
if (payload?.ok === true && typeof payload?.action_link === "string" && payload.action_link.length > 0) {
  await admin
    .from("cohort_send_job_items")
    .update({ action_link: payload.action_link })
    .eq("id", item.id);
}
```

Uses the existing `admin` service-role client. No-op for `send-password-reset` (never returns action_link).

## PART C — `src/pages/admin/CohortAccessSenderJob.tsx`
1. Add `action_link: string | null` to the `Item` interface (line 34-45). `.select("*")` already covers it.
2. Add a `Copy` icon to lucide-react import (line 12).
3. Add `<TableHead>Link</TableHead>` after the "Reason" header (after line 221).
4. Add a corresponding `<TableCell>` after the Reason cell (after line 239) rendering a small `Copy` button when `it.action_link` is truthy. On click:
   - `await navigator.clipboard.writeText(it.action_link)` then toast `"Link copied — send via Teams or email."`
   - On failure, toast showing the link text so user can copy manually.
5. In `exportCsv` (lines 121-134): add `"action_link"` to headers after `"reason"`, and add `it.action_link ?? ""` to the row array in the matching position.

No other files touched.

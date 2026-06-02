### 1. Frontend — `src/pages/admin/CohortAccessSender.tsx`

- **State**: `const [selectedPreviewUuids, setSelectedPreviewUuids] = useState<Set<string>>(new Set())`.
- After `setPreview(data)` in `runPreview`, call `setSelectedPreviewUuids(new Set(data.map(r => r.user_uuid)))` (all opted-in by default). Also clear it in any flow that clears `preview`.
- **Checkbox column** as first column of preview table:
  - Header: master checkbox driving Select All / Deselect All across the full resolved array (not just the visible `.slice(0, 25)`), matching the existing tenant picker checkbox pattern. Show indeterminate / checked when `selectedPreviewUuids.size === preview.length`.
  - Body: per-row `Checkbox` toggling `user_uuid` membership in the set.
- **previewSummary** counts only rows where `selectedPreviewUuids.has(r.user_uuid)`. Badges and `expectedConfirm` derive from this.
- **Selection-change side effect**: a `useEffect` on `selectedPreviewUuids` calls `setConfirmText("")` so the user must retype confirmation whenever selection changes.
- **Launch**:
  - Pass `p_include_uuids: Array.from(selectedPreviewUuids)` to the `launch_cohort_job` RPC only when the selection differs from the full resolved set (otherwise omit / pass `null`).
  - Disable Launch button when `selectedPreviewUuids.size === 0` and show inline warning: "No recipients selected."

**Unchanged**: filter UI, `resolve_cohort` call, recent jobs list, job results table, toasts, navigation.

### 2. Migration — extend `public.launch_cohort_job`

Replace the existing function with one extra trailing parameter:

```sql
CREATE OR REPLACE FUNCTION public.launch_cohort_job(
  p_action       text,
  p_filter       jsonb,
  p_cap          int    DEFAULT 1000,
  p_batch_size   int    DEFAULT 10,
  p_throttle_ms  int    DEFAULT 400,
  p_notes        text   DEFAULT NULL,
  p_include_uuids uuid[] DEFAULT NULL
)
```

Inside the `resolved` CTE add a filter:

```sql
WITH resolved AS (
  SELECT *
  FROM public.resolve_cohort(p_filter, LEAST(GREATEST(COALESCE(p_cap,1000),1),1000)) r
  WHERE p_include_uuids IS NULL OR r.user_uuid = ANY(p_include_uuids)
)
```

Everything else in the function body is preserved verbatim (job insert, item insert with routing matrix, totals update, audit row). Behaviour with `p_include_uuids = NULL` is identical to today.

Re-issue grants for the new signature:

```sql
REVOKE ALL    ON FUNCTION public.launch_cohort_job(text,jsonb,int,int,int,text,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.launch_cohort_job(text,jsonb,int,int,int,text,uuid[]) TO authenticated;
```

Drop the old 6-arg signature to avoid ambiguity:

```sql
DROP FUNCTION IF EXISTS public.launch_cohort_job(text,jsonb,int,int,int,text);
```

### Out of scope
No changes to `resolve_cohort`, `lease_cohort_job_items`, tables, RLS, or any other RPC. No new env vars or secrets.
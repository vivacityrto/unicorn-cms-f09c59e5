# Audit: 2026-05-25 — BUG-008, CSC-017 — Preview Session Cleanup & Portal Preview Simplification

**Trigger:** Lovable production DB change session — audit trail hygiene (BUG-008) and portal preview UX simplification (CSC-017).  
**Author:** Khian (Brian)  
**Scope:** `audit_client_impersonation` backfill + cron job (BUG-008); `ViewAsClientButton.tsx` portal preview flow simplification (CSC-017). No other tables, hooks, or components touched.  
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### BUG-008 — Staff preview sessions missing `ended_at`

**Problem:** `audit_client_impersonation` had accumulated 78 rows with `ended_at IS NULL`, the oldest dating to 9 February 2026. `endPreview()` in `ClientPreviewContext.tsx` is the only writer that sets `ended_at`, and it only fires when a staff member explicitly clicks "End Preview". Tab closes, browser crashes, hard navigations, and SSO logouts all leave rows permanently open. No server-side janitor existed.

**Database state at diagnosis:**

| Metric | Value |
|--------|-------|
| Total rows | 239 |
| Rows with `ended_at` set | 161 (67%) — correctly closed via `endPreview()` |
| Rows with `ended_at IS NULL` | 78 (33%) — orphaned |
| Oldest orphaned session | 2026-02-09 |
| Newest orphaned session | 2026-05-22 |
| Sessions from last 24h | 0 — safe to backfill all |

**Age distribution of 78 orphaned rows:**
- 3 from last 7 days (all ≥ 3 days old)
- 50 from 7–30 days ago
- 25 from 30+ days ago

**RLS check:** Five policies confirmed intact — two INSERT (staff only), two SELECT (super admin or vivacity team), one UPDATE (`is_staff() AND actor_user_id = auth.uid()`). Cron runs as `postgres` (bypasses RLS — correct for maintenance). No cross-tenant risk.

**Triggers:** None on `audit_client_impersonation` — confirmed via `pg_trigger` join.

**Blast radius:** Single table, single code file (`ClientPreviewContext.tsx`). The frontend never reads `ended_at` from the DB — it stores session state in `sessionStorage`. If a staff member clicks "End Preview" after the cron has already stamped `ended_at`, the `endPreview()` UPDATE overwrites with the real end time. No stat cards, realtime handlers, or other consumers depend on this table.

**Fix — migration `20260524233113_6d6c2df3-df44-4f9f-b4d2-d042c3d67698.sql`:**

Statement 1 — backfill:
```sql
UPDATE public.audit_client_impersonation
SET ended_at = started_at + INTERVAL '4 hours'
WHERE ended_at IS NULL
  AND started_at < NOW() - INTERVAL '4 hours';
```
Expected affected rows: 78 (all confirmed older than 4 hours at time of migration).

Statement 2 — recurring janitor (cron job 12):
```sql
SELECT cron.schedule(
  'close-stale-preview-sessions',
  '0 */4 * * *',
  $$
    UPDATE public.audit_client_impersonation
    SET ended_at = started_at + INTERVAL '4 hours'
    WHERE ended_at IS NULL
      AND started_at < NOW() - INTERVAL '4 hours';
  $$
);
```
Runs at 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC. Idempotent — once `ended_at` is set, the WHERE clause excludes the row. Fully qualified `public.audit_client_impersonation` in job body per project convention.

**Post-deploy verification:**
```sql
SELECT COUNT(*) FROM audit_client_impersonation WHERE ended_at IS NULL;
-- Result: 0 ✅

SELECT jobid, jobname, schedule, active FROM cron.job 
WHERE jobname = 'close-stale-preview-sessions';
-- Result: jobid=12, active=true ✅
```

**Note on `reason` column:** All 239 rows (both backfilled and previously closed) have `reason = NULL`. This is expected — the reason popup was removed from portal preview as part of CSC-017 (same session). The column is retained in the schema; `reason` is still recorded as optional for Academy preview sessions via the acting-user dialog.

---

### CSC-017 — Simplified portal preview (removed reason popup for portal mode)

**Problem:** The "View Client Portal" path in `ViewAsClientButton.tsx` previously opened a dialog requiring staff to enter a reason before preview started. This added friction for the common case (portal preview) and was inconsistent with the audit logging approach — `audit_client_impersonation` records the session regardless of whether a reason is entered.

**Fix — `src/components/client/ViewAsClientButton.tsx` (single file, no migration):**

Portal preview path (`mode === "portal"` and not `isAcademyOnly`) now calls `startPreview()` directly without opening the dialog:
```ts
const success = await startPreview(tenantId, undefined, null);
```
Session is created and user is navigated to `/client-preview` immediately.

Academy preview path (`mode === "academy"` or `isAcademyOnly`) is unchanged — the dialog still opens to allow acting-user selection. The reason field remains in the dialog as optional for Academy sessions.

**What did NOT change:**
- `ClientPreviewContext.tsx` — `startPreview()` and `endPreview()` untouched
- `audit_client_impersonation` INSERT — still fires on every preview start, `reason` stored as NULL for portal sessions
- RLS policies — unchanged
- Academy preview flow — unchanged

**Blast radius:** Single file, frontend only. No DB migration. No hooks, contexts, or other components affected.

**Codebase commit:** `34699a10`

---

## KB changes shipped

- No KB changes this session.

## Codebase observations

- `unicorn @ 701fda39` — BUG-008 migration committed (closed orphan preview sessions)
- `unicorn @ 34699a10` — CSC-017 portal preview simplification (ViewAsClientButton.tsx)

## Decisions

- **4-hour timeout chosen** for stale session cutoff — matches the suggestion in BugOrganisation.md and is conservative relative to any realistic continuous preview session. The frontend localStorage handoff cap (`HANDOFF_MAX_AGE_MS`) is 12 hours; the 4-hour cron is more aggressive, which is correct for audit hygiene.
- **Cron over edge function** — the UPDATE is simple enough to run inline via `pg_cron`. No new edge function needed.
- **Reason popup removed for portal only** — Academy preview retains the dialog because it serves a functional purpose (acting-user picker), not just for reason capture.

## Open questions parked

- `reason` column on `audit_client_impersonation` is now always NULL for portal sessions and optional for Academy sessions. If audit compliance ever requires mandatory reason capture, this would need revisiting. Not flagged as a risk at this time.
- BUG-020 (secondary contact invite permission split) remains open — Angela confirmation still required before fixing.

## Tag

`audit-2026-05-25-bug-008-csc-017-preview-session-cleanup`

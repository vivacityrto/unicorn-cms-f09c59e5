# Audit: 2026-06-02 — Governance Documents Dedup Fix

**Date:** 2 June 2026
**Author:** Carl
**Type:** Bug fix — Lovable production DB change session (1 migration, view replacement only)
**Repos touched:** `unicorn-cms-f09c59e5` (Lovable)

---

## What shipped

### Problem

The client Governance Documents page (`/client/governance-documents`) was displaying each document twice for affected tenants. Platform-wide scope: **5,231 duplicate `(tenant_id, document_id)` groups** and **6,785 extra rows** in the view at time of fix.

Two distinct root causes both reduce to the same structural gap:

1. **Package transitions** (e.g. M-AM → M-RR): when a tenant moves from one package to another, `start_client_package` inserts new `document_instances` rows for the new stage but does not supersede or retire the old rows. Both old and new instances land as `status = 'generated'`. Test RTO A (tenant 7517) is this pattern — M-AM (`complete`, started Aug 2025) and M-RR (`active`, started May 2026) both have `status = 'generated'` rows for each of the 23 documents.

2. **Annual renewal cycles** (e.g. M-RC run multiple times): the same package renews each year, creating a new `package_instance` → `stage_instance` → `document_instances` chain each time. All prior cycles eventually reach `membership_state = 'complete'`. Tenant 6328 had up to 7 `complete` M-RC cycles, all surfacing in the view.

The `v_client_governance_documents` view grouped by `di.id`, so every `document_instances` row was a separate output row. The `STRING_AGG(DISTINCT p.name) ... WHERE pi.membership_state = 'active'` JOIN predicate only silenced the package name on old rows — it didn't remove them.

### Investigation

Analysis identified 170+ affected tenants. Distribution of generated `document_instances` by package state:

| `membership_state` | Instances | Tenants |
|---|---|---|
| `complete` | 12,454 | 274 |
| `active` | 10,113 | 59 |
| `cancelled` | 651 | 5 |
| `paused` | 407 | 2 |

80% of tenants have generated documents only on `complete` packages — filtering to `active` only would have hidden documents for 242 of 301 tenants.

### Fix — `v_client_governance_documents` view rewrite

Replaced `STRING_AGG` grouping approach with a `ROW_NUMBER()` window function that deduplicates to **one row per `(tenant_id, document_id)`**, keeping the instance from the latest non-cancelled `package_instance` (ordered by `pi.start_date DESC NULLS LAST`, `pi.id DESC NULLS LAST`, `di.id DESC`).

`cancelled` is the only excluded state. `complete`, `active`, `paused`, `at_risk`, `warning` all remain visible — essential given the 80% `complete`-only distribution.

```sql
CREATE OR REPLACE VIEW public.v_client_governance_documents
WITH (security_invoker = true)
AS
WITH ranked AS (
  SELECT
    di.id, di.tenant_id, di.document_id, di.generationdate,
    di.generated_file_url, di.status, di.document_title, di.stageinstance_id,
    pi.id AS pi_id, pi.start_date AS pi_start_date, p.name AS package_name,
    ROW_NUMBER() OVER (
      PARTITION BY di.tenant_id, di.document_id
      ORDER BY pi.start_date DESC NULLS LAST, pi.id DESC NULLS LAST, di.id DESC
    ) AS rn
  FROM public.document_instances di
  LEFT JOIN public.stage_instances   si ON si.id = di.stageinstance_id
  LEFT JOIN public.package_instances pi ON pi.id = si.packageinstance_id
                                       AND pi.membership_state <> 'cancelled'
  LEFT JOIN public.packages          p  ON p.id  = pi.package_id
  WHERE si.id IS NULL OR pi.id IS NOT NULL
)
SELECT r.id, r.tenant_id, r.document_id, r.generationdate, r.generated_file_url,
       r.status, r.document_title, d.title AS doc_title, d.description,
       d.category, d.framework_type, r.package_name AS active_package_names
FROM ranked r
JOIN public.documents d ON d.id = r.document_id
WHERE r.rn = 1;

GRANT SELECT ON public.v_client_governance_documents TO authenticated;
GRANT SELECT ON public.v_client_governance_documents TO service_role;
```

`WHERE si.id IS NULL OR pi.id IS NOT NULL` excludes `document_instances` whose only linked `package_instance` is `cancelled` (LEFT JOIN returns `pi.id = NULL` after the `<> 'cancelled'` predicate). Standalone documents (`stageinstance_id IS NULL`) survive via `si.id IS NULL`; 0 exist in production today.

Column shape is unchanged (`active_package_names` drops from `STRING_AGG` to single latest name — same `text` type). No frontend or TypeScript type changes required.

`security_invoker = true` preserved — underlying `document_instances` RLS unchanged.

---

## Changes

### Migration
- Lovable migration (exact filename to be confirmed post-fetch) — `CREATE OR REPLACE VIEW public.v_client_governance_documents` rewrite + `GRANT SELECT` re-application to `authenticated` and `service_role`

### No other changes
- No frontend files
- No edge functions
- No schema or data changes

**Codebase at close:** `unicorn-cms-f09c59e5 @ 54c1fbb8c4c49ce40d4bd605e6b2a61167015239` (pre-migration fetch; Lovable commit SHA unavailable due to network at audit time — verify via `git log origin/main` in `unicorn-cms-f09c59e5`)

---

## Key decisions made this session

- **Exclude `cancelled` only, not `complete`** — 80% of tenants have generated documents only on `complete` packages. Filtering to `active` only would have hidden documents for 242/301 tenants. Confirmed with Carl before implementation.
- **ROW_NUMBER() over DISTINCT ON** — Both approaches produce one row per `(tenant_id, document_id)`. `ROW_NUMBER()` in a CTE is more explicit about the tiebreaker ordering and easier to reason about for future maintainers.
- **No data fix** — Old `document_instances` rows are left as-is. The view fix is the correct boundary: the generation pipeline's lack of supersession logic is a separate problem for a future session.
- **No pipeline fix in scope** — `start_client_package` does not supersede prior instances when a new package is started. This is the underlying structural gap. Deferred — the view fix resolves the client-facing symptom immediately.

---

## Verification

Pre-deploy baseline (independent query on `yxkgdalkbrriasiyyrwk`):
- Duplicate `(tenant_id, document_id)` groups: **5,231**
- Extra rows: **6,785**
- Tenant 7517 total view rows: 484
- Tenant 6328 total view rows: 2,149

Post-deploy independent verification (all passed ✅):
- **3a**: 0 duplicate `(tenant_id, document_id)` groups, 0 extra rows
- **3b**: Tenant 7517 (Test RTO A) — 23 rows, 23 distinct docs, all M-RR
- **3c**: Tenant 6328 — 1 row per document, all M-RC (Lovable confirmed 60 rows / 60 distinct docs)
- **3d**: Tenant 6328 rows match latest non-cancelled `package_instance` — 0 mismatches
- **3e**: Standalone docs (`stageinstance_id IS NULL`) in view — 0

---

## Open questions parked

- **Pipeline fix** — `start_client_package` does not mark prior `document_instances` as superseded when a tenant moves to a new package. This means re-running a bulk generation or starting another package cycle will continue to produce new instances without retiring old ones. The view fix prevents client-visible duplicates, but the underlying data accumulation continues. A future session should add supersession logic to `start_client_package`.
- **`generate_item_id` sparseness** — Only 201 of 23,598 `document_instances` have `generated_item_id` populated (noted in the 29 May audit). If this column is meant to be stamped on generation, there may be a gap in `deliver-governance-document`. Parked.
- **`invite-cleanup-daily-summary` 401** — Edge function returning 401 on daily cron run (spotted in Supabase logs during a separate review). May be related to the 31 May invite flow changes. Cron secret needs checking. Parked.

## Tag
audit-2026-06-02-governance-documents-dedup-fix

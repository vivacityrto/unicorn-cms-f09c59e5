# Audit: 2026-05-14 — `eos_rocks.client_tenant_id` RPC rebind (Path C)

**Trigger:** Drift-surfaced. The 14 May 2026 `eos_rocks.client_id → client_tenant_id` rename audit parked "EOS RPCs unmigrated from `clients_legacy`" as a follow-up because two `SECURITY DEFINER` functions (`cascade_items`, `get_client_eos_overview`) still referenced the renamed column. Live verification confirmed both functions threw "column client_id does not exist" the moment they hit the `eos_rocks` code path. This session applies the minimal patch (Path C of three options surfaced during scope discussion).
**Author:** Carl
**Scope:** Two `CREATE OR REPLACE FUNCTION` statements in a single migration. One eos_rocks column reference and one value bridge per function (`cascade_items` rock branch; `get_client_eos_overview` rocks count subqueries — 2). No table changes, no RLS changes, no frontend changes, no edge function changes. Legacy UUID model deliberately retained on `eos_issues`, `eos_todos`, `eos_meetings`, `users`, `eos_item_clients`.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Findings

- **The two functions broke as a direct consequence of the 13 May rename.** Pre-rename, the rocks code paths were already broken (UUID args vs integer column since 13 Feb 2026). Post-rename, they were *more* broken (column not found). The rename audit had explicitly listed both as "do not touch this session" — that decision was correct at the time, but it left a known regression for this session to clean up.
- **The client-viewer EOS feature is dead-but-routed.** Pre-flight confirmed: `cascade_items` has **zero frontend callers**; `get_client_eos_overview` has exactly one caller (`src/pages/ClientEosOverview.tsx:35`), and that caller is gated `enabled: !!profile.client_id`. `users.client_id` is populated on **0 of 502 rows** in live, so the gate never opens. Effectively no caller in production today.
- **Three paths surfaced during scoping.** Path A (resurrect the feature on the new model — requires product decision); Path B (tear out the dead routes and columns — also requires product decision); Path C (minimal RPC rebind, leave the broader feature alone). Path C chosen to close the regression without making a product call. Path A/B remain parked.
- **The bridge via `tenants.id_uuid` works cleanly.** `tenants.id_uuid uuid NULL` exists for exactly this kind of legacy linkage. Replacing `client_id = $uuid` with `client_tenant_id = (SELECT id FROM public.tenants WHERE id_uuid = $uuid)` is a one-token expansion that preserves the function's external contract (UUID inputs) while writing to the new integer column.
- **Graceful degradation on unresolved UUIDs.** If the caller passes a UUID that doesn't match any `tenants.id_uuid`, the bridge subquery returns NULL. In `cascade_items` that produces a Rock with `client_tenant_id = NULL` (matches the column's documented "NULL for company/team rocks" semantics — an untagged Rock). In `get_client_eos_overview` it produces a `client_tenant_id = NULL` predicate that matches no rows, returning `{active: 0, complete: 0}` for the rocks block. Both are honest degradations; neither errors.
- **`eos_item_clients.client_id` is still UUID.** Confirmed during pre-flight as part of the cascade_items audit. The trailing `INSERT INTO eos_item_clients (..., client_id) VALUES (..., v_client_id)` continues to work on the legacy UUID model — no changes needed there.
- **`SELECT * INTO v_source FROM eos_rocks` keeps working post-rename.** `RECORD` rebinds at runtime; `v_source.title` etc. are unaffected. The function never reads `v_source.client_id`, so no cascade fix is needed for the read side.

---

## DB changes shipped

Single migration: `20260514-065644-038939_rebind_eos_rocks_client_tenant_id_in_rpcs.sql`

```sql
-- cascade_items rock branch
-- Column: client_id → client_tenant_id
-- Value:  v_client_id (uuid) → (SELECT id FROM public.tenants WHERE id_uuid = v_client_id) (bigint)

-- get_client_eos_overview rocks JSON branch
-- Two subqueries, identical change:
-- WHERE client_id = p_client_id → WHERE client_tenant_id = (SELECT id FROM public.tenants WHERE id_uuid = p_client_id)
```

All other branches in both functions preserved verbatim. `SECURITY DEFINER` + `SET search_path TO 'public'` headers preserved per scope (search_path hardening to empty-string deferred — see Open questions).

**Verification (live, post-apply):**

```sql
-- 4-check via pg_get_functiondef
cascade_items: has_new_column=true, has_bridge=true, has_stale_ref=false ✅
get_client_eos_overview: has_new_column=true, has_bridge=true, has_stale_ref=false ✅
Both SECURITY DEFINER ✅
Both search_path=public preserved ✅
```

Rollback: both pre-change function bodies captured verbatim in the migration's header comment for copy-paste reverse-migration.

---

## KB changes shipped

None. The `tenants.id_uuid` bridge pattern is novel enough that a one-paragraph KB note about it could be worthwhile — surfaced as an open question below.

---

## Codebase observations (read-only)

`unicorn-cms-f09c59e5` at session start was on `192c48f2` (the closing commit of the rename workstream). No codebase commits during this session — only a Supabase migration.

- `src/pages/ClientEosOverview.tsx:35` — sole caller of `get_client_eos_overview`. Untouched; the page's query gate (`enabled: !!profile.client_id`) is unchanged and the field-population reality (`users.client_id` = 0/502) is unchanged.
- No grep hits for `cascade_items` outside the auto-generated `src/integrations/supabase/types.ts:62132`.

---

## Decisions

- **Path C chosen over Path A (resurrect) and Path B (tear out).** Path C closes the rename's regression without making a product call. Path A and B both require Angela's input on whether the client-viewer EOS feature is intended.
- **Option A (bridge via `tenants.id_uuid`) chosen over Option B (strip) and Option C (deprecation raise) per code path.** Bridge is the minimal, model-correct rebind. Strip silently changes the function contract; deprecation raise would break the one (gated) caller the moment data ever flows.
- **`search_path TO 'public'` retained verbatim.** Both functions should eventually move to `SET search_path = ''` with fully-qualified objects per `pinned/conventions.md → Function hardening`, but that's a separate concern. Mixing it into this rebind would have widened scope.
- **No frontend changes.** Function signatures are unchanged; types.ts regen not needed. The single gated caller's behaviour is unchanged today (still gated to never fire); if a future write to `users.client_id` ever opens the gate, the function now degrades to honest counts instead of throwing.

---

## Open questions parked

- **Path A / Path B product decision.** The whole client-viewer EOS feature has been dead-but-routed for 7+ months. Worth a deliberate conversation with Angela about whether to resurrect on the new model, tear out, or leave inert.
- **`tenants.id_uuid` bridge pattern as a KB note.** The pattern (uuid input → bigint column via `tenants.id_uuid` lookup) may be reusable elsewhere as the legacy UUID model is progressively migrated. A short note under `pinned/conventions.md` could codify it.
- **`SET search_path = ''` hardening on both functions.** Defer to a dedicated cleanup prompt that sweeps multiple legacy-search_path functions at once rather than touching these two in isolation.
- **`ClientEosOverview` page status.** Currently routed via lazy load in `App.tsx:762`; query is gated; renders empty stat cards if a Vivacity admin opens the URL with a client account. Cosmetic; not blocking. Folds into the Path A/B decision.

---

## Tag

`audit-2026-05-14-eos-rocks-client-tenant-id-rpc-rebind`

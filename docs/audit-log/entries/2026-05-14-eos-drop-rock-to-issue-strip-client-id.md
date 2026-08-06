# Audit: 2026-05-14 — `drop_rock_to_issue` strip `client_id` (Scope A hotfix)

**Trigger:** Drift-surfaced + regression closure. A comprehensive EOS audit triggered by the question "doesn't the EOS feature need this?" surfaced an active runtime bug introduced during the 14 May 2026 `eos_rocks.client_id → client_tenant_id` rename: both `drop_rock_to_issue` (DB function) and `RockProgressControl.tsx:36` (frontend) write an integer (`v_rock.client_tenant_id` / stringified `String(rock.client_tenant_id)`) into the uuid column `eos_issues.client_id`. Will throw `invalid input syntax for type uuid` the moment anyone drops one of the 2 client-tagged Rocks to an issue. Today's blast radius is 2 production rows.
**Author:** Carl
**Scope:** Two layers shipped atomically. DB function `drop_rock_to_issue` — strip `client_id` from the `eos_issues` INSERT column list and VALUES tuple. Frontend `src/components/eos/RockProgressControl.tsx:36` — delete the `client_id` line from the issue payload. NO other DB object, RLS policy, RPC, frontend file, or test touched. Scope A (hotfix) per the comprehensive EOS audit; Scope B (migrate eos_issues/todos/meetings/item_clients/accountability_chart/vto + add UI client pickers) deferred as product decision.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev (ap-southeast-2)

---

## Findings

- **The bug was introduced by us during the rename workstream.** When Lovable rebound `drop_rock_to_issue` for the rename's Prompt 2, it followed the RECORD field reference (`v_rock.client_id` → `v_rock.client_tenant_id`) but didn't notice the destination column type mismatch — `eos_issues.client_id` is uuid, `v_rock.client_tenant_id` is integer. The function appeared to "work" because the rename's verification only checked column rename presence, not destination type compatibility. Lesson: when renaming a column, audit not just *readers* of the column but *writers from* the column into other tables, with type-checked verification.
- **The bug was dormant on 98 of 100 rocks.** The frontend short-circuits the `client_id` payload key when `rock.client_tenant_id` is null:

  ```ts
  client_id: rock.client_tenant_id ? String(rock.client_tenant_id) : undefined
  ```

  98 of 100 production rocks have `client_tenant_id = NULL`, so the payload omitted the column entirely and the INSERT succeeded with `eos_issues.client_id = NULL`. Only the 2 client-tagged rocks (both about Think Real Estate) would trigger the runtime failure. This is why the bug went undetected through the rename apply, the build, and the rename verification.
- **The DB function `drop_rock_to_issue` is dead from the UI.** `rg "drop_rock_to_issue"` returned zero hits across `src/`, `supabase/functions/`, tests, and migrations beyond the function definition. The live UI write path is `useEosIssues().createIssue.mutateAsync(...)` → direct `supabase.from('eos_issues').insert(...)` (no RPC). So the active runtime bug is the frontend payload at `RockProgressControl.tsx:36`; the DB function fix is preventive against any future SQL/admin caller.
- **Strip chosen over bridge.** Bridging integer → uuid via `tenants.id_uuid` would write a uuid value into `eos_issues.client_id`, but the column's pre-Feb-2026 semantics referenced `clients_legacy(id)` (archived, 11 rows). The bridged uuid would point at `tenants.id_uuid`, which no consumer (e.g. `ClientBadge`) resolves. Stripping is honest about the model gap: the new issue inherits `tenant_id` from the rock (preserving tenant scoping) and lands with `client_id = NULL` (accurate signal that "no client tag exists for this issue in the legacy model"). The rock's own `client_tenant_id` is untouched.
- **Comprehensive EOS audit surfaced 6 additional dead-by-omission tables.** `eos_issues`, `eos_todos`, `eos_meetings`, `eos_item_clients`, `eos_accountability_chart`, `eos_vto` all carry legacy `uuid client_id` columns with 0 populated rows in live. The columns exist; some have RLS policies referencing them (`eos_issues_client_viewer_select`, `eos_headlines_client_viewer_select`, `eos_item_clients_select`, `eos_meeting_summaries_select`); none have UI write paths. Plus the 13 May P1-a audit confirmed that `client_viewer` access via the join model is preserved as distinct policies on eos_rocks/issues/headlines for a reason (the access path is genuinely different from the tenant-scoped one). Whether the team wants to finish migrating these tables to the new integer/tenants model is a product decision (Scope B) — surfaced for Angela but not made unilaterally.
- **5 more EOS RPCs reference legacy `client_id` paths but are not currently broken** — `accept_ai_suggestion`, `carry_forward_unresolved_issues`, `create_recurring_meetings`, `list_meeting_summaries_for_client`, plus 3 overloads of `create_issue`. All operate end-to-end on the legacy UUID model (uuid in, uuid out), so they don't have the type mismatch problem `drop_rock_to_issue` had. They WOULD need rebinding if Scope B is adopted; deferred until then.
- **The agent's frontend audit had two false positives + one false negative.** False positives: claimed `RockFormDialog.tsx:208` still reads `client_id` (live shows `client_tenant_id`, fixed during the rename); claimed `cascade_items`/`get_client_eos_overview` were broken (both rebound in the morning's PR #72). False negative: missed `eos_accountability_chart` and `eos_vto` legacy `client_id` columns in the inventory. Direct DB queries against `information_schema.columns` filled the gap. Lesson: trust-but-verify even on thorough Explore-agent audits; the agent's output had stale code snippets in places.

---

## DB changes shipped

Single migration applied via Lovable, equivalent to:

```sql
CREATE OR REPLACE FUNCTION public.drop_rock_to_issue(p_rock_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rock RECORD;
  v_issue_id UUID;
BEGIN
  SELECT * INTO v_rock FROM public.eos_rocks WHERE id = p_rock_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rock not found'; END IF;

  INSERT INTO public.eos_issues (
    tenant_id, title, description, priority, assigned_to, created_by, status
  ) VALUES (
    v_rock.tenant_id, v_rock.title,
    COALESCE(v_rock.description, '') || ' (from Rock)', v_rock.priority,
    v_rock.owner_id, auth.uid(), 'Open'
  ) RETURNING id INTO v_issue_id;

  RETURN v_issue_id;
END;
$function$;
```

`client_id` column removed from the INSERT column list; `v_rock.client_tenant_id` removed from the VALUES tuple. All other columns (`tenant_id`, `title`, `description`, `priority`, `assigned_to`, `created_by`, `status`) preserved. `SECURITY DEFINER` and `SET search_path TO 'public'` preserved per scope (hardening to empty-string deferred). Function signature unchanged.

**Verification (live, post-apply):**

```sql
-- pg_get_functiondef shows:
INSERT INTO public.eos_issues (
  tenant_id, title, description, priority, assigned_to, created_by, status
) VALUES (
  v_rock.tenant_id, v_rock.title, ...
);
-- ✅ No client_id reference. No v_rock.client_tenant_id reference.
```

---

## KB changes shipped

None. The "audit writers FROM a renamed column, not just readers" lesson could be a one-paragraph KB note under `pinned/conventions.md` or as a tightening of the column-rename heuristic in `handoffs/lovable-production-db-change.md`; surfaced as an open question below.

---

## Codebase observations (read-only)

`unicorn-cms-f09c59e5` at session start was on `2ec20216`. Frontend commit `cddd4014 Changes` deleted line 36 (`client_id: rock.client_tenant_id ? String(rock.client_tenant_id) : undefined`) from `src/components/eos/RockProgressControl.tsx`. Other payload fields (title, description, status, priority) preserved. Local React state `clientId`/`setClientId` unchanged (those refer to form state, unrelated to the eos_issues column).

Final live state of `handleDropToIssue`:

```ts
const handleDropToIssue = async () => {
  await createIssue.mutateAsync({
    title: `Rock issue: ${rock.title}`,
    description: rock.description || `Issue from rock: ${rock.title}`,
    status: 'Open',
    priority: (rock.priority || 2) as any,
  });
};
```

`tenant_id` is supplied downstream via the RLS context / `useEosIssues()` hook, not in this payload — consistent with how the other issue create paths work.

---

## Decisions

- **Scope A (hotfix) chosen over Scope B (migrate 6 tables + add UI client pickers).** Scope B is a product decision about whether per-client tagging for issues/todos/meetings is a real product feature or aspirational design. Not made unilaterally; surfaced for Angela.
- **Strip chosen over bridge for `drop_rock_to_issue` destination INSERT.** Bridging would write semantically meaningless uuid values; stripping leaves the column NULL, which is accurate.
- **Both layers ship atomically in one prompt.** DB function fix + frontend payload edit must agree on the "no client_id on new issue" contract. Splitting would leave a transient inconsistency where one layer sets the column and the other doesn't.
- **`SET search_path TO 'public'` retained verbatim.** Hardening to empty-string deferred (the function should eventually move to `SET search_path = ''` with fully-qualified objects per `pinned/conventions.md → Function hardening` — same as the other 6 EOS RPCs we've audited this session).

---

## Open questions parked

- **Scope B product decision (Angela).** Six EOS tables carry dead-by-omission `uuid client_id` columns. Migrate to new integer/tenants model + build UI client pickers? Or tear out + drop the columns + drop the related RLS policies? Or leave indefinitely as dormant infrastructure?
- **`accept_ai_suggestion`, `carry_forward_unresolved_issues`, `create_recurring_meetings`, `list_meeting_summaries_for_client`** — all work today on legacy UUID model end-to-end. Would need rebinding if Scope B adopted. Untouched here.
- **3 `create_issue` overloads** — accumulated cruft from multiple design iterations; none currently broken. Worth a separate cleanup workstream.
- **`SET search_path = ''` hardening sweep across the EOS module's SECURITY DEFINER functions** — `drop_rock_to_issue`, `cascade_items`, `get_client_eos_overview`, `upsert_rock_with_parenting`, `accept_ai_suggestion`, `carry_forward_unresolved_issues`, `create_recurring_meetings`, `list_meeting_summaries_for_client`, plus the 3 `create_issue` overloads. Pinned convention is empty-string + schema-qualify; all currently use `'public'`. Pre-existing project-wide pattern, worth its own sweep.
- **KB note: "audit writers FROM a renamed column, not just readers".** The column-rename heuristic in `handoffs/lovable-production-db-change.md` (added 14 May from the eos_rocks rename) covers grep heuristics for finding all readers. It does NOT cover writers — INSERT statements where the renamed column is the source of a value being written into a different column. Worth tightening. The 14 May handoff PR (#37) is still open; could be amended.

---

## Tag

`audit-2026-05-14-eos-drop-rock-to-issue-strip-client-id`

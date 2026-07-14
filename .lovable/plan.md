
# Fix manage-tenants "hours used / hours included" display

## Where the bug lives

Only **two** files drive the broken column on `/manage-tenants`:

1. `src/hooks/useTenantPackages.ts` — fetches per-tenant used/included minutes.
2. `src/pages/ManageTenants.tsx` (lines 938–955) — formats those minutes to `H:MM`.

No other page shares the broken pattern:

- `src/hooks/usePackageUsageQuery.tsx` uses the DB-fixed `rpc_get_package_usage` and its `formatHours` already normalises the sign correctly.
- `src/components/client/PackageBreakdownModal.tsx` delegates entirely to that RPC.
- `src/components/client/TenantTimeTrackerBar.tsx`, `ClientTimeTab.tsx`, `RenewalConfirmDialog.tsx` read `v_package_burndown` (also DB-fixed).
- No client-side code joins `time_entries.package_id` to `package_instances.id`.

## What's wrong

### `src/hooks/useTenantPackages.ts` (lines 32–100)

- **Wrong "included" aggregation.** Only top-level instances contribute; child (add-on) instances are dropped. And `hours_added` (the top-up allowance on some instances) is ignored — so tenants with Diamond-style top-ups quietly under-report their pool.
- **Recomputes "used" from `v_package_burndown` instead of reading the canonical `package_instances.hours_used`.** The DB trigger already maintains `hours_used` per instance (allocations-aware, carry-over excluded); filtering burndown by only top-level ids is a second, drift-prone source of truth.

### `src/pages/ManageTenants.tsx` (lines 938–955)

```ts
const usedH = Math.floor(used / 60);
const usedM = Math.round(used % 60);
```

For negative `used` (e.g. `-255`), `Math.floor(-255/60) === -5` and `-255 % 60 === -15` — the `-5:-15` glitch. Hours and minutes are floored/moduloed independently without sign normalisation.

## The fix

### 1. `src/hooks/useTenantPackages.ts`

- Add `hours_used` and `hours_added` to the `package_instances` select.
- Sum **`included_minutes + (hours_added × 60)` across every active instance, parent and child alike** (matches `rpc_get_package_usage` / `v_package_burndown`).
- Sum **`hours_used` only for instances where `parent_instance_id IS NULL`** — parents already have children rolled in via the DB trigger.
- Convert `hours_used` (numeric hours) to minutes: `Math.round(Number(hours_used) * 60)`. Clamp negatives to `0` and `console.warn` with the offending `package_instance_id`.
- Delete the entire `v_package_burndown` block; `activeInstanceIds` is no longer needed.

Result: one SELECT against `package_instances`; both totals derived from columns the DB trigger owns.

### 2. `src/pages/ManageTenants.tsx` (lines 938–955)

Replace the inline formatter with a sign-safe one (mirrors `formatHours` in `src/hooks/usePackageUsageQuery.tsx`):

```ts
const abs = Math.abs(used);
const sign = used < 0 ? '-' : '';
const usedH = Math.floor(abs / 60);
const usedM = Math.round(abs % 60);
// display: `${sign}${usedH}:${usedM.toString().padStart(2,'0')}`
```

Same treatment applied to `included` for symmetry. With the hook clamping negatives to 0 the sign branch is effectively unreachable — kept as belt-and-braces.

No other changes to either file.

## Guardrail

If, during implementation, I find any other place where `hours_added` interacts with `included_minutes` in a way inconsistent with `included_minutes + hours_added × 60`, I stop and report rather than guess.

## Verification

After the change, on `/manage-tenants`:

- **Op-Skill Development Group** → `0:45 / 7:00`.
- **Melloz Services** → total included **`159:00`** (145:00 base + Diamond's 14h `hours_added` bonus), used = sum of top-level `hours_used`.
- No row displays a negative time (`-4:-15 / 7:00` case now renders `0:00 / 7:00` or the trigger-maintained positive value).
- Consumers of `useTenantPackages` keep the same return shape.
- No RLS, schema, RPC, or edge-function changes; no PostgREST cache reload.

## Out of scope (confirmed untouched)

- `package_instances`, `time_entries`, `time_entry_allocations` schema
- `stage_instances`, `task_instances`, legacy-client data
- Any RLS policy
- `v_package_burndown`, `v_package_time_summary`, `rpc_get_package_usage`, `fn_package_used_minutes`

# Audit: 2026-04-29 — ManageTenants status filter tiles returning empty list

**Author:** Brian  
**Trigger:** ad-hoc — Suspended and Closed/Archived stat tiles on the Manage Clients page clicked through to an empty table despite showing a non-zero count  
**Scope:** `ManageTenants.tsx` status filter logic (single-line predicate change, no DB changes)  
**Codebase verified at:** `unicorn-cms-f09c59e5@732d788f` (pre-fix)  
**Fix landed at:** `unicorn-cms-f09c59e5@a998ea29`

---

## Context

The Manage Clients page has four summary stat tiles — Total Clients, Active, Suspended, Closed/Archived — that double as filter shortcuts. Clicking a tile sets `statusFilter` to a string value, which the filter function applies against the `tenants` array. Investigation found that two of the four tiles would always produce an empty list because the filter value they passed did not exist on the column being compared.

---

## Finding 1 — Filter value mismatch: `lifecycle_status` values used against raw `status` column

**File:** `src/pages/ManageTenants.tsx`

The stat counts (lines 161–167) and the filter predicate (lines 301–304) used different fields and value sets.

**Stat count at line 164:**
```tsx
const suspended = tenants.filter(
  t => t.status === "inactive" || t.status === "on_hold" || t.status === "disabled"
).length;
const closed = tenants.filter(
  t => t.status === "terminated" || t.status === "cancelled"
).length;
```

**Tile onClick handlers:**
- Suspended tile (line 544): `setStatusFilter("suspended")`
- Closed/Archived tile (line 559): `setStatusFilter("closed")`

**Filter predicate at lines 301–304 (pre-fix):**
```tsx
if (statusFilter !== "all") {
  filtered = filtered.filter(tenant => tenant.status === statusFilter);
}
```

The `tenants.status` column holds raw values (`active`, `inactive`, `on_hold`, `disabled`, `terminated`, `cancelled`, `overrun`, `In Arears`). The values `"suspended"` and `"closed"` are `lifecycle_status` values — a derived column synced by a DB trigger. No row has `status === "suspended"` or `status === "closed"`, so clicking either tile returned zero rows regardless of actual tenant state.

**Active** worked correctly because `"active"` happens to be a valid raw `status` value.

---

## Finding 2 — Schema context: two-column status model

A migration audit confirmed the current design:

| Column | Constraint | Allowed values |
|---|---|---|
| `status` (raw) | none | unconstrained free-text; historically: `active`, `inactive`, `on_hold`, `disabled`, `overrun`, `In Arears`, `terminated`, `cancelled` |
| `lifecycle_status` (derived) | FK → `dd_lifecycle_status` | `active`, `suspended`, `closed`, `archived` |
| `access_status` | FK → `dd_access_status` | `enabled`, `disabled` |

A trigger (`trg_sync_tenant_lifecycle_status`, migration `20260302050923`) maps raw `status` → `lifecycle_status` on every update:

| Raw `status` | → `lifecycle_status` |
|---|---|
| `active` | `active` |
| `disabled`, `on_hold`, `overrun`, `In Arears` | `suspended` |
| `terminated`, `cancelled` | `closed` |

The stat count logic at line 164 enumerated the raw `status` values that map to `"suspended"`. The fix aligns the filter to use `lifecycle_status` instead — the single derived value that groups them correctly.

---

## Fix — `ManageTenants.tsx` line 301–304

Delivered via Lovable prompt. Single predicate change in `applyFiltersAndSort`:

**Before:**
```tsx
// Status filter (using tenants.status column)
if (statusFilter !== "all") {
  filtered = filtered.filter(tenant => tenant.status === statusFilter);
}
```

**After:**
```tsx
// Status filter — "all" and "active" match raw status;
// "suspended" and "closed" match lifecycle_status (derived column)
if (statusFilter !== "all") {
  filtered = filtered.filter(tenant =>
    statusFilter === "active"
      ? tenant.status === statusFilter
      : tenant.lifecycle_status === statusFilter
  );
}
```

Scope: `ManageTenants.tsx` only. No DB migration, no hook changes, no other file touched.

**Residual note:** The `active` branch still filters on raw `status === "active"` rather than `lifecycle_status === "active"`. These are equivalent today — the trigger guarantees that any row with `lifecycle_status = 'active'` has `status = 'active'` and vice versa — but the asymmetry is worth knowing if the raw status vocabulary ever widens. A future cleanup could unify all four tiles to filter on `lifecycle_status` consistently and remove the `active` special-case.

---

## Root cause summary

The stat tiles were added or updated without accounting for the two-column status model introduced in migration `20260302050923` (March 2026). The stat counts correctly enumerated the raw values that constitute each lifecycle group; the filter predicate did not. Because `"active"` exists in both columns with the same value, only the Active tile worked, making the bug look like a Suspended/Closed-specific issue rather than a systematic one.

---

## KB changes shipped

None — the pattern here (blast-radius check before data-fetch changes) is already documented in `unicorn-kb/reference/dev-guardrails.md`. No new trap warrants a KB entry.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5@732d788f` — pre-fix state investigated; bug confirmed in `ManageTenants.tsx:301–304`.
- `unicorn-cms-f09c59e5@a998ea29` — fix live; Lovable merge commit labelled "Fixed lifecycle filter logic". Raw change in `f2f801bc`.

---

## Decisions

None.

---

## Open questions parked

None.

---

## Tag

`audit-2026-04-29-manage-tenants-status-filter-fix`

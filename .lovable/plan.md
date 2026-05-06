## Fix: "Member since" wrong date + "Book consult" button styling

### Bug A — Member since uses backdated package start date

**Root cause (confirmed):** `public.v_client_home_hero` selects `pa.earliest_package_start AS member_since`, where `pa.earliest_package_start = MIN(package_instances.start_date)` per tenant. Package starts are routinely backdated (some to 2013), producing misleading tenure on the client home hero card.

**Fix:** Recreate the view with one swap:

```sql
-- Before
pa.earliest_package_start AS member_since,
-- After
t.created_at AS member_since,
```

The `package_aggregates` CTE stays intact — it still feeds `total_packages_ever`, `active_packages`, `historical_packages`. `earliest_package_start` simply stops being projected (no consumers reference it; only `member_since` is read by `use-client-home-hero.ts`).

**Migration shape:** `CREATE OR REPLACE VIEW public.v_client_home_hero AS …` — single statement, no data migration, no grants change (CREATE OR REPLACE preserves ownership, privileges, and the prior RLS-bypass posture). The accompanying `users_select_assigned_csc` policy added previously is unaffected.

**Type/contract impact:** `member_since` remains `string | null` in `ClientHomeHero` (TypeScript). `tenants.created_at` is `timestamptz NOT NULL` on all 406 non-system tenants, so for any visible tenant the value will now be non-null and accurate. `formatTenure()` in `ClientHomePage.tsx` already handles a valid ISO timestamp — no code change needed.

**Backward compatibility:** No external consumers select `earliest_package_start` (it was never projected). Column list, ordering, and types unchanged from a client perspective. Existing queries using `select("*")` continue to work.

### Bug B — "Book consult" button looks permanently active

**Root cause (confirmed):** In `src/components/client/ClientHomePage.tsx` line 155, `bookBtn` renders `<Button asChild={hasCSC} size="sm" …>` with no `variant`, defaulting to the filled primary style. The sibling Message button uses `variant="outline"`, producing the visual mismatch.

**Fix:** Add `variant="outline"` to that single Button:

```tsx
// Line 155
<Button asChild={hasCSC} size="sm" variant="outline" disabled={!hasCSC} className={!hasCSC ? "cursor-not-allowed" : ""}>
```

Nothing else changes — `asChild`, `disabled`, the conditional `<Link>` vs `<span>` children, and the icon/label all stay. The QuickActionsRow "Book consult" tile (line ~351) and `PackageActionRow.tsx` are untouched (different components, intentional emphasis).

### Files touched

- New migration: `CREATE OR REPLACE VIEW public.v_client_home_hero` with `t.created_at AS member_since`.
- `src/components/client/ClientHomePage.tsx` line 155: add `variant="outline"`.

### Areas verified unaffected

- `package_aggregates` counts (`active_packages`, `historical_packages`, `total_packages_ever`) — logic untouched.
- `csc_primary` CTE, CSC name/email/avatar/role_label resolution, and the `users_select_assigned_csc` RLS policy.
- `audit_count` / `audits_total`.
- CSCCard Message button, avatar, name, email; QuickActionsRow grid; `formatTenure()`.
- `use-client-home-hero.ts` interface and React Query cache key.

### Risk assessment

- **Severity:** Low. View-only DDL via `CREATE OR REPLACE`; one-line UI tweak.
- **Data risk:** None — no rows mutated, no columns removed from the projection, no FK/constraint changes.
- **Tenancy/RLS risk:** None — view definition retains the same base tables and joins; recent CSC SELECT policy unaffected.
- **Visual regression risk:** Minimal — outline variant aligns Book consult with Message; both become equal-weight secondary actions, matching the documented design intent.
- **Audit:** Migration file is the audit record for the view change; no audit log entries needed (no row-level data changed).
- **Rollback:** Re-run a migration restoring `pa.earliest_package_start AS member_since`; UI revert is a one-line edit.

### Benefits

- Accurate, trustworthy tenure on every client home hero (no more 2013-as-member-since).
- Visual consistency in the CSC card — "Book consult" no longer reads as "currently active/pressed".
- Zero impact on package counts, CSC resolution, audits, or any other home-page metric.
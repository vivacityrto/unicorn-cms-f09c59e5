# Audit: 2026-11-05 — package-anniversary-date-override

**Trigger:** ad-hoc (Carl observed the anniversary date on a package card is set automatically from the start date, with no way to override it)
**Scope:** how `package_instances.next_renewal_date` ("Anniversary") is set and who reads it; the live data shape; a SuperAdmin override. Checked against production ref `yxkgdalkbrriasiyyrwk` with read-only queries. Not covered: the Renew dialog's own period display (see parked), and any change to the window start.

## Findings

- `next_renewal_date` is set once, on insert, by `set_default_renewal_date()` (`start_date + 1 year`). After that it only moves through the Renew dialog. There was no sanctioned way to correct it for an agreed non-standard term.
- It is not a display label. It is the **end of the package's hours window**: `fn_package_used_minutes`, `v_package_burndown`, `get_package_burndown`, `rpc_get_package_usage`, the client portal hours RPCs and the usage-alert trigger all read it. The window start is `COALESCE(start_renewal_date, start_date)`.
- `package_instances.hours_used` is a **stored** value, recomputed only by `tg_recalc_package_hours_used` on time-entry writes. Changing the window without recomputing leaves it stale until the next unrelated time entry.
- Invariant verified 5 Nov 2026 across 86 active instances: the open `package_renewal_periods.period_end` equals `next_renewal_date` in every case (0 mismatches). An override has to keep it so. 11 active instances (new packages) have no period row and a null `start_renewal_date`.
- Live shape of active instances by `next_renewal_date - start_date`: 62 at 365 days, 12 at 730, 4 at 366, and 8 off-cycle (including the 413-day package that prompted this). The 730-day group matches the anomaly class in `2026-07-06-farsta-package-burndown-renewal-date.md`. These are what the new "Custom" badge makes visible.
- RLS already restricts `package_instances` UPDATE to `is_super_admin()`. A direct client-side update would therefore work for a SuperAdmin but would be three separate writes with no atomicity and no audit row.

## KB changes shipped

- This entry and its INDEX line. No other KB change; related documents reviewed and intentionally unchanged: `docs/kb/reference/codebase-optimization/phase-4/p6-3-packages-time-characterization.md` (characterises the packages/time slice, not this feature).

## Code changes (if this entry accompanies one)

- Migration `20261105010000_set_package_anniversary_date_rpc.sql`: new `public.set_package_anniversary_date(p_instance_id bigint, p_new_date date, p_reason text)`, `SECURITY DEFINER`, `search_path = ''`, EXECUTE revoked from `PUBLIC`/`anon` and granted to `authenticated`. In one transaction it: requires a SuperAdmin; requires a reason of at least 5 characters; rejects completed packages; requires the new date to be after the current period start and at most 3 years after it; rejects an unchanged date; updates `next_renewal_date`; moves the open period's `period_end`; recomputes `hours_used` for the instance and its parent with the same formula as `tg_recalc_package_hours_used`; and writes a `client_audit_log` row (`anniversary_date_override`, with before, after, reason and period length). The window start is not editable. New function, not a replacement, so no overload risk. No column, policy, trigger or grant on any table changed.
- `src/components/client/AnniversaryDateEditor.tsx`, `src/features/packages/anniversaryOverride.ts`: SuperAdmin pencil on the package card's anniversary / current-period date, a dialog with the date picker, a "Standard" reset, a live period-length preview with warnings (non-standard length; already due), and a required reason. A "Custom" badge marks any period that is not 365/366 days.
- `src/components/client/ClientPackagesTab.tsx` uses the editor in place of the two read-only date labels. `src/integrations/supabase/types.ts` gains the RPC signature.
- Tests: `src/test/packages/anniversaryOverride.test.ts` (7 tests: defaulting, custom detection, bounds at exactly 3 years and one day over, unchanged, past-date warning).

**Verification.** Package test files 4/4 pass (82 tests). Type-check and ESLint clean on the touched files. The function was exercised on `unicorn-qa` inside a transaction that was rolled back by a raised exception: unauthenticated call refused (`42501`); short reason, date on or before the period start, more than 3 years, unchanged date, completed package all refused (`22023`); missing instance refused (`P0002`); a valid change updated the date, wrote one audit row and recomputed `hours_used`. QA afterwards had no function, no audit rows and the original values. **Not yet applied to production** — see below.

## Decisions

- The override moves only the window **end**. Changing the start would rewrite history that `package_renewal_periods` and carry-over entries depend on.
- A custom length is allowed (up to 3 years) but flagged, because included hours are not pro-rated: a 413-day window still carries one year's allowance. Whether to pro-rate is a business decision, not made here.
- No separate "overridden" column. The Custom badge is derived from the dates, so it cannot drift from them.

## Open questions parked

- Apply the migration to production (needs Carl's explicit go-ahead; migrations go through the Supabase MCP). Until it is applied the pencil will return an error on save.
- `RenewalConfirmDialog` shows "Current Period" as `anniversary − 1 year → anniversary`, not the real window start, so for a package with a custom anniversary its display (not its saved values) can disagree with the card. Candidate follow-up: use `COALESCE(start_renewal_date, start_date)` there.
- The 12 active packages at 730 days and the 8 off-cycle ones are not changed by this work. Whether each is intentional or an error needs a per-package decision by the CSC or Angela.
- Pro-rating included hours for non-standard periods.

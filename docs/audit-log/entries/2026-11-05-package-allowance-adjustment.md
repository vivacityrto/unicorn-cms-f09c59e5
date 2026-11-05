# Audit: 2026-11-05 — package-allowance-adjustment

**Trigger:** ad-hoc (a client needs 24 General Consult days; the team proposed 24 instances of the GC package, or adding hours to one package and annotating it)
**Scope:** how an instance's hours allowance is stored and read; the cost of 24 instances against one instance with a larger pool; a SuperAdmin way to adjust the pool with a pinned explanation. Checked against production ref `yxkgdalkbrriasiyyrwk` with read-only queries, and the function against `unicorn-qa` in a rolled-back transaction. Not covered: invoicing (nothing in this database models it; Carl said to leave it), and the legacy hours views (see parked).

## Findings

- General Consult Days is package `GC` (id 1026, project type, 7 hours = one day). `M-GC` (id 1016) is a different package (a 14-hour membership).
- **24 instances would be expensive and awkward.** Every instance insert fires `seed_stage_instances_from_template`. A GC instance seeds 5 stages, about 92 staff tasks, 18 client tasks, 42 emails and 33 document records (about 190 rows, measured on three live GC instances). Twenty-four would seed about 4,560 rows for one client, plus a row in each of roughly 18 other tables keyed to an instance (renewal periods, compliance, momentum and risk snapshots, ClickUp, lifecycle checklists and others).
- Time entries point at exactly one instance and `AddTimeDialog` defaults to the most recently started one, so 24 identical GC cards would force a manual choice on every entry, the usage would pile onto one card, and an entry longer than 7 hours could not span two. Usage alerts fire per instance.
- **Where the allowance lives.** The canonical readers (`get_package_burndown` / `v_package_burndown`, which also drive the usage alerts; `rpc_get_package_usage`; the card total in `useClientManagement`) all use `included_minutes` plus `hours_added * 60` plus carried-in minutes. `AddTimeDialog` takes the larger of the two figures instead of the sum, so an instance with `included_minutes = 420` and `hours_added = 161` shows 161 h there, not 168 h. Setting the pool in `included_minutes` avoids that. A multi-day GC already existed this way (tenant 7556, `included_minutes = 840`).
- The open `package_renewal_periods` row carries its own copy of `included_minutes`, read when a specific period is requested. 74 of 75 active open periods match their instance today (one pre-existing mismatch, left as is).
- `package_notes` cannot carry a pinned annotation (no pin column, SuperAdmin-only). The real pinned-note mechanism is `notes` (`is_pinned`, `parent_type = 'package_instance'`), rendered by `PackagePinnedNote` on the card.

## KB changes shipped

- This entry and its INDEX line. No other KB change.

## Code changes

- Migration `20261105020000_adjust_package_allowance_rpc.sql`: new `public.adjust_package_allowance(p_instance_id bigint, p_hours_delta numeric, p_reason text)`, `SECURITY DEFINER`, `search_path = ''`, EXECUTE revoked from `PUBLIC`/`anon` and granted to `authenticated`. In one transaction it requires a SuperAdmin; requires a reason of 5 to 500 characters; bounds one adjustment to 1000 hours and the resulting allowance to above zero and at most 2000 hours; rejects completed packages; row-locks the instance; changes `included_minutes` by the delta; moves the open renewal period's `included_minutes` by the same delta; writes a `client_audit_log` row (`package_allowance_adjusted`, with before, after, reason and the note id); and creates or updates ONE pinned note per instance (tag `allowance-adjustment`). A later adjustment appends a line to that note and refreshes its title ("Hours adjusted: 168 h total (+161 h on the original 7 h)") instead of stacking a second banner. Reason and actor name are HTML-escaped because the note body is rendered as HTML. New function, so no overload risk; no table, policy, trigger or grant changed.
- `src/features/packages/allowanceAdjustment.ts`, `src/components/client/AdjustAllowanceDialog.tsx`: a SuperAdmin "Adjust Hours" item in the package card's Manage menu, with a signed-hours box (a delta, so a stale screen cannot overwrite someone else's change), a live new-total preview, a "= N days of 7 h" helper, a warning when the new allowance is below the hours used, and a required reason.
- `src/components/client/PackagePinnedNote.tsx`, `src/hooks/usePinnedNotes.ts`: the allowance note renders in amber so a package whose hours differ from standard stands out; `usePinnedNotes` now selects `tags`.
- `src/integrations/supabase/types.ts` gains the RPC signature. `supabase/migration-safety-allowlist.json` gains a short-lived entry for the function body's INSERT/UPDATE statements.
- Tests: `src/test/packages/allowanceAdjustment.test.ts` (parsing, 24-day preview, days label, negative correction, zero and ceiling bounds, below-used warning).

**Verification.** Package and pinned-note test files 6/6 pass (98 tests). ESLint clean on the touched files. The function was exercised on `unicorn-qa` in a transaction rolled back by a raised exception: unauthenticated call refused (`42501`); short reason, zero hours, over 1000 hours, a result at or below zero and a completed package refused (`22023`); missing instance refused (`P0002`); +161 h on a 7 h instance gave 168 h in `v_package_burndown` and in the open period, one pinned note and one audit row; a second adjustment (+7 h) left one note with two entries and the title "175 h total (+168 h on the original 7 h)"; markup in the reason was escaped; a further +1000 h past the ceiling was refused.

**Production.** Applied on 5 November 2026 to `yxkgdalkbrriasiyyrwk` (migration `adjust_package_allowance_rpc`, via the Supabase MCP, after Carl's explicit go-ahead). Read-only postflight: exactly one function with signature `(bigint, numeric, text)`; `SECURITY DEFINER` with an empty `search_path`; EXECUTE held by `authenticated` and not by `anon` or `PUBLIC`; an unauthenticated call refused with `42501`; zero `package_allowance_adjusted` audit rows and zero `allowance-adjustment` notes, so no data has been changed. The happy path was deliberately not run on production; it was proven on `unicorn-qa`. The first real adjustment (the 24-day client) is made through the Adjust Hours action once the frontend is deployed.

## Decisions

- One GC instance with a larger pool, not 24 instances, because the 24 days are a pool (no per-day tracking, no per-day workflow or evidence) and the seeding and time-entry costs above are real. Per-engagement instances stay right where each piece has its own workflow, as with tenant 7528's two crane add-ons.
- The pool is set in `included_minutes`, not `hours_added`, because `AddTimeDialog` mis-totals the latter. No GC-specific code: the action works on any package.
- The explanation is a real pinned note, not free text in `comments` or an audit-only record, so it appears on the card and in the Timeline.

## Open questions parked

- The pinned note is a normal `notes` row, so it is visible to anyone `notes` RLS lets read that tenant's notes, which includes users of the tenant itself. The dialog says so; keep the reason free of anything internal.
- Renewal copies `included_minutes` into the new period, so an adjusted allowance carries into the next term until adjusted again. The pinned note says so only implicitly.
- Legacy views (`v_consult_hours_remaining`, `v_client_package_usage_summary`, `v_score_consult` and others) read `hours_included`, which is null on every instance, so they already show zero included hours for all packages. Not caused by or fixed here; how much of the health scoring depends on them is not verified.
- `AddTimeDialog` should sum, not take the larger of, the two allowance figures.

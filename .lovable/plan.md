## Root cause

The sync is running successfully, but it is still saving the wrong registration period.

For RTO `31716`, TGA is returning registrations in newest-to-oldest order:

- `2018-12-23` to `2025-12-22` — ASQA, renewal under consideration
- `2013-12-23` to `2018-12-22`
- `2012-06-29` to `2013-12-22`
- `2008-12-23` to `2012-06-28` — old QLD registration transfer

The database still shows `registration_end_date = 2012-06-28`, which means the deployed `tga-rto-sync` function is still using the old selection logic, even though the local code has been corrected. The “TGA Sync Complete” toast confirms scope data is refreshing, but the deployed function is not saving the corrected summary date yet.

## Plan

1. **Deploy the corrected `tga-rto-sync` edge function**
   - Deploy the existing local fix that sorts registrations by latest `endDate` before choosing the registration period.
   - Do not change frontend UI or unrelated sync logic.

2. **Run a targeted sync for tenant `7483` / RTO `31716`**
   - Invoke `tga-rto-sync` with the current authenticated session.
   - Confirm it completes successfully.

3. **Verify the stored summary data**
   - Check `public.tga_rto_summary` for tenant `7483` and RTO `31716`.
   - Expected result: `registration_end_date = 2025-12-22`, not `2012-06-28`.

4. **Confirm the visible UI will update**
   - The Integration tab and re-registration badge both read from `tga_rto_summary.registration_end_date`, so once the deployed function writes `2025-12-22`, the UI should show the correct date after refresh/query invalidation.

## Files / services touched

- Deploy only: `supabase/functions/tga-rto-sync/index.ts`
- No database schema changes planned.
- No changes to `tga-sync`, frontend components, or unrelated files unless verification shows a separate cache/query issue.
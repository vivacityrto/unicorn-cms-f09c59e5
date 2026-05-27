## KickStart Time work type

A new entry option in the **Add Time** dialog that lets staff log KickStart Time in fixed **7-hour blocks (1 TAS = 7h)**, only on **Membership M-SAR** and **M-DR** packages, with a per-membership maximum and the existing 28h consult-floor still respected.

### Behaviour

- **Eligibility**
  - Selected package must be `packages.slug = '/package-m-sar'` (id 1033) or `/package-m-dr` (id 1027).
  - Hide the **KickStart Time** option in the work-type dropdown for any other package.

- **Input = number of TAS**
  - When KickStart Time is chosen, the duration inputs are replaced by a single numeric **TAS** field.
  - Computed duration = `TAS × 7` hours (`TAS × 420` minutes). Displayed read-only beside the input as `= Xh 0m`.
  - Each save creates **one time entry** for that block. Staff can re-open and add more TAS later (matches "sometimes more at start, more later").

- **Caps (both must hold for the new entry)**
  - **Per-membership total kickstart_time cap:**
    - M-SAR → 28h total kickstart_time across the package instance (max 4 TAS lifetime).
    - M-DR → 63h total kickstart_time across the package instance (max 9 TAS lifetime).
  - **Package consult floor:** entry must leave ≥ 28h of remaining consult time in the package (same rule as before).
  - The TAS input's max = `floor(min(membershipCapRemaining, packageRemaining − 28h) ÷ 7)`. If that value < 1, the KickStart Time option is **hidden** from the work-type dropdown.

- **Auto-fill / locks**
  - Date: defaults to today, editable.
  - Billable: forced **true** and disabled.
  - Notes: pre-filled with `KickStart Time — N TAS (N × 7h)` (editable; re-derived when TAS changes until user edits).
  - Work sub-type: not required.

- **Server-side enforcement**
  - DB trigger on `time_entries` for `work_type = 'kickstart_time'`:
    1. Reject if package slug is not in (`/package-m-sar`, `/package-m-dr`).
    2. Reject if duration is not a positive multiple of 420 minutes (7h).
    3. Reject if sum of existing kickstart_time minutes on this `package_instance_id` + new entry exceeds the per-slug cap (1680 for M-SAR, 3780 for M-DR).
    4. Reject if total package `used_minutes` after the entry exceeds `included_minutes − 1680` (28h floor).

### Files to change

**1. DB migration**
- Insert `('kickstart_time', '** KickStart Time **', 11)` into `dd_work_types`.
- Add `validate_kickstart_time()` function and `trg_kickstart_time_validate` BEFORE INSERT/UPDATE trigger on `time_entries`. Function sets `search_path = ''` and fully qualifies all objects; joins `package_instances → packages` for slug; sums prior kickstart_time minutes; reads `included_minutes`/`used_minutes` from `package_instances`/`v_package_burndown`.

**2. `src/components/client/AddTimeDialog.tsx`**
- Add constants: `KICKSTART_TIME_CODE = 'kickstart_time'`, `KICKSTART_TAS_MINUTES = 420`, `KICKSTART_FLOOR_MINUTES = 1680`, `KICKSTART_CAP_BY_SLUG = { '/package-m-sar': 1680, '/package-m-dr': 3780 }`.
- Read selected `packageInstance` (already in scope) for `slug`, `included_minutes`, `used_minutes`, and `kickstart_used_minutes` (fetch via a small `useEffect` summing `time_entries` where `package_instance_id = X AND work_type = 'kickstart_time'`).
- Compute `maxTas = floor(min(capRemaining, packageRemaining − 1680) / 420)`.
- Filter the work-type `<Select>` to hide `kickstart_time` when `maxTas < 1` or slug ineligible.
- When `workType === 'kickstart_time'`:
  - Render a **TAS** `<Input type="number" min=1 max={maxTas} step=1>` with helper text: `1 TAS = 7h. Max {maxTas} TAS available.`
  - Show computed `= {tas * 7}h 0m` next to the input.
  - Force `billable = true` and disable that checkbox.
  - Default notes from TAS value (until user edits).
- On submit: pass `duration_minutes = tas * 420`, `work_type = 'kickstart_time'`, `billable = true`.

**3. `src/components/client/EditTimeDialog.tsx`**
- Make `kickstart_time` entries **read-only** (same pattern as `parent_defined`): amber banner — *"KickStart Time block — delete this entry to adjust. Blocks are fixed at 7h × TAS."* Submit button locked.

**4. `.lovable/plan.md`** — replace with the summary above.

### Out of scope
- No changes to `parent_defined` logic or wording.
- No `dd_work_sub_type` entries (KickStart Time has none).
- No retroactive migration of existing entries.
- No changes to package billing or renewal beyond normal burndown.

### Technical notes
- Eligible packages today: id 1027 (M-DR) and 1033 (M-SAR). Cap keys off `packages.slug`, so renaming slugs requires updating both the trigger and the frontend constants.
- All cap math runs in minutes against the same figures used by `v_package_burndown` so UI and DB stay in sync.
- For M-SAR, the per-membership cap (28h) and the consult floor (28h remaining) are independent: both are checked, even though they often bind at the same time.

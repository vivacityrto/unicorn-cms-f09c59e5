## Reuse existing `kickstart_tas` work type

The `dd_work_types` row `kickstart_tas` (`** KickStart TAS **`) is the one to wire up — no new lookup row, no `kickstart_time` code. All logic from the previous plan applies, just under the existing code.

### Changes vs the previous plan

- **Code constant:** `KICKSTART_CODE = 'kickstart_tas'` (was `'kickstart_time'`).
- **DB migration:** **Do not insert** a new `dd_work_types` row. Only create the validation function + trigger, keyed on `NEW.work_type = 'kickstart_tas'`. If the prior migration inserted `kickstart_time`, deactivate it: `UPDATE dd_work_types SET is_active = false WHERE code = 'kickstart_time'`.
- **Frontend (`AddTimeDialog.tsx`, `EditTimeDialog.tsx`):** all references to the constant point to `kickstart_tas`. UI labels in helper text and notes use "KickStart TAS" wording (since that's the existing label users see).
- Everything else from the approved plan is unchanged (TAS-based input, 7h × N duration, billable forced true, M-SAR cap 28h, M-DR cap 63h, 28h consult floor, hide option when no eligible block fits, read-only treatment in EditTimeDialog).

### Files to update

1. **DB migration** — create `validate_kickstart_tas()` + `trg_kickstart_tas_validate` BEFORE INSERT/UPDATE on `time_entries`. Function sets `search_path = ''`, fully qualifies all objects, keys off `work_type = 'kickstart_tas'`, enforces 7h multiples, per-slug cap (1680/3780 min), and 28h consult floor. Also: deactivate the orphaned `kickstart_time` lookup row if present.
2. **`src/components/client/AddTimeDialog.tsx`** — `KICKSTART_CODE = 'kickstart_tas'`, eligibility/maxTas logic, TAS input replacing hrs/min when selected, billable forced true and disabled, notes pre-fill `KickStart TAS — N TAS (N × 7h)`, hide option when ineligible.
3. **`src/components/client/EditTimeDialog.tsx`** — read-only banner + locked submit for `work_type = 'kickstart_tas'`.
4. **`.lovable/plan.md`** — refresh summary.

### Out of scope
Unchanged: no `parent_defined` changes, no `dd_work_sub_type` rows, no retroactive data migration, no billing/renewal changes.

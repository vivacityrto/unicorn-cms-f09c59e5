

## Plan: Allow today's date in Audit scheduling

**Problem:** In `src/components/audit/workspace/AppointmentPanel.tsx`, the calendar uses `disabled={(d) => d < new Date()}`. Because `new Date()` is the current instant (e.g. 14:32 today), every cell representing today is "less than now" and gets disabled. Only future dates are selectable.

**Fix:** Compare against the start of today so today is always selectable.

```ts
disabled={(d) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}}
```

**Files:** `src/components/audit/workspace/AppointmentPanel.tsx` (single one-line change to the `<Calendar>` `disabled` prop used by Evidence Due, Opening Meeting, and Closing Meeting).

**Out of scope (deferred):** Staff "Return to staff view" button in Client Portal, and SharePoint quick-jump button in the Audit sidebar.


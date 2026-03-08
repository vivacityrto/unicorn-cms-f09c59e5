

## Fix: "Confirm Renewal" button does nothing when no carry-over time

**Root Cause**: On line 96, `handleConfirm` exits immediately with `if (!carryOverChoice) return;`. When there is no unused time (`cappedCarryOver === 0`), the carry-over selection UI is hidden and `carryOverChoice` stays `null` forever. The button appears enabled (line 351 only disables when `cappedCarryOver > 0 && !carryOverChoice`) but clicking it silently returns.

**Fix** in `src/components/client/RenewalConfirmDialog.tsx`:

1. **Auto-set choice when no carry-over**: In the `useEffect` that fetches data, after computing `cappedCarryOver`, if it's 0, auto-set `carryOverChoice` to `'forfeit'` so the confirm handler proceeds.

2. **Add error feedback**: Wrap the early return with a toast so if something unexpected blocks confirmation, the user is informed rather than seeing nothing happen.

Single file change, two small edits.


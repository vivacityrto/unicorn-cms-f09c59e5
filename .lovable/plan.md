## Phase 1: Portal user picker + reason dialog

Single-file change to `src/components/client/ViewAsClientButton.tsx`. No other files touched.

### Changes

1. **`handleViewClient` — unify both modes through the dialog**
   - Keep the `is_vivacity_internal` guard ONLY inside the `mode === "academy" || isAcademyOnly` branch.
   - After the guard (or immediately for portal mode), run the same flow for both modes:
     - `setOptionsLoading(true)`
     - `setReasonDialogOpen(true)`
     - `await fetchActingUserOptions(tenantId)` → set `actingOptions`, default `selectedActingId` to `opts.find(o => o.is_default) ?? opts[0] ?? null`
     - `finally { setOptionsLoading(false) }`
   - Remove the entire `else` branch that called `startPreview` immediately.

2. **Picker visibility — show for both modes**
   - Replace `const showAcademyPicker = selectedMode === "academy" || isAcademyOnly;` with a single always-true gate (rename to `showUserPicker = true`, or simply render the picker block unconditionally).

3. **`handleStartPreview` — always pass selected acting user**
   - Change `const acting = selectedMode === "academy" || isAcademyOnly ? selectedActingId : null;` to `const acting = selectedActingId;`.

4. **Mode-aware "no users" handling**
   - Compute `isAcademyMode = selectedMode === "academy" || isAcademyOnly`.
   - `noUsersAvailable = !optionsLoading && actingOptions.length === 0`.
   - Academy mode: show existing destructive message "No users on this tenant yet — invite one before previewing Academy." and include `noUsersAvailable` in `confirmDisabled`.
   - Portal mode: show muted note "No users on this tenant yet. You'll preview without a specific user." and do NOT disable confirm.
   - `confirmDisabled = isStarting || optionsLoading || (isAcademyMode && (noUsersAvailable || !selectedActingId));`

5. **Mode-aware dialog title/description**
   - Title:
     - Academy: `View Vivacity Academy — {tenantName}`
     - Portal: `View Client Portal — {tenantName}`
   - Description:
     - Academy: keep existing copy.
     - Portal: "You're about to preview the compliance portal as a specific user on this tenant. This action will be logged for audit purposes."

### Out of scope
- `ClientPreviewContext`, `useClientActingUser`, `ClientTopbar`, and all other files remain untouched.

Remove the confirmation dialog for portal mode in the `View As Client` button.

File: `src/components/client/ViewAsClientButton.tsx`

Change: In `handleViewClient`, replace the `else` branch (portal mode, lines 88-92) with a direct `startPreview` call that:
1. Sets `isStarting` to true
2. Calls `startPreview(tenantId, undefined, null)`
3. On success, shows a toast and navigates to `/client-preview`
4. On failure, shows an error toast
5. Resets `isStarting` in `finally`

The academy `if` branch, the `<Dialog>` JSX, the `reason` state, and `handleStartPreview` are left untouched — they are still used by the academy path.

No other files are changed. `ClientPreviewContext.tsx` is untouched.

Verification: Portal preview starts instantly with no dialog; academy preview still opens the dialog with user picker; success toast and navigation work correctly.
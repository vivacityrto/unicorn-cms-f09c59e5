## Fix: Impersonation banner overlapping the Academy sidebar

### Root cause
`ImpersonationBanner` is `fixed top-0 left-0 right-0 z-[100]`. Both layouts render a `h-12` spacer to push the *main content column* down, but the sidebars are `position: fixed` and don't respect that spacer.

- **`ClientLayout` is already fixed correctly** — `src/components/client/ClientSidebar.tsx:155` sets `isPreview ? "top-12 h-[calc(100vh-3rem)]" : "top-0 h-screen"`. Its topbar lives inside the `ml-*` flex column that the `h-12` spacer already offsets, so nothing else to do there.
- **`AcademyLayout` is not preview-aware.** `src/components/layout/AcademyLayout.tsx:204` hard-codes:
  ```
  fixed left-0 top-0 h-screen z-30
  ```
  The screenshot is from `/academy/trainer`, which is why the banner sits on top of the "Academy" header block at the top of the sidebar.

`AcademyTopBar` and the `<main>` region are inside the `ml-{64|20}` flex column, which is a sibling below the existing `h-12` spacer — those already offset correctly. No change needed there.

### Change
Single-file edit to `src/components/layout/AcademyLayout.tsx`:

1. The component already reads `isPreviewMode` from `useClientPreview()` (used at line 196 to gate the banner). Reuse it.
2. On the `<aside>` at line 204, swap the hard-coded `top-0 h-screen` for the same preview-aware pair the client sidebar uses:
   ```
   ${isPreviewMode ? "top-12 h-[calc(100vh-3rem)]" : "top-0 h-screen"}
   ```
   All other classes on the `<aside>` (width, background, border, transition, `fixed left-0 z-30`) stay identical.

### Out of scope
- No banner styling / z-index / height changes.
- No changes to `ClientLayout`, `ClientSidebar`, `ClientTopbar`, `AcademyTopBar`, or the banner component itself.
- No visual redesign — this is a positional fix only.

### Verification
1. Enter "View as Client" into any Academy tenant. Confirm the sidebar's purple "Vivacity Academy" header block now starts *below* the fuchsia impersonation bar and is fully visible.
2. Confirm the sidebar's bottom "role" pill is still visible (height math: `100vh - 3rem`).
3. Exit preview and confirm the sidebar returns to `top-0 h-screen` with no visual regression.
4. Re-check `/client/...` routes (ClientLayout) — should be unchanged.
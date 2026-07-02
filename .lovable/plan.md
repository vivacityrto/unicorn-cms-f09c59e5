## Status: already implemented — no changes needed

The deploy-detection + toast feature is fully wired end-to-end. Verified:

**Build-time (`vite.config.ts`)**
- `const BUILD_ID = Date.now().toString(36)` generated once per build.
- `define: { "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID) }` bakes it into the bundle.
- `versionJsonPlugin` (production-only, `closeBundle`) writes `dist/version.json` with `{ buildId: BUILD_ID }`, overwriting the `public/version.json` placeholder.

**Runtime (`src/utils/versionCheck.ts`)**
- Polls `/version.json?t=<ts>` (no-store) 3s after mount, then every 5 minutes.
- Skips in `import.meta.env.DEV` and when remote still holds the `__BUILD_ID__` placeholder.
- On mismatch, sets `sessionStorage[RELOAD_KEY] = buildId` **before** showing the toast, then calls Sonner:
  ```ts
  toast("A new version of Unicorn is available.", {
    duration: Infinity,
    action: { label: "Refresh", onClick: () => window.location.reload() },
  });
  ```
- Session guard means each build ID toasts at most once per session — subsequent 5-minute polls are no-ops.

**Wiring**
- `App.tsx` calls `startVersionChecking()` on mount.
- Sonner `<Toaster />` is mounted globally (`src/components/ui/sonner.tsx`).
- `DevDiagnosticsPanel.tsx` (visible with `?dev_diag=1`) shows `VITE_BUILD_ID`, remote `version.json`, match status, last notified build, and toast-shown flag.

**Not force-reloading** — the toast is persistent (`duration: Infinity`) and only reloads when the user clicks Refresh.

## No plan to implement
Nothing to change. Manual sanity checks after the next deploy:
1. Open the site, then deploy a new build.
2. Within ~5 minutes the toast should appear with a working Refresh button.
3. Dismiss/ignore it and confirm it does not re-appear on subsequent polls in the same tab.
4. `?dev_diag=1` panel should show mismatched IDs and "Toast shown: ✅".
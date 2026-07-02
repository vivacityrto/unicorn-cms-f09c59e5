
## Goal
Make the existing deploy-detection mechanism actually work in production, and replace the silent auto-reload with a user-controlled toast.

## Changes

### 1. `vite.config.ts` — inject build ID + write `dist/version.json`

- At the top of the config factory, generate one build ID per build:
  ```ts
  const BUILD_ID = Date.now().toString(36);
  ```
- Add `define: { "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID) }` to the config so the compiled bundle has a real value (replacing the current `"__BUILD_ID__"` fallback in `versionCheck.ts`).
- Add a new small plugin next to `criticalCssPlugin`, applied on `build`, using `closeBundle`:
  - Writes `dist/version.json` with `{ "buildId": BUILD_ID }`, overwriting whatever Vite copied from `public/version.json`.
  - Uses the same `writeFileSync` / `resolve(__dirname, "dist")` pattern already in the file.
- Order it so it runs after `criticalCssPlugin` (or independently — they don't touch the same file).
- Leave `public/version.json` as-is with the placeholder (it's the dev-time fallback).

### 2. `src/utils/versionCheck.ts` — toast instead of reload

- Import `toast` from `sonner`.
- In `checkForNewBuild`, when a new `buildId` is detected and it doesn't match the sessionStorage guard:
  - Still `sessionStorage.setItem(RELOAD_KEY, buildId)` **before** showing the toast so subsequent 5-minute polls in the same session are no-ops for that build ID (guard fires once per session per build).
  - Replace `window.location.reload()` with:
    ```ts
    toast("A new version of Unicorn is available.", {
      duration: Infinity,
      action: {
        label: "Refresh",
        onClick: () => window.location.reload(),
      },
    });
    ```
- Keep the placeholder check (`buildId === "__BUILD_ID__"`) — with the `define` in place, `currentBuildId` will now be a real value, but the remote-side placeholder guard still protects against a broken deploy.
- Keep everything else unchanged: 3-second initial delay, 5-minute interval, dev-mode skip, `startVersionChecking` / `stopVersionChecking` exports.
- Extend `getVersionDiagnostics()` to also report whether the toast has already fired this session:
  ```ts
  toastShown: sessionStorage.getItem(RELOAD_KEY) !== null
  ```
  (or a dedicated key — using the existing `RELOAD_KEY` keeps it a single source of truth).

### 3. `src/components/DevDiagnosticsPanel.tsx` — minimal update

- Read the new `toastShown` field from `getVersionDiagnostics()` and render one extra `<Row>` (e.g. "Toast shown: ✅ / ❌").
- Relabel the existing "Last reload for" row to "Last notified build" to match the new toast behaviour (no more silent reload).
- No other changes.

## Not changing

- `public/version.json` (stays as placeholder — it's overwritten in `dist/` at build time).
- `App.tsx` / Sonner mount (already present).
- The 5-minute interval, 3-second delay, and `import.meta.env.DEV` skip.
- Any other file.

## Verification

- `bun run build` locally: confirm `dist/version.json` contains a real base36 build ID and the compiled JS has that same string baked in (grep for it).
- In dev, `import.meta.env.DEV` short-circuits `checkForNewBuild` so nothing changes.
- Manual prod check: after a deploy, the toast should appear within ~5 minutes with a working Refresh button, and subsequent polls in the same session should not re-show it.

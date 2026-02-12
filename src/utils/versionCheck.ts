/**
 * Build version auto-reload guard.
 *
 * After deploy, fetches /version.json (cache-busted) and compares to the
 * build-time VITE_BUILD_ID. If they differ, reloads once to pick up new assets.
 * Uses sessionStorage to prevent infinite reload loops.
 */

const RELOAD_KEY = "did_reload_for_new_build";
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let intervalId: ReturnType<typeof setInterval> | null = null;

export async function checkForNewBuild(): Promise<void> {
  // Skip in dev or if we already reloaded this session for this build
  if (import.meta.env.DEV) return;

  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return;

    const { buildId } = await res.json();
    const currentBuildId = import.meta.env.VITE_BUILD_ID || "__BUILD_ID__";

    // If version.json still has the placeholder, skip
    if (!buildId || buildId === "__BUILD_ID__") return;
    if (buildId === currentBuildId) return;

    // New build detected — check if we already reloaded for it
    const lastReload = sessionStorage.getItem(RELOAD_KEY);
    if (lastReload === buildId) {
      // Already reloaded for this version, don't loop
      return;
    }

    // Mark and reload
    sessionStorage.setItem(RELOAD_KEY, buildId);
    window.location.reload();
  } catch {
    // Network errors are fine — don't block the app
  }
}

/**
 * Start periodic version checking. Call once from the app root.
 */
export function startVersionChecking(): void {
  // Initial check after a short delay (let the app render first)
  setTimeout(checkForNewBuild, 3000);

  // Periodic check every 5 minutes
  if (!intervalId) {
    intervalId = setInterval(checkForNewBuild, CHECK_INTERVAL_MS);
  }
}

/**
 * Stop periodic version checking.
 */
export function stopVersionChecking(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Get diagnostic info for the dev panel.
 */
export function getVersionDiagnostics() {
  return {
    currentBuildId: import.meta.env.VITE_BUILD_ID || "(not set)",
    lastReloadTarget: sessionStorage.getItem(RELOAD_KEY) || "(none)",
    isDev: import.meta.env.DEV,
  };
}

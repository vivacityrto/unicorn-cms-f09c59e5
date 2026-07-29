/**
 * Build version deploy-detection.
 *
 * After deploy, fetches /version.json (cache-busted) and compares to the
 * build-time VITE_BUILD_ID injected via vite.config.ts `define`. When they
 * differ, shows a persistent Sonner toast with a "Refresh" action instead of
 * silently reloading. sessionStorage guards against re-showing the toast for
 * the same build in the same session.
 *
 * Every build gets a fresh buildId (see vite.config.ts), so on a day with
 * several deploys, a tab left open would otherwise detect each one as a
 * distinct "new build" and stack a separate toast per deploy. The toast uses
 * a stable `id` so a later detection updates the existing toast in place
 * instead of piling up another one.
 */

import { toast } from "sonner";

const RELOAD_KEY = "did_reload_for_new_build";
const NEW_BUILD_TOAST_ID = "new-build-available";
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let intervalId: ReturnType<typeof setInterval> | null = null;

export async function checkForNewBuild(): Promise<void> {
  // Skip in dev
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

    // New build detected — check if we already notified for it this session
    const lastNotified = sessionStorage.getItem(RELOAD_KEY);
    if (lastNotified === buildId) {
      // Already showed toast for this version, don't spam
      return;
    }

    // Mark before showing so subsequent polls in this session are no-ops
    sessionStorage.setItem(RELOAD_KEY, buildId);

    toast("A new version of Unicorn is available.", {
      id: NEW_BUILD_TOAST_ID,
      duration: Infinity,
      action: {
        label: "Refresh",
        onClick: () => window.location.reload(),
      },
    });
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
    toastShown: sessionStorage.getItem(RELOAD_KEY) !== null,
    isDev: import.meta.env.DEV,
  };
}

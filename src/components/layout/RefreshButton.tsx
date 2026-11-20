import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Forces a fresh load of the app, even where the browser would otherwise serve cached copies.
 * A plain reload can reuse cached HTML and scripts, and an installed app has no browser toolbar to hard-refresh with.
 * So: drop any service-worker registrations and cache storage, then load the same page under a new URL, which the
 * browser cannot answer from cache.
 */
export async function hardRefresh(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Best effort: a failure here must never stop the page from reloading.
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_refresh", String(Date.now()));
  window.location.replace(url.toString());
}

/**
 * A "Refresh" button for the footer. The portal is often used as an installed app, where there is no browser toolbar or
 * reload button, so this performs a hard refresh and picks up the latest version and data. It sits inside the slim 25px footer,
 * so it is small and text-only on wide screens (icon only on narrow ones).
 */
export function RefreshButton({ className, onRefresh }: { className?: string; onRefresh?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => (onRefresh ? onRefresh() : void hardRefresh())}
      aria-label="Refresh the page"
      title="Refresh the page to get the latest version and data"
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <RotateCw aria-hidden className="h-3 w-3" />
      <span className="hidden sm:inline">Refresh</span>
    </button>
  );
}

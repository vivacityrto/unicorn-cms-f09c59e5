import { RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A "Refresh" button for the footer. The portal is often used as an installed app, where there is no browser toolbar or
 * reload button, so this reloads the page and picks up the latest version and data. It sits inside the slim 25px footer,
 * so it is small and text-only on wide screens (icon only on narrow ones).
 */
export function RefreshButton({ className, onRefresh }: { className?: string; onRefresh?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => (onRefresh ? onRefresh() : window.location.reload())}
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

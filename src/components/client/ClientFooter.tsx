import { useHelpCenter } from "@/components/help-center";
import { RefreshButton } from "@/components/layout/RefreshButton";
import { BuildVersion } from "@/components/layout/BuildVersion";

/**
 * Client footer, pinned to the bottom of the window. Kept to one slim row so it
 * takes little screen height: contact, help, and the legal line.
 */
export function ClientFooter() {
  const currentYear = new Date().getFullYear();
  const { openHelpCenter, canAccess: canAccessHelpCenter } = useHelpCenter();

  return (
    <footer className="box-border h-[25px] w-full border-t bg-card px-4 text-[11px] leading-none text-muted-foreground md:px-6">
      <div className="flex h-full items-center justify-between gap-x-6">
        <div className="flex min-w-0 items-center gap-x-4">
          <span className="hidden sm:inline">
            Support:{" "}
            <a href="mailto:support@vivacity.com.au" className="text-foreground/80 hover:text-foreground transition-colors">
              support@vivacity.com.au
            </a>
          </span>
          <a href="tel:1300729455" className="text-foreground/80 hover:text-foreground transition-colors">
            1300 729 455
          </a>
          <RefreshButton />
          {canAccessHelpCenter && (
            <button
              type="button"
              onClick={() => openHelpCenter()}
              className="text-foreground/80 hover:text-foreground transition-colors"
            >
              Get Help
            </button>
          )}
        </div>
        <div className="flex min-w-0 items-center gap-x-4">
          <span className="hidden truncate text-muted-foreground/70 md:inline">
            © {currentYear} Vivacity Coaching &amp; Consulting Pty Ltd · ABN 40 140 059 016
          </span>
          <BuildVersion />
        </div>
      </div>
    </footer>
  );
}

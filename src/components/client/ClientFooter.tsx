import { useHelpCenter } from "@/components/help-center";

/**
 * Client footer, pinned to the bottom of the window. Kept to one slim row so it
 * takes little screen height: contact, help, and the legal line.
 */
export function ClientFooter() {
  const currentYear = new Date().getFullYear();
  const { openHelpCenter, canAccess: canAccessHelpCenter } = useHelpCenter();

  return (
    <footer className="w-full border-t bg-card px-6 py-1 text-[11px] text-muted-foreground">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            Support:{" "}
            <a href="mailto:support@vivacity.com.au" className="text-foreground/80 hover:text-foreground transition-colors">
              support@vivacity.com.au
            </a>
          </span>
          <a href="tel:1300729455" className="text-foreground/80 hover:text-foreground transition-colors">
            1300 729 455
          </a>
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
        <span className="text-muted-foreground/70">
          © {currentYear} Vivacity Coaching &amp; Consulting Pty Ltd · ABN 40 140 059 016
        </span>
      </div>
    </footer>
  );
}

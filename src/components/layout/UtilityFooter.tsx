import { Link } from "react-router-dom";
import { HelpCircle, LifeBuoy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useHelpCenter } from "@/components/help-center";

interface UtilityFooterProps {
  /** Shown only when a client or tenant is selected. Omitted otherwise, so the footer never claims a context it doesn't have. */
  activeTenantName?: string | null;
}

const BUILD_ID = import.meta.env.VITE_BUILD_ID as string | undefined;

/**
 * Staff footer, pinned to the bottom of the window. Slim by design: who you are,
 * the client you are working on (when one is selected), and the way to get help.
 */
export function UtilityFooter({ activeTenantName }: UtilityFooterProps) {
  const { profile } = useAuth();
  const { openHelpCenter } = useHelpCenter();
  const userRole = profile?.unicorn_role || "User";
  const showBuild = !!BUILD_ID && BUILD_ID !== "__BUILD_ID__";

  return (
    <footer className="w-full border-t bg-card px-6 py-1 text-[11px]">
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-3">
          {activeTenantName && (
            <>
              <span className="truncate max-w-[220px] font-medium text-foreground/80">{activeTenantName}</span>
              <span aria-hidden className="text-muted-foreground/50">|</span>
            </>
          )}
          {/* leading-none keeps the text inside the fixed-height pill. */}
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] leading-none">{userRole}</Badge>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <button
            type="button"
            onClick={() => openHelpCenter()}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <HelpCircle aria-hidden className="h-3.5 w-3.5" />
            <span>Help Centre</span>
          </button>
          <Link
            to="/support-tickets"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <LifeBuoy aria-hidden className="h-3.5 w-3.5" />
            <span>Support Tickets</span>
          </Link>
          {showBuild && (
            <span className="hidden text-muted-foreground/60 md:inline" title="Build version">
              Build {BUILD_ID}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

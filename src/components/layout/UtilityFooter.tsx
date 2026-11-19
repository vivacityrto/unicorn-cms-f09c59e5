import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { Building2, HelpCircle, LifeBuoy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useHelpCenter } from "@/components/help-center";
import { cn } from "@/lib/utils";
import { RefreshButton } from "@/components/layout/RefreshButton";
import { BuildVersion } from "@/components/layout/BuildVersion";

interface UtilityFooterProps {
  /** Shown only when a client or tenant is selected. Omitted otherwise, so the footer never claims a context it doesn't have. */
  activeTenantName?: string | null;
}

/** A time in a given zone, the way the team reads it ("3:45 pm AEDT"). `label` replaces the browser's zone name. */
function zoneTime(now: Date, timeZone: string, label?: string): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()} ${label ?? get("timeZoneName")}`;
}

/** Time in Sydney ("3:45 pm AEDT"; AEST in winter). */
export const sydneyTime = (now: Date): string => zoneTime(now, "Australia/Sydney");

/** Time in the Philippines. The browser would call it "GMT+8", so it is labelled PHT, as the team says it. */
export const manilaTime = (now: Date): string => zoneTime(now, "Asia/Manila", "PHT");

function useOnline(): boolean {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("online", notify);
      window.addEventListener("offline", notify);
      return () => {
        window.removeEventListener("online", notify);
        window.removeEventListener("offline", notify);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

function useClocks(): { sydney: string; manila: string } {
  const read = () => {
    const now = new Date();
    return { sydney: sydneyTime(now), manila: manilaTime(now) };
  };
  const [text, setText] = useState(read);
  useEffect(() => {
    const id = window.setInterval(() => setText(read()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return text;
}

const divider = <span aria-hidden className="hidden h-3 w-px shrink-0 bg-border sm:block" />;
const link =
  "inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Staff footer, pinned to the bottom of the window. The bar is a fixed 25px tall (unchanged), so everything inside is
 * sized to fit it: who you are and which client you are working on on the left, the time and connection in the
 * middle where there is room, and help, support and the build on the right.
 */
export function UtilityFooter({ activeTenantName }: UtilityFooterProps) {
  const { profile } = useAuth();
  const { openHelpCenter, canAccess: canAccessHelpCenter } = useHelpCenter();
  const online = useOnline();
  const clock = useClocks();
  const userRole = profile?.unicorn_role || "User";
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ");

  return (
    <footer className="box-border h-[25px] w-full border-t bg-card px-4 text-[11px] leading-none md:px-6">
      <div className="flex h-full items-center justify-between gap-3 text-muted-foreground">
        {/* Left: who and where */}
        <div className="flex min-w-0 items-center gap-2.5">
          {name && <span className="hidden max-w-[160px] truncate font-medium text-foreground/80 md:inline">{name}</span>}
          <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px] leading-none">{userRole}</Badge>
          {activeTenantName && (
            <>
              {divider}
              <span className="max-w-[200px] truncate font-medium text-foreground/80 lg:max-w-[320px]" title={activeTenantName}>{activeTenantName}</span>
            </>
          )}
        </div>

        {/* Middle: time and connection, only where there is room */}
        <div className="hidden min-w-0 items-center gap-3 lg:flex">
          <span className="tabular-nums" title="Sydney time">{clock.sydney}</span>
          {divider}
          <span className="tabular-nums" title="Philippines time">{clock.manila}</span>
          {divider}
          <span className="inline-flex items-center gap-1.5" role="status" aria-label={online ? "Online" : "Offline"}>
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", online ? "bg-emerald-500" : "bg-destructive")} />
            {online ? "Online" : "Offline: changes may not save"}
          </span>
          <span aria-hidden className="hidden text-muted-foreground/60 2xl:inline">We Make Compliance Simple!</span>
        </div>

        {/* Right: refresh, help, support, build */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <RefreshButton className="text-muted-foreground" />
          {/* Only offered where the Help Centre can open; otherwise the click would do nothing. */}
          {canAccessHelpCenter && (
            <button type="button" onClick={() => openHelpCenter()} aria-label="Help Centre" className={link}>
              <HelpCircle aria-hidden className="h-3 w-3" />
              <span className="hidden sm:inline">Help Centre</span>
            </button>
          )}
          <Link to="/support-tickets" aria-label="Support Tickets" className={link}>
            <LifeBuoy aria-hidden className="h-3 w-3" />
            <span className="hidden sm:inline">Support Tickets</span>
          </Link>
          <Link to="/manage-tenants" aria-label="Manage Clients" className={link}>
            <Building2 aria-hidden className="h-3 w-3" />
            <span className="hidden sm:inline">Manage Clients</span>
          </Link>
          <BuildVersion />
        </div>
      </div>
    </footer>
  );
}

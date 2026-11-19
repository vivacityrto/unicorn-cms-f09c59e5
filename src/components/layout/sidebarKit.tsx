import type { ReactNode } from "react";
import { Pin, PinOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The purple to fuchsia gradient behind the client and staff sidebars, so the two portals look like one product. */
export const SIDEBAR_GRADIENT = "linear-gradient(180deg, hsl(270 55% 41%) 0%, hsl(330 86% 51%) 100%)";

/**
 * The floating label for a collapsed icon rail: what the item is, and one line about it, beside the icon on hover and on
 * keyboard focus. When the sidebar is open the words are already on screen, so it does nothing.
 */
export function RailTip({ show, label, description, children }: { show: boolean; label: string; description: string; children: ReactNode }) {
  if (!show) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={12} className="max-w-[16rem] rounded-xl border-border bg-popover px-3 py-2 shadow-lg">
        <p className="text-[13px] font-semibold leading-tight text-foreground">{label}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** The pin in an open sidebar's header: pinned means the menu starts open every time, unpinned means it starts as icons. */
export function StartOpenPin({ pinned, onChange }: { pinned: boolean; onChange: (open: boolean) => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={pinned}
          aria-label="Start with the menu open"
          onClick={() => onChange(!pinned)}
          className={cn(
            "rounded-full p-1.5 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
            pinned ? "bg-white/20 text-white" : "text-white/70",
          )}
        >
          {pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[16rem] rounded-xl border-border bg-popover px-3 py-2 shadow-lg">
        <p className="text-[13px] font-semibold leading-tight text-foreground">{pinned ? "Menu starts open" : "Menu starts as icons"}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
          {pinned ? "Press to start with icons only." : "Press to always start with the full menu open."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

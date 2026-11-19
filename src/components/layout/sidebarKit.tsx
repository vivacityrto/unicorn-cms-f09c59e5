import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

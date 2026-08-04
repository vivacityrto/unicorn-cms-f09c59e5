import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAskVivAssistantWidget } from "@/hooks/useAskVivAssistantWidget";
import { useRBAC } from "@/hooks/useRBAC";
import vivIcon from "@/assets/viv-icon.png";

/**
 * AskVivButton - Top menu bar entry point for Ask Viv
 * Visible to SuperAdmins and Vivacity Team members
 *
 * Opens the new Ask Viv Assistant widget (Claude Sonnet, tool-use, RAG),
 * not the original AskVivPanel/compliance-assistant — that older panel is
 * still fully intact and reachable via its own floating launcher
 * (AskVivFloatingLauncher, feature-flag gated) and useAskViv(), just no
 * longer the topbar's entry point as of this change.
 */
export function AskVivButton() {
  const { openWidget } = useAskVivAssistantWidget();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();

  // Only render for Vivacity Team (includes SuperAdmins)
  if (!isSuperAdmin && !isVivacityTeam) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-10 w-10 rounded-full shrink-0 p-1.5"
          onClick={openWidget}
          aria-label="Open Ask Viv"
        >
          <img src={vivIcon} alt="Ask Viv" className="h-full w-full object-contain" />
          {/* Status indicator using success color */}
          <span className="absolute top-0.5 right-0.5 h-2 w-2 rounded-full bg-[hsl(var(--success,142_76%_36%))] border border-background" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Ask Viv</p>
      </TooltipContent>
    </Tooltip>
  );
}

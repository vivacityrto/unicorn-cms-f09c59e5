import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAskViv } from "@/hooks/useAskViv";
import { useRBAC } from "@/hooks/useRBAC";
import vivIcon from "@/assets/viv-icon.png";

/**
 * AskVivButton - Top menu bar entry point for Ask Viv
 * Visible to SuperAdmins and Vivacity Team members
 */
export function AskVivButton() {
  const { isOpen, openPanel } = useAskViv();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();

  // Only render for Vivacity Team (includes SuperAdmins)
  if (!isSuperAdmin && !isVivacityTeam) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 rounded-full hover:bg-primary/10 transition-colors p-1"
          onClick={openPanel}
          aria-label="Open Ask Viv"
        >
          <img src={vivIcon} alt="Ask Viv" className="h-8 w-8 object-contain" />
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

import { Users } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { useFacilitatorMode } from '@/contexts/FacilitatorModeContext';

/**
 * Toggle switch for Facilitator Mode.
 * Only visible to eligible users (Super Admin, Team Leader).
 * Placed in the header area of EOS pages.
 */
export function FacilitatorModeToggle() {
  const { isFacilitatorMode, toggleFacilitatorMode, isEligible } = useFacilitatorMode();

  // Don't render if user isn't eligible
  if (!isEligible) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 px-2 lg:px-3 py-1.5 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm">
            <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Label 
              htmlFor="facilitator-mode" 
              className="text-sm font-medium cursor-pointer select-none hidden lg:inline"
            >
              Facilitator Mode
            </Label>
            <Switch
              id="facilitator-mode"
              checked={isFacilitatorMode}
              onCheckedChange={toggleFacilitatorMode}
              className="data-[state=checked]:bg-primary flex-shrink-0"
            />
            {isFacilitatorMode && (
              <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20 hidden md:inline-flex">
                Active
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-sm">
            {isFacilitatorMode 
              ? "Facilitator Mode is active. You'll see guidance prompts and checklists to help run EOS effectively."
              : "Enable to see facilitation guidance, checklists, and prompts during EOS activities."}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

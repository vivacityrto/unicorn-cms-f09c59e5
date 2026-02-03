import { Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFacilitatorMode } from '@/contexts/FacilitatorModeContext';

/**
 * Subtle banner shown when Facilitator Mode is active.
 * Non-intrusive, can be dismissed for the session.
 */
export function FacilitatorModeBanner() {
  const { isFacilitatorMode, disableFacilitatorMode } = useFacilitatorMode();

  if (!isFacilitatorMode) {
    return null;
  }

  return (
    <div className="bg-primary/5 border-b border-primary/10 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-primary font-medium">Facilitator Mode is active.</span>
          <span className="text-muted-foreground">You are guiding EOS execution.</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
          onClick={disableFacilitatorMode}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

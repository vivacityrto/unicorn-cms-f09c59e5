import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, ShieldCheck, Plus, AlertCircle, AlertTriangle } from 'lucide-react';
import { Stage } from '@/hooks/usePackageBuilder';
import { checkFrameworkCompatibility } from '@/components/stage/StageFrameworkSelector';

// Recommended stage sets by package type (matched by stable stage_key)
const RECOMMENDED_STAGE_KEYS: Record<string, string[]> = {
  rto: [
    'onboarding-client-commencement',
    'rto-documentation-2025',
    'offboarding-client-closure'
  ],
  membership: [
    'onboarding-client-commencement',
    'membership-support-ongoing',
    'offboarding-client-closure'
  ]
};

// Human-readable titles for stage_keys (used when stage not found)
const STAGE_KEY_LABELS: Record<string, string> = {
  'onboarding-client-commencement': 'Onboarding – Client Commencement',
  'rto-documentation-2025': 'RTO Documentation – 2025',
  'offboarding-client-closure': 'Offboarding – Client Closure',
  'membership-support-ongoing': 'Membership Support – Ongoing'
};

interface StageMatch {
  stageKey: string;
  displayTitle: string;
  stage: Stage | null;
  alreadyInPackage: boolean;
  isCertified: boolean;
  frameworkMismatch: boolean;
}

interface AddRecommendedStagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packageType: string;
  allStages: Stage[];
  existingStageIds: number[];
  onAddStages: (stageIds: number[]) => Promise<void>;
}

export function AddRecommendedStagesDialog({
  open,
  onOpenChange,
  packageType,
  allStages,
  existingStageIds,
  onAddStages
}: AddRecommendedStagesDialogProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [stageMatches, setStageMatches] = useState<StageMatch[]>([]);

  useEffect(() => {
    if (!open) return;

    // Get recommended stage_keys for this package type
    const recommendedKeys = RECOMMENDED_STAGE_KEYS[packageType?.toLowerCase()] || [];

    // Match stage_keys to actual stages, preferring certified ones
    const matches: StageMatch[] = recommendedKeys.map(stageKey => {
      // Find stage by stage_key
      const matchedStage = allStages.find(s => s.stage_key === stageKey);
      
      // If no exact match, try to find by certified + partial match as fallback
      let bestMatch = matchedStage;
      if (!bestMatch) {
        // Fallback: look for certified stages with matching key pattern
        bestMatch = allStages.find(s => 
          s.stage_key?.startsWith(stageKey) && s.is_certified
        ) || null;
      }

      const alreadyInPackage = bestMatch ? existingStageIds.includes(bestMatch.id) : false;
      const displayTitle = STAGE_KEY_LABELS[stageKey] || stageKey;
      
      // Check framework compatibility
      const stageFrameworks = bestMatch?.frameworks as string[] | null;
      const frameworkMismatch = bestMatch ? !checkFrameworkCompatibility(stageFrameworks, packageType) : false;

      return {
        stageKey,
        displayTitle,
        stage: bestMatch,
        alreadyInPackage,
        isCertified: bestMatch?.is_certified || false,
        frameworkMismatch
      };
    });

    setStageMatches(matches);
  }, [open, packageType, allStages, existingStageIds]);

  // Only include stages with compatible frameworks (or Shared)
  const stagesToAdd = stageMatches.filter(m => m.stage && !m.alreadyInPackage && !m.frameworkMismatch);
  const missingStages = stageMatches.filter(m => !m.stage);
  const frameworkExcludedStages = stageMatches.filter(m => m.stage && !m.alreadyInPackage && m.frameworkMismatch);

  const handleAdd = async () => {
    if (stagesToAdd.length === 0) return;
    
    setIsAdding(true);
    try {
      const stageIds = stagesToAdd.map(m => m.stage!.id);
      await onAddStages(stageIds);
      onOpenChange(false);
    } finally {
      setIsAdding(false);
    }
  };

  const hasRecommendations = RECOMMENDED_STAGE_KEYS[packageType?.toLowerCase()];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Recommended Phases</DialogTitle>
          <DialogDescription>
            {hasRecommendations 
              ? `Review the recommended phases for ${packageType?.toUpperCase()} packages.`
              : `No recommended phases defined for "${packageType}" packages.`
            }
          </DialogDescription>
        </DialogHeader>

        {hasRecommendations && (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3 pr-4">
              {stageMatches.map((match, index) => (
                <div 
                  key={index}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    match.alreadyInPackage 
                      ? 'bg-muted/50 border-muted' 
                      : match.frameworkMismatch
                        ? 'bg-amber-500/5 border-amber-500/20'
                        : match.stage 
                          ? 'bg-background border-border'
                          : 'bg-destructive/5 border-destructive/20'
                  }`}
                >
                  <div className="mt-0.5">
                    {match.alreadyInPackage ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : match.frameworkMismatch ? (
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    ) : match.stage ? (
                      <Plus className="h-5 w-5 text-primary" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm ${match.alreadyInPackage ? 'text-muted-foreground' : ''}`}>
                        {match.stage?.title || match.displayTitle}
                      </span>
                      {match.isCertified && (
                        <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          <ShieldCheck className="h-3 w-3 mr-1" />
                          Certified
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {match.alreadyInPackage 
                        ? 'Already in package'
                        : match.frameworkMismatch
                          ? 'Not available – framework mismatch'
                          : match.stage 
                            ? 'Will be added'
                            : `Missing recommended phase template (${match.stageKey})`
                      }
                    </p>
                  </div>
                </div>
              ))}

              {missingStages.length > 0 && (
                <p className="text-xs text-muted-foreground pt-2">
                  Some recommended phases don't exist in the library. Create them with the correct stage_key first.
                </p>
              )}
              
              {frameworkExcludedStages.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mt-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800">
                    Some recommended phases are not available for this framework.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleAdd} 
            disabled={stagesToAdd.length === 0 || isAdding}
          >
            {isAdding 
              ? 'Adding...' 
              : stagesToAdd.length === 0 
                ? 'No Phases to Add'
                : `Add ${stagesToAdd.length} Phase${stagesToAdd.length !== 1 ? 's' : ''}`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

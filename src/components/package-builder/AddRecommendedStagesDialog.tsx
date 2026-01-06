import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, ShieldCheck, Plus, AlertCircle } from 'lucide-react';
import { Stage } from '@/hooks/usePackageBuilder';

// Recommended stage sets by package type (matched by title)
const RECOMMENDED_STAGES: Record<string, string[]> = {
  rto: [
    'Onboarding – Client Commencement',
    'RTO Documentation – 2025',
    'Offboarding – Client Closure'
  ],
  membership: [
    'Onboarding – Client Commencement',
    'Membership Support – Ongoing',
    'Offboarding – Client Closure'
  ]
};

interface StageMatch {
  title: string;
  stage: Stage | null;
  alreadyInPackage: boolean;
  isCertified: boolean;
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

    // Get recommended titles for this package type
    const recommendedTitles = RECOMMENDED_STAGES[packageType?.toLowerCase()] || [];

    // Match titles to actual stages, preferring certified ones
    const matches: StageMatch[] = recommendedTitles.map(title => {
      // Find all stages matching this title
      const matchingStages = allStages.filter(s => 
        s.title?.toLowerCase() === title.toLowerCase()
      );

      // Prefer certified stages
      const certifiedMatch = matchingStages.find(s => s.is_certified);
      const bestMatch = certifiedMatch || matchingStages[0] || null;

      const alreadyInPackage = bestMatch ? existingStageIds.includes(bestMatch.id) : false;

      return {
        title,
        stage: bestMatch,
        alreadyInPackage,
        isCertified: bestMatch?.is_certified || false
      };
    });

    setStageMatches(matches);
  }, [open, packageType, allStages, existingStageIds]);

  const stagesToAdd = stageMatches.filter(m => m.stage && !m.alreadyInPackage);
  const missingStages = stageMatches.filter(m => !m.stage);

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

  const hasRecommendations = RECOMMENDED_STAGES[packageType?.toLowerCase()];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Recommended Stages</DialogTitle>
          <DialogDescription>
            {hasRecommendations 
              ? `Review the recommended stages for ${packageType?.toUpperCase()} packages.`
              : `No recommended stages defined for "${packageType}" packages.`
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
                      : match.stage 
                        ? 'bg-background border-border'
                        : 'bg-destructive/5 border-destructive/20'
                  }`}
                >
                  <div className="mt-0.5">
                    {match.alreadyInPackage ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : match.stage ? (
                      <Plus className="h-5 w-5 text-primary" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm ${match.alreadyInPackage ? 'text-muted-foreground' : ''}`}>
                        {match.title}
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
                        : match.stage 
                          ? 'Will be added'
                          : 'Stage not found in library'
                      }
                    </p>
                  </div>
                </div>
              ))}

              {missingStages.length > 0 && (
                <p className="text-xs text-muted-foreground pt-2">
                  Some stages don't exist yet. Create them in the Stage Library first.
                </p>
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
                ? 'No Stages to Add'
                : `Add ${stagesToAdd.length} Stage${stagesToAdd.length !== 1 ? 's' : ''}`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

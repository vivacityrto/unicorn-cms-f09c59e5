import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { AlertCircle, ArrowRight, CheckCircle, Circle, Lightbulb, Rocket } from 'lucide-react';
import { useFacilitatorMode } from '@/contexts/FacilitatorModeContext';
import { useEosReadiness } from '@/hooks/useEosReadiness';
import { READINESS_STATE_COLORS } from '@/types/eosReadiness';
import { cn } from '@/lib/utils';

/**
 * Facilitator Mode panel showing EOS onboarding status and next steps.
 * Only visible when Facilitator Mode is active.
 */
export function FacilitatorOnboardingPanel() {
  const { isFacilitatorMode } = useFacilitatorMode();
  const { readiness, isLoading } = useEosReadiness();

  if (!isFacilitatorMode || isLoading || !readiness) {
    return null;
  }

  const colors = READINESS_STATE_COLORS[readiness.state];
  
  // Find next incomplete item
  const nextIncompleteItem = readiness.categories
    .flatMap(c => c.items)
    .find(item => !item.isComplete);

  // Find incomplete categories
  const incompleteCategories = readiness.categories.filter(c => !c.isComplete);

  return (
    <Card className={cn('border-2', colors.border)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Rocket className={cn('h-4 w-4', colors.text)} />
          EOS Readiness
          <Badge 
            variant="outline" 
            className={cn('ml-auto text-xs', colors.bg, colors.text)}
          >
            {readiness.stateLabel}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Onboarding Progress</span>
            <span className="font-medium">{readiness.overallProgress}%</span>
          </div>
          <Progress value={readiness.overallProgress} className="h-2" />
        </div>

        {/* Next Step */}
        {nextIncompleteItem && (
          <div className="p-3 rounded-md bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/50">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                  Next Recommended Step
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  {nextIncompleteItem.label}
                </p>
                {nextIncompleteItem.incompleteReason && (
                  <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-1">
                    {nextIncompleteItem.incompleteReason}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Incomplete Categories */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Incomplete Areas
          </p>
          {incompleteCategories.slice(0, 3).map((category) => (
            <div 
              key={category.id}
              className="flex items-center gap-2 text-xs"
            >
              <Circle className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground flex-1">
                {category.title.replace(/^\d+\.\s*/, '')}
              </span>
              <span className="text-muted-foreground">
                {category.completedCount}/{category.totalCount}
              </span>
            </div>
          ))}
          {incompleteCategories.length > 3 && (
            <p className="text-[10px] text-muted-foreground pl-5">
              +{incompleteCategories.length - 3} more areas
            </p>
          )}
        </div>

        {/* Link to Onboarding */}
        <Link to="/eos/onboarding">
          <Button variant="ghost" size="sm" className="w-full text-xs">
            View Full Checklist
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </Link>

        {/* Mature State */}
        {readiness.state === 'mature' && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 border border-primary/20">
            <CheckCircle className="h-4 w-4 text-primary" />
            <p className="text-xs font-medium text-primary">
              EOS Fully Embedded!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

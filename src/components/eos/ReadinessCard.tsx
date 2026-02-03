import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle, Loader2, Rocket, Target } from 'lucide-react';
import { useEosReadiness } from '@/hooks/useEosReadiness';
import { READINESS_STATE_COLORS } from '@/types/eosReadiness';
import { cn } from '@/lib/utils';

/**
 * Readiness Card for EOS Overview page.
 * Shows current EOS state, progress bar, and link to onboarding checklist.
 */
export function ReadinessCard() {
  const { readiness, isLoading } = useEosReadiness();

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!readiness) {
    return null;
  }

  const colors = READINESS_STATE_COLORS[readiness.state];
  const isMature = readiness.state === 'mature';

  return (
    <Card className={cn('border-2', colors.border)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Rocket className={cn('h-5 w-5', colors.text)} />
              EOS Readiness
            </CardTitle>
            <CardDescription>
              Track your EOS implementation progress
            </CardDescription>
          </div>
          <Badge 
            variant="outline" 
            className={cn('text-sm font-medium', colors.bg, colors.text, colors.border)}
          >
            {readiness.stateLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium">
              {readiness.completedItems}/{readiness.totalItems} items
            </span>
          </div>
          <Progress value={readiness.overallProgress} className="h-2" />
        </div>

        {/* State Description */}
        <p className="text-sm text-muted-foreground">
          {readiness.stateDescription}
        </p>

        {/* Quick Category Summary */}
        <div className="grid grid-cols-3 gap-2">
          {readiness.categories.slice(0, 3).map((category) => (
            <div 
              key={category.id}
              className="p-2 rounded-md bg-muted/50 text-center"
            >
              <div className="flex items-center justify-center gap-1">
                {category.isComplete ? (
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Target className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="text-xs font-medium">
                  {category.completedCount}/{category.totalCount}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {category.title.replace(/^\d+\.\s*/, '')}
              </p>
            </div>
          ))}
        </div>

        {/* CTA */}
        {!isMature && (
          <Link to="/eos/onboarding">
            <Button variant="outline" className="w-full group">
              View Onboarding Checklist
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
        )}

        {isMature && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-primary/5 border border-primary/20">
            <CheckCircle className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium text-primary">EOS Fully Embedded</p>
              <p className="text-xs text-muted-foreground">
                Congratulations! Your team is running EOS at full maturity.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

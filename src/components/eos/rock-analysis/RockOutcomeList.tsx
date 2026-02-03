import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, ArrowRight, XCircle, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { RockOutcome, RockOutcomeType } from '@/types/rockAnalysis';
import { OUTCOME_CONFIG } from '@/types/rockAnalysis';

interface RockOutcomeListProps {
  outcomes: RockOutcome[];
  showSeat?: boolean;
}

const OUTCOME_ICONS: Record<RockOutcomeType, React.ReactNode> = {
  completed_on_time: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  completed_late: <Clock className="h-4 w-4 text-amber-600" />,
  rolled_forward: <ArrowRight className="h-4 w-4 text-blue-600" />,
  dropped: <XCircle className="h-4 w-4 text-destructive" />,
};

export function RockOutcomeList({ outcomes, showSeat = true }: RockOutcomeListProps) {
  if (outcomes.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No rock outcomes found
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {outcomes.map((outcome) => {
        const config = OUTCOME_CONFIG[outcome.outcome_type];
        
        return (
          <Card key={outcome.id} className="border-l-4" style={{ borderLeftColor: 'hsl(var(--primary))' }}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {OUTCOME_ICONS[outcome.outcome_type]}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-medium text-sm">{outcome.rock_title}</h4>
                    <Badge variant="outline" className={cn('shrink-0 text-xs', config.color, config.bgColor)}>
                      {config.label}
                    </Badge>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {outcome.due_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Due: {format(new Date(outcome.due_date), 'MMM d, yyyy')}
                      </span>
                    )}
                    {outcome.completed_at && (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Completed: {format(new Date(outcome.completed_at), 'MMM d, yyyy')}
                      </span>
                    )}
                    {outcome.rolled_to_quarter && (
                      <span className="flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" />
                        Rolled to: {outcome.rolled_to_quarter}
                      </span>
                    )}
                  </div>
                  
                  {outcome.notes && (
                    <p className="text-xs text-muted-foreground mt-1">{outcome.notes}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

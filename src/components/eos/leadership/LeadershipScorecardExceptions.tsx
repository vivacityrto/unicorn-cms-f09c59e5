import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import type { LeadershipScorecardException } from '@/hooks/useLeadershipDashboard';

interface LeadershipScorecardExceptionsProps {
  exceptions: LeadershipScorecardException[];
}

export function LeadershipScorecardExceptions({ exceptions }: LeadershipScorecardExceptionsProps) {
  if (exceptions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Scorecard Exceptions</CardTitle>
          <CardDescription>Metrics that are off target this week</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="text-emerald-600 font-medium">✓ All metrics on track</div>
            <p className="text-sm text-muted-foreground mt-1">
              No exceptions to report this week
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scorecard Exceptions</CardTitle>
        <CardDescription>
          {exceptions.length} metric{exceptions.length !== 1 ? 's' : ''} off target
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {exceptions.map((exception) => (
            <Link
              key={exception.id}
              to="/eos/scorecard"
              className="flex items-center justify-between p-3 rounded-lg border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{exception.metricName}</div>
                <div className="text-sm text-muted-foreground mt-0.5">
                  Target: {exception.target}{exception.unit} · Actual: {exception.actual}{exception.unit}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-medium text-destructive">
                    {exception.variance > 0 ? '+' : ''}{exception.variance}{exception.unit}
                  </div>
                </div>
                <div className={cn(
                  'p-1.5 rounded',
                  exception.trend === 'up' ? 'text-emerald-600' :
                  exception.trend === 'down' ? 'text-destructive' :
                  'text-muted-foreground'
                )}>
                  {exception.trend === 'up' && <TrendingUp className="h-4 w-4" />}
                  {exception.trend === 'down' && <TrendingDown className="h-4 w-4" />}
                  {exception.trend === 'stable' && <Minus className="h-4 w-4" />}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

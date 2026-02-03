import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Clock, ArrowRight, XCircle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuarterSummary } from '@/types/rockAnalysis';
import { OUTCOME_CONFIG } from '@/types/rockAnalysis';

interface QuarterSummaryCardProps {
  summary: QuarterSummary;
  onClick?: () => void;
}

export function QuarterSummaryCard({ summary, onClick }: QuarterSummaryCardProps) {
  const isGoodCompletion = summary.completion_rate >= 70;
  const isWarningCompletion = summary.completion_rate >= 50 && summary.completion_rate < 70;
  
  return (
    <Card 
      className={cn(
        "transition-all",
        onClick && "cursor-pointer hover:shadow-md hover:scale-[1.02]"
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{summary.quarter}</CardTitle>
          <Badge 
            variant="outline"
            className={cn(
              isGoodCompletion && "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/30",
              isWarningCompletion && "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30",
              !isGoodCompletion && !isWarningCompletion && "text-destructive bg-destructive/10"
            )}
          >
            {summary.completion_rate}% Complete
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          {summary.total_rocks} Rock{summary.total_rocks !== 1 ? 's' : ''} total
        </div>
        
        {/* Stacked bar visualization */}
        <div className="h-4 rounded-full overflow-hidden flex bg-muted">
          {summary.completed_on_time > 0 && (
            <div 
              className="bg-emerald-500 h-full"
              style={{ width: `${summary.on_time_rate}%` }}
              title={`On Time: ${summary.completed_on_time}`}
            />
          )}
          {summary.completed_late > 0 && (
            <div 
              className="bg-amber-500 h-full"
              style={{ width: `${(summary.completed_late / summary.total_rocks) * 100}%` }}
              title={`Late: ${summary.completed_late}`}
            />
          )}
          {summary.rolled_forward > 0 && (
            <div 
              className="bg-blue-500 h-full"
              style={{ width: `${summary.roll_rate}%` }}
              title={`Rolled: ${summary.rolled_forward}`}
            />
          )}
          {summary.dropped > 0 && (
            <div 
              className="bg-destructive h-full"
              style={{ width: `${summary.drop_rate}%` }}
              title={`Dropped: ${summary.dropped}`}
            />
          )}
        </div>
        
        {/* Legend */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span>On Time: {summary.completed_on_time}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-amber-500" />
            <span>Late: {summary.completed_late}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
            <span>Rolled: {summary.rolled_forward}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <XCircle className="h-3.5 w-3.5 text-destructive" />
            <span>Dropped: {summary.dropped}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

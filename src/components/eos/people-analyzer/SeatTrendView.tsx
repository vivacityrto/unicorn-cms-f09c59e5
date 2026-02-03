import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Armchair, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PeopleAnalyzerTrend, PATrend } from '@/types/peopleAnalyzer';
import { TREND_CONFIG } from '@/types/peopleAnalyzer';

interface SeatTrendViewProps {
  seatId: string;
  seatName: string;
  functionName?: string;
  trends: PeopleAnalyzerTrend[];
}

export function SeatTrendView({ seatId, seatName, functionName, trends }: SeatTrendViewProps) {
  // Aggregate by core value
  const byValue: Record<string, PeopleAnalyzerTrend[]> = {};
  for (const t of trends) {
    if (!byValue[t.core_value_id]) byValue[t.core_value_id] = [];
    byValue[t.core_value_id].push(t);
  }

  const valueSummaries = Object.entries(byValue).map(([valueId, valueTrends]) => {
    const atRiskCount = valueTrends.filter(t => t.is_at_risk).length;
    const decliningCount = valueTrends.filter(t => t.trend === 'Declining').length;
    const latestTrend = valueTrends.sort((a, b) => 
      (b.quarter_year * 10 + b.quarter_number) - (a.quarter_year * 10 + a.quarter_number)
    )[0];

    // Aggregate trend across holders
    let overallTrend: PATrend = 'Stable';
    if (decliningCount > valueTrends.length / 2) overallTrend = 'Declining';
    else if (valueTrends.filter(t => t.trend === 'Improving').length > valueTrends.length / 2) overallTrend = 'Improving';

    return {
      core_value_id: valueId,
      core_value_text: latestTrend.core_value_text,
      trend: overallTrend,
      atRiskCount,
      totalHolders: new Set(valueTrends.map(t => t.user_id)).size,
    };
  });

  // Find systemic issues (same value declining for 2+ holders)
  const systemicIssues = valueSummaries
    .filter(v => v.trend === 'Declining' && v.atRiskCount >= 2)
    .map(v => `"${v.core_value_text}" shows declining trend across this seat`);

  const hasIssues = systemicIssues.length > 0;

  return (
    <Card className={hasIssues ? 'border-amber-300 dark:border-amber-700' : ''}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Armchair className="h-4 w-4" />
          {seatName}
          {functionName && (
            <Badge variant="outline" className="text-[10px] ml-1">
              {functionName}
            </Badge>
          )}
          {hasIssues && (
            <Badge variant="outline" className="ml-auto text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {systemicIssues.length} systemic issue{systemicIssues.length > 1 ? 's' : ''}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Systemic Issues Banner */}
        {systemicIssues.length > 0 && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">
              Systemic Alignment Concerns
            </p>
            <ul className="space-y-1">
              {systemicIssues.map((issue, idx) => (
                <li key={idx} className="text-[11px] text-amber-600 dark:text-amber-400">
                  • {issue}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Value breakdown */}
        <div className="space-y-3">
          {valueSummaries.map((v) => {
            const TrendIcon = v.trend === 'Improving' ? TrendingUp 
              : v.trend === 'Declining' ? TrendingDown 
              : Minus;

            const healthPercent = v.totalHolders > 0 
              ? ((v.totalHolders - v.atRiskCount) / v.totalHolders) * 100 
              : 100;

            return (
              <div key={v.core_value_id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate">{v.core_value_text}</span>
                    <div className="flex items-center gap-1">
                      <TrendIcon className={cn('h-3 w-3', TREND_CONFIG[v.trend].color)} />
                      <span className={cn('text-[10px]', TREND_CONFIG[v.trend].color)}>
                        {v.trend}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress 
                      value={healthPercent} 
                      className="h-1.5 flex-1"
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {v.totalHolders - v.atRiskCount}/{v.totalHolders} healthy
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {valueSummaries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No People Analyzer data for this seat.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

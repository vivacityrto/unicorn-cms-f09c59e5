import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Building2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PeopleAnalyzerTrend } from '@/types/peopleAnalyzer';
import { RATING_CONFIG } from '@/types/peopleAnalyzer';

interface TenantTrendSummaryProps {
  trends: PeopleAnalyzerTrend[];
  compactMode?: boolean;
}

export function TenantTrendSummary({ trends, compactMode = false }: TenantTrendSummaryProps) {
  if (!trends.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            No Core Values trend data available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Calculate overall rates
  const totalPlus = trends.reduce((sum, t) => sum + (t.plus_rate || 0), 0);
  const totalPlusMinus = trends.reduce((sum, t) => sum + (t.plus_minus_rate || 0), 0);
  const totalMinus = trends.reduce((sum, t) => sum + (t.minus_rate || 0), 0);
  const count = trends.length;

  const avgPlusRate = (totalPlus / count) * 100;
  const avgPlusMinusRate = (totalPlusMinus / count) * 100;
  const avgMinusRate = (totalMinus / count) * 100;

  // Group by core value to find at-risk and strengthening
  const byValue: Record<string, PeopleAnalyzerTrend[]> = {};
  for (const t of trends) {
    if (!byValue[t.core_value_id]) byValue[t.core_value_id] = [];
    byValue[t.core_value_id].push(t);
  }

  const valuesAtRisk: { text: string; minusRate: number }[] = [];
  const valuesStrengthening: { text: string; plusRate: number }[] = [];

  for (const [, valueTrends] of Object.entries(byValue)) {
    const avgMinus = valueTrends.reduce((s, t) => s + (t.minus_rate || 0), 0) / valueTrends.length;
    const avgPlus = valueTrends.reduce((s, t) => s + (t.plus_rate || 0), 0) / valueTrends.length;
    const text = valueTrends[0].core_value_text;

    if (avgMinus > 0.3) {
      valuesAtRisk.push({ text, minusRate: avgMinus * 100 });
    }
    if (avgPlus > 0.7) {
      valuesStrengthening.push({ text, plusRate: avgPlus * 100 });
    }
  }

  valuesAtRisk.sort((a, b) => b.minusRate - a.minusRate);
  valuesStrengthening.sort((a, b) => b.plusRate - a.plusRate);

  if (compactMode) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Values Alignment</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn('text-sm', RATING_CONFIG.Plus.color)}>
                {avgPlusRate.toFixed(0)}% +
              </span>
              <span className={cn('text-sm', RATING_CONFIG.Minus.color)}>
                {avgMinusRate.toFixed(0)}% -
              </span>
              {valuesAtRisk.length > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {valuesAtRisk.length} at risk
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          Organisation Values Alignment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Distribution bars */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={cn('text-xs w-16', RATING_CONFIG.Plus.color)}>Plus</span>
            <Progress value={avgPlusRate} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground w-12 text-right">
              {avgPlusRate.toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-xs w-16', RATING_CONFIG.PlusMinus.color)}>+/-</span>
            <Progress value={avgPlusMinusRate} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground w-12 text-right">
              {avgPlusMinusRate.toFixed(0)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-xs w-16', RATING_CONFIG.Minus.color)}>Minus</span>
            <Progress value={avgMinusRate} className="h-2 flex-1" />
            <span className="text-xs text-muted-foreground w-12 text-right">
              {avgMinusRate.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Values at risk */}
        {valuesAtRisk.length > 0 && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-xs font-medium text-red-700 dark:text-red-300">
                Values at Risk
              </span>
            </div>
            <ul className="space-y-1">
              {valuesAtRisk.slice(0, 3).map((v, idx) => (
                <li key={idx} className="text-[11px] text-red-600 dark:text-red-400 flex justify-between">
                  <span>{v.text}</span>
                  <span>{v.minusRate.toFixed(0)}% minus</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Values strengthening */}
        {valuesStrengthening.length > 0 && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                Strongest Values
              </span>
            </div>
            <ul className="space-y-1">
              {valuesStrengthening.slice(0, 3).map((v, idx) => (
                <li key={idx} className="text-[11px] text-emerald-600 dark:text-emerald-400 flex justify-between">
                  <span>{v.text}</span>
                  <span>{v.plusRate.toFixed(0)}% plus</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

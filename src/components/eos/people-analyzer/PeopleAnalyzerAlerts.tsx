import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, Users, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PeopleAnalyzerTrend } from '@/types/peopleAnalyzer';

interface PeopleAnalyzerAlertsProps {
  trends: PeopleAnalyzerTrend[];
  maxAlerts?: number;
  showLink?: boolean;
}

interface Alert {
  id: string;
  type: 'consecutive_minus' | 'divergence' | 'declining_value' | 'at_risk';
  message: string;
  severity: 'high' | 'medium';
  userId?: string;
  coreValue?: string;
}

export function PeopleAnalyzerAlerts({ trends, maxAlerts = 5, showLink = true }: PeopleAnalyzerAlertsProps) {
  const alerts: Alert[] = [];

  // Group by user for consecutive minus patterns
  const byUser: Record<string, PeopleAnalyzerTrend[]> = {};
  for (const t of trends) {
    if (!byUser[t.user_id]) byUser[t.user_id] = [];
    byUser[t.user_id].push(t);
  }

  // Check for alerts
  for (const t of trends) {
    // Consecutive minus (2+ quarters)
    if (t.consecutive_minus_count >= 2) {
      alerts.push({
        id: `cm-${t.id}`,
        type: 'consecutive_minus',
        message: `"${t.core_value_text}" rated Minus for ${t.consecutive_minus_count} consecutive quarters`,
        severity: t.consecutive_minus_count >= 3 ? 'high' : 'medium',
        userId: t.user_id,
        coreValue: t.core_value_text,
      });
    }

    // Manager vs Team divergence
    if (t.has_divergence) {
      alerts.push({
        id: `div-${t.id}`,
        type: 'divergence',
        message: `Rating divergence on "${t.core_value_text}" - Manager and Team Member ratings differ`,
        severity: 'medium',
        userId: t.user_id,
        coreValue: t.core_value_text,
      });
    }

    // At risk flag
    if (t.is_at_risk && t.consecutive_minus_count < 2) {
      alerts.push({
        id: `risk-${t.id}`,
        type: 'at_risk',
        message: `"${t.core_value_text}" flagged as at-risk due to declining trend`,
        severity: 'medium',
        userId: t.user_id,
        coreValue: t.core_value_text,
      });
    }
  }

  // Group by core value for systemic issues
  const byValue: Record<string, PeopleAnalyzerTrend[]> = {};
  for (const t of trends) {
    if (!byValue[t.core_value_id]) byValue[t.core_value_id] = [];
    byValue[t.core_value_id].push(t);
  }

  for (const [valueId, valueTrends] of Object.entries(byValue)) {
    const decliningCount = valueTrends.filter(t => t.trend === 'Declining').length;
    if (decliningCount >= 2) {
      alerts.push({
        id: `sys-${valueId}`,
        type: 'declining_value',
        message: `"${valueTrends[0].core_value_text}" declining across ${decliningCount} team members`,
        severity: 'high',
        coreValue: valueTrends[0].core_value_text,
      });
    }
  }

  // Sort by severity and deduplicate
  const sortedAlerts = alerts
    .sort((a, b) => (a.severity === 'high' ? -1 : 1) - (b.severity === 'high' ? -1 : 1))
    .slice(0, maxAlerts);

  if (sortedAlerts.length === 0) {
    return null;
  }

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4 text-amber-600" />
          People Analyzer Alerts
          <Badge variant="outline" className="ml-auto text-amber-700 dark:text-amber-300">
            {sortedAlerts.length} alert{sortedAlerts.length > 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sortedAlerts.map((alert) => (
          <div
            key={alert.id}
            className={cn(
              'flex items-start gap-2 p-2 rounded-lg text-xs',
              alert.severity === 'high'
                ? 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
            )}
          >
            {alert.type === 'declining_value' ? (
              <TrendingDown className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            )}
            <span className="flex-1">{alert.message}</span>
          </div>
        ))}

        {showLink && (
          <Link to="/eos/people-analyzer">
            <Button variant="ghost" size="sm" className="w-full text-xs h-7 mt-2">
              View People Analyzer Trends
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

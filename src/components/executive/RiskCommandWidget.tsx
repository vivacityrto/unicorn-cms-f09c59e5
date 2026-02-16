import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRiskCommandAlerts } from '@/hooks/useRiskCommandCentre';
import { Radio, AlertTriangle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function RiskCommandWidget() {
  const { overview, isLoading } = useRiskCommandAlerts();
  const navigate = useNavigate();

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate('/admin/risk-command')}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-destructive" />
          Risk Command
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">{overview.total - (overview.total - overview.critical - overview.high - overview.moderate)}</span>
              <span className="text-xs text-muted-foreground">active alerts</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {overview.critical > 0 && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 text-xs">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  {overview.critical} critical
                </Badge>
              )}
              {overview.high > 0 && (
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 text-xs">
                  {overview.high} high
                </Badge>
              )}
              {overview.unacknowledged > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {overview.unacknowledged} new
                </Badge>
              )}
            </div>
            {overview.unresolvedOver14Days > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {overview.unresolvedOver14Days} unresolved &gt;14 days
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

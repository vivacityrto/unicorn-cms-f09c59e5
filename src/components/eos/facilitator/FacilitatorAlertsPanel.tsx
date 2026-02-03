import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ArrowRight, Bell, RefreshCw, Loader2 } from 'lucide-react';
import { useFacilitatorMode } from '@/contexts/FacilitatorModeContext';
import { useEosAlerts, useStuckDetection } from '@/hooks/useEosAlerts';
import { AlertCard } from '@/components/eos/alerts';
import { SEVERITY_COLORS, SEVERITY_LABELS } from '@/types/eosAlerts';
import { cn } from '@/lib/utils';

/**
 * Facilitator Mode panel showing stuck alerts.
 * Only visible when Facilitator Mode is active.
 */
export function FacilitatorAlertsPanel() {
  const { isFacilitatorMode } = useFacilitatorMode();
  const { activeAlerts, newAlerts, isLoading, refetch } = useEosAlerts();
  const { detectAndCreateAlerts } = useStuckDetection();

  if (!isFacilitatorMode) {
    return null;
  }

  const handleRefresh = async () => {
    await detectAndCreateAlerts.mutateAsync();
    await refetch();
  };

  // Show top 3 alerts
  const topAlerts = activeAlerts.slice(0, 3);

  // Find highest severity
  const hasIntervention = activeAlerts.some(a => a.severity === 'intervention_required');
  const hasAttention = activeAlerts.some(a => a.severity === 'attention_required');

  const colors = hasIntervention 
    ? SEVERITY_COLORS.intervention_required 
    : hasAttention 
    ? SEVERITY_COLORS.attention_required 
    : SEVERITY_COLORS.informational;

  return (
    <Card className={cn('border', activeAlerts.length > 0 && colors.border)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className={cn('h-4 w-4', activeAlerts.length > 0 ? colors.text : 'text-muted-foreground')} />
            Stuck Alerts
            {newAlerts.length > 0 && (
              <span className={cn(
                'text-xs px-1.5 py-0.5 rounded-full',
                colors.bg, colors.text
              )}>
                {newAlerts.length} new
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleRefresh}
            disabled={detectAndCreateAlerts.isPending}
          >
            {detectAndCreateAlerts.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : activeAlerts.length === 0 ? (
          <div className="text-center py-4 text-sm text-muted-foreground">
            No stuck alerts. EOS is running smoothly.
          </div>
        ) : (
          <>
            {topAlerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} compact />
            ))}
            
            {activeAlerts.length > 3 && (
              <Link to="/eos/health">
                <Button variant="ghost" size="sm" className="w-full text-xs h-7">
                  View all {activeAlerts.length} alerts
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { useEosAlerts, useStuckDetection } from '@/hooks/useEosAlerts';
import { AlertCard } from './AlertCard';
import type { AlertStatus } from '@/types/eosAlerts';

interface AlertsListProps {
  dimension?: string;
}

export function AlertsList({ dimension }: AlertsListProps) {
  const { 
    alerts, 
    activeAlerts, 
    isLoading, 
    refetch,
    acknowledgeAlert,
    dismissAlert,
    actionAlert,
  } = useEosAlerts();
  const { detectAndCreateAlerts } = useStuckDetection();
  const [activeTab, setActiveTab] = useState<'active' | 'all' | 'dismissed'>('active');

  const handleAcknowledge = (alertId: string) => {
    acknowledgeAlert.mutate(alertId);
  };

  const handleDismiss = (alertId: string, reason: string) => {
    dismissAlert.mutate({ alertId, reason });
  };

  const handleAction = (alertId: string) => {
    actionAlert.mutate(alertId);
  };

  const handleRefresh = async () => {
    await detectAndCreateAlerts.mutateAsync();
    await refetch();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Filter by dimension if provided
  let filteredAlerts = alerts || [];
  if (dimension) {
    filteredAlerts = filteredAlerts.filter(a => a.dimension === dimension);
  }

  const displayedAlerts = activeTab === 'active' 
    ? filteredAlerts.filter(a => a.status !== 'dismissed' && !a.resolved_at)
    : activeTab === 'dismissed'
    ? filteredAlerts.filter(a => a.status === 'dismissed')
    : filteredAlerts;

  const activeCount = filteredAlerts.filter(a => a.status !== 'dismissed' && !a.resolved_at).length;
  const dismissedCount = filteredAlerts.filter(a => a.status === 'dismissed').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              Active
              {activeCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {activeCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="dismissed" className="gap-2">
              Dismissed
              {dismissedCount > 0 && (
                <Badge variant="outline" className="ml-1">
                  {dismissedCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Button 
          variant="outline" 
          size="sm"
          onClick={handleRefresh}
          disabled={detectAndCreateAlerts.isPending}
        >
          {detectAndCreateAlerts.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Check Now</span>
        </Button>
      </div>

      {displayedAlerts.length === 0 ? (
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
          <p className="text-muted-foreground">
            {activeTab === 'active' 
              ? 'No active alerts. Great job!' 
              : activeTab === 'dismissed'
              ? 'No dismissed alerts'
              : 'No alerts found'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedAlerts.map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAcknowledge={handleAcknowledge}
              onDismiss={handleDismiss}
              onAction={handleAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}

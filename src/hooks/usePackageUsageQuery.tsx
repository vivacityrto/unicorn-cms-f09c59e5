import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState, useCallback } from 'react';
import { QUERY_STALE_TIMES } from '@/lib/queryConfig';

export interface PackageUsage {
  included_minutes: number;
  used_minutes: number;
  remaining_minutes: number;
  used_percent: number;
  trailing_30d_minutes: number;
  daily_rate_minutes: number;
  forecast_days_to_zero: number | null;
  package_id: number;
  manual_minutes_total: number;
  timer_minutes_total: number;
  calendar_minutes_total: number;
  manual_minutes_30d: number;
  timer_minutes_30d: number;
  calendar_minutes_30d: number;
}

export interface ClientAlert {
  id: string;
  tenant_id: number;
  client_id: number;
  package_id: number | null;
  client_package_id: string | null;
  alert_type: string;
  severity: string;
  title: string;
  body: string | null;
  meta: Record<string, unknown>;
  threshold_percent: number | null;
  is_dismissed: boolean;
  created_at: string;
}

export interface ClientPackageInfo {
  id: number;
  package_id: number;
  package_name: string;
  status: string;
  start_date: string;
  end_date: string | null;
  included_minutes: number;
  total_hours: number;
}

// Query keys for cache management
export const packageUsageKeys = {
  all: ['package-usage'] as const,
  packages: (clientId: number) => [...packageUsageKeys.all, 'packages', clientId] as const,
  usage: (clientId: number, packageId: number) => [...packageUsageKeys.all, 'usage', clientId, packageId] as const,
  alerts: (clientId: number) => [...packageUsageKeys.all, 'alerts', clientId] as const,
};

export function useClientPackagesQuery(clientId: number | null) {
  return useQuery({
    queryKey: clientId ? packageUsageKeys.packages(clientId) : ['package-usage', 'packages', 'none'],
    queryFn: async (): Promise<ClientPackageInfo[]> => {
      if (!clientId) return [];

      const { data: instances, error } = await supabase
        .from('package_instances')
        .select('id, package_id, start_date, end_date, hours_included, hours_used, is_complete')
        .eq('tenant_id', clientId)
        .eq('is_complete', false)
        .order('start_date', { ascending: false });

      if (error) throw error;
      if (!instances || instances.length === 0) return [];

      const packageIds = [...new Set(instances.map(i => i.package_id))];
      const { data: packagesData } = await supabase
        .from('packages')
        .select('id, name, full_text, total_hours')
        .in('id', packageIds);

      const packageMap = new Map((packagesData || []).map(p => [Number(p.id), p]));

      return instances.map(inst => {
        const instId = Number(inst.id);
        const pkgId = Number(inst.package_id);
        const pkg = packageMap.get(pkgId);
        return {
          id: instId,
          package_id: pkgId,
          package_name: (pkg as any)?.full_text || pkg?.name || 'Unknown Package',
          status: inst.is_complete ? 'closed' : 'active',
          start_date: inst.start_date || '',
          end_date: inst.end_date,
          included_minutes: (inst.hours_included || pkg?.total_hours || 0) * 60,
          total_hours: pkg?.total_hours || 0
        };
      });
    },
    enabled: !!clientId,
    staleTime: QUERY_STALE_TIMES.REALTIME,
  });
}

export function usePackageUsageDataQuery(clientId: number | null, packageId: number | null) {
  return useQuery({
    queryKey: clientId && packageId ? packageUsageKeys.usage(clientId, packageId) : ['package-usage', 'usage', 'none'],
    queryFn: async (): Promise<PackageUsage | null> => {
      if (!clientId || !packageId) return null;

      const { data, error } = await supabase.rpc('rpc_get_package_usage', {
        p_client_id: clientId,
        p_client_package_id: packageId
      });

      if (error) throw error;
      
      const result = data as unknown as PackageUsage | { error: string };
      if ('error' in result) return null;
      return result;
    },
    enabled: !!clientId && !!packageId,
    staleTime: QUERY_STALE_TIMES.REALTIME,
  });
}

export function useClientAlertsQuery(clientId: number | null) {
  return useQuery({
    queryKey: clientId ? packageUsageKeys.alerts(clientId) : ['package-usage', 'alerts', 'none'],
    queryFn: async (): Promise<ClientAlert[]> => {
      if (!clientId) return [];

      const { data, error } = await supabase
        .from('client_alerts')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_dismissed', false)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as ClientAlert[];
    },
    enabled: !!clientId,
    staleTime: QUERY_STALE_TIMES.REALTIME,
  });
}

// Hook to invalidate all package usage queries for a client
export function useInvalidatePackageUsage() {
  const queryClient = useQueryClient();
  
  return {
    invalidateClient: (clientId: number) => {
      queryClient.invalidateQueries({ 
        queryKey: packageUsageKeys.packages(clientId),
        refetchType: 'active'
      });
      // Invalidate all usage queries for this client
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && 
                 key[0] === 'package-usage' && 
                 key[1] === 'usage' && 
                 key[2] === clientId;
        },
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: packageUsageKeys.alerts(clientId),
        refetchType: 'active'
      });
    },
    invalidateAll: () => {
      queryClient.invalidateQueries({ 
        queryKey: packageUsageKeys.all,
        refetchType: 'active'
      });
    }
  };
}

// Combined hook that matches the old usePackageUsage interface
export function usePackageUsageQuery(clientId: number | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  
  const { data: packages = [], isLoading: packagesLoading } = useClientPackagesQuery(clientId);
  
  // Auto-select first package if none selected
  const effectivePackageId = selectedPackageId || (packages.length > 0 ? packages[0].id : null);
  
  const { data: usage = null, isLoading: usageLoading } = usePackageUsageDataQuery(clientId, effectivePackageId);
  const { data: alerts = [], isLoading: alertsLoading } = useClientAlertsQuery(clientId);

  const loading = packagesLoading || usageLoading || alertsLoading;
  const selectedPackage = packages.find(p => p.id === effectivePackageId);

  const checkThresholds = useCallback(async () => {
    if (!clientId || !effectivePackageId) return;

    const { data, error } = await supabase.rpc('rpc_check_package_thresholds', {
      p_client_id: clientId,
      p_client_package_id: effectivePackageId
    });

    if (!error && data) {
      const result = data as unknown as { usage: PackageUsage; alerts_created: Array<{ id: string; title: string; severity: string }> };
      
      if (result.alerts_created && result.alerts_created.length > 0) {
        result.alerts_created.forEach(alert => {
          toast({
            title: alert.title,
            variant: alert.severity === 'critical' ? 'destructive' : 'default'
          });
        });
        // Refresh alerts
        if (clientId) {
          queryClient.invalidateQueries({ queryKey: packageUsageKeys.alerts(clientId) });
        }
      }
    }
  }, [clientId, effectivePackageId, toast, queryClient]);

  const dismissAlert = async (alertId: string) => {
    const { data, error } = await supabase.rpc('rpc_dismiss_alert', {
      p_alert_id: alertId
    });

    if (error) {
      toast({
        title: 'Failed to dismiss alert',
        description: error.message,
        variant: 'destructive'
      });
      return false;
    }

    const result = data as { success: boolean; error?: string };
    if (result.success && clientId) {
      queryClient.invalidateQueries({ queryKey: packageUsageKeys.alerts(clientId) });
      return true;
    }
    return false;
  };

  const refresh = async () => {
    if (clientId) {
      queryClient.invalidateQueries({ queryKey: packageUsageKeys.packages(clientId) });
      if (effectivePackageId) {
        queryClient.invalidateQueries({ queryKey: packageUsageKeys.usage(clientId, effectivePackageId) });
      }
      queryClient.invalidateQueries({ queryKey: packageUsageKeys.alerts(clientId) });
    }
  };

  return {
    packages,
    selectedPackageId: effectivePackageId,
    setSelectedPackageId,
    selectedPackage,
    usage,
    alerts,
    loading,
    checkThresholds,
    dismissAlert,
    refresh
  };
}

export function formatHours(minutes: number): string {
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = Math.round(absMinutes % 60);
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${hours}:${mins.toString().padStart(2, '0')}`;
}

export function formatForecast(days: number | null): string {
  if (days === null) return 'No recent activity';
  if (days <= 0) return 'Exhausted';
  if (days === 1) return '~1 day remaining';
  if (days < 7) return `~${days} days remaining`;
  if (days < 30) return `~${Math.round(days / 7)} weeks remaining`;
  return `~${Math.round(days / 30)} months remaining`;
}

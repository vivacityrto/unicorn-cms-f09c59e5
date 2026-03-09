import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface PackageUsage {
  included_minutes: number;
  used_minutes: number;
  remaining_minutes: number;
  used_percent: number;
  trailing_30d_minutes: number;
  daily_rate_minutes: number;
  forecast_days_to_zero: number | null;
  package_id: number;
  // Source breakdown - totals
  manual_minutes_total: number;
  timer_minutes_total: number;
  calendar_minutes_total: number;
  // Source breakdown - 30 day
  manual_minutes_30d: number;
  timer_minutes_30d: number;
  calendar_minutes_30d: number;
  billable_minutes_total: number;
  non_billable_minutes_total: number;
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
  id: number; // Changed from string to number for RPC compatibility
  package_id: number;
  package_name: string;
  status: string;
  start_date: string;
  end_date: string | null;
  included_minutes: number;
  total_hours: number;
}

export function usePackageUsage(clientId: number | null) {
  const { toast } = useToast();
  const [packages, setPackages] = useState<ClientPackageInfo[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [usage, setUsage] = useState<PackageUsage | null>(null);
  const [alerts, setAlerts] = useState<ClientAlert[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch client packages via package_instances (source of truth)
  const fetchPackages = useCallback(async () => {
    if (!clientId) return;

    // Fetch active package instances
    // Exclude child instances from top-level list
    const { data: instances, error } = await (supabase as any)
      .from('package_instances')
      .select('id, package_id, start_date, end_date, hours_included, hours_used, is_complete')
      .eq('tenant_id', clientId)
      .eq('is_complete', false)
      .is('parent_instance_id', null)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching package instances:', error);
      return;
    }

    if (!instances || instances.length === 0) {
      setPackages([]);
      return;
    }

    // Fetch package details
    const packageIds = [...new Set((instances as any[]).map(i => i.package_id))] as number[];
    const { data: packagesData } = await supabase
      .from('packages')
      .select('id, name, total_hours')
      .in('id', packageIds);

    const packageMap = new Map((packagesData || []).map(p => [p.id, p]));

    const mapped = instances.map(inst => {
      const pkg = packageMap.get(inst.package_id);
      return {
        id: inst.id, // Keep as number for RPC compatibility
        package_id: inst.package_id,
        package_name: pkg?.name || 'Unknown Package',
        status: inst.is_complete ? 'closed' : 'active',
        start_date: inst.start_date || '',
        end_date: inst.end_date,
        included_minutes: (inst.hours_included || pkg?.total_hours || 0) * 60,
        total_hours: pkg?.total_hours || 0
      };
    });
    setPackages(mapped);
    
    // Auto-select first active package if none selected
    if (!selectedPackageId && mapped.length > 0) {
      setSelectedPackageId(mapped[0].id);
    }
  }, [clientId, selectedPackageId]);

  // Fetch usage for selected package
  const fetchUsage = useCallback(async () => {
    if (!clientId || !selectedPackageId) {
      setUsage(null);
      return;
    }

    const { data, error } = await supabase.rpc('rpc_get_package_usage', {
      p_client_id: clientId,
      p_client_package_id: selectedPackageId
    });

    if (!error && data) {
      const result = data as unknown as PackageUsage | { error: string };
      if ('error' in result) {
        setUsage(null);
      } else {
        setUsage(result);
      }
    } else {
      setUsage(null);
    }
  }, [clientId, selectedPackageId]);

  // Fetch alerts for client
  const fetchAlerts = useCallback(async () => {
    if (!clientId) return;

    const { data, error } = await supabase
      .from('client_alerts')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_dismissed', false)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data) {
      setAlerts(data as ClientAlert[]);
    }
  }, [clientId]);

  // Check thresholds and create alerts if needed
  const checkThresholds = useCallback(async () => {
    if (!clientId || !selectedPackageId) return;

    const { data, error } = await supabase.rpc('rpc_check_package_thresholds', {
      p_client_id: clientId,
      p_client_package_id: selectedPackageId
    });

    if (!error && data) {
      const result = data as unknown as { usage: PackageUsage; alerts_created: Array<{ id: string; title: string; severity: string }> };
      
      // Update usage from the response
      if (result.usage) {
        setUsage(result.usage);
      }
      
      // Show toast for new alerts
      if (result.alerts_created && result.alerts_created.length > 0) {
        result.alerts_created.forEach(alert => {
          toast({
            title: alert.title,
            variant: alert.severity === 'critical' ? 'destructive' : 'default'
          });
        });
        // Refresh alerts list
        await fetchAlerts();
      }
    }
  }, [clientId, selectedPackageId, toast, fetchAlerts]);

  // Dismiss an alert
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
    if (result.success) {
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      return true;
    }
    return false;
  };

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchPackages();
      setLoading(false);
    };
    loadData();
  }, [fetchPackages]);

  // Fetch usage when package changes
  useEffect(() => {
    if (selectedPackageId) {
      fetchUsage();
      checkThresholds();
    }
  }, [selectedPackageId, fetchUsage, checkThresholds]);

  // Fetch alerts on mount
  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  const selectedPackage = packages.find(p => p.id === selectedPackageId);

  return {
    packages,
    selectedPackageId,
    setSelectedPackageId,
    selectedPackage,
    usage,
    alerts,
    loading,
    checkThresholds,
    dismissAlert,
    refresh: async () => {
      await fetchPackages();
      await fetchUsage();
      await fetchAlerts();
    }
  };
}

export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours < 1) return `${Math.round(minutes)}m`;
  return `${hours.toFixed(1)}h`;
}

export function formatForecast(days: number | null): string {
  if (days === null) return 'No recent activity';
  if (days <= 0) return 'Exhausted';
  if (days === 1) return '~1 day remaining';
  if (days < 7) return `~${days} days remaining`;
  if (days < 30) return `~${Math.round(days / 7)} weeks remaining`;
  return `~${Math.round(days / 30)} months remaining`;
}

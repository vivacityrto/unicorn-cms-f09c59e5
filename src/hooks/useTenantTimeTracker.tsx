import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useClientPackagesQuery, usePackageUsageDataQuery } from '@/hooks/usePackageUsageQuery';
import { useTimeSummaryQuery, useActiveTimerQuery, timeTrackingKeys } from '@/hooks/useTimeTrackingQuery';
import { formatElapsedTime } from '@/hooks/useTimeTrackingQuery';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { packageUsageKeys } from '@/hooks/usePackageUsageQuery';
import { useSearchParams } from 'react-router-dom';

const STORAGE_KEY_PREFIX = 'tenant:';
const STORAGE_KEY_SUFFIX = ':active_package';

function getStoredPackageId(tenantId: number): number | null {
  try {
    const val = localStorage.getItem(`${STORAGE_KEY_PREFIX}${tenantId}${STORAGE_KEY_SUFFIX}`);
    return val ? Number(val) : null;
  } catch {
    return null;
  }
}

function setStoredPackageId(tenantId: number, packageId: number | null) {
  try {
    const key = `${STORAGE_KEY_PREFIX}${tenantId}${STORAGE_KEY_SUFFIX}`;
    if (packageId) {
      localStorage.setItem(key, String(packageId));
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore
  }
}

export function useTenantTimeTracker(tenantId: number) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Packages
  const { data: packages = [], isLoading: packagesLoading } = useClientPackagesQuery(tenantId);

  // "all" = show all packages aggregated; number = specific package
  const [selectedPackageId, setSelectedPackageIdRaw] = useState<number | 'all' | null>(() => {
    const urlPkg = searchParams.get('package');
    if (urlPkg === 'all') return 'all';
    if (urlPkg) return Number(urlPkg);
    return getStoredPackageId(tenantId);
  });

  const setSelectedPackageId = useCallback((id: number | 'all' | null) => {
    setSelectedPackageIdRaw(id);
    // Sync to URL
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id === 'all') {
        next.set('package', 'all');
      } else if (id) {
        next.set('package', String(id));
      } else {
        next.delete('package');
      }
      return next;
    }, { replace: true });
    // Persist to localStorage (only numeric IDs)
    setStoredPackageId(tenantId, typeof id === 'number' ? id : null);
  }, [tenantId, setSearchParams]);

  // Auto-select: URL → stored → first package
  useEffect(() => {
    if (packages.length === 0) return;
    // If already set to 'all', keep it
    if (selectedPackageId === 'all') return;
    const stored = typeof selectedPackageId === 'number' ? selectedPackageId : getStoredPackageId(tenantId);
    const valid = packages.find(p => p.id === stored);
    if (valid) {
      setSelectedPackageIdRaw(stored);
    } else {
      // Default to first (already sorted by start_date desc)
      setSelectedPackageId(packages[0].id);
    }
  }, [packages, tenantId, setSelectedPackageId, selectedPackageId]);

  const isAllPackages = selectedPackageId === 'all';
  const effectivePackageId = isAllPackages ? null : selectedPackageId;
  const selectedPackage = effectivePackageId ? packages.find(p => p.id === effectivePackageId) || null : null;
  const hasMultiplePackages = packages.length > 1;
  const needsPackageSelection = hasMultiplePackages && !selectedPackageId;

  // Usage for selected package (null when "all")
  const { data: usage = null, isLoading: usageLoading } = usePackageUsageDataQuery(tenantId, effectivePackageId);

  // Time summary — filtered by package or tenant-wide
  const { data: summary, isLoading: summaryLoading } = useTimeSummaryQuery(tenantId, effectivePackageId);

  // Active timer
  const { data: activeTimer = null, isLoading: timerLoading } = useActiveTimerQuery();

  const isTimerForThisTenant = activeTimer?.client_id === tenantId;
  const hasActiveTimer = !!activeTimer;

  // Elapsed time
  const [elapsed, setElapsed] = useState('0:00');
  useEffect(() => {
    if (!isTimerForThisTenant || !activeTimer) return;
    const update = () => setElapsed(formatElapsedTime(activeTimer.start_at));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [isTimerForThisTenant, activeTimer]);

  // Timer actions
  const startTimer = async (workType: string = 'general', overridePackageInstanceId?: number) => {
    // If an override is provided, use it directly; otherwise check current selection
    const targetPkg = overridePackageInstanceId
      ? packages.find(p => p.id === overridePackageInstanceId) || null
      : selectedPackage;

    // Pass the package_instance ID (not the base package ID) so rpc_stop_timer
    // can correctly insert into time_entries with a valid package_instances reference.
    const instanceId = targetPkg?.id || null;

    const { data, error } = await supabase.rpc('rpc_start_timer', {
      p_tenant_id: tenantId,
      p_client_id: tenantId,
      p_package_id: instanceId,
      p_stage_id: null,
      p_task_id: null,
      p_work_type: workType,
      p_notes: null
    });

    if (error) {
      toast({ title: 'Failed to start timer', description: error.message, variant: 'destructive' });
      return { success: false, error: error.message };
    }

    const result = data as unknown as { success: boolean; error?: string };
    if (result.success) {
      if (user?.id) queryClient.invalidateQueries({ queryKey: timeTrackingKeys.activeTimer(user.id) });
      toast({ title: 'Timer started', description: 'Time tracking has begun' });
    } else if (result.error === 'timer_already_running') {
      toast({ title: 'Timer already running', description: 'Stop your current timer first', variant: 'destructive' });
    }
    return result;
  };

  const stopTimer = async () => {
    const { data, error } = await supabase.rpc('rpc_stop_timer');
    if (error) {
      toast({ title: 'Failed to stop timer', description: error.message, variant: 'destructive' });
      return { success: false, error: error.message };
    }

    const result = data as unknown as { success: boolean; error?: string; time_entry?: { duration_minutes: number } };
    if (result.success) {
      if (user?.id) queryClient.invalidateQueries({ queryKey: timeTrackingKeys.activeTimer(user.id) });
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.entries(tenantId) });
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.summary(tenantId) });
      if (effectivePackageId) {
        queryClient.invalidateQueries({ queryKey: packageUsageKeys.usage(tenantId, effectivePackageId) });
      }

      const mins = result.time_entry?.duration_minutes || 0;
      toast({ title: 'Timer stopped', description: `Logged ${Math.floor(mins / 60)}h ${mins % 60}m` });
    }
    return result;
  };

  const loading = packagesLoading || summaryLoading || timerLoading;

  return {
    // Packages
    packages,
    selectedPackageId: selectedPackageId,
    setSelectedPackageId,
    selectedPackage,
    hasMultiplePackages,
    needsPackageSelection,
    isAllPackages,

    // Usage
    usage,
    usageLoading,

    // Summary
    summary: summary || { thisWeek: 0, thisMonth: 0, last90Days: 0, billableMinutes: 0, nonBillableMinutes: 0 },

    // Timer
    activeTimer,
    isTimerForThisTenant,
    hasActiveTimer,
    elapsed,
    startTimer,
    stopTimer,

    // State
    loading,
  };
}

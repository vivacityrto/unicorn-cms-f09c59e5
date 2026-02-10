import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useClientPackagesQuery, usePackageUsageDataQuery } from '@/hooks/usePackageUsageQuery';
import { useTimeSummaryQuery, useActiveTimerQuery, timeTrackingKeys } from '@/hooks/useTimeTrackingQuery';
import { formatElapsedTime } from '@/hooks/useTimeTrackingQuery';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { packageUsageKeys } from '@/hooks/usePackageUsageQuery';

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

  // Packages
  const { data: packages = [], isLoading: packagesLoading } = useClientPackagesQuery(tenantId);

  // Package selection with localStorage persistence
  const [selectedPackageId, setSelectedPackageIdRaw] = useState<number | null>(() =>
    getStoredPackageId(tenantId)
  );

  const setSelectedPackageId = useCallback((id: number | null) => {
    setSelectedPackageIdRaw(id);
    setStoredPackageId(tenantId, id);
  }, [tenantId]);

  // Auto-select: stored → most recent → first
  useEffect(() => {
    if (packages.length === 0) return;
    const stored = getStoredPackageId(tenantId);
    const valid = packages.find(p => p.id === stored);
    if (valid) {
      setSelectedPackageIdRaw(stored);
    } else {
      // Default to first (already sorted by start_date desc)
      setSelectedPackageId(packages[0].id);
    }
  }, [packages, tenantId, setSelectedPackageId]);

  const effectivePackageId = selectedPackageId;
  const selectedPackage = packages.find(p => p.id === effectivePackageId) || null;
  const hasMultiplePackages = packages.length > 1;
  const needsPackageSelection = hasMultiplePackages && !effectivePackageId;

  // Usage for selected package
  const { data: usage = null, isLoading: usageLoading } = usePackageUsageDataQuery(tenantId, effectivePackageId);

  // Time summary (tenant-wide)
  const { data: summary, isLoading: summaryLoading } = useTimeSummaryQuery(tenantId);

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
  const startTimer = async (workType: string = 'general') => {
    if (needsPackageSelection) {
      toast({ title: 'Select a package', description: 'Choose a package before tracking time.', variant: 'destructive' });
      return { success: false, error: 'no_package' };
    }

    const packageId = selectedPackage?.package_id || null;

    const { data, error } = await supabase.rpc('rpc_start_timer', {
      p_tenant_id: tenantId,
      p_client_id: tenantId,
      p_package_id: packageId,
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
    selectedPackageId: effectivePackageId,
    setSelectedPackageId,
    selectedPackage,
    hasMultiplePackages,
    needsPackageSelection,

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

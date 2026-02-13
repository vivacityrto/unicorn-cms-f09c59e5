/**
 * useExecutiveHealth – Unicorn 2.0
 *
 * Fetches v_executive_client_health (with 7-day deltas) and
 * v_executive_watchlist_7d for the Executive Dashboard.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState, useCallback, useMemo } from 'react';
import type { RiskBand } from '@/hooks/usePredictiveRisk';

export interface ExecutiveHealthRow {
  tenant_id: number;
  package_instance_id: number;
  package_id: number;
  client_name: string;
  package_name: string;
  package_type: string | null;
  owner_user_uuid: string | null;
  overall_score: number;
  phase_completion: number;
  documentation_coverage: number;
  risk_health: number;
  consult_health: number;
  days_stale: number;
  caps_applied: any;
  compliance_calculated_at: string | null;
  operational_risk_score: number;
  risk_band: RiskBand;
  predictive_flags: {
    activity_decay: boolean;
    severe_activity_decay: boolean;
    risk_escalation: boolean;
    backlog_growth: boolean;
    sustained_backlog_growth: boolean;
    burn_rate_risk: boolean;
    phase_drift: boolean;
  };
  predictive_calculated_at: string | null;
  total_actions_remaining: number;
  current_phase: string | null;
  documents_pending_upload: number;
  has_active_critical: boolean;
  active_risks: number;
  hours_remaining: number;
  hours_included: number;
  updated_at: string | null;
  // 7-day deltas
  delta_overall_score_7d: number;
  delta_phase_completion_7d: number;
  delta_docs_coverage_7d: number;
  delta_risk_health_7d: number;
  delta_consult_health_7d: number;
  delta_days_stale_7d: number;
  delta_operational_risk_7d: number;
  risk_band_change_7d: string;
  compliance_baseline_at: string | null;
  predictive_baseline_at: string | null;
}

export interface WatchlistItem {
  tenant_id: number;
  package_instance_id: number;
  change_type: string;
  change_value: number;
  baseline_value: number | null;
  current_value: number | null;
}

export interface ExecutiveFilters {
  search: string;
  riskBands: RiskBand[];
  packageType: string;
  staleOnly: boolean;
  criticalOnly: boolean;
  ownerUuid: string;
}

const defaultFilters: ExecutiveFilters = {
  search: '',
  riskBands: [],
  packageType: '',
  staleOnly: false,
  criticalOnly: false,
  ownerUuid: '',
};

export function useExecutiveHealth() {
  const [filters, setFilters] = useState<ExecutiveFilters>(defaultFilters);

  const { data: rawData, isLoading, error } = useQuery({
    queryKey: ['executive-health'],
    queryFn: async (): Promise<ExecutiveHealthRow[]> => {
      const { data, error } = await supabase
        .from('v_executive_client_health' as any)
        .select('*')
        .order('operational_risk_score', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ExecutiveHealthRow[];
    },
    staleTime: 30_000,
  });

  const { data: watchlist } = useQuery({
    queryKey: ['executive-watchlist'],
    queryFn: async (): Promise<WatchlistItem[]> => {
      const { data, error } = await supabase
        .from('v_executive_watchlist_7d' as any)
        .select('*');
      if (error) throw error;
      return (data ?? []) as unknown as WatchlistItem[];
    },
    staleTime: 30_000,
  });

  const filteredData = useMemo(() => {
    if (!rawData) return [];
    return rawData.filter(row => {
      if (filters.search && !row.client_name.toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.riskBands.length > 0 && !filters.riskBands.includes(row.risk_band)) return false;
      if (filters.packageType && row.package_type !== filters.packageType) return false;
      if (filters.staleOnly && row.days_stale <= 14) return false;
      if (filters.criticalOnly && !row.has_active_critical) return false;
      if (filters.ownerUuid && row.owner_user_uuid !== filters.ownerUuid) return false;
      return true;
    });
  }, [rawData, filters]);

  const updateFilter = useCallback(<K extends keyof ExecutiveFilters>(key: K, value: ExecutiveFilters[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => setFilters(defaultFilters), []);

  // KPI calculations with deltas
  const kpis = useMemo(() => {
    const data = rawData ?? [];
    const avgScore = data.length > 0
      ? Math.round(data.reduce((sum, r) => sum + r.overall_score, 0) / data.length)
      : 0;
    const avgScoreBaseline = data.length > 0
      ? Math.round(data.reduce((sum, r) => sum + (r.overall_score - r.delta_overall_score_7d), 0) / data.length)
      : 0;
    const atRiskCount = data.filter(r => r.risk_band === 'at_risk' || r.risk_band === 'immediate_attention').length;
    const criticalRisks = data.filter(r => r.has_active_critical).length;
    const staleCount = data.filter(r => r.days_stale > 14).length;
    return {
      avgScore,
      avgScoreDelta: avgScore - avgScoreBaseline,
      atRiskCount,
      criticalRisks,
      staleCount,
      totalPackages: data.length,
    };
  }, [rawData]);

  return {
    data: filteredData,
    rawData: rawData ?? [],
    watchlist: watchlist ?? [],
    isLoading,
    error,
    filters,
    updateFilter,
    resetFilters,
    kpis,
  };
}

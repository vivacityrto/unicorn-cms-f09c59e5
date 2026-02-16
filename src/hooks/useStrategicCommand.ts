/**
 * useStrategicCommand – Unicorn 2.0
 *
 * Hooks for the Strategic Intelligence Command Centre.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StrategicSignal {
  id: string;
  signal_type: string;
  signal_severity: string;
  signal_summary: string;
  affected_entities_json: any;
  generated_at: string;
}

export interface PortfolioRiskRow {
  forecast_risk_status: string;
  tenant_count: number;
  avg_index: number;
  elevated_plus_count: number;
}

export interface CapacityPressureRow {
  user_id: string;
  consultant_name: string;
  capacity_utilisation_percentage: number;
  overload_risk_status: string;
  high_risk_stages_count: number;
  overdue_tasks_count: number;
}

export function useStrategicSignals() {
  return useQuery({
    queryKey: ['strategic-signals'],
    queryFn: async (): Promise<StrategicSignal[]> => {
      const { data, error } = await supabase
        .from('strategic_signal_summary')
        .select('*')
        .order('generated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as StrategicSignal[];
    },
    staleTime: 60_000,
  });
}

export function usePortfolioRisk() {
  return useQuery({
    queryKey: ['strategic-portfolio-risk'],
    queryFn: async (): Promise<PortfolioRiskRow[]> => {
      const { data, error } = await supabase
        .from('v_strategic_portfolio_risk' as any)
        .select('*');
      if (error) throw error;
      return (data ?? []) as unknown as PortfolioRiskRow[];
    },
    staleTime: 60_000,
  });
}

export function useCapacityPressure() {
  return useQuery({
    queryKey: ['strategic-capacity-pressure'],
    queryFn: async (): Promise<CapacityPressureRow[]> => {
      const { data, error } = await supabase
        .from('v_strategic_capacity_pressure' as any)
        .select('*')
        .order('capacity_utilisation_percentage', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CapacityPressureRow[];
    },
    staleTime: 60_000,
  });
}

export function useRisingTenants() {
  return useQuery({
    queryKey: ['strategic-rising-tenants'],
    queryFn: async () => {
      // Get latest forecasts with recent history for trend
      const { data, error } = await supabase
        .from('tenant_risk_forecasts')
        .select('tenant_id, composite_risk_index, forecast_risk_status, forecast_date, key_risk_drivers_json')
        .order('composite_risk_index', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 60_000,
  });
}

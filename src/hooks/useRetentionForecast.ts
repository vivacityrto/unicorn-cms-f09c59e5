/**
 * useRetentionForecast – Unicorn 2.0 Phase 15
 * Hooks for tenant retention forecasts and executive overview.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RetentionForecast {
  id: string;
  tenant_id: number;
  forecast_date: string;
  engagement_score: number;
  value_utilisation_score: number;
  service_pressure_score: number;
  risk_stress_overlap_score: number;
  composite_retention_risk_index: number;
  retention_status: string;
  key_drivers_json: string[];
  generated_at: string;
}

export function useLatestRetentionForecast(tenantId?: number) {
  return useQuery({
    queryKey: ['retention-forecast', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenant_retention_forecasts')
        .select('*')
        .eq('tenant_id', tenantId!)
        .order('forecast_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as RetentionForecast | null;
    },
  });
}

export function useRetentionTrend(tenantId?: number) {
  return useQuery({
    queryKey: ['retention-trend', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('retention_forecast_history')
        .select('snapshot_date, composite_retention_risk_index')
        .eq('tenant_id', tenantId!)
        .order('snapshot_date', { ascending: true })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface RetentionOverview {
  stable: number;
  watch: number;
  vulnerable: number;
  high_risk: number;
  total: number;
  within_renewal_90: number;
  high_risk_in_renewal: number;
  revenue_at_risk: number;
}

export function useRetentionOverview() {
  return useQuery({
    queryKey: ['retention-overview'],
    queryFn: async () => {
      // Get latest forecast per tenant
      const { data: forecasts, error } = await supabase
        .from('tenant_retention_forecasts')
        .select('tenant_id, retention_status, composite_retention_risk_index, forecast_date')
        .order('forecast_date', { ascending: false });
      if (error) throw error;

      // Deduplicate: keep latest per tenant
      const latest = new Map<number, any>();
      (forecasts ?? []).forEach((f: any) => {
        if (!latest.has(f.tenant_id)) latest.set(f.tenant_id, f);
      });

      const all = Array.from(latest.values());

      // Get commercial profiles for renewal/revenue data
      const { data: profiles } = await supabase
        .from('tenant_commercial_profiles')
        .select('tenant_id, contract_end_date, average_monthly_revenue');

      const profileMap = new Map<number, any>();
      (profiles ?? []).forEach((p: any) => profileMap.set(p.tenant_id, p));

      const now = new Date();
      const in90 = new Date(Date.now() + 90 * 86400000);

      let stable = 0, watch = 0, vulnerable = 0, high_risk = 0;
      let within_renewal_90 = 0, high_risk_in_renewal = 0;
      let revenue_at_risk = 0;

      all.forEach((f: any) => {
        if (f.retention_status === 'stable') stable++;
        else if (f.retention_status === 'watch') watch++;
        else if (f.retention_status === 'vulnerable') vulnerable++;
        else if (f.retention_status === 'high_risk') high_risk++;

        const prof = profileMap.get(f.tenant_id);
        if (prof?.contract_end_date) {
          const end = new Date(prof.contract_end_date);
          if (end <= in90 && end >= now) {
            within_renewal_90++;
            if (f.retention_status === 'high_risk') high_risk_in_renewal++;
          }
        }
        if (f.retention_status === 'high_risk' && prof?.average_monthly_revenue) {
          revenue_at_risk += Number(prof.average_monthly_revenue) * 6;
        }
      });

      return {
        stable, watch, vulnerable, high_risk,
        total: all.length,
        within_renewal_90,
        high_risk_in_renewal,
        revenue_at_risk,
      } as RetentionOverview;
    },
  });
}

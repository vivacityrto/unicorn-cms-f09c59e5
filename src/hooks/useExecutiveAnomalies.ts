/**
 * useExecutiveAnomalies – Unicorn 2.0
 *
 * Fetches v_executive_anomalies_30d for the Executive Dashboard signals panel.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AnomalyRow {
  tenant_id: number;
  package_instance_id: number;
  anomaly_type: string;
  severity: 'info' | 'warning' | 'critical';
  window_days: number;
  baseline_value: number;
  current_value: number;
  delta_value: number;
  detected_at: string;
  source: 'compliance' | 'predictive';
  anomaly_rank: number;
}

const ANOMALY_LABELS: Record<string, string> = {
  sudden_compliance_drop: 'Compliance score dropped sharply',
  sudden_compliance_rise: 'Compliance score rose sharply',
  risk_health_shock: 'Risk health dropped sharply',
  docs_coverage_shock: 'Documentation coverage dropped',
  consult_health_shock: 'Consult health dropped sharply',
  snapshot_gap: 'Insufficient snapshot data',
  predictive_risk_spike: 'Operational risk spiked',
  predictive_band_jump: 'Risk band jumped 2+ levels',
};

const ANOMALY_CTA: Record<string, { label: string; path: string }> = {
  sudden_compliance_drop: { label: 'View compliance breakdown', path: '' },
  sudden_compliance_rise: { label: 'View compliance breakdown', path: '' },
  risk_health_shock: { label: 'Review risks', path: '' },
  docs_coverage_shock: { label: 'Check documents', path: '' },
  consult_health_shock: { label: 'Review consult usage', path: '' },
  snapshot_gap: { label: 'View compliance breakdown', path: '' },
  predictive_risk_spike: { label: 'Review risks', path: '' },
  predictive_band_jump: { label: 'Review risks', path: '' },
};

export function getAnomalyLabel(type: string): string {
  return ANOMALY_LABELS[type] ?? 'Unusual change detected';
}

export function getAnomalyCta(type: string): { label: string; path: string } {
  return ANOMALY_CTA[type] ?? { label: 'View details', path: '' };
}

export function useExecutiveAnomalies() {
  return useQuery({
    queryKey: ['executive-anomalies'],
    queryFn: async (): Promise<AnomalyRow[]> => {
      const { data, error } = await supabase
        .from('v_executive_anomalies_30d' as any)
        .select('*')
        .order('anomaly_rank', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AnomalyRow[];
    },
    staleTime: 30_000,
  });
}

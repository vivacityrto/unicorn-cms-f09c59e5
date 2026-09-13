import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  applyForecastAvailability,
  type AttentionTenant,
  type TriageForecastSources,
} from '@/hooks/useDashboardTriage';
import { AttentionRankingSection } from '@/components/dashboard/AttentionRankingSection';

const tenant = (id: number): AttentionTenant => ({
  tenant_id: id,
  tenant_name: `Tenant ${id}`,
  tenant_status: 'active',
  abn: null,
  rto_id: null,
  cricos_id: null,
  assigned_csc_user_id: null,
  packages_json: [],
  risk_status: 'stable',
  risk_index: 0,
  risk_index_delta_14d: 0,
  worst_stage_health_status: 'unavailable',
  critical_stage_count: 0,
  at_risk_stage_count: 0,
  open_tasks_count: 0,
  overdue_tasks_count: 0,
  mandatory_gaps_count: 0,
  consult_hours_30d: 0,
  burn_risk_status: 'normal',
  projected_exhaustion_date: null,
  retention_status: 'stable',
  composite_retention_risk_index: null,
  last_activity_at: null,
  renewal_window_start: null,
  high_severity_open_risks: 0,
  days_since_activity: 0,
  days_to_renewal: null,
  stage_score: 0,
  gaps_score: 0,
  risk_score: 0,
  staleness_score: 0,
  renewal_score: 0,
  burn_score: 0,
  task_score: 0,
  compliance_overdue_tasks: 0,
  compliance_blocked_tasks: 0,
  compliance_open_tasks: 0,
  attention_score: 0,
  attention_drivers_json: [],
});

const unavailableSources: TriageForecastSources = {
  burn: { rows: [], status: 'unavailable' },
  retention: { rows: [], status: 'unavailable' },
};

describe('Client Health H1 dashboard forecast consumers', () => {
  it('does not preserve view defaults when forecast sources are empty', () => {
    const result = applyForecastAvailability([tenant(1)], unavailableSources);

    expect(result[0]).toMatchObject({
      burn_risk_status: 'unavailable',
      retention_status: 'unavailable',
    });
  });

  it('preserves the latest readable status and marks missing tenants unavailable', () => {
    const result = applyForecastAvailability([tenant(1), tenant(2)], {
      burn: {
        status: 'reported',
        rows: [
          { tenant_id: 1, burn_risk_status: 'normal' },
          { tenant_id: 1, burn_risk_status: 'accelerated' },
          { tenant_id: 1, burn_risk_status: 'critical' },
        ],
      },
      retention: {
        status: 'reported',
        rows: [{ tenant_id: 1, retention_status: 'high_risk', forecast_date: '2026-09-12' }],
      },
    });

    expect(result[0]).toMatchObject({ burn_risk_status: 'critical', retention_status: 'high_risk' });
    expect(result[1]).toMatchObject({ burn_risk_status: 'unavailable', retention_status: 'unavailable' });
  });

  it('fails closed when a source query errors', () => {
    const result = applyForecastAvailability([tenant(1)], {
      burn: { rows: [{ tenant_id: 1, burn_risk_status: 'critical' }], status: 'unavailable' },
      retention: { rows: [{ tenant_id: 1, retention_status: 'high_risk', forecast_date: '2026-09-12' }], status: 'unavailable' },
    });

    expect(result[0]).toMatchObject({ burn_risk_status: 'unavailable', retention_status: 'unavailable' });
  });

  it('renders an explicit unavailable retention badge in the ranking table', () => {
    render(
      <AttentionRankingSection
        tenants={applyForecastAvailability([tenant(1)], unavailableSources)}
        cscNameMap={{}}
        onRowClick={() => undefined}
        onViewFullPortfolio={() => undefined}
      />,
    );

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });
});

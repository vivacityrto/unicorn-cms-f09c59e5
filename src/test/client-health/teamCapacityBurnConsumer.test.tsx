import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  summarizeBurnRisk,
  TeamCapacityWidget,
  type BurnRiskForecastRow,
} from '@/components/executive/TeamCapacityWidget';

const mocks = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const consultants = [{
  id: 'snapshot-1',
  user_id: 'user-1',
  capacity_utilisation_percentage: 75,
  high_risk_stages_count: 0,
  overdue_tasks_count: 0,
  overload_risk_status: 'stable',
  consultant_name: 'Consultant One',
}];

describe('Client Health H1 team-capacity burn consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks an empty burn source unavailable without inventing a zero count', () => {
    expect(summarizeBurnRisk([])).toEqual({
      burnSourceStatus: 'unavailable',
      criticalBurnCount: null,
    });
  });

  it('marks a failed burn source unavailable', () => {
    expect(summarizeBurnRisk([], new Error('forecast source unavailable'))).toEqual({
      burnSourceStatus: 'unavailable',
      criticalBurnCount: null,
    });
  });

  it('deduplicates reported critical tenants while preserving the reported state', () => {
    const forecasts: BurnRiskForecastRow[] = [
      { tenant_id: 1, burn_risk_status: 'critical' },
      { tenant_id: 1, burn_risk_status: 'critical' },
      { tenant_id: 2, burn_risk_status: 'critical' },
    ];

    expect(summarizeBurnRisk(forecasts)).toEqual({
      burnSourceStatus: 'reported',
      criticalBurnCount: 2,
    });
  });

  it('renders an explicit unavailable state when no accepted burn forecast exists', () => {
    mocks.useQuery.mockReturnValue({
      data: { consultants, burnSourceStatus: 'unavailable', criticalBurnCount: null },
      isLoading: false,
    });

    render(<TeamCapacityWidget />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Burn assessment unavailable. No accepted forecast is available.',
    );
  });

  it('keeps the critical-burn alert available for reported forecasts', () => {
    mocks.useQuery.mockReturnValue({
      data: { consultants, burnSourceStatus: 'reported', criticalBurnCount: 3 },
      isLoading: false,
    });

    render(<TeamCapacityWidget />);

    expect(screen.getByRole('alert')).toHaveTextContent('3 clients in critical burn.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

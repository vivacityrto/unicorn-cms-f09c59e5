import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CommercialProfileSummary,
  RetentionForecastSummary,
  RetentionOverview,
} from '@/hooks/useRetentionForecast';
import { summarizeRetentionOverview } from '@/hooks/useRetentionForecast';

const mocks = vi.hoisted(() => ({ useRetentionOverview: vi.fn() }));

vi.mock('@/hooks/useRetentionForecast', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useRetentionForecast')>('@/hooks/useRetentionForecast');
  return { ...actual, useRetentionOverview: mocks.useRetentionOverview };
});

import { CommercialRiskWidget } from '@/components/executive/CommercialRiskWidget';

const emptyOverview: RetentionOverview = {
  sourceStatus: 'unavailable',
  stable: 0,
  watch: 0,
  vulnerable: 0,
  high_risk: 0,
  total: 0,
  within_renewal_90: 0,
  high_risk_in_renewal: 0,
  revenue_at_risk: 0,
};

describe('Client Health H1 retention consumer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks an empty forecast source unavailable instead of showing stable zeroes', () => {
    expect(summarizeRetentionOverview([], [])).toMatchObject(emptyOverview);
  });

  it('preserves latest-per-tenant aggregation for reported forecasts', () => {
    const forecasts: RetentionForecastSummary[] = [
      {
        tenant_id: 7,
        retention_status: 'high_risk',
        composite_retention_risk_index: 80,
        forecast_date: '2026-09-12',
      },
      {
        tenant_id: 7,
        retention_status: 'stable',
        composite_retention_risk_index: 10,
        forecast_date: '2026-09-01',
      },
    ];
    const profiles: CommercialProfileSummary[] = [
      { tenant_id: 7, contract_end_date: '2026-10-01', average_monthly_revenue: 1000 },
    ];

    expect(summarizeRetentionOverview(forecasts, profiles, new Date('2026-09-13T00:00:00Z'))).toMatchObject({
      sourceStatus: 'reported',
      total: 1,
      stable: 0,
      high_risk: 1,
      within_renewal_90: 1,
      high_risk_in_renewal: 1,
      revenue_at_risk: 6000,
    });
  });

  it('renders an explicit unavailable state for an empty source', () => {
    mocks.useRetentionOverview.mockReturnValue({ data: emptyOverview, isLoading: false, isError: false });

    render(<CommercialRiskWidget />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Retention assessment unavailable. No accepted forecast is available.',
    );
    expect(screen.queryByText('Stable')).not.toBeInTheDocument();
  });

  it('renders the same unavailable state when the source query fails', () => {
    mocks.useRetentionOverview.mockReturnValue({ data: undefined, isLoading: false, isError: true });

    render(<CommercialRiskWidget />);

    expect(screen.getByRole('status')).toHaveTextContent('Retention assessment unavailable');
  });

  it('preserves the reported distribution and revenue metrics when forecasts exist', () => {
    mocks.useRetentionOverview.mockReturnValue({
      data: {
        sourceStatus: 'reported',
        stable: 2,
        watch: 1,
        vulnerable: 1,
        high_risk: 1,
        total: 5,
        within_renewal_90: 2,
        high_risk_in_renewal: 1,
        revenue_at_risk: 6000,
      },
      isLoading: false,
      isError: false,
    });

    render(<CommercialRiskWidget />);

    expect(screen.getByText('Stable')).toBeInTheDocument();
    expect(screen.getByText('Revenue Exposure (6mo)')).toBeInTheDocument();
    expect(screen.getByText('$6,000')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

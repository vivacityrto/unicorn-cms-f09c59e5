import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_FIXTURE_CLOCK,
  DASHBOARD_FIXTURE_VERSION,
  DASHBOARD_QUERY_FIXTURES,
  characterizeDashboardFixture,
} from './fixtures/dashboardQueryFixtures';

describe('Client Health H0.1-c synthetic dashboard fixtures', () => {
  it('is versioned and uses one visible deterministic fixture clock', () => {
    expect(DASHBOARD_FIXTURE_VERSION).toBe(1);
    expect(new Set(DASHBOARD_QUERY_FIXTURES.map((fixture) => fixture.version))).toEqual(new Set([1]));
    expect(new Set(DASHBOARD_QUERY_FIXTURES.map((fixture) => fixture.now))).toEqual(
      new Set([DASHBOARD_FIXTURE_CLOCK]),
    );
    expect(DASHBOARD_QUERY_FIXTURES).toHaveLength(5);
  });

  it.each(DASHBOARD_QUERY_FIXTURES)('$scenario preserves its current-output snapshot', (fixture) => {
    const result = characterizeDashboardFixture(fixture);

    expect(result?.row).toMatchObject({
      tenantId: fixture.tenantId,
      attentionScore: fixture.expected.attentionScore,
      daysSinceActivity: fixture.expected.daysSinceActivity,
      daysToRenewal: fixture.expected.daysToRenewal,
      burnRiskStatus: fixture.expected.burnRiskStatus,
      retentionStatus: fixture.expected.retentionStatus,
      stageHealthStatus: 'unavailable',
    });
    expect(result?.sourceFreshness).toEqual(fixture.expected.sourceFreshness);
    expect(result?.missingSourceFlags).toEqual(fixture.expected.missingSourceFlags);
    expect(result?.futureTimestampFlags).toEqual(fixture.expected.futureTimestampFlags);

    const branchCounts = Object.fromEntries(
      Object.entries(result?.queryBranches ?? {}).map(([name, rows]) => [name, rows.length]),
    );
    expect(branchCounts).toEqual(fixture.expected.branchCounts);
  });

  it('keeps the overdue-task floor at exactly 70 for the distressed fixture', () => {
    const distressed = DASHBOARD_QUERY_FIXTURES.find((fixture) => fixture.scenario === 'distressed');

    expect(characterizeDashboardFixture(distressed!)?.row.attentionScore).toBe(70);
  });

  it('makes missing source defaults visible instead of treating them as assessed health', () => {
    const missing = DASHBOARD_QUERY_FIXTURES.find((fixture) => fixture.scenario === 'missing-sources');
    const result = characterizeDashboardFixture(missing!);

    expect(result?.row.burnRiskStatus).toBe('normal');
    expect(result?.row.retentionStatus).toBe('stable');
    expect(result?.missingSourceFlags).toEqual(['risk', 'burn', 'retention', 'compliance', 'stage']);
    expect(result?.queryBranches.priorityInboxRows).toEqual([]);
    expect(result?.queryBranches.riskClusterRows).toEqual([]);
  });

  it('retains future-date output while flagging the unsafe timestamps', () => {
    const future = DASHBOARD_QUERY_FIXTURES.find((fixture) => fixture.scenario === 'future-timestamps');
    const result = characterizeDashboardFixture(future!);

    expect(result?.row.daysSinceActivity).toBe(-3);
    expect(result?.futureTimestampFlags).toEqual([
      'lastActivityAt',
      'riskObservedAt',
      'burnObservedAt',
      'retentionObservedAt',
      'complianceObservedAt',
    ]);
  });

  it('filters every tenant-scoped branch to the selected tenant', () => {
    const distressed = DASHBOARD_QUERY_FIXTURES.find((fixture) => fixture.scenario === 'distressed')!;
    const foreignRows = {
      tenantId: distressed.foreignTenantId,
      id: 'foreign-row',
    };
    const fixtureWithForeignRows = {
      ...distressed,
      sources: {
        ...distressed.sources,
        priorityInboxRows: [...distressed.sources.priorityInboxRows, foreignRows],
        riskClusterRows: [...distressed.sources.riskClusterRows, foreignRows],
        labourEfficiencyRows: [...distressed.sources.labourEfficiencyRows, foreignRows],
        recentCommsRows: [...distressed.sources.recentCommsRows, foreignRows],
      },
    };

    const result = characterizeDashboardFixture(fixtureWithForeignRows);

    expect(result?.queryBranches.priorityInboxRows).toHaveLength(1);
    expect(result?.queryBranches.riskClusterRows).toHaveLength(1);
    expect(result?.queryBranches.labourEfficiencyRows).toHaveLength(1);
    expect(result?.queryBranches.recentCommsRows).toHaveLength(1);
    expect(result?.queryBranches.priorityInboxRows).not.toContainEqual(foreignRows);
  });
});

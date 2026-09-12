export const DASHBOARD_FIXTURE_VERSION = 1 as const;
export const DASHBOARD_FIXTURE_CLOCK = '2026-09-12T00:00:00.000Z';

type SourceStatus = 'available' | 'missing' | 'unavailable';

type TenantRow = {
  tenantId: string;
  observedAt: string;
  lastActivityAt: string;
  renewalDate: string | null;
  mandatoryGaps: number;
  openTasks: number;
  consultHours30d: number;
};

type RiskSource = {
  status: SourceStatus;
  observedAt: string | null;
  riskIndex: number | null;
  riskIndexDelta14d: number | null;
  highSeverityOpenRisks: number | null;
};

type BurnSource = {
  status: SourceStatus;
  observedAt: string | null;
  burnRiskStatus: 'normal' | 'accelerated' | 'critical' | null;
  projectedExhaustionDate: string | null;
};

type RetentionSource = {
  status: SourceStatus;
  observedAt: string | null;
  retentionStatus: 'stable' | 'watch' | 'critical' | null;
};

type ComplianceSource = {
  status: SourceStatus;
  observedAt: string | null;
  overdueTasks: number | null;
  blockedTasks: number | null;
  openTasks: number | null;
};

type StageSource = {
  status: SourceStatus;
  observedAt: string | null;
};

type TenantScopedRow = { tenantId: string; id: string };

export type DashboardFixture = {
  version: typeof DASHBOARD_FIXTURE_VERSION;
  scenario: string;
  now: string;
  tenantId: string;
  foreignTenantId: string;
  portfolioRows: TenantRow[];
  sources: {
    risk: RiskSource;
    burn: BurnSource;
    retention: RetentionSource;
    compliance: ComplianceSource;
    stage: StageSource;
    priorityInboxRows: TenantScopedRow[];
    riskClusterRows: TenantScopedRow[];
    labourEfficiencyRows: TenantScopedRow[];
    recentCommsRows: TenantScopedRow[];
  };
  expected: {
    attentionScore: number;
    daysSinceActivity: number;
    daysToRenewal: number | null;
    burnRiskStatus: 'normal' | 'accelerated' | 'critical';
    retentionStatus: 'stable' | 'watch' | 'critical';
    sourceFreshness: Record<string, string | null>;
    missingSourceFlags: string[];
    futureTimestampFlags: string[];
    branchCounts: Record<string, number>;
  };
};

const DAY_MS = 86_400_000;

function daysBetween(now: string, timestamp: string): number {
  return Math.trunc((Date.parse(now) - Date.parse(timestamp)) / DAY_MS);
}

function calendarDaysBetween(now: string, date: string): number {
  const nowDate = new Date(now);
  const targetDate = new Date(`${date}T00:00:00.000Z`);
  const currentDate = new Date(
    Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate()),
  );
  return Math.trunc((targetDate.getTime() - currentDate.getTime()) / DAY_MS);
}

function cap(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function calculateCurrentAttentionScore(
  stageScore: number,
  gapsScore: number,
  riskScore: number,
  stalenessScore: number,
  taskScore: number,
  renewalScore: number,
  burnScore: number,
  overdueTasks: number,
): number {
  const score = Math.round(
    0.25 * stageScore
      + 0.2 * gapsScore
      + 0.15 * riskScore
      + 0.15 * stalenessScore
      + 0.15 * taskScore
      + 0.05 * renewalScore
      + 0.05 * burnScore,
  );

  return overdueTasks >= 3 && score < 70 ? 70 : score;
}

function filteredRows(rows: TenantScopedRow[], tenantId: string): TenantScopedRow[] {
  return rows.filter((row) => row.tenantId === tenantId);
}

export function characterizeDashboardFixture(
  fixture: DashboardFixture,
  tenantId = fixture.tenantId,
) {
  const tenant = fixture.portfolioRows.find((row) => row.tenantId === tenantId);
  if (!tenant) {
    return null;
  }

  const { risk, burn, retention, compliance, stage } = fixture.sources;
  const daysSinceActivity = daysBetween(fixture.now, tenant.lastActivityAt);
  const daysToRenewal = tenant.renewalDate
    ? calendarDaysBetween(fixture.now, tenant.renewalDate)
    : null;
  const gapsScore = tenant.mandatoryGaps === 0 ? 0 : cap(tenant.mandatoryGaps * 20);
  const riskScore = cap(
    (risk.riskIndex ?? 0)
      + Math.min(25, Math.max(0, (risk.riskIndexDelta14d ?? 0) * 1.5))
      + Math.min(25, (risk.highSeverityOpenRisks ?? 0) * 10),
  );
  const overdueTasks = compliance.overdueTasks ?? 0;
  const blockedTasks = compliance.blockedTasks ?? 0;
  const openComplianceTasks = compliance.openTasks ?? 0;
  const taskScore = Math.min(100, overdueTasks * 25 + blockedTasks * 15 + openComplianceTasks * 3);
  const stalenessScore = Math.min(
    100,
    (daysSinceActivity <= 7 ? 0 : daysSinceActivity <= 14 ? 25 : daysSinceActivity <= 21 ? 50 : daysSinceActivity <= 30 ? 75 : 100)
      + (tenant.openTasks > 0 && daysSinceActivity >= 15 ? 10 : 0),
  );
  const renewalScore = daysToRenewal === null ? 0 : daysToRenewal <= 0 ? 100
    : daysToRenewal <= 14 ? 100 : daysToRenewal <= 30 ? 75
      : daysToRenewal <= 60 ? 50 : daysToRenewal <= 90 ? 25 : 0;
  const exhaustionDays = burn.projectedExhaustionDate
    ? calendarDaysBetween(fixture.now, burn.projectedExhaustionDate)
    : null;
  const burnScore = Math.min(
    100,
    (burn.burnRiskStatus === 'critical' ? 100 : burn.burnRiskStatus === 'accelerated' ? 50 : 0)
      + (exhaustionDays !== null && exhaustionDays <= 30 ? 15 : 0),
  );
  const stageScore = stage.status === 'available' ? 0 : 0;
  const burnRiskStatus = burn.burnRiskStatus ?? 'normal';
  const retentionStatus = retention.retentionStatus ?? 'stable';
  const missingSourceFlags = [
    ['risk', risk.status],
    ['burn', burn.status],
    ['retention', retention.status],
    ['compliance', compliance.status],
    ['stage', stage.status],
  ]
    .filter(([, status]) => status !== 'available')
    .map(([name]) => name);
  const futureTimestampFlags = [
    ['lastActivityAt', Date.parse(tenant.lastActivityAt) > Date.parse(fixture.now)],
    ['riskObservedAt', risk.observedAt ? Date.parse(risk.observedAt) > Date.parse(fixture.now) : false],
    ['burnObservedAt', burn.observedAt ? Date.parse(burn.observedAt) > Date.parse(fixture.now) : false],
    ['retentionObservedAt', retention.observedAt ? Date.parse(retention.observedAt) > Date.parse(fixture.now) : false],
    ['complianceObservedAt', compliance.observedAt ? Date.parse(compliance.observedAt) > Date.parse(fixture.now) : false],
  ]
    .filter(([, isFuture]) => isFuture)
    .map(([name]) => name);

  return {
    row: {
      tenantId,
      attentionScore: calculateCurrentAttentionScore(
        stageScore,
        gapsScore,
        riskScore,
        stalenessScore,
        taskScore,
        renewalScore,
        burnScore,
        overdueTasks,
      ),
      daysSinceActivity,
      daysToRenewal,
      stageHealthStatus: 'unavailable' as const,
      burnRiskStatus,
      retentionStatus,
    },
    sourceFreshness: {
      portfolio: tenant.observedAt,
      risk: risk.observedAt,
      burn: burn.observedAt,
      retention: retention.observedAt,
      compliance: compliance.observedAt,
      stage: stage.observedAt,
    },
    missingSourceFlags,
    futureTimestampFlags,
    queryBranches: {
      priorityInboxRows: filteredRows(fixture.sources.priorityInboxRows, tenantId),
      riskClusterRows: filteredRows(fixture.sources.riskClusterRows, tenantId),
      labourEfficiencyRows: filteredRows(fixture.sources.labourEfficiencyRows, tenantId),
      recentCommsRows: filteredRows(fixture.sources.recentCommsRows, tenantId),
      behaviouralPromptRows: [
        ...(tenant.consultHours30d === 0 ? ['no-consult-30d'] : []),
        ...(daysSinceActivity >= 21 ? ['inactive-21d'] : []),
        ...(tenant.mandatoryGaps > 0 ? ['gap-check-60d'] : []),
      ],
    },
  };
}

const sharedRows = {
  priorityInboxRows: [],
  riskClusterRows: [],
  labourEfficiencyRows: [],
  recentCommsRows: [],
};

export const DASHBOARD_QUERY_FIXTURES: DashboardFixture[] = [
  {
    version: DASHBOARD_FIXTURE_VERSION,
    scenario: 'high-activity-healthy',
    now: DASHBOARD_FIXTURE_CLOCK,
    tenantId: '00000000-0000-4000-8000-000000000001',
    foreignTenantId: '00000000-0000-4000-8000-000000000099',
    portfolioRows: [{
      tenantId: '00000000-0000-4000-8000-000000000001',
      observedAt: '2026-09-11T23:00:00.000Z',
      lastActivityAt: '2026-09-10T00:00:00.000Z',
      renewalDate: '2026-12-20',
      mandatoryGaps: 0,
      openTasks: 2,
      consultHours30d: 4,
    }],
    sources: {
      risk: { status: 'available', observedAt: '2026-09-11T22:00:00.000Z', riskIndex: 10, riskIndexDelta14d: 0, highSeverityOpenRisks: 0 },
      burn: { status: 'available', observedAt: '2026-09-11T21:00:00.000Z', burnRiskStatus: 'normal', projectedExhaustionDate: null },
      retention: { status: 'available', observedAt: '2026-09-11T20:00:00.000Z', retentionStatus: 'stable' },
      compliance: { status: 'available', observedAt: '2026-09-11T19:00:00.000Z', overdueTasks: 0, blockedTasks: 0, openTasks: 2 },
      stage: { status: 'unavailable', observedAt: null },
      ...sharedRows,
    },
    expected: {
      attentionScore: 2,
      daysSinceActivity: 2,
      daysToRenewal: 99,
      burnRiskStatus: 'normal',
      retentionStatus: 'stable',
      sourceFreshness: { portfolio: '2026-09-11T23:00:00.000Z', risk: '2026-09-11T22:00:00.000Z', burn: '2026-09-11T21:00:00.000Z', retention: '2026-09-11T20:00:00.000Z', compliance: '2026-09-11T19:00:00.000Z', stage: null },
      missingSourceFlags: ['stage'],
      futureTimestampFlags: [],
      branchCounts: { priorityInboxRows: 0, riskClusterRows: 0, labourEfficiencyRows: 0, recentCommsRows: 0, behaviouralPromptRows: 0 },
    },
  },
  {
    version: DASHBOARD_FIXTURE_VERSION,
    scenario: 'distressed',
    now: DASHBOARD_FIXTURE_CLOCK,
    tenantId: '00000000-0000-4000-8000-000000000002',
    foreignTenantId: '00000000-0000-4000-8000-000000000098',
    portfolioRows: [{
      tenantId: '00000000-0000-4000-8000-000000000002',
      observedAt: '2026-09-11T23:00:00.000Z',
      lastActivityAt: '2026-09-01T00:00:00.000Z',
      renewalDate: '2026-09-25',
      mandatoryGaps: 4,
      openTasks: 4,
      consultHours30d: 8,
    }],
    sources: {
      risk: { status: 'available', observedAt: '2026-09-11T22:00:00.000Z', riskIndex: 40, riskIndexDelta14d: 0, highSeverityOpenRisks: 2 },
      burn: { status: 'available', observedAt: '2026-09-11T21:00:00.000Z', burnRiskStatus: 'accelerated', projectedExhaustionDate: '2026-09-25' },
      retention: { status: 'available', observedAt: '2026-09-11T20:00:00.000Z', retentionStatus: 'watch' },
      compliance: { status: 'available', observedAt: '2026-09-11T19:00:00.000Z', overdueTasks: 3, blockedTasks: 2, openTasks: 4 },
      stage: { status: 'unavailable', observedAt: null },
      priorityInboxRows: [{ tenantId: '00000000-0000-4000-8000-000000000002', id: 'synthetic-inbox-1' }],
      riskClusterRows: [{ tenantId: '00000000-0000-4000-8000-000000000002', id: 'synthetic-risk-1' }],
      labourEfficiencyRows: [{ tenantId: '00000000-0000-4000-8000-000000000002', id: 'synthetic-labour-1' }],
      recentCommsRows: [{ tenantId: '00000000-0000-4000-8000-000000000002', id: 'synthetic-comms-1' }],
    },
    expected: {
      attentionScore: 70,
      daysSinceActivity: 11,
      daysToRenewal: 13,
      burnRiskStatus: 'accelerated',
      retentionStatus: 'watch',
      sourceFreshness: { portfolio: '2026-09-11T23:00:00.000Z', risk: '2026-09-11T22:00:00.000Z', burn: '2026-09-11T21:00:00.000Z', retention: '2026-09-11T20:00:00.000Z', compliance: '2026-09-11T19:00:00.000Z', stage: null },
      missingSourceFlags: ['stage'],
      futureTimestampFlags: [],
      branchCounts: { priorityInboxRows: 1, riskClusterRows: 1, labourEfficiencyRows: 1, recentCommsRows: 1, behaviouralPromptRows: 1 },
    },
  },
  {
    version: DASHBOARD_FIXTURE_VERSION,
    scenario: 'stalled',
    now: DASHBOARD_FIXTURE_CLOCK,
    tenantId: '00000000-0000-4000-8000-000000000003',
    foreignTenantId: '00000000-0000-4000-8000-000000000097',
    portfolioRows: [{
      tenantId: '00000000-0000-4000-8000-000000000003',
      observedAt: '2026-09-11T23:00:00.000Z',
      lastActivityAt: '2026-08-10T00:00:00.000Z',
      renewalDate: null,
      mandatoryGaps: 0,
      openTasks: 4,
      consultHours30d: 0,
    }],
    sources: {
      risk: { status: 'available', observedAt: '2026-09-11T22:00:00.000Z', riskIndex: 0, riskIndexDelta14d: 0, highSeverityOpenRisks: 0 },
      burn: { status: 'available', observedAt: '2026-09-11T21:00:00.000Z', burnRiskStatus: 'normal', projectedExhaustionDate: null },
      retention: { status: 'available', observedAt: '2026-09-11T20:00:00.000Z', retentionStatus: 'stable' },
      compliance: { status: 'available', observedAt: '2026-09-11T19:00:00.000Z', overdueTasks: 0, blockedTasks: 0, openTasks: 4 },
      stage: { status: 'unavailable', observedAt: null },
      ...sharedRows,
    },
    expected: {
      attentionScore: 17,
      daysSinceActivity: 33,
      daysToRenewal: null,
      burnRiskStatus: 'normal',
      retentionStatus: 'stable',
      sourceFreshness: { portfolio: '2026-09-11T23:00:00.000Z', risk: '2026-09-11T22:00:00.000Z', burn: '2026-09-11T21:00:00.000Z', retention: '2026-09-11T20:00:00.000Z', compliance: '2026-09-11T19:00:00.000Z', stage: null },
      missingSourceFlags: ['stage'],
      futureTimestampFlags: [],
      branchCounts: { priorityInboxRows: 0, riskClusterRows: 0, labourEfficiencyRows: 0, recentCommsRows: 0, behaviouralPromptRows: 2 },
    },
  },
  {
    version: DASHBOARD_FIXTURE_VERSION,
    scenario: 'missing-sources',
    now: DASHBOARD_FIXTURE_CLOCK,
    tenantId: '00000000-0000-4000-8000-000000000004',
    foreignTenantId: '00000000-0000-4000-8000-000000000096',
    portfolioRows: [{
      tenantId: '00000000-0000-4000-8000-000000000004',
      observedAt: '2026-09-11T23:00:00.000Z',
      lastActivityAt: '2026-09-10T00:00:00.000Z',
      renewalDate: null,
      mandatoryGaps: 0,
      openTasks: 0,
      consultHours30d: 2,
    }],
    sources: {
      risk: { status: 'missing', observedAt: null, riskIndex: null, riskIndexDelta14d: null, highSeverityOpenRisks: null },
      burn: { status: 'missing', observedAt: null, burnRiskStatus: null, projectedExhaustionDate: null },
      retention: { status: 'missing', observedAt: null, retentionStatus: null },
      compliance: { status: 'missing', observedAt: null, overdueTasks: null, blockedTasks: null, openTasks: null },
      stage: { status: 'unavailable', observedAt: null },
      ...sharedRows,
    },
    expected: {
      attentionScore: 0,
      daysSinceActivity: 2,
      daysToRenewal: null,
      burnRiskStatus: 'normal',
      retentionStatus: 'stable',
      sourceFreshness: { portfolio: '2026-09-11T23:00:00.000Z', risk: null, burn: null, retention: null, compliance: null, stage: null },
      missingSourceFlags: ['risk', 'burn', 'retention', 'compliance', 'stage'],
      futureTimestampFlags: [],
      branchCounts: { priorityInboxRows: 0, riskClusterRows: 0, labourEfficiencyRows: 0, recentCommsRows: 0, behaviouralPromptRows: 0 },
    },
  },
  {
    version: DASHBOARD_FIXTURE_VERSION,
    scenario: 'future-timestamps',
    now: DASHBOARD_FIXTURE_CLOCK,
    tenantId: '00000000-0000-4000-8000-000000000005',
    foreignTenantId: '00000000-0000-4000-8000-000000000095',
    portfolioRows: [{
      tenantId: '00000000-0000-4000-8000-000000000005',
      observedAt: '2026-09-11T23:00:00.000Z',
      lastActivityAt: '2026-09-15T00:00:00.000Z',
      renewalDate: '2026-09-10',
      mandatoryGaps: 0,
      openTasks: 0,
      consultHours30d: 1,
    }],
    sources: {
      risk: { status: 'available', observedAt: '2026-09-13T00:00:00.000Z', riskIndex: 0, riskIndexDelta14d: 0, highSeverityOpenRisks: 0 },
      burn: { status: 'available', observedAt: '2026-09-13T00:00:00.000Z', burnRiskStatus: 'normal', projectedExhaustionDate: '2026-09-20' },
      retention: { status: 'available', observedAt: '2026-09-13T00:00:00.000Z', retentionStatus: 'stable' },
      compliance: { status: 'available', observedAt: '2026-09-13T00:00:00.000Z', overdueTasks: 0, blockedTasks: 0, openTasks: 0 },
      stage: { status: 'unavailable', observedAt: null },
      ...sharedRows,
    },
    expected: {
      attentionScore: 6,
      daysSinceActivity: -3,
      daysToRenewal: -2,
      burnRiskStatus: 'normal',
      retentionStatus: 'stable',
      sourceFreshness: { portfolio: '2026-09-11T23:00:00.000Z', risk: '2026-09-13T00:00:00.000Z', burn: '2026-09-13T00:00:00.000Z', retention: '2026-09-13T00:00:00.000Z', compliance: '2026-09-13T00:00:00.000Z', stage: null },
      missingSourceFlags: ['stage'],
      futureTimestampFlags: ['lastActivityAt', 'riskObservedAt', 'burnObservedAt', 'retentionObservedAt', 'complianceObservedAt'],
      branchCounts: { priorityInboxRows: 0, riskClusterRows: 0, labourEfficiencyRows: 0, recentCommsRows: 0, behaviouralPromptRows: 0 },
    },
  },
];

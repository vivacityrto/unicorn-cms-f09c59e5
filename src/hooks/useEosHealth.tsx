import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import {
  type EosHealthData,
  type DimensionScore,
  type HealthDimension,
  type HealthIssue,
  type TrendDirection,
  getHealthBand,
  DIMENSION_LABELS,
  DIMENSION_DESCRIPTIONS,
} from '@/types/eosHealth';
import { subWeeks, startOfWeek, isAfter, differenceInDays } from 'date-fns';

/**
 * Hook to calculate EOS Health Score for the current tenant.
 * Health reflects execution, not intent - derived from real data.
 */
export function useEosHealth() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['eos-health', tenantId],
    queryFn: async (): Promise<EosHealthData> => {
      if (!tenantId) throw new Error('No tenant ID');

      const now = new Date();
      const fourWeeksAgo = subWeeks(now, 4);
      const currentQuarter = Math.ceil((now.getMonth() + 1) / 3);
      const currentYear = now.getFullYear();

      // Fetch all required data in parallel
      const [
        meetingsResult,
        rocksResult,
        issuesResult,
        qcResult,
        flightPlansResult,
      ] = await Promise.all([
        // Meetings - last 4 weeks
        supabase
          .from('eos_meetings')
          .select('id, meeting_type, status, is_complete, scheduled_date, recurrence_rule')
          .eq('tenant_id', tenantId)
          .gte('scheduled_date', fourWeeksAgo.toISOString()),
        // Rocks - current quarter
        supabase
          .from('eos_rocks')
          .select('id, owner_id, status, quarter_year, quarter_number, due_date')
          .eq('tenant_id', tenantId),
        // Issues/Risks & Opportunities
        supabase
          .from('eos_issues')
          .select('id, status, priority, created_at, resolved_at, escalated_at')
          .eq('tenant_id', tenantId),
        // Quarterly Conversations
        supabase
          .from('eos_qc')
          .select('id, status, quarter_number, quarter_year, manager_signed_at, reviewee_signed_at')
          .eq('tenant_id', tenantId),
        // Flight Plans
        supabase
          .from('eos_flight_plans')
          .select('id, quarter_number, quarter_year, status')
          .eq('tenant_id', tenantId),
      ]);

      const meetings = meetingsResult.data || [];
      const rocks = rocksResult.data || [];
      const issues = issuesResult.data || [];
      const qcs = qcResult.data || [];
      const flightPlans = flightPlansResult.data || [];

      // Calculate each dimension
      const cadenceScore = calculateCadenceHealth(meetings, fourWeeksAgo);
      const rocksScore = calculateRockDiscipline(rocks, currentQuarter, currentYear);
      const idsScore = calculateIDSEffectiveness(issues);
      const peopleScore = calculatePeopleSystem(qcs, currentQuarter, currentYear);
      const quarterlyScore = calculateQuarterlyRhythm(flightPlans, meetings, rocks, currentQuarter, currentYear);

      const dimensions: DimensionScore[] = [
        cadenceScore,
        rocksScore,
        idsScore,
        peopleScore,
        quarterlyScore,
      ];

      // Calculate overall score (average)
      const overallScore = Math.round(
        dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length
      );

      // Determine trend (simplified - would need historical data for real trend)
      const trend: TrendDirection = 'stable';

      return {
        overallScore,
        overallBand: getHealthBand(overallScore),
        trend,
        dimensions,
        lastCalculated: now.toISOString(),
      };
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  return {
    health: data,
    isLoading,
    error,
    refetch,
  };
}

function calculateCadenceHealth(
  meetings: any[],
  fourWeeksAgo: Date
): DimensionScore {
  const l10Meetings = meetings.filter(m => m.meeting_type === 'L10');
  const completedL10s = l10Meetings.filter(m => m.is_complete || m.status === 'completed' || m.status === 'closed');
  const hasRecurring = l10Meetings.some(m => m.recurrence_rule);

  const issues: HealthIssue[] = [];
  let score = 100;

  // Check weekly meetings (should have ~4 in 4 weeks)
  if (completedL10s.length === 0) {
    score = 0;
    issues.push({
      id: 'no-l10s',
      message: 'No Level 10 meetings completed in the last 4 weeks',
      severity: 'critical',
      link: '/eos/meetings',
    });
  } else if (completedL10s.length < 2) {
    score -= 40;
    issues.push({
      id: 'few-l10s',
      message: `Only ${completedL10s.length} L10 completed in 4 weeks`,
      severity: 'warning',
      link: '/eos/meetings',
    });
  } else if (completedL10s.length < 4) {
    score -= 20;
    issues.push({
      id: 'missing-l10s',
      message: `${4 - completedL10s.length} L10 meetings missed recently`,
      severity: 'info',
      link: '/eos/meetings',
    });
  }

  // Check for recurring schedule
  if (!hasRecurring && l10Meetings.length > 0) {
    score -= 15;
    issues.push({
      id: 'no-recurring',
      message: 'No recurring L10 meeting scheduled',
      severity: 'warning',
      link: '/eos/meetings',
    });
  }

  // Check for unclosed meetings
  const unclosed = l10Meetings.filter(m => !m.is_complete && m.status !== 'closed' && m.status !== 'cancelled');
  if (unclosed.length > 1) {
    score -= 10;
    issues.push({
      id: 'unclosed',
      message: `${unclosed.length} meetings not properly closed`,
      severity: 'info',
      link: '/eos/meetings',
    });
  }

  score = Math.max(0, Math.min(100, score));

  return {
    dimension: 'cadence',
    score,
    band: getHealthBand(score),
    label: DIMENSION_LABELS.cadence,
    description: DIMENSION_DESCRIPTIONS.cadence,
    issues,
    signals: [
      { label: 'L10s (4 weeks)', value: completedL10s.length, isPositive: completedL10s.length >= 3 },
      { label: 'Recurring', value: hasRecurring ? 'Yes' : 'No', isPositive: hasRecurring },
    ],
  };
}

function calculateRockDiscipline(
  rocks: any[],
  currentQuarter: number,
  currentYear: number
): DimensionScore {
  const currentRocks = rocks.filter(
    r => r.quarter_year === currentYear && r.quarter_number === currentQuarter
  );
  
  const ownedRocks = currentRocks.filter(r => r.owner_id);
  const unownedCount = currentRocks.length - ownedRocks.length;
  const onTrack = currentRocks.filter(r => r.status === 'on_track').length;
  const offTrack = currentRocks.filter(r => r.status === 'off_track').length;
  const completed = currentRocks.filter(r => r.status === 'complete').length;

  const issues: HealthIssue[] = [];
  let score = 100;

  if (currentRocks.length === 0) {
    score = 0;
    issues.push({
      id: 'no-rocks',
      message: 'No Rocks set for current quarter',
      severity: 'critical',
      link: '/eos/rocks',
    });
  } else {
    // Unowned rocks - heavy penalty
    if (unownedCount > 0) {
      score -= unownedCount * 15;
      issues.push({
        id: 'unowned',
        message: `${unownedCount} Rock${unownedCount > 1 ? 's' : ''} have no owner`,
        severity: 'critical',
        link: '/eos/rocks',
      });
    }

    // Off-track ratio
    const offTrackRatio = offTrack / currentRocks.length;
    if (offTrackRatio > 0.5) {
      score -= 25;
      issues.push({
        id: 'many-off-track',
        message: `${offTrack} of ${currentRocks.length} Rocks are off-track`,
        severity: 'warning',
        link: '/eos/rocks',
      });
    } else if (offTrackRatio > 0.25) {
      score -= 10;
      issues.push({
        id: 'some-off-track',
        message: `${offTrack} Rock${offTrack > 1 ? 's' : ''} off-track`,
        severity: 'info',
        link: '/eos/rocks',
      });
    }

    // Too few rocks
    if (currentRocks.length < 3) {
      score -= 15;
      issues.push({
        id: 'few-rocks',
        message: 'Less than 3 Rocks for the quarter',
        severity: 'info',
        link: '/eos/rocks',
      });
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    dimension: 'rocks',
    score,
    band: getHealthBand(score),
    label: DIMENSION_LABELS.rocks,
    description: DIMENSION_DESCRIPTIONS.rocks,
    issues,
    signals: [
      { label: 'Total Rocks', value: currentRocks.length, isPositive: currentRocks.length >= 3 },
      { label: 'On Track', value: onTrack, isPositive: onTrack > offTrack },
      { label: 'Off Track', value: offTrack, isPositive: offTrack === 0 },
      { label: 'Completed', value: completed, isPositive: completed > 0 },
    ],
  };
}

function calculateIDSEffectiveness(issues: any[]): DimensionScore {
  const open = issues.filter(i => i.status === 'Open' || i.status === 'open');
  const solved = issues.filter(i => i.status === 'Solved' || i.status === 'solved');
  const escalated = issues.filter(i => i.escalated_at);
  
  const now = new Date();
  const oldOpenItems = open.filter(i => {
    const created = new Date(i.created_at);
    return differenceInDays(now, created) > 30;
  });
  
  const criticalOld = oldOpenItems.filter(i => 
    i.priority === 'Critical' || i.priority === 'High' || i.priority === 3 || i.priority === 4
  );

  const healthIssues: HealthIssue[] = [];
  let score = 100;

  if (issues.length === 0) {
    // No issues could mean nothing tracked OR truly clean
    score = 50;
    healthIssues.push({
      id: 'no-issues',
      message: 'No issues tracked in IDS',
      severity: 'info',
      link: '/eos/risks-opportunities',
    });
  } else {
    // Critical/High items open > 30 days
    if (criticalOld.length > 0) {
      score -= criticalOld.length * 20;
      healthIssues.push({
        id: 'old-critical',
        message: `${criticalOld.length} critical/high priority item${criticalOld.length > 1 ? 's' : ''} unresolved for 30+ days`,
        severity: 'critical',
        link: '/eos/risks-opportunities',
      });
    }

    // General old items
    if (oldOpenItems.length > criticalOld.length) {
      const otherOld = oldOpenItems.length - criticalOld.length;
      score -= otherOld * 5;
      healthIssues.push({
        id: 'old-items',
        message: `${otherOld} item${otherOld > 1 ? 's' : ''} open for 30+ days`,
        severity: 'warning',
        link: '/eos/risks-opportunities',
      });
    }

    // Check solve rate
    const solveRate = issues.length > 0 ? solved.length / issues.length : 0;
    if (solveRate < 0.3 && issues.length > 5) {
      score -= 15;
      healthIssues.push({
        id: 'low-solve-rate',
        message: 'Low issue resolution rate',
        severity: 'info',
        link: '/eos/risks-opportunities',
      });
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    dimension: 'ids',
    score,
    band: getHealthBand(score),
    label: DIMENSION_LABELS.ids,
    description: DIMENSION_DESCRIPTIONS.ids,
    issues: healthIssues,
    signals: [
      { label: 'Open', value: open.length, isPositive: open.length < 10 },
      { label: 'Solved', value: solved.length, isPositive: solved.length > 0 },
      { label: 'Stale (30+ days)', value: oldOpenItems.length, isPositive: oldOpenItems.length === 0 },
    ],
  };
}

function calculatePeopleSystem(
  qcs: any[],
  currentQuarter: number,
  currentYear: number
): DimensionScore {
  const currentQCs = qcs.filter(
    q => q.quarter_year === currentYear && q.quarter_number === currentQuarter
  );
  const previousQCs = qcs.filter(
    q => (q.quarter_year === currentYear && q.quarter_number === currentQuarter - 1) ||
         (q.quarter_year === currentYear - 1 && q.quarter_number === 4 && currentQuarter === 1)
  );

  const completed = currentQCs.filter(q => q.status === 'completed');
  const fullySignedOff = currentQCs.filter(q => q.manager_signed_at && q.reviewee_signed_at);
  const inProgress = currentQCs.filter(q => q.status === 'in_progress' || q.status === 'draft');

  const healthIssues: HealthIssue[] = [];
  let score = 100;

  if (qcs.length === 0) {
    score = 0;
    healthIssues.push({
      id: 'no-qcs',
      message: 'No Quarterly Conversations conducted',
      severity: 'critical',
      link: '/eos/qc',
    });
  } else {
    // Current quarter progress
    if (currentQCs.length === 0 && currentQuarter > 1) {
      score -= 30;
      healthIssues.push({
        id: 'no-current-qcs',
        message: 'No QCs started for current quarter',
        severity: 'warning',
        link: '/eos/qc',
      });
    }

    // Completion rate
    if (currentQCs.length > 0) {
      const completionRate = completed.length / currentQCs.length;
      if (completionRate < 0.5) {
        score -= 20;
        healthIssues.push({
          id: 'low-completion',
          message: `Only ${completed.length} of ${currentQCs.length} QCs completed`,
          severity: 'warning',
          link: '/eos/qc',
        });
      }
    }

    // Sign-off rate
    if (completed.length > 0 && fullySignedOff.length < completed.length) {
      const unsigned = completed.length - fullySignedOff.length;
      score -= unsigned * 10;
      healthIssues.push({
        id: 'unsigned',
        message: `${unsigned} completed QC${unsigned > 1 ? 's' : ''} missing signatures`,
        severity: 'info',
        link: '/eos/qc',
      });
    }
  }

  score = Math.max(0, Math.min(100, score));

  return {
    dimension: 'people',
    score,
    band: getHealthBand(score),
    label: DIMENSION_LABELS.people,
    description: DIMENSION_DESCRIPTIONS.people,
    issues: healthIssues,
    signals: [
      { label: 'This Quarter', value: currentQCs.length, isPositive: currentQCs.length > 0 },
      { label: 'Completed', value: completed.length, isPositive: completed.length > 0 },
      { label: 'Signed Off', value: fullySignedOff.length, isPositive: fullySignedOff.length >= completed.length },
    ],
  };
}

function calculateQuarterlyRhythm(
  flightPlans: any[],
  meetings: any[],
  rocks: any[],
  currentQuarter: number,
  currentYear: number
): DimensionScore {
  const currentPlan = flightPlans.find(
    fp => fp.quarter_year === currentYear && fp.quarter_number === currentQuarter
  );
  
  const nextQuarter = currentQuarter === 4 ? 1 : currentQuarter + 1;
  const nextYear = currentQuarter === 4 ? currentYear + 1 : currentYear;
  const nextPlan = flightPlans.find(
    fp => fp.quarter_year === nextYear && fp.quarter_number === nextQuarter
  );

  const quarterlyMeetings = meetings.filter(m => m.meeting_type === 'Quarterly');
  const completedQuarterly = quarterlyMeetings.filter(
    m => m.is_complete || m.status === 'completed' || m.status === 'closed'
  );

  const currentRocks = rocks.filter(
    r => r.quarter_year === currentYear && r.quarter_number === currentQuarter
  );
  const closedRocks = currentRocks.filter(r => r.status === 'complete');

  const healthIssues: HealthIssue[] = [];
  let score = 100;

  // Current quarter flight plan
  if (!currentPlan) {
    score -= 35;
    healthIssues.push({
      id: 'no-current-plan',
      message: 'No Flight Plan for current quarter',
      severity: 'critical',
      link: '/eos/flight-plan',
    });
  }

  // Quarterly meeting completion
  if (completedQuarterly.length === 0) {
    score -= 25;
    healthIssues.push({
      id: 'no-quarterly-meeting',
      message: 'No Quarterly meetings completed',
      severity: 'warning',
      link: '/eos/meetings',
    });
  }

  // Next quarter planning (only check late in quarter)
  const now = new Date();
  const monthInQuarter = ((now.getMonth()) % 3) + 1;
  if (monthInQuarter === 3 && !nextPlan) {
    score -= 15;
    healthIssues.push({
      id: 'no-next-plan',
      message: 'Next quarter Flight Plan not yet created',
      severity: 'info',
      link: '/eos/flight-plan',
    });
  }

  score = Math.max(0, Math.min(100, score));

  return {
    dimension: 'quarterly',
    score,
    band: getHealthBand(score),
    label: DIMENSION_LABELS.quarterly,
    description: DIMENSION_DESCRIPTIONS.quarterly,
    issues: healthIssues,
    signals: [
      { label: 'Current Flight Plan', value: currentPlan ? 'Yes' : 'No', isPositive: !!currentPlan },
      { label: 'Quarterly Meetings', value: completedQuarterly.length, isPositive: completedQuarterly.length > 0 },
      { label: 'Rocks Closed', value: `${closedRocks.length}/${currentRocks.length}`, isPositive: closedRocks.length > 0 },
    ],
  };
}

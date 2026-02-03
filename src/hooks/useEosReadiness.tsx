import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type {
  EosReadinessState,
  EosReadinessData,
  OnboardingCategory,
  OnboardingChecklistItem,
} from '@/types/eosReadiness';
import { READINESS_STATE_LABELS, READINESS_STATE_DESCRIPTIONS } from '@/types/eosReadiness';

interface ReadinessRawData {
  // Foundation
  hasAccountabilityChart: boolean;
  hasSeatsWithOwners: boolean;
  // Vision
  hasVto: boolean;
  vtoHasRequiredFields: boolean;
  // Execution
  hasActiveFlightPlan: boolean;
  rocksCount: number;
  rocksWithOwners: number;
  // Weekly
  completedL10Count: number;
  hasRecurringL10: boolean;
  // Quarterly
  completedQuarterlyMeetings: number;
  consecutiveQuartersCompleted: number;
  hasNextQuarterFlightPlan: boolean;
  // People
  signedQCCount: number;
}

/**
 * Hook to calculate EOS readiness state for the current tenant.
 * Readiness is derived from actual usage, not manual declarations.
 */
export function useEosReadiness() {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;

  const { data, isLoading, error } = useQuery({
    queryKey: ['eos-readiness', tenantId],
    queryFn: async (): Promise<EosReadinessData> => {
      if (!tenantId) throw new Error('No tenant ID');

      // Fetch all required data in parallel
      const [
        accountabilityChartResult,
        vtoResult,
        flightPlanResult,
        rocksResult,
        meetingsResult,
        qcResult,
      ] = await Promise.all([
        // Accountability Chart - check for positions with assigned users
        supabase
          .from('eos_accountability_chart')
          .select('id, assigned_user_id, position_title')
          .eq('tenant_id', tenantId),
        // VTO
        supabase
          .from('eos_vto')
          .select('id, core_values, target_market, ten_year_target, three_year_measurables, one_year_goals')
          .eq('tenant_id', tenantId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Flight Plans - current and next quarter
        supabase
          .from('eos_flight_plans')
          .select('id, quarter_number, quarter_year')
          .eq('tenant_id', tenantId)
          .order('quarter_year', { ascending: false })
          .order('quarter_number', { ascending: false })
          .limit(4),
        // Rocks with owners (owner_id is the correct column)
        supabase
          .from('eos_rocks')
          .select('id, owner_id, quarter_year, quarter_number')
          .eq('tenant_id', tenantId),
        // Meetings - L10 and Quarterly
        supabase
          .from('eos_meetings')
          .select('id, meeting_type, status, is_complete, recurrence_rule')
          .eq('tenant_id', tenantId),
        // Quarterly Conversations
        supabase
          .from('eos_qc')
          .select('id, status')
          .eq('tenant_id', tenantId),
      ]);

      // Process results
      const chartPositions = accountabilityChartResult.data || [];
      const vto = vtoResult.data;
      const flightPlans = flightPlanResult.data || [];
      const rocks = rocksResult.data || [];
      const meetings = meetingsResult.data || [];
      const qcs = qcResult.data || [];

      // Calculate raw data
      const hasAccountabilityChart = chartPositions.length > 0;
      const hasSeatsWithOwners = chartPositions.some(pos => pos.assigned_user_id);

      const hasVto = !!vto;
      const vtoHasRequiredFields = hasVto && !!(
        vto.target_market || 
        vto.ten_year_target || 
        (Array.isArray(vto.one_year_goals) && vto.one_year_goals.length > 0)
      );

      const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
      const currentYear = new Date().getFullYear();
      const hasActiveFlightPlan = flightPlans.some(
        fp => fp.quarter_year === currentYear && fp.quarter_number === currentQuarter
      );
      
      // Next quarter calculation
      const nextQuarter = currentQuarter === 4 ? 1 : currentQuarter + 1;
      const nextYear = currentQuarter === 4 ? currentYear + 1 : currentYear;
      const hasNextQuarterFlightPlan = flightPlans.some(
        fp => fp.quarter_year === nextYear && fp.quarter_number === nextQuarter
      );

      const currentRocks = rocks.filter(r => 
        r.quarter_year === currentYear && r.quarter_number === currentQuarter
      );
      const rocksCount = currentRocks.length;
      const rocksWithOwners = currentRocks.filter(r => r.owner_id).length;

      const l10Meetings = meetings.filter(m => m.meeting_type === 'L10');
      const completedL10Count = l10Meetings.filter(m => m.is_complete || m.status === 'completed' || m.status === 'closed').length;
      const hasRecurringL10 = l10Meetings.some(m => m.recurrence_rule);

      const quarterlyMeetings = meetings.filter(m => m.meeting_type === 'Quarterly');
      const completedQuarterlyMeetings = quarterlyMeetings.filter(m => m.is_complete || m.status === 'completed' || m.status === 'closed').length;

      // Simplified consecutive quarters check
      const consecutiveQuartersCompleted = completedQuarterlyMeetings >= 2 ? 2 : completedQuarterlyMeetings >= 1 ? 1 : 0;

      const signedQCCount = qcs.filter(qc => qc.status === 'completed').length;

      const rawData: ReadinessRawData = {
        hasAccountabilityChart,
        hasSeatsWithOwners,
        hasVto,
        vtoHasRequiredFields,
        hasActiveFlightPlan,
        rocksCount,
        rocksWithOwners,
        completedL10Count,
        hasRecurringL10,
        completedQuarterlyMeetings,
        consecutiveQuartersCompleted,
        hasNextQuarterFlightPlan,
        signedQCCount,
      };

      // Build checklist items
      const checklistItems = buildChecklistItems(rawData);

      // Calculate state
      const state = calculateReadinessState(rawData);

      // Group into categories
      const categories = groupIntoCategories(checklistItems);

      const completedItems = checklistItems.filter(i => i.isComplete).length;
      const totalItems = checklistItems.length;

      return {
        state,
        stateLabel: READINESS_STATE_LABELS[state],
        stateDescription: READINESS_STATE_DESCRIPTIONS[state],
        categories,
        overallProgress: totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0,
        completedItems,
        totalItems,
      };
    },
    enabled: !!tenantId,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  return {
    readiness: data,
    isLoading,
    error,
  };
}

function buildChecklistItems(data: ReadinessRawData): OnboardingChecklistItem[] {
  return [
    // Foundation
    {
      id: 'foundation-chart',
      label: 'Create Accountability Chart',
      description: 'Define your organizational structure',
      isComplete: data.hasAccountabilityChart,
      incompleteReason: !data.hasAccountabilityChart ? 'No accountability chart has been created.' : undefined,
      category: 'foundation',
    },
    {
      id: 'foundation-seats',
      label: 'Assign seats to team members',
      description: 'At least one seat has a primary owner',
      isComplete: data.hasSeatsWithOwners,
      incompleteReason: !data.hasSeatsWithOwners ? 'No seats have been assigned to team members.' : undefined,
      category: 'foundation',
    },
    // Vision
    {
      id: 'vision-vto',
      label: 'Complete Vision/Traction Organizer',
      description: 'Define your Mission Control',
      isComplete: data.hasVto,
      incompleteReason: !data.hasVto ? 'Mission Control has not been created.' : undefined,
      category: 'vision',
    },
    {
      id: 'vision-targets',
      label: 'Set 1-Year and 3-Year targets',
      description: 'Define measurable objectives',
      isComplete: data.vtoHasRequiredFields,
      incompleteReason: !data.vtoHasRequiredFields ? 'Target market, 10-year target, or 1-year goals are missing.' : undefined,
      category: 'vision',
    },
    // Execution
    {
      id: 'execution-flightplan',
      label: 'Create first quarter Flight Plan',
      description: 'Set up your quarterly execution plan',
      isComplete: data.hasActiveFlightPlan,
      incompleteReason: !data.hasActiveFlightPlan ? 'No Flight Plan for the current quarter.' : undefined,
      category: 'execution',
    },
    {
      id: 'execution-rocks',
      label: 'Create at least 3 Rocks',
      description: 'Set quarterly priorities',
      isComplete: data.rocksCount >= 3,
      incompleteReason: data.rocksCount < 3 ? `Only ${data.rocksCount} Rock${data.rocksCount !== 1 ? 's' : ''} created. Need at least 3.` : undefined,
      category: 'execution',
    },
    {
      id: 'execution-rock-owners',
      label: 'Assign Rock owners',
      description: 'Every Rock needs an accountable owner',
      isComplete: data.rocksWithOwners >= data.rocksCount && data.rocksCount > 0,
      incompleteReason: data.rocksWithOwners < data.rocksCount 
        ? `${data.rocksCount - data.rocksWithOwners} Rock${data.rocksCount - data.rocksWithOwners !== 1 ? 's' : ''} missing an owner.` 
        : data.rocksCount === 0 ? 'Create Rocks first.' : undefined,
      category: 'execution',
    },
    // Weekly
    {
      id: 'weekly-recurring',
      label: 'Schedule recurring Level 10',
      description: 'Set up your weekly meeting cadence',
      isComplete: data.hasRecurringL10,
      incompleteReason: !data.hasRecurringL10 ? 'No recurring L10 meeting scheduled.' : undefined,
      category: 'weekly',
    },
    {
      id: 'weekly-completed',
      label: 'Complete at least 2 Level 10 meetings',
      description: 'Run your first L10s with the team',
      isComplete: data.completedL10Count >= 2,
      incompleteReason: data.completedL10Count < 2 
        ? `Only ${data.completedL10Count} L10 meeting${data.completedL10Count !== 1 ? 's' : ''} completed. Need at least 2.` 
        : undefined,
      category: 'weekly',
    },
    // Quarterly
    {
      id: 'quarterly-meeting',
      label: 'Complete Quarterly Meeting',
      description: 'Run a quarterly planning session',
      isComplete: data.completedQuarterlyMeetings >= 1,
      incompleteReason: data.completedQuarterlyMeetings < 1 ? 'No Quarterly meeting has been completed.' : undefined,
      category: 'quarterly',
    },
    {
      id: 'quarterly-next',
      label: 'Create next quarter Flight Plan',
      description: 'Plan ahead for the next quarter',
      isComplete: data.hasNextQuarterFlightPlan,
      incompleteReason: !data.hasNextQuarterFlightPlan ? 'No Flight Plan exists for the next quarter.' : undefined,
      category: 'quarterly',
    },
    // People
    {
      id: 'people-qc',
      label: 'Complete at least one Quarterly Conversation',
      description: 'Conduct a QC with sign-off',
      isComplete: data.signedQCCount >= 1,
      incompleteReason: data.signedQCCount < 1 ? 'No Quarterly Conversations have been completed and signed.' : undefined,
      category: 'people',
    },
  ];
}

function calculateReadinessState(data: ReadinessRawData): EosReadinessState {
  const foundationComplete = data.hasAccountabilityChart && data.hasSeatsWithOwners;
  const visionComplete = data.hasVto && data.vtoHasRequiredFields;
  const executionComplete = data.hasActiveFlightPlan && data.rocksCount >= 3 && data.rocksWithOwners >= data.rocksCount;
  const weeklyActive = data.completedL10Count >= 2 && data.hasRecurringL10;
  const quarterlyComplete = data.completedQuarterlyMeetings >= 1;

  // Mature: Two or more consecutive quarters + consistent QCs
  if (data.consecutiveQuartersCompleted >= 2 && data.signedQCCount >= 2 && weeklyActive && executionComplete) {
    return 'mature';
  }

  // Disciplined: Quarterly cycle completed at least once
  if (quarterlyComplete && weeklyActive && executionComplete) {
    return 'disciplined';
  }

  // Operational: Weekly cadence active with rocks owned
  if (weeklyActive && data.rocksWithOwners > 0) {
    return 'operational';
  }

  // In Progress: Foundation + Vision partially complete
  if (foundationComplete || visionComplete || data.hasActiveFlightPlan || data.rocksCount > 0) {
    return 'in_progress';
  }

  // Not Started: Nothing configured
  return 'not_started';
}

function groupIntoCategories(items: OnboardingChecklistItem[]): OnboardingCategory[] {
  const categoryMeta: Record<string, { title: string; description: string }> = {
    foundation: {
      title: '1. Foundation',
      description: 'Build your organizational structure',
    },
    vision: {
      title: '2. Vision and Direction',
      description: 'Define where you\'re going',
    },
    execution: {
      title: '3. Execution Setup',
      description: 'Set up quarterly priorities',
    },
    weekly: {
      title: '4. Weekly Cadence',
      description: 'Establish your Level 10 rhythm',
    },
    quarterly: {
      title: '5. Quarterly Rhythm',
      description: 'Complete your first quarterly cycle',
    },
    people: {
      title: '6. People System',
      description: 'Implement Quarterly Conversations',
    },
  };

  const categoryOrder: OnboardingCategory['id'][] = ['foundation', 'vision', 'execution', 'weekly', 'quarterly', 'people'];

  return categoryOrder.map(categoryId => {
    const categoryItems = items.filter(i => i.category === categoryId);
    const completedCount = categoryItems.filter(i => i.isComplete).length;
    
    return {
      id: categoryId,
      title: categoryMeta[categoryId].title,
      description: categoryMeta[categoryId].description,
      items: categoryItems,
      isComplete: completedCount === categoryItems.length,
      completedCount,
      totalCount: categoryItems.length,
    };
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { startOfWeek, subWeeks, format } from 'date-fns';

// Vivacity tenant ID
const VIVACITY_TENANT_ID = 6372;

export interface LeadershipScorecardHealth {
  totalMetrics: number;
  onTrackCount: number;
  offTrackCount: number;
  missingCount: number;
  healthPercentage: number;
  trendVsLastWeek: number; // positive = improving
}

export interface LeadershipRockStatus {
  totalRocks: number;
  onTrack: number;
  atRisk: number;
  offTrack: number;
  completed: number;
  rocks: {
    id: string;
    title: string;
    ownerName: string;
    status: string;
    updatedAt: string;
    linkedRisksCount: number;
  }[];
}

export interface LeadershipRiskRadar {
  openRisks: number;
  escalatedCount: number;
  topRisks: {
    id: string;
    title: string;
    impact: string;
    status: string;
    ownerName: string;
    isEscalated: boolean;
  }[];
  topOpportunities: {
    id: string;
    title: string;
    impact: string;
    status: string;
    ownerName: string;
  }[];
}

export interface LeadershipTodosDiscipline {
  lastL10CompletedCount: number;
  lastL10TotalCount: number;
  completionPercentage: number;
  overdueCount: number;
}

export interface LeadershipMeetingDiscipline {
  lastL10Date: string | null;
  lastL10AttendancePercentage: number;
  quorumMet: boolean;
  actionsCreated: number;
  actionsClosed: number;
  quarterlyMeetingStatus: 'not_scheduled' | 'scheduled' | 'completed';
  missedL10Warning: boolean;
}

export interface LeadershipScorecardException {
  id: string;
  metricName: string;
  target: number | null;
  actual: number | null;
  variance: number;
  trend: 'up' | 'down' | 'stable';
  unit: string;
}

export interface LeadershipAccountabilityGap {
  type: 'unowned_seat' | 'overloaded_owner' | 'gwc_issue';
  seatName: string;
  ownerName?: string;
  detail: string;
  link: string;
}

export interface LeadershipDashboardData {
  scorecardHealth: LeadershipScorecardHealth;
  rockStatus: LeadershipRockStatus;
  riskRadar: LeadershipRiskRadar;
  todosDiscipline: LeadershipTodosDiscipline;
  meetingDiscipline: LeadershipMeetingDiscipline;
  scorecardExceptions: LeadershipScorecardException[];
  accountabilityGaps: LeadershipAccountabilityGap[];
  currentQuarter: number;
  currentYear: number;
}

/**
 * Hook for EOS Leadership Dashboard data
 * Aggregates real-time data from Scorecard, Rocks, Risks, Meetings, Todos
 * Scoped to Vivacity tenant only
 */
export function useLeadershipDashboard(quarterFilter?: { year: number; quarter: number }) {
  const { profile, isSuperAdmin } = useAuth();
  const isSuper = isSuperAdmin();

  return useQuery({
    queryKey: ['leadership-dashboard', quarterFilter?.year, quarterFilter?.quarter],
    queryFn: async (): Promise<LeadershipDashboardData> => {
      const now = new Date();
      const currentQuarter = quarterFilter?.quarter ?? Math.ceil((now.getMonth() + 1) / 3);
      const currentYear = quarterFilter?.year ?? now.getFullYear();
      const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
      const lastWeekStart = subWeeks(thisWeekStart, 1);
      const fourWeeksAgo = subWeeks(now, 4);

      // Fetch all data in parallel - scoped to Vivacity tenant
      const [
        metricsResult,
        entriesResult,
        rocksResult,
        issuesResult,
        todosResult,
        meetingsResult,
        attendeesResult,
        seatsResult,
        usersResult,
      ] = await Promise.all([
        supabase
          .from('eos_scorecard_metrics')
          .select('id, name, target_value, unit, is_active')
          .eq('tenant_id', VIVACITY_TENANT_ID)
          .eq('is_active', true),
        supabase
          .from('eos_scorecard_entries')
          .select('id, metric_id, value, week_ending')
          .eq('tenant_id', VIVACITY_TENANT_ID)
          .gte('week_ending', subWeeks(now, 2).toISOString()),
        supabase
          .from('eos_rocks')
          .select('id, title, owner_id, status, updated_at, quarter_year, quarter_number')
          .eq('tenant_id', VIVACITY_TENANT_ID)
          .eq('quarter_year', currentYear)
          .eq('quarter_number', currentQuarter),
        supabase
          .from('eos_issues')
          .select('id, title, item_type, impact, status, assigned_to, escalated_at, linked_rock_id')
          .eq('tenant_id', VIVACITY_TENANT_ID)
          .is('deleted_at', null),
        supabase
          .from('eos_todos')
          .select('id, status, due_date, meeting_id, completed_date')
          .eq('tenant_id', VIVACITY_TENANT_ID),
        supabase
          .from('eos_meetings')
          .select('id, meeting_type, scheduled_date, is_complete, status, quorum_status')
          .eq('tenant_id', VIVACITY_TENANT_ID)
          .gte('scheduled_date', fourWeeksAgo.toISOString())
          .order('scheduled_date', { ascending: false }),
        supabase
          .from('eos_meeting_attendees')
          .select('meeting_id, attendance_status'),
        supabase
          .from('accountability_seats')
          .select('id, seat_name')
          .eq('tenant_id', VIVACITY_TENANT_ID),
        supabase
          .from('users')
          .select('user_uuid, first_name, last_name')
          .eq('tenant_id', VIVACITY_TENANT_ID),
      ]);

      const metrics = metricsResult.data || [];
      const entries = entriesResult.data || [];
      const rocks = rocksResult.data || [];
      const issues = issuesResult.data || [];
      const todos = todosResult.data || [];
      const meetings = meetingsResult.data || [];
      const attendees = (attendeesResult.data || []) as { meeting_id: string; attendance_status: string }[];
      const seats = seatsResult.data || [];
      const users = usersResult.data || [];

      // Helper to get user name
      const getUserName = (userId: string | null | undefined): string => {
        if (!userId) return 'Unassigned';
        const user = users.find(u => u.user_uuid === userId);
        if (user && (user.first_name || user.last_name)) {
          return `${user.first_name || ''} ${user.last_name || ''}`.trim();
        }
        return 'Unknown';
      };

      // Calculate Scorecard Health
      const thisWeekEntries = entries.filter(e => 
        new Date(e.week_ending) >= thisWeekStart
      );
      const lastWeekEntries = entries.filter(e => {
        const weekEnd = new Date(e.week_ending);
        return weekEnd >= lastWeekStart && weekEnd < thisWeekStart;
      });

      const metricsWithThisWeek = new Set(thisWeekEntries.map(e => e.metric_id));
      const onTrackThisWeek = thisWeekEntries.filter(e => {
        const metric = metrics.find(m => m.id === e.metric_id);
        return metric?.target_value && e.value >= metric.target_value;
      });

      const scorecardHealth: LeadershipScorecardHealth = {
        totalMetrics: metrics.length,
        onTrackCount: onTrackThisWeek.length,
        offTrackCount: thisWeekEntries.length - onTrackThisWeek.length,
        missingCount: metrics.length - metricsWithThisWeek.size,
        healthPercentage: metrics.length > 0 
          ? Math.round((onTrackThisWeek.length / metrics.length) * 100) 
          : 0,
        trendVsLastWeek: 0, // Would need historical calculation
      };

      // Calculate Rock Status (enum values are: Not_Started, On_Track, Off_Track, At_Risk, Complete)
      const onTrackRocks = rocks.filter(r => r.status === 'On_Track');
      const offTrackRocks = rocks.filter(r => r.status === 'Off_Track');
      const atRiskRocks = rocks.filter(r => r.status === 'At_Risk');
      const completedRocks = rocks.filter(r => r.status === 'Complete');

      // Count linked risks per rock
      const rockRiskCounts = new Map<string, number>();
      issues.forEach(issue => {
        if (issue.linked_rock_id) {
          rockRiskCounts.set(issue.linked_rock_id, (rockRiskCounts.get(issue.linked_rock_id) || 0) + 1);
        }
      });

      const rockStatus: LeadershipRockStatus = {
        totalRocks: rocks.length,
        onTrack: onTrackRocks.length,
        atRisk: atRiskRocks.length,
        offTrack: offTrackRocks.length,
        completed: completedRocks.length,
        rocks: rocks
          .sort((a, b) => {
            // Sort: Off Track first, then At Risk, then On Track
            const statusOrder: Record<string, number> = { 
              'Off_Track': 0,
              'At_Risk': 1,
              'On_Track': 2,
              'Complete': 3,
              'Not_Started': 4,
            };
            return (statusOrder[a.status ?? ''] ?? 99) - (statusOrder[b.status ?? ''] ?? 99);
          })
          .map(rock => ({
            id: rock.id,
            title: rock.title,
            ownerName: getUserName(rock.owner_id),
            status: rock.status,
            updatedAt: rock.updated_at,
            linkedRisksCount: rockRiskCounts.get(rock.id) || 0,
          })),
      };

      // Calculate Risk Radar
      const openStatuses = ['Open', 'open', 'Discussing', 'discussing', 'In Review', 'Actioning'];
      const openIssues = issues.filter(i => openStatuses.includes(i.status));
      const escalatedIssues = issues.filter(i => i.escalated_at);
      const risks = issues.filter(i => i.item_type === 'risk');
      const opportunities = issues.filter(i => i.item_type === 'opportunity');

      const riskRadar: LeadershipRiskRadar = {
        openRisks: openIssues.filter(i => i.item_type === 'risk').length,
        escalatedCount: escalatedIssues.length,
        topRisks: risks
          .filter(r => openStatuses.includes(r.status) || r.escalated_at)
          .sort((a, b) => {
            // Escalated first, then by impact
            if (a.escalated_at && !b.escalated_at) return -1;
            if (!a.escalated_at && b.escalated_at) return 1;
            const impactOrder: Record<string, number> = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
            return (impactOrder[a.impact || ''] ?? 99) - (impactOrder[b.impact || ''] ?? 99);
          })
          .slice(0, 5)
          .map(r => ({
            id: r.id,
            title: r.title,
            impact: r.impact || 'Unknown',
            status: r.status,
            ownerName: getUserName(r.assigned_to),
            isEscalated: !!r.escalated_at,
          })),
        topOpportunities: opportunities
          .filter(o => openStatuses.includes(o.status))
          .sort((a, b) => {
            const impactOrder: Record<string, number> = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
            return (impactOrder[a.impact || ''] ?? 99) - (impactOrder[b.impact || ''] ?? 99);
          })
          .slice(0, 5)
          .map(o => ({
            id: o.id,
            title: o.title,
            impact: o.impact || 'Unknown',
            status: o.status,
            ownerName: getUserName(o.assigned_to),
          })),
      };

      // Calculate Todos Discipline (eos_todo_status enum: Open, Complete, Cancelled)
      const l10Meetings = meetings.filter(m => m.meeting_type === 'L10');
      const lastCompletedL10 = l10Meetings.find(m => m.is_complete || m.status === 'completed' || m.status === 'closed');
      const lastL10Todos = lastCompletedL10 
        ? todos.filter(t => t.meeting_id === lastCompletedL10.id)
        : [];
      const completedTodos = lastL10Todos.filter(t => t.status === 'Complete' || t.completed_date);
      const overdueTodos = todos.filter(t => 
        t.due_date && 
        new Date(t.due_date) < now && 
        t.status !== 'Complete' && 
        !t.completed_date
      );

      const todosDiscipline: LeadershipTodosDiscipline = {
        lastL10CompletedCount: completedTodos.length,
        lastL10TotalCount: lastL10Todos.length,
        completionPercentage: lastL10Todos.length > 0 
          ? Math.round((completedTodos.length / lastL10Todos.length) * 100) 
          : 0,
        overdueCount: overdueTodos.length,
      };

      // Calculate Meeting Discipline (attendance_status instead of status)
      const lastL10Attendees = lastCompletedL10 
        ? attendees.filter(a => a.meeting_id === lastCompletedL10.id)
        : [];
      const presentAttendees = lastL10Attendees.filter(a => a.attendance_status === 'Present');
      
      const quarterlyMeetings = meetings.filter(m => m.meeting_type === 'Quarterly');
      const hasCompletedQuarterly = quarterlyMeetings.some(m => m.is_complete || m.status === 'completed');
      const hasScheduledQuarterly = quarterlyMeetings.some(m => !m.is_complete && m.status !== 'cancelled');

      // Check if L10 was missed (no L10 in last 2 weeks)
      const twoWeeksAgo = subWeeks(now, 2);
      const recentL10 = l10Meetings.find(m => new Date(m.scheduled_date) >= twoWeeksAgo);
      const missedL10 = !recentL10;

      const meetingDiscipline: LeadershipMeetingDiscipline = {
        lastL10Date: lastCompletedL10?.scheduled_date || null,
        lastL10AttendancePercentage: lastL10Attendees.length > 0
          ? Math.round((presentAttendees.length / lastL10Attendees.length) * 100)
          : 0,
        quorumMet: lastCompletedL10?.quorum_status === 'met' || lastCompletedL10?.quorum_status === 'overridden',
        actionsCreated: lastL10Todos.length,
        actionsClosed: completedTodos.length,
        quarterlyMeetingStatus: hasCompletedQuarterly 
          ? 'completed' 
          : hasScheduledQuarterly 
            ? 'scheduled' 
            : 'not_scheduled',
        missedL10Warning: missedL10,
      };

      // Calculate Scorecard Exceptions (metrics off target)
      const scorecardExceptions: LeadershipScorecardException[] = thisWeekEntries
        .map(entry => {
          const metric = metrics.find(m => m.id === entry.metric_id);
          if (!metric || !metric.target_value) return null;
          
          const variance = entry.value - metric.target_value;
          const isOffTrack = entry.value < metric.target_value;
          
          if (!isOffTrack) return null;
          
          // Find last week's entry for trend
          const lastWeekEntry = lastWeekEntries.find(e => e.metric_id === entry.metric_id);
          let trend: 'up' | 'down' | 'stable' = 'stable';
          if (lastWeekEntry) {
            if (entry.value > lastWeekEntry.value) trend = 'up';
            else if (entry.value < lastWeekEntry.value) trend = 'down';
          }

          return {
            id: entry.id,
            metricName: metric.name,
            target: metric.target_value,
            actual: entry.value,
            variance,
            trend,
            unit: metric.unit || '',
          };
        })
        .filter((e): e is LeadershipScorecardException => e !== null);

      // Accountability Gaps (simplified - would need seat assignments data)
      const accountabilityGaps: LeadershipAccountabilityGap[] = [];
      // This would require joining with seat_assignments to find gaps
      // For now, return empty - can be expanded with proper seat data

      return {
        scorecardHealth,
        rockStatus,
        riskRadar,
        todosDiscipline,
        meetingDiscipline,
        scorecardExceptions,
        accountabilityGaps,
        currentQuarter,
        currentYear,
      };
    },
    enabled: isSuper || profile?.unicorn_role === 'Team Leader',
    staleTime: 1000 * 60 * 2, // Cache for 2 minutes
    refetchOnWindowFocus: true,
  });
}

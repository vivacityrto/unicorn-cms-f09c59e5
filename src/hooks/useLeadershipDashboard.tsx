import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { startOfWeek, subWeeks, subDays } from 'date-fns';

// Vivacity tenant ID
const VIVACITY_TENANT_ID = 6372;

export interface LeadershipSeat {
  id: string;
  seatName: string;
  ownerUserId: string | null;
  ownerName: string;
  rocksCount: number;
  onTrackRocks: number;
  offTrackRocks: number;
  atRiskRocks: number;
  openRisksCount: number;
  escalatedRisksCount: number;
  criticalRisksAge30Days: number;
  isOverloaded: boolean;
  hasGwcIssues: boolean;
}

export interface LeadershipScorecardHealth {
  totalMetrics: number;
  onTrackCount: number;
  offTrackCount: number;
  missingCount: number;
  healthPercentage: number;
  trendVsLastWeek: number;
  seatsAtRisk: number;
}

export interface LeadershipRockStatus {
  totalRocks: number;
  onTrack: number;
  atRisk: number;
  offTrack: number;
  completed: number;
  seatsWithMultipleOffTrack: number;
  rocks: {
    id: string;
    title: string;
    ownerName: string;
    status: string;
    updatedAt: string;
    linkedRisksCount: number;
    seatId: string | null;
    seatName: string | null;
  }[];
  rocksBySeat: {
    seatId: string;
    seatName: string;
    ownerName: string;
    onTrack: number;
    atRisk: number;
    offTrack: number;
    completed: number;
    total: number;
  }[];
}

export interface LeadershipRiskRadar {
  openRisks: number;
  escalatedCount: number;
  seatsWithCriticalRisks: number;
  topRisks: {
    id: string;
    title: string;
    impact: string;
    status: string;
    ownerName: string;
    isEscalated: boolean;
    seatId: string | null;
    seatName: string | null;
    ageInDays: number;
  }[];
  topOpportunities: {
    id: string;
    title: string;
    impact: string;
    status: string;
    ownerName: string;
    seatId: string | null;
    seatName: string | null;
  }[];
  risksBySeat: {
    seatId: string;
    seatName: string;
    openCount: number;
    escalatedCount: number;
    criticalCount: number;
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
  seatsMissingMeetings: string[];
  seatsRepeatedlyAbsent: string[];
}

export interface LeadershipScorecardException {
  id: string;
  metricName: string;
  target: number | null;
  actual: number | null;
  variance: number;
  trend: 'up' | 'down' | 'stable';
  unit: string;
  seatId: string | null;
  seatName: string | null;
}

export interface LeadershipAccountabilityGap {
  type: 'unowned_seat' | 'overloaded_owner' | 'gwc_issue';
  seatId: string;
  seatName: string;
  ownerName?: string;
  detail: string;
  link: string;
}

export interface UnassignedAccountabilityItem {
  id: string;
  type: 'rock' | 'risk' | 'opportunity' | 'metric';
  title: string;
  ageInDays: number;
  ownerName: string;
}

export interface LeadershipDashboardData {
  scorecardHealth: LeadershipScorecardHealth;
  rockStatus: LeadershipRockStatus;
  riskRadar: LeadershipRiskRadar;
  todosDiscipline: LeadershipTodosDiscipline;
  meetingDiscipline: LeadershipMeetingDiscipline;
  scorecardExceptions: LeadershipScorecardException[];
  accountabilityGaps: LeadershipAccountabilityGap[];
  unassignedItems: UnassignedAccountabilityItem[];
  seats: LeadershipSeat[];
  currentQuarter: number;
  currentYear: number;
}

/**
 * Hook for EOS Leadership Dashboard data
 * Aggregates real-time data from Scorecard, Rocks, Risks, Meetings, Todos
 * ALL signals are now traceable to Accountability Chart seats
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
      const thirtyDaysAgo = subDays(now, 30);

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
        seatAssignmentsResult,
        usersResult,
        qcFitResult,
      ] = await Promise.all([
        supabase
          .from('eos_scorecard_metrics')
          .select('id, name, target_value, unit, is_active, owner_id')
          .eq('tenant_id', VIVACITY_TENANT_ID)
          .eq('is_active', true),
        supabase
          .from('eos_scorecard_entries')
          .select('id, metric_id, value, week_ending')
          .eq('tenant_id', VIVACITY_TENANT_ID)
          .gte('week_ending', subWeeks(now, 2).toISOString()),
        supabase
          .from('eos_rocks')
          .select('id, title, owner_id, status, updated_at, quarter_year, quarter_number, seat_id, seat_owner_user_id, created_at')
          .eq('tenant_id', VIVACITY_TENANT_ID)
          .eq('quarter_year', currentYear)
          .eq('quarter_number', currentQuarter),
        supabase
          .from('eos_issues')
          .select('id, title, item_type, impact, status, assigned_to, escalated_at, linked_rock_id, created_at')
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
          .select('meeting_id, attendance_status, user_id'),
        supabase
          .from('accountability_seats')
          .select('id, seat_name, function_id')
          .eq('tenant_id', VIVACITY_TENANT_ID),
        supabase
          .from('accountability_seat_assignments')
          .select('seat_id, user_id, assignment_type, end_date')
          .eq('tenant_id', VIVACITY_TENANT_ID)
          .is('end_date', null), // Only active assignments
        supabase
          .from('users')
          .select('user_uuid, first_name, last_name')
          .eq('tenant_id', VIVACITY_TENANT_ID),
        supabase
          .from('eos_qc_fit')
          .select('seat_id, gets_it, wants_it, capacity, qc_id'),
      ]);

      const metrics = metricsResult.data || [];
      const entries = entriesResult.data || [];
      const rocks = rocksResult.data || [];
      const issues = issuesResult.data || [];
      const todos = todosResult.data || [];
      const meetings = meetingsResult.data || [];
      const attendees = (attendeesResult.data || []) as { meeting_id: string; attendance_status: string; user_id: string }[];
      const seats = seatsResult.data || [];
      const seatAssignments = seatAssignmentsResult.data || [];
      const users = usersResult.data || [];
      const qcFitData = qcFitResult.data || [];

      // Build seat lookup map with owner info
      const seatOwnerMap = new Map<string, string>();
      seatAssignments.forEach(a => {
        if (a.assignment_type === 'primary') {
          seatOwnerMap.set(a.seat_id, a.user_id);
        }
      });

      const seatNameMap = new Map<string, string>();
      seats.forEach(s => seatNameMap.set(s.id, s.seat_name));

      // Helper to get user name
      const getUserName = (userId: string | null | undefined): string => {
        if (!userId) return 'Unassigned';
        const user = users.find(u => u.user_uuid === userId);
        if (user && (user.first_name || user.last_name)) {
          return `${user.first_name || ''} ${user.last_name || ''}`.trim();
        }
        return 'Unknown';
      };

      // Helper to get seat name
      const getSeatName = (seatId: string | null | undefined): string | null => {
        if (!seatId) return null;
        return seatNameMap.get(seatId) || null;
      };

      // Helper to get days since creation
      const getDaysAge = (createdAt: string | null): number => {
        if (!createdAt) return 0;
        return Math.floor((now.getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
      };

      // Link rocks to seats (derive from rock.seat_id or via owner matching to seat assignments)
      const rocksWithSeats = rocks.map(rock => {
        let seatId = rock.seat_id;
        let seatName = getSeatName(seatId);
        
        // If no seat_id, try to find seat via owner
        if (!seatId && rock.owner_id) {
          const assignment = seatAssignments.find(a => a.user_id === rock.owner_id && a.assignment_type === 'primary');
          if (assignment) {
            seatId = assignment.seat_id;
            seatName = getSeatName(seatId);
          }
        }
        
        return {
          ...rock,
          seatId,
          seatName,
        };
      });

      // Link issues to seats (via assigned_to user)
      const issuesWithSeats = issues.map(issue => {
        let seatId: string | null = null;
        let seatName: string | null = null;
        
        if (issue.assigned_to) {
          const assignment = seatAssignments.find(a => a.user_id === issue.assigned_to && a.assignment_type === 'primary');
          if (assignment) {
            seatId = assignment.seat_id;
            seatName = getSeatName(seatId);
          }
        }
        
        return {
          ...issue,
          seatId,
          seatName,
          ageInDays: getDaysAge(issue.created_at),
        };
      });

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
        trendVsLastWeek: 0,
        seatsAtRisk: 0, // Will calculate below
      };

      // Calculate Rock Status with seat grouping
      const onTrackRocks = rocksWithSeats.filter(r => r.status === 'On_Track');
      const offTrackRocks = rocksWithSeats.filter(r => r.status === 'Off_Track');
      const atRiskRocks = rocksWithSeats.filter(r => r.status === 'At_Risk');
      const completedRocks = rocksWithSeats.filter(r => r.status === 'Complete');

      // Group rocks by seat
      const rocksBySeatMap = new Map<string, { onTrack: number; atRisk: number; offTrack: number; completed: number; total: number; ownerUserId: string | null }>();
      rocksWithSeats.forEach(rock => {
        const seatId = rock.seatId || 'unassigned';
        const current = rocksBySeatMap.get(seatId) || { onTrack: 0, atRisk: 0, offTrack: 0, completed: 0, total: 0, ownerUserId: null };
        current.total++;
        if (rock.status === 'On_Track') current.onTrack++;
        if (rock.status === 'At_Risk') current.atRisk++;
        if (rock.status === 'Off_Track') current.offTrack++;
        if (rock.status === 'Complete') current.completed++;
        if (!current.ownerUserId && rock.seat_owner_user_id) current.ownerUserId = rock.seat_owner_user_id;
        rocksBySeatMap.set(seatId, current);
      });

      const rocksBySeat = Array.from(rocksBySeatMap.entries())
        .filter(([seatId]) => seatId !== 'unassigned')
        .map(([seatId, data]) => ({
          seatId,
          seatName: getSeatName(seatId) || 'Unknown Seat',
          ownerName: getUserName(seatOwnerMap.get(seatId) || data.ownerUserId),
          ...data,
        }))
        .sort((a, b) => (b.offTrack + b.atRisk) - (a.offTrack + a.atRisk));

      const seatsWithMultipleOffTrack = rocksBySeat.filter(s => s.offTrack >= 2).length;

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
        seatsWithMultipleOffTrack,
        rocks: rocksWithSeats
          .sort((a, b) => {
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
            status: rock.status || 'Not_Started',
            updatedAt: rock.updated_at || rock.created_at || new Date().toISOString(),
            linkedRisksCount: rockRiskCounts.get(rock.id) || 0,
            seatId: rock.seatId,
            seatName: rock.seatName,
          })),
        rocksBySeat,
      };

      // Calculate Risk Radar with seat grouping
      const openStatuses = ['Open', 'open', 'Discussing', 'discussing', 'In Review', 'Actioning'];
      const openIssues = issuesWithSeats.filter(i => openStatuses.includes(i.status));
      const escalatedIssues = issuesWithSeats.filter(i => i.escalated_at);
      const risks = issuesWithSeats.filter(i => i.item_type === 'risk');
      const opportunities = issuesWithSeats.filter(i => i.item_type === 'opportunity');

      // Group risks by seat
      const risksBySeatMap = new Map<string, { openCount: number; escalatedCount: number; criticalCount: number }>();
      risks.filter(r => openStatuses.includes(r.status) || r.escalated_at).forEach(risk => {
        const seatId = risk.seatId || 'unassigned';
        const current = risksBySeatMap.get(seatId) || { openCount: 0, escalatedCount: 0, criticalCount: 0 };
        current.openCount++;
        if (risk.escalated_at) current.escalatedCount++;
        if (risk.impact === 'Critical') current.criticalCount++;
        risksBySeatMap.set(seatId, current);
      });

      const risksBySeat = Array.from(risksBySeatMap.entries())
        .filter(([seatId]) => seatId !== 'unassigned')
        .map(([seatId, data]) => ({
          seatId,
          seatName: getSeatName(seatId) || 'Unknown Seat',
          ...data,
        }))
        .sort((a, b) => (b.escalatedCount + b.criticalCount) - (a.escalatedCount + a.criticalCount));

      // Count seats with critical risks >30 days
      const seatsWithCriticalRisks = risks
        .filter(r => r.impact === 'Critical' && r.ageInDays > 30)
        .reduce((set, r) => {
          if (r.seatId) set.add(r.seatId);
          return set;
        }, new Set<string>()).size;

      const riskRadar: LeadershipRiskRadar = {
        openRisks: openIssues.filter(i => i.item_type === 'risk').length,
        escalatedCount: escalatedIssues.length,
        seatsWithCriticalRisks,
        topRisks: risks
          .filter(r => openStatuses.includes(r.status) || r.escalated_at)
          .sort((a, b) => {
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
            seatId: r.seatId,
            seatName: r.seatName,
            ageInDays: r.ageInDays,
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
            seatId: o.seatId,
            seatName: o.seatName,
          })),
        risksBySeat,
      };

      // Calculate Todos Discipline
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

      // Calculate Meeting Discipline with seat tracking
      const lastL10Attendees = lastCompletedL10 
        ? attendees.filter(a => a.meeting_id === lastCompletedL10.id)
        : [];
      const presentAttendees = lastL10Attendees.filter(a => a.attendance_status === 'Present');
      
      const quarterlyMeetings = meetings.filter(m => m.meeting_type === 'Quarterly');
      const hasCompletedQuarterly = quarterlyMeetings.some(m => m.is_complete || m.status === 'completed');
      const hasScheduledQuarterly = quarterlyMeetings.some(m => !m.is_complete && m.status !== 'cancelled');

      const twoWeeksAgo = subWeeks(now, 2);
      const recentL10 = l10Meetings.find(m => new Date(m.scheduled_date) >= twoWeeksAgo);
      const missedL10 = !recentL10;

      // Track absent seats (seats whose owners were absent)
      const absentUserIds = lastL10Attendees
        .filter(a => a.attendance_status !== 'Present')
        .map(a => a.user_id);
      
      const seatsRepeatedlyAbsent = Array.from(seatOwnerMap.entries())
        .filter(([seatId, userId]) => absentUserIds.includes(userId))
        .map(([seatId]) => getSeatName(seatId) || 'Unknown Seat');

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
        seatsMissingMeetings: [],
        seatsRepeatedlyAbsent,
      };

      // Calculate Scorecard Exceptions with seat linkage
      const scorecardExceptions: LeadershipScorecardException[] = thisWeekEntries
        .map(entry => {
          const metric = metrics.find(m => m.id === entry.metric_id);
          if (!metric || !metric.target_value) return null;
          
          const variance = entry.value - metric.target_value;
          const isOffTrack = entry.value < metric.target_value;
          
          if (!isOffTrack) return null;
          
          const lastWeekEntry = lastWeekEntries.find(e => e.metric_id === entry.metric_id);
          let trend: 'up' | 'down' | 'stable' = 'stable';
          if (lastWeekEntry) {
            if (entry.value > lastWeekEntry.value) trend = 'up';
            else if (entry.value < lastWeekEntry.value) trend = 'down';
          }

          // Link metric to seat via owner
          let seatId: string | null = null;
          let seatName: string | null = null;
          if (metric.owner_id) {
            const assignment = seatAssignments.find(a => a.user_id === metric.owner_id && a.assignment_type === 'primary');
            if (assignment) {
              seatId = assignment.seat_id;
              seatName = getSeatName(seatId);
            }
          }

          return {
            id: entry.id,
            metricName: metric.name,
            target: metric.target_value,
            actual: entry.value,
            variance,
            trend,
            unit: metric.unit || '',
            seatId,
            seatName,
          };
        })
        .filter((e): e is LeadershipScorecardException => e !== null);

      // Find accountability gaps
      const accountabilityGaps: LeadershipAccountabilityGap[] = [];
      
      // 1. Unowned seats (no primary assignment)
      seats.forEach(seat => {
        if (!seatOwnerMap.has(seat.id)) {
          accountabilityGaps.push({
            type: 'unowned_seat',
            seatId: seat.id,
            seatName: seat.seat_name,
            detail: 'No primary owner assigned',
            link: '/eos/accountability',
          });
        }
      });

      // 2. Overloaded owners (user owns >2 key seats)
      const ownerSeatCount = new Map<string, string[]>();
      seatAssignments.filter(a => a.assignment_type === 'primary').forEach(a => {
        const current = ownerSeatCount.get(a.user_id) || [];
        current.push(a.seat_id);
        ownerSeatCount.set(a.user_id, current);
      });

      ownerSeatCount.forEach((seatIds, userId) => {
        if (seatIds.length > 2) {
          seatIds.forEach(seatId => {
            accountabilityGaps.push({
              type: 'overloaded_owner',
              seatId,
              seatName: getSeatName(seatId) || 'Unknown',
              ownerName: getUserName(userId),
              detail: `Owner manages ${seatIds.length} seats`,
              link: '/eos/accountability',
            });
          });
        }
      });

      // 3. GWC issues from quarterly conversations
      const gwcIssueSeats = new Set<string>();
      qcFitData.forEach(fit => {
        if (fit.seat_id && (fit.gets_it === false || fit.wants_it === false || fit.capacity === false)) {
          gwcIssueSeats.add(fit.seat_id);
        }
      });

      gwcIssueSeats.forEach(seatId => {
        const fit = qcFitData.find(f => f.seat_id === seatId);
        const issues: string[] = [];
        if (fit?.gets_it === false) issues.push('G');
        if (fit?.wants_it === false) issues.push('W');
        if (fit?.capacity === false) issues.push('C');

        accountabilityGaps.push({
          type: 'gwc_issue',
          seatId,
          seatName: getSeatName(seatId) || 'Unknown',
          ownerName: getUserName(seatOwnerMap.get(seatId)),
          detail: `GWC concern: ${issues.join(', ')} flagged`,
          link: '/eos/qc',
        });
      });

      // Collect unassigned items (items without seat linkage)
      const unassignedItems: UnassignedAccountabilityItem[] = [];

      // Rocks without seats
      rocksWithSeats.filter(r => !r.seatId).forEach(rock => {
        unassignedItems.push({
          id: rock.id,
          type: 'rock',
          title: rock.title,
          ageInDays: getDaysAge(rock.created_at),
          ownerName: getUserName(rock.owner_id),
        });
      });

      // Issues without seats
      issuesWithSeats.filter(i => !i.seatId && openStatuses.includes(i.status)).forEach(issue => {
        unassignedItems.push({
          id: issue.id,
          type: issue.item_type === 'risk' ? 'risk' : 'opportunity',
          title: issue.title,
          ageInDays: issue.ageInDays,
          ownerName: getUserName(issue.assigned_to),
        });
      });

      // Build comprehensive seat data
      const leadershipSeats: LeadershipSeat[] = seats.map(seat => {
        const ownerUserId = seatOwnerMap.get(seat.id) || null;
        const seatRocks = rocksWithSeats.filter(r => r.seatId === seat.id);
        const seatRisks = issuesWithSeats.filter(i => i.seatId === seat.id && i.item_type === 'risk');
        
        return {
          id: seat.id,
          seatName: seat.seat_name,
          ownerUserId,
          ownerName: getUserName(ownerUserId),
          rocksCount: seatRocks.length,
          onTrackRocks: seatRocks.filter(r => r.status === 'On_Track').length,
          offTrackRocks: seatRocks.filter(r => r.status === 'Off_Track').length,
          atRiskRocks: seatRocks.filter(r => r.status === 'At_Risk').length,
          openRisksCount: seatRisks.filter(r => openStatuses.includes(r.status)).length,
          escalatedRisksCount: seatRisks.filter(r => r.escalated_at).length,
          criticalRisksAge30Days: seatRisks.filter(r => r.impact === 'Critical' && r.ageInDays > 30).length,
          isOverloaded: (ownerSeatCount.get(ownerUserId || '') || []).length > 2,
          hasGwcIssues: gwcIssueSeats.has(seat.id),
        };
      });

      // Update seatsAtRisk count
      scorecardHealth.seatsAtRisk = leadershipSeats.filter(s => 
        s.offTrackRocks > 0 || s.escalatedRisksCount > 0 || s.hasGwcIssues
      ).length;

      return {
        scorecardHealth,
        rockStatus,
        riskRadar,
        todosDiscipline,
        meetingDiscipline,
        scorecardExceptions,
        accountabilityGaps,
        unassignedItems,
        seats: leadershipSeats,
        currentQuarter,
        currentYear,
      };
    },
    enabled: isSuper || profile?.unicorn_role === 'Team Leader',
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: true,
  });
}

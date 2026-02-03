import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useRBAC } from '@/hooks/useRBAC';
import { useAuth } from '@/hooks/useAuth';
import { useLeadershipDashboard } from '@/hooks/useLeadershipDashboard';
import { useSeatSuccession } from '@/hooks/useSeatSuccession';
import { useNextMeeting } from '@/hooks/useNextMeeting';
import { 
  LeadershipKPICards,
  LeadershipRocksTable,
  LeadershipScorecardExceptions,
  LeadershipRiskRadar,
  LeadershipMeetingDiscipline,
  SeatDrillDownPanel,
  UnassignedAccountability,
  LeadershipAccountabilityGaps,
  LeadershipFilters,
  AccountabilityCoveragePanel,
  MeetingExecutionPanel,
  IDSMasterPanel,
  ClientImpactPanel,
  SeatRebalancingPanel,
  LeadershipSuccessionRisks,
  NextMeetingCard,
  type DateRangeFilter,
  type MeetingTypeFilter,
  type SeatFilter,
  type MeetingSeriesData,
  type IDSSummary,
  type ClientImpactItem,
  type RebalancingRecommendation,
} from '@/components/eos/leadership';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, AlertTriangle, LayoutDashboard, Users, Calendar, FileText } from 'lucide-react';
import { subDays } from 'date-fns';

export default function EosLeadershipDashboard() {
  const { isSuperAdmin, hasPermission, canAccessEOS } = useRBAC();
  const { profile } = useAuth();
  const isSuper = isSuperAdmin;
  const isTeamLeader = hasPermission('eos_meetings:schedule');
  const isTeamMember = profile?.unicorn_role === 'Team Member';

  // Block client access to EOS
  if (!canAccessEOS()) {
    return <Navigate to="/dashboard" replace />;
  }

  // Team members get limited view
  if (!isSuper && !isTeamLeader && !isTeamMember) {
    return <Navigate to="/eos/overview" replace />;
  }

  return (
    <DashboardLayout>
      <LeadershipContent 
        isSuper={isSuper} 
        isTeamLeader={isTeamLeader}
        isTeamMember={isTeamMember}
        currentUserId={profile?.user_uuid}
      />
    </DashboardLayout>
  );
}

interface LeadershipContentProps {
  isSuper: boolean;
  isTeamLeader: boolean;
  isTeamMember: boolean;
  currentUserId?: string;
}

function LeadershipContent({ isSuper, isTeamLeader, isTeamMember, currentUserId }: LeadershipContentProps) {
  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  
  // Filter state
  const [dateRange, setDateRange] = useState<DateRangeFilter>('this_week');
  const [meetingType, setMeetingType] = useState<MeetingTypeFilter>('all');
  const [seatFilter, setSeatFilter] = useState<SeatFilter>(isTeamMember ? 'my_seats' : 'all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const { data, isLoading, error } = useLeadershipDashboard({
    year: dateRange === 'custom' ? selectedYear : currentYear,
    quarter: dateRange === 'custom' ? selectedQuarter : currentQuarter,
  });
  
  // Get next meeting data
  const { data: nextMeeting, isLoading: nextMeetingLoading } = useNextMeeting();
  
  // Get succession data
  const { successionRisks, seatsWithActiveCover } = useSeatSuccession();

  // Filter seats based on current user for Team Members
  const filteredSeats = useMemo(() => {
    if (!data?.seats) return [];
    let seats = data.seats;
    
    if (seatFilter === 'my_seats' && currentUserId) {
      seats = seats.filter(s => s.ownerUserId === currentUserId);
    } else if (seatFilter === 'uncovered') {
      seats = seats.filter(s => !s.ownerUserId);
    }
    
    if (ownerFilter !== 'all') {
      seats = seats.filter(s => s.ownerUserId === ownerFilter);
    }
    
    return seats;
  }, [data?.seats, seatFilter, ownerFilter, currentUserId]);

  const selectedSeat = data?.seats.find(s => s.id === selectedSeatId) || null;

  // Build meeting series data from the dashboard data
  const meetingSeries: MeetingSeriesData[] = useMemo(() => {
    if (!data) return [];
    
    // Build series from meeting discipline data
    const series: MeetingSeriesData[] = [
      {
        type: 'L10',
        label: 'Level 10 Weekly',
        nextMeeting: null, // Would need additional query
        lastMeeting: data.meetingDiscipline.lastL10Date ? {
          id: 'last-l10',
          date: data.meetingDiscipline.lastL10Date,
          attendanceRate: data.meetingDiscipline.lastL10AttendancePercentage,
          quorumMet: data.meetingDiscipline.quorumMet,
          minutesStatus: 'final',
          todosCreated: data.meetingDiscipline.actionsCreated,
          idsAdded: 0,
        } : null,
      },
      {
        type: 'Quarterly',
        label: 'Quarterly Planning',
        nextMeeting: data.meetingDiscipline.quarterlyMeetingStatus === 'scheduled' ? {
          id: 'next-quarterly',
          date: new Date().toISOString(),
          status: 'scheduled',
        } : null,
        lastMeeting: data.meetingDiscipline.quarterlyMeetingStatus === 'completed' ? {
          id: 'last-quarterly',
          date: new Date().toISOString(),
          attendanceRate: 100,
          quorumMet: true,
          minutesStatus: 'final',
          todosCreated: 0,
          idsAdded: 0,
        } : null,
      },
    ];
    
    return meetingType === 'all' ? series : series.filter(s => s.type === meetingType);
  }, [data, meetingType]);

  // Build IDS summary
  const idsSummary: IDSSummary = useMemo(() => {
    if (!data) return { newThisWeek: 0, escalatedCount: 0, criticalImpact: 0, stuckOver14Days: 0, recentItems: [] };
    
    const sevenDaysAgo = subDays(new Date(), 7);
    const fourteenDaysAgo = subDays(new Date(), 14);
    
    return {
      newThisWeek: data.riskRadar.topRisks.filter(r => r.ageInDays <= 7).length +
                   data.riskRadar.topOpportunities.filter(o => true).length, // Would need age data
      escalatedCount: data.riskRadar.escalatedCount,
      criticalImpact: data.riskRadar.topRisks.filter(r => r.impact === 'Critical').length,
      stuckOver14Days: data.riskRadar.topRisks.filter(r => r.ageInDays > 14 && !r.isEscalated).length,
      recentItems: [
        ...data.riskRadar.topRisks.map(r => ({
          id: r.id,
          title: r.title,
          type: 'risk' as const,
          impact: r.impact,
          status: r.status,
          isEscalated: r.isEscalated,
          isStuck: r.ageInDays > 14,
          ageInDays: r.ageInDays,
          seatName: r.seatName,
          ownerName: r.ownerName,
        })),
        ...data.riskRadar.topOpportunities.slice(0, 2).map(o => ({
          id: o.id,
          title: o.title,
          type: 'opportunity' as const,
          impact: o.impact,
          status: o.status,
          isEscalated: false,
          isStuck: false,
          ageInDays: 0,
          seatName: o.seatName,
          ownerName: o.ownerName,
        })),
      ].sort((a, b) => {
        if (a.isEscalated && !b.isEscalated) return -1;
        if (!a.isEscalated && b.isEscalated) return 1;
        return b.ageInDays - a.ageInDays;
      }).slice(0, 5),
    };
  }, [data]);

  // Build rebalancing recommendations
  const rebalancingRecommendations: RebalancingRecommendation[] = useMemo(() => {
    if (!data) return [];
    
    const recommendations: RebalancingRecommendation[] = [];
    
    // Find uncovered seats
    data.accountabilityGaps
      .filter(g => g.type === 'unowned_seat')
      .forEach(gap => {
        // Find candidates - team members with fewest seats
        const candidates = data.seats
          .filter(s => s.ownerUserId)
          .reduce((acc, seat) => {
            if (!acc.find(c => c.userId === seat.ownerUserId)) {
              const seatCount = data.seats.filter(s => s.ownerUserId === seat.ownerUserId).length;
              acc.push({
                userId: seat.ownerUserId!,
                userName: seat.ownerName,
                currentSeatCount: seatCount,
                rationale: seatCount <= 1 ? 'Low seat count' : 'Available capacity',
              });
            }
            return acc;
          }, [] as { userId: string; userName: string; currentSeatCount: number; rationale: string }[])
          .sort((a, b) => a.currentSeatCount - b.currentSeatCount)
          .slice(0, 3);
          
        recommendations.push({
          type: 'uncovered_seat',
          seatId: gap.seatId,
          seatName: gap.seatName,
          reason: 'This seat has no primary owner assigned',
          candidates,
        });
      });
    
    // Find overloaded owners
    const overloadedOwners = new Map<string, string[]>();
    data.accountabilityGaps
      .filter(g => g.type === 'overloaded_owner')
      .forEach(gap => {
        if (gap.ownerName) {
          const existing = overloadedOwners.get(gap.ownerName) || [];
          existing.push(gap.seatId);
          overloadedOwners.set(gap.ownerName, existing);
        }
      });
    
    overloadedOwners.forEach((seatIds, ownerName) => {
      // Only add one recommendation per overloaded owner
      const ownerSeats = data.seats.filter(s => seatIds.includes(s.id));
      const seatsToReassign = ownerSeats
        .map(s => ({
          seatId: s.id,
          seatName: s.seatName,
          activityScore: s.rocksCount + s.openRisksCount,
          rationale: s.rocksCount === 0 ? 'No active rocks' : 'Lower activity',
        }))
        .sort((a, b) => a.activityScore - b.activityScore)
        .slice(0, 3);
        
      if (seatsToReassign.length > 0) {
        recommendations.push({
          type: 'overloaded_owner',
          seatId: seatIds[0],
          seatName: `${ownerName}'s Seats`,
          reason: `${ownerName} owns ${seatIds.length} seats (recommended max: 3)`,
          seatsToReassign,
        });
      }
    });
    
    return recommendations;
  }, [data]);

  // Client impact - would need client-linked data
  const clientImpactItems: ClientImpactItem[] = [];

  const handleSeatClick = (seatId: string) => {
    setSelectedSeatId(seatId);
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Failed to load leadership dashboard: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <h1 className="text-3xl font-bold">EOS Leadership Dashboard</h1>
            </div>
            <p className="text-muted-foreground mt-1">
              Single view of seats, meetings, execution, and IDS
            </p>
          </div>
        </div>

        {/* Filters */}
        <LeadershipFilters
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          meetingType={meetingType}
          onMeetingTypeChange={setMeetingType}
          seatFilter={seatFilter}
          onSeatFilterChange={setSeatFilter}
          ownerFilter={ownerFilter}
          onOwnerFilterChange={setOwnerFilter}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          selectedQuarter={selectedQuarter}
          onQuarterChange={setSelectedQuarter}
        />
      </div>

      {isLoading ? (
        <LeadershipSkeleton />
      ) : data ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview" className="flex items-center gap-1.5">
              <LayoutDashboard className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="accountability" className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              Accountability
            </TabsTrigger>
            <TabsTrigger value="meetings" className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Meetings
            </TabsTrigger>
            <TabsTrigger value="ids" className="flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              IDS
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            {/* Row 1: Next Meeting + IDS Command Center */}
            <div className="grid lg:grid-cols-2 gap-6">
              <NextMeetingCard meeting={nextMeeting} isLoading={nextMeetingLoading} />
              <IDSMasterPanel summary={idsSummary} />
            </div>

            <LeadershipKPICards
              scorecardHealth={data.scorecardHealth}
              rockStatus={data.rockStatus}
              riskRadar={data.riskRadar}
              todosDiscipline={data.todosDiscipline}
            />

            <UnassignedAccountability items={data.unassignedItems} />

            {/* Row 2: Rocks + Scorecard */}
            <div className="grid lg:grid-cols-2 gap-6">
              <LeadershipRocksTable rockStatus={data.rockStatus} onSeatClick={handleSeatClick} />
              <LeadershipScorecardExceptions exceptions={data.scorecardExceptions} />
            </div>

            {/* Row 3: Accountability Chart status */}
            <LeadershipAccountabilityGaps gaps={data.accountabilityGaps} />

            <LeadershipRiskRadar riskRadar={data.riskRadar} onSeatClick={handleSeatClick} />

            <div className="grid lg:grid-cols-2 gap-6">
              <LeadershipMeetingDiscipline meetingDiscipline={data.meetingDiscipline} />
              <LeadershipSuccessionRisks
                risks={successionRisks}
                seatsWithActiveCover={seatsWithActiveCover}
                onSeatClick={handleSeatClick}
              />
            </div>
          </TabsContent>

          {/* Accountability Tab */}
          <TabsContent value="accountability" className="space-y-6 mt-6">
            <AccountabilityCoveragePanel 
              seats={filteredSeats}
              gaps={data.accountabilityGaps}
              onSeatClick={handleSeatClick}
            />

            <SeatRebalancingPanel 
              recommendations={rebalancingRecommendations}
              seats={data.seats}
            />

            <LeadershipSuccessionRisks
              risks={successionRisks}
              seatsWithActiveCover={seatsWithActiveCover}
              onSeatClick={handleSeatClick}
            />

            <LeadershipAccountabilityGaps gaps={data.accountabilityGaps} />
          </TabsContent>

          {/* Meetings Tab */}
          <TabsContent value="meetings" className="space-y-6 mt-6">
            <NextMeetingCard meeting={nextMeeting} isLoading={nextMeetingLoading} />

            <MeetingExecutionPanel meetingSeries={meetingSeries} />

            <LeadershipMeetingDiscipline meetingDiscipline={data.meetingDiscipline} />
          </TabsContent>

          {/* IDS Tab */}
          <TabsContent value="ids" className="space-y-6 mt-6">
            <IDSMasterPanel summary={idsSummary} />

            <LeadershipRiskRadar riskRadar={data.riskRadar} onSeatClick={handleSeatClick} />

            {/* Client Impact - Read-only summaries */}
            <ClientImpactPanel items={clientImpactItems} />
          </TabsContent>
        </Tabs>
      ) : null}

      {/* Seat Drill-Down Panel */}
      {data && (
        <SeatDrillDownPanel
          seat={selectedSeat}
          isOpen={!!selectedSeatId}
          onClose={() => setSelectedSeatId(null)}
          rockStatus={data.rockStatus}
          riskRadar={data.riskRadar}
          meetingDiscipline={data.meetingDiscipline}
        />
      )}
    </div>
  );
}

function LeadershipSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (<Skeleton key={i} className="h-32" />))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-40" />
    </div>
  );
}

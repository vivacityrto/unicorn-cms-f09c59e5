import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useRBAC } from '@/hooks/useRBAC';
import { useLeadershipDashboard } from '@/hooks/useLeadershipDashboard';
import { 
  LeadershipKPICards,
  LeadershipRocksTable,
  LeadershipScorecardExceptions,
  LeadershipRiskRadar,
  LeadershipMeetingDiscipline,
} from '@/components/eos/leadership';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, AlertTriangle } from 'lucide-react';

export default function EosLeadershipDashboard() {
  const { isSuperAdmin, hasPermission } = useRBAC();
  const isSuper = isSuperAdmin;
  const isTeamLeader = hasPermission('eos_meetings:schedule'); // Team Leaders have this

  // Access check: Only Super Admin and Team Leader
  if (!isSuper && !isTeamLeader) {
    return <Navigate to="/eos/overview" replace />;
  }

  return (
    <DashboardLayout>
      <LeadershipContent />
    </DashboardLayout>
  );
}

function LeadershipContent() {
  const currentYear = new Date().getFullYear();
  const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
  
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);

  const { data, isLoading, error } = useLeadershipDashboard({
    year: selectedYear,
    quarter: selectedQuarter,
  });

  const years = [currentYear - 1, currentYear, currentYear + 1];
  const quarters = [1, 2, 3, 4];

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-bold">EOS Leadership Dashboard</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Weekly execution health across priorities, scorecard, and risks
          </p>
        </div>

        {/* Quarter Selector */}
        <div className="flex items-center gap-2">
          <Select
            value={selectedQuarter.toString()}
            onValueChange={(v) => setSelectedQuarter(parseInt(v))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {quarters.map((q) => (
                <SelectItem key={q} value={q.toString()}>
                  Q{q}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedYear.toString()}
            onValueChange={(v) => setSelectedYear(parseInt(v))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <LeadershipSkeleton />
      ) : data ? (
        <>
          {/* Section 1: Execution Health Snapshot - KPI Cards */}
          <LeadershipKPICards
            scorecardHealth={data.scorecardHealth}
            rockStatus={data.rockStatus}
            riskRadar={data.riskRadar}
            todosDiscipline={data.todosDiscipline}
          />

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Section 2: Quarterly Rocks Overview */}
            <LeadershipRocksTable rockStatus={data.rockStatus} />

            {/* Section 3: Scorecard Exceptions */}
            <LeadershipScorecardExceptions exceptions={data.scorecardExceptions} />
          </div>

          {/* Section 4: Risks & Opportunities Radar */}
          <LeadershipRiskRadar riskRadar={data.riskRadar} />

          {/* Section 5: Meeting Discipline */}
          <LeadershipMeetingDiscipline meetingDiscipline={data.meetingDiscipline} />
        </>
      ) : null}
    </div>
  );
}

function LeadershipSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
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

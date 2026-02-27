/**
 * WeeklyWinTracker – Unicorn 2.0
 *
 * Compact card showing week-to-date wins for the consultant.
 * Internal only.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, Target, FileText, Users, Clock } from 'lucide-react';
import { useWeeklyWins } from '@/hooks/useWeeklyWins';

interface WeeklyWinTrackerProps {
  userUuid: string | null;
  className?: string;
}

export function WeeklyWinTracker({ userUuid, className }: WeeklyWinTrackerProps) {
  const { data: wins, isLoading } = useWeeklyWins(userUuid);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  const metrics = [
    { icon: Target, label: 'Rocks Closed', value: wins?.rocks_closed ?? 0 },
    { icon: Trophy, label: 'Stages Completed', value: wins?.phases_completed ?? 0 },
    { icon: FileText, label: 'Docs Generated', value: wins?.documents_generated ?? 0 },
    { icon: Users, label: 'Clients Advanced', value: wins?.clients_moved_forward ?? 0 },
    { icon: Clock, label: 'Hours Logged', value: wins?.hours_logged ?? 0, suffix: 'h' },
  ];

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-brand-macaron" />
          <CardTitle className="text-base">This Week</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <m.icon className="h-3.5 w-3.5" />
              <span>{m.label}</span>
            </div>
            <span className="text-sm font-semibold text-foreground">
              {m.value}{m.suffix ?? ''}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

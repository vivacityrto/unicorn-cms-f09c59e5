import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useConsultantCapacityOverview, ConsultantCapacityRow } from '@/hooks/useCapacityEngine';
import { Users, AlertTriangle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';

function getCapacityColor(load: number, assignable: number): string {
  if (assignable <= 0) return 'text-muted-foreground';
  const pct = (load / assignable) * 100;
  if (pct > 100) return 'text-red-600 dark:text-red-400';
  if (pct >= 70) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function getProgressVariant(load: number, assignable: number): string {
  if (assignable <= 0) return 'bg-muted';
  const pct = (load / assignable) * 100;
  if (pct > 100) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-green-500';
}

export function ConsultantCapacityTable() {
  const { data: consultants, isLoading, error } = useConsultantCapacityOverview();

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-48" /></CardHeader>
        <CardContent><Skeleton className="h-48 w-full" /></CardContent>
      </Card>
    );
  }

  if (error || !consultants) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Unable to load capacity data.
        </CardContent>
      </Card>
    );
  }

  // Filter to consultants with assignable hours > 0
  const active = consultants.filter((c: ConsultantCapacityRow) => c.weekly_assignable_hours > 0);
  const overloaded = active.filter((c: ConsultantCapacityRow) => c.overload).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Consultant Capacity Overview
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {active.length} active
            </Badge>
            {overloaded > 0 && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="h-3 w-3" />
                {overloaded} over capacity
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Consultant</TableHead>
                <TableHead className="text-right">Assignable</TableHead>
                <TableHead className="text-right">Current Load</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Clients</TableHead>
                <TableHead className="w-[120px]">Utilisation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active
                .sort((a: ConsultantCapacityRow, b: ConsultantCapacityRow) => a.remaining_capacity - b.remaining_capacity)
                .map((c: ConsultantCapacityRow) => {
                  const pct = c.weekly_assignable_hours > 0 
                    ? Math.min((c.current_load / c.weekly_assignable_hours) * 100, 150)
                    : 0;
                  const colorClass = getCapacityColor(c.current_load, c.weekly_assignable_hours);
                  const progressClass = getProgressVariant(c.current_load, c.weekly_assignable_hours);

                  return (
                    <TableRow key={c.user_uuid}>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">
                            {c.first_name} {c.last_name}
                          </p>
                          {c.job_title && (
                            <p className="text-xs text-muted-foreground">{c.job_title}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {c.weekly_assignable_hours.toFixed(1)}h
                      </TableCell>
                      <TableCell className={`text-right text-sm font-medium ${colorClass}`}>
                        {c.current_load.toFixed(1)}h
                      </TableCell>
                      <TableCell className={`text-right text-sm font-medium ${colorClass}`}>
                        {c.remaining_capacity.toFixed(1)}h
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {c.active_clients}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={Math.min(pct, 100)} 
                            className="h-2 flex-1"
                            indicatorClassName={progressClass}
                          />
                          {c.overload && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

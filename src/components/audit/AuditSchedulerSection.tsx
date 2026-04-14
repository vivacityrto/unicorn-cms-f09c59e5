import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronDown, ChevronUp, Play } from 'lucide-react';
import { useAuditSchedule, type AuditScheduleRow } from '@/hooks/useAuditScheduler';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface AuditSchedulerSectionProps {
  onStartCHC: (tenantId: number, tenantName: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  overdue: { label: 'Overdue', className: 'bg-red-100 text-red-700 border-red-200' },
  due_soon: { label: 'Due soon', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  never_audited: { label: 'Never audited', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  in_progress: { label: 'In progress', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  on_track: { label: 'On track', className: 'bg-green-100 text-green-700 border-green-200' },
};

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
  critical: 'bg-red-200 text-red-900',
};

export function AuditSchedulerSection({ onStartCHC }: AuditSchedulerSectionProps) {
  const { data: schedule = [], isLoading } = useAuditSchedule('all');
  const navigate = useNavigate();

  const actionable = useMemo(() => schedule.filter(s => ['overdue', 'due_soon', 'never_audited'].includes(s.schedule_status)), [schedule]);
  const hasOverdue = actionable.some(s => s.schedule_status === 'overdue');
  const [expanded, setExpanded] = useState(hasOverdue);
  const [showAll, setShowAll] = useState(false);

  const overdueCount = schedule.filter(s => s.schedule_status === 'overdue').length;
  const dueSoonCount = schedule.filter(s => s.schedule_status === 'due_soon').length;
  const neverCount = schedule.filter(s => s.schedule_status === 'never_audited').length;

  const displayRows = showAll ? schedule : actionable;

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (schedule.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">Audit Scheduler</CardTitle>
            <div className="flex gap-2">
              {overdueCount > 0 && <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px]">{overdueCount} overdue</Badge>}
              {dueSoonCount > 0 && <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">{dueSoonCount} due within 90 days</Badge>}
              {neverCount > 0 && <Badge variant="outline" className="bg-gray-100 text-gray-600 text-[10px]">{neverCount} never audited</Badge>}
            </div>
          </div>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          {displayRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">All clients are on track.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>RTO ID</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Last CHC</TableHead>
                    <TableHead>Last Score</TableHead>
                    <TableHead>Next Due</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayRows.map(row => {
                    const statusCfg = STATUS_CONFIG[row.schedule_status] || STATUS_CONFIG.on_track;
                    const daysLabel = row.schedule_status === 'due_soon' && row.days_until_due != null
                      ? `Due in ${row.days_until_due}d`
                      : statusCfg.label;

                    return (
                      <TableRow key={row.tenant_id}>
                        <TableCell>
                          <button className="text-sm font-medium text-primary hover:underline" onClick={() => navigate(`/tenant/${row.tenant_id}`)}>
                            {row.client_name}
                          </button>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{row.rto_id || '—'}</TableCell>
                        <TableCell>
                          {row.client_risk_level ? (
                            <Badge variant="outline" className={cn('text-[10px]', RISK_COLORS[row.client_risk_level])}>{row.client_risk_level}</Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.last_conducted_at ? format(new Date(row.last_conducted_at), 'd MMM yyyy') : 'Never'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.last_score_pct != null ? (
                            <span className={cn(
                              'font-medium',
                              row.last_score_pct >= 80 ? 'text-green-600' : row.last_score_pct >= 60 ? 'text-amber-600' : 'text-red-600'
                            )}>
                              {row.last_score_pct}%
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.next_due_date ? (
                            <span className={cn(
                              row.schedule_status === 'overdue' && 'text-red-600 font-medium',
                              row.schedule_status === 'due_soon' && 'text-amber-600'
                            )}>
                              {format(new Date(row.next_due_date), 'd MMM yyyy')}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-[10px]', statusCfg.className)}>{daysLabel}</Badge>
                        </TableCell>
                        <TableCell>
                          {row.schedule_status !== 'in_progress' && row.schedule_status !== 'on_track' && (
                            <Button size="sm" variant="outline" onClick={() => onStartCHC(row.tenant_id, row.client_name)}>
                              <Play className="h-3 w-3 mr-1" /> Start CHC
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex justify-center pt-3">
                <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
                  {showAll ? 'Show actionable only' : `View all (${schedule.length})`}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

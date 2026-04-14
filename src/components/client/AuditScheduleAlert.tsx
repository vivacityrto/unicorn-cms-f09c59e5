import { AlertTriangle, Info, Play } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useClientAuditSchedule, getRecommendedCHCType } from '@/hooks/useAuditScheduler';
import { format } from 'date-fns';
import type { AuditType } from '@/types/clientAudits';

interface AuditScheduleAlertProps {
  tenantId: number;
  onStartCHC: (auditType?: AuditType) => void;
}

export function AuditScheduleAlert({ tenantId, onStartCHC }: AuditScheduleAlertProps) {
  const { data: schedule } = useClientAuditSchedule(tenantId);

  if (!schedule || !['overdue', 'due_soon', 'never_audited'].includes(schedule.schedule_status)) {
    return null;
  }

  const recommendedType = getRecommendedCHCType(schedule.rto_id, schedule.cricos_id);

  if (schedule.schedule_status === 'overdue') {
    return (
      <Alert className="bg-amber-50 border-amber-300">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-amber-800">
            CHC overdue — last conducted {schedule.last_conducted_at ? format(new Date(schedule.last_conducted_at), 'd MMM yyyy') : 'never'}.
          </span>
          <Button size="sm" variant="outline" onClick={() => onStartCHC(recommendedType)}>
            <Play className="h-3 w-3 mr-1" /> Start CHC
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (schedule.schedule_status === 'due_soon') {
    return (
      <Alert className="bg-yellow-50 border-yellow-300">
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <AlertDescription className="flex items-center justify-between">
          <span className="text-yellow-800">
            CHC due {schedule.next_due_date ? format(new Date(schedule.next_due_date), 'd MMM yyyy') : '—'}
            {schedule.days_until_due != null && ` (${schedule.days_until_due} days)`}.
          </span>
          <Button size="sm" variant="outline" onClick={() => onStartCHC(recommendedType)}>
            <Play className="h-3 w-3 mr-1" /> Start CHC
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="bg-blue-50/50 border-blue-200">
      <Info className="h-4 w-4 text-blue-500" />
      <AlertDescription className="flex items-center justify-between">
        <span className="text-muted-foreground">No compliance health check on record.</span>
        <Button size="sm" variant="outline" onClick={() => onStartCHC(recommendedType)}>
          <Play className="h-3 w-3 mr-1" /> Start CHC
        </Button>
      </AlertDescription>
    </Alert>
  );
}

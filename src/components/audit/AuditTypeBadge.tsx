import { Badge } from '@/components/ui/badge';
import type { AuditType } from '@/types/clientAudits';
import { AUDIT_TYPE_LABELS } from '@/types/clientAudits';
import { cn } from '@/lib/utils';

const BADGE_STYLES: Record<AuditType, string> = {
  compliance_health_check: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  cricos_chc: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',
  rto_cricos_chc: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
  mock_audit: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  cricos_mock_audit: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',
  due_diligence: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  due_diligence_combined: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
};

export function AuditTypeBadge({ type }: { type: AuditType }) {
  return (
    <Badge variant="outline" className={cn('text-[11px]', BADGE_STYLES[type])}>
      {AUDIT_TYPE_LABELS[type] || type}
    </Badge>
  );
}

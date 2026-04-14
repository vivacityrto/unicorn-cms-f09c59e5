import { Badge } from '@/components/ui/badge';
import type { AuditStatus } from '@/types/clientAudits';
import { AUDIT_STATUS_LABELS } from '@/types/clientAudits';

const variantMap: Record<AuditStatus, 'outline' | 'info' | 'warning' | 'default' | 'secondary'> = {
  draft: 'outline',
  in_progress: 'info',
  review: 'warning',
  complete: 'default',
  archived: 'secondary',
};

export function AuditStatusBadge({ status }: { status: AuditStatus }) {
  return (
    <Badge variant={variantMap[status] || 'outline'}>
      {AUDIT_STATUS_LABELS[status] || status}
    </Badge>
  );
}

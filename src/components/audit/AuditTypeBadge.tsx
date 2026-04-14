import { Badge } from '@/components/ui/badge';
import type { AuditType } from '@/types/clientAudits';
import { AUDIT_TYPE_LABELS } from '@/types/clientAudits';

const variantMap: Record<AuditType, 'info' | 'default' | 'warning'> = {
  compliance_health_check: 'info',
  mock_audit: 'default',
  due_diligence: 'warning',
};

export function AuditTypeBadge({ type }: { type: AuditType }) {
  return (
    <Badge variant={variantMap[type] || 'outline'}>
      {AUDIT_TYPE_LABELS[type] || type}
    </Badge>
  );
}

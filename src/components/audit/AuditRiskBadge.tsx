import { cn } from '@/lib/utils';
import type { AuditRisk } from '@/types/clientAudits';
import { AUDIT_RISK_LABELS } from '@/types/clientAudits';

const colorMap: Record<AuditRisk, string> = {
  low: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30',
  medium: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  high: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30',
  critical: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  extreme: 'bg-red-900 text-red-50 border-red-950',
};

export function AuditRiskBadge({ risk }: { risk: AuditRisk | null }) {
  if (!risk) return null;
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border',
      colorMap[risk]
    )}>
      {AUDIT_RISK_LABELS[risk] || risk}
    </span>
  );
}

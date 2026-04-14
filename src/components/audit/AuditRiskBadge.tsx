import { cn } from '@/lib/utils';
import type { AuditRisk } from '@/types/clientAudits';
import { AUDIT_RISK_LABELS } from '@/types/clientAudits';

const colorMap: Record<AuditRisk, string> = {
  low: 'bg-green-100 text-green-800 border-green-300',
  medium: 'bg-amber-100 text-amber-800 border-amber-300',
  high: 'bg-orange-100 text-orange-800 border-orange-300',
  critical: 'bg-red-100 text-red-800 border-red-300',
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

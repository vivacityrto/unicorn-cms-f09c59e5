import { cn } from '@/lib/utils';
import { SOURCE_CONFIG, OUTCOME_CONFIG, type AuditReferenceSource, type AuditReferenceOutcome } from '@/types/auditReferences';

export function SourceBadge({ source }: { source: AuditReferenceSource }) {
  const config = SOURCE_CONFIG[source] || SOURCE_CONFIG.other;
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', config.color)}>
      {config.label}
    </span>
  );
}

export function OutcomeBadge({ outcome }: { outcome: AuditReferenceOutcome | null }) {
  if (!outcome) return null;
  const config = OUTCOME_CONFIG[outcome] || OUTCOME_CONFIG.unknown;
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', config.color)}>
      {config.label}
    </span>
  );
}

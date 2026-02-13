/**
 * ProgressAnchors – Unicorn 2.0
 *
 * Displays 3–5 short, data-driven statements anchored to deterministic counts.
 * Every statement maps to a real system metric from v_phase_actions_remaining.
 * Supports internal and client variants.
 */

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldCheck,
  Clock,
  AlertTriangle,
  FileText,
  ListChecks,
  Target,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProgressAnchors, type ProgressAnchorData } from '@/hooks/useProgressAnchors';

interface ProgressAnchorsProps {
  tenantId: number | null;
  packageInstanceId?: number | null;
  /** 'internal' shows all anchors; 'client' uses controlled language */
  variant?: 'internal' | 'client';
  className?: string;
}

interface Anchor {
  icon: React.ElementType;
  text: string;
  color: 'purple' | 'aqua' | 'macaron' | 'fuchsia';
  priority: number; // lower = shown first
}

function buildAnchors(data: ProgressAnchorData, variant: 'internal' | 'client'): Anchor[] {
  const anchors: Anchor[] = [];

  // Stale warning (highest priority if applicable)
  if (data.is_stale) {
    anchors.push({
      icon: Clock,
      text: `Last activity ${data.days_stale} days ago.`,
      color: 'macaron',
      priority: 0,
    });
  }

  // Blocking risks
  if (data.risks_blocking > 0) {
    anchors.push({
      icon: AlertTriangle,
      text: variant === 'client'
        ? `${data.risks_blocking} item${data.risks_blocking !== 1 ? 's' : ''} require${data.risks_blocking === 1 ? 's' : ''} attention.`
        : `${data.risks_blocking} risk${data.risks_blocking !== 1 ? 's' : ''} require${data.risks_blocking === 1 ? 's' : ''} resolution.`,
      color: 'fuchsia',
      priority: 1,
    });
  }

  // Audit ready %
  anchors.push({
    icon: ShieldCheck,
    text: `You are ${data.overall_score}% Audit Ready.`,
    color: 'purple',
    priority: data.is_stale || data.risks_blocking > 0 ? 5 : 2,
  });

  // Deterministic actions remaining (checklist + approvals + meetings)
  const nonDocActions = data.checklist_remaining + data.meetings_remaining + data.approvals_remaining;
  if (nonDocActions > 0 && data.phase_name) {
    anchors.push({
      icon: ListChecks,
      text: `${nonDocActions} action${nonDocActions !== 1 ? 's' : ''} remaining in ${data.phase_name}.`,
      color: 'aqua',
      priority: 3,
    });
  }

  // Documents pending (separate from actions for clarity)
  if (data.docs_remaining > 0) {
    anchors.push({
      icon: FileText,
      text: `${data.docs_remaining} document${data.docs_remaining !== 1 ? 's' : ''} pending upload.`,
      color: data.docs_remaining > 3 ? 'macaron' : 'aqua',
      priority: 4,
    });
  }

  // Phase complete indicator
  if (data.total_actions_remaining === 0 && data.phase_name) {
    anchors.push({
      icon: CheckCircle2,
      text: 'This phase is complete.',
      color: 'purple',
      priority: 3,
    });
  }

  // Next milestone
  if (data.next_milestone_label) {
    anchors.push({
      icon: Target,
      text: `Next milestone: ${data.next_milestone_label}.`,
      color: 'purple',
      priority: 6,
    });
  }

  // Sort by priority, take top 5
  return anchors.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

const colorClasses: Record<string, string> = {
  purple: 'text-primary border-primary/20 bg-primary/5',
  aqua: 'text-brand-aqua border-brand-aqua/20 bg-brand-aqua/5',
  macaron: 'text-brand-macaron border-brand-macaron/20 bg-brand-macaron/5',
  fuchsia: 'text-brand-fuchsia border-brand-fuchsia/20 bg-brand-fuchsia/5',
};

export function ProgressAnchors({
  tenantId,
  packageInstanceId,
  variant = 'internal',
  className,
}: ProgressAnchorsProps) {
  const { data: anchorDataList, isLoading } = useProgressAnchors(tenantId, packageInstanceId);

  if (isLoading) {
    return (
      <div className={cn('space-y-2', className)}>
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }

  if (!anchorDataList || anchorDataList.length === 0) return null;

  // Use first package if no specific one selected (highest priority = lowest score)
  const data = anchorDataList.sort((a, b) => a.overall_score - b.overall_score)[0];
  const anchors = buildAnchors(data, variant);

  return (
    <div className={cn('space-y-1.5', className)}>
      {anchors.map((anchor, idx) => (
        <div
          key={idx}
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm',
            colorClasses[anchor.color],
          )}
        >
          <anchor.icon className="h-3.5 w-3.5 shrink-0" />
          <span>{anchor.text}</span>
        </div>
      ))}
    </div>
  );
}

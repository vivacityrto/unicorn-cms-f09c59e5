/**
 * ProgressAnchors – Unicorn 2.0
 *
 * Displays 3–5 short, data-driven statements anchored to measurable counts.
 * Every statement maps to a real system metric.
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

  // Critical risk (highest priority)
  if (data.has_active_critical) {
    anchors.push({
      icon: AlertTriangle,
      text: variant === 'client' ? 'Action required on open items.' : 'Active critical risk requires attention.',
      color: 'fuchsia',
      priority: 1,
    });
  }

  // Audit ready %
  anchors.push({
    icon: ShieldCheck,
    text: `You are ${data.overall_score}% Audit Ready.`,
    color: 'purple',
    priority: data.is_stale || data.has_active_critical ? 5 : 2,
  });

  // Actions remaining
  if (data.actions_remaining_current_phase > 0) {
    anchors.push({
      icon: ListChecks,
      text: `${data.actions_remaining_current_phase} action${data.actions_remaining_current_phase !== 1 ? 's' : ''} remaining in this phase.`,
      color: 'aqua',
      priority: 3,
    });
  }

  // Documents pending
  if (data.documents_pending_upload > 0) {
    anchors.push({
      icon: FileText,
      text: `${data.documents_pending_upload} document${data.documents_pending_upload !== 1 ? 's' : ''} pending upload.`,
      color: data.documents_pending_upload > 3 ? 'macaron' : 'aqua',
      priority: 4,
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

  // Use first package if no specific one selected
  const data = anchorDataList[0];
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

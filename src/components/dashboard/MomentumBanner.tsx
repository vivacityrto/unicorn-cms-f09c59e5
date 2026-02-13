/**
 * MomentumBanner – Unicorn 2.0
 *
 * Shows when momentum is paused or at_risk.
 * Internal variant shows detailed reasons; client variant uses calm language.
 * Deep-links to the relevant action screen.
 */

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertTriangle, PauseCircle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type MomentumState } from '@/hooks/useMomentumState';

interface MomentumBannerProps {
  state: MomentumState;
  variant?: 'internal' | 'client';
  className?: string;
}

function getSubtitle(state: MomentumState, variant: 'internal' | 'client'): string {
  if (variant === 'client') {
    if (state.has_active_critical) return 'There are open items that need your attention to continue.';
    if (state.pause_reason.includes('stale_data'))
      return `No activity recorded in ${state.days_since_last_activity} days.`;
    if (state.pause_reason.includes('phase_stalled'))
      return 'Your current phase has not progressed recently.';
    return 'Action is needed to continue progress.';
  }

  // Internal: more specific
  if (state.has_active_critical) return 'Critical risk requires attention.';
  if (state.pause_reason.includes('phase_stalled') && state.current_phase_name)
    return `${state.current_phase_name} has not progressed in ${state.days_in_current_phase} days.`;
  if (state.pause_reason.includes('stale_data'))
    return `No activity recorded in ${state.days_since_last_activity} days.`;
  if (state.pause_reason.includes('risk_unresolved')) return 'High/critical risk unresolved.';
  return 'Progress has stalled.';
}

function getCtaHref(state: MomentumState, variant: 'internal' | 'client'): string {
  const primaryReason = state.pause_reason[0];
  if (variant === 'client') {
    if (primaryReason === 'risk_unresolved') return '/client/documents';
    return '/client/documents';
  }
  // Internal
  if (primaryReason === 'risk_unresolved') return `/manage-tenants/${state.tenant_id}`;
  if (primaryReason === 'phase_stalled') return `/manage-tenants/${state.tenant_id}`;
  return `/manage-tenants/${state.tenant_id}`;
}

export function MomentumBanner({ state, variant = 'internal', className }: MomentumBannerProps) {
  if (state.momentum_state !== 'paused' && state.momentum_state !== 'at_risk') return null;

  const isAtRisk = state.momentum_state === 'at_risk';
  const title = variant === 'client' ? 'Action required to continue progress.' : 'Momentum paused.';
  const subtitle = getSubtitle(state, variant);
  const href = getCtaHref(state, variant);

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 rounded-lg border-l-4',
        isAtRisk
          ? 'border-brand-fuchsia bg-brand-fuchsia/5'
          : 'border-brand-macaron bg-brand-light-purple/30',
        className,
      )}
    >
      {isAtRisk ? (
        <AlertTriangle className="h-4 w-4 text-brand-fuchsia shrink-0" />
      ) : (
        <PauseCircle className="h-4 w-4 text-brand-macaron shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-brand-acai">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <Button size="sm" asChild className="shrink-0 gap-1">
        <Link to={href}>
          {variant === 'client' ? 'View next step' : 'Resume progress'}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </Button>
    </div>
  );
}

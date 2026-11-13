import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PRODUCT_LABEL, STATUS_LABEL, TYPE_LABEL, URGENCY_LABEL, aiBadge,
  type AiState, type TicketProduct, type TicketStatus, type TicketType, type TicketUrgency,
} from './ticketLogic';

/**
 * Chips are text-first: the dot only reinforces the label, so meaning never
 * depends on colour alone, and the text uses the foreground token so contrast
 * holds in light and dark.
 */
const CHIP = 'inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground whitespace-nowrap';

const STATUS_DOT: Record<TicketStatus, string> = {
  new: 'bg-primary',
  in_progress: 'bg-brand-purple',
  waiting: 'bg-brand-macaron',
  resolved: 'bg-emerald-500',
  closed: 'bg-muted-foreground',
};

const URGENCY_DOT: Record<TicketUrgency, string> = {
  low: 'bg-muted-foreground',
  medium: 'bg-primary',
  high: 'bg-brand-macaron',
  critical: 'bg-destructive',
};

export function StatusBadge({ status, label, className }: { status: TicketStatus; label?: string; className?: string }) {
  return (
    <span className={cn(CHIP, className)}>
      <span aria-hidden className={cn('h-2 w-2 rounded-full', STATUS_DOT[status])} />
      {label ?? STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function UrgencyBadge({ urgency, className }: { urgency: TicketUrgency; className?: string }) {
  return (
    <span className={cn(CHIP, className)}>
      <span aria-hidden className={cn('h-2 w-2 rounded-full', URGENCY_DOT[urgency])} />
      {URGENCY_LABEL[urgency] ?? urgency}
    </span>
  );
}

export function TypeBadge({ type, className }: { type: TicketType; className?: string }) {
  return <span className={cn(CHIP, 'bg-muted', className)}>{TYPE_LABEL[type] ?? type}</span>;
}

export function ProductBadge({ product, className }: { product: TicketProduct; className?: string }) {
  return <span className={cn(CHIP, 'border-brand-purple/40', className)}>{PRODUCT_LABEL[product] ?? product}</span>;
}

/** "AI draft" notice, shown only while title, type and urgency are not yet reviewed by a person. */
export function AiDraftBadge({ aiState, className }: { aiState: AiState; className?: string }) {
  const badge = aiBadge({ ai_state: aiState });
  if (!badge) return null;
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium text-foreground',
        badge.tone === 'warn' ? 'border-brand-macaron bg-brand-macaron/15' : 'border-primary/40 bg-primary/10',
        className,
      )}
    >
      <Sparkles aria-hidden className="h-3.5 w-3.5" />
      {badge.label}
    </span>
  );
}

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  PRODUCT_LABEL, STATUS_LABEL, TICKET_PRODUCTS, TICKET_STATUSES, TICKET_TYPES, TICKET_URGENCIES,
  TYPE_LABEL, URGENCY_LABEL, closeNeedsReason, ticketRef,
  type TicketProduct, type TicketRow, type TicketStatus, type TicketType, type TicketUrgency,
} from './ticketLogic';
import { useStaffOptions, useUpdateTicket } from './useSupportTickets';
import { usePostReply } from './useTicketThread';

const NONE = '__none__';

/** Stops a click or key inside an inline control from also opening the row's panel. */
export function StopRowClick({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

const TRIGGER = 'h-9 min-h-11 gap-1 px-2 text-xs sm:min-h-9';

export function AssigneeSelect({
  ticket, compact, className,
}: { ticket: Pick<TicketRow, 'id' | 'assignee_id' | 'ticket_number'>; compact?: boolean; className?: string }) {
  const staff = useStaffOptions();
  const update = useUpdateTicket();
  return (
    <Select
      value={ticket.assignee_id ?? NONE}
      onValueChange={(v) => update.mutate({ id: ticket.id, patch: { assignee_id: v === NONE ? null : v } })}
    >
      <SelectTrigger
        aria-label={`Assignee for ${ticketRef(ticket.ticket_number)}`}
        className={cn(compact ? TRIGGER : 'h-9 min-h-11 sm:min-h-9', 'w-full min-w-[9rem]', className)}
      >
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Unassigned</SelectItem>
        {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function StatusSelect({
  ticket, compact, onRequestClose, className,
}: {
  ticket: Pick<TicketRow, 'id' | 'status' | 'ticket_number'>;
  compact?: boolean;
  /** Closing needs a reason, so the caller opens the close dialog instead of updating directly. */
  onRequestClose: (ticketId: string) => void;
  className?: string;
}) {
  const update = useUpdateTicket();
  return (
    <Select
      value={ticket.status}
      onValueChange={(v) => {
        const next = v as TicketStatus;
        if (closeNeedsReason(next, ticket.status)) { onRequestClose(ticket.id); return; }
        update.mutate({ id: ticket.id, patch: { status: next } });
      }}
    >
      <SelectTrigger
        aria-label={`Status for ${ticketRef(ticket.ticket_number)}`}
        className={cn(compact ? TRIGGER : 'h-9 min-h-11 sm:min-h-9', 'w-full min-w-[8.5rem]', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TICKET_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function UrgencySelect({ ticket, className }: { ticket: Pick<TicketRow, 'id' | 'urgency' | 'ticket_number'>; className?: string }) {
  const update = useUpdateTicket();
  return (
    <Select value={ticket.urgency} onValueChange={(v) => update.mutate({ id: ticket.id, patch: { urgency: v as TicketUrgency } })}>
      <SelectTrigger aria-label={`Urgency for ${ticketRef(ticket.ticket_number)}`} className={cn('h-9 min-h-11 w-full sm:min-h-9', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TICKET_URGENCIES.map((u) => <SelectItem key={u} value={u}>{URGENCY_LABEL[u]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function TypeSelect({ ticket, className }: { ticket: Pick<TicketRow, 'id' | 'type' | 'ticket_number'>; className?: string }) {
  const update = useUpdateTicket();
  return (
    <Select value={ticket.type} onValueChange={(v) => update.mutate({ id: ticket.id, patch: { type: v as TicketType } })}>
      <SelectTrigger aria-label={`Type for ${ticketRef(ticket.ticket_number)}`} className={cn('h-9 min-h-11 w-full sm:min-h-9', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TICKET_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function ProductSelect({ ticket, className }: { ticket: Pick<TicketRow, 'id' | 'product' | 'ticket_number'>; className?: string }) {
  const update = useUpdateTicket();
  return (
    <Select value={ticket.product} onValueChange={(v) => update.mutate({ id: ticket.id, patch: { product: v as TicketProduct } })}>
      <SelectTrigger aria-label={`Product for ${ticketRef(ticket.ticket_number)}`} className={cn('h-9 min-h-11 w-full sm:min-h-9', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TICKET_PRODUCTS.map((p) => <SelectItem key={p} value={p}>{PRODUCT_LABEL[p]}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Closing needs a reason the reporter can read: it is posted as a public reply, then the status changes. */
export function CloseTicketDialog({
  ticket, open, onOpenChange,
}: { ticket: Pick<TicketRow, 'id' | 'title' | 'ticket_number' | 'status'> | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = useState('');
  const post = usePostReply(ticket?.id);
  const update = useUpdateTicket();
  const busy = post.isPending || update.isPending;
  const valid = reason.trim().length >= 3;

  const confirm = async () => {
    if (!ticket || !valid) return;
    try {
      await post.mutateAsync({ body: reason.trim(), staffOnly: false });
      await update.mutateAsync({ id: ticket.id, patch: { status: 'closed' } });
      setReason('');
      onOpenChange(false);
    } catch {
      // Both mutations already show their own error message; keep the dialog open with the text.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Close {ticket ? ticketRef(ticket.ticket_number) : 'ticket'}</DialogTitle>
          <DialogDescription>
            Closed means it ended without a fix, for example declined, a duplicate or withdrawn. The reporter will read your reason.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="close-reason">Reason (visible to the reporter)</Label>
          <Textarea
            id="close-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={10000}
            aria-describedby="close-reason-hint"
            disabled={busy}
          />
          <p id="close-reason-hint" className="text-xs text-muted-foreground">
            {valid ? 'Ready to close.' : 'Add a reason of at least three characters to close this ticket.'}
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="text-foreground min-h-11 sm:min-h-9">Cancel</Button>
          <Button type="button" onClick={confirm} disabled={!valid || busy} className="min-h-11 gap-1.5 sm:min-h-9">
            {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
            Close ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

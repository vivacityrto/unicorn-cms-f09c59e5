import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { AiDraftBadge } from './TicketBadges';
import { TicketComposer } from './TicketComposer';
import {
  AssigneeSelect, CloseTicketDialog, ProductSelect, StatusSelect, TypeSelect, UrgencySelect,
} from './TicketControls';
import { TicketThread } from './TicketThread';
import { formatDateTime, personName, ticketRef, type TicketRow } from './ticketLogic';
import { useSupportTicket, useUpdateTicket } from './useSupportTickets';
import { useTicketThread } from './useTicketThread';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function EditableTitle({ ticket }: { ticket: TicketRow }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ticket.title);
  const update = useUpdateTicket();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setValue(ticket.title); }, [ticket.title]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = () => {
    const next = value.trim();
    if (next.length > 0 && next !== ticket.title) update.mutate({ id: ticket.id, patch: { title: next.slice(0, 300) } });
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 break-words font-heading text-xl font-semibold text-foreground">{ticket.title}</h2>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0 sm:h-8 sm:w-8" aria-label="Edit title" onClick={() => setEditing(true)}>
          <Pencil aria-hidden className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  return (
    <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <Label htmlFor={`title-${ticket.id}`} className="sr-only">Title</Label>
      <Input
        id={`title-${ticket.id}`}
        ref={inputRef}
        value={value}
        maxLength={300}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setValue(ticket.title); setEditing(false); } }}
      />
      <Button type="submit" size="icon" className="h-11 w-11 shrink-0 sm:h-9 sm:w-9" aria-label="Save title"><Check aria-hidden className="h-4 w-4" /></Button>
      <Button type="button" variant="outline" size="icon" className="text-foreground h-11 w-11 shrink-0 sm:h-9 sm:w-9" aria-label="Cancel editing title" onClick={() => { setValue(ticket.title); setEditing(false); }}>
        <X aria-hidden className="h-4 w-4" />
      </Button>
    </form>
  );
}

/** The ticket itself: editable fields, thread and composer. Shared by the side panel and the full page. */
export function TicketDetail({ ticket }: { ticket: TicketRow }) {
  const { data: thread, isLoading } = useTicketThread(ticket.id, { includeAuthors: true });
  const [closing, setClosing] = useState(false);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {ticketRef(ticket.ticket_number)}
        </p>
        <EditableTitle ticket={ticket} />
        <AiDraftBadge aiState={ticket.ai_state} />
      </div>

      <section aria-label="Ticket fields" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Status"><StatusSelect ticket={ticket} onRequestClose={() => setClosing(true)} /></Field>
        <Field label="Assigned to"><AssigneeSelect ticket={ticket} /></Field>
        <Field label="Urgency"><UrgencySelect ticket={ticket} /></Field>
        <Field label="Type"><TypeSelect ticket={ticket} /></Field>
        <Field label="Product"><ProductSelect ticket={ticket} /></Field>
        <Field label="Client">
          <p className="min-h-9 py-2 text-sm text-foreground">{ticket.tenant?.name ?? 'Unknown'}</p>
        </Field>
      </section>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
        <div><dt className="inline">Reported by </dt><dd className="inline text-foreground">{personName(ticket.reporter) || 'Unknown'}</dd></div>
        <div><dt className="inline">Created </dt><dd className="inline text-foreground">{formatDateTime(ticket.created_at)}</dd></div>
        {ticket.source_url && <div className="sm:col-span-2 break-all"><dt className="inline">Raised from </dt><dd className="inline text-foreground">{ticket.source_url}</dd></div>}
        {ticket.external_ref && <div className="sm:col-span-2 break-all"><dt className="inline">Reference </dt><dd className="inline text-foreground">{ticket.external_ref}</dd></div>}
      </dl>

      <section aria-label="Conversation" className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Conversation</h3>
        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : (
          <TicketThread
            messages={thread?.messages ?? []}
            attachments={thread?.attachments ?? []}
            reporterId={ticket.reporter_id}
            viewer="staff"
          />
        )}
        <TicketComposer ticketId={ticket.id} canNote placeholder="Reply to the reporter" />
      </section>

      <CloseTicketDialog ticket={ticket} open={closing} onOpenChange={setClosing} />
    </div>
  );
}

/** Side panel opened from the list (?ticket=<id>). The Sheet traps focus and returns it to the row on close. */
export function TicketPanel({
  ticketId, onClose, fallback,
}: { ticketId: string | null; onClose: () => void; fallback?: TicketRow | null }) {
  const { data, isLoading } = useSupportTicket(ticketId ?? undefined);
  const ticket = data ?? fallback ?? null;
  return (
    <Sheet open={!!ticketId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="sr-only">
          <SheetTitle>{ticket ? `${ticketRef(ticket.ticket_number)}: ${ticket.title}` : 'Ticket'}</SheetTitle>
          <SheetDescription>Ticket details, conversation and reply box</SheetDescription>
        </SheetHeader>
        <div className="pt-4">
          {isLoading && !ticket ? (
            <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Loading ticket
            </div>
          ) : ticket ? (
            <TicketDetail ticket={ticket} />
          ) : (
            <p className="text-sm text-muted-foreground">This ticket could not be found, or you do not have access to it.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

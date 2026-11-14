import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useClientTicket } from '@/components/client-portal/support-tickets/useClientTickets';
import { StatusBadge } from '@/components/support-tickets/TicketBadges';
import { TicketComposer } from '@/components/support-tickets/TicketComposer';
import { TicketThread } from '@/components/support-tickets/TicketThread';
import { CLIENT_STATUS_LABEL, formatDate, isOpenStatus, ticketRef } from '@/components/support-tickets/ticketLogic';
import { useTicketThread } from '@/components/support-tickets/useTicketThread';

/** A client's own ticket: the conversation with Vivacity, a reply box on every ticket and a status chip. */
export default function SupportTicketPortalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: ticket, isLoading } = useClientTicket(id);
  const { data: thread, isLoading: threadLoading } = useTicketThread(ticket?.id, { includeAuthors: false });

  return (
    <div className="w-full space-y-4 px-4 py-4 sm:px-8 sm:py-6">
      <Link
        to="/client/support-tickets"
        className="inline-flex min-h-11 items-center gap-1.5 rounded text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:min-h-0"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Back to support
      </Link>

      {isLoading ? (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Loading your ticket
        </div>
      ) : !ticket ? (
        <p className="rounded-xl border border-border bg-card p-4 text-sm text-foreground">
          We could not find that ticket. It may belong to someone else, or it may have been removed.
        </p>
      ) : (
        <>
          <header className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{ticketRef(ticket.ticket_number)}</p>
            <h1 className="break-words font-heading text-2xl font-semibold">{ticket.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <StatusBadge status={ticket.status} label={CLIENT_STATUS_LABEL[ticket.status]} />
              <span>Raised {formatDate(ticket.created_at)}</span>
            </div>
          </header>

          <section aria-label="Conversation" className="space-y-3">
            {threadLoading ? (
              <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Loading the conversation
              </div>
            ) : (
              <TicketThread
                messages={thread?.messages ?? []}
                attachments={thread?.attachments ?? []}
                reporterId={ticket.reporter_id}
                viewer="client"
              />
            )}
            <TicketComposer
              ticketId={ticket.id}
              canNote={false}
              placeholder="Write a reply"
              hint={isOpenStatus(ticket.status) ? undefined : 'Replying to a resolved or closed ticket reopens it.'}
            />
          </section>
        </>
      )}
    </div>
  );
}

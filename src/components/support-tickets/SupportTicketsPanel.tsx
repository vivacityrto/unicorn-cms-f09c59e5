import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { NewTicketDialog } from './NewTicketDialog';
import { StatusBadge, UrgencyBadge } from './TicketBadges';
import { formatDate, matchesView, sortTickets, ticketRef, type TicketRow } from './ticketLogic';
import { useSupportTickets } from './useSupportTickets';

function Group({ title, rows, onPick, empty }: { title: string; rows: TicketRow[]; onPick: (id: string) => void; empty: string }) {
  return (
    <section aria-label={title} className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title} <span className="font-normal text-muted-foreground">({rows.length})</span></h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 8).map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => onPick(t.id)}
                className="w-full min-h-11 rounded-lg border border-border bg-card p-2.5 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">{ticketRef(t.ticket_number)}</span>
                  <StatusBadge status={t.status} />
                  <UrgencyBadge urgency={t.urgency} />
                </span>
                <span className="mt-1 block truncate text-sm font-medium text-foreground">{t.title}</span>
                <span className="block text-xs text-muted-foreground">{formatDate(t.last_activity_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Quick view from the top bar: what needs triage and what is assigned to me. */
export function SupportTicketsPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [newOpen, setNewOpen] = useState(false);
  const { data: rows = [], isLoading } = useSupportTickets();

  const { mine, triage } = useMemo(() => ({
    mine: sortTickets(rows.filter((r) => matchesView(r, 'open') && r.assignee_id === user?.id)),
    triage: sortTickets(rows.filter((r) => matchesView(r, 'triage'))),
  }), [rows, user?.id]);

  const go = (id: string) => { onOpenChange(false); navigate(`/support-tickets?ticket=${id}`); };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <div className="flex items-center justify-between gap-2 pr-8">
              <SheetTitle>Tickets</SheetTitle>
              <div className="flex items-center gap-1.5">
                <Button size="sm" className="min-h-11 gap-1 sm:min-h-8" onClick={() => setNewOpen(true)}>
                  <Plus aria-hidden className="h-3.5 w-3.5" /> New
                </Button>
                <Button variant="outline" size="sm" className="text-foreground min-h-11 gap-1 sm:min-h-8" onClick={() => { onOpenChange(false); navigate('/support-tickets'); }}>
                  <ExternalLink aria-hidden className="h-3.5 w-3.5" /> Full view
                </Button>
              </div>
            </div>
            <SheetDescription className="sr-only">Tickets that need triage and tickets assigned to you</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            {isLoading ? (
              <div role="status" aria-label="Loading tickets" className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
            ) : (
              <>
                <Group title="Assigned to me" rows={mine} onPick={go} empty="Nothing is assigned to you." />
                <Group title="Needs triage" rows={triage} onPick={go} empty="Nothing needs triage." />
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <NewTicketDialog open={newOpen} onOpenChange={setNewOpen} />
    </>
  );
}

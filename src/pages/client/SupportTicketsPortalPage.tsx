import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy, Loader2, MessageSquarePlus, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ClientMessageBox } from '@/components/client-portal/support-tickets/ClientMessageBox';
import { useClientTickets, type ClientTicketRow } from '@/components/client-portal/support-tickets/useClientTickets';
import { StatusBadge } from '@/components/support-tickets/TicketBadges';
import { TicketHero } from '@/components/support-tickets/TicketHero';
import { CLIENT_STATUS_LABEL, formatDate, isOpenStatus, ticketRef } from '@/components/support-tickets/ticketLogic';

type Tab = 'open' | 'resolved' | 'all';

const matches = (t: ClientTicketRow, tab: Tab) =>
  tab === 'all' ? true : tab === 'open' ? isOpenStatus(t.status) : !isOpenStatus(t.status);

export default function SupportTicketsPortalPage() {
  const { data: tickets = [], isLoading, isError } = useClientTickets();
  const [tab, setTab] = useState<Tab>('open');
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);

  const q = search.trim().toLowerCase();
  const searched = useMemo(
    () => tickets.filter((t) => !q || t.title.toLowerCase().includes(q) || ticketRef(t.ticket_number).toLowerCase().includes(q)),
    [tickets, q],
  );
  const counts: Record<Tab, number> = {
    open: searched.filter((t) => matches(t, 'open')).length,
    resolved: searched.filter((t) => matches(t, 'resolved')).length,
    all: searched.length,
  };
  const visible = searched.filter((t) => matches(t, tab));

  return (
    <div className="min-h-full bg-background">
      <TicketHero
        title="Support"
        subtitle="Send us a message and track it here"
        actions={
          <Button onClick={() => setNewOpen(true)} className="min-h-11 w-full gap-1.5 bg-white font-semibold text-brand-acai hover:bg-white/90 sm:w-auto">
            <MessageSquarePlus aria-hidden className="h-4 w-4" />
            New message
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-4xl space-y-4 px-4 py-5 sm:px-6">
        <div className="space-y-1.5">
          <Label htmlFor="client-ticket-search" className="sr-only">Search your tickets</Label>
          <Input
            id="client-ticket-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your tickets"
            className="min-h-11 sm:min-h-10"
          />
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList aria-label="Ticket views" className="h-auto justify-start gap-1 bg-transparent p-0">
            {([['open', 'Open'], ['resolved', 'Resolved'], ['all', 'All']] as const).map(([key, label]) => (
              <TabsTrigger
                key={key}
                value={key}
                className="min-h-11 gap-2 rounded-b-none border-b-2 border-transparent px-4 data-[state=active]:border-brand-purple data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:min-h-10"
              >
                {label}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-semibold text-foreground">{counts[key]}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={tab} className="mt-3">
            {isLoading ? (
              <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Loading your tickets
              </div>
            ) : isError ? (
              <p role="alert" className="py-12 text-center text-sm text-foreground">We could not load your tickets. Please refresh and try again.</p>
            ) : visible.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-14 text-center">
                {tickets.length === 0 ? <LifeBuoy aria-hidden className="h-10 w-10 text-muted-foreground" /> : <SearchX aria-hidden className="h-10 w-10 text-muted-foreground" />}
                <p className="font-medium text-foreground">{tickets.length === 0 ? 'No tickets yet' : 'Nothing here'}</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {tickets.length === 0 ? 'Send us a message and it will show up here, with our replies.' : 'Try another tab or a different search.'}
                </p>
                {tickets.length === 0 && <Button onClick={() => setNewOpen(true)} className="min-h-11 sm:min-h-9">New message</Button>}
              </div>
            ) : (
              <ul className="space-y-2" aria-label="Your tickets">
                {visible.map((t) => (
                  <li key={t.id}>
                    <Link
                      to={`/client/support-tickets/${t.id}`}
                      className="block min-h-11 rounded-xl border border-border bg-card p-3 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">{ticketRef(t.ticket_number)}</span>
                        <StatusBadge status={t.status} label={CLIENT_STATUS_LABEL[t.status]} />
                      </span>
                      <span className="mt-1 block font-medium text-foreground">{t.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        Raised {formatDate(t.created_at)} · Last update {formatDate(t.last_activity_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New message</DialogTitle>
            <DialogDescription>Tell us what you need. We will turn it into a ticket and reply here.</DialogDescription>
          </DialogHeader>
          <ClientMessageBox onViewTickets={() => setNewOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

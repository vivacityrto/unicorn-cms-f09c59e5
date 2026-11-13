import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { NewTicketDialog } from '@/components/support-tickets/NewTicketDialog';
import { TicketFilters } from '@/components/support-tickets/TicketFilters';
import { TicketHero } from '@/components/support-tickets/TicketHero';
import { TicketList } from '@/components/support-tickets/TicketList';
import { TicketPanel } from '@/components/support-tickets/TicketDetail';
import { CloseTicketDialog } from '@/components/support-tickets/TicketControls';
import { TicketSummaryBar } from '@/components/support-tickets/TicketSummaryBar';
import { useSupportTickets } from '@/components/support-tickets/useSupportTickets';
import {
  EMPTY_FILTERS, TICKET_VIEWS, applyFilters, computeSummary, filtersActive, matchesView, parseListParams, sortTickets,
  ticketsToCsv, toListParams, viewCounts,
  type ListUrlState, type SortKey, type TicketFilterState, type TicketView,
} from '@/components/support-tickets/ticketLogic';

/**
 * Staff Tickets page. The view, filters, sort and open ticket live in the URL,
 * so a refresh or a shared link lands on the same screen.
 */
export default function SupportTicketsPage({ startNew = false }: { startNew?: boolean }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, profile, isSuperAdmin, loading } = useAuth();
  const allowed = profile?.is_vivacity_internal === true || isSuperAdmin();
  const [newOpen, setNewOpen] = useState(startNew);
  const [closingId, setClosingId] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!allowed) {
      toast.error('Tickets are for the Vivacity team only.');
      navigate('/dashboard', { replace: true });
    }
  }, [loading, allowed, navigate]);

  // Notifications from the old Client Messages feature linked to ?thread=<id>; that id is now a ticket id.
  const legacyThread = params.get('thread');
  useEffect(() => {
    if (legacyThread) navigate(`/support-tickets/${encodeURIComponent(legacyThread)}`, { replace: true });
  }, [legacyThread, navigate]);

  const { data: rows = [], isLoading } = useSupportTickets();
  const state = useMemo(() => parseListParams(params), [params]);

  const update = (patch: Partial<ListUrlState>) => {
    setParams(toListParams({ ...state, ...patch }), { replace: true });
  };

  const filtered = useMemo(
    () => applyFilters(rows, state.filters, { meId: user?.id ?? null }),
    [rows, state.filters, user?.id],
  );
  const summary = useMemo(() => computeSummary(filtered), [filtered]);
  const counts = useMemo(() => viewCounts(filtered), [filtered]);
  const visible = useMemo(
    () => sortTickets(filtered.filter((r) => matchesView(r, state.view)), state.sort),
    [filtered, state.view, state.sort],
  );
  const clientOptions = useMemo(() => {
    const map = new Map<number, string>();
    rows.forEach((r) => { if (r.tenant?.id != null) map.set(r.tenant.id, r.tenant.name ?? `Client ${r.tenant.id}`); });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const onSortChange = (key: SortKey) => {
    const sameKey = state.sort.key === key;
    const defaultDir = key === 'urgency' || key === 'activity' ? 'desc' : 'asc';
    update({ sort: { key, dir: sameKey ? (state.sort.dir === 'asc' ? 'desc' : 'asc') : defaultDir } });
  };

  const exportCsv = () => {
    const blob = new Blob([ticketsToCsv(visible)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const closeNew = (open: boolean) => {
    setNewOpen(open);
    if (!open && startNew) navigate('/support-tickets', { replace: true });
  };

  if (!allowed) {
    return <div className="p-6 text-sm text-muted-foreground">Redirecting</div>;
  }

  const resetKey = JSON.stringify([state.view, state.filters, state.sort]);
  const closing = rows.find((r) => r.id === closingId) ?? null;

  return (
    <div className="min-h-full bg-background">
      <TicketHero
        title="Tickets"
        subtitle="Issues, requests and questions across Vivacity, Unicorn and ComplyHub"
        actions={
          <Button
            onClick={() => setNewOpen(true)}
            className="min-h-11 w-full gap-1.5 bg-white font-semibold text-brand-acai hover:bg-white/90 sm:w-auto"
          >
            <Plus aria-hidden className="h-4 w-4" />
            New ticket
          </Button>
        }
      />

      <TicketSummaryBar summary={summary} />

      <Tabs value={state.view} onValueChange={(v) => update({ view: v as TicketView })}>
        <div className="overflow-x-auto px-4 sm:px-6">
          <TabsList aria-label="Ticket views" className="h-auto justify-start gap-1 bg-transparent p-0">
            {TICKET_VIEWS.map((v) => (
              <TabsTrigger
                key={v.key}
                value={v.key}
                className="min-h-11 gap-2 rounded-b-none border-b-2 border-transparent px-4 data-[state=active]:border-brand-purple data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:min-h-10"
              >
                {v.label}
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-semibold text-foreground">{counts[v.key]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TicketFilters
          filters={state.filters}
          onChange={(filters: TicketFilterState) => update({ filters })}
          clientOptions={clientOptions}
          onExportCsv={exportCsv}
        />

        <TabsContent value={state.view} className="mt-0 focus-visible:ring-0 focus-visible:ring-offset-0">
          <TicketList
            rows={visible}
            isLoading={isLoading}
            totalCount={rows.length}
            filtersActive={filtersActive(state.filters)}
            sort={state.sort}
            onSortChange={onSortChange}
            onOpen={(id) => update({ ticket: id })}
            onRequestClose={setClosingId}
            onClearFilters={() => update({ filters: EMPTY_FILTERS })}
            onNewTicket={() => setNewOpen(true)}
            resetKey={resetKey}
          />
        </TabsContent>
      </Tabs>

      <TicketPanel
        ticketId={state.ticket}
        onClose={() => update({ ticket: null })}
        fallback={rows.find((r) => r.id === state.ticket) ?? null}
      />
      <CloseTicketDialog ticket={closing} open={!!closing} onOpenChange={(o) => { if (!o) setClosingId(null); }} />
      <NewTicketDialog open={newOpen} onOpenChange={closeNew} />
    </div>
  );
}

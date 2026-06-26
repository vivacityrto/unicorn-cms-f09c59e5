import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, LifeBuoy, SearchX, Plus } from 'lucide-react';
import { TICKET_TYPES } from '@/components/support-tickets/ticketTypeConfig';
import { useClientSupportTickets } from '@/components/client-portal/support-tickets/useClientSupportTickets';
import { ClientNewTicketModal } from '@/components/client-portal/support-tickets/ClientNewTicketModal';
import { ClientTicketCard } from '@/components/client-portal/support-tickets/ClientTicketCard';
import { CLIENT_STATUS_LABEL } from '@/components/client-portal/support-tickets/statusDisplay';
import { cn } from '@/lib/utils';

type TabKey = 'active' | 'new' | 'triaged' | 'in_progress' | 'resolved' | 'closed';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'new', label: 'Submitted' },
  { key: 'triaged', label: 'Under Review' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

const STATUS_OPTIONS = ['new', 'triaged', 'in_progress', 'blocked', 'resolved', 'closed'];

export default function SupportTicketsPortalPage() {
  const { data: tickets, isLoading } = useClientSupportTickets();
  const [modalOpen, setModalOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('active');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const all = tickets ?? [];

  const tabCounts = useMemo(() => {
    const c: Record<TabKey, number> = { active: 0, new: 0, triaged: 0, in_progress: 0, resolved: 0, closed: 0 };
    for (const t of all) {
      const code = t.status?.code ?? 'new';
      if (code !== 'resolved' && code !== 'closed') c.active += 1;
      if (code in c) (c as any)[code] += 1;
    }
    return c;
  }, [all]);

  const filtered = useMemo(() => {
    return all.filter((t) => {
      const code = t.status?.code ?? 'new';
      if (tab === 'active') {
        if (code === 'resolved' || code === 'closed') return false;
      } else if (code !== tab) {
        return false;
      }
      if (typeFilter !== 'all' && t.item_type?.code !== typeFilter) return false;
      if (statusFilter !== 'all' && code !== statusFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!t.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [all, tab, typeFilter, statusFilter, search]);

  const hasAny = all.length > 0;
  const filtersActive = search.trim() !== '' || typeFilter !== 'all' || statusFilter !== 'all' || tab !== 'active';

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('all');
    setStatusFilter('all');
    setTab('active');
  };

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#7130A0]">Support Tickets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Submit and track your support requests</p>
        </div>
        <Button
          onClick={() => setModalOpen(true)}
          className="bg-[#7130A0] hover:bg-[#5e2787] text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New Support Ticket
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'relative px-3 py-2 text-sm whitespace-nowrap transition-colors flex items-center gap-2',
                  active ? 'text-[#7130A0] font-semibold' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {t.label}
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded-full',
                  active ? 'bg-[#7130A0]/10 text-[#7130A0]' : 'bg-gray-100 text-gray-500'
                )}>
                  {tabCounts[t.key]}
                </span>
                {active && (
                  <span className="absolute left-0 right-0 bottom-[-1px] h-0.5 bg-[#7130A0]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your tickets…"
          className="sm:max-w-xs"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="sm:max-w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TICKET_TYPES.map((t) => (
              <SelectItem key={t.typeCode} value={t.typeCode}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:max-w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>{CLIENT_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : !hasAny ? (
        <div className="text-center py-16">
          <LifeBuoy className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-gray-400 text-sm mt-3">No support tickets yet.</p>
          <p className="text-gray-400 text-xs mt-1">Click "+ New Support Ticket" to get started.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <SearchX className="w-10 h-10 text-gray-300 mx-auto" />
          <p className="text-gray-400 text-sm mt-3">No tickets match your filters.</p>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-[#7130A0] hover:underline mt-2"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => <ClientTicketCard key={t.id} ticket={t} />)}
        </div>
      )}

      <ClientNewTicketModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}

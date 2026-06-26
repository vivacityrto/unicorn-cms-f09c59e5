import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { NewTicketModal } from '@/components/support-tickets/NewTicketModal';
import { useSubmitSupportTicket } from '@/components/support-tickets/useSubmitSupportTicket';
import {
  useAdminSupportTickets, type AdminTicketRow,
} from '@/components/support-tickets/useAdminSupportTickets';
import { AdminTicketStats } from '@/components/support-tickets/AdminTicketStats';
import {
  AdminTicketStatusTabs, type StatusTab,
} from '@/components/support-tickets/AdminTicketStatusTabs';
import {
  AdminTicketFilters,
  type TypeFilter, type UrgencyFilter, type DateRangeFilter,
} from '@/components/support-tickets/AdminTicketFilters';
import { AdminTicketsTable } from '@/components/support-tickets/AdminTicketsTable';

const BUG_TYPE_CODES = new Set(['error', 'functionality_fail']);

function matchesType(row: AdminTicketRow, filter: TypeFilter): boolean {
  if (filter === 'all') return true;
  const code = row.item_type?.code;
  if (!code) return false;
  if (filter === 'bug') return BUG_TYPE_CODES.has(code);
  return code === filter;
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function SupportTicketsPage() {
  const navigate = useNavigate();
  const { profile, isSuperAdmin, loading } = useAuth();
  const [newOpen, setNewOpen] = useState(false);
  const { hasTenant } = useSubmitSupportTicket();

  const allowed = profile?.is_vivacity_internal === true || isSuperAdmin();

  useEffect(() => {
    if (loading) return;
    if (!allowed) {
      toast.error('Support Tickets admin view is for the Vivacity team only.');
      navigate('/dashboard', { replace: true });
    }
  }, [loading, allowed, navigate]);

  const { data: rows = [], isLoading } = useAdminSupportTickets();

  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>('all');
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRangeFilter>(null);

  const clientOptions = useMemo(() => {
    const map = new Map<number, string>();
    rows.forEach((r) => {
      if (r.tenant?.id != null) map.set(r.tenant.id, r.tenant.name ?? `Tenant ${r.tenant.id}`);
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = dateRange
      ? Date.now() - ({ '7d': 7, '30d': 30, '90d': 90 }[dateRange] ?? 0) * 24 * 60 * 60 * 1000
      : null;

    return rows.filter((r) => {
      if (q && !r.title?.toLowerCase().includes(q)) return false;
      if (!matchesType(r, typeFilter)) return false;
      if (urgencyFilter !== 'all' && r.urgency !== urgencyFilter) return false;
      if (clientFilter !== 'all' && String(r.tenant?.id ?? '') !== clientFilter) return false;
      if (cutoff != null && new Date(r.created_at).getTime() < cutoff) return false;
      return true;
    });
  }, [rows, search, typeFilter, urgencyFilter, clientFilter, dateRange]);

  const tabCounts = useMemo<Record<StatusTab, number>>(() => {
    const c: Record<StatusTab, number> = {
      all: baseFiltered.length, new: 0, triaged: 0, in_progress: 0,
      resolved: 0, closed: 0, declined: 0,
    };
    baseFiltered.forEach((r) => {
      const code = r.status?.code as StatusTab | undefined;
      if (code && code in c) (c[code] as number) = (c[code] as number) + 1;
    });
    return c;
  }, [baseFiltered]);

  const visibleRows = useMemo(() => {
    if (statusTab === 'all') return baseFiltered;
    if (statusTab === 'declined') return [];
    return baseFiltered.filter((r) => r.status?.code === statusTab);
  }, [baseFiltered, statusTab]);

  const handleExportCsv = () => {
    const headers = ['Title', 'Client', 'Submitted By', 'Type', 'Status', 'Urgency', 'Assigned To', 'Created Date'];
    const lines = [
      headers.join(','),
      ...visibleRows.map((r) => [
        r.title,
        r.tenant?.name ?? '',
        r.reporter?.full_name ?? '',
        r.item_type?.label ?? '',
        r.status?.label ?? '',
        r.urgency ?? '',
        r.assignee?.full_name ?? '',
        format(new Date(r.created_at), 'dd MMM yyyy'),
      ].map(csvEscape).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `support-tickets-${format(new Date(), 'yyyyMMdd-HHmm')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!allowed) {
    return <div className="p-6 text-sm text-muted-foreground">Redirecting…</div>;
  }

  return (
    <div className="bg-gray-50 min-h-full">
      {/* Hero banner — edge to edge */}
      <div
        className="px-8 py-10 flex items-center justify-between"
        style={{ background: 'linear-gradient(135deg, #7130A0 0%, #ED1878 100%)' }}
      >
        <div>
          <h1
            className="text-4xl font-normal text-white tracking-wide"
            style={{ fontFamily: "'Anton', sans-serif" }}
          >
            Support Tickets
          </h1>
          <p className="text-sm text-white/75 mt-1">
            Manage and triage suggestions, bugs, and feature requests across all clients
          </p>
        </div>
        <Button
          onClick={() => setNewOpen(true)}
          disabled={!hasTenant}
          className="bg-white text-[#7130A0] hover:bg-white/90 font-semibold rounded-lg px-5 py-2.5 text-sm h-auto"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Submit Support Ticket
        </Button>
      </div>

      {/* Stats */}
      <div className="bg-white border-b border-gray-100">
        <AdminTicketStats rows={rows} />
      </div>

      {/* Tabs */}
      <div className="bg-white">
        <AdminTicketStatusTabs value={statusTab} onChange={setStatusTab} counts={tabCounts} />
      </div>

      {/* Filters */}
      <AdminTicketFilters
        search={search} onSearchChange={setSearch}
        typeFilter={typeFilter} onTypeChange={setTypeFilter}
        urgencyFilter={urgencyFilter} onUrgencyChange={setUrgencyFilter}
        clientFilter={clientFilter} onClientChange={setClientFilter}
        clientOptions={clientOptions}
        dateRange={dateRange} onDateRangeChange={setDateRange}
        onExportCsv={handleExportCsv}
      />

      {/* Table */}
      <AdminTicketsTable rows={visibleRows} isLoading={isLoading} />

      <NewTicketModal open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

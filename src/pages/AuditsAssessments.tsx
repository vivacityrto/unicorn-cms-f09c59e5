import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Plus, Search, X, Calendar, AlertTriangle, CheckCircle2, BarChart3 } from 'lucide-react';
import { format, isPast, startOfYear } from 'date-fns';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AuditTypeBadge } from '@/components/audit/AuditTypeBadge';
import { AuditStatusBadge } from '@/components/audit/AuditStatusBadge';
import { AuditRiskBadge } from '@/components/audit/AuditRiskBadge';
import { NewAuditModal } from '@/components/audit/NewAuditModal';
import { useAuditsDashboard, useOverdueActionCount } from '@/hooks/useClientAudits';
import { Skeleton } from '@/components/ui/skeleton';
import type { AuditType, AuditStatus, AuditDashboardRow } from '@/types/clientAudits';
import { cn } from '@/lib/utils';

export default function AuditsAssessments() {
  const navigate = useNavigate();
  const { data: audits = [], isLoading } = useAuditsDashboard();
  const { data: overdueCount = 0 } = useOverdueActionCount();
  const [modalOpen, setModalOpen] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [auditorFilter, setAuditorFilter] = useState<string>('all');

  const auditors = useMemo(() => {
    const unique = new Map<string, string>();
    audits.forEach(a => {
      if (a.lead_auditor_name) unique.set(a.lead_auditor_name, a.lead_auditor_name);
    });
    return Array.from(unique.values()).sort();
  }, [audits]);

  const filtered = useMemo(() => {
    return audits.filter(a => {
      if (search) {
        const s = search.toLowerCase();
        if (!(a.client_name?.toLowerCase().includes(s) || a.title?.toLowerCase().includes(s))) return false;
      }
      if (typeFilter !== 'all' && a.audit_type !== typeFilter) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (auditorFilter !== 'all' && a.lead_auditor_name !== auditorFilter) return false;
      return true;
    });
  }, [audits, search, typeFilter, statusFilter, auditorFilter]);

  const hasFilters = search || typeFilter !== 'all' || statusFilter !== 'all' || auditorFilter !== 'all';

  const totalAudits = audits.length;
  const activeAudits = audits.filter(a => ['draft', 'in_progress', 'review'].includes(a.status)).length;
  const completedThisYear = audits.filter(a => {
    if (a.status !== 'complete' || !a.conducted_at) return false;
    return new Date(a.conducted_at) >= startOfYear(new Date());
  }).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audits & Assessments"
        description="Compliance health checks, mock audits and due diligence across all clients"
        icon={ClipboardCheck}
        actions={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Audit
          </Button>
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Audits" value={isLoading ? '—' : totalAudits} icon={BarChart3} />
        <StatCard label="Active Audits" value={isLoading ? '—' : activeAudits} icon={ClipboardCheck} intent="info" />
        <StatCard label="Completed This Year" value={isLoading ? '—' : completedThisYear} icon={CheckCircle2} intent="success" />
        <StatCard label="Overdue Actions" value={isLoading ? '—' : overdueCount} icon={AlertTriangle} intent={overdueCount > 0 ? 'danger' : 'default'} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search client or audit title…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Audit Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="compliance_health_check">CHC</SelectItem>
            <SelectItem value="mock_audit">Mock Audit</SelectItem>
            <SelectItem value="due_diligence">Due Diligence</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="review">In Review</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={auditorFilter} onValueChange={setAuditorFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Lead Auditor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Auditors</SelectItem>
            {auditors.map(a => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setTypeFilter('all'); setStatusFilter('all'); setAuditorFilter('all'); }}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardCheck className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-medium text-muted-foreground">No audits found</p>
          <p className="text-sm text-muted-foreground/60 mt-1">Start a new audit with the button above.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Lead Auditor</TableHead>
              <TableHead>Conducted</TableHead>
              <TableHead>Next Due</TableHead>
              <TableHead className="text-right">Findings</TableHead>
              <TableHead className="text-right">Open Actions</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(row => (
              <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(`/audits/${row.id}`)}>
                <TableCell>
                  <div className="font-medium">{row.client_name}</div>
                  {row.rto_number && <div className="text-xs text-muted-foreground">{row.rto_number}</div>}
                </TableCell>
                <TableCell><AuditTypeBadge type={row.audit_type} /></TableCell>
                <TableCell><AuditStatusBadge status={row.status} /></TableCell>
                <TableCell><AuditRiskBadge risk={row.risk_rating} /></TableCell>
                <TableCell>
                  {row.lead_auditor_name ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback className="text-[10px]">
                          {row.lead_auditor_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{row.lead_auditor_name}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">Unassigned</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {row.conducted_at ? format(new Date(row.conducted_at), 'd MMM yyyy') : <span className="text-muted-foreground">Not yet</span>}
                </TableCell>
                <TableCell className="text-sm">
                  {row.next_audit_due ? (
                    <span className={cn(isPast(new Date(row.next_audit_due)) && 'text-red-600 font-medium')}>
                      {format(new Date(row.next_audit_due), 'd MMM yyyy')}
                    </span>
                  ) : '—'}
                </TableCell>
                <TableCell className={cn('text-right text-sm', row.finding_count === 0 && 'text-muted-foreground')}>
                  {row.finding_count}
                </TableCell>
                <TableCell className={cn('text-right text-sm', row.open_action_count > 0 ? 'text-orange-600 font-medium' : 'text-muted-foreground')}>
                  {row.open_action_count}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); navigate(`/audits/${row.id}`); }}>
                    Open
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <NewAuditModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}

import { useState, useMemo, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTimeTracking, formatDuration, TimeEntry } from '@/hooks/useTimeTracking';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AppModal, AppModalContent, AppModalHeader, AppModalTitle, AppModalBody, AppModalFooter } from '@/components/ui/app-modal';
import { ScopeSelectorBadge, SCOPE_SHORT } from './ScopeSelectorBadge';
import { MembershipWeightsPanel } from './MembershipWeightsPanel';
import { useTenantMemberships, type ScopeTag } from '@/hooks/useTenantMemberships';
import {
  Clock,
  Timer,
  TrendingUp,
  CalendarIcon,
  DollarSign,
  FileText,
  ArrowRightLeft,
  Scissors,
  Plus,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Pencil,
  Mail,
  Trash2,
  X,
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { EditTimeDialog } from './EditTimeDialog';
import { DeleteConfirmDialog } from '@/components/audit/DeleteConfirmDialog';

interface ClientTimeTabProps {
  tenantId: number;
  tenantName: string;
}

const PAGE_SIZE = 20;

// ── Helper: resolve package names via two-step fetch ────────────────
async function resolvePackageNames(instanceIds: number[]) {
  if (instanceIds.length === 0) return { nameMap: {} as Record<number, string>, lifecycleMap: {} as Record<number, { start_date: string | null; end_date: string | null }> };

  const { data: instances } = await (supabase as any)
    .from('package_instances')
    .select('id, package_id, start_date, end_date')
    .in('id', instanceIds);

  const resolvedInstanceIds = new Set((instances || []).map((i: any) => i.id));
  // IDs not found in package_instances may be raw package_ids (from COALESCE fallback in views)
  const fallbackPackageIds = instanceIds.filter(id => !resolvedInstanceIds.has(id));

  const allPackageIds = [
    ...new Set([
      ...(instances || []).map((i: any) => i.package_id).filter(Boolean),
      ...fallbackPackageIds,
    ]),
  ];

  const { data: pkgs } = allPackageIds.length > 0
    ? await (supabase as any).from('packages').select('id, name').in('id', allPackageIds)
    : { data: [] };

  const pkgNameMap: Record<number, string> = {};
  (pkgs || []).forEach((p: any) => { pkgNameMap[p.id] = p.name; });

  const nameMap: Record<number, string> = {};
  const lifecycleMap: Record<number, { start_date: string | null; end_date: string | null }> = {};
  (instances || []).forEach((inst: any) => {
    nameMap[inst.id] = pkgNameMap[inst.package_id] || `Package #${inst.package_id}`;
    lifecycleMap[inst.id] = { start_date: inst.start_date, end_date: inst.end_date };
  });
  // For fallback IDs (raw package_ids), use the package name directly
  fallbackPackageIds.forEach(id => {
    if (!nameMap[id]) nameMap[id] = pkgNameMap[id] || `Package #${id}`;
    if (!lifecycleMap[id]) lifecycleMap[id] = { start_date: null, end_date: null };
  });

  return { nameMap, lifecycleMap };
}

function formatLifecycle(start: string | null, end: string | null) {
  const s = start ? format(new Date(start), 'd MMM yyyy') : 'Unknown';
  const e = end ? format(new Date(end), 'd MMM yyyy') : 'Ongoing';
  return `${s} – ${e}`;
}

// ── Burndown Summary per package ────────────────────────────────────
function PackageBurndownCards({ tenantId }: { tenantId: number }) {
  const { data: burndown, isLoading } = useQuery({
    queryKey: ['package-burndown', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_package_burndown')
        .select('*')
        .eq('tenant_id', tenantId);
      if (error) throw error;

      const instanceIds = (data || []).map(r => r.package_instance_id).filter(Boolean) as number[];
      const { nameMap, lifecycleMap } = await resolvePackageNames(instanceIds);

      return (data || []).map(row => ({
        ...row,
        package_name: nameMap[row.package_instance_id!] || 'Unknown',
        lifecycle: lifecycleMap[row.package_instance_id!] || { start_date: null, end_date: null },
      }));
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  if (!burndown || burndown.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No package burndown data available
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {burndown.map(row => {
        const pct = row.percent_used ?? 0;
        const isOver = pct > 100;
        return (
          <Card key={row.package_instance_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{row.package_name}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {formatLifecycle(row.lifecycle.start_date, row.lifecycle.end_date)}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold">
                  {formatDuration(row.used_minutes ?? 0)}
                </span>
                <span className="text-sm text-muted-foreground">
                  / {formatDuration(row.included_minutes ?? 0)}
                </span>
              </div>
              <Progress
                value={Math.min(pct, 100)}
                className={cn('h-2', isOver && '[&>div]:bg-destructive')}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{Math.round(pct)}% used</span>
                <span className={cn(isOver ? 'text-destructive font-medium' : 'text-primary')}>
                  {isOver
                    ? `${formatDuration(Math.abs(row.remaining_minutes ?? 0))} over`
                    : `${formatDuration(row.remaining_minutes ?? 0)} remaining`}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Monthly summary per package ─────────────────────────────────────
function PackageTimeSummaryCards({ tenantId }: { tenantId: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['package-time-summary', tenantId],
    queryFn: async () => {
      // 1. Get aggregate summary from view
      const { data: summaryData, error } = await supabase
        .from('v_package_time_summary')
        .select('*')
        .eq('tenant_id', tenantId);
      if (error) throw error;

      const instanceIds = (summaryData || []).map(r => r.package_instance_id).filter(Boolean) as number[];
      if (instanceIds.length === 0) return [];

      // 2. Resolve names and lifecycle
      const { nameMap, lifecycleMap } = await resolvePackageNames(instanceIds);

      // 3. Fetch per-month breakdown from time_entries (include is_billable)
      // Fetch ALL entries for tenant - use coalesce logic to match the view
      const { data: monthlyRows } = await (supabase as any)
        .from('time_entries')
        .select('package_id, package_instance_id, start_at, duration_minutes, is_billable')
        .eq('tenant_id', tenantId);

      // Group by coalesce(package_instance_id, package_id) + month, tracking billable/non-billable
      const monthlyMap: Record<number, { month: string; minutes: number; billable: number; nonBillable: number }[]> = {};
      const instanceTotals: Record<number, { billable: number; nonBillable: number }> = {};
      (monthlyRows || []).forEach((row: any) => {
        if (!row.start_at) return;
        const instId = row.package_instance_id ?? row.package_id;
        if (!instId || !instanceIds.includes(instId)) return;
        const monthKey = format(new Date(row.start_at), 'yyyy-MM');
        const mins = row.duration_minutes || 0;
        if (!monthlyMap[instId]) monthlyMap[instId] = [];
        if (!instanceTotals[instId]) instanceTotals[instId] = { billable: 0, nonBillable: 0 };
        if (row.is_billable) {
          instanceTotals[instId].billable += mins;
        } else {
          instanceTotals[instId].nonBillable += mins;
        }
        const existing = monthlyMap[instId].find(m => m.month === monthKey);
        if (existing) {
          existing.minutes += mins;
          if (row.is_billable) existing.billable += mins; else existing.nonBillable += mins;
        } else {
          monthlyMap[instId].push({
            month: monthKey,
            minutes: mins,
            billable: row.is_billable ? mins : 0,
            nonBillable: row.is_billable ? 0 : mins,
          });
        }
      });
      // Sort each instance's months
      Object.values(monthlyMap).forEach(arr => arr.sort((a, b) => a.month.localeCompare(b.month)));

      return (summaryData || []).map(row => ({
        ...row,
        package_name: nameMap[row.package_instance_id!] || 'Unknown',
        lifecycle: lifecycleMap[row.package_instance_id!] || { start_date: null, end_date: null },
        monthly: monthlyMap[row.package_instance_id!] || [],
        billableTotals: instanceTotals[row.package_instance_id!] || { billable: 0, nonBillable: 0 },
      }));
    },
  });

  if (isLoading || !data || data.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {data.map(row => (
        <Card key={row.package_instance_id}>
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-sm font-medium">{row.package_name}</p>
              <p className="text-xs text-muted-foreground">
                {formatLifecycle(row.lifecycle.start_date, row.lifecycle.end_date)}
              </p>
            </div>

            {row.monthly.length > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <span>Monthly</span>
                  <span className="flex gap-2"><span>Total</span><span className="text-green-600">Bill</span><span>Non-bill</span></span>
                </div>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {row.monthly.map((m: { month: string; minutes: number; billable: number; nonBillable: number }) => (
                    <div key={m.month} className="flex justify-between text-xs gap-2">
                      <span className="text-muted-foreground">
                        {format(new Date(m.month + '-01'), 'MMM yyyy')}
                      </span>
                      <span className="flex gap-2">
                        <span className="font-medium">{formatDuration(m.minutes)}</span>
                        <span className="text-green-600">{formatDuration(m.billable)}</span>
                        <span className="text-muted-foreground">{formatDuration(m.nonBillable)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="flex gap-2 text-xs">
                <span className="font-semibold text-sm">{formatDuration(row.minutes_total ?? 0)}</span>
                <span className="text-green-600 font-medium">{formatDuration(row.billableTotals.billable)}</span>
                <span className="text-muted-foreground">{formatDuration(row.billableTotals.nonBillable)}</span>
              </span>
            </div>

            {row.last_entry_at && (
              <p className="text-xs text-muted-foreground">
                Last entry: {format(new Date(row.last_entry_at), 'd MMM yyyy')}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Stale drafts warning ────────────────────────────────────────────
function StaleDraftsWarning({ tenantId }: { tenantId: number }) {
  const { data } = useQuery({
    queryKey: ['stale-drafts', tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_time_drafts_stale')
        .select('*')
        .eq('tenant_id', tenantId);
      if (error) throw error;
      return data || [];
    },
  });

  const totalStale = data?.reduce((s, r) => s + (r.count_stale_over_2_days ?? 0), 0) ?? 0;
  if (totalStale === 0) return null;

  return (
    <div className="flex items-center gap-2 p-3 bg-accent/50 border border-border rounded-lg text-sm text-accent-foreground">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{totalStale} draft time {totalStale === 1 ? 'entry' : 'entries'} older than 2 days need attention.</span>
    </div>
  );
}

// ── Move Entry Dialog ───────────────────────────────────────────────
function MoveEntryDialog({
  open,
  onOpenChange,
  entry,
  tenantId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: TimeEntry | null;
  tenantId: number;
  onSuccess: () => void;
}) {
  const [targetPackageId, setTargetPackageId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const { data: packages } = useQuery({
    queryKey: ['active-packages', tenantId],
    queryFn: async () => {
      const { data: instances } = await (supabase as any)
        .from('package_instances')
        .select('id, package_id')
        .eq('tenant_id', tenantId)
        .eq('is_complete', false);
      const packageIds = [...new Set((instances || []).map((i: any) => i.package_id).filter(Boolean))];
      const { data: pkgs } = packageIds.length > 0
        ? await (supabase as any).from('packages').select('id, name').in('id', packageIds)
        : { data: [] };
      const pkgNames: Record<number, string> = {};
      (pkgs || []).forEach((p: any) => { pkgNames[p.id] = p.name; });
      return (instances || []).map((p: any) => ({
        id: p.package_id,
        name: pkgNames[p.package_id] || `Package #${p.package_id}`,
      }));
    },
    enabled: open,
  });

  const handleMove = async () => {
    if (!entry || !targetPackageId || !reason.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('move_time_entry_package', {
        p_time_entry_id: entry.id,
        p_new_package_id: parseInt(targetPackageId),
        p_reason: reason.trim(),
      });
      if (error) throw error;
      toast({ title: 'Entry moved successfully' });
      onSuccess();
      onOpenChange(false);
      setTargetPackageId('');
      setReason('');
    } catch (err: any) {
      toast({ title: 'Move failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="sm">
        <AppModalHeader>
          <AppModalTitle>Move Time Entry</AppModalTitle>
        </AppModalHeader>
        <AppModalBody className="space-y-4">
          {entry && (
            <p className="text-sm text-muted-foreground">
              Moving {formatDuration(entry.duration_minutes)} ({entry.work_type}) from{' '}
              {entry.start_at ? format(new Date(entry.start_at), 'd MMM yyyy') : 'N/A'}
            </p>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">Target Package</label>
            <Select value={targetPackageId} onValueChange={setTargetPackageId}>
              <SelectTrigger>
                <SelectValue placeholder="Select package" />
              </SelectTrigger>
              <SelectContent>
                {(packages || [])
                  .filter(p => p.id !== entry?.package_id)
                  .map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason (audit trail)</label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why is this entry being moved?"
              rows={2}
            />
          </div>
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleMove} disabled={submitting || !targetPackageId || !reason.trim()}>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Move Entry
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

// ── Split Entry Dialog ──────────────────────────────────────────────
function SplitEntryDialog({
  open,
  onOpenChange,
  entry,
  tenantId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: TimeEntry | null;
  tenantId: number;
  onSuccess: () => void;
}) {
  const [splits, setSplits] = useState<{ package_id: string; minutes: string }[]>([
    { package_id: '', minutes: '' },
    { package_id: '', minutes: '' },
  ]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const { data: packages } = useQuery({
    queryKey: ['active-packages', tenantId],
    queryFn: async () => {
      const { data: instances } = await (supabase as any)
        .from('package_instances')
        .select('id, package_id')
        .eq('tenant_id', tenantId)
        .eq('is_complete', false);
      const packageIds = [...new Set((instances || []).map((i: any) => i.package_id).filter(Boolean))];
      const { data: pkgs } = packageIds.length > 0
        ? await (supabase as any).from('packages').select('id, name').in('id', packageIds)
        : { data: [] };
      const pkgNames: Record<number, string> = {};
      (pkgs || []).forEach((p: any) => { pkgNames[p.id] = p.name; });
      return (instances || []).map((p: any) => ({
        id: p.package_id,
        name: pkgNames[p.package_id] || `Package #${p.package_id}`,
      }));
    },
    enabled: open,
  });

  const totalMinutes = splits.reduce((s, sp) => s + (parseInt(sp.minutes) || 0), 0);
  const isValid =
    entry &&
    splits.every(s => s.package_id && parseInt(s.minutes) > 0) &&
    totalMinutes === entry.duration_minutes &&
    reason.trim().length > 0;

  const handleSplit = async () => {
    if (!entry || !isValid) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('split_time_entry', {
        p_time_entry_id: entry.id,
        p_splits: splits.map(s => ({
          package_id: parseInt(s.package_id),
          minutes: parseInt(s.minutes),
        })),
        p_reason: reason.trim(),
      });
      if (error) throw error;
      toast({ title: 'Entry split successfully' });
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Split failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const addSplit = () => setSplits(prev => [...prev, { package_id: '', minutes: '' }]);
  const updateSplit = (idx: number, field: 'package_id' | 'minutes', value: string) => {
    setSplits(prev => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="md">
        <AppModalHeader>
          <AppModalTitle>Split Time Entry</AppModalTitle>
        </AppModalHeader>
        <AppModalBody className="space-y-4">
          {entry && (
            <p className="text-sm text-muted-foreground">
              Splitting {formatDuration(entry.duration_minutes)} into multiple entries.
              Total must equal {entry.duration_minutes} minutes.
            </p>
          )}
          <div className="space-y-3">
            {splits.map((split, idx) => (
              <div key={idx} className="flex gap-3 items-center">
                <Select value={split.package_id} onValueChange={v => updateSplit(idx, 'package_id', v)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Package" />
                  </SelectTrigger>
                  <SelectContent>
                    {(packages || []).map(p => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  className="w-24"
                  placeholder="Min"
                  value={split.minutes}
                  onChange={e => updateSplit(idx, 'minutes', e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={addSplit}>
              <Plus className="h-4 w-4 mr-1" /> Add row
            </Button>
            <span
              className={cn(
                'text-sm font-medium',
                entry && totalMinutes !== entry.duration_minutes
                  ? 'text-destructive'
                  : 'text-primary'
              )}
            >
              Total: {totalMinutes} / {entry?.duration_minutes ?? 0} min
            </span>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason (audit trail)</label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why is this entry being split?"
              rows={2}
            />
          </div>
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSplit} disabled={submitting || !isValid}>
            <Scissors className="h-4 w-4 mr-2" />
            Split Entry
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

// ── Reallocate Dialog ────────────────────────────────────────────────
function ReallocateDialog({
  open,
  onOpenChange,
  entry,
  tenantId,
  showScopeSelector,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: TimeEntry | null;
  tenantId: number;
  showScopeSelector: boolean;
  onSuccess: () => void;
}) {
  const [newScope, setNewScope] = useState<ScopeTag>('both');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  // Sync when entry changes
  useState(() => {
    if (entry) setNewScope((entry.scope_tag as ScopeTag) || 'both');
  });

  const handleReallocate = async () => {
    if (!entry || !reason.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('time_entries')
        .update({
          scope_tag: newScope,
          notes: entry.notes
            ? `${entry.notes} [Reallocated: ${reason.trim()}]`
            : `[Reallocated: ${reason.trim()}]`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id);
      if (error) throw error;
      toast({ title: 'Entry reallocated', description: `Scope changed to ${SCOPE_SHORT[newScope]}` });
      onSuccess();
      onOpenChange(false);
      setReason('');
    } catch (err: any) {
      toast({ title: 'Reallocation failed', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="sm">
        <AppModalHeader>
          <AppModalTitle>Reallocate Time Entry</AppModalTitle>
        </AppModalHeader>
        <AppModalBody className="space-y-4">
          {entry && (
            <p className="text-sm text-muted-foreground">
              Reallocating {formatDuration(entry.duration_minutes)} ({entry.work_type}) —
              currently <strong>{SCOPE_SHORT[(entry.scope_tag as ScopeTag) || 'both']}</strong>
            </p>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium">New Scope</label>
            <ScopeSelectorBadge
              value={newScope}
              onChange={setNewScope}
              showSelector={showScopeSelector}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Reason (audit trail)</label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why is this entry being reallocated?"
              rows={2}
            />
          </div>
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={handleReallocate}
            disabled={submitting || !reason.trim() || (entry && newScope === entry.scope_tag)}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reallocate
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

// ── Pagination Controls ─────────────────────────────────────────────
function PaginationBar({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <p className="text-sm text-muted-foreground">
        {totalItems} {totalItems === 1 ? 'entry' : 'entries'}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Main Tab Component ──────────────────────────────────────────────
export function ClientTimeTab({ tenantId, tenantName }: ClientTimeTabProps) {
  const { entries, loading, refresh: refreshTimeTracking } = useTimeTracking(tenantId);
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const membership = useTenantMemberships(tenantId);
  const [packageFilter, setPackageFilter] = useState('all');
  const [workTypeFilter, setWorkTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(1);
  const [moveEntry, setMoveEntry] = useState<TimeEntry | null>(null);
  const [splitEntry, setSplitEntry] = useState<TimeEntry | null>(null);
  const [reallocateEntry, setReallocateEntry] = useState<TimeEntry | null>(null);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<TimeEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const userIds = useMemo(() => [...new Set(entries.map(e => e.user_id).filter(Boolean))], [entries]);
  const { data: userMap = {} } = useQuery({
    queryKey: ['entry-user-names', userIds],
    queryFn: async () => {
      if (userIds.length === 0) return {};
      // Fetch all users including archived/disabled so time entries still show names
      const { data } = await (supabase as any)
        .from('users')
        .select('user_uuid, first_name, last_name, archived, disabled')
        .in('user_uuid', userIds);
      const map: Record<string, string> = {};
      (data || []).forEach((u: any) => {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown';
        const suffix = (u.archived || u.disabled) ? ' (Inactive)' : '';
        map[u.user_uuid] = name + suffix;
      });
      // For any user_id not found in the DB, mark as Former User
      userIds.forEach(id => {
        if (!map[id]) {
          map[id] = 'Former User';
        }
      });
      return map;
    },
    enabled: userIds.length > 0,
  });

  const isAdminOrStaff =
    profile?.global_role === 'SuperAdmin' ||
    profile?.unicorn_role === 'Super Admin' ||
    profile?.unicorn_role === 'Team Leader' ||
    profile?.unicorn_role === 'Team Member' ||
    profile?.unicorn_role === 'Admin';

  // Fetch active packages for filter dropdown
  const { data: activePackages } = useQuery({
    queryKey: ['active-packages', tenantId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('package_instances')
        .select('id, package_id, packages:package_id(name)')
        .eq('tenant_id', tenantId)
        .eq('is_complete', false);
      return (data || []).map((p: any) => ({
        id: p.package_id,
        name: p.packages?.name || `Package #${p.package_id}`,
      }));
    },
  });

  // Fetch ALL package instances (including inactive/complete) for display in time entries
  // Also resolve base package IDs that may appear in legacy time entries
  const { data: packageInstanceMap = {} } = useQuery({
    queryKey: ['all-package-instances', tenantId, entries.length],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('package_instances')
        .select('id, package_id, start_date, end_date, packages:package_id(name)')
        .eq('tenant_id', tenantId);
      const map: Record<number, { name: string; start_date: string; end_date: string | null }> = {};
      (data || []).forEach((p: any) => {
        map[p.id] = {
          name: p.packages?.name || `Package #${p.package_id}`,
          start_date: p.start_date,
          end_date: p.end_date,
        };
      });

      // Collect any entry package_ids not found in the instance map (legacy base package IDs)
      const unmatchedPkgIds = [...new Set(
        entries
          .map(e => e.package_id)
          .filter((pid): pid is number => pid != null && !map[pid])
      )];
      if (unmatchedPkgIds.length > 0) {
        const { data: basePkgs } = await (supabase as any)
          .from('packages')
          .select('id, name')
          .in('id', unmatchedPkgIds);
        (basePkgs || []).forEach((p: any) => {
          if (!map[p.id]) {
            map[p.id] = { name: p.name || `Package #${p.id}`, start_date: '', end_date: null };
          }
        });
      }

      return map;
    },
    enabled: entries.length > 0,
  });

  const hasMultiplePackages = (activePackages?.length ?? 0) > 1;

  const filteredEntries = useMemo(() => {
    let result = [...entries];
    if (packageFilter !== 'all') {
      result = result.filter(e => e.package_id === parseInt(packageFilter));
    }
    if (workTypeFilter !== 'all') {
      result = result.filter(e => e.work_type === workTypeFilter);
    }
    if (dateFrom) {
      const fromStart = new Date(dateFrom);
      fromStart.setHours(0, 0, 0, 0);
      result = result.filter(e => e.start_at && new Date(e.start_at) >= fromStart);
    }
    if (dateTo) {
      const toEnd = new Date(dateTo);
      toEnd.setHours(23, 59, 59, 999);
      result = result.filter(e => e.start_at && new Date(e.start_at) <= toEnd);
    }
    return result.sort((a, b) => {
      const da = a.start_at ? new Date(a.start_at).getTime() : 0;
      const db = b.start_at ? new Date(b.start_at).getTime() : 0;
      return db - da;
    });
  }, [entries, packageFilter, workTypeFilter, dateFrom, dateTo]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const paginatedEntries = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredEntries.slice(start, start + PAGE_SIZE);
  }, [filteredEntries, page]);

  // Reset page when filters change
  const handlePackageFilter = (v: string) => { setPackageFilter(v); setPage(1); };
  const handleWorkTypeFilter = (v: string) => { setWorkTypeFilter(v); setPage(1); };
  const handleDateFrom = (d: Date | undefined) => { setDateFrom(d); setPage(1); };
  const handleDateTo = (d: Date | undefined) => { setDateTo(d); setPage(1); };
  const hasDateFilter = !!dateFrom || !!dateTo;
  const clearDateFilter = () => { setDateFrom(undefined); setDateTo(undefined); setPage(1); };

  const handleRefresh = useCallback(() => {
    refreshTimeTracking();
    queryClient.invalidateQueries({ queryKey: ['package-burndown', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['package-time-summary', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['stale-drafts', tenantId] });
    queryClient.invalidateQueries({ queryKey: ['membership-combined-usage', tenantId] });
  }, [refreshTimeTracking, queryClient, tenantId]);

  // Listen for time-entry-changed events from other components (e.g. TenantTimeTrackerBar)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.tenantId === tenantId) {
        handleRefresh();
      }
    };
    window.addEventListener('time-entry-changed', handler);
    return () => window.removeEventListener('time-entry-changed', handler);
  }, [tenantId, handleRefresh]);

  // Inline toggle billable
  const handleToggleBillable = async (entry: TimeEntry) => {
    const newVal = !entry.is_billable;
    const { error } = await supabase
      .from('time_entries')
      .update({ is_billable: newVal, updated_at: new Date().toISOString() } as any)
      .eq('id', entry.id);

    if (error) {
      toast({ title: 'Failed to update billable', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: newVal ? 'Marked as billable' : 'Marked as non-billable' });
    handleRefresh();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stale Drafts */}
      <StaleDraftsWarning tenantId={tenantId} />

      {/* Burndown + Weights side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Package Burndown
          </h3>
          <PackageBurndownCards tenantId={tenantId} />
        </div>
        <MembershipWeightsPanel tenantId={tenantId} />
      </div>

      {/* Time Summary */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Monthly Summary
        </h3>
        <PackageTimeSummaryCards tenantId={tenantId} />
      </div>

      {/* Entries Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">Time Entries</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => {
                  // Build padded text table
                  const rows = filteredEntries.map(e => ({
                    date: e.start_at ? format(new Date(e.start_at), 'd MMM yyyy') : 'N/A',
                    user: userMap[e.user_id] || 'Unknown',
                    dur: formatDuration(e.duration_minutes),
                    type: e.work_type.replace('_', ' '),
                    billable: e.is_billable ? 'Yes' : 'No',
                    notes: (e.notes || '—').substring(0, 40),
                  }));
                  const header = { date: 'Date', user: 'User', dur: 'Duration', type: 'Type', billable: 'Billable', notes: 'Notes' };
                  const all = [header, ...rows];
                  const w = {
                    date: Math.max(...all.map(r => r.date.length)),
                    user: Math.max(...all.map(r => r.user.length)),
                    dur: Math.max(...all.map(r => r.dur.length)),
                    type: Math.max(...all.map(r => r.type.length)),
                    billable: Math.max(...all.map(r => r.billable.length)),
                    notes: Math.max(...all.map(r => r.notes.length)),
                  };
                  const fmt = (r: typeof header) =>
                    `| ${r.date.padEnd(w.date)} | ${r.user.padEnd(w.user)} | ${r.dur.padEnd(w.dur)} | ${r.type.padEnd(w.type)} | ${r.billable.padEnd(w.billable)} | ${r.notes.padEnd(w.notes)} |`;
                  const sep = `|${'-'.repeat(w.date + 2)}|${'-'.repeat(w.user + 2)}|${'-'.repeat(w.dur + 2)}|${'-'.repeat(w.type + 2)}|${'-'.repeat(w.billable + 2)}|${'-'.repeat(w.notes + 2)}|`;
                  const table = [fmt(header), sep, ...rows.map(fmt)].join('\n');
                  const totalMins = filteredEntries.reduce((s, e) => s + e.duration_minutes, 0);
                  const billableMins = filteredEntries.filter(e => e.is_billable).reduce((s, e) => s + e.duration_minutes, 0);
                  const nonBillableMins = totalMins - billableMins;
                  const body = `Time Entries for ${tenantName}\nTotal: ${formatDuration(totalMins)} | Billable: ${formatDuration(billableMins)} | Non-billable: ${formatDuration(nonBillableMins)}\n\n${table}`;
                  const subject = encodeURIComponent(`Time Entries - ${tenantName}`);
                  window.open(`mailto:?subject=${subject}&body=${encodeURIComponent(body)}`, '_self');
                }}
              >
                <Mail className="h-3.5 w-3.5" /> Email
              </Button>
              {hasMultiplePackages && (
                <Select value={packageFilter} onValueChange={handlePackageFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Packages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Packages</SelectItem>
                    {(activePackages || []).map(p => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={workTypeFilter} onValueChange={handleWorkTypeFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Work type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="consultation">Consultation</SelectItem>
                  <SelectItem value="document_review">Document Review</SelectItem>
                  <SelectItem value="training">Training</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                </SelectContent>
              </Select>

              {/* Date range filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={hasDateFilter ? "default" : "outline"}
                    size="sm"
                    className="h-8 gap-1 text-xs min-w-[200px] justify-start"
                  >
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {dateFrom && dateTo
                      ? `${format(dateFrom, 'd MMM yyyy')} – ${format(dateTo, 'd MMM yyyy')}`
                      : dateFrom
                        ? `From ${format(dateFrom, 'd MMM yyyy')}`
                        : dateTo
                          ? `To ${format(dateTo, 'd MMM yyyy')}`
                          : 'Date range'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-4" align="end">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">From</p>
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={handleDateFrom}
                        className="pointer-events-auto"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">To</p>
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={handleDateTo}
                        disabled={(date) => dateFrom ? date < dateFrom : false}
                        className="pointer-events-auto"
                      />
                    </div>
                    {hasDateFilter && (
                      <Button variant="ghost" size="sm" className="w-full" onClick={clearDateFilter}>
                        <X className="h-3.5 w-3.5 mr-1" />
                        Clear dates
                      </Button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No time entries found</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                   <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Billable</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedEntries.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap">
                        {entry.start_at
                          ? format(new Date(entry.start_at), 'd MMM yyyy')
                          : 'N/A'}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {userMap[entry.user_id] || '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.package_id && packageInstanceMap[entry.package_id] ? (
                          <div>
                            <p className="font-medium truncate max-w-[180px]">{packageInstanceMap[entry.package_id].name}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(packageInstanceMap[entry.package_id].start_date), 'd MMM yyyy')}
                              {' – '}
                              {packageInstanceMap[entry.package_id].end_date
                                ? format(new Date(packageInstanceMap[entry.package_id].end_date), 'd MMM yyyy')
                                : 'Ongoing'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatDuration(entry.duration_minutes)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">
                          {entry.work_type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {entry.source === 'timer' ? (
                            <><Timer className="h-3 w-3 mr-1" /> Timer</>
                          ) : (
                            <><FileText className="h-3 w-3 mr-1" /> Manual</>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => handleToggleBillable(entry)}
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          title={`Click to mark as ${entry.is_billable ? 'non-billable' : 'billable'}`}
                        >
                          {entry.is_billable ? (
                            <Badge variant="default" className="text-xs gap-1">
                              <DollarSign className="h-3 w-3" /> Yes
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">No</span>
                          )}
                        </button>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {entry.notes || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => setEditEntry(entry)}
                            title="View / Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {isAdminOrStaff && membership.showScopeSelector && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => setReallocateEntry(entry)}
                              title="Reallocate scope"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {hasMultiplePackages && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => setMoveEntry(entry)}
                                title="Move to another package"
                              >
                                <ArrowRightLeft className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => setSplitEntry(entry)}
                                title="Split across packages"
                              >
                                <Scissors className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => setDeleteEntry(entry)}
                            title="Delete entry"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <PaginationBar
                page={page}
                totalPages={totalPages}
                totalItems={filteredEntries.length}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Move Dialog */}
      <MoveEntryDialog
        open={!!moveEntry}
        onOpenChange={v => !v && setMoveEntry(null)}
        entry={moveEntry}
        tenantId={tenantId}
        onSuccess={handleRefresh}
      />

      {/* Split Dialog */}
      <SplitEntryDialog
        open={!!splitEntry}
        onOpenChange={v => !v && setSplitEntry(null)}
        entry={splitEntry}
        tenantId={tenantId}
        onSuccess={handleRefresh}
      />

      {/* Reallocate Dialog */}
      <ReallocateDialog
        open={!!reallocateEntry}
        onOpenChange={v => !v && setReallocateEntry(null)}
        entry={reallocateEntry}
        tenantId={tenantId}
        showScopeSelector={membership.showScopeSelector}
        onSuccess={handleRefresh}
      />

      {/* Edit Dialog */}
      <EditTimeDialog
        open={!!editEntry}
        onOpenChange={v => !v && setEditEntry(null)}
        entry={editEntry}
        onSuccess={handleRefresh}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        open={!!deleteEntry}
        onOpenChange={v => !v && setDeleteEntry(null)}
        title="Delete Time Entry"
        description="Are you sure you want to delete this time entry? This action cannot be undone."
        itemName={deleteEntry ? `${formatDuration(deleteEntry.duration_minutes)} on ${deleteEntry.start_at ? format(new Date(deleteEntry.start_at), 'd MMM yyyy') : 'N/A'}` : undefined}
        isDeleting={isDeleting}
        onConfirm={async () => {
          if (!deleteEntry) return;
          setIsDeleting(true);
          const { error } = await supabase
            .from('time_entries')
            .delete()
            .eq('id', deleteEntry.id);
          setIsDeleting(false);
          if (error) {
            toast({ title: 'Failed to delete', description: error.message, variant: 'destructive' });
          } else {
            setDeleteEntry(null);
            handleRefresh();
            toast({ title: 'Time entry deleted' });
          }
        }}
      />
    </div>
  );
}

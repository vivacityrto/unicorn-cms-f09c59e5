import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format, differenceInMonths, differenceInDays } from 'date-fns';
import { CalendarIcon, AlertTriangle, Save, Database, ArrowUpDown, Trash2, Wrench } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/audit/DeleteConfirmDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PackageDataManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  tenantName?: string;
  onSuccess?: () => void;
}

interface PackageInstanceRow {
  id: number;
  package_id: number;
  package_name: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  is_complete: boolean;
  membership_state: string | null;
  included_minutes: number;
}

interface RowEdits {
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
  is_complete?: boolean;
  included_minutes?: number;
}

export function PackageDataManager({ open, onOpenChange, tenantId, tenantName, onSuccess }: PackageDataManagerProps) {
  const [rows, setRows] = useState<PackageInstanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState<Record<number, RowEdits>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<'start' | 'package_start'>('start');
  const [deletingRow, setDeletingRow] = useState<PackageInstanceRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [stageCounts, setStageCounts] = useState<Record<number, { present: number; total: number; missing: { stage_id: number; name: string; sort_order: number }[] }>>({});
  const [auditTarget, setAuditTarget] = useState<PackageInstanceRow | null>(null);
  const [auditing, setAuditing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);


    // Fetch instances and package names separately (no FK relationship in schema)
    const [instancesRes, packagesRes] = await Promise.all([
      supabase
        .from('package_instances')
        .select('id, package_id, start_date, end_date, is_active, is_complete, membership_state, included_minutes')
        .eq('tenant_id', tenantId)
        .order('start_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('packages')
        .select('id, name'),
    ]);

    if (instancesRes.error) {
      toast({ title: 'Error loading packages', description: instancesRes.error.message, variant: 'destructive' });
    } else if (instancesRes.data) {
      const packageNames = new Map<number, string>();
      (packagesRes.data ?? []).forEach((p) => packageNames.set(p.id, p.name));

      const mapped: PackageInstanceRow[] = instancesRes.data.map((d) => ({
        id: d.id,
        package_id: d.package_id,
        package_name: packageNames.get(d.package_id) ?? `Package #${d.package_id}`,
        start_date: d.start_date,
        end_date: d.end_date,
        is_active: d.is_active ?? false,
        is_complete: d.is_complete ?? false,
        membership_state: d.membership_state,
        included_minutes: d.included_minutes ?? 0,
      }));
      setRows(mapped);

      // Compute per-instance stage audit (template total vs present)
      const pkgIds = Array.from(new Set(mapped.map(r => r.package_id)));
      const instIds = mapped.map(r => r.id);
      if (instIds.length > 0) {
        const [tplRes, instStagesRes] = await Promise.all([
          supabase
            .from('package_stages')
            .select('package_id, stage_id, sort_order, stages:stage_id(id, name)')
            .in('package_id', pkgIds),
          supabase
            .from('stage_instances')
            .select('packageinstance_id, stage_id')
            .in('packageinstance_id', instIds),
        ]);

        const tplByPkg = new Map<number, { stage_id: number; name: string; sort_order: number }[]>();
        (tplRes.data ?? []).forEach((t) => {
          const arr = tplByPkg.get(t.package_id) ?? [];
          arr.push({ stage_id: Number(t.stage_id), name: t.stages?.name ?? `Stage #${t.stage_id}`, sort_order: t.sort_order });
          tplByPkg.set(t.package_id, arr);
        });

        const presentByInst = new Map<number, Set<number>>();
        (instStagesRes.data ?? []).forEach((si) => {
          const set = presentByInst.get(si.packageinstance_id) ?? new Set<number>();
          set.add(Number(si.stage_id));
          presentByInst.set(si.packageinstance_id, set);
        });

        const counts: Record<number, { present: number; total: number; missing: { stage_id: number; name: string; sort_order: number }[] }> = {};
        mapped.forEach(r => {
          const tpl = tplByPkg.get(r.package_id) ?? [];
          const present = presentByInst.get(r.id) ?? new Set<number>();
          const missing = tpl.filter(t => !present.has(t.stage_id)).sort((a, b) => a.sort_order - b.sort_order);
          counts[r.id] = { present: present.size, total: tpl.length, missing };
        });
        setStageCounts(counts);
      } else {
        setStageCounts({});
      }
    }
    setEdits({});
    setLoading(false);
  }, [tenantId]);


  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const getEffective = (row: PackageInstanceRow): PackageInstanceRow & RowEdits => {
    const e = edits[row.id] || {};
    return {
      ...row,
      start_date: e.start_date !== undefined ? e.start_date : row.start_date,
      end_date: e.end_date !== undefined ? e.end_date : row.end_date,
      is_active: e.is_active !== undefined ? e.is_active : row.is_active,
      is_complete: e.is_complete !== undefined ? e.is_complete : row.is_complete,
      included_minutes: e.included_minutes !== undefined ? e.included_minutes : row.included_minutes,
    };
  };

  const setEdit = <K extends keyof RowEdits>(id: number, field: K, value: RowEdits[K]) => {
    setEdits(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const hasEdits = (id: number) => {
    const e = edits[id];
    return e && Object.keys(e).length > 0;
  };

  const handleSave = async (row: PackageInstanceRow) => {
    const e = edits[row.id];
    if (!e) return;

    setSavingId(row.id);
    const eff = getEffective(row);

    const updateData: { start_date?: string | null; end_date?: string | null; is_active?: boolean; included_minutes?: number; is_complete?: boolean } = {};
    if (e.start_date !== undefined) updateData.start_date = e.start_date;
    if (e.end_date !== undefined) updateData.end_date = e.end_date;
    if (e.is_active !== undefined) updateData.is_active = e.is_active;
    if (e.included_minutes !== undefined) updateData.included_minutes = e.included_minutes;
    // If deactivating and completing, auto-set end_date
    if (e.is_active === false && eff.is_complete && !eff.end_date) {
      updateData.end_date = new Date().toISOString().split('T')[0];
    }

    // Route the complete transition through transition_membership_state so it's
    // logged (package_instance_state_log + the internal Timeline trigger) instead
    // of silently flipping membership_state via a raw update.
    if (e.is_complete === true) {
      const { error: transitionError } = await supabase.rpc('transition_membership_state', {
        p_instance_id: row.id,
        p_new_state: 'complete',
        p_reason: 'Marked complete via package admin panel',
      });
      if (transitionError) {
        toast({ title: 'Save failed', description: transitionError.message, variant: 'destructive' });
        setSavingId(null);
        return;
      }
    } else if (e.is_complete === false) {
      updateData.is_complete = false;
    }

    const { error } = Object.keys(updateData).length > 0
      ? await supabase
          .from('package_instances')
          .update(updateData as never)
          .eq('id', row.id)
      : { error: null };

    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saved', description: `${row.package_name} updated.` });
      // Clear edits for this row and refresh
      setEdits(prev => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await fetchData();
      onSuccess?.();
    }
    setSavingId(null);
  };

  const canDelete = (row: PackageInstanceRow) => {
    if (!row.is_complete) return false;
    if (!row.start_date || !row.end_date) return false;
    return differenceInDays(new Date(row.end_date), new Date(row.start_date)) < 7;
  };

  const handleDelete = async (row: PackageInstanceRow) => {
    setIsDeleting(true);
    try {
      // 1. Delete child stage data (task_instances, email_instances, document_instances via stage)
      const { data: stages } = await supabase
        .from('stage_instances')
        .select('id')
        .eq('packageinstance_id', row.id);

      if (stages && stages.length > 0) {
        const stageIds = stages.map(s => s.id);
        await supabase.from('client_task_instances').delete().in('stageinstance_id', stageIds);
        await supabase.from('email_instances').delete().in('stageinstance_id', stageIds);
        await supabase.from('document_instances').delete().in('stageinstance_id', stageIds);
        await supabase.from('stage_instances').delete().in('id', stageIds);
      }

      // 2. Delete time entries
      await supabase.from('time_entries').delete().eq('package_instance_id', row.id);

      // 3. Delete phase instances
      await supabase.from('phase_instances').delete().eq('package_instance_id', row.id);

      // 4. Delete package_instance_state_log
      await supabase.from('package_instance_state_log').delete().eq('package_instance_id', row.id);

      // 5. Delete compliance_score_snapshots
      await supabase.from('compliance_score_snapshots').delete().eq('package_instance_id', row.id);

      // 6. Delete the package instance itself
      const { error } = await supabase.from('package_instances').delete().eq('id', row.id);

      if (error) throw error;

      toast({ title: 'Deleted', description: `${row.package_name} instance removed.` });
      setDeletingRow(null);
      await fetchData();
      onSuccess?.();
    } catch (err) {
      toast({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAuditStages = async (row: PackageInstanceRow) => {
    setAuditing(true);
    try {
      const { data, error } = await supabase.rpc('repair_package_instance_stages', {
        p_package_instance_id: row.id,
        p_dry_run: false,
      });
      if (error) throw error;
      const inserted = (data as { inserted_count?: number } | null)?.inserted_count ?? 0;
      toast({ title: 'Stages repaired', description: `${inserted} missing stage${inserted === 1 ? '' : 's'} added to ${row.package_name}.` });
      setAuditTarget(null);
      await fetchData();
      onSuccess?.();
    } catch (err) {
      toast({ title: 'Audit failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setAuditing(false);
    }
  };


  const sortedRows = [...rows].sort((a, b) => {
    if (sortMode === 'package_start') {
      const nameCmp = a.package_name.localeCompare(b.package_name);
      if (nameCmp !== 0) return nameCmp;
    }
    const aDate = a.start_date ?? '';
    const bDate = b.start_date ?? '';
    return aDate.localeCompare(bDate);
  });

  // Detect issues
  const effectiveRows = rows.map(r => getEffective(r));
  const activeByType = new Map<number, number>();
  effectiveRows.forEach(r => {
    if (r.is_active && !r.is_complete) {
      activeByType.set(r.package_id, (activeByType.get(r.package_id) || 0) + 1);
    }
  });
  const duplicateTypes = Array.from(activeByType.entries()).filter(([, count]) => count > 1);
  const duplicatePackageIds = new Set(duplicateTypes.map(([id]) => id));

  const getRowClass = (eff: ReturnType<typeof getEffective>) => {
    if (eff.is_complete) return 'bg-muted/40';
    if (eff.is_active) {
      // Check for issues
      const isOldNoEnd = !eff.end_date && eff.start_date && differenceInMonths(new Date(), new Date(eff.start_date)) > 12;
      const isDuplicate = duplicatePackageIds.has(eff.package_id);
      if (isOldNoEnd || isDuplicate) return 'bg-amber-50 dark:bg-amber-950/20';
      return 'bg-green-50 dark:bg-green-950/20';
    }
    return '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Package Data Manager {tenantName ? `— ${tenantName}` : ''}
          </DialogTitle>
          <DialogDescription>
            View and edit all package instances for this tenant. Changes are saved per row.
          </DialogDescription>
        </DialogHeader>

        {/* Duplicate warning */}
        {duplicateTypes.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Duplicate active packages detected: {duplicateTypes.map(([id, count]) => {
                const name = rows.find(r => r.package_id === id)?.package_name;
                return `${name} (×${count})`;
              }).join(', ')}
            </span>
          </div>
        )}

        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    className="flex items-center gap-1 hover:text-foreground"
                    onClick={() => setSortMode('package_start')}
                  >
                    Package
                    <ArrowUpDown className={cn("h-3 w-3", sortMode === 'package_start' && "text-primary")} />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    className="flex items-center gap-1 hover:text-foreground"
                    onClick={() => setSortMode('start')}
                  >
                    Start Date
                    <ArrowUpDown className={cn("h-3 w-3", sortMode === 'start' && "text-primary")} />
                  </button>
                </TableHead>
                <TableHead>End Date</TableHead>
                <TableHead className="text-right">Included Hrs</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-center">Complete</TableHead>
                <TableHead className="text-center">Stages</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No package instances found.
                  </TableCell>
                </TableRow>

              ) : (
                sortedRows.map(row => {
                  const eff = getEffective(row);
                  return (
                    <TableRow key={row.id} className={getRowClass(eff)}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {row.package_name}
                      </TableCell>
                      <TableCell>
                        <DatePickerCell
                          value={eff.start_date}
                          onChange={(v) => setEdit(row.id, 'start_date', v)}
                        />
                      </TableCell>
                      <TableCell>
                      <DatePickerCell
                          value={eff.end_date}
                          onChange={(v) => {
                            setEdits(prev => ({
                              ...prev,
                              [row.id]: {
                                ...prev[row.id],
                                end_date: v,
                                // Setting an end date auto-deactivates and completes
                                ...(v ? { is_active: false, is_complete: true } : {}),
                              },
                            }));
                          }}
                          clearable
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          className="w-[70px] text-right text-xs border rounded px-1.5 py-1 bg-background"
                          value={Math.round((eff.included_minutes / 60) * 100) / 100}
                          onChange={(e) => {
                            const hrs = parseFloat(e.target.value) || 0;
                            setEdit(row.id, 'included_minutes', Math.round(hrs * 60));
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={eff.is_active}
                          onCheckedChange={(v) => {
                            setEdits(prev => ({
                              ...prev,
                              [row.id]: {
                                ...prev[row.id],
                                is_active: v,
                                // Deactivating auto-completes
                                ...(!v ? { is_complete: true } : {}),
                              },
                            }));
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={eff.is_complete}
                          onCheckedChange={(v) => setEdit(row.id, 'is_complete', v)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const sc = stageCounts[row.id];
                          if (!sc) return <span className="text-xs text-muted-foreground">—</span>;
                          const ok = sc.total > 0 && sc.present >= sc.total;
                          const empty = sc.total === 0;
                          return (
                            <div className="flex items-center justify-center gap-1.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs font-mono',
                                  empty && 'border-muted text-muted-foreground',
                                  ok && 'border-green-600 text-green-700 dark:text-green-400',
                                  !ok && !empty && 'border-amber-600 text-amber-700 dark:text-amber-400'
                                )}
                                title={sc.missing.length ? `Missing: ${sc.missing.map(m => m.name).join(', ')}` : 'In sync'}
                              >
                                {sc.present}/{sc.total}
                              </Badge>
                              {!ok && !empty && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/40"
                                  onClick={() => setAuditTarget(row)}
                                  title="Add missing stages from template"
                                >
                                  <Wrench className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>

                        <div className="flex items-center gap-1">
                          {hasEdits(row.id) && (
                            <Button
                              size="sm"
                              onClick={() => handleSave(row)}
                              disabled={savingId === row.id}
                            >
                              <Save className="h-3 w-3 mr-1" />
                              {savingId === row.id ? '…' : 'Save'}
                            </Button>
                          )}
                          {canDelete(row) && !hasEdits(row.id) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeletingRow(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <DeleteConfirmDialog
          open={!!deletingRow}
          onOpenChange={(open) => { if (!open) setDeletingRow(null); }}
          title="Delete Package Instance"
          description={`This will permanently delete this package instance and all associated phase, stage, task, email, and document data. This cannot be undone.`}
          itemName={deletingRow ? `${deletingRow.package_name} (${deletingRow.start_date ? format(new Date(deletingRow.start_date + 'T00:00:00'), 'dd MMM yyyy') : 'No start'} – ${deletingRow.end_date ? format(new Date(deletingRow.end_date + 'T00:00:00'), 'dd MMM yyyy') : 'No end'})` : ''}
          onConfirm={() => deletingRow && handleDelete(deletingRow)}
          isDeleting={isDeleting}
        />

        {auditTarget && (
          <ConfirmDialog
            open={!!auditTarget}
            onOpenChange={(open) => { if (!open) setAuditTarget(null); }}
            variant="warning"
            title="Audit & repair stages"
            description={`Add ${stageCounts[auditTarget.id]?.missing.length ?? 0} missing stage(s) from the template to ${auditTarget.package_name}? Missing: ${(stageCounts[auditTarget.id]?.missing ?? []).map(m => m.name).join(', ') || 'none'}.`}
            confirmText="Add missing stages"
            onConfirm={() => handleAuditStages(auditTarget)}
            isLoading={auditing}
          />
        )}

      </DialogContent>
    </Dialog>
  );
}

// Inline date picker cell with month/year selectors
function DatePickerCell({
  value,
  onChange,
  clearable = false,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  clearable?: boolean;
}) {
  const date = useMemo(() => (value ? new Date(value + 'T00:00:00') : undefined), [value]);
  const [displayMonth, setDisplayMonth] = useState<Date>(date ?? new Date());

  // Sync display month when the value changes externally
  useEffect(() => {
    if (date) setDisplayMonth(date);
  }, [date]);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => currentYear - 10 + i);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'w-[130px] justify-start text-left font-normal h-8 text-xs',
            !date && 'text-muted-foreground'
          )}
        >
          <CalendarIcon className="h-3 w-3 mr-1" />
          {date ? format(date, 'dd MMM yyyy') : 'Not set'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {/* Month / Year selectors */}
        <div className="flex items-center gap-1 px-3 pt-3 pb-1">
          <select
            className="text-sm border rounded px-1.5 py-1 bg-background"
            value={displayMonth.getMonth()}
            onChange={(e) => {
              const m = new Date(displayMonth);
              m.setMonth(Number(e.target.value));
              setDisplayMonth(m);
            }}
          >
            {months.map((label, i) => (
              <option key={i} value={i}>{label}</option>
            ))}
          </select>
          <select
            className="text-sm border rounded px-1.5 py-1 bg-background"
            value={displayMonth.getFullYear()}
            onChange={(e) => {
              const m = new Date(displayMonth);
              m.setFullYear(Number(e.target.value));
              setDisplayMonth(m);
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => onChange(d ? format(d, 'yyyy-MM-dd') : null)}
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          defaultMonth={date}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
        {clearable && date && (
          <div className="px-3 pb-3">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(null)}>
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

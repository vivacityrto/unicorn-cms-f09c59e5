import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { format, differenceInMonths } from 'date-fns';
import { CalendarIcon, AlertTriangle, Save, Database } from 'lucide-react';
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
}

interface RowEdits {
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
  is_complete?: boolean;
}

export function PackageDataManager({ open, onOpenChange, tenantId, onSuccess }: PackageDataManagerProps) {
  const [rows, setRows] = useState<PackageInstanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [edits, setEdits] = useState<Record<number, RowEdits>>({});
  const [savingId, setSavingId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch instances and package names separately (no FK relationship in schema)
    const [instancesRes, packagesRes] = await Promise.all([
      supabase
        .from('package_instances')
        .select('id, package_id, start_date, end_date, is_active, is_complete, membership_state')
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
      (packagesRes.data ?? []).forEach((p: any) => packageNames.set(p.id, p.name));

      const mapped: PackageInstanceRow[] = instancesRes.data.map((d: any) => ({
        id: d.id,
        package_id: d.package_id,
        package_name: packageNames.get(d.package_id) ?? `Package #${d.package_id}`,
        start_date: d.start_date,
        end_date: d.end_date,
        is_active: d.is_active ?? false,
        is_complete: d.is_complete ?? false,
        membership_state: d.membership_state,
      }));
      setRows(mapped);
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
    };
  };

  const setEdit = (id: number, field: keyof RowEdits, value: any) => {
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

    const updateData: Record<string, any> = {};
    if (e.start_date !== undefined) updateData.start_date = e.start_date;
    if (e.end_date !== undefined) updateData.end_date = e.end_date;
    if (e.is_active !== undefined) updateData.is_active = e.is_active;
    if (e.is_complete !== undefined) {
      updateData.is_complete = e.is_complete;
      if (e.is_complete) {
        updateData.membership_state = 'complete';
        // Auto-set end_date to today if blank
        if (!eff.end_date) {
          updateData.end_date = new Date().toISOString().split('T')[0];
        }
      }
    }
    // If deactivating and completing, auto-set end_date
    if (e.is_active === false && eff.is_complete && !eff.end_date) {
      updateData.end_date = new Date().toISOString().split('T')[0];
    }

    const { error } = await supabase
      .from('package_instances')
      .update(updateData)
      .eq('id', row.id);

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
            Package Data Manager
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
                <TableHead>Package</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-center">Complete</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No package instances found.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map(row => {
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
                          onChange={(v) => setEdit(row.id, 'end_date', v)}
                          clearable
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={eff.is_active}
                          onCheckedChange={(v) => setEdit(row.id, 'is_active', v)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={eff.is_complete}
                          onCheckedChange={(v) => setEdit(row.id, 'is_complete', v)}
                        />
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Inline date picker cell
function DatePickerCell({
  value,
  onChange,
  clearable = false,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  clearable?: boolean;
}) {
  const date = value ? new Date(value + 'T00:00:00') : undefined;

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
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => onChange(d ? format(d, 'yyyy-MM-dd') : null)}
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

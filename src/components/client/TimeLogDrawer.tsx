import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal, 
  Trash2, 
  Clock, 
  Timer,
  FileEdit,
  DollarSign,
  ArrowRightLeft,
  Check,
  X,
  Loader2
} from 'lucide-react';
import { useTimeTracking, formatDuration, TimeEntry } from '@/hooks/useTimeTracking';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TimeLogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: number;
}

interface PackageInstanceOption {
  id: number;
  package_id: number;
  package_name: string;
  start_date: string | null;
  end_date: string | null;
  is_complete: boolean;
}

const WORK_TYPE_LABELS: Record<string, string> = {
  general: 'General',
  consultation: 'Consultation',
  document_review: 'Document Review',
  training: 'Training',
  meeting: 'Meeting',
  support: 'Support',
  admin: 'Admin'
};

export function TimeLogDrawer({ open, onOpenChange, clientId }: TimeLogDrawerProps) {
  const { user, isSuperAdmin } = useAuth();
  const { entries, loading, deleteEntry, summary, refresh } = useTimeTracking(clientId);
  const { toast } = useToast();
  const [workTypeFilter, setWorkTypeFilter] = useState<string>('all');
  const [billableFilter, setBillableFilter] = useState<string>('all');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editPackageInstanceId, setEditPackageInstanceId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [packageInstances, setPackageInstances] = useState<PackageInstanceOption[]>([]);

  // Fetch all package instances for this client (including completed, for reassignment)
  const fetchPackageInstances = useCallback(async () => {
    if (!clientId) return;

    const { data: instances, error } = await supabase
      .from('package_instances')
      .select('id, package_id, start_date, end_date, is_complete')
      .eq('tenant_id', clientId)
      .order('start_date', { ascending: false });

    if (error || !instances) return;

    const packageIds = [...new Set(instances.map(i => i.package_id))];
    const { data: packages } = await supabase
      .from('packages')
      .select('id, name')
      .in('id', packageIds);

    const pkgMap = new Map((packages || []).map(p => [p.id, p.name]));

    setPackageInstances(instances.map(inst => ({
      id: inst.id,
      package_id: inst.package_id,
      package_name: pkgMap.get(inst.package_id) || `Package #${inst.package_id}`,
      start_date: inst.start_date,
      end_date: inst.end_date,
      is_complete: inst.is_complete ?? false,
    })));
  }, [clientId]);

  useEffect(() => {
    if (open) fetchPackageInstances();
  }, [open, fetchPackageInstances]);

  const filteredEntries = entries.filter((entry) => {
    if (workTypeFilter !== 'all' && entry.work_type !== workTypeFilter) return false;
    if (billableFilter === 'billable' && !entry.is_billable) return false;
    if (billableFilter === 'non-billable' && entry.is_billable) return false;
    return true;
  });

  const canEdit = (entry: TimeEntry) => {
    return entry.user_id === user?.id || isSuperAdmin();
  };

  const handleDelete = async (entryId: string) => {
    if (confirm('Delete this time entry?')) {
      await deleteEntry(entryId);
    }
  };

  const startEditing = (entry: TimeEntry) => {
    setEditingEntryId(entry.id);
    setEditPackageInstanceId(entry.package_instance_id?.toString() || 'none');
  };

  const cancelEditing = () => {
    setEditingEntryId(null);
    setEditPackageInstanceId('');
  };

  const savePackageInstance = async (entryId: string) => {
    setSaving(true);
    const newInstanceId = editPackageInstanceId === 'none' ? null : Number(editPackageInstanceId);

    // Find the package_id from the instance
    const instance = packageInstances.find(pi => pi.id === newInstanceId);
    const newPackageId = instance ? instance.package_id : null;

    const { error } = await supabase
      .from('time_entries')
      .update({ 
        package_instance_id: newInstanceId,
        package_id: newPackageId ?? undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', entryId);

    setSaving(false);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Updated', description: 'Package instance reassigned.' });
      setEditingEntryId(null);
      refresh();
    }
  };

  const getInstanceLabel = (instanceId: number | null) => {
    if (!instanceId) return 'Unassigned';
    const inst = packageInstances.find(pi => pi.id === instanceId);
    if (!inst) return `#${instanceId}`;
    const dateLabel = inst.start_date ? format(new Date(inst.start_date), 'MMM yyyy') : '';
    return `${inst.package_name}${dateLabel ? ` (${dateLabel})` : ''}`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Time Log
          </SheetTitle>
          <SheetDescription>
            View and manage time entries for this client.
          </SheetDescription>
        </SheetHeader>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3 my-6">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">This Week</p>
            <p className="text-lg font-semibold">{formatDuration(summary.thisWeek)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">This Month</p>
            <p className="text-lg font-semibold">{formatDuration(summary.thisMonth)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Last 90 Days</p>
            <p className="text-lg font-semibold">{formatDuration(summary.last90Days)}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          <Select value={workTypeFilter} onValueChange={setWorkTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Work Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(WORK_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={billableFilter} onValueChange={setBillableFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Billable" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="billable">Billable</SelectItem>
              <SelectItem value="non-billable">Non-billable</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Entries table */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No time entries found.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Package Instance</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {entry.start_at 
                          ? format(new Date(entry.start_at), 'MMM d, yyyy')
                          : format(new Date(entry.created_at), 'MMM d, yyyy')
                        }
                      </p>
                      {entry.notes && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {entry.notes}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{formatDuration(entry.duration_minutes)}</span>
                      {entry.is_billable && (
                        <DollarSign className="h-3 w-3 text-green-600" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {WORK_TYPE_LABELS[entry.work_type] || entry.work_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {editingEntryId === entry.id ? (
                      <div className="flex items-center gap-1">
                        <Select value={editPackageInstanceId} onValueChange={setEditPackageInstanceId}>
                          <SelectTrigger className="h-7 w-[180px] text-xs">
                            <SelectValue placeholder="Select instance" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {packageInstances.map(pi => (
                              <SelectItem key={pi.id} value={pi.id.toString()}>
                                <span className={pi.is_complete ? 'text-muted-foreground' : ''}>
                                  {pi.package_name}
                                  {pi.start_date && ` (${format(new Date(pi.start_date), 'MMM yyyy')})`}
                                  {pi.is_complete && ' ✓'}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7" 
                          onClick={() => savePackageInstance(entry.id)}
                          disabled={saving}
                        >
                          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-green-600" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEditing}>
                          <X className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ) : (
                      <span 
                        className={`text-xs ${!entry.package_instance_id ? 'text-muted-foreground italic' : ''}`}
                      >
                        {getInstanceLabel(entry.package_instance_id)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.source === 'timer' ? (
                      <Timer className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <FileEdit className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>
                    {canEdit(entry) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => startEditing(entry)}>
                            <ArrowRightLeft className="h-4 w-4 mr-2" />
                            Reassign Package
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(entry.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SheetContent>
    </Sheet>
  );
}

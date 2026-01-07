import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
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
  DollarSign
} from 'lucide-react';
import { useTimeTracking, formatDuration, TimeEntry } from '@/hooks/useTimeTracking';
import { useAuth } from '@/hooks/useAuth';
import { Skeleton } from '@/components/ui/skeleton';

interface TimeLogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: number;
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
  const { entries, loading, deleteEntry, summary } = useTimeTracking(clientId);
  const [workTypeFilter, setWorkTypeFilter] = useState<string>('all');
  const [billableFilter, setBillableFilter] = useState<string>('all');

  const filteredEntries = entries.filter((entry) => {
    if (workTypeFilter !== 'all' && entry.work_type !== workTypeFilter) return false;
    if (billableFilter === 'billable' && !entry.is_billable) return false;
    if (billableFilter === 'non-billable' && entry.is_billable) return false;
    return true;
  });

  const canDelete = (entry: TimeEntry) => {
    return entry.user_id === user?.id || isSuperAdmin();
  };

  const handleDelete = async (entryId: string) => {
    if (confirm('Delete this time entry?')) {
      await deleteEntry(entryId);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
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
                    {entry.source === 'timer' ? (
                      <Timer className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <FileEdit className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>
                    {canDelete(entry) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
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

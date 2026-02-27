import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useTimeTracking, formatDuration, formatElapsedTime, TimeEntry } from '@/hooks/useTimeTracking';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AddTimeDialog } from './AddTimeDialog';
import { 
  Clock, 
  Play, 
  Square, 
  Plus, 
  DollarSign, 
  Timer,
  Calendar,
  TrendingUp,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PackageTimeSectionProps {
  tenantId: number;
  clientId: number;
  packageId: number;
  packageInstanceId: number;
}

const WORK_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'general', label: 'General' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'document_review', label: 'Document Review' },
  { value: 'training', label: 'Training' },
  { value: 'support', label: 'Support' },
];

export function PackageTimeSection({ 
  tenantId, 
  clientId, 
  packageId,
  packageInstanceId 
}: PackageTimeSectionProps) {
  const { 
    entries, 
    activeTimer, 
    summary, 
    loading, 
    startTimer, 
    stopTimer 
  } = useTimeTracking(clientId);

  const [workTypeFilter, setWorkTypeFilter] = useState('all');
  const [billableFilter, setBillableFilter] = useState<'all' | 'billable' | 'non-billable'>('all');
  const [addTimeOpen, setAddTimeOpen] = useState(false);

  // Filter entries by package
  const packageEntries = useMemo(() => {
    let filtered = entries.filter(e => Number(e.package_id) === packageInstanceId);
    
    if (workTypeFilter !== 'all') {
      filtered = filtered.filter(e => e.work_type === workTypeFilter);
    }
    
    if (billableFilter === 'billable') {
      filtered = filtered.filter(e => e.is_billable);
    } else if (billableFilter === 'non-billable') {
      filtered = filtered.filter(e => !e.is_billable);
    }
    
    return filtered;
  }, [entries, packageInstanceId, workTypeFilter, billableFilter]);

  // Calculate package-specific summary
  const packageSummary = useMemo(() => {
    const allPackageEntries = entries.filter(e => Number(e.package_id) === packageInstanceId);
    
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last90Days = new Date(now);
    last90Days.setDate(now.getDate() - 90);
    
    let thisWeek = 0;
    let thisMonth = 0;
    let last90 = 0;
    let billable = 0;
    
    allPackageEntries.forEach(entry => {
      const entryDate = entry.start_at ? new Date(entry.start_at) : new Date();
      
      if (entryDate >= startOfWeek) thisWeek += entry.duration_minutes;
      if (entryDate >= startOfMonth) thisMonth += entry.duration_minutes;
      if (entryDate >= last90Days) last90 += entry.duration_minutes;
      if (entry.is_billable) billable += entry.duration_minutes;
    });
    
    return { thisWeek, thisMonth, last90, billable };
  }, [entries, packageInstanceId]);

  const isTimerForThisPackage = Number(activeTimer?.package_id) === packageInstanceId;

  const handleStartTimer = async () => {
    await startTimer(tenantId, packageId, null, null, 'general');
  };

  const handleStopTimer = async () => {
    await stopTimer();
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Week</p>
                <p className="text-xl font-semibold">{formatDuration(packageSummary.thisWeek)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Month</p>
                <p className="text-xl font-semibold">{formatDuration(packageSummary.thisMonth)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last 90 Days</p>
                <p className="text-xl font-semibold">{formatDuration(packageSummary.last90)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions Row */}
      <div className="flex items-center gap-3 flex-wrap">
        {isTimerForThisPackage ? (
          <Button variant="destructive" onClick={handleStopTimer} size="sm">
            <Square className="h-4 w-4 mr-2" />
            Stop Timer ({formatElapsedTime(activeTimer!.start_at)})
          </Button>
        ) : (
          <Button onClick={handleStartTimer} size="sm" disabled={!!activeTimer}>
            <Play className="h-4 w-4 mr-2" />
            Start Timer
          </Button>
        )}
        <Button variant="outline" onClick={() => setAddTimeOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Log Time
        </Button>
        <div className="flex-1" />
        <Select value={workTypeFilter} onValueChange={setWorkTypeFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Work type" />
          </SelectTrigger>
          <SelectContent>
            {WORK_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={billableFilter} onValueChange={(v) => setBillableFilter(v as any)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Billable" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="billable">Billable</SelectItem>
            <SelectItem value="non-billable">Non-billable</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Active timer alert */}
      {activeTimer && !isTimerForThisPackage && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <Timer className="h-4 w-4 inline mr-2" />
          Timer running on another package. Stop it first to start a new timer here.
        </div>
      )}

      {/* Time Entries List */}
      {packageEntries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No time entries for this package</p>
        </div>
      ) : (
        <div className="space-y-2">
          {packageEntries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="p-3">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground w-24">
                    {entry.start_at ? format(new Date(entry.start_at), 'd MMM yyyy') : 'N/A'}
                  </div>
                  <div className="font-medium w-16">
                    {formatDuration(entry.duration_minutes)}
                  </div>
                  <Badge variant="secondary" className="capitalize">
                    {entry.work_type.replace('_', ' ')}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {entry.source === 'timer' ? (
                      <><Timer className="h-3 w-3 mr-1" /> Timer</>
                    ) : (
                      <><FileText className="h-3 w-3 mr-1" /> Manual</>
                    )}
                  </Badge>
                  {entry.is_billable && (
                    <DollarSign className="h-4 w-4 text-green-600" />
                  )}
                  <div className="flex-1 text-sm text-muted-foreground truncate">
                    {entry.notes}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Time Dialog */}
      <AddTimeDialog
        open={addTimeOpen}
        onOpenChange={setAddTimeOpen}
        tenantId={tenantId}
        clientId={clientId}
      />
    </div>
  );
}

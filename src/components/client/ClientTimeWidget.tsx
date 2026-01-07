import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Clock, Play, Square, Plus, List, ChevronDown } from 'lucide-react';
import { useTimeTracking, formatDuration, formatElapsedTime } from '@/hooks/useTimeTracking';
import { AddTimeDialog } from './AddTimeDialog';
import { TimeLogDrawer } from './TimeLogDrawer';

interface ClientTimeWidgetProps {
  tenantId: number;
  clientId: number;
  includedHours?: number | null;
}

export function ClientTimeWidget({ tenantId, clientId, includedHours }: ClientTimeWidgetProps) {
  const { activeTimer, summary, startTimer, stopTimer, loading } = useTimeTracking(clientId);
  const [elapsed, setElapsed] = useState('0:00');
  const [addTimeOpen, setAddTimeOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  
  const isTimerForThisClient = activeTimer?.client_id === clientId;
  const hasActiveTimer = !!activeTimer;

  // Update elapsed time every second when timer is running
  useEffect(() => {
    if (!isTimerForThisClient || !activeTimer) return;
    
    const updateElapsed = () => {
      setElapsed(formatElapsedTime(activeTimer.start_at));
    };
    
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    
    return () => clearInterval(interval);
  }, [isTimerForThisClient, activeTimer]);

  const handleStartTimer = async () => {
    await startTimer(tenantId, null, null, null, 'general');
  };

  const handleStopTimer = async () => {
    await stopTimer();
  };

  const monthHours = summary.thisMonth / 60;
  const usedHours = summary.last90Days / 60;

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Month total */}
        <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{monthHours.toFixed(1)}h</span>
          <span className="text-xs text-muted-foreground">this month</span>
        </div>

        {/* Used / Included (if package has included hours) */}
        {includedHours && includedHours > 0 && (
          <Badge variant={usedHours > includedHours ? 'destructive' : 'secondary'} className="text-xs">
            {usedHours.toFixed(1)} / {includedHours}h
          </Badge>
        )}

        {/* Timer button */}
        {isTimerForThisClient ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStopTimer}
            className="gap-1.5"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            <span className="font-mono text-sm">{elapsed}</span>
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={handleStartTimer}
            disabled={hasActiveTimer || loading}
            className="gap-1.5"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Start
          </Button>
        )}

        {/* Actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setAddTimeOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Time
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setLogOpen(true)}>
              <List className="h-4 w-4 mr-2" />
              View Log
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AddTimeDialog
        open={addTimeOpen}
        onOpenChange={setAddTimeOpen}
        tenantId={tenantId}
        clientId={clientId}
      />

      <TimeLogDrawer
        open={logOpen}
        onOpenChange={setLogOpen}
        clientId={clientId}
      />
    </>
  );
}

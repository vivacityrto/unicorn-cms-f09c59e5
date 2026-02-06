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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Clock, Play, Square, Plus, List, ChevronDown, TrendingDown, AlertTriangle } from 'lucide-react';
import { useTimeTracking, formatDuration, formatElapsedTime } from '@/hooks/useTimeTracking';
import { usePackageUsage, formatHours, formatForecast } from '@/hooks/usePackageUsage';
import { AddTimeDialog } from './AddTimeDialog';
import { TimeLogDrawer } from './TimeLogDrawer';

interface ClientTimeWidgetProps {
  tenantId: number;
  clientId: number;
}

export function ClientTimeWidget({ tenantId, clientId }: ClientTimeWidgetProps) {
  const { activeTimer, summary, startTimer, stopTimer, loading } = useTimeTracking(clientId);
  const { 
    packages, 
    selectedPackageId, 
    setSelectedPackageId, 
    usage,
    loading: usageLoading 
  } = usePackageUsage(clientId);
  
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
    const packageId = selectedPackageId ? packages.find(p => p.id === selectedPackageId)?.package_id : undefined;
    await startTimer(tenantId, packageId || null, null, null, 'general');
  };

  const handleStopTimer = async () => {
    await stopTimer();
  };

  const monthHours = summary.thisMonth / 60;
  const hasPackages = packages.length > 0;
  const usedPercent = usage?.used_percent || 0;
  const isOverBudget = usedPercent >= 100;
  const isNearLimit = usedPercent >= 80;

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Package selector (if multiple) */}
        {hasPackages && packages.length > 1 && (
          <Select 
            value={selectedPackageId?.toString() || ''} 
            onValueChange={(v) => setSelectedPackageId(v ? Number(v) : null)}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Select package" />
            </SelectTrigger>
            <SelectContent>
              {packages.map(pkg => (
                <SelectItem key={pkg.id} value={pkg.id.toString()}>
                  {pkg.package_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Month total */}
        <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{monthHours.toFixed(1)}h</span>
          <span className="text-xs text-muted-foreground">this month</span>
        </div>

        {/* Package Usage Badge */}
        {usage && usage.included_minutes > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant={isOverBudget ? 'destructive' : isNearLimit ? 'secondary' : 'outline'} 
                  className={`text-xs gap-1 ${isNearLimit && !isOverBudget ? 'border-yellow-500 text-yellow-700' : ''}`}
                >
                  {isOverBudget && <AlertTriangle className="h-3 w-3" />}
                  {formatHours(usage.used_minutes)} / {formatHours(usage.included_minutes)}
                  <span className="text-muted-foreground">({usedPercent.toFixed(0)}%)</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <div className="space-y-1.5 text-xs">
                  <p><strong>Remaining:</strong> {formatHours(usage.remaining_minutes)}</p>
                  <div className="pt-1 border-t border-border/50">
                    <p className="text-muted-foreground mb-1">This month breakdown:</p>
                    <div className="flex gap-2 text-[10px]">
                      <span>Calendar {formatHours(usage.calendar_minutes_30d || 0)}</span>
                      <span>•</span>
                      <span>Timer {formatHours(usage.timer_minutes_30d || 0)}</span>
                      <span>•</span>
                      <span>Manual {formatHours(usage.manual_minutes_30d || 0)}</span>
                    </div>
                  </div>
                  {usage.forecast_days_to_zero !== null && (
                    <p className="flex items-center gap-1 pt-1 border-t border-border/50">
                      <TrendingDown className="h-3 w-3" />
                      {formatForecast(usage.forecast_days_to_zero)}
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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

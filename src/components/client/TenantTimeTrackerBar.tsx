import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Clock,
  Play,
  Square,
  Plus,
  List,
  ChevronDown,
  AlertTriangle,
  Calendar,
  BarChart3,
  Info,
} from 'lucide-react';
import { useTenantTimeTracker } from '@/hooks/useTenantTimeTracker';
import { formatHours } from '@/hooks/usePackageUsageQuery';
import { AddTimeDialog } from './AddTimeDialog';
import { TimeLogDrawer } from './TimeLogDrawer';
import { AddTimeFromMeetingDialog } from './AddTimeFromMeetingDialog';
import { PackageBreakdownModal } from './PackageBreakdownModal';
import { useQueryClient } from '@tanstack/react-query';
import { timeTrackingKeys } from '@/hooks/useTimeTrackingQuery';
import { packageUsageKeys } from '@/hooks/usePackageUsageQuery';

interface TenantTimeTrackerBarProps {
  tenantId: number;
  tenantName: string;
}

export function TenantTimeTrackerBar({ tenantId, tenantName }: TenantTimeTrackerBarProps) {
  const {
    packages,
    selectedPackageId,
    setSelectedPackageId,
    selectedPackage,
    hasMultiplePackages,
    needsPackageSelection,
    isAllPackages,
    usage,
    summary,
    activeTimer,
    isTimerForThisTenant,
    hasActiveTimer,
    elapsed,
    startTimer,
    stopTimer,
    loading,
  } = useTenantTimeTracker(tenantId);

  const queryClient = useQueryClient();
  const [addTimeOpen, setAddTimeOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [meetingTimeOpen, setMeetingTimeOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const monthHours = summary.thisMonth / 60;
  const usedPercent = usage?.used_percent || 0;
  const isOverBudget = usedPercent >= 100;
  const isNearLimit = usedPercent >= 80;

  const handleSuccess = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.summary(tenantId), refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.entries(tenantId), refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: packageUsageKeys.packages(tenantId), refetchType: 'all' }),
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === 'package-usage' && key[2] === tenantId;
        },
        refetchType: 'all'
      }),
    ]);
  };

  if (loading) {
    return (
      <div className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center gap-3 px-6 py-2">
          <div className="h-8 w-24 bg-muted animate-pulse rounded" />
          <div className="h-8 w-20 bg-muted animate-pulse rounded" />
          <div className="h-8 w-16 bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center gap-2 px-6 py-2 flex-wrap">
          {/* Package selector */}
          {packages.length > 0 && (
            <>
              {hasMultiplePackages ? (
                <Select
                  value={selectedPackageId?.toString() || ''}
                  onValueChange={(v) => setSelectedPackageId(v === 'all' ? 'all' : v ? Number(v) : null)}
                >
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue placeholder="Select package" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="all">All packages</SelectItem>
                    {packages.map(pkg => (
                      <SelectItem key={pkg.id} value={pkg.id.toString()}>
                        {pkg.package_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline" className="h-8 px-3 text-xs font-medium">
                  {packages[0]?.package_name}
                </Badge>
              )}
            </>
          )}

          {/* Divider */}
          <div className="h-5 w-px bg-border" />

          {/* Month total */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">{monthHours.toFixed(1)}h</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">this month</span>
          </div>

          {/* Package usage */}
          {usage && usage.included_minutes > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant={isOverBudget ? 'destructive' : isNearLimit ? 'secondary' : 'outline'}
                    className={`text-xs gap-1 cursor-default ${isNearLimit && !isOverBudget ? 'border-yellow-500 text-yellow-700' : ''}`}
                  >
                    {isOverBudget && <AlertTriangle className="h-3 w-3" />}
                    {formatHours(usage.used_minutes)} / {formatHours(usage.included_minutes)}
                    <span className="text-muted-foreground">({usedPercent.toFixed(0)}%)</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1 text-xs">
                    <p><strong>Remaining:</strong> {formatHours(usage.remaining_minutes)}</p>
                    <div className="flex gap-2 text-[10px] pt-1 border-t border-border/50">
                      <span>Calendar {formatHours(usage.calendar_minutes_30d || 0)}</span>
                      <span>•</span>
                      <span>Timer {formatHours(usage.timer_minutes_30d || 0)}</span>
                      <span>•</span>
                      <span>Manual {formatHours(usage.manual_minutes_30d || 0)}</span>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* No package warning */}
          {(needsPackageSelection || isAllPackages) && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              {isAllPackages ? 'Select a specific package to track time.' : 'Select a package to track time.'}
            </span>
          )}

          {/* Timer button */}
          {isTimerForThisTenant ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={stopTimer}
              className="gap-1.5 h-8"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span className="font-mono text-sm">{elapsed}</span>
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => startTimer()}
              disabled={hasActiveTimer || needsPackageSelection || isAllPackages}
              className="gap-1.5 h-8"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              Start
            </Button>
          )}

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 h-8">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setAddTimeOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Time
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMeetingTimeOpen(true)}>
                <Calendar className="h-4 w-4 mr-2" />
                Add time from meeting
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLogOpen(true)}>
                <List className="h-4 w-4 mr-2" />
                View Log
              </DropdownMenuItem>
              {hasMultiplePackages && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setBreakdownOpen(true)}>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Package breakdown
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AddTimeDialog
        open={addTimeOpen}
        onOpenChange={setAddTimeOpen}
        tenantId={tenantId}
        clientId={tenantId}
        defaultPackageId={selectedPackage?.package_id || null}
        packages={packages}
      />

      <TimeLogDrawer
        open={logOpen}
        onOpenChange={setLogOpen}
        clientId={tenantId}
      />

      <AddTimeFromMeetingDialog
        open={meetingTimeOpen}
        onOpenChange={setMeetingTimeOpen}
        clientId={tenantId}
        clientName={tenantName}
        defaultPackageId={selectedPackage?.package_id || null}
        packages={packages}
        onSuccess={handleSuccess}
      />

      <PackageBreakdownModal
        open={breakdownOpen}
        onOpenChange={setBreakdownOpen}
        tenantId={tenantId}
      />
    </>
  );
}

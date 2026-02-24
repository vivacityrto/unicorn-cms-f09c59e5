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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
} from 'lucide-react';
import { useTenantTimeTracker } from '@/hooks/useTenantTimeTracker';
import { formatHours } from '@/hooks/usePackageUsageQuery';
import { useTenantMemberships, useMembershipUsage, type ScopeTag } from '@/hooks/useTenantMemberships';
import { ScopeSelectorBadge } from './ScopeSelectorBadge';
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
    activeTimer,
    isTimerForThisTenant,
    hasActiveTimer,
    elapsed,
    startTimer,
    stopTimer,
    loading,
  } = useTenantTimeTracker(tenantId);

  const membership = useTenantMemberships(tenantId);
  const { data: membershipUsage } = useMembershipUsage(tenantId);

  const queryClient = useQueryClient();
  const [scopeTag, setScopeTag] = useState<ScopeTag>(membership.defaultScope);
  const [addTimeOpen, setAddTimeOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [meetingTimeOpen, setMeetingTimeOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [timerPickerOpen, setTimerPickerOpen] = useState(false);

  // Membership usage metrics
  const totalUsed = membershipUsage?.total_used_minutes ?? 0;
  const totalIncluded = membershipUsage?.total_included_minutes ?? 0;
  const remaining = membershipUsage?.remaining_minutes ?? 0;
  const usedPercent = totalIncluded > 0 ? (totalUsed / totalIncluded) * 100 : 0;
  const isOverBudget = usedPercent >= 100;
  const isNearLimit = usedPercent >= 80;
  const monthHours = totalUsed / 60;

  const handleSuccess = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.summary(tenantId), refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: timeTrackingKeys.entries(tenantId), refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: packageUsageKeys.packages(tenantId), refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: ['membership-combined-usage', tenantId], refetchType: 'all' }),
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === 'package-usage' && key[2] === tenantId;
        },
        refetchType: 'all'
      }),
    ]);
    window.dispatchEvent(new CustomEvent('time-entry-changed', { detail: { tenantId } }));
  };

  if (loading || membership.loading) {
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
          {/* Scope selector (replaces package selector for time logging) */}
          <ScopeSelectorBadge
            value={scopeTag}
            onChange={setScopeTag}
            showSelector={membership.showScopeSelector}
            size="sm"
          />

          {/* Package filter (kept for browsing packages) */}
          {hasMultiplePackages && (
            <Select
              value={selectedPackageId?.toString() || ''}
              onValueChange={(v) => setSelectedPackageId(v === 'all' ? 'all' : v ? Number(v) : null)}
            >
              <SelectTrigger className="w-[160px] h-7 text-xs">
                <SelectValue placeholder="Filter package" />
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
          )}

          {/* Divider */}
          <div className="h-5 w-px bg-border" />

          {/* Month total */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-muted rounded-md">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">{monthHours.toFixed(1)}h</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">used</span>
          </div>

          {/* Membership usage */}
          {totalIncluded > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant={isOverBudget ? 'destructive' : isNearLimit ? 'secondary' : 'outline'}
                    className={`text-xs gap-1 cursor-default ${isNearLimit && !isOverBudget ? 'border-yellow-500 text-yellow-700' : ''}`}
                  >
                    {isOverBudget && <AlertTriangle className="h-3 w-3" />}
                    {formatHours(totalUsed)} / {formatHours(totalIncluded)}
                    <span className="text-muted-foreground">({usedPercent.toFixed(0)}%)</span>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1 text-xs">
                    <p><strong>Remaining:</strong> {formatHours(remaining)}</p>
                    <p className="text-muted-foreground">Combined RTO + CRICOS membership hours</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Timer button — package picker when multiple */}
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
            <Popover open={timerPickerOpen} onOpenChange={setTimerPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  disabled={hasActiveTimer}
                  className="gap-1.5 h-8"
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Start
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1">
                <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Select package</p>
                {packages.map(pkg => (
                  <button
                    key={pkg.id}
                    className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent transition-colors"
                    onClick={async () => {
                      setTimerPickerOpen(false);
                      setSelectedPackageId(pkg.id);
                      await startTimer('general', pkg.id);
                    }}
                  >
                    {pkg.package_name}
                  </button>
                ))}
                <div className="h-px bg-border my-1" />
                <button
                  className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent transition-colors text-muted-foreground"
                  onClick={async () => {
                    setTimerPickerOpen(false);
                    await startTimer('general');
                  }}
                >
                  No package (client only)
                </button>
              </PopoverContent>
            </Popover>
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
        defaultScopeTag={scopeTag}
        showScopeSelector={membership.showScopeSelector}
        onSuccess={handleSuccess}
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

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Clock, TrendingUp, DollarSign, ExternalLink, AlertTriangle, X, TrendingDown, Calendar, Timer, PenLine, ChevronDown, KeyRound } from 'lucide-react';
import { useTimeTrackingQuery, formatDuration } from '@/hooks/useTimeTrackingQuery';
import { usePackageUsageQuery, formatHours, formatForecast } from '@/hooks/usePackageUsageQuery';
import { useMembershipUsage } from '@/hooks/useCapacityEngine';
import { useState, useEffect } from 'react';
import { TimeLogDrawer } from './TimeLogDrawer';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface ClientTimeSummaryCardProps {
  clientId: number;
}

export function ClientTimeSummaryCard({ clientId }: ClientTimeSummaryCardProps) {
  const { summary, loading: timeLoading } = useTimeTrackingQuery(clientId);
  const { 
    packages,
    usage, 
    alerts, 
    selectedPackage,
    setSelectedPackageId,
    dismissAlert, 
    loading: usageLoading 
  } = usePackageUsageQuery(clientId);
  const { data: membershipUsage } = useMembershipUsage(clientId);
  const [logOpen, setLogOpen] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'calendar' | 'timer' | 'manual'>('all');
  const [keyEvents, setKeyEvents] = useState<{ stageName: string; eventDate: string }[]>([]);

  // Fetch key event dates for recurring stages
  useEffect(() => {
    async function fetchKeyEvents() {
      // Get active package instances for this tenant
      const { data: pkgInstances } = await (supabase
        .from('package_instances' as any)
        .select('id')
        .eq('tenant_id', clientId)
        .in('status', ['active', 'in_progress'])) as { data: { id: number }[] | null };

      if (!pkgInstances?.length) return;

      const pkgInstanceIds = pkgInstances.map(p => p.id);

      // Get stage_instances with event_conducted_date
      const { data: stageData } = await (supabase
        .from('stage_instances' as any)
        .select('id, stage_id, event_conducted_date, is_recurring')
        .in('packageinstance_id', pkgInstanceIds)
        .eq('is_recurring', true)
        .not('event_conducted_date', 'is', null)) as { data: any[] | null };

      if (!stageData?.length) {
        setKeyEvents([]);
        return;
      }

      // Get unique stage IDs and fetch stage metadata
      const stageIds = [...new Set(stageData.map(s => s.stage_id))] as number[];
      const { data: stagesMeta } = await supabase
        .from('stages')
        .select('id, shortname, name')
        .in('id', stageIds);

      const stageMap = new Map((stagesMeta || []).map(s => [s.id, s]));

      // Build key events list (take the most recent event per stage)
      const eventsByStage = new Map<number, { stageName: string; eventDate: string }>();
      for (const si of stageData) {
        const meta = stageMap.get(si.stage_id);
        const existing = eventsByStage.get(si.stage_id);
        if (!existing || si.event_conducted_date > existing.eventDate) {
          eventsByStage.set(si.stage_id, {
            stageName: meta?.shortname || meta?.name || `Stage ${si.stage_id}`,
            eventDate: si.event_conducted_date
          });
        }
      }

      setKeyEvents(Array.from(eventsByStage.values()).sort((a, b) => b.eventDate.localeCompare(a.eventDate)));
    }
    fetchKeyEvents();
  }, [clientId]);

  const loading = timeLoading || usageLoading;

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Time Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Package Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalBillable = summary.billableMinutes;
  const totalNonBillable = summary.nonBillableMinutes;
  const billablePercent = totalBillable + totalNonBillable > 0
    ? Math.round((totalBillable / (totalBillable + totalNonBillable)) * 100)
    : 0;

  const usedPercent = usage?.used_percent || 0;
  const isOverBudget = usedPercent >= 100;
  const isNearLimit = usedPercent >= 80;

  // Get active alerts for display
  const activeAlerts = alerts.filter(a => !a.is_dismissed).slice(0, 3);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Time Summary Card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Time Summary
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setLogOpen(true)}>
                View all
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {/* This Week */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold">{formatDuration(summary.thisWeek)}</p>
              </div>

              {/* This Month */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">This Month</p>
                <p className="text-2xl font-bold">{formatDuration(summary.thisMonth)}</p>
              </div>

              {/* Last 90 Days */}
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Last 90 Days</p>
                <p className="text-2xl font-bold">{formatDuration(summary.last90Days)}</p>
              </div>
            </div>

            {/* Billable breakdown */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <span>Billable</span>
                  <Badge variant="secondary" className="text-xs">
                    {billablePercent}%
                  </Badge>
                </div>
                <span className="font-medium">{formatDuration(totalBillable)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Non-billable</span>
                </div>
                <span className="text-muted-foreground">{formatDuration(totalNonBillable)}</span>
              </div>
            </div>

            {/* Membership year */}
            {membershipUsage?.membership_year_start && membershipUsage?.membership_year_end && (
              <div className="mt-4 pt-3 border-t">
                <p className="text-xs text-muted-foreground">
                  Membership year: {new Date(membershipUsage.membership_year_start).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} — {new Date(membershipUsage.membership_year_end).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            )}

            {/* Key Events */}
            {keyEvents.length > 0 && (
              <div className="mt-4 pt-3 border-t">
                <p className="text-xs font-medium flex items-center gap-1 mb-2">
                  <KeyRound className="h-3 w-3 text-amber-500" />
                  Key Events
                </p>
                <div className="space-y-1">
                  {keyEvents.map((evt, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Last {evt.stageName}</span>
                      <span>{format(new Date(evt.eventDate), 'd MMM yyyy')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Package Usage Card */}
        <Card>
          <CardHeader className="pb-2">
              <div className="flex items-center gap-2 w-full">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingDown className="h-4 w-4" />
                  Package Burn-down
                </CardTitle>
                {selectedPackage && packages.length > 1 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-normal cursor-pointer hover:bg-muted transition-colors">
                        {selectedPackage.package_name}
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {packages.map((pkg) => (
                        <DropdownMenuItem
                          key={pkg.id}
                          onClick={() => setSelectedPackageId(pkg.id)}
                          className={pkg.id === selectedPackage.id ? 'bg-muted font-medium' : ''}
                        >
                          {pkg.package_name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : selectedPackage ? (
                  <Badge variant="outline" className="ml-auto text-xs font-normal">
                    {selectedPackage.package_name}
                  </Badge>
                ) : null}
              </div>
          </CardHeader>
          <CardContent>
            {usage ? (
              <div className="space-y-4">
                {/* Source filter toggle */}
                <ToggleGroup type="single" value={sourceFilter} onValueChange={(v) => v && setSourceFilter(v as typeof sourceFilter)} className="justify-start">
                  <ToggleGroupItem value="all" size="sm" className="text-xs h-7 px-2">All</ToggleGroupItem>
                  <ToggleGroupItem value="calendar" size="sm" className="text-xs h-7 px-2 gap-1">
                    <Calendar className="h-3 w-3" />
                    Calendar
                  </ToggleGroupItem>
                  <ToggleGroupItem value="timer" size="sm" className="text-xs h-7 px-2 gap-1">
                    <Timer className="h-3 w-3" />
                    Timer
                  </ToggleGroupItem>
                  <ToggleGroupItem value="manual" size="sm" className="text-xs h-7 px-2 gap-1">
                    <PenLine className="h-3 w-3" />
                    Manual
                  </ToggleGroupItem>
                </ToggleGroup>

                {/* Progress bar */}
                {(() => {
                  const displayMinutes = sourceFilter === 'all' 
                    ? usage.used_minutes 
                    : sourceFilter === 'calendar' 
                      ? (usage.calendar_minutes_total || 0)
                      : sourceFilter === 'timer' 
                        ? (usage.timer_minutes_total || 0)
                        : (usage.manual_minutes_total || 0);
                  const hasIncluded = usage.included_minutes > 0;
                  const displayPercent = hasIncluded
                    ? Math.round((displayMinutes / usage.included_minutes) * 100) 
                    : 0;
                  
                  return (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          {sourceFilter === 'all' ? 'Used' : `${sourceFilter.charAt(0).toUpperCase() + sourceFilter.slice(1)} time`}
                        </span>
                        <span className={`font-medium ${isOverBudget && sourceFilter === 'all' ? 'text-destructive' : isNearLimit && sourceFilter === 'all' ? 'text-yellow-600' : ''}`}>
                          {hasIncluded 
                            ? `${formatHours(displayMinutes)} / ${formatHours(usage.included_minutes)}`
                            : formatHours(displayMinutes)
                          }
                        </span>
                      </div>
                      {hasIncluded && (
                        <Progress 
                          value={Math.min(displayPercent, 100)} 
                          className={`h-2 ${isOverBudget && sourceFilter === 'all' ? '[&>div]:bg-destructive' : isNearLimit && sourceFilter === 'all' ? '[&>div]:bg-yellow-500' : ''}`}
                        />
                      )}
                      {sourceFilter === 'all' && (
                        <div className="text-[10px] text-muted-foreground flex gap-3 mt-1">
                          <span className="flex items-center gap-1"><Calendar className="h-2.5 w-2.5" /> Calendar {formatHours(usage.calendar_minutes_total || 0)}</span>
                          <span className="flex items-center gap-1"><Timer className="h-2.5 w-2.5" /> Timer {formatHours(usage.timer_minutes_total || 0)}</span>
                          <span className="flex items-center gap-1"><PenLine className="h-2.5 w-2.5" /> Manual {formatHours(usage.manual_minutes_total || 0)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {usage.included_minutes > 0 ? 'Remaining' : 'No included hours'}
                    </p>
                    {usage.included_minutes > 0 && (
                      <p className={`text-lg font-semibold ${isOverBudget ? 'text-destructive' : ''}`}>
                        {formatHours(usage.remaining_minutes)}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Last 30 Days</p>
                    <p className="text-lg font-semibold">
                      {formatHours(usage.trailing_30d_minutes)}
                    </p>
                    <div className="text-[10px] text-muted-foreground flex gap-2">
                      <span>{formatHours(usage.calendar_minutes_30d || 0)} cal</span>
                      <span>{formatHours(usage.timer_minutes_30d || 0)} tmr</span>
                      <span>{formatHours(usage.manual_minutes_30d || 0)} man</span>
                    </div>
                  </div>
                </div>

                {/* Forecast */}
                {usage.forecast_days_to_zero !== null && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingDown className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Forecast:</span>
                      <span className={`font-medium ${usage.forecast_days_to_zero < 30 ? 'text-yellow-600' : ''}`}>
                        {formatForecast(usage.forecast_days_to_zero)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Alerts */}
                {activeAlerts.length > 0 && (
                  <div className="pt-2 border-t space-y-2">
                    <p className="text-xs text-muted-foreground font-medium">Recent Alerts</p>
                    {activeAlerts.map(alert => (
                      <div 
                        key={alert.id} 
                        className={`flex items-start justify-between gap-2 p-2 rounded text-xs ${
                          alert.severity === 'critical' 
                            ? 'bg-destructive/10 text-destructive' 
                            : 'bg-yellow-500/10 text-yellow-700'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span>{alert.title}</span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-5 w-5 shrink-0"
                          onClick={() => dismissAlert(alert.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                No active packages
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <TimeLogDrawer
        open={logOpen}
        onOpenChange={setLogOpen}
        clientId={clientId}
      />
    </>
  );
}

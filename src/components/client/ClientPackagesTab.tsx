import { useState, useEffect } from 'react';
import { format, addYears, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { 
  Package2, 
  Calendar as CalendarIcon, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight,
  ChevronDown,
  Plus,
  PlayCircle,
  PauseCircle,
  Settings,
  Rocket,
  StickyNote,
  Timer,
  History,
  Archive,
  Database,
  Flag,
  Shield,
  RefreshCw,
  MoreVertical
} from 'lucide-react';
import { toast } from 'sonner';
import { ClientPackage } from '@/hooks/useClientManagement';
import { PackageStagesManager } from './PackageStagesManager';
import { PackageNotesSection } from './PackageNotesSection';
import { PackageTimeSection } from './PackageTimeSection';
import { StartPackageDialog } from './StartPackageDialog';
import { RenewalConfirmDialog } from './RenewalConfirmDialog';
import { PackageDataManager } from './PackageDataManager';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useNotes } from '@/hooks/useNotes';
import { supabase } from '@/integrations/supabase/client';
import { useMembershipStateOptions } from '@/hooks/useMembershipStateOptions';

interface ClientPackagesTabProps {
  tenantId: number;
  tenantName?: string;
  packages: ClientPackage[];
  loading: boolean;
  onAddPackage?: () => void;
  complyhubTier?: string | null;
  autoExpandPackageInstanceId?: number;
  autoExpandStageInstanceId?: number;
}

const STATE_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-600 border-green-500',
  at_risk: 'bg-amber-500/10 text-amber-600 border-amber-500',
  warning: 'bg-red-600/20 text-red-700 border-red-600 font-semibold',
  paused: 'bg-gray-500/10 text-gray-600 border-gray-500',
  exiting: 'bg-red-500/10 text-red-600 border-red-500',
  complete: 'bg-muted text-muted-foreground border-border'
};

const STATE_ICONS: Record<string, React.ReactNode> = {
  active: <PlayCircle className="h-3 w-3" />,
  at_risk: <AlertCircle className="h-3 w-3" />,
  warning: <AlertCircle className="h-3 w-3 animate-pulse" />,
  paused: <PauseCircle className="h-3 w-3" />,
  exiting: <AlertCircle className="h-3 w-3" />,
  complete: <CheckCircle2 className="h-3 w-3" />
};

export function ClientPackagesTab({ tenantId, tenantName, packages, loading, onAddPackage, complyhubTier, autoExpandPackageInstanceId, autoExpandStageInstanceId }: ClientPackagesTabProps) {
  const { data: membershipStateOptions } = useMembershipStateOptions();
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const [expandedPackages, setExpandedPackages] = useState<Set<number>>(new Set());
  const [startPackageOpen, setStartPackageOpen] = useState(false);
  const [dataManagerOpen, setDataManagerOpen] = useState(false);
  const [packageNoteCounts, setPackageNoteCounts] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active');

  const [finaliseTarget, setFinaliseTarget] = useState<ClientPackage | null>(null);
  const [finalising, setFinalising] = useState(false);
  const [finaliseEndDate, setFinaliseEndDate] = useState<Date | undefined>();
  const [renewPackage, setRenewPackage] = useState(false);
  const [renewalPackageId, setRenewalPackageId] = useState<string>('');
  const [availablePackages, setAvailablePackages] = useState<{ id: number; name: string }[]>([]);

  const activePackages = packages.filter(p => !p.is_complete);
  const historyPackages = packages.filter(p => p.is_complete);
  const displayedPackages = viewMode === 'active' ? activePackages : historyPackages;

  // Auto-expand package when navigated via deep link
  useEffect(() => {
    if (autoExpandPackageInstanceId && packages.length > 0) {
      const targetPkg = packages.find(p => parseInt(p.id, 10) === autoExpandPackageInstanceId);
      if (targetPkg) {
        setExpandedPackages(prev => new Set(prev).add(targetPkg.package_id));
        if (targetPkg.is_complete) setViewMode('history');
      }
    }
  }, [autoExpandPackageInstanceId, packages]);

  useEffect(() => {
    const fetchPackages = async () => {
      const { data } = await supabase.from('packages').select('id, name').order('name');
      if (data) setAvailablePackages(data);
    };
    fetchPackages();
  }, []);

  // When finalise target changes, set defaults
  useEffect(() => {
    if (finaliseTarget) {
      const startDate = parseISO(finaliseTarget.membership_started_at);
      setFinaliseEndDate(addYears(startDate, 1));
      setRenewPackage(false);
      setRenewalPackageId(String(finaliseTarget.package_id));
    }
  }, [finaliseTarget]);

  const handleFinalisePackage = async () => {
    if (!finaliseTarget) return;
    setFinalising(true);
    try {
      // Update end_date on the package instance
      if (finaliseEndDate) {
        await (supabase as any)
          .from('package_instances')
          .update({ end_date: format(finaliseEndDate, 'yyyy-MM-dd') })
          .eq('id', parseInt(finaliseTarget.id, 10));
      }

      // Transition state to complete
      const { error } = await supabase.rpc('transition_membership_state', {
        p_instance_id: parseInt(finaliseTarget.id, 10),
        p_new_state: 'complete',
        p_reason: 'Package finalised by SuperAdmin',
      });
      if (error) throw error;

      // Create renewal instance if requested
      if (renewPackage && renewalPackageId) {
        const newStartDate = finaliseEndDate
          ? format(finaliseEndDate, 'yyyy-MM-dd')
          : format(new Date(), 'yyyy-MM-dd');

        await (supabase as any)
          .from('package_instances')
          .insert({
            tenant_id: tenantId,
            package_id: parseInt(renewalPackageId, 10),
            start_date: newStartDate,
            is_complete: false,
            membership_state: 'active',
          });
      }

      toast.success(`${finaliseTarget.package_name} finalised successfully${renewPackage ? ' — renewal created' : ''}`);
      setFinaliseTarget(null);
      onAddPackage?.();
    } catch (err: any) {
      console.error('Finalise error:', err);
      toast.error(err.message || 'Failed to finalise package');
    } finally {
      setFinalising(false);
    }
  };

  // Renewal dialog state
  const [renewTarget, setRenewTarget] = useState<ClientPackage | null>(null);
  // Fetch note counts for all package instances
  useEffect(() => {
    const fetchNoteCounts = async () => {
      if (packages.length === 0) return;
      
      // Convert string IDs to numbers for the query
      const packageInstanceIds = packages.map(p => parseInt(p.id, 10)).filter(id => !isNaN(id));
      const { data, error } = await supabase
        .from('notes')
        .select('parent_id')
        .eq('parent_type', 'package_instance')
        .in('parent_id', packageInstanceIds);
      
      if (!error && data) {
        const counts: Record<string, number> = {};
        data.forEach(note => {
          const key = note.parent_id.toString();
          counts[key] = (counts[key] || 0) + 1;
        });
        setPackageNoteCounts(counts);
      }
    };
    
    fetchNoteCounts();
  }, [packages]);

  const togglePackage = (packageId: number) => {
    const newExpanded = new Set(expandedPackages);
    if (newExpanded.has(packageId)) {
      newExpanded.delete(packageId);
    } else {
      newExpanded.add(packageId);
    }
    setExpandedPackages(newExpanded);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Package2 className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">No packages assigned</p>
          <p className="text-sm text-muted-foreground mb-4">
            This client doesn't have any packages yet.
          </p>
          {isSuperAdmin() && (
            <Button onClick={() => setStartPackageOpen(true)}>
              <Rocket className="h-4 w-4 mr-2" />
              Start Package
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with view toggle and buttons */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button 
            variant={viewMode === 'active' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setViewMode('active')}
          >
            <Package2 className="h-4 w-4 mr-1" />
            Active ({activePackages.length})
          </Button>
          <Button 
            variant={viewMode === 'history' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setViewMode('history')}
          >
            <Archive className="h-4 w-4 mr-1" />
            History ({historyPackages.length})
          </Button>
          {complyhubTier && (
            <Badge variant="outline" className="gap-1 ml-2 border-primary/30 text-primary">
              <Shield className="h-3 w-3" />
              ComplyHub: {complyhubTier}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isSuperAdmin() && viewMode === 'active' && (
            <Button onClick={() => setStartPackageOpen(true)}>
              <Rocket className="h-4 w-4 mr-2" />
              Start Package
            </Button>
          )}
          {isSuperAdmin() && (
            <Button variant="outline" size="sm" onClick={() => setDataManagerOpen(true)}>
              <Database className="h-4 w-4 mr-2" />
              Data Manager
            </Button>
          )}
        </div>
      </div>

      {/* Package Data Manager Dialog */}
      <PackageDataManager
        open={dataManagerOpen}
        onOpenChange={setDataManagerOpen}
        tenantId={tenantId}
        tenantName={tenantName}
        onSuccess={() => {
          // Trigger a refresh if parent provides onAddPackage callback pattern
        }}
      />

      {/* Start Package Dialog */}
      <StartPackageDialog
        open={startPackageOpen}
        onOpenChange={setStartPackageOpen}
        tenantId={tenantId}
        tenantName={tenantName || 'Client'}
        onSuccess={() => onAddPackage?.()}
      />

      {/* Package Cards */}
      {displayedPackages.length === 0 && viewMode === 'history' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Archive className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No package history</p>
            <p className="text-sm text-muted-foreground">
              Completed packages will appear here.
            </p>
          </CardContent>
        </Card>
      )}
      {displayedPackages.map((pkg) => {
        const isExpanded = expandedPackages.has(pkg.package_id);
        return (
          <Collapsible key={pkg.id} open={isExpanded} onOpenChange={() => togglePackage(pkg.package_id)}>
            <Card className={cn("hover:shadow-md transition-shadow", pkg.membership_state === 'warning' && !pkg.is_complete && "border-red-500 border-2")}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Package Info */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", pkg.membership_state === 'warning' && !pkg.is_complete ? "bg-red-600/20" : "bg-primary/10")}>
                          <Package2 className={cn("h-5 w-5", pkg.membership_state === 'warning' && !pkg.is_complete ? "text-red-600" : "text-primary")} />
                        </div>
                        <div className="flex items-baseline gap-2">
                          <h3 className={cn("font-semibold text-lg", pkg.membership_state === 'warning' && !pkg.is_complete && "bg-red-600/15 text-red-700 px-2 py-0.5 rounded")}>{pkg.package_name}</h3>
                          {pkg.package_full_text && (
                            <span className="text-sm text-muted-foreground">— {pkg.package_full_text}</span>
                          )}
                        </div>
                      </div>
                      {pkg.is_complete ? (
                        <Badge variant="outline" className={STATE_COLORS['complete']}>
                          {STATE_ICONS['complete']}
                          <span className="ml-1 capitalize">Complete</span>
                        </Badge>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Badge 
                              variant="outline"
                              className={cn('cursor-pointer hover:opacity-80', STATE_COLORS[pkg.membership_state] || '')}
                            >
                              {STATE_ICONS[pkg.membership_state]}
                              <span className="ml-1 capitalize">{pkg.membership_state.replace('_', ' ')}</span>
                            </Badge>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(membershipStateOptions || []).map((stateOpt) => (
                              <DropdownMenuItem
                                key={stateOpt.value}
                                className={cn('capitalize', stateOpt.value === pkg.membership_state && 'font-semibold bg-accent')}
                                onClick={async () => {
                                  if (stateOpt.value === pkg.membership_state) return;
                                  try {
                                    const { error } = await supabase.rpc('transition_membership_state', {
                                      p_instance_id: parseInt(pkg.id, 10),
                                      p_new_state: stateOpt.value as any,
                                      p_reason: `Package state changed to ${stateOpt.value} by SuperAdmin`,
                                    });
                                    if (error) throw error;
                                    toast.success(`Package state changed to ${stateOpt.label}`);
                                    if (['warning', 'exiting'].includes(stateOpt.value)) {
                                      const title = `** PACKAGE STATUS "${stateOpt.label.toUpperCase()}" — ${pkg.package_name} — ALL ACTIVITY HALTED **`;
                                      navigate(`/tenant/${tenantId}/notes?initNote=true&noteTitle=${encodeURIComponent(title)}`);
                                    } else {
                                      window.location.reload();
                                    }
                                  } catch (err: any) {
                                    toast.error(err.message || 'Failed to change state');
                                  }
                                }}
                              >
                                {stateOpt.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    {/* Stats Row: State badge first, then date+hours pushed right */}
                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <CalendarIcon className="h-4 w-4" />
                        <span>Started {new Date(pkg.membership_started_at).toLocaleDateString()}</span>
                      </div>
                      {pkg.is_complete && pkg.completed_at && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Completed {new Date(pkg.completed_at).toLocaleDateString()}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{pkg.hours_used.toFixed(2)}/{pkg.hours_included} hrs used</span>
                      </div>
                    </div>

                    {/* Stage Progress – excludes offboarding/monitor/finalise stages */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Stage Progress</span>
                        <span className="font-medium">
                          {pkg.trackable_total > 0 
                            ? `${pkg.trackable_completed}/${pkg.trackable_total} stages`
                            : 'No stages configured'}
                        </span>
                      </div>
                      {pkg.trackable_total > 0 ? (
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={(pkg.trackable_completed / pkg.trackable_total) * 100} 
                            className="h-2 flex-1" 
                          />
                          <span className="text-sm font-medium w-12 text-right">
                            {Math.round((pkg.trackable_completed / pkg.trackable_total) * 100)}%
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-amber-600">
                          <AlertCircle className="h-4 w-4 inline mr-1" />
                          Stage tracking not configured for this package
                        </p>
                      )}
                      {pkg.monitor_stages > 0 && (
                        <p className="text-xs text-muted-foreground">
                          + {pkg.monitor_stages} ongoing monitor stage{pkg.monitor_stages !== 1 ? 's' : ''} (not counted in progress)
                        </p>
                      )}
                      {(pkg.total_stages - pkg.trackable_total - pkg.monitor_stages) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          + {pkg.total_stages - pkg.trackable_total - pkg.monitor_stages} exit stage{(pkg.total_stages - pkg.trackable_total - pkg.monitor_stages) !== 1 ? 's' : ''} excluded
                        </p>
                      )}
                    </div>

                    {/* Current Stage */}
                    {pkg.current_stage_name && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Current Stage:</span>
                        <Badge variant="secondary">{pkg.current_stage_name}</Badge>
                      </div>
                    )}

                    {/* Blocked Warning */}
                    {pkg.has_blocked_stages && (
                      <div className="flex items-center gap-2 text-red-600 text-sm">
                        <AlertCircle className="h-4 w-4" />
                        <span>Has blocked stages that need attention</span>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions + Renewal date stacked */}
                   <div className="flex items-start gap-2">
                      {isSuperAdmin() && (
                        <CollapsibleTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1">
                            <Settings className="h-4 w-4" />
                            Manage
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </CollapsibleTrigger>
                      )}
                      {isSuperAdmin() && !pkg.is_complete && (
                        <div className="flex flex-col items-start">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1">
                                <RefreshCw className="h-4 w-4" />
                                Renew
                                <ChevronDown className="h-3 w-3 ml-0.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const { data: incomplete } = await (supabase as any)
                                    .from('stage_instances')
                                    .select('id')
                                    .eq('packageinstance_id', parseInt(pkg.id, 10))
                                    .or('status_id.is.null,status_id.eq.0');
                                  if (incomplete && incomplete.length > 0) {
                                    toast.error('All stages must have a status before renewing.');
                                    return;
                                  }
                                  setRenewTarget(pkg);
                                }}
                              >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Renew
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFinaliseTarget(pkg);
                                }}
                              >
                                <Flag className="h-4 w-4 mr-2" />
                                Finalise
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {pkg.next_renewal_date && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Anniversary {format(parseISO(pkg.next_renewal_date), 'dd/MM/yyyy')}
                            </div>
                          )}
                        </div>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/package/${pkg.package_id}/tenant/${tenantId}/instance/${pkg.id}`);
                        }}
                      >
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </Button>
                    </div>
                </div>
              </CardContent>
              
              <CollapsibleContent>
                <div className="border-t">
                  <Tabs defaultValue="stages" className="w-full">
                    <div className="px-6 pt-4 bg-muted/30">
                      <TabsList>
                        <TabsTrigger value="stages" className="gap-1">
                          <Settings className="h-4 w-4" />
                          Stages
                        </TabsTrigger>
                        <TabsTrigger value="notes" className="gap-1">
                          <StickyNote className="h-4 w-4" />
                          Notes
                          {packageNoteCounts[pkg.id] > 0 && (
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                              {packageNoteCounts[pkg.id]}
                            </Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="time" className="gap-1">
                          <Timer className="h-4 w-4" />
                          Time Log
                        </TabsTrigger>
                      </TabsList>
                    </div>
                    
                    <TabsContent value="stages" className="mt-0">
                      <div className="px-6 pb-6 bg-muted/30">
                        <PackageStagesManager 
                          tenantId={tenantId} 
                          packageId={pkg.package_id} 
                          packageName={pkg.package_name}
                          packageInstanceId={Number(pkg.id)}
                          autoExpandStageInstanceId={parseInt(pkg.id, 10) === autoExpandPackageInstanceId ? autoExpandStageInstanceId : undefined}
                        />
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="notes" className="mt-0">
                      <div className="bg-muted/30">
                        <PackageNotesSection
                          tenantId={tenantId}
                          packageInstanceId={parseInt(pkg.id, 10)}
                          packageId={pkg.package_id}
                        />
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="time" className="mt-0">
                      <div className="bg-muted/30">
                        <PackageTimeSection
                          tenantId={tenantId}
                          clientId={tenantId}
                          packageId={pkg.package_id}
                          packageInstanceId={parseInt(pkg.id, 10)}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}

      {/* Finalise Package Dialog */}
      <Dialog open={!!finaliseTarget} onOpenChange={(open) => !open && setFinaliseTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Finalise Package</DialogTitle>
            <DialogDescription>
              Finalise <strong>{finaliseTarget?.package_name}</strong>. This will mark the package as complete.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* End Date */}
            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !finaliseEndDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {finaliseEndDate ? format(finaliseEndDate, "PPP") : "Pick end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={finaliseEndDate}
                    onSelect={setFinaliseEndDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Renewal Toggle */}
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="renew-toggle">Renew Package</Label>
                <p className="text-xs text-muted-foreground">Create a new package instance starting from the end date</p>
              </div>
              <Switch
                id="renew-toggle"
                checked={renewPackage}
                onCheckedChange={setRenewPackage}
              />
            </div>

            {/* Renewal Package Select */}
            {renewPackage && (
              <div className="space-y-2">
                <Label>Renewal Package</Label>
                <Select value={renewalPackageId} onValueChange={setRenewalPackageId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select package" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePackages.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFinaliseTarget(null)} disabled={finalising}>
              Cancel
            </Button>
            <Button onClick={handleFinalisePackage} disabled={finalising}>
              {finalising ? 'Finalising…' : 'Finalise Package'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renewal Confirm Dialog */}
      {renewTarget && (
        <RenewalConfirmDialog
          open={!!renewTarget}
          onOpenChange={(open) => !open && setRenewTarget(null)}
          pkg={renewTarget}
          tenantId={tenantId}
          onSuccess={() => {
            setRenewTarget(null);
            onAddPackage?.();
          }}
        />
      )}
    </div>
  );
}

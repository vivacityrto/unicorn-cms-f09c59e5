import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Check, Clock, Calendar, BookOpen, FileText, GraduationCap, AlertTriangle, Sparkles, AlertCircle, Info, Building2, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MembershipWithDetails, MEMBERSHIP_TIERS, RiskFlag, StageStatus } from '@/types/membership';
import { MembershipHoverCard } from './MembershipHoverCard';
import { StageStatusDot } from './StageCellEditor';
import { cn } from '@/lib/utils';
import { format, parseISO, isPast, isToday } from 'date-fns';

interface TenantGroup {
  tenant_id: number;
  tenant_name: string;
  csc_name: string | null;
  csc_avatar: string | null;
  csc_user_id: string | null;
  packages: MembershipWithDetails[];
  total_risk_flags: number;
  worst_health_score: number;
}

interface MembershipGridProps {
  memberships: MembershipWithDetails[];
  onSelectMembership: (membership: MembershipWithDetails) => void;
  onCSCChange: (tenantId: number, packageId: number, cscId: string | null) => void;
  staffUsers: Array<{ user_uuid: string; first_name: string; last_name: string; avatar_url: string | null }>;
}

export function MembershipGrid({ memberships, onSelectMembership, onCSCChange, staffUsers }: MembershipGridProps) {
  const navigate = useNavigate();
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Group memberships by tenant
  const tenantGroups = useMemo<TenantGroup[]>(() => {
    const grouped = new Map<number, TenantGroup>();
    
    memberships.forEach((m) => {
      if (!grouped.has(m.tenant_id)) {
        grouped.set(m.tenant_id, {
          tenant_id: m.tenant_id,
          tenant_name: m.tenant_name,
          csc_name: m.csc_name,
          csc_avatar: m.csc_avatar,
          csc_user_id: m.csc_user_id,
          packages: [],
          total_risk_flags: 0,
          worst_health_score: 100,
        });
      }
      const group = grouped.get(m.tenant_id)!;
      group.packages.push(m);
      group.total_risk_flags += m.risk_flags?.length || 0;
      if (m.health_score.score < group.worst_health_score) {
        group.worst_health_score = m.health_score.score;
      }
      // Use CSC from first package that has one
      if (!group.csc_name && m.csc_name) {
        group.csc_name = m.csc_name;
        group.csc_avatar = m.csc_avatar;
        group.csc_user_id = m.csc_user_id;
      }
    });
    
    return Array.from(grouped.values()).sort((a, b) => a.tenant_name.localeCompare(b.tenant_name));
  }, [memberships]);

  const toggleRow = (tenantId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(tenantId)) {
      newExpanded.delete(tenantId);
    } else {
      newExpanded.add(tenantId);
    }
    setExpandedRows(newExpanded);
  };

  const getStateStyles = (state: string) => {
    switch (state) {
      case 'active':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'at_risk':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'paused':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'exiting':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getHoursColor = (used: number, included: number) => {
    if (included === 0) return 'text-muted-foreground';
    const pct = (used / included) * 100;
    if (pct >= 90) return 'text-red-600';
    if (pct >= 70) return 'text-amber-600';
    return 'text-emerald-600';
  };

  const getHoursProgressColor = (used: number, included: number) => {
    if (included === 0) return 'bg-muted';
    const pct = (used / included) * 100;
    if (pct >= 90) return 'bg-red-500';
    if (pct >= 70) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getObligationBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"><Check className="h-3 w-3" /> Delivered</Badge>;
      case 'scheduled':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1"><Calendar className="h-3 w-3" /> Scheduled</Badge>;
      default:
        return <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200">Not Scheduled</Badge>;
    }
  };

  const getRiskFlagIcon = (severity: string) => {
    if (severity === 'critical') {
      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
    }
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  };

  const formatDueDate = (dateStr: string | null) => {
    if (!dateStr) return 'No date';
    try {
      const date = parseISO(dateStr);
      if (isPast(date) && !isToday(date)) {
        return <span className="text-red-600 font-medium">{format(date, 'MMM d')}</span>;
      }
      if (isToday(date)) {
        return <span className="text-amber-600 font-medium">Today</span>;
      }
      return format(date, 'MMM d');
    } catch {
      return dateStr;
    }
  };

  if (tenantGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Sparkles className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-1">No clients found</h3>
        <p className="text-sm text-muted-foreground">Try adjusting your filters or search query.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-8"></TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="w-32">Packages</TableHead>
            <TableHead className="w-40">CSC</TableHead>
            <TableHead className="w-20">Risk</TableHead>
            <TableHead className="w-24">Health</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tenantGroups.map((group) => {
            const isExpanded = expandedRows.has(group.tenant_id);
            const healthStatus = group.worst_health_score >= 80 ? 'healthy' : group.worst_health_score >= 50 ? 'warning' : 'critical';

            return (
              <Collapsible key={group.tenant_id} open={isExpanded} onOpenChange={() => toggleRow(group.tenant_id)} asChild>
                <>
                  <TableRow className="hover:bg-muted/30 cursor-pointer" onClick={() => toggleRow(group.tenant_id)}>
                    <TableCell className="p-2">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </CollapsibleTrigger>
                    </TableCell>
                    
                    <TableCell>
                      <div 
                        className="font-medium text-foreground hover:text-primary cursor-pointer flex items-center gap-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/clients/${group.tenant_id}`);
                        }}
                      >
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {group.tenant_name}
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {group.packages.slice(0, 2).map((pkg) => (
                          <Badge key={pkg.id} className={cn('border text-[10px] px-1.5', pkg.tier.bgColor, pkg.tier.color)}>
                            {pkg.tier.name}
                          </Badge>
                        ))}
                        {group.packages.length > 2 && (
                          <Badge variant="outline" className="text-[10px] px-1.5">
                            +{group.packages.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      {group.csc_name ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={group.csc_avatar || ''} />
                            <AvatarFallback className="text-[10px]">
                              {group.csc_name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{group.csc_name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">Unassigned</span>
                      )}
                    </TableCell>
                    
                    {/* Risk Column */}
                    <TableCell>
                      <TooltipProvider>
                        {group.total_risk_flags > 0 ? (
                          <div className="flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-xs">{group.total_risk_flags}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-emerald-600">
                            <Check className="h-3.5 w-3.5" />
                            <span className="text-xs">OK</span>
                          </div>
                        )}
                      </TooltipProvider>
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div className={cn(
                          'h-2.5 w-2.5 rounded-full',
                          healthStatus === 'healthy' ? 'bg-emerald-500' :
                          healthStatus === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                        )} />
                        <span className="text-sm">{group.worst_health_score}</span>
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/clients/${group.tenant_id}`);
                        }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>

                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/10">
                      <TableCell colSpan={7} className="p-0">
                        <div className="p-4 space-y-3">
                          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Active Packages</h4>
                          <div className="grid gap-2">
                            {group.packages.map((membership) => {
                              const hoursPercent = membership.tier.hoursIncluded > 0 
                                ? (membership.hours_used_current_month / membership.tier.hoursIncluded) * 100 
                                : 0;
                              
                              return (
                                <div key={membership.id} className="flex items-center gap-4 p-3 rounded-lg border bg-background">
                                  {/* Package Badge */}
                                  <Badge className={cn('border shrink-0', membership.tier.bgColor, membership.tier.color)}>
                                    {membership.tier.fullText}
                                  </Badge>
                                  
                                  {/* Current Stage */}
                                  <div className="flex-1 min-w-0">
                                    {membership.current_stage_name ? (
                                      <div className="flex items-center gap-1.5">
                                        <StageStatusDot state={(membership.current_stage_status as StageStatus) || 'not_started'} />
                                        <span className="text-sm truncate">{membership.current_stage_name}</span>
                                        {membership.current_stage_status === 'blocked' && (
                                          <Badge variant="outline" className="h-4 px-1 text-[10px] bg-red-50 text-red-600 border-red-200 ml-1">
                                            Blocked
                                          </Badge>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-sm text-muted-foreground italic">No stage data</span>
                                    )}
                                  </div>
                                  
                                  {/* Progress */}
                                  <div className="flex items-center gap-2 w-24">
                                    <Progress value={membership.progress_percent} className="h-1.5 flex-1" />
                                    <span className="text-xs text-muted-foreground w-8">{membership.progress_percent}%</span>
                                  </div>
                                  
                                  {/* Hours */}
                                  {membership.tier.hoursIncluded > 0 && (
                                    <div className="w-20 text-right">
                                      <span className={cn('text-xs font-medium', getHoursColor(membership.hours_used_current_month, membership.tier.hoursIncluded))}>
                                        {membership.hours_used_current_month}/{membership.tier.hoursIncluded}h
                                      </span>
                                    </div>
                                  )}
                                  
                                  {/* State Badge */}
                                  <Badge variant="outline" className={cn('capitalize text-[10px]', getStateStyles(membership.membership_state))}>
                                    {membership.membership_state.replace('_', ' ')}
                                  </Badge>
                                  
                                  {/* Risk Flags */}
                                  {membership.risk_flags && membership.risk_flags.length > 0 && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex items-center gap-1 cursor-help">
                                          {getRiskFlagIcon(membership.risk_flags[0].severity)}
                                          {membership.risk_flags.length > 1 && (
                                            <span className="text-[10px] text-muted-foreground">+{membership.risk_flags.length - 1}</span>
                                          )}
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        {membership.risk_flags.map((flag, idx) => (
                                          <p key={idx} className="text-xs">{flag.message}</p>
                                        ))}
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          
                          {/* Quick Actions */}
                          <div className="flex items-center gap-2 pt-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-xs h-7"
                              onClick={() => navigate(`/clients/${group.tenant_id}`)}
                            >
                              View Client Details
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-xs h-7"
                              onClick={() => navigate(`/tenant/${group.tenant_id}/notes`)}
                            >
                              View Notes
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  </CollapsibleContent>
                </>
              </Collapsible>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

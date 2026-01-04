import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, Clock, Calendar, BookOpen, FileText, GraduationCap, AlertTriangle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MembershipWithDetails, MEMBERSHIP_TIERS } from '@/types/membership';
import { MembershipHoverCard } from './MembershipHoverCard';
import { cn } from '@/lib/utils';

interface MembershipGridProps {
  memberships: MembershipWithDetails[];
  onSelectMembership: (membership: MembershipWithDetails) => void;
  onCSCChange: (tenantId: number, packageId: number, cscId: string | null) => void;
  staffUsers: Array<{ user_uuid: string; first_name: string; last_name: string; avatar_url: string | null }>;
}

export function MembershipGrid({ memberships, onSelectMembership, onCSCChange, staffUsers }: MembershipGridProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
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

  if (memberships.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Sparkles className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-1">No memberships found</h3>
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
            <TableHead className="w-28">Package</TableHead>
            <TableHead className="w-40">CSC</TableHead>
            <TableHead className="w-24">State</TableHead>
            <TableHead className="w-28">Hours</TableHead>
            <TableHead className="w-24">Health</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {memberships.map((membership) => {
            const isExpanded = expandedRows.has(membership.id);
            const hoursPercent = membership.tier.hoursIncluded > 0 
              ? (membership.hours_used_current_month / membership.tier.hoursIncluded) * 100 
              : 0;

            return (
              <Collapsible key={membership.id} open={isExpanded} onOpenChange={() => toggleRow(membership.id)} asChild>
                <>
                  <TableRow className="hover:bg-muted/30 cursor-pointer" onClick={() => toggleRow(membership.id)}>
                    <TableCell className="p-2">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </CollapsibleTrigger>
                    </TableCell>
                    
                    <TableCell>
                      <MembershipHoverCard membership={membership}>
                        <div className="font-medium text-foreground hover:text-primary cursor-pointer">
                          {membership.tenant_name}
                        </div>
                      </MembershipHoverCard>
                      {membership.overdue_tasks_count > 0 && (
                        <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-[10px]">
                          {membership.overdue_tasks_count} overdue
                        </Badge>
                      )}
                    </TableCell>
                    
                    <TableCell>
                      <Badge className={cn('border', membership.tier.bgColor, membership.tier.color)}>
                        {membership.tier.fullText}
                      </Badge>
                    </TableCell>
                    
                    <TableCell>
                      {membership.csc_name ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={membership.csc_avatar || ''} />
                            <AvatarFallback className="text-[10px]">
                              {membership.csc_name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{membership.csc_name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">Unassigned</span>
                      )}
                    </TableCell>
                    
                    <TableCell>
                      <Badge variant="outline" className={cn('capitalize', getStateStyles(membership.membership_state))}>
                        {membership.membership_state.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    
                    <TableCell>
                      {membership.tier.hoursIncluded > 0 ? (
                        <div className="space-y-1">
                          <div className={cn('text-sm font-medium', getHoursColor(membership.hours_used_current_month, membership.tier.hoursIncluded))}>
                            {membership.hours_used_current_month}/{membership.tier.hoursIncluded}h
                          </div>
                          <Progress 
                            value={Math.min(hoursPercent, 100)} 
                            className="h-1.5"
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No hours</span>
                      )}
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div className={cn(
                          'h-2.5 w-2.5 rounded-full',
                          membership.health_score.status === 'healthy' ? 'bg-emerald-500' :
                          membership.health_score.status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                        )} />
                        <span className="text-sm">{membership.health_score.score}</span>
                      </div>
                    </TableCell>
                  </TableRow>

                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={7} className="p-0">
                        <div className="p-4 grid grid-cols-4 gap-4">
                          {/* Onboarding */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Onboarding</h4>
                            <div className="flex items-center gap-2 p-2 rounded bg-background border">
                              {membership.setup_complete ? (
                                <Check className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <Clock className="h-4 w-4 text-amber-500" />
                              )}
                              <span className="text-sm">
                                Setup: {membership.setup_complete ? 'Complete' : 'Pending'}
                              </span>
                            </div>
                          </div>

                          {/* Ongoing Access */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Ongoing Access</h4>
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 p-1.5 rounded bg-background border text-xs">
                                <GraduationCap className="h-3.5 w-3.5 text-blue-500" />
                                Professional Development
                                <Check className="h-3 w-3 text-emerald-500 ml-auto" />
                              </div>
                              <div className="flex items-center gap-2 p-1.5 rounded bg-background border text-xs">
                                <BookOpen className="h-3.5 w-3.5 text-purple-500" />
                                Vivacity Training
                                <Check className="h-3 w-3 text-emerald-500 ml-auto" />
                              </div>
                              <div className="flex items-center gap-2 p-1.5 rounded bg-background border text-xs">
                                <FileText className="h-3.5 w-3.5 text-cyan-500" />
                                RTO Documentation 2025
                                <Check className="h-3 w-3 text-emerald-500 ml-auto" />
                              </div>
                            </div>
                          </div>

                          {/* Usage & Support */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Usage & Support</h4>
                            <div className="p-2 rounded bg-background border space-y-2">
                              <div className="flex justify-between text-xs">
                                <span>Consultation Hours</span>
                                <span className={getHoursColor(membership.hours_used_current_month, membership.tier.hoursIncluded)}>
                                  {membership.hours_used_current_month}/{membership.tier.hoursIncluded}h
                                </span>
                              </div>
                              {membership.tier.hoursIncluded > 0 && (
                                <Progress value={Math.min(hoursPercent, 100)} className="h-2" />
                              )}
                              <Button size="sm" variant="outline" className="w-full text-xs h-7 mt-1">
                                + Log Consult
                              </Button>
                            </div>
                          </div>

                          {/* Annual Obligations */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-semibold uppercase text-muted-foreground">Annual Obligations</h4>
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between p-1.5 rounded bg-background border text-xs">
                                <span>Compliance Health Check</span>
                                {getObligationBadge(membership.health_check_status)}
                              </div>
                              <div className="flex items-center justify-between p-1.5 rounded bg-background border text-xs">
                                <span>Assessment Validation</span>
                                {getObligationBadge(membership.validation_status)}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Risk factors */}
                        {membership.health_score.risk_factors.length > 0 && (
                          <div className="px-4 pb-4">
                            <div className="flex items-center gap-2 p-2 rounded bg-amber-50 border border-amber-200">
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                              <span className="text-xs text-amber-700">
                                Risk factors: {membership.health_score.risk_factors.map(r => r.message).join(' • ')}
                              </span>
                            </div>
                          </div>
                        )}
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

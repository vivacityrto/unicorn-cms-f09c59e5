import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ExternalLink, AlertTriangle, MessageSquare, Mail, TrendingUp, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import type { AttentionTenant as PortfolioTenant, TenantComms } from '@/hooks/useDashboardTriage';
import { cn } from '@/lib/utils';

interface Props {
  tenant: PortfolioTenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fetchComms: (tenantId: number) => Promise<TenantComms | null>;
  onLogEvent: (action: string, metadata?: Record<string, any>) => void;
}

const riskColors: Record<string, string> = {
  high: 'text-destructive', elevated: 'text-orange-500', emerging: 'text-amber-500', stable: 'text-emerald-500'
};
const healthColors: Record<string, string> = {
  critical: 'text-destructive', at_risk: 'text-orange-500', monitoring: 'text-amber-500', healthy: 'text-emerald-500'
};

function AttentionDriversSection({ tenant }: { tenant: PortfolioTenant }) {
  const drivers = Array.isArray(tenant.attention_drivers_json) ? tenant.attention_drivers_json : [];
  if (drivers.length === 0) return null;

  return (
    <section>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4" /> Why This Tenant
        <Badge variant="outline" className="text-[10px] ml-auto">Score: {tenant.attention_score}</Badge>
      </h3>
      <div className="space-y-2">
        {drivers.slice(0, 3).map((d: any, i: number) => (
          <div key={i} className="flex items-center justify-between border rounded-md p-2.5 text-sm bg-muted/30">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-xs">{d.driver}</p>
              <p className="text-[11px] text-muted-foreground">{d.value}</p>
            </div>
            <Badge variant="secondary" className="text-[10px] shrink-0">+{d.impact}pts</Badge>
          </div>
        ))}
      </div>
      {/* Sub-score breakdown */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'Stage', value: tenant.stage_score, weight: 30 },
          { label: 'Gaps', value: tenant.gaps_score, weight: 20 },
          { label: 'Risk', value: tenant.risk_score, weight: 20 },
          { label: 'Stale', value: tenant.staleness_score, weight: 15 },
          { label: 'Renewal', value: tenant.renewal_score, weight: 10 },
          { label: 'Burn', value: tenant.burn_score, weight: 5 },
        ].map(s => (
          <div key={s.label} className="border rounded p-1.5">
            <p className="text-[10px] text-muted-foreground">{s.label} ({s.weight}%)</p>
            <p className="text-sm font-bold">{s.value ?? 0}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function TenantDrawer({ tenant, open, onOpenChange, fetchComms, onLogEvent }: Props) {
  const navigate = useNavigate();
  const [comms, setComms] = useState<TenantComms | null>(null);
  const [commsLoading, setCommsLoading] = useState(false);

  useEffect(() => {
    if (tenant && open) {
      setCommsLoading(true);
      fetchComms(tenant.tenant_id).then(c => {
        setComms(c);
        setCommsLoading(false);
      });
      onLogEvent('drawer_opened', { tenant_id: tenant.tenant_id });
    }
  }, [tenant?.tenant_id, open]);

  if (!tenant) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {tenant.tenant_name}
            <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={() => navigate(`/tenant/${tenant.tenant_id}`)}>
              Open Tenant <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Attention Drivers (Top 3) */}
          <AttentionDriversSection tenant={tenant} />

          <Separator />

          {/* Top Signals */}
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Top Signals
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Risk Status</span>
                <span className={cn('font-medium capitalize', riskColors[tenant.risk_status] || '')}>
                  {tenant.risk_status}
                  {tenant.risk_index_delta_14d !== 0 && (
                    <span className="ml-1 text-xs">({tenant.risk_index_delta_14d > 0 ? '+' : ''}{tenant.risk_index_delta_14d}%)</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Worst Stage Health</span>
                <span className={cn('font-medium capitalize', healthColors[tenant.worst_stage_health_status] || '')}>
                  {tenant.worst_stage_health_status.replace('_', ' ')}
                </span>
              </div>
              {tenant.critical_stage_count > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Critical Stages</span>
                  <Badge variant="destructive" className="text-xs">{tenant.critical_stage_count}</Badge>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mandatory Gaps</span>
                <span className={tenant.mandatory_gaps_count > 0 ? 'text-destructive font-medium' : ''}>
                  {tenant.mandatory_gaps_count}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overdue Tasks</span>
                <span className={tenant.overdue_tasks_count > 0 ? 'text-destructive font-medium' : ''}>
                  {tenant.overdue_tasks_count}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Burn Risk</span>
                <span className={tenant.burn_risk_status === 'critical' ? 'text-orange-500 font-medium' : ''}>
                  {tenant.burn_risk_status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Consult Hours (30d)</span>
                <span>{Number(tenant.consult_hours_30d).toFixed(1)}h</span>
              </div>
              {tenant.days_to_renewal != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Renewal</span>
                  <span className={tenant.days_to_renewal <= 30 ? 'text-destructive font-medium' : ''}>
                    {tenant.days_to_renewal <= 0 ? 'In window now' : `${tenant.days_to_renewal}d`}
                  </span>
                </div>
              )}
            </div>
          </section>

          <Separator />

          {/* Recent Notes (last 5) */}
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Recent Notes
              <span className="text-[10px] text-muted-foreground font-normal">(last 5)</span>
            </h3>
            {commsLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (comms?.recent_notes_json || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No recent notes.</p>
            ) : (
              <div className="space-y-2">
                {(comms?.recent_notes_json || []).map((note: any) => (
                  <div key={note.id} className="border rounded-md p-2.5 text-sm hover:bg-muted/30 transition-colors cursor-pointer"
                       onClick={() => navigate(`/tenant/${tenant.tenant_id}`)}>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <Badge variant="outline" className="text-[10px]">{note.type || 'Note'}</Badge>
                      <span>{formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}</span>
                    </div>
                    {note.title && <p className="font-medium text-xs mb-0.5">{note.title}</p>}
                    <p className="text-xs text-muted-foreground line-clamp-2">{note.preview}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* Recent Emails (last 5) */}
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4" /> Recent Emails
              <span className="text-[10px] text-muted-foreground font-normal">(last 5)</span>
            </h3>
            {commsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (comms?.recent_emails_json || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No recent emails.</p>
            ) : (
              <div className="space-y-2">
                {(comms?.recent_emails_json || []).map((email: any) => (
                  <div key={email.id} className="border rounded-md p-2.5 text-sm hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                      <span>{email.sender_name || email.sender_email || 'Unknown'}</span>
                      <span>·</span>
                      <span>{email.created_at ? formatDistanceToNow(new Date(email.created_at), { addSuffix: true }) : ''}</span>
                    </div>
                    <p className="font-medium text-xs">{email.subject}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{email.preview}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* Quick Actions */}
          <section>
            <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate(`/tenant/${tenant.tenant_id}`)}>
                Open Tenant
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

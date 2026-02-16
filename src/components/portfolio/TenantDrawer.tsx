import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, AlertTriangle, Activity, FileWarning, MessageSquare, Mail } from 'lucide-react';
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

  const riskColors: Record<string, string> = {
    high: 'text-destructive', elevated: 'text-orange-500', emerging: 'text-amber-500', stable: 'text-emerald-500'
  };

  const healthColors: Record<string, string> = {
    critical: 'text-destructive', at_risk: 'text-orange-500', monitoring: 'text-amber-500', healthy: 'text-emerald-500'
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {tenant.tenant_name}
            <Button variant="ghost" size="sm" className="ml-auto gap-1" onClick={() => navigate(`/admin/tenant/${tenant.tenant_id}`)}>
              Open Tenant <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
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
            </div>
          </section>

          <Separator />

          {/* Recent Notes */}
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Recent Notes
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
                  <div key={note.id} className="border rounded-md p-2.5 text-sm">
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

          {/* Recent Emails */}
          <section>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Mail className="h-4 w-4" /> Recent Emails
            </h3>
            {commsLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (comms?.recent_emails_json || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No recent emails.</p>
            ) : (
              <div className="space-y-2">
                {(comms?.recent_emails_json || []).map((email: any) => (
                  <div key={email.id} className="border rounded-md p-2.5 text-sm">
                    <p className="font-medium text-xs">{email.subject}</p>
                    <p className="text-xs text-muted-foreground">{email.preview}</p>
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
              <Button variant="outline" size="sm" onClick={() => navigate(`/admin/tenant/${tenant.tenant_id}`)}>
                Open Tenant
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Check, Clock, ChevronDown, Inbox } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { PriorityInboxItem } from '@/hooks/useDashboardTriage';
import { cn } from '@/lib/utils';

interface Props {
  items: PriorityInboxItem[];
  loading: boolean;
  tenantNames: Record<number, string>;
  onAcknowledge: (itemId: string) => void;
  onSnooze: (params: { itemId: string; days: number }) => void;
  onOpenDrawer: (tenantId: number) => void;
}

const severityConfig: Record<string, { class: string; label: string }> = {
  critical: { class: 'bg-destructive text-destructive-foreground', label: 'Critical' },
  high: { class: 'bg-orange-500 text-white', label: 'High' },
  moderate: { class: 'bg-amber-500 text-white', label: 'Moderate' },
};

const typeLabels: Record<string, string> = {
  risk_alert: 'Risk Alert',
  stage_health: 'Stage Health',
  evidence_gap: 'Evidence Gap',
  burn_risk: 'Burn Risk',
  retention_risk: 'Retention',
  regulator_change: 'Regulator',
  playbook_suggested: 'Playbook',
};

export function PriorityInboxPanel({ items, loading, tenantNames, onAcknowledge, onSnooze, onOpenDrawer }: Props) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="h-4 w-4" /> Priority Inbox
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="h-4 w-4" /> Priority Inbox
            {items.length > 0 && (
              <Badge variant="secondary" className="text-xs">{items.length}</Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">No pending items — behavioural prompts will appear here.</p>
        ) : (
          <div className="max-h-[400px] overflow-y-auto divide-y">
            {items.slice(0, 25).map(item => {
              const sev = severityConfig[item.severity] || severityConfig.moderate;
              const tenantName = item.tenant_id ? tenantNames[item.tenant_id] || `Tenant ${item.tenant_id}` : '—';
              return (
                <div key={item.item_id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <Badge className={cn('text-[10px] shrink-0 mt-0.5', sev.class)}>{sev.label}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-0.5">
                      <span className="font-medium text-foreground">{tenantName}</span>
                      <span>·</span>
                      <span>{typeLabels[item.item_type] || item.item_type}</span>
                    </div>
                    <p className="text-sm truncate">{item.summary}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.tenant_id && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onOpenDrawer(item.tenant_id!)}>
                        Open
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onAcknowledge(item.item_id)} title="Acknowledge">
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Snooze">
                          <Clock className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onSnooze({ itemId: item.item_id, days: 1 })}>1 day</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onSnooze({ itemId: item.item_id, days: 3 })}>3 days</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onSnooze({ itemId: item.item_id, days: 7 })}>7 days</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

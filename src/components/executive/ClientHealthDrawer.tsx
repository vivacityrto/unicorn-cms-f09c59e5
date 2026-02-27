/**
 * ClientHealthDrawer – Unicorn 2.0
 *
 * Right-side drawer with tabs: Overview, Signals, Actions.
 */

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { ArrowRight, CalendarCheck, Upload, ShieldAlert, Clock, ListChecks } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SparklineMini } from './SparklineMini';
import { DrawerSignalsTab } from './DrawerSignalsTab';
import type { ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';
import type { AnomalyRow } from '@/hooks/useExecutiveAnomalies';

interface ClientHealthDrawerProps {
  row: ExecutiveHealthRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anomalies?: AnomalyRow[];
}

const bandVariant: Record<string, string> = {
  stable: 'bg-brand-purple-100 text-brand-purple-700',
  watch: 'bg-brand-aqua-100 text-brand-aqua-700',
  at_risk: 'bg-brand-macaron-100 text-brand-macaron-700',
  immediate_attention: 'bg-brand-fuchsia-100 text-brand-fuchsia-700',
};

interface ActionSuggestion {
  icon: typeof CalendarCheck;
  label: string;
  description: string;
  href: string;
}

function getActions(row: ExecutiveHealthRow): ActionSuggestion[] {
  const actions: ActionSuggestion[] = [];
  const flags = row.predictive_flags;
  if (flags.activity_decay || flags.severe_activity_decay) {
    actions.push({ icon: CalendarCheck, label: 'Schedule check-in', description: 'Activity has dropped. Trend detected.', href: `/manage-tenants/${row.tenant_id}` });
  }
  if (flags.backlog_growth || flags.sustained_backlog_growth) {
    actions.push({ icon: Upload, label: 'Upload missing documents', description: `${row.documents_pending_upload} documents pending upload.`, href: `/manage-tenants/${row.tenant_id}` });
  }
  if (flags.risk_escalation) {
    actions.push({ icon: ShieldAlert, label: 'Review high priority risks', description: `${row.active_risks} active risks detected.`, href: `/manage-tenants/${row.tenant_id}` });
  }
  if (flags.burn_rate_risk) {
    actions.push({ icon: Clock, label: 'Review consult allocation', description: `${row.hours_remaining}h remaining of ${row.hours_included}h.`, href: `/manage-tenants/${row.tenant_id}` });
  }
  if (flags.phase_drift) {
    actions.push({ icon: ListChecks, label: 'Complete next stage actions', description: `${row.total_actions_remaining} actions remaining${row.current_phase ? ` in ${row.current_phase}` : ''}.`, href: `/manage-tenants/${row.tenant_id}` });
  }
  return actions;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{value}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function SignalRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn(
        'text-xs font-medium px-2 py-0.5 rounded-full',
        active
          ? 'bg-brand-fuchsia-100 text-brand-fuchsia-700 dark:bg-brand-fuchsia-900 dark:text-brand-fuchsia-200'
          : 'bg-muted text-muted-foreground'
      )}>
        {active ? 'Triggered' : 'Clear'}
      </span>
    </div>
  );
}

const CONFIDENCE_LABELS: Record<string, string> = {
  high: 'High density',
  medium: 'Medium density',
  low: 'Low density',
  none: 'No data',
};

export function ClientHealthDrawer({ row, open, onOpenChange, anomalies = [] }: ClientHealthDrawerProps) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');

  if (!row) return null;

  const actions = getActions(row);
  const capsApplied = Array.isArray(row.caps_applied)
    ? (row.caps_applied as Array<{ type: string; cap: number }>)
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg truncate">{row.client_name}</SheetTitle>
          <SheetDescription className="text-sm">{row.package_name}</SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
            <TabsTrigger value="signals" className="flex-1">
              Signals
              {anomalies.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 py-0">{anomalies.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex-1">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-0">
            {/* Compliance State */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">Compliance State</h4>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl font-bold text-foreground">{row.overall_score}%</span>
                <Badge className={cn('capitalize', bandVariant[row.risk_band])}>
                  {row.risk_band.replace('_', ' ')}
                </Badge>
              </div>
              <div className="space-y-2">
                <ScoreBar label="Stage Completion" value={row.phase_completion} />
                <ScoreBar label="Documentation Coverage" value={row.documentation_coverage} />
                <ScoreBar label="Risk Health" value={row.risk_health} />
                <ScoreBar label="Consult Health" value={row.consult_health} />
              </div>
              {capsApplied.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Caps applied:</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {capsApplied.map((cap, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {cap.type}: {cap.cap}%
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {row.days_stale > 0 ? `${row.days_stale} days since last activity` : 'Active recently'}
              </p>
            </div>

            <Separator />

            {/* 30-Day Trends */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">30-Day Trends</h4>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Compliance Score</span>
                    <span className="text-[10px] text-muted-foreground">{CONFIDENCE_LABELS[row.compliance_spark_confidence]}</span>
                  </div>
                  <SparklineMini
                    values={row.compliance_spark_scores ?? []}
                    confidence={row.compliance_spark_confidence}
                    kind="compliance"
                    height={32}
                    width={320}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Operational Risk</span>
                    <span className="text-[10px] text-muted-foreground">{CONFIDENCE_LABELS[row.predictive_spark_confidence]}</span>
                  </div>
                  <SparklineMini
                    values={row.predictive_spark_scores ?? []}
                    confidence={row.predictive_spark_confidence}
                    kind="predictive"
                    height={32}
                    width={320}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Predictive Signals */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">Predictive Signals</h4>
              <div className="space-y-0.5">
                <SignalRow label="Activity Decay" active={row.predictive_flags.activity_decay} />
                <SignalRow label="Risk Escalation" active={row.predictive_flags.risk_escalation} />
                <SignalRow label="Backlog Growth" active={row.predictive_flags.backlog_growth} />
                <SignalRow label="Burn Rate Risk" active={row.predictive_flags.burn_rate_risk} />
                <SignalRow label="Stage Drift" active={row.predictive_flags.phase_drift} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Operational Risk Score: {row.operational_risk_score}/100
              </p>
            </div>
          </TabsContent>

          <TabsContent value="signals" className="mt-0">
            <DrawerSignalsTab
              anomalies={anomalies}
              tenantId={row.tenant_id}
              onClose={() => onOpenChange(false)}
            />
          </TabsContent>

          <TabsContent value="actions" className="mt-0">
            {actions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No recommended actions at this time.</p>
            ) : (
              <div className="space-y-2">
                {actions.map((action, i) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={i}
                      className="w-full flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors text-left"
                      onClick={() => { onOpenChange(false); navigate(action.href); }}
                    >
                      <Icon className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{action.label}</p>
                        <p className="text-xs text-muted-foreground">{action.description}</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

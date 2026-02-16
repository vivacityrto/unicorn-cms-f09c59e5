import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useRBAC } from '@/hooks/useRBAC';
import { useAuth } from '@/hooks/useAuth';
import {
  useRiskCommandAlerts,
  useAcknowledgeAlert,
  useResolveAlert,
  type RealTimeRiskAlert,
} from '@/hooks/useRiskCommandCentre';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Eye,
  Loader2,
  Zap,
  TrendingUp,
  Users,
  FileWarning,
  Radio,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from '@/hooks/use-toast';

const ALERT_TYPE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  high_severity_risk: { label: 'High Severity Risk', icon: <AlertTriangle className="w-4 h-4" /> },
  critical_stage: { label: 'Critical Stage', icon: <ShieldAlert className="w-4 h-4" /> },
  regulator_overlap: { label: 'Regulator Overlap', icon: <FileWarning className="w-4 h-4" /> },
  rapid_risk_spike: { label: 'Rapid Risk Spike', icon: <TrendingUp className="w-4 h-4" /> },
  repeated_gap: { label: 'Repeated Gap', icon: <Zap className="w-4 h-4" /> },
  consultant_overload_risk: { label: 'Consultant Overload', icon: <Users className="w-4 h-4" /> },
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800',
  moderate: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800',
};

export default function RiskCommandCentre() {
  const { isSuperAdmin } = useRBAC();
  const { profile } = useAuth();
  const { alerts, overview, isLoading } = useRiskCommandAlerts();
  const acknowledgeMut = useAcknowledgeAlert();
  const resolveMut = useResolveAlert();
  const [tab, setTab] = useState('active');

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">Access Restricted</h2>
          <p className="text-sm text-muted-foreground">Risk Command Centre is available to authorised Vivacity staff only.</p>
        </div>
      </DashboardLayout>
    );
  }

  const activeAlerts = alerts.filter(a => !a.resolved_flag);
  const resolvedAlerts = alerts.filter(a => a.resolved_flag);
  const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');

  const handleAcknowledge = (alertId: string) => {
    if (!profile?.user_uuid) return;
    acknowledgeMut.mutate(
      { alertId, userId: profile.user_uuid },
      { onSuccess: () => toast({ title: 'Alert acknowledged' }) }
    );
  };

  const handleResolve = (alertId: string) => {
    resolveMut.mutate(alertId, {
      onSuccess: () => toast({ title: 'Alert resolved' }),
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 max-w-screen-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Radio className="w-6 h-6 text-destructive" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Risk Command Centre</h1>
            <p className="text-xs text-muted-foreground">
              Live risk surveillance — advisory only, not enforcement
            </p>
          </div>
        </div>

        {/* Executive Banner for Critical */}
        {criticalAlerts.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-destructive flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive">
                  {criticalAlerts.length} Critical Risk Event{criticalAlerts.length > 1 ? 's' : ''} Detected
                </p>
                <p className="text-xs text-muted-foreground">
                  Immediate review recommended. No automatic actions taken.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Overview KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Active Alerts" value={activeAlerts.length} />
          <KpiCard label="Critical" value={overview.critical} variant="destructive" />
          <KpiCard label="High" value={overview.high} variant="warning" />
          <KpiCard label="Unacknowledged" value={overview.unacknowledged} />
          <KpiCard label="Unresolved >14d" value={overview.unresolvedOver14Days} variant={overview.unresolvedOver14Days > 0 ? 'warning' : 'default'} />
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="active">Active ({activeAlerts.length})</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="resolved">Resolved ({resolvedAlerts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-3">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : activeAlerts.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No active alerts</CardContent></Card>
            ) : (
              <AlertsTable
                alerts={activeAlerts}
                onAcknowledge={handleAcknowledge}
                onResolve={handleResolve}
              />
            )}
          </TabsContent>

          <TabsContent value="timeline" className="mt-3">
            <Card>
              <CardHeader><CardTitle className="text-sm">Critical Timeline</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {activeAlerts.slice(0, 50).map(alert => (
                    <div key={alert.id} className="flex items-start gap-3 border-l-2 border-muted pl-3 py-1">
                      <div className={`mt-0.5 ${alert.severity === 'critical' ? 'text-destructive' : alert.severity === 'high' ? 'text-amber-600' : 'text-blue-600'}`}>
                        {ALERT_TYPE_LABELS[alert.alert_type]?.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{alert.alert_summary}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                          {' · '}
                          {ALERT_TYPE_LABELS[alert.alert_type]?.label}
                        </p>
                      </div>
                      <Badge variant="outline" className={SEVERITY_STYLES[alert.severity]}>
                        {alert.severity}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="resolved" className="mt-3">
            {resolvedAlerts.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No resolved alerts</CardContent></Card>
            ) : (
              <AlertsTable alerts={resolvedAlerts} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function KpiCard({ label, value, variant = 'default' }: { label: string; value: number; variant?: string }) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold ${
          variant === 'destructive' ? 'text-destructive' :
          variant === 'warning' ? 'text-amber-600 dark:text-amber-400' :
          'text-foreground'
        }`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function AlertsTable({
  alerts,
  onAcknowledge,
  onResolve,
}: {
  alerts: RealTimeRiskAlert[];
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Alert</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
              {onAcknowledge && <TableHead className="w-32">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.map(alert => (
              <TableRow key={alert.id}>
                <TableCell>
                  <div className={`${
                    alert.severity === 'critical' ? 'text-destructive' :
                    alert.severity === 'high' ? 'text-amber-600' : 'text-blue-600'
                  }`}>
                    {ALERT_TYPE_LABELS[alert.alert_type]?.icon}
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-xs font-medium text-foreground max-w-xs truncate">{alert.alert_summary}</p>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">{ALERT_TYPE_LABELS[alert.alert_type]?.label}</span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={SEVERITY_STYLES[alert.severity]}>
                    {alert.severity}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  {alert.resolved_flag ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300">Resolved</Badge>
                  ) : alert.acknowledged_flag ? (
                    <Badge variant="outline">Acknowledged</Badge>
                  ) : (
                    <Badge variant="secondary">New</Badge>
                  )}
                </TableCell>
                {onAcknowledge && (
                  <TableCell>
                    <div className="flex gap-1">
                      {!alert.acknowledged_flag && !alert.resolved_flag && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAcknowledge(alert.id)}>
                          <Eye className="w-3 h-3 mr-1" /> Ack
                        </Button>
                      )}
                      {!alert.resolved_flag && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onResolve?.(alert.id)}>
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Resolve
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * StrategicCommandCentre – Unicorn 2.0
 *
 * Executive control layer consolidating systemic risk, capacity, regulator impact,
 * and portfolio health into a single strategic view.
 */

import { DashboardLayout } from '@/components/DashboardLayout';
import { useRBAC } from '@/hooks/useRBAC';
import { useNavigate } from 'react-router-dom';
import {
  useStrategicSignals,
  usePortfolioRisk,
  useCapacityPressure,
  useRisingTenants,
} from '@/hooks/useStrategicCommand';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ShieldAlert,
  TrendingUp,
  Users,
  FileText,
  AlertTriangle,
  Activity,
  Loader2,
  BarChart3,
  Target,
  Zap,
} from 'lucide-react';

const STATUS_ORDER = ['high', 'elevated', 'emerging', 'stable'];
const SEVERITY_COLORS: Record<string, string> = {
  high: 'bg-destructive text-destructive-foreground',
  elevated: 'bg-orange-500 text-white',
  info: 'bg-blue-500 text-white',
  emerging: 'bg-yellow-500 text-black',
  stable: 'bg-green-500 text-white',
};

export default function StrategicCommandCentre() {
  const { isSuperAdmin } = useRBAC();
  const navigate = useNavigate();

  const { data: signals, isLoading: signalsLoading } = useStrategicSignals();
  const { data: portfolioRisk, isLoading: portfolioLoading } = usePortfolioRisk();
  const { data: capacityData, isLoading: capacityLoading } = useCapacityPressure();
  const { data: risingTenants, isLoading: risingLoading } = useRisingTenants();

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">Access Restricted</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            The Strategic Command Centre is available to executive roles only.
          </p>
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            Return to Dashboard
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // Portfolio distribution
  const totalTenants = portfolioRisk?.reduce((a, r) => a + Number(r.tenant_count), 0) || 0;
  const getDistPct = (status: string) => {
    const row = portfolioRisk?.find(r => r.forecast_risk_status === status);
    if (!row || !totalTenants) return 0;
    return Math.round((Number(row.tenant_count) / totalTenants) * 100);
  };

  // Capacity alerts
  const overCapacity = capacityData?.filter(c => Number(c.capacity_utilisation_percentage) > 100) ?? [];
  const criticalCapacity = capacityData?.filter(c => Number(c.capacity_utilisation_percentage) > 120) ?? [];
  const avgUtil = capacityData?.length
    ? Math.round(capacityData.reduce((a, c) => a + Number(c.capacity_utilisation_percentage), 0) / capacityData.length)
    : 0;

  // Recent signals (last 7 days)
  const recentSignals = signals?.slice(0, 10) ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-4 p-3 md:p-4 max-w-screen-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Strategic Intelligence Command Centre
            </h1>
            <p className="text-xs text-muted-foreground">
              Consolidated executive oversight — portfolio risk, capacity, and systemic intelligence
            </p>
          </div>
        </div>

        {/* Alert Banners */}
        {criticalCapacity.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">
              {criticalCapacity.length} consultant(s) exceeding 120% capacity — immediate attention required.
            </span>
          </div>
        )}
        {overCapacity.length >= 3 && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <span className="text-sm font-medium text-orange-700">
              {overCapacity.length} consultants over 100% capacity — team-wide overload risk.
            </span>
          </div>
        )}

        {/* SECTION 1: Portfolio Risk Overview */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          <Card className="xl:col-span-2">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                Portfolio Risk Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {portfolioLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {STATUS_ORDER.map(status => (
                      <div key={status} className="text-center">
                        <div className="text-2xl font-bold text-foreground">{getDistPct(status)}%</div>
                        <Badge className={`text-[10px] ${SEVERITY_COLORS[status] || 'bg-muted'}`}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                  {/* Distribution bar */}
                  <div className="flex h-3 rounded-full overflow-hidden bg-muted">
                    {STATUS_ORDER.map(status => {
                      const pct = getDistPct(status);
                      if (!pct) return null;
                      const colors: Record<string, string> = {
                        high: 'bg-destructive',
                        elevated: 'bg-orange-500',
                        emerging: 'bg-yellow-500',
                        stable: 'bg-green-500',
                      };
                      return <div key={status} className={`${colors[status]}`} style={{ width: `${pct}%` }} />;
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Top Rising Tenants */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                Top Rising Risk
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {risingLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2">
                  {(risingTenants ?? []).slice(0, 5).map((t: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate max-w-[140px]">
                        Tenant {String(t.tenant_id).slice(0, 8)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{Math.round(Number(t.composite_risk_index))}</span>
                        <Badge className={`text-[9px] ${SEVERITY_COLORS[t.forecast_risk_status] || 'bg-muted'}`}>
                          {t.forecast_risk_status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  {(!risingTenants || risingTenants.length === 0) && (
                    <p className="text-xs text-muted-foreground py-4 text-center">No forecast data yet</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* SECTION 4: Capacity Pressure Panel */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Capacity Pressure Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {capacityLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-foreground">{avgUtil}%</div>
                    <span className="text-[10px] text-muted-foreground">Avg Utilisation</span>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-foreground">{capacityData?.length ?? 0}</div>
                    <span className="text-[10px] text-muted-foreground">Consultants</span>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">{overCapacity.length}</div>
                    <span className="text-[10px] text-muted-foreground">&gt;100% Capacity</span>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-destructive">{criticalCapacity.length}</div>
                    <span className="text-[10px] text-muted-foreground">&gt;120% Critical</span>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {(capacityData ?? []).map(c => {
                    const pct = Number(c.capacity_utilisation_percentage);
                    const color = pct > 120 ? 'text-destructive' : pct > 100 ? 'text-orange-600' : pct > 90 ? 'text-yellow-600' : 'text-green-600';
                    return (
                      <div key={c.user_id} className="flex items-center justify-between text-xs">
                        <span className="truncate max-w-[200px]">{c.consultant_name}</span>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-medium ${color}`}>{pct}%</span>
                          <span className="text-muted-foreground">{c.high_risk_stages_count} high-risk</span>
                          <span className="text-muted-foreground">{c.overdue_tasks_count} overdue</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* SECTION: Strategic Signals + Decision Support */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {/* Strategic Signals */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                Strategic Signals
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {signalsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {recentSignals.map(s => (
                    <div key={s.id} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                      <Badge className={`text-[9px] shrink-0 ${SEVERITY_COLORS[s.signal_severity] || 'bg-muted'}`}>
                        {s.signal_severity}
                      </Badge>
                      <div>
                        <p className="text-xs">{s.signal_summary}</p>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(s.generated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                  {recentSignals.length === 0 && (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      No strategic signals generated yet. Signals are produced by the nightly analysis engine.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Decision Support Panel */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Strategic Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-xs text-muted-foreground mb-3">
                Manually initiate strategic actions based on current intelligence.
              </p>
              <div className="grid grid-cols-1 gap-2">
                <Button variant="outline" size="sm" className="justify-start text-xs h-8">
                  <FileText className="h-3.5 w-3.5 mr-2" />
                  Initiate Template Review Cycle
                </Button>
                <Button variant="outline" size="sm" className="justify-start text-xs h-8">
                  <Users className="h-3.5 w-3.5 mr-2" />
                  Schedule Internal Training
                </Button>
                <Button variant="outline" size="sm" className="justify-start text-xs h-8">
                  <BarChart3 className="h-3.5 w-3.5 mr-2" />
                  Review Capacity Allocation
                </Button>
                <Button variant="outline" size="sm" className="justify-start text-xs h-8">
                  <Target className="h-3.5 w-3.5 mr-2" />
                  Launch Targeted Client Communication
                </Button>
                <Button variant="outline" size="sm" className="justify-start text-xs h-8">
                  <Activity className="h-3.5 w-3.5 mr-2" />
                  Create CSC Roundtable Agenda
                </Button>
              </div>
              <Separator className="my-3" />
              <p className="text-[10px] text-muted-foreground italic">
                No actions are automated. Each triggers a manual workflow.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-muted-foreground text-center italic">
          This view consolidates operational intelligence for strategic planning only. It does not determine compliance status or create automated actions.
        </p>
      </div>
    </DashboardLayout>
  );
}

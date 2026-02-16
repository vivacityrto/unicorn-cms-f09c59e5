/**
 * StrategicOrchestrationDashboard – Phase 20
 *
 * Strategic Priorities command panel. Extends the Risk Command Centre
 * with enterprise-level priority synthesis, decision logging, and
 * executive strategy brief generation.
 */

import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useRBAC } from "@/hooks/useRBAC";
import { useAuth } from "@/hooks/useAuth";
import {
  useStrategicPriorities,
  useResolvePriority,
  useDecisionLog,
  useLogDecision,
  useRunOrchestration,
  type StrategicPriority,
} from "@/hooks/useStrategicOrchestration";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Brain, ShieldAlert, CheckCircle2, Loader2, RefreshCw,
  AlertTriangle, Users, TrendingDown, FileWarning, Zap, Clock,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { toast } from "@/hooks/use-toast";

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  compliance_cluster: { label: "Compliance Cluster", icon: <Zap className="w-4 h-4" /> },
  capacity_crisis: { label: "Capacity Crisis", icon: <Users className="w-4 h-4" /> },
  regulator_exposure: { label: "Regulator Exposure", icon: <FileWarning className="w-4 h-4" /> },
  retention_threat: { label: "Retention Threat", icon: <TrendingDown className="w-4 h-4" /> },
  systemic_clause_spike: { label: "Systemic Clause Spike", icon: <AlertTriangle className="w-4 h-4" /> },
  operational_breakdown: { label: "Operational Breakdown", icon: <ShieldAlert className="w-4 h-4" /> },
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  high: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800",
  elevated: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800",
};

const SCOPE_LABELS: Record<string, string> = {
  tenant: "Single Tenant",
  multi_tenant: "Multi-Tenant",
  portfolio: "Portfolio-Wide",
};

export default function StrategicOrchestrationDashboard() {
  const { isSuperAdmin } = useRBAC();
  const { profile } = useAuth();
  const { data: priorities, isLoading } = useStrategicPriorities();
  const resolveMut = useResolvePriority();
  const runOrch = useRunOrchestration();

  const [tab, setTab] = useState("active");
  const [selectedPriority, setSelectedPriority] = useState<StrategicPriority | null>(null);

  if (!isSuperAdmin) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold text-foreground">Access Restricted</h2>
          <p className="text-sm text-muted-foreground">Strategic Orchestration is available to authorised Vivacity leadership only.</p>
        </div>
      </DashboardLayout>
    );
  }

  const active = priorities?.filter(p => !p.resolved_flag) || [];
  const resolved = priorities?.filter(p => p.resolved_flag) || [];
  const critical = active.filter(p => p.severity_level === "critical");

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 max-w-screen-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Brain className="w-6 h-6 text-primary" />
            <div>
              <h1 className="text-lg font-bold text-foreground">Strategic Orchestration</h1>
              <p className="text-xs text-muted-foreground">
                Enterprise-level priority synthesis — advisory only
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => runOrch.mutate()}
            disabled={runOrch.isPending}
          >
            {runOrch.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Run Orchestration
          </Button>
        </div>

        {/* Executive Banner */}
        {critical.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-destructive flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive">
                  {critical.length} Critical Strategic {critical.length === 1 ? "Priority" : "Priorities"} Detected
                </p>
                <p className="text-xs text-muted-foreground">
                  Immediate executive review recommended. No automatic actions taken.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Active Priorities" value={active.length} />
          <KpiCard label="Critical" value={critical.length} variant="destructive" />
          <KpiCard label="High" value={active.filter(p => p.severity_level === "high").length} variant="warning" />
          <KpiCard label="Portfolio-Wide" value={active.filter(p => p.impact_scope === "portfolio").length} />
          <KpiCard label="Resolved (All)" value={resolved.length} variant="success" />
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="resolved">Resolved ({resolved.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-3">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : active.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No active strategic priorities</CardContent></Card>
            ) : (
              <PrioritiesTable
                priorities={active}
                onResolve={(id) => resolveMut.mutate(id)}
                onView={setSelectedPriority}
              />
            )}
          </TabsContent>

          <TabsContent value="timeline" className="mt-3">
            <Card>
              <CardHeader><CardTitle className="text-sm">Strategic Timeline</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {(priorities || []).slice(0, 50).map(p => (
                    <div key={p.id} className="flex items-start gap-3 border-l-2 border-muted pl-3 py-1">
                      <div className={`mt-0.5 ${p.severity_level === "critical" ? "text-destructive" : p.severity_level === "high" ? "text-amber-600" : "text-blue-600"}`}>
                        {TYPE_CONFIG[p.priority_type]?.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{p.priority_summary}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                          {" · "}
                          {TYPE_CONFIG[p.priority_type]?.label}
                          {p.resolved_flag && " · Resolved"}
                        </p>
                      </div>
                      <Badge variant="outline" className={SEVERITY_STYLES[p.severity_level]}>
                        {p.severity_level}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="resolved" className="mt-3">
            {resolved.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No resolved priorities</CardContent></Card>
            ) : (
              <PrioritiesTable priorities={resolved} onView={setSelectedPriority} />
            )}
          </TabsContent>
        </Tabs>

        {/* Priority Detail Dialog */}
        {selectedPriority && (
          <PriorityDetailDialog
            priority={selectedPriority}
            open={!!selectedPriority}
            onOpenChange={(open) => !open && setSelectedPriority(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

function KpiCard({ label, value, variant = "default" }: { label: string; value: number; variant?: string }) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold ${
          variant === "destructive" ? "text-destructive" :
          variant === "warning" ? "text-amber-600 dark:text-amber-400" :
          variant === "success" ? "text-green-600 dark:text-green-400" :
          "text-foreground"
        }`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function PrioritiesTable({
  priorities,
  onResolve,
  onView,
}: {
  priorities: StrategicPriority[];
  onResolve?: (id: string) => void;
  onView: (p: StrategicPriority) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Time</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {priorities.map(p => (
              <TableRow key={p.id} className="cursor-pointer" onClick={() => onView(p)}>
                <TableCell>
                  <div className={`${
                    p.severity_level === "critical" ? "text-destructive" :
                    p.severity_level === "high" ? "text-amber-600" : "text-blue-600"
                  }`}>
                    {TYPE_CONFIG[p.priority_type]?.icon}
                  </div>
                </TableCell>
                <TableCell>
                  <p className="text-xs font-medium text-foreground max-w-sm truncate">{p.priority_summary}</p>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">{TYPE_CONFIG[p.priority_type]?.label}</span>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={SEVERITY_STYLES[p.severity_level]}>
                    {p.severity_level}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">{SCOPE_LABELS[p.impact_scope]}</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(p.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onView(p)}>
                      Review
                    </Button>
                    {onResolve && !p.resolved_flag && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onResolve(p.id)}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Resolve
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PriorityDetailDialog({
  priority,
  open,
  onOpenChange,
}: {
  priority: StrategicPriority;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: decisions } = useDecisionLog(priority.id);
  const logDecision = useLogDecision();
  const [summary, setSummary] = useState("");
  const [action, setAction] = useState("");

  const handleLog = () => {
    if (!summary.trim()) return;
    logDecision.mutate({
      priority_id: priority.id,
      decision_summary: summary,
      action_taken: action,
    });
    setSummary("");
    setAction("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {TYPE_CONFIG[priority.priority_type]?.icon}
            {TYPE_CONFIG[priority.priority_type]?.label}
            <Badge variant="outline" className={SEVERITY_STYLES[priority.severity_level]}>
              {priority.severity_level}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div>
            <p className="text-sm text-foreground">{priority.priority_summary}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Created {format(new Date(priority.created_at), "d MMM yyyy HH:mm")}
              {" · "}{SCOPE_LABELS[priority.impact_scope]}
              {priority.resolved_flag && ` · Resolved ${format(new Date(priority.resolved_at!), "d MMM yyyy")}`}
            </p>
          </div>

          {/* Affected Entities */}
          {priority.affected_entities_json?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-1">Affected Entities</h4>
              <div className="flex flex-wrap gap-1">
                {priority.affected_entities_json.map((e: any, i: number) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">
                    {e.type === "consultant" ? `${e.name} (${Math.round(e.utilisation)}%)` :
                     e.tenant_id ? `Tenant ${e.tenant_id}` : JSON.stringify(e)}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Actions */}
          {priority.recommended_actions_json?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-1">Recommended Actions</h4>
              <div className="space-y-1">
                {priority.recommended_actions_json.map((a: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="h-4 text-[9px]">{a.priority}</Badge>
                    <span className="text-muted-foreground">{a.action}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 italic">
                All actions require manual confirmation. No automatic execution.
              </p>
            </div>
          )}

          {/* Decision Log */}
          <div className="border-t pt-3">
            <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Decision Log
            </h4>
            {decisions && decisions.length > 0 ? (
              <div className="space-y-2 mb-3">
                {decisions.map(d => (
                  <div key={d.id} className="bg-muted/30 rounded p-2">
                    <p className="text-xs text-foreground">{d.decision_summary}</p>
                    {d.action_taken && <p className="text-xs text-muted-foreground mt-1">Action: {d.action_taken}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(d.created_at), "d MMM yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mb-3">No decisions recorded yet.</p>
            )}

            {!priority.resolved_flag && (
              <div className="space-y-2">
                <Textarea
                  placeholder="Decision summary..."
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="text-xs h-16"
                />
                <Input
                  placeholder="Action taken (optional)"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="text-xs h-8"
                />
                <Button
                  size="sm"
                  onClick={handleLog}
                  disabled={!summary.trim() || logDecision.isPending}
                  className="text-xs"
                >
                  Record Decision
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

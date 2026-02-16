/**
 * CrossTenantRiskRadar – SuperAdmin internal intelligence dashboard
 * Aggregates risk_events across all tenants. Never exposes cross-tenant data to clients.
 * Standards Reference: Standards for RTOs 2025 only.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useRBAC } from "@/hooks/useRBAC";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ShieldAlert, AlertTriangle, TrendingUp, TrendingDown, Minus, Radar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

type RiskEvent = {
  id: string;
  tenant_id: number;
  source_type: string;
  source_entity_id: string | null;
  standard_clause: string | null;
  risk_category: string | null;
  severity: string;
  theme_label: string | null;
  detected_at: string;
  status: string;
  notes: string | null;
};

const SEVERITY_COLORS: Record<string, string> = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

const SOURCE_LABELS: Record<string, string> = {
  public_snapshot: "Compliance Snapshot",
  tas_context: "TAS Context",
  audit_pack: "Audit Pack",
  evidence_gap: "Evidence Gap",
  regulator_watch: "Regulator Watch",
};

export default function CrossTenantRiskRadar() {
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open");

  // Fetch all risk events
  const { data: events, isLoading } = useQuery({
    queryKey: ["risk-events", severityFilter, sourceFilter, statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("risk_events")
        .select("*")
        .order("detected_at", { ascending: false })
        .limit(500);
      if (severityFilter !== "all") q = q.eq("severity", severityFilter);
      if (sourceFilter !== "all") q = q.eq("source_type", sourceFilter);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as RiskEvent[];
    },
    enabled: isSuperAdmin || isVivacityTeam,
  });

  // Fetch tenant names
  const tenantIds = [...new Set((events || []).map(e => e.tenant_id))];
  const { data: tenants } = useQuery({
    queryKey: ["risk-radar-tenants", tenantIds],
    queryFn: async () => {
      if (!tenantIds.length) return [];
      const { data } = await supabase.from("tenants").select("id, name").in("id", tenantIds);
      return data || [];
    },
    enabled: tenantIds.length > 0,
  });
  const tenantMap = new Map((tenants || []).map(t => [t.id, t.name]));

  // Executive summary metrics
  const metrics = useMemo(() => {
    const all = events || [];
    const open = all.filter(e => e.status === "open");
    const highOpen = open.filter(e => e.severity === "high");
    // Most common clauses
    const clauseCounts: Record<string, number> = {};
    const themeCounts: Record<string, number> = {};
    const tenantRiskCounts: Record<number, number> = {};
    for (const e of open) {
      if (e.standard_clause) clauseCounts[e.standard_clause] = (clauseCounts[e.standard_clause] || 0) + 1;
      if (e.theme_label) themeCounts[e.theme_label] = (themeCounts[e.theme_label] || 0) + 1;
      tenantRiskCounts[e.tenant_id] = (tenantRiskCounts[e.tenant_id] || 0) + 1;
    }
    const topClauses = Object.entries(clauseCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topThemes = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const tenantsOver5 = Object.values(tenantRiskCounts).filter(c => c >= 5).length;

    return { totalOpen: open.length, highOpen: highOpen.length, topClauses, topThemes, tenantsOver5 };
  }, [events]);

  // Clause heatmap from events
  const clauseHeatmap = useMemo(() => {
    const all = events || [];
    const map: Record<string, { total: number; high: number }> = {};
    for (const e of all) {
      const clause = e.standard_clause || "Unspecified";
      if (!map[clause]) map[clause] = { total: 0, high: 0 };
      map[clause].total++;
      if (e.severity === "high") map[clause].high++;
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total).slice(0, 15);
  }, [events]);

  // Tenant risk profile table
  const tenantProfiles = useMemo(() => {
    const all = (events || []).filter(e => e.status === "open");
    const map: Record<number, { total: number; high: number; clauses: Record<string, number>; lastDetected: string }> = {};
    for (const e of all) {
      if (!map[e.tenant_id]) map[e.tenant_id] = { total: 0, high: 0, clauses: {}, lastDetected: e.detected_at };
      map[e.tenant_id].total++;
      if (e.severity === "high") map[e.tenant_id].high++;
      const c = e.standard_clause || "N/A";
      map[e.tenant_id].clauses[c] = (map[e.tenant_id].clauses[c] || 0) + 1;
      if (e.detected_at > map[e.tenant_id].lastDetected) map[e.tenant_id].lastDetected = e.detected_at;
    }
    return Object.entries(map)
      .map(([tid, d]) => {
        const topClause = Object.entries(d.clauses).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
        return { tenant_id: Number(tid), ...d, topClause };
      })
      .sort((a, b) => b.high - a.high || b.total - a.total);
  }, [events]);

  // Status update mutation
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("risk_events").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["risk-events"] });
      toast({ title: "Risk status updated" });
    },
  });

  if (!isSuperAdmin && !isVivacityTeam) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Access Restricted</h2>
          <p className="text-sm text-muted-foreground">Cross-Tenant Risk Radar is internal only.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 max-w-screen-2xl mx-auto">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Radar className="h-5 w-5 text-primary" />
            Cross-Tenant Risk Radar
          </h1>
          <p className="text-xs text-muted-foreground">Aggregated risk intelligence — Standards for RTOs 2025</p>
        </div>

        {/* Executive Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{metrics.totalOpen}</p>
            <p className="text-xs text-muted-foreground">Open Risks</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{metrics.highOpen}</p>
            <p className="text-xs text-muted-foreground">High Severity</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{metrics.topClauses[0]?.[0] || "—"}</p>
            <p className="text-xs text-muted-foreground">Top Clause</p>
          </CardContent></Card>
          <Card><CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{metrics.tenantsOver5}</p>
            <p className="text-xs text-muted-foreground">Tenants 5+ Risks</p>
          </CardContent></Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severity</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="public_snapshot">Compliance Snapshot</SelectItem>
              <SelectItem value="tas_context">TAS Context</SelectItem>
              <SelectItem value="audit_pack">Audit Pack</SelectItem>
              <SelectItem value="evidence_gap">Evidence Gap</SelectItem>
              <SelectItem value="regulator_watch">Regulator Watch</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="monitoring">Monitoring</SelectItem>
              <SelectItem value="addressed">Addressed</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Clause Heatmap */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Standard Clause Heatmap</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Clause</TableHead>
                    <TableHead className="text-xs text-right">Count</TableHead>
                    <TableHead className="text-xs text-right">High</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clauseHeatmap.map(([clause, d]) => (
                    <TableRow key={clause}>
                      <TableCell className="text-xs font-medium">{clause}</TableCell>
                      <TableCell className="text-xs text-right">{d.total}</TableCell>
                      <TableCell className="text-xs text-right">
                        {d.high > 0 && <Badge variant="destructive" className="text-[10px]">{d.high}</Badge>}
                        {d.high === 0 && "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {clauseHeatmap.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">No data</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Theme Frequency Panel */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Theme Frequency</CardTitle></CardHeader>
            <CardContent>
              {metrics.topThemes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No themes detected</p>
              ) : (
                <div className="space-y-3">
                  {metrics.topThemes.map(([theme, count]) => (
                    <div key={theme} className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate max-w-[240px]">{theme}</span>
                      <Badge variant="secondary" className="text-[10px]">{count} occurrences</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tenant Risk Profile Table */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tenant Risk Profiles</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Tenant</TableHead>
                  <TableHead className="text-xs text-right">Open Risks</TableHead>
                  <TableHead className="text-xs text-right">High</TableHead>
                  <TableHead className="text-xs">Top Clause</TableHead>
                  <TableHead className="text-xs">Last Detected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenantProfiles.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">No tenant risks</TableCell></TableRow>
                ) : (
                  tenantProfiles.map(tp => (
                    <TableRow key={tp.tenant_id}>
                      <TableCell className="text-xs font-medium">{tenantMap.get(tp.tenant_id) || `#${tp.tenant_id}`}</TableCell>
                      <TableCell className="text-xs text-right">{tp.total}</TableCell>
                      <TableCell className="text-xs text-right">
                        {tp.high > 0 ? <Badge variant="destructive" className="text-[10px]">{tp.high}</Badge> : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{tp.topClause}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(tp.lastDetected), { addSuffix: true })}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Full Event List */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">All Risk Events</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Tenant</TableHead>
                    <TableHead className="text-xs">Source</TableHead>
                    <TableHead className="text-xs">Clause</TableHead>
                    <TableHead className="text-xs">Theme</TableHead>
                    <TableHead className="text-xs">Severity</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Detected</TableHead>
                    <TableHead className="text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(events || []).length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-xs text-muted-foreground">No risk events</TableCell></TableRow>
                  ) : (
                    (events || []).map(e => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{tenantMap.get(e.tenant_id) || `#${e.tenant_id}`}</TableCell>
                        <TableCell className="text-xs">{SOURCE_LABELS[e.source_type] || e.source_type}</TableCell>
                        <TableCell className="text-xs font-mono">{e.standard_clause || "—"}</TableCell>
                        <TableCell className="text-xs truncate max-w-[160px]">{e.theme_label || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={SEVERITY_COLORS[e.severity] as any || "outline"} className="text-[10px]">{e.severity}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(e.detected_at), { addSuffix: true })}</TableCell>
                        <TableCell>
                          {e.status === "open" && (
                            <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2"
                              onClick={() => updateStatus.mutate({ id: e.id, status: "monitoring" })}>
                              Monitor
                            </Button>
                          )}
                          {e.status === "monitoring" && (
                            <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2"
                              onClick={() => updateStatus.mutate({ id: e.id, status: "addressed" })}>
                              Address
                            </Button>
                          )}
                          {(e.status === "addressed" || e.status === "monitoring") && (
                            <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2"
                              onClick={() => updateStatus.mutate({ id: e.id, status: "closed" })}>
                              Close
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

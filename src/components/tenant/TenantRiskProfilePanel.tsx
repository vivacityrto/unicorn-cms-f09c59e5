/**
 * TenantRiskProfilePanel – Tenant-level risk view
 * Shows open risks by clause, source type, age of oldest risk, and allows status updates.
 * For mounting on Tenant Overview pages.
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Radar, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface Props {
  tenantId: number;
}

const SOURCE_LABELS: Record<string, string> = {
  public_snapshot: "Compliance Snapshot",
  tas_context: "TAS Context",
  audit_pack: "Audit Pack",
  evidence_gap: "Evidence Gap",
  regulator_watch: "Regulator Watch",
};

export function TenantRiskProfilePanel({ tenantId }: Props) {
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useQuery({
    queryKey: ["tenant-risk-events", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("risk_events")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("detected_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    enabled: !!tenantId,
  });

  const openEvents = useMemo(() => (events || []).filter(e => e.status === "open"), [events]);

  const metrics = useMemo(() => {
    const byClauses: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let oldest: string | null = null;
    for (const e of openEvents) {
      if (e.standard_clause) byClauses[e.standard_clause] = (byClauses[e.standard_clause] || 0) + 1;
      bySource[e.source_type] = (bySource[e.source_type] || 0) + 1;
      if (!oldest || e.detected_at < oldest) oldest = e.detected_at;
    }
    return {
      byClauses: Object.entries(byClauses).sort((a, b) => b[1] - a[1]),
      bySource: Object.entries(bySource).sort((a, b) => b[1] - a[1]),
      oldest,
      total: openEvents.length,
    };
  }, [openEvents]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("risk_events").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-risk-events", tenantId] });
      toast({ title: "Risk status updated" });
    },
  });

  return (
    <Collapsible defaultOpen={openEvents.length > 0}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Radar className="h-4 w-4 text-primary" />
              Risk Profile
              {metrics.total > 0 && <Badge variant="secondary" className="text-[10px] ml-2">{metrics.total} open</Badge>}
              <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground" />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : metrics.total === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No open risks detected.</p>
            ) : (
              <>
                {/* Summary row */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-lg font-bold text-foreground">{metrics.total}</p>
                    <p className="text-[10px] text-muted-foreground">Open Risks</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">{metrics.byClauses[0]?.[0] || "—"}</p>
                    <p className="text-[10px] text-muted-foreground">Top Clause</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-foreground">
                      {metrics.oldest ? formatDistanceToNow(new Date(metrics.oldest)) : "—"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Oldest Risk</p>
                  </div>
                </div>

                {/* By source */}
                <div className="flex flex-wrap gap-2">
                  {metrics.bySource.map(([src, count]) => (
                    <Badge key={src} variant="outline" className="text-[10px]">
                      {SOURCE_LABELS[src] || src}: {count}
                    </Badge>
                  ))}
                </div>

                {/* Recent open events */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Clause</TableHead>
                      <TableHead className="text-xs">Theme</TableHead>
                      <TableHead className="text-xs">Severity</TableHead>
                      <TableHead className="text-xs">Detected</TableHead>
                      <TableHead className="text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openEvents.slice(0, 10).map(e => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs font-mono">{e.standard_clause || "—"}</TableCell>
                        <TableCell className="text-xs truncate max-w-[140px]">{e.theme_label || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={e.severity === "high" ? "destructive" : e.severity === "medium" ? "secondary" : "outline"} className="text-[10px]">
                            {e.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(e.detected_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="flex gap-1">
                          <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2"
                            onClick={() => updateStatus.mutate({ id: e.id, status: "monitoring" })}>
                            Monitor
                          </Button>
                          <Button size="sm" variant="ghost" className="text-[10px] h-6 px-2"
                            onClick={() => updateStatus.mutate({ id: e.id, status: "closed" })}>
                            Close
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

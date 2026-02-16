/**
 * PublicComplianceSnapshotPanel – Phase 2
 * 
 * Collapsible panel on Tenant Overview showing the latest Public Compliance Snapshot.
 * Includes: Generate button, risk summary, View Full Report, Create Task from Risk.
 * Only approved findings show in tenant view. Draft shows "Pending Review" badge.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRBAC } from "@/hooks/useRBAC";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  Shield, ChevronDown, ChevronRight, Loader2, ExternalLink,
  AlertTriangle, Clock, CheckCircle2, FileText, Plus,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-500/10 text-red-600 border-red-600",
  medium: "bg-amber-500/10 text-amber-600 border-amber-600",
  low: "bg-blue-500/10 text-blue-600 border-blue-600",
};

interface PublicComplianceSnapshotPanelProps {
  tenantId: number;
  tenantName: string;
  website?: string;
  rtoCode?: string;
}

export function PublicComplianceSnapshotPanel({
  tenantId, tenantName, website, rtoCode,
}: PublicComplianceSnapshotPanelProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, user } = useAuth();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const [isOpen, setIsOpen] = useState(false);

  // Only show to VivacityTeam / SuperAdmin
  if (!isSuperAdmin && !isVivacityTeam) return null;

  // Fetch latest snapshot job for this tenant
  const { data: latestJob, isLoading: jobLoading } = useQuery({
    queryKey: ["compliance-snapshot-latest", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_jobs")
        .select(`
          id, status, created_at, completed_at, standards_version,
          research_findings(id, summary_md, citations_json, risk_flags_json, review_status, reviewed_at)
        `)
        .eq("tenant_id", tenantId)
        .eq("job_type", "public_compliance_snapshot")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!website) throw new Error("No website configured for this tenant");

      const { data, error } = await supabase.functions.invoke("research-public-snapshot", {
        body: { tenant_id: tenantId, website, rto_code: rtoCode, tenant_name: tenantName },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail || "Snapshot generation failed");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Snapshot generated", description: "Review the findings below." });
      queryClient.invalidateQueries({ queryKey: ["compliance-snapshot-latest", tenantId] });
    },
    onError: (err) => {
      toast({ title: "Generation failed", description: String(err), variant: "destructive" });
    },
  });

  const finding = (latestJob as any)?.research_findings?.[0];
  const riskFlags = (finding?.risk_flags_json as any[]) || [];
  const highRisks = riskFlags.filter((f: any) => f.severity === "high").length;
  const medRisks = riskFlags.filter((f: any) => f.severity === "medium").length;
  const lowRisks = riskFlags.filter((f: any) => f.severity === "low").length;
  const isPending = finding?.review_status === "draft";
  const isApproved = finding?.review_status === "approved";

  const handleCreateTask = (flag: any) => {
    // Navigate to tasks with pre-filled context
    toast({
      title: "Task creation",
      description: `Creating CSC task for: ${flag.risk_category} – ${flag.standard_clause}`,
    });
    // TODO: Integrate with task creation API
  };

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Public Compliance Snapshot
                {isPending && (
                  <Badge variant="secondary" className="text-[10px] gap-0.5">
                    <Clock className="h-2.5 w-2.5" /> Pending Review
                  </Badge>
                )}
                {isApproved && (
                  <Badge variant="default" className="text-[10px] gap-0.5">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Approved
                  </Badge>
                )}
                {highRisks > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {highRisks} high risk{highRisks !== 1 ? "s" : ""}
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    generateMutation.mutate();
                  }}
                  disabled={generateMutation.isPending || !website}
                  className="h-7 text-xs gap-1"
                >
                  {generateMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Shield className="h-3 w-3" />
                  )}
                  {latestJob ? "Regenerate" : "Generate"} Snapshot
                </Button>
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {jobLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : !latestJob ? (
              <div className="text-center py-6">
                <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-xs text-muted-foreground">No snapshot generated yet</p>
                {!website && (
                  <p className="text-[10px] text-amber-600 mt-1">
                    <AlertTriangle className="h-3 w-3 inline mr-0.5" />
                    No website configured for this tenant
                  </p>
                )}
              </div>
            ) : (
              <>
                {/* Meta info */}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span>Generated: {format(new Date(latestJob.created_at), "dd MMM yyyy HH:mm")}</span>
                  <span>Standards: {(latestJob as any).standards_version}</span>
                  <span>{formatDistanceToNow(new Date(latestJob.created_at), { addSuffix: true })}</span>
                </div>

                {/* Risk summary */}
                {riskFlags.length > 0 && (
                  <div className="flex gap-2">
                    {highRisks > 0 && <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS.high}`}>{highRisks} High</Badge>}
                    {medRisks > 0 && <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS.medium}`}>{medRisks} Medium</Badge>}
                    {lowRisks > 0 && <Badge variant="outline" className={`text-[10px] ${SEVERITY_COLORS.low}`}>{lowRisks} Low</Badge>}
                  </div>
                )}

                {/* Risk flags list */}
                {riskFlags.length > 0 && (
                  <div className="space-y-1.5">
                    {riskFlags.slice(0, 5).map((flag: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded border text-xs">
                        <Badge variant="outline" className={`text-[9px] shrink-0 ${SEVERITY_COLORS[flag.severity] || ""}`}>
                          {flag.severity}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{flag.risk_category}</span>
                          {flag.standard_clause && (
                            <span className="text-muted-foreground ml-1">· {flag.standard_clause}</span>
                          )}
                          {flag.claim_excerpt && (
                            <p className="text-muted-foreground mt-0.5 italic line-clamp-1">"{flag.claim_excerpt}"</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCreateTask(flag)}
                          className="h-6 text-[10px] gap-0.5 shrink-0"
                          title="Create CSC Task from Risk"
                        >
                          <Plus className="h-3 w-3" /> Task
                        </Button>
                      </div>
                    ))}
                    {riskFlags.length > 5 && (
                      <p className="text-[10px] text-muted-foreground">
                        + {riskFlags.length - 5} more risk{riskFlags.length - 5 !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/admin/research-jobs/${latestJob.id}`)}
                    className="h-7 text-xs gap-1"
                  >
                    <FileText className="h-3 w-3" /> View Full Report
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

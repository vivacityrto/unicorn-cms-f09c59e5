/**
 * ResearchJobDetail – Detail view for a single research job.
 * Shows inputs, sources, findings, citations, risk flags.
 * Approve/Reject buttons for Vivacity Team.
 */
import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useRBAC } from "@/hooks/useRBAC";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, Loader2, ExternalLink, CheckCircle2, XCircle, Clock,
  AlertTriangle, Globe, FileText, Shield,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-red-500/10 text-red-600 border-red-600",
  medium: "bg-amber-500/10 text-amber-600 border-amber-600",
  low: "bg-blue-500/10 text-blue-600 border-blue-600",
};

export default function ResearchJobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isVivacityTeam } = useRBAC();
  const { user } = useAuth();
  const [reviewReason, setReviewReason] = useState("");

  const { data: job, isLoading } = useQuery({
    queryKey: ["research-job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_jobs")
        .select("*")
        .eq("id", jobId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!jobId,
  });

  const { data: sources } = useQuery({
    queryKey: ["research-sources", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_sources")
        .select("*")
        .eq("job_id", jobId!)
        .order("retrieved_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!jobId,
  });

  const { data: findings } = useQuery({
    queryKey: ["research-findings", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_findings")
        .select("*")
        .eq("job_id", jobId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!jobId,
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["research-audit-log", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_audit_log")
        .select("*")
        .eq("job_id", jobId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!jobId,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ findingId, status }: { findingId: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase
        .from("research_findings")
        .update({
          review_status: status,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          review_reason: reviewReason || null,
        })
        .eq("id", findingId);
      if (error) throw error;

      // Audit log
      await supabase.from("research_audit_log").insert({
        user_id: user?.id,
        job_id: jobId,
        action: status === "approved" ? "finding_approved" : "finding_rejected",
        details: { finding_id: findingId, reason: reviewReason || null },
      });
    },
    onSuccess: (_, { status }) => {
      toast({ title: `Finding ${status}` });
      setReviewReason("");
      queryClient.invalidateQueries({ queryKey: ["research-findings", jobId] });
      queryClient.invalidateQueries({ queryKey: ["research-audit-log", jobId] });
    },
    onError: (err) => {
      toast({ title: "Error", description: String(err), variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!job) {
    return (
      <DashboardLayout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Job not found</p>
          <Button variant="outline" onClick={() => navigate("/admin/research-jobs")} className="mt-4">
            Back to Research Jobs
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const inputJson = job.input_json as Record<string, any> || {};

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/research-jobs")} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground">Research Job Detail</h1>
            <p className="text-xs text-muted-foreground font-mono">{job.id}</p>
          </div>
          <Badge variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"}>
            {job.status}
          </Badge>
        </div>

        {/* Job Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Job Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Type</span>
              <p className="font-medium">{job.job_type}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Tenant</span>
              <p className="font-medium">{job.tenant_id || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Standards</span>
              <p className="font-medium">{(job as any).standards_version || "—"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Created</span>
              <p className="font-medium">{format(new Date(job.created_at), "dd MMM yyyy HH:mm")}</p>
            </div>
            {inputJson.website && (
              <div>
                <span className="text-muted-foreground">Website</span>
                <p className="font-medium">{inputJson.website}</p>
              </div>
            )}
            {inputJson.rto_code && (
              <div>
                <span className="text-muted-foreground">RTO Code</span>
                <p className="font-medium">{inputJson.rto_code}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sources */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Sources ({sources?.length || 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sources && sources.length > 0 ? (
              <div className="space-y-2">
                {sources.map(s => {
                  const isStale = Date.now() - new Date(s.retrieved_at).getTime() > 7 * 24 * 60 * 60 * 1000;
                  return (
                    <div key={s.id} className="flex items-start justify-between gap-2 p-2 rounded-md bg-muted/50 text-xs">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">{s.title || s.url}</span>
                          {isStale && (
                            <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-600 gap-0.5">
                              <AlertTriangle className="h-2.5 w-2.5" /> Stale
                            </Badge>
                          )}
                        </div>
                        <span className="text-muted-foreground">
                          Retrieved: {format(new Date(s.retrieved_at), "dd MMM yyyy HH:mm")}
                        </span>
                      </div>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary shrink-0">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">No sources scraped</p>
            )}
          </CardContent>
        </Card>

        {/* Findings */}
        {findings && findings.map(finding => {
          const riskFlags = (finding as any).risk_flags_json as any[] || [];
          const citations = finding.citations_json as any[] || [];

          return (
            <Card key={finding.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Finding
                  </CardTitle>
                  <Badge
                    variant={
                      finding.review_status === "approved" ? "default" :
                      finding.review_status === "rejected" ? "destructive" : "secondary"
                    }
                  >
                    {finding.review_status === "draft" && <Clock className="h-3 w-3 mr-1" />}
                    {finding.review_status === "approved" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                    {finding.review_status === "rejected" && <XCircle className="h-3 w-3 mr-1" />}
                    {finding.review_status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Markdown Preview */}
                <ScrollArea className="max-h-[500px]">
                  <div className="text-xs prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
                    {finding.summary_md}
                  </div>
                </ScrollArea>

                {/* Risk Flags */}
                {riskFlags.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                        <Shield className="h-3.5 w-3.5" />
                        Risk Flags ({riskFlags.length})
                      </h4>
                      <div className="space-y-1.5">
                        {riskFlags.map((flag: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 p-2 rounded border text-xs">
                            <Badge
                              variant="outline"
                              className={`text-[9px] shrink-0 ${SEVERITY_COLORS[flag.severity] || ""}`}
                            >
                              {flag.severity}
                            </Badge>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{flag.risk_category}</span>
                              {flag.standard_clause && (
                                <span className="text-muted-foreground ml-1">· {flag.standard_clause}</span>
                              )}
                              {flag.claim_excerpt && (
                                <p className="text-muted-foreground mt-0.5 italic">"{flag.claim_excerpt}"</p>
                              )}
                            </div>
                            {flag.source_url && (
                              <a href={flag.source_url} target="_blank" rel="noopener noreferrer" className="text-primary shrink-0">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Citations */}
                {citations.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-xs font-semibold mb-1">Citations ({citations.length})</h4>
                      <div className="space-y-0.5">
                        {citations.map((c: any) => (
                          <a
                            key={c.index || c.url}
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-[10px] text-primary hover:underline truncate"
                          >
                            [{c.index}] {c.url}
                            {c.retrieved_at && (
                              <span className="text-muted-foreground ml-1">
                                ({formatDistanceToNow(new Date(c.retrieved_at), { addSuffix: true })})
                              </span>
                            )}
                          </a>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Approve / Reject */}
                {isVivacityTeam && finding.review_status === "draft" && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Review note (optional)..."
                        value={reviewReason}
                        onChange={e => setReviewReason(e.target.value)}
                        className="text-xs h-16"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => reviewMutation.mutate({ findingId: finding.id, status: "approved" })}
                          disabled={reviewMutation.isPending}
                          className="gap-1 text-xs"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => reviewMutation.mutate({ findingId: finding.id, status: "rejected" })}
                          disabled={reviewMutation.isPending}
                          className="gap-1 text-xs"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Audit Log */}
        {auditLogs && auditLogs.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Audit Trail</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {auditLogs.map(log => (
                  <div key={log.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono text-[10px]">
                      {format(new Date(log.created_at), "dd MMM HH:mm:ss")}
                    </span>
                    <Badge variant="outline" className="text-[9px]">{log.action}</Badge>
                    <span className="truncate">{log.user_id.slice(0, 8)}…</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

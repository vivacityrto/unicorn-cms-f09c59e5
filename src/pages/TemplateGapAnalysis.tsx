/**
 * TemplateGapAnalysis – Phase 8
 * Internal page to run and review AI gap analyses on master templates.
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FileSearch, ShieldAlert, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "@/hooks/use-toast";

type ClauseMapping = {
  id: string;
  standard_clause: string;
  coverage_status: string;
  confidence_level: string;
  supporting_excerpt: string | null;
  improvement_note: string | null;
};

type GapSummary = {
  id: string;
  total_clauses_checked: number;
  explicit_count: number;
  weak_count: number;
  missing_count: number;
  high_risk_gaps_count: number;
  summary_markdown: string;
};

type AnalysisJob = {
  id: string;
  template_id: string | null;
  research_job_id: string | null;
  standards_version: string;
  generated_at: string;
  status: string;
  reviewed_at: string | null;
};

const COVERAGE_ICONS: Record<string, React.ReactNode> = {
  explicit: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,
  implicit: <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" />,
  weak: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
  missing: <XCircle className="h-3.5 w-3.5 text-destructive" />,
};

const COVERAGE_VARIANTS: Record<string, string> = {
  explicit: "outline",
  implicit: "secondary",
  weak: "secondary",
  missing: "destructive",
};

export default function TemplateGapAnalysis() {
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const queryClient = useQueryClient();
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [coverageFilter, setCoverageFilter] = useState("all");
  const [showRunModal, setShowRunModal] = useState(false);
  const [runForm, setRunForm] = useState({ templateName: "", templateCategory: "", templateContent: "" });
  const [isRunning, setIsRunning] = useState(false);

  // Fetch all analysis jobs
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ["template-analysis-jobs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_analysis_jobs")
        .select("*")
        .order("generated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as AnalysisJob[];
    },
    enabled: isSuperAdmin || isVivacityTeam,
  });

  const activeJobId = selectedJobId || jobs?.[0]?.id || null;

  // Fetch clause mappings for selected job
  const { data: clauses, isLoading: clausesLoading } = useQuery({
    queryKey: ["template-clause-mappings", activeJobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_clause_mappings")
        .select("*")
        .eq("template_analysis_job_id", activeJobId!)
        .order("standard_clause");
      if (error) throw error;
      return (data || []) as ClauseMapping[];
    },
    enabled: !!activeJobId,
  });

  // Fetch gap summary
  const { data: summary } = useQuery({
    queryKey: ["template-gap-summary", activeJobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_gap_summary")
        .select("*")
        .eq("template_analysis_job_id", activeJobId!)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data as GapSummary | null;
    },
    enabled: !!activeJobId,
  });

  const filteredClauses = useMemo(() => {
    if (!clauses) return [];
    if (coverageFilter === "all") return clauses;
    return clauses.filter(c => c.coverage_status === coverageFilter);
  }, [clauses, coverageFilter]);

  // Run analysis
  const runAnalysis = async () => {
    if (!runForm.templateContent.trim()) {
      toast({ title: "Template content required", variant: "destructive" });
      return;
    }
    setIsRunning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/research-template-gap-analysis`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            template_content: runForm.templateContent,
            template_name: runForm.templateName,
            template_category: runForm.templateCategory,
            tenant_id: 1, // Vivacity internal tenant
          }),
        }
      );
      const result = await resp.json();
      if (result.error) throw new Error(result.error);
      toast({ title: "Gap analysis complete", description: `${result.summary?.total_clauses || 0} clauses analysed.` });
      setShowRunModal(false);
      setRunForm({ templateName: "", templateCategory: "", templateContent: "" });
      queryClient.invalidateQueries({ queryKey: ["template-analysis-jobs"] });
      if (result.analysis_job_id) setSelectedJobId(result.analysis_job_id);
    } catch (e: any) {
      toast({ title: "Analysis failed", description: e.message, variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  // Approval workflow
  const updateJobStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: any = { status };
      if (status === "reviewed" || status === "approved") {
        const { data: { user } } = await supabase.auth.getUser();
        updates.reviewed_by_user_id = user?.id;
        updates.reviewed_at = new Date().toISOString();
      }
      const { error } = await supabase.from("template_analysis_jobs").update(updates).eq("id", id);
      if (error) throw error;
      // Audit log
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("audit_events").insert({
        entity: "template_analysis_job",
        entity_id: id,
        action: `analysis_${status}`,
        user_id: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["template-analysis-jobs"] });
      toast({ title: "Status updated" });
    },
  });

  if (!isSuperAdmin && !isVivacityTeam) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Access Restricted</h2>
          <p className="text-sm text-muted-foreground">Template Gap Analysis is internal only.</p>
        </div>
      </DashboardLayout>
    );
  }

  const activeJob = jobs?.find(j => j.id === activeJobId);

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 max-w-screen-2xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FileSearch className="h-5 w-5 text-primary" />
              Template Gap Analysis
            </h1>
            <p className="text-xs text-muted-foreground">AI clause mapping — Standards for RTOs 2025</p>
          </div>
          <Dialog open={showRunModal} onOpenChange={setShowRunModal}>
            <DialogTrigger asChild>
              <Button size="sm">Run AI Gap Analysis</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Run Template Gap Analysis</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Template Name</Label>
                    <Input
                      value={runForm.templateName}
                      onChange={e => setRunForm(f => ({ ...f, templateName: e.target.value }))}
                      placeholder="e.g. Assessment Validation Policy"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Select value={runForm.templateCategory} onValueChange={v => setRunForm(f => ({ ...f, templateCategory: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="policy">Policy</SelectItem>
                        <SelectItem value="procedure">Procedure</SelectItem>
                        <SelectItem value="form">Form</SelectItem>
                        <SelectItem value="guide">Guide</SelectItem>
                        <SelectItem value="checklist">Checklist</SelectItem>
                        <SelectItem value="assessment">Assessment Tool</SelectItem>
                        <SelectItem value="tas">TAS Document</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Template Content (paste full text)</Label>
                  <Textarea
                    value={runForm.templateContent}
                    onChange={e => setRunForm(f => ({ ...f, templateContent: e.target.value }))}
                    placeholder="Paste the full template text here..."
                    className="min-h-[200px] text-xs"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  This analysis identifies potential clause coverage gaps only and does not determine compliance.
                </p>
                <Button onClick={runAnalysis} disabled={isRunning} className="w-full">
                  {isRunning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analysing...</> : "Start Analysis"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Job selector */}
        {jobs && jobs.length > 0 && (
          <div className="flex items-center gap-3">
            <Select value={activeJobId || ""} onValueChange={setSelectedJobId}>
              <SelectTrigger className="w-80 h-8 text-xs"><SelectValue placeholder="Select analysis" /></SelectTrigger>
              <SelectContent>
                {jobs.map(j => (
                  <SelectItem key={j.id} value={j.id}>
                    {formatDistanceToNow(new Date(j.generated_at), { addSuffix: true })} — {j.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeJob && (
              <div className="flex gap-2">
                <Badge variant={activeJob.status === "approved" ? "default" : activeJob.status === "reviewed" ? "secondary" : "outline"} className="text-[10px]">
                  {activeJob.status}
                </Badge>
                {activeJob.status === "draft" && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                    onClick={() => updateJobStatus.mutate({ id: activeJob.id, status: "reviewed" })}>
                    Mark Reviewed
                  </Button>
                )}
                {activeJob.status === "reviewed" && (
                  <Button size="sm" variant="default" className="h-6 text-[10px] px-2"
                    onClick={() => updateJobStatus.mutate({ id: activeJob.id, status: "approved" })}>
                    Approve Analysis
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{summary.total_clauses_checked}</p>
              <p className="text-xs text-muted-foreground">Clauses Checked</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{summary.explicit_count}</p>
              <p className="text-xs text-muted-foreground">Explicit</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-500">{summary.weak_count}</p>
              <p className="text-xs text-muted-foreground">Weak</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-destructive">{summary.missing_count}</p>
              <p className="text-xs text-muted-foreground">Missing</p>
            </CardContent></Card>
            <Card><CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-destructive">{summary.high_risk_gaps_count}</p>
              <p className="text-xs text-muted-foreground">High Risk Gaps</p>
            </CardContent></Card>
          </div>
        )}

        {summary?.summary_markdown && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Executive Summary</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{summary.summary_markdown}</p>
            </CardContent>
          </Card>
        )}

        {/* Clause Coverage Table */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Clause Coverage</CardTitle>
              <Select value={coverageFilter} onValueChange={setCoverageFilter}>
                <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clauses</SelectItem>
                  <SelectItem value="missing">Missing Only</SelectItem>
                  <SelectItem value="weak">Weak Only</SelectItem>
                  <SelectItem value="explicit">Explicit Only</SelectItem>
                  <SelectItem value="implicit">Implicit Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {clausesLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-20">Clause</TableHead>
                    <TableHead className="text-xs w-24">Coverage</TableHead>
                    <TableHead className="text-xs w-24">Confidence</TableHead>
                    <TableHead className="text-xs">Supporting Excerpt</TableHead>
                    <TableHead className="text-xs">Improvement Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClauses.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-xs text-muted-foreground">
                      {activeJobId ? "No clause mappings found" : "Select or run an analysis"}
                    </TableCell></TableRow>
                  ) : (
                    filteredClauses.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs font-mono font-medium">{c.standard_clause}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {COVERAGE_ICONS[c.coverage_status]}
                            <Badge variant={COVERAGE_VARIANTS[c.coverage_status] as any || "outline"} className="text-[10px]">
                              {c.coverage_status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{c.confidence_level}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[240px] truncate">
                          {c.supporting_excerpt || "—"}
                        </TableCell>
                        <TableCell className="text-xs max-w-[240px]">
                          {c.improvement_note || "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <p className="text-[10px] text-muted-foreground text-center italic">
          This analysis identifies potential clause coverage gaps only and does not determine compliance. Standards for RTOs 2025.
        </p>
      </div>
    </DashboardLayout>
  );
}

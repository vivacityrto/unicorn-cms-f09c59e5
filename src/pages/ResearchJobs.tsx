/**
 * ResearchJobs – SuperAdmin page listing all research jobs.
 * Columns: Job Type, Tenant, Created By, Status, Created At, Standards Version
 * Click navigates to job detail.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useRBAC } from "@/hooks/useRBAC";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, FlaskConical, ShieldAlert } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const JOB_TYPE_LABELS: Record<string, string> = {
  public_compliance_snapshot: "Public Compliance Snapshot",
  ask_viv_webbacked: "Ask Viv (Web)",
  regulator_watch: "Regulator Watch",
  tenant_onboarding: "Tenant Enrichment",
  template_review: "Template Review",
  tas_context_assistant: "TAS Context Assistant",
  audit_intelligence_pack: "Audit Intelligence Pack",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "outline",
  running: "secondary",
  completed: "default",
  failed: "destructive",
};

export default function ResearchJobs() {
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["research-jobs", typeFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("research_jobs")
        .select(`
          id, job_type, tenant_id, status, created_by, created_at, completed_at, standards_version, input_json,
          research_findings(id, review_status, risk_flags_json)
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (typeFilter !== "all") query = query.eq("job_type", typeFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: isSuperAdmin || isVivacityTeam,
  });

  // Fetch user names for created_by
  const creatorIds = [...new Set((jobs || []).map(j => j.created_by))];
  const { data: creators } = useQuery({
    queryKey: ["research-job-creators", creatorIds],
    queryFn: async () => {
      if (creatorIds.length === 0) return [];
      const { data } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name")
        .in("user_uuid", creatorIds);
      return data || [];
    },
    enabled: creatorIds.length > 0,
  });

  // Fetch tenant names
  const tenantIds = [...new Set((jobs || []).map(j => j.tenant_id).filter(Boolean))];
  const { data: tenants } = useQuery({
    queryKey: ["research-job-tenants", tenantIds],
    queryFn: async () => {
      if (tenantIds.length === 0) return [];
      const { data } = await supabase
        .from("tenants")
        .select("id, name")
        .in("id", tenantIds as number[]);
      return data || [];
    },
    enabled: tenantIds.length > 0,
  });

  const creatorMap = new Map((creators || []).map(c => [c.user_uuid, `${c.first_name || ""} ${c.last_name || ""}`.trim()]));
  const tenantMap = new Map((tenants || []).map(t => [t.id, t.name]));

  const filteredJobs = (jobs || []).filter(j => {
    if (!search) return true;
    const s = search.toLowerCase();
    const tenantName = (j.tenant_id ? tenantMap.get(j.tenant_id) : "") || "";
    return (
      j.job_type.toLowerCase().includes(s) ||
      tenantName.toLowerCase().includes(s) ||
      j.status.toLowerCase().includes(s)
    );
  });

  if (!isSuperAdmin && !isVivacityTeam) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Access Restricted</h2>
          <p className="text-sm text-muted-foreground">Research Jobs is available to Vivacity Team only.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 max-w-screen-xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              Research Jobs
            </h1>
            <p className="text-xs text-muted-foreground">AI research pipeline — all jobs</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search jobs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-48 h-8 text-xs">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="public_compliance_snapshot">Public Compliance Snapshot</SelectItem>
              <SelectItem value="ask_viv_webbacked">Ask Viv (Web)</SelectItem>
              <SelectItem value="regulator_watch">Regulator Watch</SelectItem>
              <SelectItem value="tenant_onboarding">Tenant Enrichment</SelectItem>
              <SelectItem value="tas_context_assistant">TAS Context Assistant</SelectItem>
              <SelectItem value="audit_intelligence_pack">Audit Intelligence Pack</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Job Type</TableHead>
                    <TableHead className="text-xs">Tenant</TableHead>
                    <TableHead className="text-xs">Created By</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Review</TableHead>
                    <TableHead className="text-xs">Created</TableHead>
                    <TableHead className="text-xs">Standards</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                        No research jobs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredJobs.map(job => {
                      const findings = (job as any).research_findings || [];
                      const reviewStatus = findings[0]?.review_status;
                      const riskFlags = findings[0]?.risk_flags_json as any[] || [];
                      const highRisks = riskFlags.filter((f: any) => f.severity === "high").length;

                      return (
                        <TableRow
                          key={job.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/admin/research-jobs/${job.id}`)}
                        >
                          <TableCell className="text-xs font-medium">
                            {JOB_TYPE_LABELS[job.job_type] || job.job_type}
                          </TableCell>
                          <TableCell className="text-xs">
                            {job.tenant_id ? tenantMap.get(job.tenant_id) || `#${job.tenant_id}` : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {creatorMap.get(job.created_by) || "Unknown"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={STATUS_VARIANT[job.status] || "outline"} className="text-[10px]">
                              {job.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {reviewStatus ? (
                              <Badge
                                variant={reviewStatus === "approved" ? "default" : reviewStatus === "rejected" ? "destructive" : "secondary"}
                                className="text-[10px]"
                              >
                                {reviewStatus}
                                {highRisks > 0 && ` · ${highRisks} high`}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {format(new Date(job.created_at), "dd MMM yyyy HH:mm")}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {(job as any).standards_version || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })
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

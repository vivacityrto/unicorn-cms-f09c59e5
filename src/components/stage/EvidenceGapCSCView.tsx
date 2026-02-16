/**
 * EvidenceGapCSCView – Phase 6 (Internal CSC View)
 *
 * Internal view for CSCs to review evidence gap checks, approve, and create tasks.
 */
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRBAC } from "@/hooks/useRBAC";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import {
  ClipboardCheck, CheckCircle2, Plus, RefreshCw, Loader2, Clock,
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";

interface EvidenceGapCSCViewProps {
  tenantId: number;
  stageInstanceId: number;
  stageType?: string;
}

export function EvidenceGapCSCView({ tenantId, stageInstanceId, stageType }: EvidenceGapCSCViewProps) {
  const queryClient = useQueryClient();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const { session } = useAuth();

  if (!isSuperAdmin && !isVivacityTeam) return null;

  const { data: latestCheck, isLoading } = useQuery({
    queryKey: ["evidence-gap-check", tenantId, stageInstanceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence_gap_checks")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("stage_instance_id", stageInstanceId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const rerunMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("research-evidence-gap-check", {
        body: { tenant_id: tenantId, stage_instance_id: stageInstanceId, stage_type: stageType },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.detail || "Check failed");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Evidence gap check re-run complete" });
      queryClient.invalidateQueries({ queryKey: ["evidence-gap-check", tenantId, stageInstanceId] });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (newStatus: "reviewed" | "approved") => {
      if (!latestCheck) return;
      const { error } = await supabase
        .from("evidence_gap_checks")
        .update({
          status: newStatus,
          reviewed_by_user_id: (await supabase.auth.getUser()).data.user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", latestCheck.id);
      if (error) throw error;

      await supabase.from("research_audit_log").insert({
        user_id: (await supabase.auth.getUser()).data.user?.id,
        job_id: latestCheck.research_job_id,
        action: newStatus === "approved" ? "gap_check_approved" : "gap_check_reviewed",
        details: { gap_check_id: latestCheck.id },
      });
    },
    onSuccess: (_, newStatus) => {
      toast({ title: `Gap check ${newStatus}` });
      queryClient.invalidateQueries({ queryKey: ["evidence-gap-check", tenantId, stageInstanceId] });
    },
  });

  const taskMutation = useMutation({
    mutationFn: async () => {
      if (!latestCheck) return;
      const missing = (latestCheck.missing_categories_json as any[]) || [];
      const mandatoryMissing = missing.filter((m: any) => m.mandatory);

      for (const cat of mandatoryMissing) {
        await supabase.from("research_audit_log").insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          job_id: latestCheck.research_job_id,
          action: "task_generated",
          details: {
            gap_check_id: latestCheck.id,
            task_title: `Upload Evidence – ${cat.category_name}`,
            standard_clause: cat.related_standard_clause,
          },
        });
      }
      return mandatoryMissing.length;
    },
    onSuccess: (count) => {
      toast({ title: "Evidence tasks created", description: `${count} tasks logged.` });
    },
  });

  if (isLoading || !latestCheck) return null;

  const missing = (latestCheck.missing_categories_json as any[]) || [];
  const detected = (latestCheck.detected_categories_json as any[]) || [];
  const required = (latestCheck.required_categories_json as any[]) || [];
  const mandatoryMissing = missing.filter((m: any) => m.mandatory);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Evidence Gap Check (CSC)
            <Badge
              variant={latestCheck.status === "approved" ? "default" : latestCheck.status === "reviewed" ? "info" : "secondary"}
              className="text-[10px]"
            >
              {latestCheck.status}
            </Badge>
          </CardTitle>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => rerunMutation.mutate()} disabled={rerunMutation.isPending} className="h-7 text-xs gap-1">
              {rerunMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Re-run
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-[10px] text-muted-foreground flex gap-3">
          <span>Generated: {format(new Date(latestCheck.generated_at), "dd MMM yyyy HH:mm")}</span>
          <span>Required: {required.length} | Detected: {detected.length} | Missing: {missing.length}</span>
        </div>

        {mandatoryMissing.length > 0 && (
          <div className="text-xs text-destructive font-medium">
            {mandatoryMissing.length} mandatory gap{mandatoryMissing.length !== 1 ? "s" : ""} identified
          </div>
        )}

        <Separator />

        <div className="flex flex-wrap gap-2">
          {latestCheck.status === "draft" && (
            <Button variant="outline" size="sm" onClick={() => reviewMutation.mutate("reviewed")} disabled={reviewMutation.isPending} className="h-7 text-xs">
              Mark Reviewed
            </Button>
          )}
          {(latestCheck.status === "draft" || latestCheck.status === "reviewed") && (
            <Button variant="default" size="sm" onClick={() => reviewMutation.mutate("approved")} disabled={reviewMutation.isPending} className="h-7 text-xs gap-1">
              <CheckCircle2 className="h-3 w-3" /> Approve
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => taskMutation.mutate()} disabled={taskMutation.isPending || mandatoryMissing.length === 0} className="h-7 text-xs gap-1">
            <Plus className="h-3 w-3" /> Create Evidence Tasks
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

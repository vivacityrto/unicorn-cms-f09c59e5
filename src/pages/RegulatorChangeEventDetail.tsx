/**
 * RegulatorChangeEventDetail – Detail view for a single regulator change event.
 * Shows before/after summary, impact, affected areas, citations, and review controls.
 */
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useRBAC } from "@/hooks/useRBAC";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowLeft, ExternalLink, AlertTriangle, CheckCircle2, ClipboardList, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";

const IMPACT_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  moderate: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export default function RegulatorChangeEventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isSuperAdmin, isVivacityTeam } = useRBAC();
  const { session } = useAuth();

  const { data: event, isLoading } = useQuery({
    queryKey: ["regulator-change-event", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulator_change_events")
        .select(`*, regulator_watchlist(name, url, category)`)
        .eq("id", eventId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  // Fetch linked research job findings
  const { data: findings } = useQuery({
    queryKey: ["change-event-findings", event?.research_job_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_findings")
        .select("*")
        .eq("job_id", event!.research_job_id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!event?.research_job_id,
  });

  // Fetch sources
  const { data: sources } = useQuery({
    queryKey: ["change-event-sources", event?.research_job_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_sources")
        .select("*")
        .eq("job_id", event!.research_job_id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!event?.research_job_id,
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase
        .from("regulator_change_events")
        .update({
          review_status: status,
          reviewed_by_user_id: session?.user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", eventId!);
      if (error) throw error;

      await supabase.from("research_audit_log").insert({
        user_id: session?.user?.id,
        action: status === "reviewed" ? "change_reviewed" : "change_actioned",
        details: { entity_type: "regulator_change_event", entity_id: eventId, new_status: status },
      });
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["regulator-change-event", eventId] });
    },
  });

  if (!isSuperAdmin && !isVivacityTeam) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Access Restricted</h2>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading || !event) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  const wl = event.regulator_watchlist as any;
  const affectedAreas = (event.affected_areas_json as any[]) || [];
  const finding = findings?.[0];
  const riskFlags = (finding?.risk_flags_json as any[]) || [];
  const citations = (finding?.citations_json as any[]) || [];

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4 max-w-screen-lg mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/regulator-watch")} className="gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              {wl?.name || "Change Event"}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${IMPACT_COLORS[event.impact_level] || ""}`}>
                {event.impact_level}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Detected {format(new Date(event.detected_at), "dd MMM yyyy HH:mm")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {event.review_status === "pending" && (
              <Button size="sm" variant="outline" onClick={() => updateStatus.mutate("reviewed")} className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark Reviewed
              </Button>
            )}
            {event.review_status === "reviewed" && (
              <Button size="sm" onClick={() => updateStatus.mutate("actioned")} className="gap-1">
                <ClipboardList className="h-3.5 w-3.5" /> Mark Actioned
              </Button>
            )}
            <Badge variant={event.review_status === "pending" ? "secondary" : event.review_status === "actioned" ? "outline" : "default"}>
              {event.review_status}
            </Badge>
          </div>
        </div>

        {/* Source Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Source Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-20">URL:</span>
              <a href={wl?.url} target="_blank" rel="noopener noreferrer" className="text-primary flex items-center gap-1">
                {wl?.url} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-20">Category:</span>
              <Badge variant="outline" className="text-[10px]">{wl?.category}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-20">Hash (old):</span>
              <code className="text-[10px] bg-muted px-1 rounded">{event.previous_hash?.slice(0, 16)}...</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-20">Hash (new):</span>
              <code className="text-[10px] bg-muted px-1 rounded">{event.new_hash?.slice(0, 16)}...</code>
            </div>
          </CardContent>
        </Card>

        {/* Change Summary */}
        {event.change_summary_md && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Change Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none text-xs leading-relaxed whitespace-pre-wrap">
                {event.change_summary_md}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Affected Areas */}
        {affectedAreas.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Affected Areas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {affectedAreas.map((area: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-2 rounded bg-muted/50 text-xs">
                    <div className="flex-1">
                      <p className="font-medium">{area.area || area.risk_category}</p>
                      <p className="text-muted-foreground">{area.impact_type || area.claim_excerpt}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {area.standard_clause || "—"}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Citations */}
        {citations.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Citations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {citations.map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground w-6">[{c.index || i + 1}]</span>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                      {c.url}
                    </a>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Disclaimer */}
        <p className="text-[10px] text-muted-foreground text-center italic">
          This summary identifies potential operational impacts only. Human review required.
        </p>
      </div>
    </DashboardLayout>
  );
}

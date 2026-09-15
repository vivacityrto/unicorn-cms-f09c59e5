/**
 * RegulatorChangeEventDetail – Detail view for a single regulator change event.
 * Shows before/after summary, impact, affected areas, citations, and review controls.
 */
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRBAC } from "@/hooks/useRBAC";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, ArrowLeft, ExternalLink, AlertTriangle, CheckCircle2, ClipboardList, ShieldAlert, Quote } from "lucide-react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  formatRegulatoryImpactExplanation,
  getRegulatorySummarySections,
  humanizeRegulatoryImpactText,
} from "@/features/regulatory-updates/summaryFormatting";

const IMPACT_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  moderate: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

interface RegulatorWatchlistRef {
  name: string;
  url: string;
  category: string;
}

interface AffectedArea {
  area?: string;
  risk_category?: string;
  impact_type?: string;
  claim_excerpt?: string;
  standard_clause?: string;
}

interface Citation {
  index?: number;
  url: string;
}

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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Access Restricted</h2>
      </div>
    );
  }

  if (isLoading || !event) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const wl = event.regulator_watchlist as unknown as RegulatorWatchlistRef;
  const affectedAreas = (event.affected_areas_json as unknown as AffectedArea[]) || [];
  const finding = findings?.[0];
  const riskFlags = (finding?.risk_flags_json as unknown as unknown[]) || [];
  const citations = (finding?.citations_json as unknown as Citation[]) || [];
  const summarySections = event.change_summary_md
    ? getRegulatorySummarySections(event.change_summary_md)
    : null;
  const impactExplanation = summarySections?.impactLevel
    ? formatRegulatoryImpactExplanation(summarySections.impactLevel, event.impact_level)
    : null;

  return (
      <div className="w-full min-w-0 space-y-8 p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-wrap items-start gap-4 border-b border-border/70 pb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/regulator-watch")} className="-ml-3 gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Regulatory update</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="break-words text-3xl font-bold leading-tight tracking-tight text-foreground">
                {wl?.name || "Change Event"}
              </h1>
              {event.impact_level && (
                <span className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${IMPACT_COLORS[event.impact_level] || ""}`}>
                  {event.impact_level} impact
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Detected {format(new Date(event.detected_at), "dd MMM yyyy HH:mm")}
            </p>
            {impactExplanation && (
              <blockquote className="flex max-w-3xl gap-3 rounded-r-xl border-l-4 border-primary/50 bg-primary/[0.04] px-4 py-3 text-sm leading-6 text-muted-foreground">
                <Quote className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-primary">Why it matters</p>
                  <p>{impactExplanation}</p>
                </div>
              </blockquote>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
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

        {/* Change Summary */}
        {summarySections?.changeSummary && (
          <Card>
            <CardHeader className="space-y-2 pb-4 sm:p-8 sm:pb-4">
              <CardTitle className="text-xl leading-tight text-secondary">Change Summary</CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">Review what changed before deciding what action, if any, is needed.</p>
            </CardHeader>
            <CardContent className="sm:px-8 sm:pb-8">
              <div className="prose prose-sm max-w-none break-words text-sm leading-7 text-foreground [overflow-wrap:anywhere] prose-headings:mb-3 prose-headings:mt-7 prose-headings:font-semibold prose-headings:leading-tight prose-headings:text-secondary prose-p:my-4 prose-li:my-1.5 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:[overflow-wrap:anywhere] [&_code]:break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summarySections.changeSummary}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Affected Areas */}
        {affectedAreas.length > 0 && (
          <Card>
            <CardHeader className="space-y-2 pb-4 sm:p-8 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-xl leading-tight text-secondary">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Affected Areas
              </CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">Standards and operational areas that may need attention.</p>
            </CardHeader>
            <CardContent className="sm:px-8 sm:pb-8">
              <div className="space-y-3">
                {affectedAreas.map((area: AffectedArea, i: number) => (
                  <div key={i} className="flex items-start gap-4 rounded-lg border border-border/70 bg-muted/30 p-4 text-sm">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="break-words font-semibold leading-6 [overflow-wrap:anywhere]">{area.area || area.risk_category}</p>
                      <p className="break-words leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                        {humanizeRegulatoryImpactText(area.impact_type || area.claim_excerpt || "")}
                      </p>
                    </div>
                    <Badge variant="outline" className="max-w-[42%] whitespace-normal break-words text-right text-[11px] leading-4 shrink-0">
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
            <CardHeader className="space-y-2 pb-4 sm:p-8 sm:pb-4">
              <CardTitle className="text-xl leading-tight text-secondary">Citations</CardTitle>
              <p className="text-sm leading-6 text-muted-foreground">Review the original sources for full context.</p>
            </CardHeader>
            <CardContent className="sm:px-8 sm:pb-8">
              <div className="space-y-3">
                {citations.map((c: Citation, i: number) => (
                  <div key={i} className="flex min-w-0 items-start gap-3 text-sm leading-6">
                    <span className="mt-0.5 w-6 shrink-0 text-muted-foreground">[{c.index || i + 1}]</span>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="min-w-0 text-primary hover:underline break-all">
                      {c.url}
                    </a>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Source Info */}
        <Card>
          <CardHeader className="space-y-2 pb-4 sm:p-7 sm:pb-4">
            <CardTitle className="text-lg leading-tight text-secondary">Source Details</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">Where this update was published.</p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm sm:px-7 sm:pb-7">
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">URL:</span>
              <a href={wl?.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex items-center gap-1 text-primary break-all hover:underline">
                {wl?.url} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category:</span>
              <Badge variant="outline" className="text-[10px]">{wl?.category}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hash (old):</span>
              <code className="break-all rounded bg-muted px-1 text-[10px]">{event.previous_hash?.slice(0, 16)}...</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hash (new):</span>
              <code className="break-all rounded bg-muted px-1 text-[10px]">{event.new_hash?.slice(0, 16)}...</code>
            </div>
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <p className="text-[10px] text-muted-foreground text-center italic">
          This summary identifies potential operational impacts only. Human review required.
        </p>
      </div>
  );
}

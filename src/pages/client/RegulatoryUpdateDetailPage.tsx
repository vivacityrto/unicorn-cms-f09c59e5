/**
 * RegulatoryUpdateDetailPage – client-portal read-only detail view for a
 * single regulator change event. No hashes, no review controls.
 */
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ExternalLink, AlertTriangle, Quote } from "lucide-react";
import { format } from "date-fns";
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

interface RegulatorWatchlist {
  name: string | null;
  url: string | null;
  category: string | null;
}

interface AffectedArea {
  area?: string;
  risk_category?: string;
  impact_type?: string;
  claim_excerpt?: string;
  standard_clause?: string;
}

interface RegulatorChangeEventDetail {
  detected_at: string | null;
  impact_level: string | null;
  change_summary_md: string | null;
  affected_areas_json: AffectedArea[] | null;
  research_job_id: string | null;
  regulator_watchlist: RegulatorWatchlist | null;
}

interface Citation {
  index?: number;
  url: string;
}

interface ResearchFinding {
  citations_json: Citation[] | null;
}

export default function RegulatoryUpdateDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();

  const { data: event, isLoading } = useQuery({
    queryKey: ["client-regulator-change-event", eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulator_change_events")
        .select(`*, regulator_watchlist(name, url, category)`)
        .eq("id", eventId!)
        .single();
      if (error) throw error;
      return data as unknown as RegulatorChangeEventDetail;
    },
    enabled: !!eventId,
  });

  const { data: findings } = useQuery({
    queryKey: ["client-change-event-findings", event?.research_job_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_findings")
        .select("*")
        .eq("job_id", event!.research_job_id);
      if (error) throw error;
      return (data || []) as unknown as ResearchFinding[];
    },
    enabled: !!event?.research_job_id,
  });

  const backLink = (
    <Button variant="ghost" size="sm" asChild className="-ml-3 gap-2 text-muted-foreground hover:text-foreground">
      <Link to="/client/regulatory-updates">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Regulatory Updates
      </Link>
    </Button>
  );

  if (isLoading || !event) {
    return (
        <div className="space-y-4">
          {backLink}
          <div className="flex items-center justify-center min-h-[40vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
    );
  }

  const wl = event.regulator_watchlist;
  const affectedAreas = event.affected_areas_json || [];
  const finding = findings?.[0];
  const citations = finding?.citations_json || [];
  const summarySections = event.change_summary_md
    ? getRegulatorySummarySections(event.change_summary_md)
    : null;
  const impactExplanation = summarySections?.impactLevel
    ? formatRegulatoryImpactExplanation(summarySections.impactLevel, event.impact_level)
    : null;

  return (
    <div className="w-full min-w-0 space-y-8">
      {backLink}

      <header className="space-y-4 border-b border-border/70 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Regulatory update</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="break-words text-3xl font-bold leading-tight tracking-tight text-secondary sm:text-4xl">
                {wl?.name || "Regulatory Update"}
              </h1>
              {event.impact_level && (
                <span className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${IMPACT_COLORS[event.impact_level] || ""}`}>
                  {event.impact_level} impact
                </span>
              )}
            </div>
            {event.detected_at && (
              <p className="text-sm text-muted-foreground">
                Detected {format(new Date(event.detected_at), "dd MMM yyyy 'at' HH:mm")}
              </p>
            )}
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
        </div>
      </header>

      <div className="w-full min-w-0 space-y-6">
        {/* Change Summary */}
        {summarySections?.changeSummary && (
            <Card>
              <CardHeader className="space-y-2 pb-4 sm:p-8 sm:pb-4">
                <CardTitle className="text-xl leading-tight text-secondary">Change Summary</CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  A plain-language summary of what changed and what it may mean for your RTO.
                </p>
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
                <p className="text-sm leading-6 text-muted-foreground">
                  Standards and operational areas that may need your attention.
                </p>
              </CardHeader>
              <CardContent className="sm:px-8 sm:pb-8">
                <div className="space-y-3">
                  {affectedAreas.map((area, i) => (
                    <div key={i} className="flex items-start gap-4 rounded-lg border border-border/70 bg-muted/30 p-4 text-sm">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <p className="break-words font-semibold leading-6 text-foreground [overflow-wrap:anywhere]">{area.area || area.risk_category}</p>
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
                  {citations.map((c, i) => (
                    <div key={i} className="flex min-w-0 items-start gap-3 text-sm leading-6">
                      <span className="mt-0.5 w-6 shrink-0 text-muted-foreground">[{c.index || i + 1}]</span>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 text-primary break-all hover:underline"
                      >
                        {c.url}
                      </a>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

        {/* Source Details */}
        <Card className="min-w-0">
          <CardHeader className="space-y-2 pb-4 sm:p-7 sm:pb-4">
            <CardTitle className="text-lg leading-tight text-secondary">Source Details</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">Where this update was published.</p>
          </CardHeader>
          <CardContent className="space-y-5 sm:px-7 sm:pb-7">
            {wl?.url && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source URL</p>
                <a
                  href={wl.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 items-start gap-2 text-sm leading-6 text-primary break-all hover:underline"
                >
                  <span className="min-w-0">{wl.url}</span>
                  <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0" />
                </a>
              </div>
            )}
            {wl?.category && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</p>
                <Badge variant="outline" className="text-xs capitalize">{wl.category}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="border-t border-border/70 pt-5 text-sm italic leading-6 text-muted-foreground">
        This summary identifies potential operational impacts only. Human review required.
      </p>
    </div>
  );
}

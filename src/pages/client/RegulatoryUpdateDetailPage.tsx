/**
 * RegulatoryUpdateDetailPage – client-portal read-only detail view for a
 * single regulator change event. No hashes, no review controls.
 */
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, AlertTriangle, MessageCircle, Quote } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useHelpCenter } from "@/components/help-center";
import { AtAGlance, ImpactChip, RegulatoryBanner } from "@/components/client/regulatory/RegulatoryParts";
import { impactOf } from "@/features/regulatory-updates/regulatoryView";
import {
  formatRegulatoryImpactExplanation,
  getRegulatorySummarySections,
  humanizeRegulatoryImpactText,
} from "@/features/regulatory-updates/summaryFormatting";

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
  const { openHelpCenter, canAccess: canAccessHelpCenter } = useHelpCenter();

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
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const wl = event.regulator_watchlist;
  const impact = impactOf(event.impact_level);
  const affectedAreas = event.affected_areas_json || [];
  const finding = findings?.[0];
  const citations = finding?.citations_json || [];
  const summarySections = event.change_summary_md ? getRegulatorySummarySections(event.change_summary_md) : null;
  const impactExplanation = summarySections?.impactLevel
    ? formatRegulatoryImpactExplanation(summarySections.impactLevel, event.impact_level)
    : null;

  return (
    <div className="w-full min-w-0 space-y-5">
      {backLink}

      <RegulatoryBanner eyebrow="Regulatory update" title={wl?.name || "Regulatory Update"}>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {impact && <ImpactChip level={impact} suffix=" impact" />}
          {wl?.category && <Badge variant="outline" className="border-white/30 px-2 py-0 text-[11px] capitalize text-white">{wl.category}</Badge>}
        </div>
      </RegulatoryBanner>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          {impactExplanation && (
            <blockquote className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm leading-6 text-foreground">
              <Quote className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Why it matters</p>
                <p>{impactExplanation}</p>
              </div>
            </blockquote>
          )}

          {summarySections?.changeSummary && (
            <section aria-label="Change summary" className="rounded-xl border bg-card p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground">Change summary</h2>
              <p className="mt-1 text-sm text-muted-foreground">A plain-language summary of what changed and what it may mean for your RTO.</p>
              <div className="prose prose-sm mt-4 max-w-none break-words text-sm leading-7 text-foreground [overflow-wrap:anywhere] prose-headings:mb-3 prose-headings:mt-7 prose-headings:font-semibold prose-headings:leading-tight prose-headings:text-foreground prose-p:my-4 prose-li:my-1.5 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:[overflow-wrap:anywhere] [&_code]:break-words">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summarySections.changeSummary}</ReactMarkdown>
              </div>
            </section>
          )}

          {affectedAreas.length > 0 && (
            <section aria-label="Affected areas" className="rounded-xl border bg-card p-5 sm:p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden />
                Affected areas
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Standards and operational areas that may need your attention.</p>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {affectedAreas.map((area, i) => (
                  <div key={i} className="flex min-w-0 flex-col gap-2 rounded-lg border border-border/70 bg-muted/30 p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 break-words font-semibold leading-6 text-foreground [overflow-wrap:anywhere]">{area.area || area.risk_category}</p>
                      {area.standard_clause && <Badge variant="outline" className="shrink-0 whitespace-normal break-words text-[11px] leading-4">{area.standard_clause}</Badge>}
                    </div>
                    <p className="break-words leading-6 text-muted-foreground [overflow-wrap:anywhere]">{humanizeRegulatoryImpactText(area.impact_type || area.claim_excerpt || "")}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {citations.length > 0 && (
            <section aria-label="Citations" className="rounded-xl border bg-card p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground">Citations</h2>
              <p className="mt-1 text-sm text-muted-foreground">Review the original sources for full context.</p>
              <ul className="mt-4 space-y-3">
                {citations.map((c, i) => (
                  <li key={i} className="flex min-w-0 items-start gap-3 text-sm leading-6">
                    <span className="mt-0.5 w-6 shrink-0 text-muted-foreground">[{c.index || i + 1}]</span>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-all text-primary hover:underline">{c.url}</a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:self-start" aria-label="About this update">
          <AtAGlance
            impact={impact}
            detectedAt={event.detected_at}
            regulator={wl?.name || "Regulator update"}
            category={wl?.category ?? null}
            areaCount={affectedAreas.length}
            sourceCount={citations.length}
            sourceUrl={wl?.url ?? null}
          />
          {canAccessHelpCenter && (
            <section aria-label="Need a hand" className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <h2 className="text-sm font-semibold text-foreground">Not sure what this means for you?</h2>
              <p className="mt-1 text-xs text-muted-foreground">Your consultant can walk you through the affected areas and what evidence to check.</p>
              <Button size="sm" className="mt-3 gap-1.5" onClick={() => openHelpCenter("csc")}>
                <MessageCircle className="h-4 w-4" aria-hidden /> Message your CSC
              </Button>
            </section>
          )}
        </aside>
      </div>

      <p className="border-t border-border/70 pt-5 text-sm italic leading-6 text-muted-foreground">
        This summary identifies potential operational impacts only. Human review required.
      </p>
    </div>
  );
}

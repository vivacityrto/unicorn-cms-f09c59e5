/**
 * RegulatoryUpdateDetailWrapper – client-portal read-only detail view for a
 * single regulator change event. No hashes, no review controls.
 */
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ExternalLink, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const IMPACT_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  moderate: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

export default function RegulatoryUpdateDetailWrapper() {
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
      return data as any;
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
      return (data || []) as any[];
    },
    enabled: !!event?.research_job_id,
  });

  const backLink = (
    <Button variant="ghost" size="sm" asChild className="gap-1 -ml-2">
      <Link to="/client/regulatory-updates">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Regulatory Updates
      </Link>
    </Button>
  );

  if (isLoading || !event) {
    return (
      <ClientLayout>
        <div className="space-y-4">
          {backLink}
          <div className="flex items-center justify-center min-h-[40vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>
      </ClientLayout>
    );
  }

  const wl = event.regulator_watchlist as any;
  const affectedAreas = (event.affected_areas_json as any[]) || [];
  const finding = findings?.[0];
  const citations = (finding?.citations_json as any[]) || [];

  return (
    <ClientLayout>
      <div className="space-y-4 max-w-screen-lg">
        {backLink}

        <div>
          <h1 className="text-2xl font-bold text-secondary flex items-center gap-2 flex-wrap">
            {wl?.name || "Regulatory Update"}
            {event.impact_level && (
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${IMPACT_COLORS[event.impact_level] || ""}`}
              >
                {event.impact_level}
              </span>
            )}
          </h1>
          {event.detected_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Detected {format(new Date(event.detected_at), "dd MMM yyyy HH:mm")}
            </p>
          )}
        </div>

        {/* Source Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Source Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {wl?.url && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">URL:</span>
                <a
                  href={wl.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary flex items-center gap-1 break-all"
                >
                  {wl.url} <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
            )}
            {wl?.category && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">Category:</span>
                <Badge variant="outline" className="text-[10px]">{wl.category}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Change Analysis */}
        {event.change_summary_md && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Change Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none text-xs leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{event.change_summary_md}</ReactMarkdown>
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
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline truncate"
                    >
                      {c.url}
                    </a>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-[10px] text-muted-foreground italic">
          This summary identifies potential operational impacts only. Human review required.
        </p>
      </div>
    </ClientLayout>
  );
}

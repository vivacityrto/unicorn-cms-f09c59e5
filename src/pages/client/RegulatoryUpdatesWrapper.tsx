/**
 * RegulatoryUpdatesWrapper – client-portal list of regulator change events.
 * Read-only mirror of the SuperAdmin Regulator Change Watch feature.
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Globe, AlertTriangle, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const IMPACT_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  moderate: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function RegulatoryUpdatesWrapper() {
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ["client-regulator-change-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regulator_change_events")
        .select(`*, regulator_watchlist(name, url, category)`)
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-secondary">Regulatory Updates</h1>
          <p className="text-muted-foreground mt-1">
            Changes to RTO standards, guidance, and legislation that may affect you.
          </p>
        </div>

        {isLoading && (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="p-5 space-y-3">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && error && (
          <Card>
            <CardContent className="py-8 text-center">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-destructive" />
              <p className="text-muted-foreground">
                Couldn't load regulatory updates. Try refreshing.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && (data?.length ?? 0) === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Globe className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground font-medium">No regulatory updates yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                We'll notify you here when something relevant to your RTO's compliance changes.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && (data?.length ?? 0) > 0 && (
          <div className="space-y-4">
            {data!.map((event) => {
              const wl = event.regulator_watchlist as any;
              const excerpt = event.change_summary_md
                ? stripMarkdown(event.change_summary_md).slice(0, 200)
                : null;
              return (
                <Card
                  key={event.id}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                  onClick={() => navigate(`/client/regulatory-updates/${event.id}`)}
                >
                  <CardContent className="p-5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-secondary">
                          {wl?.name || "Regulator update"}
                        </h3>
                        {wl?.url && (
                          <a
                            href={wl.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary hover:text-primary/80"
                            aria-label="Open regulator source"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {wl?.category && (
                          <Badge variant="outline" className="text-[10px]">{wl.category}</Badge>
                        )}
                      </div>
                      {event.impact_level && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${IMPACT_COLORS[event.impact_level] || ""}`}
                        >
                          {event.impact_level}
                        </span>
                      )}
                    </div>

                    {excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-3">{excerpt}…</p>
                    )}

                    {event.detected_at && (
                      <p className="text-xs text-muted-foreground">
                        Detected {formatDistanceToNow(new Date(event.detected_at), { addSuffix: true })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}

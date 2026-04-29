import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import type { WindowDays } from "./lib";

interface Props {
  windowDays: WindowDays;
  onPickClause: (clause: string) => void;
}

interface ByClauseRow {
  clause: string;
  quality_area: string | null;
  total_drafts: number;
  acceptance_rate_pct: number | null;
  avg_edit_distance_pct: number | null;
  rejection_rate_pct: number | null;
  low_confidence_pct: number | null;
}

export function PatternsPanel({ windowDays, onPickClause }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["ai_drafting_by_clause", windowDays],
    queryFn: async (): Promise<ByClauseRow[]> => {
      const { data, error } = await supabase.rpc("ai_drafting_by_clause" as never, {
        p_window_days: windowDays,
        p_min_drafts: 3,
      } as never);
      if (error) throw error;
      return (data ?? []) as unknown as ByClauseRow[];
    },
  });

  const rows = data ?? [];

  // Top 5 by acceptance rate (descending), then by total_drafts as tiebreaker.
  const topGood = [...rows]
    .filter((r) => r.acceptance_rate_pct != null)
    .sort((a, b) => (b.acceptance_rate_pct! - a.acceptance_rate_pct!) || (b.total_drafts - a.total_drafts))
    .slice(0, 5);

  // Top 5 by rejection rate or heavy-edit rate.
  // Without per-bucket counts here, we proxy "struggling" via:
  // rejection_rate_pct desc, then avg_edit_distance_pct desc.
  const topBad = [...rows]
    .filter((r) => r.rejection_rate_pct != null || r.avg_edit_distance_pct != null)
    .sort((a, b) => {
      const ra = a.rejection_rate_pct ?? 0;
      const rb = b.rejection_rate_pct ?? 0;
      if (rb !== ra) return rb - ra;
      const ea = a.avg_edit_distance_pct ?? 0;
      const eb = b.avg_edit_distance_pct ?? 0;
      return eb - ea;
    })
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ClauseColumn
        title="Working well"
        helper="These clauses produce drafts that auditors accept with little or no editing."
        rows={topGood}
        emptyMessage="Not enough drafts in this window yet to identify strong clauses (need at least 3 per clause)."
        showRejection={false}
        onPickClause={onPickClause}
      />
      <ClauseColumn
        title="Worth investigating"
        helper="These clauses produce drafts that need significant rewriting. Worth examining the system prompt or the corpus coverage for these areas."
        rows={topBad}
        emptyMessage="Not enough drafts in this window yet to identify struggling clauses (need at least 3 per clause)."
        showRejection={true}
        onPickClause={onPickClause}
      />
    </div>
  );
}

function ClauseColumn({
  title,
  helper,
  rows,
  emptyMessage,
  showRejection,
  onPickClause,
}: {
  title: string;
  helper: string;
  rows: ByClauseRow[];
  emptyMessage: string;
  showRejection: boolean;
  onPickClause: (clause: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.clause} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{r.clause}</span>
                    {r.quality_area && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {r.quality_area}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {r.total_drafts} drafts
                    {showRejection
                      ? r.rejection_rate_pct != null
                        ? ` · ${r.rejection_rate_pct}% rejected`
                        : ""
                      : r.acceptance_rate_pct != null
                        ? ` · ${r.acceptance_rate_pct}% accepted`
                        : ""}
                    {r.avg_edit_distance_pct != null && ` · avg edit ${r.avg_edit_distance_pct}%`}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onPickClause(r.clause)}
                  aria-label={`Filter recent drafts to ${r.clause}`}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

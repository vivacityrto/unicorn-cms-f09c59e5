import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { OutcomeBar } from "./OutcomeBar";
import { formatTokens, type WindowDays } from "./lib";

interface Props {
  windowDays: WindowDays;
}

interface SummaryRow {
  total_drafts: number;
  pending: number;
  accepted_unchanged: number;
  accepted_light_edit: number;
  accepted_moderate_edit: number;
  accepted_heavy_edit: number;
  rejected: number;
  acceptance_rate_pct: number | null;
  avg_edit_distance_pct: number | null;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  unique_users: number;
  cap_hit_users: number;
}

export function SummaryTiles({ windowDays }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["ai_drafting_summary", windowDays],
    queryFn: async (): Promise<SummaryRow | null> => {
      const { data, error } = await supabase.rpc("ai_drafting_summary" as never, {
        p_window_days: windowDays,
      } as never);
      if (error) throw error;
      const rows = (data ?? []) as unknown as SummaryRow[];
      return rows[0] ?? null;
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  const s = data ?? {
    total_drafts: 0,
    pending: 0,
    accepted_unchanged: 0,
    accepted_light_edit: 0,
    accepted_moderate_edit: 0,
    accepted_heavy_edit: 0,
    rejected: 0,
    acceptance_rate_pct: null,
    avg_edit_distance_pct: null,
    total_prompt_tokens: 0,
    total_completion_tokens: 0,
    unique_users: 0,
    cap_hit_users: 0,
  };

  const tiles: { label: string; value: string; subtitle: string }[] = [
    { label: "Total drafts", value: String(s.total_drafts), subtitle: `last ${windowDays >= 3650 ? "all time" : `${windowDays} days`}` },
    { label: "Acceptance rate", value: s.acceptance_rate_pct == null ? "—" : `${s.acceptance_rate_pct}%`, subtitle: "accepted or edited" },
    { label: "Avg edit distance", value: s.avg_edit_distance_pct == null ? "—" : `${s.avg_edit_distance_pct}%`, subtitle: "of accepted drafts" },
    { label: "Tokens used", value: formatTokens(s.total_prompt_tokens, s.total_completion_tokens), subtitle: "input → output" },
    { label: "Unique users", value: String(s.unique_users), subtitle: "drafted ≥ 1 finding" },
    { label: "Cap hits today", value: String(s.cap_hit_users), subtitle: "users at 40/day limit" },
    { label: "Pending decisions", value: String(s.pending), subtitle: "not yet decided" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {tiles.map((t) => (
          <Card key={t.label} className="p-3 bg-card border-border">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className="text-2xl font-semibold tabular-nums mt-1">{t.value}</div>
            <div className="text-xs text-muted-foreground mt-1 truncate" title={t.subtitle}>
              {t.subtitle}
            </div>
          </Card>
        ))}
      </div>
      <OutcomeBar
        pending={s.pending}
        accepted_unchanged={s.accepted_unchanged}
        accepted_light_edit={s.accepted_light_edit}
        accepted_moderate_edit={s.accepted_moderate_edit}
        accepted_heavy_edit={s.accepted_heavy_edit}
        rejected={s.rejected}
      />
    </div>
  );
}

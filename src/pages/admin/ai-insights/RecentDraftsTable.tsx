import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, X } from "lucide-react";
import {
  CONFIDENCE_CHIP,
  formatRelative,
  formatTokens,
  OUTCOME_CHIP,
  OUTCOME_LABEL,
  type OutcomeBucket,
  type WindowDays,
} from "./lib";

export interface DraftRow {
  draft_log_id: string;
  drafted_at: string;
  drafted_by: string;
  tenant_id: number | null;
  response_id: string;
  audit_id: string | null;
  question_id: string | null;
  clause: string | null;
  quality_area: string | null;
  audit_type: string | null;
  snapshot_rto_name: string | null;
  audit_title: string | null;
  auditor_note: string | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  duration_ms: number | null;
  draft_json: Record<string, unknown> | null;
  corpus_chunks_used: unknown[] | null;
  corpus_empty: boolean;
  confidence: string | null;
  decided_at: string | null;
  decision: string | null;
  edit_distance_pct: number | null;
  final_summary: string | null;
  final_priority: string | null;
  outcome_bucket: OutcomeBucket;
}

interface Props {
  windowDays: WindowDays;
  clauseFilter: string | null;
  onClearClauseFilter: () => void;
  onOpenRow: (row: DraftRow) => void;
}

const PAGE_SIZE = 20;

export function RecentDraftsTable({
  windowDays,
  clauseFilter,
  onClearClauseFilter,
  onOpenRow,
}: Props) {
  const [page, setPage] = useState(0);
  const [outcomeFilter, setOutcomeFilter] = useState<string>("__all__");
  const [userFilter, setUserFilter] = useState<string>("");
  const [auditFilter, setAuditFilter] = useState<string>("");

  // Reset pagination when filters change.
  useEffect(() => {
    setPage(0);
  }, [windowDays, clauseFilter, outcomeFilter, userFilter, auditFilter]);

  const { data, isLoading } = useQuery({
    queryKey: [
      "v_ai_finding_draft_outcomes",
      { windowDays, page, clauseFilter, outcomeFilter, userFilter, auditFilter },
    ],
    queryFn: async () => {
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
      let q = supabase
        .from("v_ai_finding_draft_outcomes" as never)
        .select("*", { count: "exact" })
        .gte("drafted_at", since)
        .order("drafted_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (clauseFilter) q = q.eq("clause" as never, clauseFilter as never);
      if (outcomeFilter !== "__all__") q = q.eq("outcome_bucket" as never, outcomeFilter as never);
      if (auditFilter.trim()) q = q.ilike("audit_title" as never, `%${auditFilter.trim()}%` as never);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as DraftRow[], count: count ?? 0 };
    },
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Resolve user names in a second small query (left join is not in the view).
  const userIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.drafted_by).filter(Boolean))),
    [rows],
  );
  const { data: userMap } = useQuery({
    queryKey: ["ai-insights-users", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, email")
        .in("user_uuid", userIds);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const u of data ?? []) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
        map.set(u.user_uuid, name || u.email || u.user_uuid);
      }
      return map;
    },
  });

  // Apply user filter client-side (we resolved names client-side).
  const filteredRows = userFilter.trim()
    ? rows.filter((r) => {
        const name = userMap?.get(r.drafted_by) ?? r.drafted_by;
        return name.toLowerCase().includes(userFilter.trim().toLowerCase());
      })
    : rows;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-medium">Recent drafts</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {clauseFilter && (
            <Badge variant="secondary" className="gap-1">
              Clause: {clauseFilter}
              <button onClick={onClearClauseFilter} aria-label="Clear clause filter">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="All outcomes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All outcomes</SelectItem>
              {(Object.keys(OUTCOME_LABEL) as OutcomeBucket[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {OUTCOME_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter by user…"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="w-[180px] h-8 text-xs"
          />
          <Input
            placeholder="Filter by audit title…"
            value={auditFilter}
            onChange={(e) => setAuditFilter(e.target.value)}
            className="w-[200px] h-8 text-xs"
          />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : filteredRows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-12 text-center">
          No drafts match these filters in the selected window.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-3">Drafted</th>
                <th className="text-left py-2 pr-3">User</th>
                <th className="text-left py-2 pr-3">Audit</th>
                <th className="text-left py-2 pr-3">Clause</th>
                <th className="text-left py-2 pr-3">Confidence</th>
                <th className="text-left py-2 pr-3">Outcome</th>
                <th className="text-left py-2 pr-3">Edit dist.</th>
                <th className="text-left py-2 pr-3">Tokens</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr
                  key={r.draft_log_id}
                  className="border-b border-border hover:bg-muted/50 cursor-pointer"
                  onClick={() => onOpenRow(r)}
                >
                  <td className="py-2 pr-3 whitespace-nowrap">{formatRelative(r.drafted_at)}</td>
                  <td className="py-2 pr-3 truncate max-w-[160px]">
                    {userMap?.get(r.drafted_by) ?? "—"}
                  </td>
                  <td className="py-2 pr-3 truncate max-w-[260px]" title={r.audit_title ?? ""}>
                    {r.audit_title ?? "—"}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <span className="font-medium">{r.clause ?? "—"}</span>
                    {r.quality_area && (
                      <Badge variant="outline" className="ml-1.5 text-[10px] px-1.5 py-0">
                        {r.quality_area}
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {r.confidence ? (
                      <Badge variant="outline" className={`text-[10px] ${CONFIDENCE_CHIP[r.confidence] ?? ""}`}>
                        {r.confidence}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge variant="outline" className={`text-[10px] ${OUTCOME_CHIP[r.outcome_bucket]}`}>
                      {OUTCOME_LABEL[r.outcome_bucket]}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">
                    {r.outcome_bucket === "rejected" || r.outcome_bucket === "pending"
                      ? "—"
                      : r.edit_distance_pct != null
                        ? `${r.edit_distance_pct}%`
                        : "—"}
                  </td>
                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                    {formatTokens(r.prompt_tokens, r.completion_tokens)}
                  </td>
                  <td className="py-2">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} · {totalCount} total
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

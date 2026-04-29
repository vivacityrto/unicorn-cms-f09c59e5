import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { editDistancePct, OUTCOME_CHIP, OUTCOME_LABEL } from "./lib";
import type { DraftRow } from "./RecentDraftsTable";

interface Props {
  row: DraftRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FinalFinding {
  id: string;
  summary: string | null;
  detail: string | null;
  regulatory_reference: string | null;
  standard_reference: string | null;
  impact: string | null;
  priority: string | null;
}

const DRAFT_FIELDS = [
  "summary",
  "detail",
  "standard_reference",
  "impact",
  "priority",
  "suggested_corrective_action",
  "confidence",
  "uncertainty_notes",
] as const;

export function DraftDrillDown({ row, open, onOpenChange }: Props) {
  const { data: finding, isLoading: findingLoading } = useQuery({
    queryKey: ["final-finding", row?.audit_id, row?.response_id],
    enabled: !!row && !!row.audit_id && !!row.response_id,
    queryFn: async (): Promise<FinalFinding | null> => {
      const { data, error } = await supabase
        .from("client_audit_findings")
        .select("id, summary, detail, regulatory_reference, standard_reference, impact, priority")
        .eq("audit_id", row!.audit_id!)
        .eq("response_id", row!.response_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as FinalFinding | null) ?? null;
    },
  });

  if (!row) return null;
  const draft = (row.draft_json ?? {}) as Record<string, string | null>;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[1400px] sm:w-[95vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            Draft drill-down
            {row.clause && (
              <Badge variant="outline" className="text-xs">
                {row.clause}
              </Badge>
            )}
            {row.quality_area && (
              <Badge variant="outline" className="text-xs">
                {row.quality_area}
              </Badge>
            )}
            <Badge variant="outline" className={`text-xs ${OUTCOME_CHIP[row.outcome_bucket]}`}>
              {OUTCOME_LABEL[row.outcome_bucket]}
            </Badge>
          </SheetTitle>
          <SheetDescription className="text-xs">
            {row.audit_title ?? "Untitled audit"} · {row.snapshot_rto_name ?? ""}
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
          {/* Auditor's note */}
          <Column title="Auditor's note">
            <pre className="whitespace-pre-wrap text-sm font-sans bg-muted/30 p-3 rounded border border-border">
              {row.auditor_note?.trim() || "(no note provided)"}
            </pre>
          </Column>

          {/* AI draft */}
          <Column title="AI draft">
            <div className="space-y-3">
              {DRAFT_FIELDS.map((field) => (
                <FieldBlock
                  key={field}
                  label={field.replace(/_/g, " ")}
                  value={draft[field] ?? null}
                />
              ))}
            </div>
          </Column>

          {/* Final finding — same structure even when absent (greyed) */}
          <Column title="Final finding">
            {findingLoading ? (
              <Skeleton className="h-64" />
            ) : row.outcome_bucket === "rejected" ? (
              <PlaceholderFinding label="Rejected — no finding saved" />
            ) : row.outcome_bucket === "pending" ? (
              <PlaceholderFinding label="Pending decision" />
            ) : !finding ? (
              <PlaceholderFinding label="No matching finding row found" />
            ) : (
              <div className="space-y-3">
                <FieldBlock label="summary" value={finding.summary} compareTo={draft["summary"] ?? null} />
                <FieldBlock label="detail" value={finding.detail} compareTo={draft["detail"] ?? null} />
                <FieldBlock
                  label="regulatory reference"
                  value={finding.regulatory_reference}
                  compareTo={draft["standard_reference"] ?? null}
                />
                <FieldBlock label="impact" value={finding.impact} compareTo={draft["impact"] ?? null} />
                <FieldBlock label="priority" value={finding.priority} compareTo={draft["priority"] ?? null} />
              </div>
            )}
          </Column>
        </div>

        {/* Sources used */}
        <div className="mt-8">
          <h4 className="text-sm font-medium mb-2">Sources used</h4>
          {row.corpus_empty ? (
            <div className="text-xs text-muted-foreground">
              Standards retrieval returned no chunks for this draft.
            </div>
          ) : !row.corpus_chunks_used || row.corpus_chunks_used.length === 0 ? (
            <div className="text-xs text-muted-foreground">No corpus chunk metadata recorded.</div>
          ) : (
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {row.corpus_chunks_used.map((c, i) => {
                const chunk = c as {
                  source_document?: string;
                  clause?: string | null;
                  heading?: string | null;
                  similarity?: number;
                };
                return (
                  <li
                    key={i}
                    className="border border-border rounded p-2 text-xs bg-muted/20"
                  >
                    <div className="font-medium truncate">{chunk.source_document ?? "Unknown document"}</div>
                    <div className="text-muted-foreground mt-0.5">
                      {chunk.clause && <span>Clause {chunk.clause}</span>}
                      {chunk.heading && (
                        <>
                          {" · "}
                          <span>{chunk.heading}</span>
                        </>
                      )}
                    </div>
                    <div className="text-muted-foreground tabular-nums mt-0.5">
                      similarity {chunk.similarity?.toFixed(3) ?? "—"}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Prompt context (collapsed) */}
        <details className="mt-6 border border-border rounded p-3">
          <summary className="text-sm font-medium cursor-pointer">
            Prompt context sent to the model
          </summary>
          <div className="mt-3 space-y-2 text-xs">
            <p className="text-muted-foreground">
              The system prompt is a static constant in
              <code className="ml-1">supabase/functions/draft-finding/index.ts</code>. The user-side
              context for this draft was assembled from the auditor's note, the question, and the
              retrieved corpus chunks shown above.
            </p>
            <div>
              <div className="font-medium">Auditor note</div>
              <pre className="whitespace-pre-wrap font-sans bg-muted/30 p-2 rounded border border-border mt-1">
                {row.auditor_note?.trim() || "(none)"}
              </pre>
            </div>
          </div>
        </details>

        {/* AI metadata */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <Meta label="Model" value={row.model ?? "—"} />
          <Meta label="Prompt tokens" value={String(row.prompt_tokens ?? 0)} />
          <Meta label="Completion tokens" value={String(row.completion_tokens ?? 0)} />
          <Meta label="Duration" value={row.duration_ms != null ? `${row.duration_ms} ms` : "—"} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-medium mb-2">{title}</h4>
      {children}
    </div>
  );
}

function FieldBlock({
  label,
  value,
  compareTo,
}: {
  label: string;
  value: string | null;
  compareTo?: string | null;
}) {
  const dist =
    compareTo !== undefined ? editDistancePct(compareTo, value) : null;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        {dist != null && (
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {dist}% changed
          </Badge>
        )}
      </div>
      <pre className="whitespace-pre-wrap text-sm font-sans bg-muted/30 p-2 rounded border border-border">
        {value?.toString().trim() || <span className="text-muted-foreground">(empty)</span>}
      </pre>
    </div>
  );
}

function PlaceholderFinding({ label }: { label: string }) {
  // Same visual structure as the populated final-finding column, but greyed.
  // Empty space reads as loading; greyed placeholder reads as state.
  const labels = ["summary", "detail", "regulatory reference", "impact", "priority"];
  return (
    <div className="space-y-3 opacity-50">
      <div className="text-xs italic text-muted-foreground border border-dashed border-border rounded p-2 bg-muted/10">
        {label}
      </div>
      {labels.map((l) => (
        <div key={l}>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{l}</div>
          <div className="bg-muted/20 p-2 rounded border border-dashed border-border text-sm text-muted-foreground">
            —
          </div>
        </div>
      ))}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-mono mt-0.5 truncate" title={value}>
        {value}
      </div>
    </div>
  );
}

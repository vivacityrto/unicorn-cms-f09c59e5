import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type {
  DeliveryGuardPairStatus,
  DeliveryGuardSummary,
  DeliveryGuardTenantIssue,
} from "@/hooks/useDocumentDeliveryGuards";

interface Props {
  active: boolean;
  isLoading: boolean;
  summary: DeliveryGuardSummary;
  hasBlockingIssues: boolean;
  acknowledged: boolean;
  onAcknowledgedChange: (v: boolean) => void;
  /** Shown when the guard couldn't be computed for the current scope (e.g. no documents narrowed down yet). */
  inactiveHint?: string;
  /** Per-tenant breakdown so staff can see exactly which clients need attention. */
  tenantIssues?: DeliveryGuardTenantIssue[];
  /** tenantId -> display name, for rendering tenantIssues. Omit to hide the affected-clients list. */
  tenantNames?: Record<number, string>;
  /** Per (tenant, document) completeness detail, for the per-client expanded view. */
  pairStatuses?: DeliveryGuardPairStatus[];
  /** documentId -> display name, for rendering pairStatuses in the expanded view. */
  documentNames?: Record<number, string>;
}

/**
 * Tailoring-completeness + TGA-snapshot warning banners and the required
 * acknowledgement checkbox — same pattern GovernanceDeliveryDialog uses for
 * a single document, generalised for Bulk Generate's many-document scope.
 */
export function DeliveryGuardPanel({
  active,
  isLoading,
  summary,
  hasBlockingIssues,
  acknowledged,
  onAcknowledgedChange,
  inactiveHint,
  tenantIssues,
  tenantNames,
  pairStatuses,
  documentNames,
}: Props) {
  const [listExpanded, setListExpanded] = useState(false);
  const [expandedTenants, setExpandedTenants] = useState<Set<number>>(new Set());

  if (!active) {
    return inactiveHint ? (
      <p className="text-xs text-muted-foreground">{inactiveHint}</p>
    ) : null;
  }

  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground p-2 rounded border bg-muted/30">
        Checking tailoring completeness and TGA snapshot status…
      </div>
    );
  }

  const namedIssues = tenantNames
    ? (tenantIssues ?? []).filter((t) => t.riskLevel !== "complete" || t.missingSnapshot)
    : [];

  const toggleTenant = (tenantId: number) => {
    setExpandedTenants((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs p-2 rounded bg-muted/50 border flex-wrap">
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">{summary.complete} fully tailored</span>
        {summary.partial > 0 && <span className="text-amber-500 dark:text-amber-400 font-medium">{summary.partial} partial</span>}
        {summary.incomplete > 0 && <span className="text-destructive font-medium">{summary.incomplete} incomplete</span>}
      </div>
      {summary.missingSnapshot > 0 && (
        <div className="flex items-center gap-2 text-xs p-2 rounded bg-muted/50 border text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="font-medium">
            {summary.missingSnapshot} client{summary.missingSnapshot !== 1 ? 's' : ''} missing TGA snapshot
          </span>
        </div>
      )}
      {namedIssues.length > 0 && (
        <div className="rounded border bg-muted/30">
          <button
            type="button"
            onClick={() => setListExpanded((v) => !v)}
            className="w-full flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-left hover:bg-muted/50"
          >
            {listExpanded ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )}
            Which clients ({namedIssues.length})
          </button>
          {listExpanded && (
            <ul className="px-2 pb-2 space-y-1 max-h-72 overflow-y-auto">
              {namedIssues.map((t) => {
                const tenantDocIssues = (pairStatuses ?? []).filter(
                  (p) => p.tenantId === t.tenantId && p.riskLevel !== "complete",
                );
                const canExpandDetail = documentNames && tenantDocIssues.length > 0;
                const detailOpen = expandedTenants.has(t.tenantId);
                return (
                  <li key={t.tenantId} className="text-xs">
                    <div
                      className={`flex items-center gap-2 ${canExpandDetail ? "cursor-pointer" : ""}`}
                      onClick={canExpandDetail ? () => toggleTenant(t.tenantId) : undefined}
                    >
                      {canExpandDetail ? (
                        detailOpen ? (
                          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )
                      ) : (
                        <span className="w-3 shrink-0" />
                      )}
                      <span className="truncate flex-1">{tenantNames?.[t.tenantId] ?? `Tenant #${t.tenantId}`}</span>
                      {t.riskLevel !== "complete" && (
                        <Badge
                          variant="outline"
                          className={
                            t.riskLevel === "incomplete"
                              ? "text-[10px] px-1.5 py-0 border-destructive/40 text-destructive"
                              : "text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300"
                          }
                        >
                          {t.riskLevel === "incomplete" ? "incomplete" : "partial"}
                        </Badge>
                      )}
                      {t.missingSnapshot && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 border-destructive/40 text-destructive"
                        >
                          no snapshot
                        </Badge>
                      )}
                    </div>
                    {detailOpen && canExpandDetail && (
                      <div className="ml-5 mt-1 mb-1.5 space-y-1 border-l pl-2">
                        {t.missingSnapshot && (
                          <div className="text-muted-foreground">No TGA snapshot on file for this client.</div>
                        )}
                        {tenantDocIssues.map((p) => (
                          <div key={p.documentId}>
                            <span className="font-medium">
                              {documentNames?.[p.documentId] ?? `Document #${p.documentId}`}
                            </span>{" "}
                            <span className="text-muted-foreground">— {p.completeness}% tailored</span>
                            {p.missingFields.length > 0 && (
                              <div className="text-muted-foreground">
                                Missing: {p.missingFields.join(", ")}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {hasBlockingIssues && (
        <label className="flex items-center gap-2 p-2 rounded border border-destructive/30 bg-destructive/5 cursor-pointer">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(v) => onAcknowledgedChange(!!v)}
          />
          <span className="text-xs text-destructive">
            I acknowledge some clients have incomplete tailoring (&lt;75% fields populated) or no TGA snapshot on file
          </span>
        </label>
      )}
    </div>
  );
}

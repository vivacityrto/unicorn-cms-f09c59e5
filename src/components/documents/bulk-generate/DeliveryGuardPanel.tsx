import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { DeliveryGuardSummary } from "@/hooks/useDocumentDeliveryGuards";

interface Props {
  active: boolean;
  isLoading: boolean;
  summary: DeliveryGuardSummary;
  hasBlockingIssues: boolean;
  acknowledged: boolean;
  onAcknowledgedChange: (v: boolean) => void;
  /** Shown when the guard couldn't be computed for the current scope (e.g. no documents narrowed down yet). */
  inactiveHint?: string;
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
}: Props) {
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

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs p-2 rounded bg-muted/50 border flex-wrap">
        <span className="text-emerald-600 font-medium">{summary.complete} fully tailored</span>
        {summary.partial > 0 && <span className="text-amber-500 font-medium">{summary.partial} partial</span>}
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

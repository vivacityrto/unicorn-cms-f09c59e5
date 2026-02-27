import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  FileWarning,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

interface CompletenessResult {
  completeness_percent: number;
  missing_docs: string[];
  missing_fields: string[];
  open_risks_count: number;
  status: "not_ready" | "nearly_ready" | "ready_for_review";
  explanation_text: string | null;
  ai_event_id: string | null;
  confidence: number | null;
}

interface StageCompletenessWidgetProps {
  packageId: number;
  phaseId: number;
  phaseKey: string;
  tenantId: number;
  framework: string;
}

const STATUS_CONFIG = {
  not_ready: {
    icon: XCircle,
    label: "Not Ready",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    progressClass: "bg-destructive",
  },
  nearly_ready: {
    icon: AlertTriangle,
    label: "Nearly Ready",
    badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    progressClass: "bg-amber-500",
  },
  ready_for_review: {
    icon: CheckCircle2,
    label: "Ready for Review",
    badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    progressClass: "bg-emerald-500",
  },
};

export function StageCompletenessWidget({
  packageId,
  phaseId,
  phaseKey,
  tenantId,
  framework,
}: StageCompletenessWidgetProps) {
  const [result, setResult] = useState<CompletenessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Not authenticated");
        return;
      }

      const response = await supabase.functions.invoke("calculate-phase-completeness", {
        body: {
          package_id: packageId,
          phase_id: phaseId,
          phase_key: phaseKey,
          tenant_id: tenantId,
          framework,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to run completeness check");
      }

      setResult(response.data as CompletenessResult);
      toast.success("Completeness check complete");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      toast.error("Completeness check failed", { description: message });
    } finally {
      setLoading(false);
    }
  }

  const config = result ? STATUS_CONFIG[result.status] : null;
  const StatusIcon = config?.icon;
  const hasMissingItems = result && (result.missing_docs.length > 0 || result.missing_fields.length > 0 || result.open_risks_count > 0);

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Stage Completeness</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={runCheck}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {result ? "Re-check" : "Run Check"}
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-destructive text-xs">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* No result yet */}
      {!result && !loading && !error && (
        <p className="text-xs text-muted-foreground">
          Click "Run Check" to evaluate stage completeness against configured requirements.
        </p>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          <div className="h-2 bg-muted rounded-full animate-pulse" />
          <p className="text-xs text-muted-foreground">Evaluating requirements…</p>
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`gap-1 ${config?.badgeClass}`}>
              {StatusIcon && <StatusIcon className="h-3 w-3" />}
              {config?.label}
            </Badge>
            <span className="text-sm font-medium text-foreground">
              {result.completeness_percent}%
            </span>
          </div>

          <Progress
            value={result.completeness_percent}
            indicatorClassName={config?.progressClass}
          />

          {result.explanation_text && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {result.explanation_text}
            </p>
          )}

          {hasMissingItems && (
            <div className="space-y-2 pt-1">
              {result.missing_docs.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <FileWarning className="h-3 w-3 text-amber-500" />
                    Missing Documents ({result.missing_docs.length})
                  </div>
                  <ul className="text-xs text-muted-foreground pl-5 space-y-0.5">
                    {result.missing_docs.map((doc) => (
                      <li key={doc} className="list-disc">{doc}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.missing_fields.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    Missing Fields ({result.missing_fields.length})
                  </div>
                  <ul className="text-xs text-muted-foreground pl-5 space-y-0.5">
                    {result.missing_fields.map((field) => (
                      <li key={field} className="list-disc">{field}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.open_risks_count > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                  <ShieldAlert className="h-3 w-3" />
                  {result.open_risks_count} Open Risk{result.open_risks_count !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}

          {result.confidence !== null && result.confidence > 0 && (
            <div className="text-[10px] text-muted-foreground pt-1">
              AI confidence: {Math.round(result.confidence * 100)}%
            </div>
          )}
        </div>
      )}
    </div>
  );
}

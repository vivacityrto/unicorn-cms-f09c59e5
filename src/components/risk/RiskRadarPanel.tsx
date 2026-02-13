import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileWarning,
  Clock,
  Settings,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface RiskItem {
  risk_item_id: string;
  tenant_id: number;
  package_id: number | null;
  phase_id: number | null;
  risk_code: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  detected_by: string;
  explanation_text: string | null;
  suggested_action: string | null;
  ai_event_id: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  resolved_reason: string | null;
  dismissed_reason: string | null;
}

interface RiskRadarPanelProps {
  tenantId: number;
  packageId?: number;
  phaseId?: number;
  framework?: string;
}

const RISK_CODE_ICONS: Record<string, typeof FileWarning> = {
  missing_required_doc: FileWarning,
  hours_over_80pct: Clock,
  stale_activity_30d: AlertTriangle,
  delivery_mode_unknown: Settings,
};

const SEVERITY_CONFIG = {
  high: {
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    label: "High",
  },
  medium: {
    badgeClass: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    label: "Medium",
  },
  low: {
    badgeClass: "bg-muted text-muted-foreground border-border",
    label: "Low",
  },
};

const STATUS_CONFIG = {
  open: { badgeClass: "bg-destructive/10 text-destructive border-destructive/20", label: "Open" },
  resolved: { badgeClass: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", label: "Resolved" },
  dismissed: { badgeClass: "bg-muted text-muted-foreground border-border", label: "Dismissed" },
};

export function RiskRadarPanel({ tenantId, packageId, phaseId, framework }: RiskRadarPanelProps) {
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [actionDialog, setActionDialog] = useState<{
    type: "resolve" | "dismiss";
    risk: RiskItem;
  } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Load existing risks on mount
  useEffect(() => {
    loadRisks();
  }, [tenantId, packageId]);

  async function loadRisks() {
    setLoading(true);
    try {
      let query = supabase
        .from("risk_items" as any)
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });

      if (packageId) {
        query = query.eq("package_id", packageId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRisks((data as unknown as RiskItem[]) || []);
    } catch (err) {
      console.error("Failed to load risks:", err);
    } finally {
      setLoading(false);
    }
  }

  async function runScan() {
    setScanning(true);
    try {
      const response = await supabase.functions.invoke("scan-risk-radar", {
        body: {
          tenant_id: tenantId,
          package_id: packageId || null,
          phase_id: phaseId || null,
          framework: framework || null,
        },
      });

      if (response.error) throw new Error(response.error.message);

      const result = response.data as { detected_count: number; risks: RiskItem[] };
      setRisks(result.risks);
      toast.success(`Scan complete: ${result.detected_count} risk(s) detected`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Risk scan failed", { description: msg });
    } finally {
      setScanning(false);
    }
  }

  async function handleAction() {
    if (!actionDialog || !actionReason.trim()) {
      toast.error("A reason is required");
      return;
    }

    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const newStatus = actionDialog.type === "resolve" ? "resolved" : "dismissed";
      const updateData: Record<string, unknown> = {
        status: newStatus,
        resolved_by_user_id: user.id,
        resolved_at: new Date().toISOString(),
      };

      if (actionDialog.type === "resolve") {
        updateData.resolved_reason = actionReason;
      } else {
        updateData.dismissed_reason = actionReason;
      }

      const { error } = await supabase
        .from("risk_items" as any)
        .update(updateData)
        .eq("risk_item_id", actionDialog.risk.risk_item_id);

      if (error) throw error;

      // Audit log
      await supabase.from("audit_events").insert({
        entity: "risk_item",
        entity_id: actionDialog.risk.risk_item_id,
        action: `risk.${actionDialog.type}d`,
        user_id: user.id,
        details: {
          risk_code: actionDialog.risk.risk_code,
          reason: actionReason,
          previous_status: actionDialog.risk.status,
          new_status: newStatus,
        },
      });

      toast.success(`Risk ${actionDialog.type === "resolve" ? "resolved" : "dismissed"}`);
      setActionDialog(null);
      setActionReason("");
      await loadRisks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error("Action failed", { description: msg });
    } finally {
      setActionLoading(false);
    }
  }

  const openRisks = risks.filter(r => r.status === "open");
  const closedRisks = risks.filter(r => r.status !== "open");
  const displayRisks = showResolved ? risks : openRisks;

  const highCount = openRisks.filter(r => r.severity === "high").length;
  const mediumCount = openRisks.filter(r => r.severity === "medium").length;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Risk Radar</h3>
          {openRisks.length > 0 && (
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
              {openRisks.length} open
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {closedRisks.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => setShowResolved(!showResolved)}
            >
              {showResolved ? "Hide resolved" : `Show all (${risks.length})`}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={runScan}
            disabled={scanning}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
            Scan
          </Button>
        </div>
      </div>

      {/* Summary chips */}
      {openRisks.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          {highCount > 0 && (
            <span className="text-destructive font-medium">{highCount} high</span>
          )}
          {mediumCount > 0 && (
            <span className="text-amber-600 font-medium">{mediumCount} medium</span>
          )}
          {openRisks.length - highCount - mediumCount > 0 && (
            <span className="text-muted-foreground">{openRisks.length - highCount - mediumCount} low</span>
          )}
        </div>
      )}

      {/* Loading */}
      {(loading || scanning) && (
        <div className="space-y-2">
          <div className="h-12 bg-muted rounded animate-pulse" />
          <div className="h-12 bg-muted rounded animate-pulse" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !scanning && displayRisks.length === 0 && (
        <div className="text-center py-6">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {risks.length === 0
              ? 'No risks detected. Click "Scan" to run a check.'
              : "All risks have been addressed."}
          </p>
        </div>
      )}

      {/* Risk list */}
      {!loading && !scanning && displayRisks.length > 0 && (
        <div className="space-y-2">
          {displayRisks.map((risk) => {
            const RiskIcon = RISK_CODE_ICONS[risk.risk_code] || AlertTriangle;
            const sevConfig = SEVERITY_CONFIG[risk.severity as keyof typeof SEVERITY_CONFIG] || SEVERITY_CONFIG.low;
            const statusConfig = STATUS_CONFIG[risk.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.open;

            return (
              <div
                key={risk.risk_item_id}
                className={`rounded-md border p-3 space-y-2 ${
                  risk.status === "open" ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-75"
                }`}
              >
                {/* Risk header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <RiskIcon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{risk.title}</span>
                        <Badge variant="outline" className={`text-[10px] ${sevConfig.badgeClass}`}>
                          {sevConfig.label}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] ${statusConfig.badgeClass}`}>
                          {statusConfig.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {risk.description}
                      </p>
                    </div>
                  </div>
                  <code className="text-[10px] text-muted-foreground shrink-0 font-mono">
                    {risk.risk_code}
                  </code>
                </div>

                {/* AI explanation */}
                {risk.explanation_text && (
                  <div className="bg-muted/50 rounded px-2.5 py-1.5 text-xs text-muted-foreground italic">
                    {risk.explanation_text}
                  </div>
                )}

                {/* Suggested action */}
                {risk.suggested_action && (
                  <div className="flex items-center gap-1.5 text-xs text-primary">
                    <ExternalLink className="h-3 w-3" />
                    <span>{risk.suggested_action}</span>
                  </div>
                )}

                {/* Resolution reason */}
                {risk.status !== "open" && (risk.resolved_reason || risk.dismissed_reason) && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Reason:</span> {risk.resolved_reason || risk.dismissed_reason}
                  </div>
                )}

                {/* Actions for open risks */}
                {risk.status === "open" && (
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        setActionDialog({ type: "resolve", risk });
                        setActionReason("");
                      }}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1 text-muted-foreground"
                      onClick={() => {
                        setActionDialog({ type: "dismiss", risk });
                        setActionReason("");
                      }}
                    >
                      <XCircle className="h-3 w-3" />
                      Dismiss
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Resolve/Dismiss Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "resolve" ? "Resolve Risk" : "Dismiss Risk"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">
              <span className="font-medium">{actionDialog?.risk.title}</span>
              <p className="text-muted-foreground text-xs mt-1">{actionDialog?.risk.description}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">
                Reason <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                placeholder={
                  actionDialog?.type === "resolve"
                    ? "Describe how this risk was addressed..."
                    : "Explain why this risk is not applicable..."
                }
                className="mt-1.5"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={!actionReason.trim() || actionLoading}
              variant={actionDialog?.type === "resolve" ? "default" : "secondary"}
            >
              {actionLoading
                ? "Saving..."
                : actionDialog?.type === "resolve"
                ? "Resolve"
                : "Dismiss"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

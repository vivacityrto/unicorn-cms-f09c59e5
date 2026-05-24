import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useClientPreview, type ActingUserOption } from "@/contexts/ClientPreviewContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, ChevronDown, MonitorPlay, GraduationCap, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { TenantType } from "@/contexts/TenantTypeContext";

interface ViewAsClientButtonProps {
  tenantId: number;
  tenantName: string;
  tenantType?: TenantType;
  compact?: boolean;
}

export function ViewAsClientButton({
  tenantId,
  tenantName,
  tenantType = "compliance_system",
  compact = false,
}: ViewAsClientButtonProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { startPreview, canUsePreview, loading, fetchActingUserOptions } = useClientPreview();
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [selectedMode, setSelectedMode] = useState<"portal" | "academy">("portal");
  const [isStarting, setIsStarting] = useState(false);
  const [actingOptions, setActingOptions] = useState<ActingUserOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selectedActingId, setSelectedActingId] = useState<string | null>(null);

  const hasAcademyAccess = tenantType.startsWith("academy_") || tenantType === "compliance_system";
  const isAcademyOnly = tenantType.startsWith("academy_");

  if (!canUsePreview) {
    return null;
  }

  const handleViewClient = async (mode: "portal" | "academy") => {
    setSelectedMode(mode);

    if (mode === "academy" || isAcademyOnly) {
      // Guardrail: staff predicate check
      if (profile && profile.is_vivacity_internal === false) {
        toast.error("Academy impersonation unavailable", {
          description:
            "Your account isn't configured for Academy impersonation. Contact a workspace admin to enable is_vivacity_internal on your profile.",
        });
        return;
      }
      // Pre-fetch acting user options before opening dialog
      setOptionsLoading(true);
      setReasonDialogOpen(true);
      try {
        const opts = await fetchActingUserOptions(tenantId);
        setActingOptions(opts);
        const def = opts.find((o) => o.is_default) ?? opts[0] ?? null;
        setSelectedActingId(def?.user_uuid ?? null);
      } finally {
        setOptionsLoading(false);
      }
    } else {
      setIsStarting(true);
      try {
        const success = await startPreview(tenantId, undefined, null);
        if (success) {
          toast.success(`Now viewing as ${tenantName}`, {
            description: "You're in preview mode",
          });
          navigate("/client-preview");
        } else {
          toast.error("Failed to start preview", {
            description: "Could not initiate client preview mode",
          });
        }
      } catch (error) {
        console.error("Error starting preview:", error);
        toast.error("Failed to start preview");
      } finally {
        setIsStarting(false);
      }
    }
  };

  const handleStartPreview = async () => {
    setIsStarting(true);
    try {
      const acting = selectedMode === "academy" || isAcademyOnly ? selectedActingId : null;
      const success = await startPreview(tenantId, reason || undefined, acting);

      if (success) {
        setReasonDialogOpen(false);
        setReason("");

        toast.success(`Now viewing as ${tenantName}`, {
          description: "You're in preview mode",
        });

        if (selectedMode === "academy" || isAcademyOnly) {
          navigate("/academy");
        } else {
          navigate("/client-preview");
        }
      } else {
        toast.error("Failed to start preview", {
          description: "Could not initiate client preview mode",
        });
      }
    } catch (error) {
      console.error("Error starting preview:", error);
      toast.error("Failed to start preview");
    } finally {
      setIsStarting(false);
    }
  };

  const showAcademyPicker = selectedMode === "academy" || isAcademyOnly;
  const noUsersAvailable = showAcademyPicker && !optionsLoading && actingOptions.length === 0;
  const confirmDisabled =
    isStarting || (showAcademyPicker && (optionsLoading || noUsersAvailable || !selectedActingId));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size={compact ? "sm" : "default"}
            disabled={loading}
            className="gap-2"
          >
            <Eye className="h-4 w-4" />
            {!compact && "View as Client"}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {!isAcademyOnly && (
            <DropdownMenuItem onClick={() => handleViewClient("portal")} className="gap-2">
              <MonitorPlay className="h-4 w-4" />
              <div className="flex flex-col">
                <span>View Client Portal</span>
                <span className="text-xs text-muted-foreground">Full compliance experience</span>
              </div>
            </DropdownMenuItem>
          )}

          {hasAcademyAccess && (
            <DropdownMenuItem onClick={() => handleViewClient("academy")} className="gap-2">
              <GraduationCap className="h-4 w-4" />
              <div className="flex flex-col">
                <span>View Vivacity Academy</span>
                <span className="text-xs text-muted-foreground">Training platform view</span>
              </div>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem disabled className="gap-2 text-muted-foreground">
            <ExternalLink className="h-4 w-4" />
            <span className="text-xs">Opens in-app preview</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              View as Client
            </DialogTitle>
            <DialogDescription>
              You're about to preview the client experience for <strong>{tenantName}</strong>.
              This action will be logged for audit purposes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for preview (optional)</Label>
              <Textarea
                id="reason"
                placeholder="e.g., Investigating support ticket #123, training new team member..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This will be recorded in the audit log for compliance tracking.
              </p>
            </div>

            {showAcademyPicker && (
              <div className="space-y-2">
                <Label htmlFor="acting-as">Acting as</Label>
                {optionsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading users…
                  </div>
                ) : noUsersAvailable ? (
                  <p className="text-sm text-destructive">
                    No users on this tenant yet — invite one before previewing Academy.
                  </p>
                ) : (
                  <Select
                    value={selectedActingId ?? undefined}
                    onValueChange={(v) => setSelectedActingId(v)}
                  >
                    <SelectTrigger id="acting-as">
                      <SelectValue placeholder="Select user" />
                    </SelectTrigger>
                    <SelectContent>
                      {actingOptions.map((opt) => (
                        <SelectItem key={opt.user_uuid} value={opt.user_uuid}>
                          {opt.full_name}
                          {opt.is_default ? " (Primary contact)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartPreview} disabled={confirmDisabled}>
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Start Preview
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useClientPreview } from "@/contexts/ClientPreviewContext";
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
  const { startPreview, canUsePreview, loading } = useClientPreview();
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [selectedMode, setSelectedMode] = useState<"portal" | "academy">("portal");
  const [isStarting, setIsStarting] = useState(false);

  // Check if tenant has academy access
  const hasAcademyAccess = tenantType.startsWith("academy_") || tenantType === "compliance_system";
  const isAcademyOnly = tenantType.startsWith("academy_");

  if (!canUsePreview) {
    return null;
  }

  const handleViewClient = (mode: "portal" | "academy") => {
    setSelectedMode(mode);
    setReasonDialogOpen(true);
  };

  const handleStartPreview = async () => {
    setIsStarting(true);
    try {
      const success = await startPreview(tenantId, reason || undefined);
      
      if (success) {
        setReasonDialogOpen(false);
        setReason("");
        
        toast.success(`Now viewing as ${tenantName}`, {
          description: "You're in read-only preview mode",
        });

        // Navigate to the appropriate preview route
        if (selectedMode === "academy" || isAcademyOnly) {
          navigate("/client-preview/academy");
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
          {/* Always show Client Portal option unless academy-only */}
          {!isAcademyOnly && (
            <DropdownMenuItem onClick={() => handleViewClient("portal")} className="gap-2">
              <MonitorPlay className="h-4 w-4" />
              <div className="flex flex-col">
                <span>View Client Portal</span>
                <span className="text-xs text-muted-foreground">Full compliance experience</span>
              </div>
            </DropdownMenuItem>
          )}

          {/* Show Academy option if available */}
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

      {/* Reason Dialog */}
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

            <div className="rounded-lg bg-muted p-3 text-sm space-y-2">
              <p className="font-medium">Preview Mode Restrictions:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Read-only access - no changes can be made</li>
                <li>Actions are blocked in preview mode</li>
                <li>Session is logged with start/end times</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartPreview} disabled={isStarting}>
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

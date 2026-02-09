import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface AskVivFlagModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string | null) => void;
  isSubmitting: boolean;
  clientName: string;
}

/**
 * AskVivFlagModal - Quick modal to capture optional reason for flagging
 */
export function AskVivFlagModal({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  clientName,
}: AskVivFlagModalProps) {
  const [reason, setReason] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(reason.trim() || null);
  }

  function handleClose() {
    if (!isSubmitting) {
      setReason("");
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-4 w-4" />
            Flag for CSC review
          </DialogTitle>
          <DialogDescription>
            Mark this AI interaction for CSC follow-up for <strong>{clientName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-sm font-medium">
                Reason <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="reason"
                placeholder="Why should CSC review this?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="resize-none"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Flagging...
                </>
              ) : (
                <>
                  <Flag className="h-4 w-4 mr-2" />
                  Flag
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

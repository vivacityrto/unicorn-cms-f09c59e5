import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

type SelectedInvite = {
  id: string;
  email: string;
  tenant_id: number;
  last_sent_at?: string | null;
};

const RECENT_ACTION_THRESHOLD_SECONDS = 120;

function secondsSince(iso?: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / 1000));
}

type ReInviteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedInvites: SelectedInvite[];
  tenantNames?: Map<number, string>;
  onComplete?: () => void;
};

export default function ReInviteDialog({
  open,
  onOpenChange,
  selectedInvites,
  tenantNames,
  onComplete,
}: ReInviteDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedInvites.length === 0) {
      toast.error("No invitations selected");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      const results = await Promise.allSettled(
        selectedInvites.map((invite) =>
          supabase.functions.invoke("resend-invite", {
            body: { invitation_id: invite.id },
            headers,
          })
        )
      );

      const failures = results.filter(
        (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.error)
      );

      if (failures.length === 0) {
        toast.success(
          `${selectedInvites.length} invitation(s) re-sent successfully!`
        );
        onComplete?.();
        onOpenChange(false);
      } else if (failures.length < selectedInvites.length) {
        toast.warning(
          `${selectedInvites.length - failures.length} re-sent, ${failures.length} failed.`
        );
        onComplete?.();
      } else {
        toast.error("Failed to re-send invitation(s)");
      }
    } catch (error: any) {
      console.error("Error re-inviting user:", error);
      toast.error(error.message || "Failed to re-send invitation");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] border-[3px] border-[#dfdfdf]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserPlus className="h-5 w-5" />
            Re-invite User{selectedInvites.length > 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Re-send {selectedInvites.length} selected invitation
            {selectedInvites.length === 1 ? "" : "s"}. A fresh token and a new
            7-day expiry will be issued.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y">
            {selectedInvites.map((invite) => (
              <div key={invite.id} className="px-3 py-2 text-sm">
                <div className="font-medium text-foreground">{invite.email}</div>
                <div className="text-xs text-muted-foreground">
                  {tenantNames?.get(invite.tenant_id) || `Tenant #${invite.tenant_id}`}
                </div>
              </div>
            ))}
            {selectedInvites.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                No invitations selected.
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSubmitting || selectedInvites.length === 0}
            >
              {isSubmitting ? "Sending..." : "Re-send Invitation"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

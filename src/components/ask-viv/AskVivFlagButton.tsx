import { useState } from "react";
import { Flag, Loader2, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AskVivFlagModal } from "./AskVivFlagModal";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { ScopeLock } from "./AskVivScopeBanner";

interface AskVivFlagButtonProps {
  scopeLock: ScopeLock;
  aiInteractionLogId: string | null;
  tenantId: number;
  className?: string;
}

/**
 * AskVivFlagButton - Two distinct actions on an Ask Viv answer (Phase 7):
 *
 * - "Flag for review": a lightweight quality flag into ai_review_flags,
 *   for whoever owns Ask Viv's quality — unchanged from the original
 *   single-button behaviour.
 * - "Escalate to my Team Leader": a genuine escalation. Looks up the
 *   caller's own manager (users.manager_uuid — confirmed populated for
 *   every internal staff role, unlike clients_legacy.manager which is
 *   dead) and writes a real in-app notification via user_notifications,
 *   so it actually reaches someone rather than sitting on a page nobody
 *   opens.
 *
 * Only visible when:
 * - mode = compliance
 * - scope_lock.client.id is not null
 * - aiInteractionLogId is available
 */
export function AskVivFlagButton({
  scopeLock,
  aiInteractionLogId,
  tenantId,
  className,
}: AskVivFlagButtonProps) {
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFlagged, setIsFlagged] = useState(false);
  const [isEscalating, setIsEscalating] = useState(false);
  const [isEscalated, setIsEscalated] = useState(false);

  // Only show if client scope exists and we have an interaction log id
  if (!scopeLock.client.id || !aiInteractionLogId) {
    return null;
  }

  async function handleFlag(reason: string | null) {
    if (!user?.id || !aiInteractionLogId) return;

    setIsSubmitting(true);

    try {
      const { error } = await supabase.from("ai_review_flags").insert({
        tenant_id: tenantId,
        client_id: parseInt(scopeLock.client.id!, 10),
        package_id: scopeLock.package.id ? parseInt(scopeLock.package.id, 10) : null,
        phase_id: scopeLock.phase.id ? parseInt(scopeLock.phase.id, 10) : null,
        ai_interaction_log_id: aiInteractionLogId,
        flagged_by: user.id,
        flagged_reason: reason || null,
      });

      if (error) {
        console.error("Failed to create flag:", error);
        toast({
          title: "Failed to flag",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      setIsFlagged(true);
      setModalOpen(false);
      toast({
        title: "Flagged for review",
        description: "This interaction has been marked for Ask Viv quality follow-up.",
      });
    } catch (err) {
      console.error("Error flagging interaction:", err);
      toast({
        title: "Error",
        description: "Failed to flag this interaction.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEscalate() {
    if (!user?.id || !aiInteractionLogId) return;

    setIsEscalating(true);

    try {
      const { data: me, error: meError } = await supabase
        .from("users")
        .select("manager_uuid, first_name, last_name")
        .eq("user_uuid", user.id)
        .maybeSingle();

      if (meError || !me?.manager_uuid) {
        toast({
          title: "No Team Leader on file",
          description: "Your account doesn't have a manager assigned to escalate to. Contact your Team Leader directly.",
          variant: "destructive",
        });
        return;
      }

      const staffName = [me.first_name, me.last_name].filter(Boolean).join(" ") || "A team member";
      const clientLabel = scopeLock.client.label || "a client";

      const { error: notifyError } = await supabase.from("user_notifications").insert({
        user_id: me.manager_uuid,
        tenant_id: tenantId,
        type: "ask_viv_escalation",
        title: "Ask Viv escalation",
        message: `${staffName} escalated an Ask Viv answer about ${clientLabel} for your review.`,
        link: `/tenant/${tenantId}`,
        created_by: user.id,
        metadata: { ai_interaction_log_id: aiInteractionLogId, tenant_id: tenantId },
      });

      if (notifyError) {
        console.error("Failed to escalate:", notifyError);
        toast({
          title: "Failed to escalate",
          description: notifyError.message,
          variant: "destructive",
        });
        return;
      }

      setIsEscalated(true);
      toast({
        title: "Escalated to your Team Leader",
        description: "They've been notified and can review this from their notifications.",
      });
    } catch (err) {
      console.error("Error escalating interaction:", err);
      toast({
        title: "Error",
        description: "Failed to escalate this interaction.",
        variant: "destructive",
      });
    } finally {
      setIsEscalating(false);
    }
  }

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {isFlagged ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Flag className="h-3 w-3" />
          <span>Flagged for review</span>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setModalOpen(true)}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Flag className="h-3 w-3 mr-1" />
          )}
          Flag for review
        </Button>
      )}

      {isEscalated ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ArrowUpCircle className="h-3 w-3" />
          <span>Escalated to your Team Leader</span>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleEscalate}
          disabled={isEscalating}
        >
          {isEscalating ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <ArrowUpCircle className="h-3 w-3 mr-1" />
          )}
          Escalate to my Team Leader
        </Button>
      )}

      <AskVivFlagModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleFlag}
        isSubmitting={isSubmitting}
        clientName={scopeLock.client.label || "Unknown client"}
      />
    </div>
  );
}

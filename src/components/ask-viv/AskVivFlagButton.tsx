import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
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
 * AskVivFlagButton - Flags an AI interaction for CSC review
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
        title: "Flagged for CSC review",
        description: "This interaction has been marked for follow-up.",
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

  if (isFlagged) {
    return (
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Flag className="h-3 w-3" />
        <span>Flagged for CSC review</span>
      </div>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-7 text-xs text-muted-foreground hover:text-foreground", className)}
        onClick={() => setModalOpen(true)}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        ) : (
          <Flag className="h-3 w-3 mr-1" />
        )}
        Flag for CSC review
      </Button>

      <AskVivFlagModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSubmit={handleFlag}
        isSubmitting={isSubmitting}
        clientName={scopeLock.client.label || "Unknown client"}
      />
    </>
  );
}

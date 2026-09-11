import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useToast } from "@/hooks/use-toast";
import { userCapacityKeys } from "@/hooks/useUserCapacity";
import {
  sendClientInvite,
  type InviteInput,
} from "@/features/client-identity/sendClientInvite";
import { resendClientInvite } from "@/features/client-identity/resendClientInvite";
import { revokeClientInvite } from "@/features/client-identity/revokeClientInvite";
import { copyClientInviteLink } from "@/features/client-identity/copyClientInviteLink";
import { resetClientPassword } from "@/features/client-identity/resetClientPassword";

export type { InviteAccessLevel } from "@/features/client-identity/invite-policy";
export type { InviteInput } from "@/features/client-identity/sendClientInvite";

interface EdgeError {
  ok?: boolean;
  code?: string;
  detail?: string;
}

async function extractEdgeError(err: unknown): Promise<EdgeError | null> {
  if (!err || typeof err !== "object") return null;
  const ctx = (err as { context?: unknown }).context;
  if (!ctx || typeof ctx !== "object") return null;
  const response = ctx as Response;
  try {
    if (typeof response.json === "function") {
      return (await response.json()) as EdgeError;
    }
    if (typeof response.text === "function") {
      return JSON.parse(await response.text()) as EdgeError;
    }
  } catch {
    // body already consumed or not JSON — fall through
  }
  return null;
}

export function useInviteMutations() {
  const { activeTenantId } = useClientTenant();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["client_tenant_users", activeTenantId] });
    void queryClient.invalidateQueries({ queryKey: userCapacityKeys.tenant(activeTenantId ?? null) });
  };

  const invite = useMutation({
    mutationFn: (input: InviteInput) => sendClientInvite(activeTenantId, input),
    onSuccess: (_data, input) => {
      toast({ title: "Invitation sent", description: `An email is on its way to ${input.email.trim()}.` });
      invalidate();
    },
  });

  const resend = useMutation({
    mutationFn: resendClientInvite,
    onSuccess: () => {
      toast({ title: "Invitation re-sent", description: "We've sent a fresh email with a new link." });
      invalidate();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Couldn't resend", description: err.message });
    },
  });

  const revoke = useMutation({
    mutationFn: revokeClientInvite,
    onSuccess: () => {
      toast({ title: "Invitation revoked", description: "The link in their email will no longer work." });
      invalidate();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Couldn't revoke", description: err.message });
    },
  });

  const copyLink = useMutation({
    mutationFn: copyClientInviteLink,
    onSuccess: async (data) => {
      try {
        await navigator.clipboard.writeText(data.action_link);
        toast({
          title: "Link copied",
          description: "Paste it into Teams, email, or WhatsApp.",
        });
      } catch {
        toast({ title: "Link ready", description: data.action_link });
      }
      invalidate();
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Couldn't copy link", description: err.message });
    },
  });

  const resetPassword = useMutation({
    mutationFn: resetClientPassword,
    onSuccess: (data) => {
      toast({
        title: "Password reset sent",
        description: data?.email
          ? `Reset email sent to ${data.email}.`
          : "Reset email sent.",
      });
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === "AUTH_USER_NOT_FOUND") {
        toast({
          title: "Account not activated",
          description:
            "This user hasn't activated their account yet — resend their invitation instead.",
        });
        return;
      }
      toast({
        variant: "destructive",
        title: "Couldn't send reset email",
        description: err.message,
      });
    },
  });

  return { invite, resend, revoke, copyLink, resetPassword };
}

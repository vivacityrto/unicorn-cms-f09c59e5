import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { resendClientInvite } from "@/features/client-identity/resendClientInvite";
import { revokeClientInvite } from "@/features/client-identity/revokeClientInvite";
import { copyClientInviteLink } from "@/features/client-identity/copyClientInviteLink";
import { resetClientPassword } from "@/features/client-identity/resetClientPassword";
import { academyTenantUsersKey } from "./useAcademyTenantUsers";

/**
 * Same underlying resend/revoke/copy-link/reset-password commands as the
 * client portal's useInviteMutations, but parameterised by an explicit
 * tenantId (a superadmin session has no "active tenant" context) rather than
 * ClientTenantContext.
 */
export function useAcademyInviteMutations(tenantId: number | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: academyTenantUsersKey(tenantId) });
  };

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
        toast({ title: "Link copied", description: "Paste it into Teams, email, or WhatsApp." });
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
        description: data?.email ? `Reset email sent to ${data.email}.` : "Reset email sent.",
      });
    },
    onError: (err: Error & { code?: string }) => {
      if (err.code === "AUTH_USER_NOT_FOUND") {
        toast({
          title: "Account not activated",
          description: "This user hasn't activated their account yet — resend their invitation instead.",
        });
        return;
      }
      toast({ variant: "destructive", title: "Couldn't send reset email", description: err.message });
    },
  });

  return { resend, revoke, copyLink, resetPassword };
}

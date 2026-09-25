import type { UseMutationResult } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useInviteMutations } from "./useInviteMutations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invitationId: string | null;
  email: string | null;
  /**
   * Override the revoke mutation used — needed by callers with no
   * ClientTenantContext (e.g. the superadmin Academy views), which can't
   * rely on useInviteMutations' activeTenantId-scoped cache invalidation.
   * Defaults to the client-portal context's own mutation.
   */
  revoke?: UseMutationResult<unknown, Error, string>;
}

export default function RevokeInviteAlert({ open, onOpenChange, invitationId, email, revoke: revokeOverride }: Props) {
  const { revoke: revokeFromContext } = useInviteMutations();
  const revoke = revokeOverride ?? revokeFromContext;

  const handleConfirm = async () => {
    if (!invitationId) return;
    try {
      await revoke.mutateAsync(invitationId);
      onOpenChange(false);
    } catch {
      // toast handled in hook; keep dialog open so user sees the error toast
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke invitation?</AlertDialogTitle>
          <AlertDialogDescription>
            {email
              ? `${email} won't be able to use the link sent to them.`
              : "They won't be able to use the link sent to them."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={revoke.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={revoke.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {revoke.isPending ? "Revoking..." : "Revoke"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

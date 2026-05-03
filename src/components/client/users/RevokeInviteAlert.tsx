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
}

export default function RevokeInviteAlert({ open, onOpenChange, invitationId, email }: Props) {
  const { revoke } = useInviteMutations();

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

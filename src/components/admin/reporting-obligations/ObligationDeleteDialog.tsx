import { ConfirmDialog } from "@/components/ui/modals";
import { toast } from "@/hooks/use-toast";
import {
  type ReportingObligationRow,
  useDeleteReportingObligation,
} from "@/hooks/admin/use-reporting-obligations";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  obligation: ReportingObligationRow | null;
}

export function ObligationDeleteDialog({ open, onOpenChange, obligation }: Props) {
  const del = useDeleteReportingObligation();

  const handleConfirm = async () => {
    if (!obligation) return;
    try {
      await del.mutateAsync(obligation.id);
      toast({ title: "Obligation deleted", description: obligation.title });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete reporting obligation?"
      description="This permanently removes the obligation. Clients will stop seeing it and no further notifications will be queued."
      itemName={obligation?.title}
      confirmText="Delete"
      variant="destructive"
      isLoading={del.isPending}
      onConfirm={handleConfirm}
    />
  );
}

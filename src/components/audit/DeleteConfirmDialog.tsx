import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  itemName?: string;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  onConfirm,
  isDeleting,
}: DeleteConfirmDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      itemName={itemName}
      onConfirm={onConfirm}
      confirmText={isDeleting ? "Deleting..." : "Delete"}
      isLoading={isDeleting}
      variant="destructive"
    />
  );
}

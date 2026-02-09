import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface DeleteMeetingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingTitle: string;
  onConfirm: () => void;
  isDeleting?: boolean;
}

export function DeleteMeetingDialog({
  open,
  onOpenChange,
  meetingTitle,
  onConfirm,
  isDeleting,
}: DeleteMeetingDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Meeting"
      description="Are you sure you want to delete this meeting? This action cannot be undone and will remove all associated data including agenda items, notes, and segments."
      itemName={meetingTitle}
      onConfirm={onConfirm}
      confirmText={isDeleting ? 'Deleting...' : 'Delete Meeting'}
      isLoading={isDeleting}
      variant="destructive"
    />
  );
}

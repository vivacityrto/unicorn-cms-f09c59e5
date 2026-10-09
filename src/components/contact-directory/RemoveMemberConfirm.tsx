import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { parseRowKey, removePersonFromGroup } from '@/services/contactGroupsService';

export interface RemoveMemberRequest {
  groupId: number;
  groupName: string;
  /** Directory row key, e.g. `user:12` or `contact:5`. */
  memberKey: string;
  memberName: string;
}

interface Props {
  request: RemoveMemberRequest | null;
  onClose: () => void;
  /** Called after the person has been removed, so the caller can refresh its lists. */
  onRemoved: () => void;
}

/** Confirms, then removes one person from one group. They stay in the directory. */
export function RemoveMemberConfirm({ request, onClose, onRemoved }: Props) {
  const [removing, setRemoving] = useState(false);

  const confirm = async () => {
    if (!request) return;
    const parsed = parseRowKey(request.memberKey);
    if (!parsed) {
      toast.error('Could not identify that person');
      return;
    }
    setRemoving(true);
    const result = await removePersonFromGroup(request.groupId, parsed.source, parsed.id);
    setRemoving(false);
    if (result.ok === false) {
      toast.error(result.message);
      return;
    }
    toast.success(`Removed ${request.memberName} from ${request.groupName}`);
    onRemoved();
    onClose();
  };

  return (
    <AlertDialog open={!!request} onOpenChange={(open) => !open && !removing && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove from group?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove {request?.memberName} from "{request?.groupName}". They stay in the Contact Directory. Teams
            registrations they already hold are not changed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={removing}>
            {removing ? 'Removing…' : 'Remove'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

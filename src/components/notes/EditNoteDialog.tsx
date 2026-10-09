import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { NoteFormDialog, NoteFormData } from './NoteFormDialog';
import { format } from 'date-fns';
import { mergeNoteAttachments, uploadNoteAttachments } from '@/lib/noteAttachments';

interface EditNoteDialogProps {
  noteId: string;
  tenantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function EditNoteDialog({ noteId, tenantId, open, onOpenChange, onSaved }: EditNoteDialogProps) {
  const { toast } = useToast();

  const handleSave = useCallback(async (data: NoteFormData) => {
    try {
      // Upload new files
      const uploaded = await uploadNoteAttachments(tenantId, data.uploadedFiles);

      const convert12To24 = (t: { hour: string; minute: string; period: string }) => {
        let h = parseInt(t.hour);
        if (t.period === 'PM' && h !== 12) h += 12;
        if (t.period === 'AM' && h === 12) h = 0;
        return `${h.toString().padStart(2, '0')}:${t.minute}`;
      };

      const { paths: allPaths, names: allNames } = mergeNoteAttachments(data.existingFiles, data.filesToRemove, uploaded);

      const updateData: Record<string, unknown> = {
        title: data.title.trim() || null,
        note_details: data.content.trim(),
        note_type: data.noteType || null,
        priority: data.priority || null,
        status: data.status || null,
        is_pinned: data.isPinned,
        started_date: data.startedDate && data.startedTime ? `${format(data.startedDate, 'yyyy-MM-dd')}T${convert12To24(data.startedTime)}:00` : null,
        completed_date: data.completedDate && data.completedTime ? `${format(data.completedDate, 'yyyy-MM-dd')}T${convert12To24(data.completedTime)}:00` : null,
        uploaded_files: allPaths.length > 0 ? allPaths : null,
        file_names: allNames.length > 0 ? allNames : null,
        assignees: data.assignees.length > 0 ? data.assignees : null,
      };

      if (data.duration) {
        updateData.duration = parseInt(data.duration, 10) || 0;
      }

      // Handle package reassignment
      if (data.packageInstanceId && data.packageInstanceId !== 'none') {
        updateData.parent_type = 'package_instance';
        updateData.parent_id = parseInt(data.packageInstanceId, 10);
      }

      const { error } = await supabase.from('notes').update(updateData as never).eq('id', noteId);
      if (error) throw error;

      toast({ title: 'Note updated' });
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  }, [noteId, tenantId, toast, onSaved, onOpenChange]);

  return (
    <NoteFormDialog
      open={open}
      onOpenChange={onOpenChange}
      tenantId={tenantId}
      mode="edit"
      noteId={noteId}
      onSave={handleSave}
      showPackageSelector={true}
      showStatus={true}
      showAssignees={false}
      showNotify={false}
      showPin={true}
      showSpeech={true}
      showAiTitle={false}
      showDuration={true}
    />
  );
}

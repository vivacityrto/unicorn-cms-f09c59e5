import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const MAX_NOTE_LENGTH = 45;

interface TaskNotesPopoverProps {
  taskId: number;
  notes: string | null;
  tenantId: number;
  packageId: number;
  stageInstanceId: number;
  stageName?: string;
  taskName?: string;
  onSaved: () => void;
}

export function TaskNotesPopover({ taskId, notes, tenantId, packageId, stageInstanceId, stageName, taskName, onSaved }: TaskNotesPopoverProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(notes || '');
  const [saving, setSaving] = useState(false);
  const [showNotePrompt, setShowNotePrompt] = useState(false);
  const [savedText, setSavedText] = useState('');

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setText(notes || '');
    }
    setOpen(isOpen);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('staff_task_instances')
        .update({ notes: text || null })
        .eq('id', taskId);

      if (error) throw error;

      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: 'staff_task_notes_updated',
        entity_type: 'staff_task_instances',
        entity_id: taskId.toString(),
        before_data: { notes },
        after_data: { notes: text || null },
        details: { package_id: packageId, stage_instance_id: stageInstanceId },
      });

      toast({ title: 'Notes saved' });
      setOpen(false);
      onSaved();

      // Prompt to create package note if text is non-empty
      if (text.trim()) {
        setSavedText(text.trim());
        setShowNotePrompt(true);
      }
    } catch (error: any) {
      console.error('Error saving task notes:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePackageNote = async () => {
    const noteTitle = `${stageName || 'Stage'} > ${taskName || 'Task'}: ${savedText}`;
    try {
      const { error } = await supabase.from('notes').insert({
        tenant_id: tenantId,
        package_id: packageId,
        parent_type: 'package_instance',
        parent_id: stageInstanceId,
        title: noteTitle,
        note_details: '',
        note_type: 'general',
        created_by: profile?.user_uuid,
      });

      if (error) throw error;

      toast({ title: 'Package note created' });
    } catch (error: any) {
      console.error('Error creating package note:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setShowNotePrompt(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            title="Task notes"
          >
            <Pencil className={`h-3 w-3 ${notes ? 'text-primary' : 'text-muted-foreground'}`} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-3" align="end">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium truncate">Note: {stageName || 'Stage'} &gt; {taskName || 'Task'}</label>
              <span className={`text-[10px] ${text.length > MAX_NOTE_LENGTH ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                {text.length}/{MAX_NOTE_LENGTH}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Limited to {MAX_NOTE_LENGTH} characters — used as package note title.
            </p>
            <Textarea
              placeholder="Add notes..."
              value={text}
              onChange={(e) => {
                if (e.target.value.length <= MAX_NOTE_LENGTH) {
                  setText(e.target.value);
                }
              }}
              rows={2}
              className="text-xs min-h-[50px]"
              maxLength={MAX_NOTE_LENGTH}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSave} disabled={saving || text.length > MAX_NOTE_LENGTH} className="h-7 text-xs">
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={showNotePrompt} onOpenChange={setShowNotePrompt}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Package Note?</AlertDialogTitle>
            <AlertDialogDescription>
              Would you like to also create a package note with the title:
              <span className="block mt-2 font-medium text-foreground text-sm">
                {stageName || 'Stage'} &gt; {taskName || 'Task'}: {savedText}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No thanks</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreatePackageNote}>Create Note</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

const BASE_NOTE_LENGTH = 45;
const EXTENDED_NOTE_LENGTH = 65;

interface TaskNotesPopoverProps {
  taskId: number;
  notes: string | null;
  tenantId: number;
  packageId: number;
  packageInstanceId?: number;
  stageInstanceId: number;
  stageName?: string;
  taskName?: string;
  onSaved: () => void;
}

export function TaskNotesPopover({ taskId, notes, tenantId, packageId, packageInstanceId, stageInstanceId, stageName, taskName, onSaved }: TaskNotesPopoverProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const navigate = useNavigate();
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

      // Prompt to create package note if text is non-empty
      if (text.trim()) {
        setSavedText(text.trim());
        setShowNotePrompt(true);
      } else {
        onSaved();
      }
    } catch (error: any) {
      console.error('Error saving task notes:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePackageNote = () => {
    const noteTitle = `${stageName || 'Stage'} > ${taskName || 'Task'}: ${savedText}`;
    const params = new URLSearchParams({
      initNote: 'true',
      noteTitle,
    });
    if (packageId) params.set('packageId', String(packageId));
    if (packageInstanceId) params.set('packageInstanceId', String(packageInstanceId));

    setShowNotePrompt(false);
    onSaved();
    navigate(`/tenant/${tenantId}/notes?${params.toString()}`);
  };

  const handleDismissPrompt = () => {
    setShowNotePrompt(false);
    onSaved();
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
              {(() => {
                const maxLen = text.includes('/') ? EXTENDED_NOTE_LENGTH : BASE_NOTE_LENGTH;
                return (
                  <span className={`text-[10px] ${text.length > maxLen ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    {text.length}/{maxLen}
                  </span>
                );
              })()}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Limited to {BASE_NOTE_LENGTH} characters — use <span className="font-mono">/</span> to extend to {EXTENDED_NOTE_LENGTH}.
            </p>
            <Textarea
              placeholder="Add notes..."
              value={text}
              onChange={(e) => {
                const maxLen = e.target.value.includes('/') ? EXTENDED_NOTE_LENGTH : BASE_NOTE_LENGTH;
                if (e.target.value.length <= maxLen) {
                  setText(e.target.value);
                }
              }}
              rows={2}
              className="text-xs min-h-[50px]"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 text-xs">
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <AlertDialog open={showNotePrompt} onOpenChange={(open) => { if (!open) handleDismissPrompt(); }}>
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

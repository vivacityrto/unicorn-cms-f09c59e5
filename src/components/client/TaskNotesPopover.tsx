import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface TaskNotesPopoverProps {
  taskId: number;
  notes: string | null;
  tenantId: number;
  packageId: number;
  stageInstanceId: number;
  onSaved: () => void;
}

export function TaskNotesPopover({ taskId, notes, tenantId, packageId, stageInstanceId, onSaved }: TaskNotesPopoverProps) {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(notes || '');
  const [saving, setSaving] = useState(false);

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
    } catch (error: any) {
      console.error('Error saving task notes:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
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
      <PopoverContent className="w-72 p-3" align="end">
        <div className="space-y-2">
          <label className="text-xs font-medium">Task Notes</label>
          <Textarea
            placeholder="Add notes..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="text-xs min-h-[60px]"
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
  );
}

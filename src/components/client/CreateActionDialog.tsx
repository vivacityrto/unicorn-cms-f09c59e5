import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

interface CreateActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  packageId?: number;
  taskName: string;
  taskId: number;
}

export function CreateActionDialog({
  open,
  onOpenChange,
  tenantId,
  packageId,
  taskName,
  taskId,
}: CreateActionDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(taskName);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: 'Title required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('ops_work_items').insert({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_at: dueDate || null,
        tenant_id: tenantId,
        package_instance_id: packageId ?? null,
        created_by: profile?.user_uuid || null,
        owner_user_uuid: profile?.user_uuid || null,
        status: 'open',
      });
      if (error) throw error;

      // Audit log
      await supabase.from('client_audit_log').insert({
        tenant_id: tenantId,
        actor_user_id: profile?.user_uuid,
        action: 'ops_action_created_from_task',
        entity_type: 'ops_work_items',
        entity_id: title.trim(),
        details: { source_task_id: taskId, package_id: packageId },
      });

      toast({ title: 'Action created', description: `"${title.trim()}" added to operations tracker.` });
      onOpenChange(false);
    } catch (err: any) {
      console.error('Error creating action:', err);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Action</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="action-title">Title</Label>
            <Input id="action-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="action-desc">Description</Label>
            <Textarea id="action-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="action-due">Due Date</Label>
              <Input id="action-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Create Action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

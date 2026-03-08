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
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { NotifyClientCheckbox } from './NotifyClientCheckbox';
import { notifyClientPrimaryContact } from '@/lib/notifyClient';

function stripHtmlTags(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

interface CreateActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId?: number | null;
  packageId?: number;
  taskName?: string;
  taskId?: number;
  stageName?: string;
  packageName?: string;
  taskDescription?: string | null;
}

export function CreateActionDialog({
  open,
  onOpenChange,
  tenantId,
  packageId,
  taskName,
  taskId,
  stageName,
  packageName,
  taskDescription,
}: CreateActionDialogProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { data: teamUsers = [] } = useVivacityTeamUsers();
  const [saving, setSaving] = useState(false);

  const delegatorName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Unknown';
  const composedTitle = [packageName, stageName, taskName].filter(Boolean).join(' > ');
  const strippedDesc = stripHtmlTags(taskDescription || '');
  const descSnippet = strippedDesc.length > 50 ? strippedDesc.slice(0, 50) + '…' : strippedDesc;
  const composedDescription = `Task delegated by: ${delegatorName}${descSnippet ? '\n' + descSnippet : ''}`;

  const [title, setTitle] = useState(composedTitle);
  const [description, setDescription] = useState(composedDescription);
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>([]);
  const [notifyClient, setNotifyClient] = useState(false);

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
        details: { source_task_id: taskId, package_id: packageId, notify_user_ids: notifyUserIds.length > 0 ? notifyUserIds : undefined },
      });

      toast({ title: 'Action created', description: `"${title.trim()}" added to operations tracker.` });

      // Send client notification email if requested
      if (notifyClient) {
        const creatorName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : undefined;
        notifyClientPrimaryContact({
          tenantId,
          context: 'Action Created',
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          dueDate: dueDate || undefined,
          createdByName: creatorName || undefined,
          packageId: packageId,
        });
      }

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
      <DialogContent className="sm:max-w-3xl max-h-[90vh]">
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
            <Textarea id="action-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={12} className="min-h-[200px]" />
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
          <div className="space-y-1.5 rounded-md border p-2.5 bg-muted/30">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notify (Optional)</Label>
              <NotifyClientCheckbox checked={notifyClient} onCheckedChange={setNotifyClient} />
            </div>
            <div className="grid grid-cols-2 gap-1 max-h-36 overflow-y-auto pt-0.5">
              {teamUsers.map((user) => (
                <label key={user.user_uuid} className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                  <Checkbox
                    className="h-3.5 w-3.5"
                    checked={notifyUserIds.includes(user.user_uuid)}
                    onCheckedChange={(checked) => {
                      setNotifyUserIds(prev =>
                        checked
                          ? [...prev, user.user_uuid]
                          : prev.filter(id => id !== user.user_uuid)
                      );
                    }}
                  />
                  <span>{user.first_name}</span>
                </label>
              ))}
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

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MembershipWithDetails } from '@/types/membership';

interface LogConsultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberships: MembershipWithDetails[];
  selectedMembership: MembershipWithDetails | null;
  onSubmit: (tenantId: number, packageId: number, minutes: number, notes: string) => void;
}

export function LogConsultDialog({ 
  open, 
  onOpenChange, 
  memberships, 
  selectedMembership,
  onSubmit 
}: LogConsultDialogProps) {
  const [selectedId, setSelectedId] = useState<string>(
    selectedMembership ? `${selectedMembership.tenant_id}-${selectedMembership.package_id}` : ''
  );
  const [minutes, setMinutes] = useState('30');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    if (!selectedId || !minutes) return;
    
    const [tenantId, packageId] = selectedId.split('-').map(Number);
    onSubmit(tenantId, packageId, parseInt(minutes), notes);
    
    setMinutes('30');
    setNotes('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Consultation Hours</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="membership">Client / Membership</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a membership" />
              </SelectTrigger>
              <SelectContent>
                {memberships.map(m => (
                  <SelectItem key={`${m.tenant_id}-${m.package_id}`} value={`${m.tenant_id}-${m.package_id}`}>
                    {m.tenant_name} ({m.tier.fullText})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="minutes">Duration (minutes)</Label>
            <Input
              id="minutes"
              type="number"
              min="1"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="30"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was discussed?"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedId || !minutes}>
            Log Hours
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AddNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberships: MembershipWithDetails[];
  selectedMembership: MembershipWithDetails | null;
  onSubmit: (tenantId: number, packageId: number, content: string) => void;
}

export function AddNoteDialog({
  open,
  onOpenChange,
  memberships,
  selectedMembership,
  onSubmit
}: AddNoteDialogProps) {
  const [selectedId, setSelectedId] = useState<string>(
    selectedMembership ? `${selectedMembership.tenant_id}-${selectedMembership.package_id}` : ''
  );
  const [content, setContent] = useState('');

  const handleSubmit = () => {
    if (!selectedId || !content.trim()) return;
    
    const [tenantId, packageId] = selectedId.split('-').map(Number);
    onSubmit(tenantId, packageId, content.trim());
    
    setContent('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Note</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="membership">Client / Membership</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a membership" />
              </SelectTrigger>
              <SelectContent>
                {memberships.map(m => (
                  <SelectItem key={`${m.tenant_id}-${m.package_id}`} value={`${m.tenant_id}-${m.package_id}`}>
                    {m.tenant_name} ({m.tier.fullText})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Note</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter your note..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedId || !content.trim()}>
            Add Note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberships: MembershipWithDetails[];
  selectedMembership: MembershipWithDetails | null;
  onSubmit: (tenantId: number, packageId: number, title: string, dueDate: string | null, priority: string) => void;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  memberships,
  selectedMembership,
  onSubmit
}: CreateTaskDialogProps) {
  const [selectedId, setSelectedId] = useState<string>(
    selectedMembership ? `${selectedMembership.tenant_id}-${selectedMembership.package_id}` : ''
  );
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('normal');

  const handleSubmit = () => {
    if (!selectedId || !title.trim()) return;
    
    const [tenantId, packageId] = selectedId.split('-').map(Number);
    onSubmit(tenantId, packageId, title.trim(), dueDate || null, priority);
    
    setTitle('');
    setDueDate('');
    setPriority('normal');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="membership">Client / Membership</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a membership" />
              </SelectTrigger>
              <SelectContent>
                {memberships.map(m => (
                  <SelectItem key={`${m.tenant_id}-${m.package_id}`} value={`${m.tenant_id}-${m.package_id}`}>
                    {m.tenant_name} ({m.tier.fullText})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Task Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date (optional)</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!selectedId || !title.trim()}>
            Create Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

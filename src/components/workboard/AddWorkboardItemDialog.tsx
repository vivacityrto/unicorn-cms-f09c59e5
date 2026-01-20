import { useState } from 'react';
import { ItemType, ItemPriority, PRIORITY_CONFIG } from '@/hooks/useClientWorkboard';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, Calendar as CalendarIcon, Package, Layers, UserMinus } from 'lucide-react';
import { format } from 'date-fns';

interface TeamMember {
  user_uuid: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

interface PackageOption {
  id: number;
  name: string;
}

interface StageOption {
  id: number;
  name: string;
}

interface AddWorkboardItemDialogProps {
  open: boolean;
  onClose: () => void;
  teamMembers: TeamMember[];
  packages: PackageOption[];
  stages: StageOption[];
  onCreateItem: (data: {
    title: string;
    description?: string;
    item_type?: ItemType;
    priority?: ItemPriority;
    assignee_user_id?: string;
    due_date?: string;
    package_id?: number;
    stage_id?: number;
  }) => Promise<any>;
}

export function AddWorkboardItemDialog({
  open,
  onClose,
  teamMembers,
  packages,
  stages,
  onCreateItem
}: AddWorkboardItemDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [itemType, setItemType] = useState<ItemType>('internal');
  const [priority, setPriority] = useState<ItemPriority>('medium');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [packageId, setPackageId] = useState<string>('');
  const [stageId, setStageId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setItemType('internal');
    setPriority('medium');
    setAssigneeId('');
    setDueDate(undefined);
    setPackageId('');
    setStageId('');
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;

    setSaving(true);
    const result = await onCreateItem({
      title: title.trim(),
      description: description.trim() || undefined,
      item_type: itemType,
      priority,
      assignee_user_id: assigneeId || undefined,
      due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : undefined,
      package_id: packageId ? parseInt(packageId) : undefined,
      stage_id: stageId ? parseInt(stageId) : undefined
    });
    setSaving(false);

    if (result) {
      resetForm();
      onClose();
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Action Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add details..."
              rows={3}
            />
          </div>

          {/* Item Type & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={itemType} onValueChange={(v: ItemType) => setItemType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="client">Client-facing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v: ItemPriority) => setPriority(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      <Badge variant="outline" className={config.color}>
                        {config.label}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assignee & Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Assignee</Label>
              <Select value={assigneeId || "__none__"} onValueChange={(v) => setAssigneeId(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <UserMinus className="h-4 w-4" />
                      Unassigned
                    </div>
                  </SelectItem>
                  {teamMembers.map(member => (
                    <SelectItem key={member.user_uuid} value={member.user_uuid}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback className="text-[9px]">
                            {member.first_name?.[0]}{member.last_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        {member.first_name} {member.last_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Due Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {dueDate ? format(dueDate, 'MMM d, yyyy') : 'No date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Package & Stage */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Package className="h-3.5 w-3.5" />
                Package
              </Label>
              <Select value={packageId || "__none__"} onValueChange={(v) => setPackageId(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {packages.map(pkg => (
                    <SelectItem key={pkg.id} value={pkg.id.toString()}>
                      {pkg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Layers className="h-3.5 w-3.5" />
                Stage
              </Label>
              <Select value={stageId || "__none__"} onValueChange={(v) => setStageId(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {stages.map(stage => (
                    <SelectItem key={stage.id} value={stage.id.toString()}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import { WorkboardItem, ItemStatus, ItemPriority, STATUS_CONFIG, PRIORITY_CONFIG, useWorkboardComments } from '@/hooks/useClientWorkboard';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { 
  Calendar as CalendarIcon, Package, Layers, Send, Loader2, 
  CheckCircle2, AlertTriangle, Clock, UserMinus, Trash2
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

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

interface WorkboardItemDrawerProps {
  item: WorkboardItem | null;
  open: boolean;
  onClose: () => void;
  tenantId: number;
  teamMembers: TeamMember[];
  packages: PackageOption[];
  stages: StageOption[];
  onUpdateItem: (id: string, updates: Partial<WorkboardItem>) => Promise<boolean>;
  onDeleteItem: (id: string) => Promise<boolean>;
}

export function WorkboardItemDrawer({
  item,
  open,
  onClose,
  tenantId,
  teamMembers,
  packages,
  stages,
  onUpdateItem,
  onDeleteItem
}: WorkboardItemDrawerProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [newComment, setNewComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { comments, loading: commentsLoading, addComment } = useWorkboardComments(item?.id || null);

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDescription(item.description || '');
    }
  }, [item]);

  const handleSaveTitle = async () => {
    if (!item || !title.trim() || title === item.title) return;
    await onUpdateItem(item.id, { title: title.trim() });
  };

  const handleSaveDescription = async () => {
    if (!item) return;
    await onUpdateItem(item.id, { description: description.trim() || null });
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setSaving(true);
    await addComment(newComment, tenantId);
    setNewComment('');
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!item) return;
    setDeleting(true);
    const success = await onDeleteItem(item.id);
    setDeleting(false);
    if (success) onClose();
  };

  if (!item) return null;

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-hidden flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="flex items-center gap-2">
            <Badge variant="outline" className={STATUS_CONFIG[item.status].color}>
              {STATUS_CONFIG[item.status].label}
            </Badge>
            {item.item_type === 'client' && (
              <Badge variant="secondary">Client-facing</Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 pb-6">
            {/* Title */}
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={handleSaveTitle}
                className="text-lg font-medium"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                onBlur={handleSaveDescription}
                placeholder="Add a description..."
                rows={3}
              />
            </div>

            {/* Status & Priority row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={item.status}
                  onValueChange={(value: ItemStatus) => onUpdateItem(item.id, { status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        <Badge variant="outline" className={config.color}>
                          {config.label}
                        </Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={item.priority}
                  onValueChange={(value: ItemPriority) => onUpdateItem(item.id, { priority: value })}
                >
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
                <Select
                  value={item.assignee_user_id || 'unassigned'}
                  onValueChange={(value) => onUpdateItem(item.id, {
                    assignee_user_id: value === 'unassigned' ? null : value
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">
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
                      {item.due_date ? format(new Date(item.due_date), 'MMM d, yyyy') : 'No date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={item.due_date ? new Date(item.due_date) : undefined}
                      onSelect={(date) => onUpdateItem(item.id, {
                        due_date: date ? format(date, 'yyyy-MM-dd') : null
                      })}
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
                <Select
                  value={item.package_id?.toString() || 'none'}
                  onValueChange={(value) => onUpdateItem(item.id, {
                    package_id: value === 'none' ? null : parseInt(value)
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
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
                  Phase
                </Label>
                <Select
                  value={item.stage_id?.toString() || 'none'}
                  onValueChange={(value) => onUpdateItem(item.id, {
                    stage_id: value === 'none' ? null : parseInt(value)
                  })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {stages.map(stage => (
                      <SelectItem key={stage.id} value={stage.id.toString()}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Item Type */}
            <div className="space-y-2">
              <Label>Item Type</Label>
              <Select
                value={item.item_type}
                onValueChange={(value: 'internal' | 'client') => onUpdateItem(item.id, { item_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal (Team only)</SelectItem>
                  <SelectItem value="client">Client-facing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Quick actions */}
            <div className="flex gap-2">
              {item.status !== 'done' && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onUpdateItem(item.id, { status: 'done' })}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Mark Done
                </Button>
              )}
              {item.status !== 'blocked' && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onUpdateItem(item.id, { status: 'blocked' })}
                >
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Block
                </Button>
              )}
              {item.status !== 'waiting_client' && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => onUpdateItem(item.id, { status: 'waiting_client' })}
                >
                  <Clock className="h-4 w-4 mr-1" />
                  Waiting Client
                </Button>
              )}
            </div>

            <Separator />

            {/* Comments */}
            <div className="space-y-4">
              <Label className="text-base font-medium">Comments</Label>

              {/* Comment input */}
              <div className="flex gap-2">
                <Textarea
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  rows={2}
                  className="flex-1"
                />
                <Button 
                  size="icon" 
                  onClick={handleAddComment}
                  disabled={!newComment.trim() || saving}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Comments list */}
              {commentsLoading ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  Loading comments...
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No comments yet
                </div>
              ) : (
                <div className="space-y-3">
                  {comments.map(comment => (
                    <div key={comment.id} className="flex gap-3">
                      <Avatar className="h-7 w-7 flex-shrink-0">
                        <AvatarImage src={comment.creator?.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {comment.creator?.first_name?.[0]}{comment.creator?.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {comment.creator?.first_name} {comment.creator?.last_name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {comment.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Audit info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Created {format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}</p>
              {item.completed_at && (
                <p>Completed {format(new Date(item.completed_at), 'MMM d, yyyy h:mm a')}</p>
              )}
              <p>Last updated {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}</p>
            </div>

            {/* Delete */}
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="w-full"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete Action Item
            </Button>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

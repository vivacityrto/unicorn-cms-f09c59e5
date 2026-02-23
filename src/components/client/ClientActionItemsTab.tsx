import { useState, useEffect } from 'react';
import { useClientActionItems, ActionItem } from '@/hooks/useClientManagementData';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { 
  Plus, CheckSquare, MoreHorizontal, Edit, Trash2, 
  Calendar as CalendarIcon, User, Clock, Filter, Loader2,
  CheckCircle2, Circle, AlertCircle, XCircle, PauseCircle,
  Mic, MicOff, Mail
} from 'lucide-react';
import { format, formatDistanceToNow, isPast, isToday } from 'date-fns';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';

interface ClientActionItemsTabProps {
  tenantId: number;
  clientId: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  open: { label: 'Open', icon: Circle, color: 'bg-slate-100 text-slate-700' },
  in_progress: { label: 'In Progress', icon: Clock, color: 'bg-blue-100 text-blue-700' },
  blocked: { label: 'Blocked', icon: PauseCircle, color: 'bg-red-100 text-red-700' },
  done: { label: 'Done', icon: CheckCircle2, color: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'bg-muted text-muted-foreground' }
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-slate-100 text-slate-600' },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', color: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700' }
};

export function ClientActionItemsTab({ tenantId, clientId }: ClientActionItemsTabProps) {
  const { items, loading, createItem, setStatus, updateItem, deleteItem, refresh } = useClientActionItems(tenantId, clientId);
  const speech = useSpeechToText();
  const { data: vivacityTeam = [] } = useVivacityTeamUsers();
  
  const [filter, setFilter] = useState('open');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ActionItem | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [actionStatus, setActionStatus] = useState('open');
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [ownerUserId, setOwnerUserId] = useState<string | undefined>();
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>([]);
  
  // Status options from dd_status
  const [statusOptions, setStatusOptions] = useState<{ value: string; description: string }[]>([]);
  
  // Team members for assignment
  const [teamMembers, setTeamMembers] = useState<Array<{
    user_uuid: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  }>>([]);

  useEffect(() => {
    fetchTeamMembers();
    fetchStatusOptions();
  }, []);

  const fetchTeamMembers = async () => {
    const { data } = await supabase
      .from('users')
      .select('user_uuid, first_name, last_name, avatar_url')
      .in('unicorn_role', ['Super Admin', 'Team Leader', 'Team Member'])
      .order('first_name');
    
    setTeamMembers(data || []);
  };

  const fetchStatusOptions = async () => {
    const { data } = await supabase
      .from('dd_status')
      .select('value, description, code')
      .in('code', [2, 100, 102, 103])
      .order('code');
    if (data) setStatusOptions(data.filter(s => s.value));
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('normal');
    setActionStatus('open');
    setDueDate(undefined);
    setOwnerUserId(undefined);
    setSelectedItem(null);
    setNotifyUserIds([]);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleOpenEdit = (item: ActionItem) => {
    setSelectedItem(item);
    setTitle(item.title);
    setDescription(item.description || '');
    setPriority(item.priority);
    setActionStatus(item.status || 'open');
    setDueDate(item.due_date ? new Date(item.due_date) : undefined);
    setOwnerUserId(item.owner_user_id || undefined);
    setIsAddDialogOpen(true);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    
    setSaving(true);
    try {
      if (selectedItem) {
        await updateItem(selectedItem.id, {
          title,
          description: description || null,
          priority: priority as ActionItem['priority'],
          status: actionStatus as ActionItem['status'],
          due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : null,
          owner_user_id: ownerUserId || null
        });
      } else {
        await createItem({
          title,
          description: description || undefined,
          priority,
          due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : undefined,
          owner_user_id: ownerUserId
        });

        // Send notifications to selected "Notify" users
        if (notifyUserIds.length > 0) {
          try {
            const { data: userData } = await supabase.auth.getUser();
            const currentUserId = userData.user?.id;
            if (currentUserId) {
              const { data: authorUser } = await supabase
                .from('users')
                .select('first_name, last_name')
                .eq('user_uuid', currentUserId)
                .single();
              const authorName = authorUser
                ? `${authorUser.first_name || ''} ${authorUser.last_name || ''}`.trim()
                : 'A team member';

              const notifRows = notifyUserIds
                .filter(uid => uid !== currentUserId)
                .map(uid => ({
                  user_id: uid,
                  tenant_id: tenantId,
                  title: 'Action item shared with you',
                  message: `${authorName} created an action: "${title.substring(0, 60).trim()}${title.length > 60 ? '...' : ''}"`,
                  type: 'action_shared',
                  link: `/tenant/${tenantId}`,
                  created_by: currentUserId
                }));

              if (notifRows.length > 0) {
                await supabase.from('user_notifications').insert(notifRows);
              }
            }
          } catch (notifyErr) {
            console.error('Failed to send notify notifications:', notifyErr);
          }
        }
      }
      setIsAddDialogOpen(false);
      resetForm();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    await deleteItem(selectedItem.id);
    setIsDeleteDialogOpen(false);
    setSelectedItem(null);
  };

  const handleQuickComplete = async (item: ActionItem) => {
    await setStatus(item.id, 'done');
  };

  // Filter items
  const filteredItems = items.filter(item => {
    if (filter === 'all') return true;
    if (filter === 'overdue') {
      return item.due_date && isPast(new Date(item.due_date)) && !isToday(new Date(item.due_date)) && 
             item.status !== 'done' && item.status !== 'cancelled';
    }
    return item.status === filter;
  });

  // Stats
  const openCount = items.filter(i => i.status === 'open' || i.status === 'in_progress').length;
  const overdueCount = items.filter(i => 
    i.due_date && isPast(new Date(i.due_date)) && !isToday(new Date(i.due_date)) && 
    i.status !== 'done' && i.status !== 'cancelled'
  ).length;

  if (loading && items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Action Items
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="flex items-center gap-2">
                <CheckSquare className="h-5 w-5" />
                Action Items
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{openCount} open</Badge>
                {overdueCount > 0 && (
                  <Badge variant="destructive">{overdueCount} overdue</Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[130px] h-8">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleOpenAdd}>
                <Plus className="h-4 w-4 mr-1" />
                Add Action
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>No action items{filter !== 'all' ? ` with status "${filter}"` : ''}</p>
              <p className="text-sm mt-1">Create action items to track tasks and follow-ups</p>
              <Button size="sm" className="mt-4" onClick={handleOpenAdd}>
                <Plus className="h-4 w-4 mr-1" />
                Create First Action
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {filteredItems.map(item => {
                  const statusConfig = STATUS_CONFIG[item.status];
                  const priorityConfig = PRIORITY_CONFIG[item.priority];
                  const StatusIcon = statusConfig.icon;
                  const isOverdue = item.due_date && isPast(new Date(item.due_date)) && 
                                   !isToday(new Date(item.due_date)) && 
                                   item.status !== 'done' && item.status !== 'cancelled';
                  
                  return (
                    <div 
                      key={item.id} 
                      className={`p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors ${
                        isOverdue ? 'border-red-200' : ''
                      } ${item.status === 'done' ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Quick complete button */}
                        <button 
                          onClick={() => handleQuickComplete(item)}
                          className={`mt-0.5 shrink-0 ${item.status === 'done' ? 'text-green-600' : 'text-muted-foreground hover:text-green-600'}`}
                          disabled={item.status === 'done'}
                        >
                          {item.status === 'done' ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <Circle className="h-5 w-5" />
                          )}
                        </button>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-medium ${item.status === 'done' ? 'line-through' : ''}`}>
                              {item.title}
                            </span>
                            <Badge variant="outline" className={`text-xs ${statusConfig.color}`}>
                              {statusConfig.label}
                            </Badge>
                            <Badge variant="outline" className={`text-xs ${priorityConfig.color}`}>
                              {priorityConfig.label}
                            </Badge>
                          </div>
                          
                          {item.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                              {item.description}
                            </p>
                          )}
                          
                          {/* Meta */}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                            {item.due_date && (
                              <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-600 font-medium' : ''}`}>
                                <CalendarIcon className="h-3 w-3" />
                                {isOverdue && <AlertCircle className="h-3 w-3" />}
                                {format(new Date(item.due_date), 'MMM d, yyyy')}
                              </span>
                            )}
                            {item.owner && (
                              <span className="flex items-center gap-1">
                                <Avatar className="h-4 w-4">
                                  <AvatarImage src={item.owner.avatar_url || undefined} />
                                  <AvatarFallback className="text-[8px]">
                                    {item.owner.first_name?.[0]}{item.owner.last_name?.[0]}
                                  </AvatarFallback>
                                </Avatar>
                                {item.owner.first_name}
                              </span>
                            )}
                            {item.source !== 'manual' && (
                              <Badge variant="secondary" className="text-[10px]">
                                From {item.source}
                              </Badge>
                            )}
                          </div>
                        </div>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleOpenEdit(item)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setStatus(item.id, 'open')}>
                              <Circle className="h-4 w-4 mr-2" />
                              Set Open
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatus(item.id, 'in_progress')}>
                              <Clock className="h-4 w-4 mr-2" />
                              Set In Progress
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatus(item.id, 'blocked')}>
                              <PauseCircle className="h-4 w-4 mr-2" />
                              Set Blocked
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setStatus(item.id, 'done')}>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Mark Done
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedItem(item);
                                setIsDeleteDialogOpen(true);
                              }}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedItem ? 'Edit Action Item' : 'Add Action Item'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input 
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Action item title..."
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Description</Label>
                {speech.isSupported && (
                  <Button
                    type="button"
                    variant={speech.isRecording ? "destructive" : "ghost"}
                    size="sm"
                    className="gap-1.5 h-7 text-xs"
                    onClick={() => {
                      if (speech.isRecording) {
                        speech.stopRecording();
                      } else {
                        speech.startRecording((text) => {
                          setDescription(prev => prev ? `${prev} ${text}` : text);
                        });
                      }
                    }}
                  >
                    {speech.isRecording ? (
                      <><MicOff className="h-3.5 w-3.5" /> Stop</>
                    ) : (
                      <><Mic className="h-3.5 w-3.5" /> Speak</>
                    )}
                  </Button>
                )}
              </div>
              <Textarea 
                value={speech.isRecording && speech.interimTranscript 
                  ? (description ? `${description} ${speech.interimTranscript}` : speech.interimTranscript)
                  : description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Details..."
                rows={3}
                className={speech.isRecording ? 'border-destructive' : ''}
              />
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Priority</Label>
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

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={actionStatus} onValueChange={setActionStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.description}
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
                      {dueDate ? format(dueDate, 'dd MMM yyyy') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={dueDate}
                      onSelect={setDueDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={ownerUserId || '__unassigned__'} onValueChange={v => setOwnerUserId(v === '__unassigned__' ? undefined : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {teamMembers.map(member => (
                    <SelectItem key={member.user_uuid} value={member.user_uuid}>
                      <span className="flex items-center gap-2">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={member.avatar_url || undefined} />
                          <AvatarFallback className="text-[10px]">
                            {member.first_name?.[0]}{member.last_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        {member.first_name} {member.last_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notify team members */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Notify (optional)
              </Label>
              <div className="flex flex-wrap gap-2">
                {vivacityTeam.map((user) => (
                  <Button
                    key={user.user_uuid}
                    type="button"
                    variant={notifyUserIds.includes(user.user_uuid) ? "default" : "outline"}
                    size="sm"
                    onClick={() => setNotifyUserIds(prev => 
                      prev.includes(user.user_uuid) 
                        ? prev.filter(id => id !== user.user_uuid)
                        : [...prev, user.user_uuid]
                    )}
                    className="gap-1.5"
                  >
                    <Avatar className="h-5 w-5">
                      {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                      <AvatarFallback className="text-[9px]">
                        {user.first_name?.[0]}{user.last_name?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    {user.first_name} {user.last_name}
                  </Button>
                ))}
                {vivacityTeam.length === 0 && (
                  <span className="text-xs text-muted-foreground">No team members available</span>
                )}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!title.trim() || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {selectedItem ? 'Save Changes' : 'Create Action'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Action Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this action item? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

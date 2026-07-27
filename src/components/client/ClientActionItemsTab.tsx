import { useState, useEffect } from 'react';
import { useClientActionItems, ActionItem } from '@/hooks/useClientManagementData';
import { supabase } from '@/integrations/supabase/client';
import { VIVACITY_STAFF_ROLES } from '@/lib/roles/vivacityRoles';
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
import { Switch } from '@/components/ui/switch';
import {
  Plus, CheckSquare, MoreHorizontal, Edit, Trash2,
  Calendar as CalendarIcon, User, Users, Clock, Filter, Loader2,
  CheckCircle2, Circle, AlertCircle, XCircle, PauseCircle,
  Mic, MicOff, Mail, ExternalLink, Eye, EyeOff, BellRing
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { format, formatDistanceToNow, isPast, isToday, differenceInCalendarDays } from 'date-fns';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { notifyActionItemCreated, ActionItemNotifyRecipient } from '@/lib/notifyActionItem';
import { useActionPriorityOptions } from '@/hooks/useActionPriorityOptions';
import { useActionStatusOptions } from '@/hooks/useActionStatusOptions';

const REMINDER_OFFSET_PRESETS = [15, 7, 3, 1] as const;

interface ClientActionItemsTabProps {
  tenantId: number;
  clientId: string;
}

// Fallback icon/color maps for statuses
const STATUS_ICON_MAP: Record<string, React.ElementType> = {
  open: Circle,
  in_progress: Clock,
  blocked: PauseCircle,
  done: CheckCircle2,
  cancelled: XCircle,
  todo: Circle,
  waiting_client: Clock,
};

const STATUS_COLOR_MAP: Record<string, string> = {
  open: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-blue-100 text-blue-700',
  blocked: 'bg-red-100 text-red-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-muted text-muted-foreground',
  todo: 'bg-slate-100 text-slate-700',
  waiting_client: 'bg-amber-100 text-amber-700',
};

const PRIORITY_COLOR_MAP: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  normal: 'bg-blue-100 text-blue-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export function ClientActionItemsTab({ tenantId, clientId }: ClientActionItemsTabProps) {
  const { items, loading, createItem, setStatus, updateItem, deleteItem, refresh } = useClientActionItems(tenantId, clientId);
  const speech = useSpeechToText();
  const navigate = useNavigate();
  const { data: vivacityTeam = [] } = useVivacityTeamUsers();
  const { priorities: priorityOptions } = useActionPriorityOptions();
  const { statuses: actionStatusOptions } = useActionStatusOptions();
  
  const [filter, setFilter] = useState('all');

  const stripHtml = (html: string) =>
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ActionItem | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [actionStatus, setActionStatus] = useState('open');
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [ownerUserId, setOwnerUserId] = useState<string | undefined>();
  const [notifyStaffUserIds, setNotifyStaffUserIds] = useState<string[]>([]);
  const [notifyTenantUserIds, setNotifyTenantUserIds] = useState<string[]>([]);
  const [notifyOffsetDays, setNotifyOffsetDays] = useState<number[]>([]);
  const [itemType, setItemType] = useState<'client' | 'internal'>('client');


  // Team members for assignment
  const [teamMembers, setTeamMembers] = useState<Array<{
    user_uuid: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  }>>([]);

  // Tenant (client portal) users, for the "notify" tenant-user list
  const [tenantUsers, setTenantUsers] = useState<Array<{
    user_uuid: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    avatar_url: string | null;
    relationship_role: string | null;
  }>>([]);

  useEffect(() => {
    fetchTeamMembers();
    fetchTenantUsers();
  }, [tenantId]);

  const fetchTeamMembers = async () => {
    const { data } = await supabase
      .from('users')
      .select('user_uuid, first_name, last_name, avatar_url')
      .in('unicorn_role', [...VIVACITY_STAFF_ROLES])
      .or('kpi_pod.is.null,kpi_pod.neq.qa')
      .order('first_name');

    setTeamMembers(data || []);
  };

  const fetchTenantUsers = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('tenant_users')
      .select(`
        relationship_role,
        users!tenant_users_user_id_fkey (
          user_uuid, first_name, last_name, email, avatar_url
        )
      `)
      .eq('tenant_id', tenantId);

    const rows = (data || [])
      .map((row: any) => row.users ? { ...row.users, relationship_role: row.relationship_role } : null)
      .filter(Boolean);
    setTenantUsers(rows);
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('medium');
    setActionStatus('open');
    setDueDate(undefined);
    setOwnerUserId(undefined);
    setSelectedItem(null);
    setNotifyStaffUserIds([]);
    setNotifyTenantUserIds([]);
    setNotifyOffsetDays([]);
    setItemType('client');
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleOpenEdit = (item: ActionItem) => {
    setSelectedItem(item);
    setTitle(item.title);
    setDescription(item.description ? stripHtml(item.description) : '');
    setPriority(item.priority);
    setActionStatus(item.status || 'open');
    setDueDate(item.due_date ? new Date(item.due_date) : undefined);
    setOwnerUserId(item.owner_user_id || undefined);
    setItemType((item.item_type as 'client' | 'internal') || 'internal');
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
          owner_user_id: ownerUserId || null,
          item_type: itemType,
        });
      } else {
        const newId = await createItem({
          title,
          description: description || undefined,
          priority,
          due_date: dueDate ? format(dueDate, 'yyyy-MM-dd') : undefined,
          owner_user_id: ownerUserId
        });

        // Apply chosen visibility (RPC does not accept item_type yet — default is 'internal')
        if (newId && itemType === 'client') {
          const { error: visErr } = await supabase
            .from('client_action_items')
            .update({ item_type: 'client' })
            .eq('id', newId);
          if (visErr) console.error('Failed to set item_type:', visErr);
          else refresh();
        }

        // Persist notify configuration (RPC does not accept it yet — same
        // follow-up-update pattern as item_type above).
        if (newId && (notifyStaffUserIds.length > 0 || notifyTenantUserIds.length > 0 || notifyOffsetDays.length > 0)) {
          const { error: notifyConfigErr } = await supabase
            .from('client_action_items')
            .update({
              notify_staff_user_ids: notifyStaffUserIds,
              notify_tenant_user_ids: notifyTenantUserIds,
              notify_offset_days: notifyOffsetDays,
            })
            .eq('id', newId);
          if (notifyConfigErr) console.error('Failed to persist notify config:', notifyConfigErr);
        }

        // In-app bell for selected staff — relocated to service-role edge
        // function (frontend can no longer insert user_notifications for
        // other users post-Phase-3 RLS).
        if (notifyStaffUserIds.length > 0) {
          try {
            await supabase.functions.invoke("notify-action-shared", {
              body: {
                tenant_id: tenantId,
                action_title: title,
                notify_user_ids: notifyStaffUserIds,
              },
            });
          } catch (notifyErr) {
            console.error('Failed to send notify notifications:', notifyErr);
          }
        }

        // Email every selected recipient (internal staff + client contacts).
        if (notifyStaffUserIds.length > 0 || notifyTenantUserIds.length > 0) {
          try {
            const { data: userData } = await supabase.auth.getUser();
            const currentUserId = userData.user?.id;
            const { data: authorUser } = currentUserId ? await supabase
              .from('users')
              .select('first_name, last_name')
              .eq('user_uuid', currentUserId)
              .single() : { data: null };
            const authorName = authorUser
              ? `${authorUser.first_name || ''} ${authorUser.last_name || ''}`.trim()
              : undefined;

            const { data: tenantRow } = await supabase
              .from('tenants')
              .select('name')
              .eq('id', tenantId)
              .single();

            const staffRecipients: ActionItemNotifyRecipient[] = vivacityTeam
              .filter(u => notifyStaffUserIds.includes(u.user_uuid))
              .map(u => ({ user_uuid: u.user_uuid, first_name: u.first_name, email: u.email }));
            const tenantRecipients: ActionItemNotifyRecipient[] = tenantUsers
              .filter(u => notifyTenantUserIds.includes(u.user_uuid))
              .map(u => ({ user_uuid: u.user_uuid, first_name: u.first_name, email: u.email }));

            await notifyActionItemCreated({
              tenantId,
              tenantName: tenantRow?.name || `Tenant #${tenantId}`,
              title,
              description: description || undefined,
              priority,
              dueDate: dueDate ? format(dueDate, 'yyyy-MM-dd') : undefined,
              createdByName: authorName || undefined,
              recipients: [...staffRecipients, ...tenantRecipients],
            });
          } catch (e) {
            console.error('Action item notify email error:', e);
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

  const handleToggleVisibility = async (item: ActionItem) => {
    const next: 'client' | 'internal' = item.item_type === 'client' ? 'internal' : 'client';
    // Optimistic update via refresh after success; revert via refresh on error
    const { error } = await supabase
      .from('client_action_items')
      .update({ item_type: next })
      .eq('id', item.id);
    if (error) {
      console.error('Failed to toggle visibility:', error);
    }
    refresh();
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
                <SelectTrigger className="w-[150px] h-8">
                  <Filter className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {actionStatusOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                  <SelectItem value="overdue">Overdue</SelectItem>
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
                   const statusLabel = actionStatusOptions.find(s => s.value === item.status)?.label || item.status;
                   const statusColor = STATUS_COLOR_MAP[item.status] || 'bg-slate-100 text-slate-700';
                   const StatusIcon = STATUS_ICON_MAP[item.status] || Circle;
                   const priorityLabel = priorityOptions.find(p => p.value === item.priority)?.label || item.priority;
                   const priorityColor = PRIORITY_COLOR_MAP[item.priority] || 'bg-slate-100 text-slate-600';
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
                             <Badge variant="outline" className={`text-xs ${statusColor}`}>
                               {statusLabel}
                             </Badge>
                             <Badge variant="outline" className={`text-xs ${priorityColor}`}>
                               {priorityLabel}
                             </Badge>
                             <button
                               type="button"
                               onClick={() => handleToggleVisibility(item)}
                               title={item.item_type === 'client' ? 'Visible in client portal — click to make internal' : 'Internal only — click to make visible in portal'}
                             >
                               {item.item_type === 'client' ? (
                                 <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700 border-cyan-200 gap-1 hover:bg-cyan-100">
                                   <Eye className="h-3 w-3" /> Portal
                                 </Badge>
                               ) : (
                                 <Badge variant="outline" className="text-xs bg-muted text-muted-foreground gap-1 hover:bg-muted/70">
                                   <EyeOff className="h-3 w-3" /> Internal
                                 </Badge>
                               )}
                             </button>

                          </div>
                          
                          {item.description && stripHtml(item.description) && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                              {stripHtml(item.description)}
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
                            {item.related_entity_type === 'staff_task_instance' && item.related_entity_id && (
                              <DropdownMenuItem onClick={async () => {
                                try {
                                  // Look up the stage instance and package instance for this task
                                  const { data: taskData } = await supabase
                                    .from('staff_task_instances')
                                    .select('stageinstance_id')
                                    .eq('id', parseInt(item.related_entity_id!, 10))
                                    .maybeSingle() as { data: { stageinstance_id: number } | null; error: any };
                                  
                                  if (taskData?.stageinstance_id) {
                                    const { data: stageData } = await supabase
                                      .from('stage_instances')
                                      .select('packageinstance_id')
                                      .eq('id', taskData.stageinstance_id)
                                      .maybeSingle() as { data: { packageinstance_id: number } | null; error: any };
                                    
                                    if (stageData?.packageinstance_id) {
                                      navigate(`/tenant/${tenantId}?tab=packages&packageInstance=${stageData.packageinstance_id}&stageInstance=${taskData.stageinstance_id}`);
                                    }
                                  }
                                } catch (err) {
                                  console.error('Error navigating to task:', err);
                                }
                              }}>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View Task
                              </DropdownMenuItem>
                            )}
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
        <DialogContent className="sm:max-w-2xl max-h-[90vh]">
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
                rows={6}
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
                    {priorityOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
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
                    {actionStatusOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
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
                        {member.first_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Visibility */}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label className="flex items-center gap-1.5">
                  {itemType === 'client' ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  Visible in client portal
                </Label>
                <p className="text-xs text-muted-foreground">
                  {itemType === 'client'
                    ? 'Client portal users will see this action item.'
                    : 'Internal only — hidden from the client portal.'}
                </p>
              </div>
              <Switch
                checked={itemType === 'client'}
                onCheckedChange={(checked) => setItemType(checked ? 'client' : 'internal')}
              />
            </div>


            {/* Notify */}
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Mail className="h-3 w-3" />
                Notify (Optional)
              </Label>

              {/* Internal Vivacity staff */}
              <div className="space-y-1">
                <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <Users className="h-3 w-3" />
                  Internal Team
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {vivacityTeam.map((user) => (
                    <Button
                      key={user.user_uuid}
                      type="button"
                      variant={notifyStaffUserIds.includes(user.user_uuid) ? "default" : "outline"}
                      size="sm"
                      onClick={() => setNotifyStaffUserIds(prev =>
                        prev.includes(user.user_uuid)
                          ? prev.filter(id => id !== user.user_uuid)
                          : [...prev, user.user_uuid]
                      )}
                      className="gap-1 h-7 text-[11px] px-2"
                    >
                      <Avatar className="h-4 w-4">
                        {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                        <AvatarFallback className="text-[8px]">
                          {user.first_name?.[0]}{user.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      {user.first_name}
                    </Button>
                  ))}
                  {vivacityTeam.length === 0 && (
                    <span className="text-xs text-muted-foreground">No team members available</span>
                  )}
                </div>
              </div>

              {/* Tenant / client portal users */}
              <div className="space-y-1">
                <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <User className="h-3 w-3" />
                  Client Contacts
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {tenantUsers.map((user) => (
                    <Button
                      key={user.user_uuid}
                      type="button"
                      variant={notifyTenantUserIds.includes(user.user_uuid) ? "default" : "outline"}
                      size="sm"
                      onClick={() => setNotifyTenantUserIds(prev =>
                        prev.includes(user.user_uuid)
                          ? prev.filter(id => id !== user.user_uuid)
                          : [...prev, user.user_uuid]
                      )}
                      className="gap-1 h-7 text-[11px] px-2"
                    >
                      <Avatar className="h-4 w-4">
                        {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                        <AvatarFallback className="text-[8px]">
                          {user.first_name?.[0]}{user.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      {user.first_name}
                      {user.relationship_role === 'primary_contact' && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5">Primary</Badge>
                      )}
                    </Button>
                  ))}
                  {tenantUsers.length === 0 && (
                    <span className="text-xs text-muted-foreground">No client contacts on this tenant</span>
                  )}
                </div>
              </div>

              {/* Due-date reminders */}
              <div className="space-y-1">
                <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <BellRing className="h-3 w-3" />
                  Remind Before Due Date
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {REMINDER_OFFSET_PRESETS.map((offset) => {
                    const daysUntilDue = dueDate ? differenceInCalendarDays(dueDate, new Date()) : undefined;
                    const isAvailable = daysUntilDue !== undefined && daysUntilDue >= offset;
                    const isSelected = notifyOffsetDays.includes(offset);
                    return (
                      <Button
                        key={offset}
                        type="button"
                        disabled={!isAvailable}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => setNotifyOffsetDays(prev =>
                          prev.includes(offset) ? prev.filter(o => o !== offset) : [...prev, offset]
                        )}
                        className="h-7 text-[11px] px-2.5"
                      >
                        {offset === 1 ? '1 day before' : `${offset} days before`}
                      </Button>
                    );
                  })}
                </div>
                {!dueDate ? (
                  <p className="text-[11px] text-muted-foreground">Set a due date to enable reminders.</p>
                ) : (
                  (notifyStaffUserIds.length === 0 && notifyTenantUserIds.length === 0) && notifyOffsetDays.length > 0 && (
                    <p className="text-[11px] text-amber-600">Select at least one recipient above for reminders to be sent.</p>
                  )
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

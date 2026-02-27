import { useState, useEffect, useRef, useCallback } from 'react';
import { useNotes, Note } from '@/hooks/useNotes';
import { useNoteTags } from '@/hooks/useNoteTags';
import { useClientActionItems } from '@/hooks/useClientManagementData';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  Plus, StickyNote, Pin, MoreHorizontal, Edit, Trash2, 
  ArrowRight, Tag, Clock, MessageSquare, AlertTriangle, 
  CheckCircle, Users, FileText, Loader2, Filter, Package,
  ListTodo, ChevronDown, ChevronUp, Mic, MicOff, ExternalLink, Mail, CalendarIcon, X
} from 'lucide-react';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { SelectSeparator } from '@/components/ui/select';
import { formatDistanceToNow, format, fromUnixTime, isValid, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { TenantClickUpAISearch } from '@/components/tenant/TenantClickUpAISearch';

interface PackageInfo {
  id: number;
  name: string;
  full_text: string;
}

interface ClickUpTask {
  id: string;
  task_id?: string;
  task_custom_id: string | null;
  task_name: string | null;
  task_content: string | null;
  date_created: string | null;
  comments: unknown;
  assigned_comments: unknown;
  status: string | null;
  list_name: string | null;
  date_of_last_contact: string | null;
  date_of_last_systemscheck: string | null;
  due_date: number | null;
  time_estimate: number | null;
  time_spent: number | null;
  sharepoint_url: string | null;
  infusionsoft_url: string | null;
}

interface ApiComment {
  id: number;
  comment_id: string;
  comment_text: string | null;
  comment_by: string | null;
  comment_by_email: string | null;
  date_created: number | null;
  resolved: boolean;
  parent_comment_id: string | null;
}

interface ClientStructuredNotesTabProps {
  tenantId: number;
  clientId: string;
}

// Icon and color mapping for note types (visual only)
const NOTE_TYPE_STYLES: Record<string, { icon: typeof StickyNote; color: string }> = {
  'general': { icon: StickyNote, color: 'bg-slate-100 text-slate-700' },
  'follow-up': { icon: ArrowRight, color: 'bg-purple-100 text-purple-700' },
  'phone-call': { icon: MessageSquare, color: 'bg-cyan-100 text-cyan-700' },
  'meeting': { icon: Users, color: 'bg-blue-100 text-blue-700' },
  'action': { icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  'email': { icon: Mail, color: 'bg-indigo-100 text-indigo-700' },
  'tenant': { icon: FileText, color: 'bg-amber-100 text-amber-700' },
  'risk': { icon: AlertTriangle, color: 'bg-red-100 text-red-700' },
  'escalation': { icon: AlertTriangle, color: 'bg-orange-100 text-orange-700' },
};

const DEFAULT_NOTE_STYLE = { icon: StickyNote, color: 'bg-slate-100 text-slate-700' };

export function ClientStructuredNotesTab({ tenantId, clientId }: ClientStructuredNotesTabProps) {
  const { notes, loading, createNote, updateNote, deleteNote, refresh } = useNotes({
    parentType: ['tenant', 'package_instance'],
    parentId: tenantId,
    tenantId
  });
  const { toast } = useToast();
  const { createItem: createActionItem } = useClientActionItems(tenantId, clientId);
  
  // Filter state
  const [parentTypeFilter, setParentTypeFilter] = useState<string>('all');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // ClickUp state
  const [clickupTasks, setClickupTasks] = useState<ClickUpTask[]>([]);
  const [clickupLoading, setClickupLoading] = useState(false);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());
  const [apiComments, setApiComments] = useState<Record<string, ApiComment[]>>({});
  const [fetchingCommentsForTask, setFetchingCommentsForTask] = useState<string | null>(null);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isTimeLogPromptOpen, setIsTimeLogPromptOpen] = useState(false);
  const [pendingTimeLogData, setPendingTimeLogData] = useState<{ duration: number; noteType: string; title: string } | null>(null);
  const [pendingBillable, setPendingBillable] = useState(true);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedPackageInfo, setSelectedPackageInfo] = useState<PackageInfo | null>(null);
  const [packageNameMap, setPackageNameMap] = useState<Record<number, string>>({});
  
  // Note type options from dd_note_types
  const [noteTypeOptions, setNoteTypeOptions] = useState<{ code: string; label: string }[]>([]);
  
  // Note status options from dd_note_status
  const [noteStatusOptions, setNoteStatusOptions] = useState<{ code: string; label: string }[]>([]);
  
  // Form state
  const [noteType, setNoteType] = useState('general');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState('normal');
  const [noteStatus, setNoteStatus] = useState('noted');
  const [duration, setDuration] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const { tags: availableNoteTags, loading: noteTagsLoading } = useNoteTags();
  const [isPinned, setIsPinned] = useState(false);
  const [selectedPackageInstanceId, setSelectedPackageInstanceId] = useState<string>('none');
  const [activePackages, setActivePackages] = useState<{ instance_id: number; package_id: number; name: string }[]>([]);
  const speech = useSpeechToText();
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [extractingTitle, setExtractingTitle] = useState(false);
  const titleExtractTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>([]);
  const { data: vivacityTeam = [] } = useVivacityTeamUsers();

  // Auto-extract title from content using AI
  const extractTitle = useCallback(async (text: string) => {
    if (!text || text.trim().length < 10) return;
    setExtractingTitle(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-note-title', {
        body: { content: text.trim() },
      });
      if (!error && data?.title) {
        setTitle(data.title);
      }
    } catch (e) {
      console.error('Title extraction failed:', e);
    } finally {
      setExtractingTitle(false);
    }
  }, []);

  // Debounced title extraction when content changes and title hasn't been manually edited
  useEffect(() => {
    if (titleManuallyEdited || !content || content.trim().length < 10) return;
    if (titleExtractTimer.current) clearTimeout(titleExtractTimer.current);
    titleExtractTimer.current = setTimeout(() => {
      extractTitle(content);
    }, 1500);
    return () => {
      if (titleExtractTimer.current) clearTimeout(titleExtractTimer.current);
    };
  }, [content, titleManuallyEdited, extractTitle]);
  
  // Fetch note type options
  useEffect(() => {
    const fetchTypeOptions = async () => {
      const { data } = await supabase
        .from('dd_note_types')
        .select('code, label')
        .eq('is_active', true)
        .order('sort_order');
      if (data) setNoteTypeOptions(data);
    };
    fetchTypeOptions();
  }, []);

  // Fetch note status options
  useEffect(() => {
    const fetchStatusOptions = async () => {
      const { data } = await supabase
        .from('dd_note_status')
        .select('code, label')
        .eq('is_active', true)
        .order('sort_order');
      if (data) setNoteStatusOptions(data);
    };
    fetchStatusOptions();
  }, []);

  // Convert to action item state
  const [actionTitle, setActionTitle] = useState('');
  const [actionDescription, setActionDescription] = useState('');

  // Fetch active packages for this tenant
  useEffect(() => {
    const fetchActivePackages = async () => {
      const { data: instances } = await supabase
        .from('package_instances')
        .select('id, package_id')
        .eq('tenant_id', tenantId)
        .eq('is_complete', false)
        .eq('is_active', true);

      if (!instances || instances.length === 0) {
        setActivePackages([]);
        return;
      }

      const pkgIds = [...new Set(instances.map(i => i.package_id).filter(Boolean))];
      if (pkgIds.length === 0) return;

      const { data: packages } = await supabase
        .from('packages')
        .select('id, name')
        .in('id', pkgIds);

      if (!packages) return;

      const pkgMap = new Map(packages.map(p => [p.id, p.name]));
      setActivePackages(
        instances
          .filter(i => i.package_id && pkgMap.has(i.package_id))
          .map(i => ({ instance_id: i.id, package_id: i.package_id!, name: pkgMap.get(i.package_id!)! }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    };
    fetchActivePackages();
  }, [tenantId]);

  // Batch-fetch package names for all package_instance notes
  useEffect(() => {
    const fetchPackageNames = async () => {
      const packageNoteIds = notes
        .filter(n => n.parent_type === 'package_instance' && n.parent_id)
        .map(n => n.parent_id);
      
      const uniqueIds = [...new Set(packageNoteIds)];
      if (uniqueIds.length === 0) return;

      const { data: instances } = await supabase
        .from('package_instances')
        .select('id, package_id')
        .in('id', uniqueIds);

      if (!instances || instances.length === 0) return;

      const pkgIds = [...new Set(instances.map(i => i.package_id).filter(Boolean))];
      if (pkgIds.length === 0) return;

      const { data: packages } = await supabase
        .from('packages')
        .select('id, name')
        .in('id', pkgIds);

      if (!packages) return;

      const pkgMap = new Map(packages.map(p => [p.id, p.name]));
      const nameMap: Record<number, string> = {};
      instances.forEach(inst => {
        if (inst.package_id && pkgMap.has(inst.package_id)) {
          nameMap[inst.id] = pkgMap.get(inst.package_id)!;
        }
      });
      setPackageNameMap(nameMap);
    };

    fetchPackageNames();
  }, [notes]);

  // Fetch ClickUp tasks when filter switches to clickup
  useEffect(() => {
    if (parentTypeFilter !== 'clickup') return;
    const fetchClickupTasks = async () => {
      setClickupLoading(true);
      try {
  const { data, error } = await supabase
          .from('v_clickup_tasks' as never)
          .select('id, task_id, task_custom_id, task_name, task_content, date_created, status, list_name, date_of_last_contact, date_of_last_systemscheck, due_date, time_estimate, time_spent, sharepoint_url, infusionsoft_url')
          .eq('tenant_id', tenantId)
          .order('date_created', { ascending: false });
        if (error) throw error;
        setClickupTasks((data as ClickUpTask[]) || []);
      } catch (err) {
        console.error('[ClickUp] fetch error:', err);
        setClickupTasks([]);
      } finally {
        setClickupLoading(false);
      }
    };
    fetchClickupTasks();
  }, [parentTypeFilter, tenantId]);

  // Load cached API comments for all tasks when clickup tasks are loaded
  useEffect(() => {
    if (clickupTasks.length === 0) return;
    const loadApiComments = async () => {
      // Fetch comments by tenant_id, plus any orphaned comments for tasks linked to this tenant
      const taskIds = clickupTasks.map(t => t.task_id).filter(Boolean);
      const { data } = await supabase
        .from('clickup_task_comments' as never)
        .select('*')
        .or(`tenant_id.eq.${tenantId}${taskIds.length > 0 ? `,and(tenant_id.is.null,task_id.in.(${taskIds.join(',')}))` : ''}`)
        .order('date_created', { ascending: false });
      if (data && Array.isArray(data)) {
        const grouped: Record<string, ApiComment[]> = {};
        for (const c of data as any[]) {
          const tid = c.task_id;
          if (!grouped[tid]) grouped[tid] = [];
          grouped[tid].push(c as ApiComment);
        }
        setApiComments(grouped);
      }
    };
    loadApiComments();
  }, [clickupTasks, tenantId]);

  // Fetch comments from ClickUp API for a single task
  const handleFetchTaskComments = async (taskId: string) => {
    setFetchingCommentsForTask(taskId);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-clickup-comments', {
        body: { action: 'fetch_by_task_ids', task_ids: [taskId], tenant_id: tenantId },
      });
      if (error) throw error;
      // Stamp tenant_id on any freshly fetched comments that are still null
      await supabase
        .from('clickup_task_comments' as never)
        .update({ tenant_id: tenantId } as never)
        .eq('task_id', taskId)
        .is('tenant_id', null);
      // Reload API comments for this task
      const { data: refreshed } = await supabase
        .from('clickup_task_comments' as never)
        .select('*')
        .eq('task_id', taskId)
        .order('date_created', { ascending: true });
      if (refreshed) {
        setApiComments(prev => ({ ...prev, [taskId]: refreshed as ApiComment[] }));
      }
    } catch (err) {
      console.error('[ClickUp] comment fetch error:', err);
    } finally {
      setFetchingCommentsForTask(null);
    }
  };

  // Fetch package info when a package note is selected
  useEffect(() => {
    const fetchPackageInfo = async () => {
      if (selectedNote?.parent_type === 'package_instance' && selectedNote?.parent_id) {
        const { data: instanceData } = await supabase
          .from('package_instances')
          .select('id, package_id')
          .eq('id', selectedNote.parent_id)
          .single();
        
        if (instanceData?.package_id) {
          const { data: packageData } = await supabase
            .from('packages')
            .select('id, name, full_text')
            .eq('id', instanceData.package_id)
            .single();
          
          if (packageData) {
            setSelectedPackageInfo(packageData);
          } else {
            setSelectedPackageInfo(null);
          }
        } else {
          setSelectedPackageInfo(null);
        }
      } else {
        setSelectedPackageInfo(null);
      }
    };
    
    fetchPackageInfo();
  }, [selectedNote]);

  const DURATION_TYPES = ['phone-call', 'meeting', 'action'];
  
  const getDefaultStatus = (type: string) => 
    DURATION_TYPES.includes(type) ? 'completed' : 'noted';

  const handleNoteTypeChange = (type: string) => {
    setNoteType(type);
    // Only update status default when adding (not editing)
    if (!selectedNote) {
      setNoteStatus(getDefaultStatus(type));
    }
  };

  const resetForm = () => {
    setNoteType('general');
    setTitle('');
    setContent('');
    setPriority('normal');
    setNoteStatus('noted');
    setDuration('');
    setTags([]);
    setIsPinned(false);
    setSelectedPackageInstanceId('none');
    setSelectedNote(null);
    setTitleManuallyEdited(false);
    setNotifyUserIds([]);
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddDialogOpen(true);
  };

  const handleOpenEdit = (note: Note) => {
    setSelectedNote(note);
    setNoteType(note.note_type || 'general');
    setTitle(note.title || '');
    setContent(note.note_details);
    setPriority(note.priority || 'normal');
    setNoteStatus(note.status || '');
    setDuration(note.duration ? String(note.duration) : '');
    setTags(note.tags || []);
    setIsPinned(note.is_pinned);
    // Pre-populate package selection when editing a package note
    if (note.parent_type === 'package_instance' && note.parent_id) {
      setSelectedPackageInstanceId(String(note.parent_id));
    } else {
      setSelectedPackageInstanceId('none');
    }
    setIsAddDialogOpen(true);
  };

  const showsDuration = noteType === 'meeting' || noteType === 'phone-call' || noteType === 'action';
  
  const handleSave = async () => {
    if (!content.trim()) return;
    
    setSaving(true);
    try {
      const selectedPkg = activePackages.find(p => String(p.instance_id) === selectedPackageInstanceId);
      const parsedDuration = duration ? parseInt(duration, 10) : 0;
      let noteId: string | null = null;
      if (selectedNote) {
        await updateNote(selectedNote.id, {
          note_type: noteType,
          title: title || null,
          note_details: content,
          priority: priority || null,
          status: noteStatus || null,
          duration: parsedDuration,
          tags,
          is_pinned: isPinned,
          package_id: selectedPkg?.package_id || null
        });
      } else {
        noteId = await createNote({
          note_type: noteType,
          title: title || undefined,
          note_details: content,
          priority: priority || undefined,
          status: noteStatus || undefined,
          duration: parsedDuration || undefined,
          tags,
          is_pinned: isPinned,
          package_id: selectedPkg?.package_id || undefined,
          parent_type_override: selectedPkg ? 'package_instance' : undefined,
          parent_id_override: selectedPkg ? selectedPkg.instance_id : undefined
        });

        // Notify CSC if note was created by someone else
        if (noteId) {
          try {
            const { data: userData } = await supabase.auth.getUser();
            const currentUserId = userData.user?.id;
            if (currentUserId) {
              const { data: cscData } = await supabase
                .from('client_packages')
                .select('assigned_csc_user_id')
                .eq('tenant_id', tenantId)
                .not('assigned_csc_user_id', 'is', null)
                .limit(1);

              const cscUserId = cscData?.[0]?.assigned_csc_user_id;
              if (cscUserId && cscUserId !== currentUserId) {
                // Get current user's name for the notification
                const { data: authorUser } = await supabase
                  .from('users')
                  .select('first_name, last_name')
                  .eq('user_uuid', currentUserId)
                  .single();

                const authorName = authorUser
                  ? `${authorUser.first_name || ''} ${authorUser.last_name || ''}`.trim()
                  : 'A team member';

                await supabase.from('user_notifications').insert({
                  user_id: cscUserId,
                  tenant_id: tenantId,
                  title: 'New note added to your client',
                  message: `${authorName} added a note: "${(title || content.substring(0, 60)).trim()}${!title && content.length > 60 ? '...' : ''}"`,
                  type: 'note_added',
                  link: `/tenant/${tenantId}`,
                  created_by: currentUserId
                });
              }
            }
          } catch (notifErr) {
            console.error('Failed to send CSC notification:', notifErr);
          }
        }

        // Send notifications to selected "Notify" users
        if (noteId && notifyUserIds.length > 0) {
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
                  title: 'Note shared with you',
                  message: `${authorName} shared a note: "${(title || content.substring(0, 60)).trim()}${!title && content.length > 60 ? '...' : ''}"`,
                  type: 'note_shared',
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
      
      // Prompt time log for meeting/phone-call/action with duration
      const parsedDur = duration ? parseInt(duration, 10) : 0;
      if (!selectedNote && showsDuration && parsedDur > 0) {
        setPendingTimeLogData({ duration: parsedDur, noteType, title: title || content.substring(0, 60) });
        setIsTimeLogPromptOpen(true);
      }
      
      resetForm();
    } finally {
      setSaving(false);
    }
  };
  
  const handleTimeLogConfirm = async () => {
    if (!pendingTimeLogData) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      
      await supabase.from('time_entries').insert({
        tenant_id: tenantId,
        user_id: userData.user.id,
        duration_minutes: pendingTimeLogData.duration,
        work_type: pendingTimeLogData.noteType,
        notes: pendingTimeLogData.title,
        client_id: tenantId,
        is_billable: pendingBillable
      });
      
      toast({ title: 'Time logged', description: `${pendingTimeLogData.duration} minutes logged` });
    } catch (err) {
      console.error('Failed to log time:', err);
      toast({ title: 'Error', description: 'Failed to log time entry', variant: 'destructive' });
    } finally {
      setIsTimeLogPromptOpen(false);
      setPendingTimeLogData(null);
    }
  };

  const handleDelete = async () => {
    if (!selectedNote) return;
    await deleteNote(selectedNote.id);
    setIsDeleteDialogOpen(false);
    setSelectedNote(null);
  };

  const handleAddTag = (code: string) => {
    if (code && !tags.includes(code)) {
      setTags([...tags, code]);
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleOpenConvert = (note: Note) => {
    setSelectedNote(note);
    setActionTitle(note.title || `Follow-up: ${note.note_details.substring(0, 50)}...`);
    setActionDescription(note.note_details);
    setIsConvertDialogOpen(true);
  };

  const handleConvertToAction = async () => {
    if (!selectedNote || !actionTitle.trim()) return;
    
    setSaving(true);
    try {
      await createActionItem({
        title: actionTitle,
        description: actionDescription,
        source: 'note',
        source_note_id: selectedNote.id
      });
      setIsConvertDialogOpen(false);
      setSelectedNote(null);
    } finally {
      setSaving(false);
    }
  };

  const getNoteTypeConfig = (type: string) => {
    const style = NOTE_TYPE_STYLES[type] || DEFAULT_NOTE_STYLE;
    const opt = noteTypeOptions.find(t => t.code === type);
    return { ...style, label: opt?.label || type, value: type };
  };

  // Filter notes by parent type, tags, and date range
  const filteredNotes = notes
    .filter(note => parentTypeFilter === 'all' || note.parent_type === parentTypeFilter)
    .filter(note => selectedTagFilter.length === 0 || note.tags.some(t => selectedTagFilter.includes(t)))
    .filter(note => {
      if (!dateFrom && !dateTo) return true;
      const noteDate = note.created_at ? new Date(note.created_at) : null;
      if (!noteDate || !isValid(noteDate)) return true;
      if (dateFrom && noteDate < startOfDay(dateFrom)) return false;
      if (dateTo && noteDate > endOfDay(dateTo)) return false;
      return true;
    });

  // Filter ClickUp tasks by date range — prefer date_of_last_contact, fall back to date_created
  const filteredClickupTasks = clickupTasks.filter(task => {
    if (!dateFrom && !dateTo) return true;
    // Use date_of_last_contact (most relevant activity date), then date_created as fallback
    const rawTs = task.date_of_last_contact ?? task.date_created;
    if (!rawTs) return true;
    try {
      const ts = Number(rawTs);
      const d = isNaN(ts) ? new Date(String(rawTs)) : new Date(ts);
      if (!isValid(d)) return true;
      if (dateFrom && d < startOfDay(dateFrom)) return false;
      if (dateTo && d > endOfDay(dateTo)) return false;
      return true;
    } catch { return true; }
  });

  if (loading && notes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5" />
            Structured Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24 w-full" />
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
            <CardTitle className="flex items-center gap-2">
              <StickyNote className="h-5 w-5" />
              Structured Notes
              <Badge variant="secondary" className="ml-2">{filteredNotes.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={parentTypeFilter} onValueChange={setParentTypeFilter}>
                <SelectTrigger className="w-[200px] h-9">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="All Notes" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="all">All Notes</SelectItem>
                  <SelectItem value="tenant">Client Notes</SelectItem>
                  <SelectItem value="package_instance">Package Notes</SelectItem>
                  <SelectSeparator />
                  <SelectItem value="clickup">
                    <span className="flex items-center gap-2">
                      <ListTodo className="h-4 w-4" />
                      ClickUp Tasks
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {parentTypeFilter !== 'clickup' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5">
                      <Tag className="h-4 w-4" />
                      Tags
                      {selectedTagFilter.length > 0 && (
                        <Badge variant="default" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px]">
                          {selectedTagFilter.length}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56 p-3 bg-popover" align="end">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Filter by tags</span>
                      {selectedTagFilter.length > 0 && (
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSelectedTagFilter([])}>
                          Clear
                        </Button>
                      )}
                    </div>
                    <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
                      {availableNoteTags.map(tag => (
                        <label key={tag.code} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer text-sm">
                          <Checkbox
                            checked={selectedTagFilter.includes(tag.code)}
                            onCheckedChange={(checked) => {
                              setSelectedTagFilter(prev =>
                                checked ? [...prev, tag.code] : prev.filter(t => t !== tag.code)
                              );
                            }}
                          />
                          {tag.label}
                        </label>
                      ))}
                      {availableNoteTags.length === 0 && (
                        <p className="text-xs text-muted-foreground py-2 text-center">No tags available</p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-9 gap-1.5", (dateFrom || dateTo) && "border-primary text-primary")}>
                    <CalendarIcon className="h-4 w-4" />
                    {dateFrom || dateTo
                      ? `${dateFrom ? format(dateFrom, 'dd/MM/yy') : '...'} – ${dateTo ? format(dateTo, 'dd/MM/yy') : '...'}`
                      : 'Date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3 bg-popover" align="end">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Filter by date</span>
                    {(dateFrom || dateTo) && (
                      <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                        Clear
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-col gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">From</Label>
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={setDateFrom}
                        className={cn("p-2 pointer-events-auto")}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">To</Label>
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={setDateTo}
                        className={cn("p-2 pointer-events-auto")}
                      />
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Button size="sm" onClick={handleOpenAdd}>
                <Plus className="h-4 w-4 mr-1" />
                Add Note
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* ClickUp Tasks Panel */}
          {parentTypeFilter === 'clickup' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <ListTodo className="h-4 w-4" />
                <span>{clickupLoading ? 'Loading...' : `${filteredClickupTasks.length} task${filteredClickupTasks.length !== 1 ? 's' : ''} linked to this tenant`}</span>
              </div>
              <TenantClickUpAISearch tenantId={tenantId} />
              {clickupLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading ClickUp tasks...
                </div>
              ) : filteredClickupTasks.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ListTodo className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>{clickupTasks.length === 0 ? 'No ClickUp tasks linked to this tenant' : 'No tasks match the selected date range'}</p>
                  {clickupTasks.length === 0 && <p className="text-sm mt-1">Tasks are linked via the ClickUp tenant mapping configuration</p>}
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {filteredClickupTasks.map(task => {
                      const isExpanded = !collapsedTaskIds.has(task.id);
                      // date_created is a unix timestamp in ms stored as string
                      let formattedDate = '—';
                      const rawTs = task.date_created;
                      if (rawTs) {
                        try {
                          const ts = Number(rawTs);
                          const d = isNaN(ts) ? new Date(rawTs) : fromUnixTime(ts / 1000);
                          if (isValid(d)) formattedDate = format(d, 'dd MMM yyyy');
                        } catch { /* fallback */ }
                      }
                      // Determine task_id for API comment lookup
                      const rawTaskId = (task as any).task_id as string | undefined;
                      const taskApiComments = rawTaskId ? (apiComments[rawTaskId] || []) : [];
                      const hasApiComments = taskApiComments.length > 0;

                      // CSV blob comments (fallback)
                      const rawComments = task.comments ?? task.assigned_comments;
                      const csvComments: { text: string; by?: string }[] = Array.isArray(rawComments)
                        ? (rawComments as unknown[]).map((c) => {
                            if (typeof c === 'string') return { text: c };
                            if (c && typeof c === 'object') {
                              const obj = c as Record<string, unknown>;
                              return {
                                text: (obj.text as string) || (obj.comment_text as string) || String(c),
                                by: (obj.by as string) || (obj.user as any)?.username || undefined,
                              };
                            }
                            return { text: String(c) };
                          }).filter((c) => c.text && c.text.trim())
                        : [];

                      const commentCount = hasApiComments ? taskApiComments.length : csvComments.length;

                      return (
                        <div key={task.id} className="rounded-lg border bg-card">
                          <div
                            className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => setCollapsedTaskIds(prev => {
                              const next = new Set(prev);
                              if (next.has(task.id)) next.delete(task.id);
                              else next.add(task.id);
                              return next;
                            })}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="font-medium text-sm">
                                    {[task.task_custom_id, task.task_name].filter(Boolean).join(' - ') || 'Untitled task'}
                                  </span>
                                  {task.list_name && (
                                    <Badge variant="outline" className="text-xs">{task.list_name}</Badge>
                                  )}
                                  {task.status && (
                                    <Badge variant="secondary" className="text-xs capitalize">{task.status}</Badge>
                                  )}
                                  {commentCount > 0 && (
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <MessageSquare className="h-3 w-3" />
                                      {commentCount}
                                      {hasApiComments && <span className="text-[10px]">(API)</span>}
                                    </span>
                                  )}
                                </div>
                                {task.task_content && (
                                  <p className={`text-sm text-muted-foreground ${isExpanded ? '' : 'line-clamp-2'}`}>
                                    {task.task_content}
                                  </p>
                                )}
                                <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formattedDate}
                                  </span>
                                  {task.date_of_last_contact && (() => {
                                    try {
                                      const ts = Number(task.date_of_last_contact);
                                      const d = isNaN(ts) ? new Date(task.date_of_last_contact) : fromUnixTime(ts / 1000);
                                      return isValid(d) ? <span>Last Contact: <span className="font-medium text-foreground">{format(d, 'dd MMM yyyy')}</span></span> : null;
                                    } catch { return null; }
                                  })()}
                                  {task.date_of_last_systemscheck && (() => {
                                    try {
                                      const ts = Number(task.date_of_last_systemscheck);
                                      const d = isNaN(ts) ? new Date(task.date_of_last_systemscheck) : fromUnixTime(ts / 1000);
                                      return isValid(d) ? <span>Last Systems Check: <span className="font-medium text-foreground">{format(d, 'dd MMM yyyy')}</span></span> : null;
                                    } catch { return null; }
                                  })()}
                                  {task.due_date && (() => {
                                    try {
                                      const d = fromUnixTime(task.due_date / 1000);
                                      return isValid(d) ? <span>Package Expiry: <span className="font-medium text-foreground">{format(d, 'dd MMM yyyy')}</span></span> : null;
                                    } catch { return null; }
                                  })()}
                                  {task.time_estimate != null && task.time_estimate > 0 && (
                                    <span>Consult Limit: <span className="font-medium text-foreground">{Math.round(task.time_estimate / 3600000)}h</span></span>
                                  )}
                                  {task.time_spent != null && task.time_spent > 0 && (
                                    <span>Consult Used: <span className="font-medium text-foreground">{Math.round(task.time_spent / 3600000)}h</span></span>
                                  )}
                                </div>
                                {(task.sharepoint_url || task.infusionsoft_url) && (
                                  <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-1 text-xs">
                                    {task.sharepoint_url && (
                                      <a href={task.sharepoint_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary hover:text-primary/80 underline flex items-center gap-1">
                                        <ExternalLink className="h-3 w-3" />
                                        SharePoint
                                      </a>
                                    )}
                                    {task.infusionsoft_url && (
                                      <a href={task.infusionsoft_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-primary hover:text-primary/80 underline flex items-center gap-1">
                                        <ExternalLink className="h-3 w-3" />
                                        Infusionsoft
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0 text-muted-foreground">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="border-t px-4 py-3 space-y-2 bg-muted/20">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                  Comments ({commentCount})
                                </p>
                                {rawTaskId && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={(e) => { e.stopPropagation(); handleFetchTaskComments(rawTaskId); }}
                                    disabled={fetchingCommentsForTask === rawTaskId}
                                  >
                                    {fetchingCommentsForTask === rawTaskId ? (
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                      <MessageSquare className="h-3 w-3 mr-1" />
                                    )}
                                    {hasApiComments ? 'Refresh' : 'Fetch from API'}
                                  </Button>
                                )}
                              </div>
                              {hasApiComments ? (
                                // Show API-fetched comments with full metadata
                                taskApiComments.map((c) => {
                                  let commentDate = '';
                                  if (c.date_created) {
                                    try {
                                      const d = fromUnixTime(c.date_created / 1000);
                                      if (isValid(d)) commentDate = format(d, 'dd MMM yyyy HH:mm');
                                    } catch { /* skip */ }
                                  }
                                  return (
                                    <div key={c.comment_id} className={`flex items-start gap-2 text-sm ${c.parent_comment_id ? 'ml-6' : ''}`}>
                                      <div className="shrink-0 mt-0.5">
                                        <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium uppercase text-muted-foreground">
                                          {c.comment_by?.[0] ?? '?'}
                                        </div>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                          {c.comment_by && (
                                            <span className="font-medium text-foreground text-xs">{c.comment_by}</span>
                                          )}
                                          {commentDate && (
                                            <span className="text-[10px] text-muted-foreground">{commentDate}</span>
                                          )}
                                          {c.resolved && (
                                            <Badge variant="outline" className="text-[10px] px-1 py-0">Resolved</Badge>
                                          )}
                                        </div>
                                        <span className="text-muted-foreground whitespace-pre-wrap text-xs">{c.comment_text}</span>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : csvComments.length > 0 ? (
                                // Fallback to CSV blob comments
                                csvComments.map((c, i) => (
                                  <div key={i} className="flex items-start gap-2 text-sm">
                                    <div className="shrink-0 mt-0.5">
                                      <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium uppercase text-muted-foreground">
                                        {c.by?.[0] ?? '?'}
                                      </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      {c.by && (
                                        <span className="font-medium text-foreground mr-1">{c.by}</span>
                                      )}
                                      <span className="text-muted-foreground whitespace-pre-wrap">{c.text}</span>
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground italic">No comments yet. Click &quot;Fetch from API&quot; to load.</p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="space-y-3">
              <TenantClickUpAISearch tenantId={tenantId} />
              <div className="text-center py-12 text-muted-foreground">
                <StickyNote className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>{notes.length === 0 ? 'No notes yet' : 'No matching notes'}</p>
                <p className="text-sm mt-1">
                  {notes.length === 0 
                    ? 'Create notes to track meetings, decisions, and follow-ups'
                    : selectedTagFilter.length > 0
                      ? 'Try removing some tag filters or changing the note type filter'
                      : 'Try changing the filter to see more notes'}
                </p>
                {notes.length === 0 && (
                  <Button size="sm" className="mt-4" onClick={handleOpenAdd}>
                    <Plus className="h-4 w-4 mr-1" />
                    Create First Note
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <TenantClickUpAISearch tenantId={tenantId} />
              <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                {filteredNotes.map(note => {
                  const typeConfig = getNoteTypeConfig(note.note_type);
                  const TypeIcon = typeConfig.icon;
                  
                  const isTenantNote = note.parent_type === 'tenant';
                  const isPackageNote = note.parent_type === 'package_instance';
                  
                  return (
                    <div 
                      key={note.id} 
                      className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                        note.is_pinned 
                          ? 'border-primary/50 bg-primary/5' 
                          : isTenantNote 
                            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                            : isPackageNote
                              ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                              : 'bg-card hover:bg-muted/30'
                      }`}
                      onClick={() => {
                        setSelectedNote(note);
                        setIsViewDialogOpen(true);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`p-2 rounded-lg shrink-0 ${typeConfig.color}`}>
                            <TypeIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {note.is_pinned && (
                                <Pin className="h-3 w-3 text-primary shrink-0" />
                              )}
                              {note.title && (
                                <span className="font-medium">{note.title}</span>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {typeConfig.label}
                              </Badge>
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${
                                  isTenantNote 
                                    ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300' 
                                    : 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/50 dark:text-blue-300'
                                }`}
                              >
                                {isTenantNote ? 'Client' : 'Package'}
                              </Badge>
                              {isPackageNote && packageNameMap[note.parent_id] && (
                                <Badge 
                                  variant="outline" 
                                  className="text-xs bg-primary/10 text-primary border-primary/40"
                                >
                                  {packageNameMap[note.parent_id]}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                              {note.note_details}
                            </p>
                            
                            {/* Tags */}
                            {note.tags.length > 0 && (
                              <div className="flex items-center gap-1 mt-2 flex-wrap">
                                <Tag className="h-3 w-3 text-muted-foreground" />
                                {note.tags.map(tag => (
                                  <Badge key={tag} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            
                            {/* Meta */}
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
                              </span>
                              {note.creator && (
                                <span className="flex items-center gap-1">
                                  <Avatar className="h-4 w-4">
                                    <AvatarImage src={note.creator.avatar_url || undefined} />
                                    <AvatarFallback className="text-[8px]">
                                      {note.creator.first_name?.[0]}{note.creator.last_name?.[0]}
                                    </AvatarFallback>
                                  </Avatar>
                                  {note.creator.first_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => handleOpenEdit(note)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleOpenConvert(note)}>
                              <ArrowRight className="h-4 w-4 mr-2" />
                              Convert to Action
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedNote(note);
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
            </div>
          )}
        </CardContent>
      </Card>
      {/* View Note Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedNote && (() => {
                const tc = getNoteTypeConfig(selectedNote.note_type);
                const TIcon = tc.icon;
                return (
                  <>
                    <div className={`p-1.5 rounded ${tc.color}`}>
                      <TIcon className="h-4 w-4" />
                    </div>
                    {selectedNote.title || tc.label + ' Note'}
                  </>
                );
              })()}
            </DialogTitle>
            {selectedNote && (
              <DialogDescription asChild>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {selectedNote.creator && (
                    <span className="flex items-center gap-1">
                      <Avatar className="h-4 w-4">
                        <AvatarImage src={selectedNote.creator.avatar_url || undefined} />
                        <AvatarFallback className="text-[8px]">
                          {selectedNote.creator.first_name?.[0]}{selectedNote.creator.last_name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      {selectedNote.creator.first_name} {selectedNote.creator.last_name}
                    </span>
                  )}
                  <span>{format(new Date(selectedNote.created_at), 'dd MMM yyyy, h:mm a')}</span>
                  <Badge variant="outline" className="text-xs">
                    {selectedNote.parent_type === 'tenant' ? 'Client' : 'Package'}
                  </Badge>
                </div>
              </DialogDescription>
            )}
          </DialogHeader>
          
          {selectedNote && (
            <div className="flex-1 min-h-0 overflow-y-auto max-h-[60vh] border rounded-md p-4">
              <div className="space-y-4">
                {/* Tags */}
                {selectedNote.tags.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <Tag className="h-3 w-3 text-muted-foreground" />
                    {selectedNote.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
                
                {/* Full note content */}
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {selectedNote.note_details}
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Note Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="w-[90vw] max-w-[1400px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedNote ? 'Edit Note' : 'Add Note'}
            </DialogTitle>
            {/* Show package info if editing a package note */}
            {selectedNote?.parent_type === 'package_instance' && (
              <DialogDescription asChild>
                <div className="flex items-center gap-2 mt-1">
                  <Package className="h-4 w-4 text-blue-600" />
                  <span className="font-medium text-blue-700 dark:text-blue-400">
                    {selectedPackageInfo 
                      ? `${selectedPackageInfo.name} – ${selectedPackageInfo.full_text}`
                      : 'Package Note'}
                  </span>
                </div>
              </DialogDescription>
            )}
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Type, Priority, Status row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={noteType} onValueChange={handleNoteTypeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    {noteTypeOptions.filter(type => type.code).map(type => {
                      const style = NOTE_TYPE_STYLES[type.code] || DEFAULT_NOTE_STYLE;
                      const TypeIcon = style.icon;
                      return (
                        <SelectItem key={type.code} value={type.code}>
                          <span className="flex items-center gap-2">
                            <TypeIcon className="h-4 w-4" />
                            {type.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue placeholder="Normal" />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={noteStatus} onValueChange={setNoteStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent className="bg-background">
                    {noteStatusOptions.filter(opt => opt.code).map(opt => (
                      <SelectItem key={opt.code} value={opt.code}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Package and optional Duration row */}
            {(activePackages.length > 0 || showsDuration) && (
              <div className={`grid gap-4 ${activePackages.length > 0 && showsDuration ? 'grid-cols-[2fr_1fr]' : 'grid-cols-1'}`}>
                {activePackages.length > 0 && (
                  <div className="space-y-2">
                    <Label>Package</Label>
                    <Select value={selectedPackageInstanceId} onValueChange={setSelectedPackageInstanceId}>
                      <SelectTrigger>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          <SelectValue placeholder="Select package..." />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="bg-background">
                        <SelectItem value="none">None (Client Note)</SelectItem>
                        {activePackages.map(pkg => (
                          <SelectItem key={pkg.instance_id} value={String(pkg.instance_id)}>
                            {pkg.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {showsDuration && (
                  <div className="space-y-2">
                    <Label>Duration (mins)</Label>
                    <Input 
                      type="number"
                      min={0}
                      step={15}
                      value={duration}
                      onChange={e => setDuration(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>
            )}
            
            {/* Title field - auto-extracted from content */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Title (optional)</Label>
                <span className="flex items-center gap-1 text-xs text-muted-foreground italic">
                  {extractingTitle && <Loader2 className="h-3 w-3 animate-spin" />}
                  AI generated from Content
                </span>
              </div>
              <Input 
                value={title}
                onChange={e => {
                  setTitle(e.target.value);
                  setTitleManuallyEdited(true);
                }}
                placeholder="Auto-generated from content..."
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Content *</Label>
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
                          setContent(prev => prev ? `${prev} ${text}` : text);
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
                  ? (content ? `${content} ${speech.interimTranscript}` : speech.interimTranscript)
                  : content}
                onChange={e => setContent(e.target.value)}
                placeholder="Write your note..."
                rows={20}
                className={speech.isRecording ? 'border-destructive' : ''}
              />
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

            <div className="flex items-center gap-2">
              <Switch 
                id="pinned"
                checked={isPinned}
                onCheckedChange={setIsPinned}
              />
              <Label htmlFor="pinned" className="cursor-pointer">Pin this note</Label>
            </div>
            
          </div>
          
          <DialogFooter className="!flex !flex-row !justify-between w-full gap-2 sm:justify-between">
            <div className="flex-shrink-0">
              {selectedNote?.parent_type === 'package_instance' && (
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    // TODO: Implement email sending functionality
                    console.log('Send note to client:', selectedNote);
                  }}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Email note
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!content.trim() || saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {selectedNote ? 'Save Changes' : 'Create Note'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this note? This action cannot be undone.
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

      {/* Convert to Action Item Dialog */}
      <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to Action Item</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input 
                value={actionTitle}
                onChange={e => setActionTitle(e.target.value)}
                placeholder="Action item title..."
              />
            </div>
            
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                value={actionDescription}
                onChange={e => setActionDescription(e.target.value)}
                placeholder="Description..."
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConvertDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConvertToAction} disabled={!actionTitle.trim() || saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Action Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Time Log Prompt */}
      <AlertDialog open={isTimeLogPromptOpen} onOpenChange={(open) => {
        if (!open) {
          setIsTimeLogPromptOpen(false);
          setPendingTimeLogData(null);
          setPendingBillable(true);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Log Time Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              Would you like to log {pendingTimeLogData?.duration} minutes as a time entry for this {pendingTimeLogData?.noteType === 'phone-call' ? 'phone call' : pendingTimeLogData?.noteType}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-3 px-1 py-2">
            <Switch
              id="billable-toggle"
              checked={pendingBillable}
              onCheckedChange={setPendingBillable}
            />
            <Label htmlFor="billable-toggle" className="text-sm font-medium cursor-pointer">
              Billable
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>No thanks</AlertDialogCancel>
            <AlertDialogAction onClick={handleTimeLogConfirm}>
              Yes, log time
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

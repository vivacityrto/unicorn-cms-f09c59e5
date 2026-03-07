import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Note } from '@/hooks/useNotes';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Calendar as CalendarIcon, Play, Square, Upload, X, Loader2,
  Package, Mail, Mic, MicOff, StickyNote, ArrowRight,
  MessageSquare, Users, CheckCircle, FileText, AlertTriangle
} from 'lucide-react';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { NotifyClientCheckbox } from '@/components/client/NotifyClientCheckbox';
import { formatDuration, formatElapsedTime } from '@/hooks/useNotes';
import { useActionPriorityOptions } from '@/hooks/useActionPriorityOptions';

// ── Note type style map ──
const NOTE_TYPE_STYLES: Record<string, { icon: typeof StickyNote; color: string }> = {
  general:      { icon: StickyNote,      color: 'bg-slate-100 text-slate-700' },
  'follow-up':  { icon: ArrowRight,      color: 'bg-purple-100 text-purple-700' },
  'phone-call': { icon: MessageSquare,   color: 'bg-cyan-100 text-cyan-700' },
  meeting:      { icon: Users,           color: 'bg-blue-100 text-blue-700' },
  action:       { icon: CheckCircle,     color: 'bg-green-100 text-green-700' },
  email:        { icon: Mail,            color: 'bg-indigo-100 text-indigo-700' },
  tenant:       { icon: FileText,        color: 'bg-amber-100 text-amber-700' },
  risk:         { icon: AlertTriangle,   color: 'bg-red-100 text-red-700' },
  escalation:   { icon: AlertTriangle,   color: 'bg-orange-100 text-orange-700' },
};
const DEFAULT_NOTE_STYLE = { icon: StickyNote, color: 'bg-slate-100 text-slate-700' };

// ── Interfaces ──
export interface NoteFormData {
  title: string;
  content: string;
  noteType: string;
  priority: string;
  status: string;
  duration: string;
  isPinned: boolean;
  packageInstanceId: string; // 'none' or instance id
  startedDate?: Date;
  completedDate?: Date;
  startedTime?: { hour: string; minute: string; period: string };
  completedTime?: { hour: string; minute: string; period: string };
  uploadedFiles: File[];
  existingFiles: { path: string; name: string }[];
  filesToRemove: string[];
  assignees: string[];
  notifyUserIds: string[];
  notifyClient: boolean;
  elapsedTimerSeconds: number;
}

export interface ActivePackage {
  instance_id: number;
  package_id: number;
  name: string;
}

export interface NoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
  // Mode
  mode: 'create' | 'edit';
  noteId?: string; // for edit mode – fetches note data
  initialNote?: Note | null; // pre-populated note (alternative to noteId)
  // Feature flags (all default true for full-featured dialog)
  showPackageSelector?: boolean;
  showStatus?: boolean;
  showAssignees?: boolean;
  showNotify?: boolean;
  showPin?: boolean;
  showSpeech?: boolean;
  showAiTitle?: boolean;
  showDuration?: boolean;
  // Data
  activePackages?: ActivePackage[];
  noteTypeOptions?: { code: string; label: string }[];
  noteStatusOptions?: { code: string; label: string }[];
  // Callbacks
  onSave: (data: NoteFormData) => Promise<void>;
  onEmailSendNow?: () => void; // called when user picks "Send Now" for email type
  saving?: boolean;
}

const DURATION_TYPES = ['phone-call', 'meeting', 'action'];

export function NoteFormDialog({
  open,
  onOpenChange,
  tenantId,
  mode,
  noteId,
  initialNote,
  showPackageSelector = true,
  showStatus = true,
  showAssignees = false,
  showNotify = true,
  showPin = true,
  showSpeech = true,
  showAiTitle = true,
  showDuration = true,
  activePackages = [],
  noteTypeOptions: propTypeOptions,
  noteStatusOptions: propStatusOptions,
  onSave,
  onEmailSendNow,
  saving: externalSaving,
}: NoteFormDialogProps) {
  const { toast } = useToast();

  // ── Form state ──
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [priority, setPriority] = useState('normal');
  const [noteStatus, setNoteStatus] = useState('noted');
  const [duration, setDuration] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [selectedPackageInstanceId, setSelectedPackageInstanceId] = useState('none');

  // Dates
  const [startedDate, setStartedDate] = useState<Date>();
  const [startedTime, setStartedTime] = useState({ hour: '12', minute: '00', period: 'AM' });
  const [completedDate, setCompletedDate] = useState<Date>();
  const [completedTime, setCompletedTime] = useState({ hour: '12', minute: '00', period: 'AM' });

  // Files
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<{ path: string; name: string }[]>([]);
  const [filesToRemove, setFilesToRemove] = useState<string[]>([]);

  // Team / notify
  const [assignees, setAssignees] = useState<string[]>([]);
  const [notifyUserIds, setNotifyUserIds] = useState<string[]>([]);
  const [notifyClient, setNotifyClient] = useState(false);
  const { data: vivacityTeam = [] } = useVivacityTeamUsers();

  // Timer
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerStartTime, setTimerStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [accumulatedTime, setAccumulatedTime] = useState(0);

  // AI title
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [extractingTitle, setExtractingTitle] = useState(false);
  const titleExtractTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Speech
  const speech = useSpeechToText();

  // Email mode
  const [emailMode, setEmailMode] = useState<'prompt' | 'send_now' | 'already_sent' | null>(null);

  // Dropdown data (fetch if not provided)
  const [localTypeOptions, setLocalTypeOptions] = useState<{ code: string; label: string }[]>([]);
  const [localStatusOptions, setLocalStatusOptions] = useState<{ code: string; label: string }[]>([]);
  const noteTypeOpts = propTypeOptions || localTypeOptions;
  const noteStatusOpts = propStatusOptions || localStatusOptions;

  // Loading state for edit mode
  const [loadingNote, setLoadingNote] = useState(false);
  const [internalSaving, setInternalSaving] = useState(false);
  const saving = externalSaving || internalSaving;

  // Package info for edit header
  const [selectedPackageInfo, setSelectedPackageInfo] = useState<{ name: string; full_text: string } | null>(null);

  // ── Fetch dropdown options if not provided ──
  useEffect(() => {
    if (propTypeOptions) return;
    supabase.from('dd_note_types').select('code, label').eq('is_active', true).order('sort_order')
      .then(({ data }) => { if (data) setLocalTypeOptions(data); });
  }, [propTypeOptions]);

  useEffect(() => {
    if (propStatusOptions) return;
    supabase.from('dd_note_status').select('code, label').eq('is_active', true).order('sort_order')
      .then(({ data }) => { if (data) setLocalStatusOptions(data); });
  }, [propStatusOptions]);

  // ── Timer effect ──
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTimerRunning && timerStartTime) {
      interval = setInterval(() => {
        setElapsedTime(accumulatedTime + Math.floor((Date.now() - timerStartTime) / 1000));
      }, 100);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isTimerRunning, timerStartTime, accumulatedTime]);

  // ── AI title extraction ──
  const extractTitle = useCallback(async (text: string) => {
    if (!text || text.trim().length < 10) return;
    setExtractingTitle(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-note-title', {
        body: { content: text.trim() },
      });
      if (!error && data?.title) setTitle(data.title);
    } catch (e) {
      console.error('Title extraction failed:', e);
    } finally {
      setExtractingTitle(false);
    }
  }, []);

  useEffect(() => {
    if (!showAiTitle || titleManuallyEdited || !content || content.trim().length < 10) return;
    if (titleExtractTimer.current) clearTimeout(titleExtractTimer.current);
    titleExtractTimer.current = setTimeout(() => extractTitle(content), 1500);
    return () => { if (titleExtractTimer.current) clearTimeout(titleExtractTimer.current); };
  }, [content, titleManuallyEdited, extractTitle, showAiTitle]);

  // ── Reset form ──
  const resetForm = useCallback(() => {
    setTitle('');
    setContent('');
    setNoteType('general');
    setPriority('normal');
    setNoteStatus('noted');
    setDuration('');
    setIsPinned(false);
    setSelectedPackageInstanceId('none');
    setStartedDate(undefined);
    setStartedTime({ hour: '12', minute: '00', period: 'AM' });
    setCompletedDate(undefined);
    setCompletedTime({ hour: '12', minute: '00', period: 'AM' });
    setUploadedFiles([]);
    setExistingFiles([]);
    setFilesToRemove([]);
    setAssignees([]);
    setNotifyUserIds([]);
    setNotifyClient(false);
    setIsTimerRunning(false);
    setTimerStartTime(null);
    setElapsedTime(0);
    setAccumulatedTime(0);
    setTitleManuallyEdited(false);
    setEmailMode(null);
    setSelectedPackageInfo(null);
  }, []);

  // ── Populate form when opening ──
  useEffect(() => {
    if (!open) return;

    if (mode === 'create') {
      resetForm();
      return;
    }

    // Edit mode – populate from initialNote or fetch by noteId
    const populateFromNote = (note: Note) => {
      setTitle(note.title || '');
      setContent(note.note_details);
      setNoteType(note.note_type || 'general');
      setPriority(note.priority || 'normal');
      setNoteStatus(note.status || 'noted');
      setDuration(note.duration ? String(note.duration) : '');
      setIsPinned(note.is_pinned);
      if (note.parent_type === 'package_instance' && note.parent_id) {
        setSelectedPackageInstanceId(String(note.parent_id));
      } else {
        setSelectedPackageInstanceId('none');
      }
      // Dates
      if (note.started_date) {
        const d = new Date(note.started_date);
        setStartedDate(d);
        const h = d.getHours(); const m = d.getMinutes();
        const p = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12;
        setStartedTime({ hour: h12.toString().padStart(2, '0'), minute: m.toString().padStart(2, '0'), period: p });
      }
      if (note.completed_date) {
        const d = new Date(note.completed_date);
        setCompletedDate(d);
        const h = d.getHours(); const m = d.getMinutes();
        const p = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12;
        setCompletedTime({ hour: h12.toString().padStart(2, '0'), minute: m.toString().padStart(2, '0'), period: p });
      }
      if (note.assignees?.length) setAssignees(note.assignees);
      if (note.uploaded_files && note.file_names) {
        setExistingFiles(note.uploaded_files.map((path, idx) => ({ path, name: note.file_names?.[idx] || path })));
      }
      setFilesToRemove([]);
      setUploadedFiles([]);
      setTitleManuallyEdited(true); // don't overwrite existing title
    };

    if (initialNote) {
      populateFromNote(initialNote);
      return;
    }

    if (noteId) {
      setLoadingNote(true);
      supabase.from('notes').select('*').eq('id', noteId).single().then(({ data, error }) => {
        if (error || !data) {
          toast({ title: 'Error', description: 'Could not load note', variant: 'destructive' });
          onOpenChange(false);
          return;
        }
        populateFromNote(data as unknown as Note);
        setLoadingNote(false);
      });
    }
  }, [open, mode, noteId, initialNote, resetForm, toast, onOpenChange]);

  // Fetch package info for edit header
  useEffect(() => {
    if (!initialNote?.parent_type || initialNote.parent_type !== 'package_instance' || !initialNote.parent_id) {
      setSelectedPackageInfo(null);
      return;
    }
    const fetch = async () => {
      const { data: inst } = await supabase.from('package_instances').select('package_id').eq('id', initialNote.parent_id).single();
      if (inst?.package_id) {
        const { data: pkg } = await supabase.from('packages').select('name, full_text').eq('id', inst.package_id).single();
        if (pkg) setSelectedPackageInfo(pkg);
      }
    };
    fetch();
  }, [initialNote]);

  // ── Derived state ──
  const showsDuration = showDuration && DURATION_TYPES.includes(noteType);
  const getDefaultStatus = (type: string) => DURATION_TYPES.includes(type) ? 'completed' : 'noted';

  const handleNoteTypeChange = (type: string) => {
    setNoteType(type);
    if (mode === 'create') setNoteStatus(getDefaultStatus(type));
    if (type === 'email' && mode === 'create') setEmailMode('prompt');
    else setEmailMode(null);
  };

  // ── Timer handlers ──
  const handlePlayTimer = () => {
    setTimerStartTime(Date.now());
    setIsTimerRunning(true);
    if (!startedDate) {
      const now = new Date();
      setStartedDate(now);
      const h = now.getHours(); const m = now.getMinutes();
      const p = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12;
      setStartedTime({ hour: h12.toString().padStart(2, '0'), minute: m.toString().padStart(2, '0'), period: p });
    }
  };

  const handleStopTimer = () => {
    setIsTimerRunning(false);
    setAccumulatedTime(elapsedTime);
    const now = new Date();
    setCompletedDate(now);
    const h = now.getHours(); const m = now.getMinutes();
    const p = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12;
    setCompletedTime({ hour: h12.toString().padStart(2, '0'), minute: m.toString().padStart(2, '0'), period: p });
  };

  const calculateDuration = () => {
    if (startedDate && completedDate) {
      const c = (t: { hour: string; minute: string; period: string }) => {
        let h = parseInt(t.hour);
        if (t.period === 'PM' && h !== 12) h += 12;
        if (t.period === 'AM' && h === 12) h = 0;
        return { hour: h, minute: parseInt(t.minute) };
      };
      const s = c(startedTime); const e = c(completedTime);
      const sd = new Date(startedDate); sd.setHours(s.hour, s.minute, 0, 0);
      const ed = new Date(completedDate); ed.setHours(e.hour, e.minute, 0, 0);
      const diff = ed.getTime() - sd.getTime();
      if (diff < 0) return 'Invalid duration';
      return formatDuration(Math.floor(diff / 60000));
    }
    if (isTimerRunning) return formatElapsedTime(elapsedTime);
    if (elapsedTime > 0) return formatElapsedTime(elapsedTime);
    return 'No duration';
  };

  // ── File handling ──
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) setUploadedFiles(prev => [...prev, ...Array.from(files)]);
  };

  // ── Save ──
  const handleSave = async () => {
    if (!content.trim() || saving) return;
    setInternalSaving(true);
    try {
      await onSave({
        title,
        content,
        noteType,
        priority,
        status: noteStatus,
        duration,
        isPinned,
        packageInstanceId: selectedPackageInstanceId,
        startedDate,
        completedDate,
        startedTime,
        completedTime,
        uploadedFiles,
        existingFiles,
        filesToRemove,
        assignees,
        notifyUserIds,
        notifyClient,
        elapsedTimerSeconds: elapsedTime,
      });
    } finally {
      setInternalSaving(false);
    }
  };

  if (!open) return null;

  const fileInputId = `note-file-upload-${mode}-${noteId || 'new'}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm(); onOpenChange(o); }}>
      <DialogContent className="w-[90vw] max-w-[1400px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit Note' : 'Add Note'}</DialogTitle>
          {mode === 'edit' && selectedPackageInfo && (
            <DialogDescription asChild>
              <div className="flex items-center gap-2 mt-1">
                <Package className="h-4 w-4 text-primary" />
                <span className="font-medium text-primary">
                  {selectedPackageInfo.name} – {selectedPackageInfo.full_text}
                </span>
              </div>
            </DialogDescription>
          )}
        </DialogHeader>

        {loadingNote ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Row 1: Package, Type, Priority, Status */}
            <div className={`grid gap-4 ${
              showPackageSelector && activePackages.length > 0
                ? (showStatus ? 'grid-cols-4' : 'grid-cols-3')
                : (showStatus ? 'grid-cols-3' : 'grid-cols-2')
            }`}>
              {showPackageSelector && activePackages.length > 0 && (
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

              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={noteType} onValueChange={handleNoteTypeChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-background">
                    {noteTypeOpts.filter(t => t.code).map(type => {
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
                  <SelectTrigger><SelectValue placeholder="Normal" /></SelectTrigger>
                  <SelectContent className="bg-background">
                    {priorityOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {showStatus && (
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={noteStatus} onValueChange={setNoteStatus}>
                    <SelectTrigger><SelectValue placeholder="Select status..." /></SelectTrigger>
                    <SelectContent className="bg-background">
                      {noteStatusOpts.filter(opt => opt.code).map(opt => (
                        <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Email mode prompt */}
            {noteType === 'email' && emailMode === 'prompt' && mode === 'create' && onEmailSendNow && (
              <div className="bg-muted/50 border rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">How would you like to proceed?</p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => { setEmailMode('send_now'); onEmailSendNow(); }}>
                    <Mail className="h-3.5 w-3.5 mr-1.5" />Send Now
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEmailMode('already_sent')}>
                    Already Sent (Log only)
                  </Button>
                </div>
              </div>
            )}

            {/* Duration row */}
            {showsDuration && (
              <div className="grid gap-4 grid-cols-1 max-w-xs">
                <div className="space-y-2">
                  <Label>Duration (mins)</Label>
                  <Input type="number" min={0} step={15} value={duration} onChange={e => setDuration(e.target.value)} placeholder="0" />
                </div>
              </div>
            )}

            {/* Title */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Title (optional)</Label>
                {showAiTitle && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground italic">
                    {extractingTitle && <Loader2 className="h-3 w-3 animate-spin" />}
                    AI generated from Content
                  </span>
                )}
              </div>
              <Input
                value={title}
                onChange={e => { setTitle(e.target.value); setTitleManuallyEdited(true); }}
                placeholder={showAiTitle ? 'Auto-generated from content...' : 'Note title (optional)'}
              />
            </div>

            {/* Content / Rich Text Editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Content *</Label>
                {showSpeech && speech.isSupported && (
                  <Button
                    type="button"
                    variant={speech.isRecording ? 'destructive' : 'ghost'}
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
                    {speech.isRecording ? <><MicOff className="h-3.5 w-3.5" /> Stop</> : <><Mic className="h-3.5 w-3.5" /> Speak</>}
                  </Button>
                )}
              </div>
              <RichTextEditor
                value={speech.isRecording && speech.interimTranscript
                  ? (content ? `${content} ${speech.interimTranscript}` : speech.interimTranscript)
                  : content}
                onChange={setContent}
                minHeight="500px"
                className={speech.isRecording ? 'border-destructive' : ''}
                tenantId={tenantId}
              />
            </div>


            {/* Assignees (legacy – EditNoteDialog style) */}
            {showAssignees && (
              <div className="space-y-2">
                <Label>Assignees</Label>
                <div className="flex flex-wrap gap-2">
                  {vivacityTeam.map((user) => (
                    <Button
                      key={user.user_uuid}
                      type="button"
                      variant={assignees.includes(user.user_uuid) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAssignees(prev => prev.includes(user.user_uuid) ? prev.filter(id => id !== user.user_uuid) : [...prev, user.user_uuid])}
                      className="gap-1.5 text-[11px] h-7 px-2"
                    >
                      <Avatar className="h-4 w-4">
                        {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                        <AvatarFallback className="text-[9px]">{user.first_name?.[0]}{user.last_name?.[0]}</AvatarFallback>
                      </Avatar>
                      {user.first_name}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Notify (new style) */}
            {showNotify && mode === 'create' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-xs">
                    <Mail className="h-3 w-3" />
                    Notify (optional)
                  </Label>
                  <NotifyClientCheckbox checked={notifyClient} onCheckedChange={setNotifyClient} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {vivacityTeam.map((user) => (
                    <Button
                      key={user.user_uuid}
                      type="button"
                      variant={notifyUserIds.includes(user.user_uuid) ? 'default' : 'outline'}
                      onClick={() => setNotifyUserIds(prev =>
                        prev.includes(user.user_uuid) ? prev.filter(id => id !== user.user_uuid) : [...prev, user.user_uuid]
                      )}
                      className="h-7 px-2 gap-1 text-[11px]"
                    >
                      <Avatar className="h-4 w-4">
                        {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                        <AvatarFallback className="text-[8px]">{user.first_name?.[0]}{user.last_name?.[0]}</AvatarFallback>
                      </Avatar>
                      {user.first_name}
                    </Button>
                  ))}
                  {vivacityTeam.length === 0 && (
                    <span className="text-xs text-muted-foreground">No team members available</span>
                  )}
                </div>
              </div>
            )}

            {/* Pin + action buttons */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                {showPin && (
                  <>
                    <Switch id="pinned" checked={isPinned} onCheckedChange={setIsPinned} />
                    <Label htmlFor="pinned" className="cursor-pointer text-xs">Pin this note</Label>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => { resetForm(); onOpenChange(false); }}>
                  Cancel
                </Button>
                <Button size="sm" className="text-xs h-8" onClick={handleSave} disabled={!content.trim() || saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  {mode === 'edit' ? 'Update Note' : 'Create Note'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

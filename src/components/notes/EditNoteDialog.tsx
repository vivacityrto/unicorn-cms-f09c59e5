import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Note, useNotes, formatDuration, formatElapsedTime } from '@/hooks/useNotes';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Calendar as CalendarComponent, Play, Square, Upload, X, Loader2 } from 'lucide-react';

interface EditNoteDialogProps {
  noteId: string;
  tenantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function EditNoteDialog({ noteId, tenantId, open, onOpenChange, onSaved }: EditNoteDialogProps) {
  const { toast } = useToast();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState('');
  const [priority, setPriority] = useState('');
  const [startedDate, setStartedDate] = useState<Date>();
  const [startedTime, setStartedTime] = useState({ hour: '12', minute: '00', period: 'AM' });
  const [completedDate, setCompletedDate] = useState<Date>();
  const [completedTime, setCompletedTime] = useState({ hour: '12', minute: '00', period: 'AM' });
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<{ path: string; name: string }[]>([]);
  const [filesToRemove, setFilesToRemove] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [vivacityTeam, setVivacityTeam] = useState<Array<{ user_uuid: string; first_name: string; last_name: string; avatar_url: string | null }>>([]);

  // Timer
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerStartTime, setTimerStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [accumulatedTime, setAccumulatedTime] = useState(0);

  // Timer effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTimerRunning && timerStartTime) {
      interval = setInterval(() => {
        setElapsedTime(accumulatedTime + Math.floor((Date.now() - timerStartTime) / 1000));
      }, 100);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isTimerRunning, timerStartTime, accumulatedTime]);

  // Fetch note and team when opened
  useEffect(() => {
    if (!open || !noteId) return;
    setLoading(true);

    const fetchNote = async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', noteId)
        .single();

      if (error || !data) {
        toast({ title: 'Error', description: 'Could not load note', variant: 'destructive' });
        onOpenChange(false);
        return;
      }

      const noteData = data as unknown as Note;
      setNote(noteData);
      setNoteTitle(noteData.title || '');
      setNoteText(noteData.note_details);
      setNoteType(noteData.note_type || '');
      setPriority(noteData.priority || '');

      if (noteData.started_date) {
        const d = new Date(noteData.started_date);
        setStartedDate(d);
        const h = d.getHours(); const m = d.getMinutes();
        const p = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12;
        setStartedTime({ hour: h12.toString().padStart(2, '0'), minute: m.toString().padStart(2, '0'), period: p });
      }
      if (noteData.completed_date) {
        const d = new Date(noteData.completed_date);
        setCompletedDate(d);
        const h = d.getHours(); const m = d.getMinutes();
        const p = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 || 12;
        setCompletedTime({ hour: h12.toString().padStart(2, '0'), minute: m.toString().padStart(2, '0'), period: p });
      }
      if (noteData.assignees?.length > 0) setAssignees(noteData.assignees);
      if (noteData.uploaded_files && noteData.file_names) {
        setExistingFiles(noteData.uploaded_files.map((path, idx) => ({ path, name: noteData.file_names?.[idx] || path })));
      } else {
        setExistingFiles([]);
      }
      setFilesToRemove([]);
      setLoading(false);
    };

    const fetchTeam = async () => {
      const { data: teamData, error: teamErr } = await (supabase
        .from('users' as any)
        .select('user_uuid, first_name, last_name, avatar_url')
        .eq('account_type', 'vivacity')
        .eq('is_active', true)
        .order('first_name') as any);
      if (teamData) setVivacityTeam(teamData);
    };

    fetchNote();
    fetchTeam();
  }, [open, noteId]);

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

  const handleSave = async () => {
    if (!noteText.trim() || !note || saving) return;
    setSaving(true);
    try {
      const fileUrls: string[] = [];
      const fileNames: string[] = [];
      for (const file of uploadedFiles) {
        const fileName = `${Date.now()}-${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('tenant-note-files').upload(fileName, file);
        if (uploadError) throw uploadError;
        fileUrls.push(uploadData.path);
        fileNames.push(file.name);
      }

      const convert12To24 = (t: { hour: string; minute: string; period: string }) => {
        let h = parseInt(t.hour);
        if (t.period === 'PM' && h !== 12) h += 12;
        if (t.period === 'AM' && h === 12) h = 0;
        return `${h.toString().padStart(2, '0')}:${t.minute}`;
      };

      const remainingExisting = existingFiles.filter(f => !filesToRemove.includes(f.path));
      const allPaths = [...remainingExisting.map(f => f.path), ...fileUrls];
      const allNames = [...remainingExisting.map(f => f.name), ...fileNames];

      const { error } = await supabase.from('notes').update({
        title: noteTitle.trim() || null,
        note_details: noteText.trim(),
        note_type: noteType || null,
        priority: priority || null,
        started_date: startedDate ? `${format(startedDate, 'yyyy-MM-dd')}T${convert12To24(startedTime)}:00` : null,
        completed_date: completedDate ? `${format(completedDate, 'yyyy-MM-dd')}T${convert12To24(completedTime)}:00` : null,
        uploaded_files: allPaths.length > 0 ? allPaths : null,
        file_names: allNames.length > 0 ? allNames : null,
        assignees: assignees.length > 0 ? assignees : null,
      }).eq('id', note.id);

      if (error) throw error;
      toast({ title: 'Note updated' });
      onSaved?.();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) setUploadedFiles(prev => [...prev, ...Array.from(files)]);
  };

  const toggleAssignee = (userId: string) => {
    setAssignees(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] max-w-[1400px] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Note</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Note title (optional)" />
            </div>
            <div className="space-y-2">
              <Label>Note Details *</Label>
              <RichTextEditor value={noteText} onChange={setNoteText} placeholder="Enter note details..." minHeight="300px" tenantId={tenantId} />
            </div>
            <div className="grid grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Note Type</Label>
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="phone-call">Phone Call</SelectItem>
                    <SelectItem value="action">Action</SelectItem>
                    <SelectItem value="follow-up">Follow-up</SelectItem>
                    <SelectItem value="tenant">Tenant</SelectItem>
                    <SelectItem value="risk">Risk</SelectItem>
                    <SelectItem value="escalation">Escalation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Started Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startedDate && "text-muted-foreground")}>
                      <CalendarComponent className="mr-2 h-4 w-4" />{startedDate ? format(startedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={startedDate} onSelect={setStartedDate} /></PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Completed Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !completedDate && "text-muted-foreground")}>
                      <CalendarComponent className="mr-2 h-4 w-4" />{completedDate ? format(completedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={completedDate} onSelect={setCompletedDate} /></PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Timer</Label>
                <div className="flex items-center gap-2">
                  {!isTimerRunning ? (
                    <Button type="button" variant="outline" size="sm" onClick={handlePlayTimer} className="gap-1.5"><Play className="h-3.5 w-3.5" />Start</Button>
                  ) : (
                    <Button type="button" variant="outline" size="sm" onClick={handleStopTimer} className="gap-1.5"><Square className="h-3.5 w-3.5" />Stop</Button>
                  )}
                  <span className="text-xs text-muted-foreground">{calculateDuration()}</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Files</Label>
              <div className="border rounded-lg p-4">
                <input type="file" multiple onChange={handleFileUpload} className="hidden" id="file-upload-edit-note-dialog" />
                <label htmlFor="file-upload-edit-note-dialog" className="flex items-center justify-center gap-2 cursor-pointer p-4 border-2 border-dashed rounded-lg hover:bg-muted/50">
                  <Upload className="h-5 w-5 text-muted-foreground" /><span className="text-sm text-muted-foreground">Click to upload files</span>
                </label>
                {(uploadedFiles.length > 0 || existingFiles.length > 0) && (
                  <div className="mt-3 space-y-2">
                    {existingFiles.filter(f => !filesToRemove.includes(f.path)).map((file, index) => (
                      <div key={`existing-${index}`} className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-sm truncate">{file.name}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setFilesToRemove(prev => [...prev, file.path])}><X className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    {uploadedFiles.map((file, index) => (
                      <div key={`new-${index}`} className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-sm truncate">{file.name}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assignees</Label>
              <div className="flex flex-wrap gap-2">
                {vivacityTeam.map((user) => (
                  <Button key={user.user_uuid} type="button" variant={assignees.includes(user.user_uuid) ? "default" : "outline"} size="sm" onClick={() => toggleAssignee(user.user_uuid)} className="gap-1.5 text-[11px] h-7 px-2">
                    <Avatar className="h-4 w-4">{user.avatar_url && <AvatarImage src={user.avatar_url} />}<AvatarFallback className="text-[9px]">{user.first_name?.[0]}{user.last_name?.[0]}</AvatarFallback></Avatar>
                    {user.first_name}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!noteText.trim() || saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Update Note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

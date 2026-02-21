import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, StickyNote, Calendar as CalendarComponent, X, Upload, Flag, Play, Square, Timer, CheckCircle2, Clock, Building2, Search, ArrowUpDown, Loader2, ExternalLink, MessageSquare, ListTodo } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useNotes, Note, filterNotes, formatDuration, formatElapsedTime } from "@/hooks/useNotes";

interface ClickUpTask {
  id: string;
  task_custom_id: string | null;
  task_name: string | null;
  task_content: string | null;
  date_created: string | null;
  comments: unknown;
  status: string | null;
  priority: string | null;
  list_name: string | null;
  space_name: string | null;
}

export default function TenantNotes() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const parsedTenantId = tenantId ? parseInt(tenantId) : 0;
  const urlPackageId = searchParams.get('packageId');
  const parsedPackageId = urlPackageId ? parseInt(urlPackageId) : undefined;
  
  // Use the unified notes hook
  const { notes, loading, totalDuration, createNote, updateNote, deleteNote, refresh } = useNotes({
    parentType: 'tenant',
    parentId: parsedTenantId,
    tenantId: parsedTenantId,
    packageId: parsedPackageId
  });

  // Local UI state
  const [tenantName, setTenantName] = useState("");
  const [packageAbbr, setPackageAbbr] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("");
  const [priority, setPriority] = useState("");
  const [startedDate, setStartedDate] = useState<Date>();
  const [startedTime, setStartedTime] = useState({ hour: "12", minute: "00", period: "AM" });
  const [completedDate, setCompletedDate] = useState<Date>();
  const [completedTime, setCompletedTime] = useState({ hour: "12", minute: "00", period: "AM" });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<{ path: string; name: string }[]>([]);
  const [filesToRemove, setFilesToRemove] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [vivacityTeam, setVivacityTeam] = useState<Array<{ user_uuid: string; first_name: string; last_name: string; avatar_url: string | null }>>([]);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerStartTime, setTimerStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [accumulatedTime, setAccumulatedTime] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortPriority, setSortPriority] = useState<string>("all");
  const [saving, setSaving] = useState(false);
  const [noteSource, setNoteSource] = useState<'notes' | 'clickup'>("notes");
  const [clickupTasks, setClickupTasks] = useState<ClickUpTask[]>([]);
  const [clickupLoading, setClickupLoading] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Filter notes
  const filteredNotes = filterNotes(notes, { searchQuery, priority: sortPriority }).sort((a, b) => {
    if (sortPriority !== "all") {
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4;
      const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4;
      return aPriority - bPriority;
    }
    return 0;
  });

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning && timerStartTime) {
      interval = setInterval(() => {
        setElapsedTime(accumulatedTime + (Date.now() - timerStartTime));
      }, 100);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isTimerRunning, timerStartTime, accumulatedTime]);

  const handlePlayTimer = () => {
    const now = Date.now();
    setTimerStartTime(now);
    setIsTimerRunning(true);
    if (!startedDate) {
      const currentDate = new Date();
      setStartedDate(currentDate);
      const hours = currentDate.getHours();
      const minutes = currentDate.getMinutes();
      const period = hours >= 12 ? "PM" : "AM";
      const hour12 = hours % 12 || 12;
      setStartedTime({ hour: hour12.toString().padStart(2, "0"), minute: minutes.toString().padStart(2, "0"), period });
    }
  };

  const handleStopTimer = () => {
    setIsTimerRunning(false);
    setAccumulatedTime(elapsedTime);
    const currentDate = new Date();
    setCompletedDate(currentDate);
    const hours = currentDate.getHours();
    const minutes = currentDate.getMinutes();
    const period = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    setCompletedTime({ hour: hour12.toString().padStart(2, "0"), minute: minutes.toString().padStart(2, "0"), period });
  };

  const calculateDuration = () => {
    if (startedDate && completedDate) {
      const convert12To24 = (time: { hour: string; minute: string; period: string }) => {
        let hour = parseInt(time.hour);
        if (time.period === "PM" && hour !== 12) hour += 12;
        if (time.period === "AM" && hour === 12) hour = 0;
        return { hour, minute: parseInt(time.minute) };
      };
      const startTime = convert12To24(startedTime);
      const endTime = convert12To24(completedTime);
      const startDateTime = new Date(startedDate);
      startDateTime.setHours(startTime.hour, startTime.minute, 0, 0);
      const endDateTime = new Date(completedDate);
      endDateTime.setHours(endTime.hour, endTime.minute, 0, 0);
      const diffMs = endDateTime.getTime() - startDateTime.getTime();
      if (diffMs < 0) return "Invalid duration";
      return formatDuration(Math.floor(diffMs / 60000));
    }
    if (isTimerRunning) return formatElapsedTime(elapsedTime);
    if (elapsedTime > 0) return formatElapsedTime(elapsedTime);
    return "No duration";
  };

  useEffect(() => {
    if (parsedTenantId) {
      fetchTenantInfo();
      getCurrentUser();
      fetchVivacityTeam();
    }
  }, [parsedTenantId, urlPackageId]);

  useEffect(() => {
    if (noteSource === 'clickup' && parsedTenantId) {
      fetchClickupTasks();
    }
  }, [noteSource, parsedTenantId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      setAssignees([user.id]);
    }
  };

  const fetchVivacityTeam = async () => {
    try {
      const { data, error } = await supabase.from("users")
        .select("user_uuid, first_name, last_name, avatar_url")
        .in("unicorn_role", ["Super Admin", "Team Leader", "Team Member"])
        .order("first_name");
      if (error) throw error;
      setVivacityTeam(data || []);
    } catch (error: any) {
      console.error("Error fetching team:", error);
    }
  };

  const fetchClickupTasks = async () => {
    setClickupLoading(true);
    try {
      const { data, error } = await supabase
        .from('v_clickup_tasks' as never)
        .select('id, task_custom_id, task_name, task_content, date_created, status, priority, list_name, space_name')
        .eq('tenant_id', parsedTenantId)
        .order('date_created', { ascending: false });
      if (error) throw error;
      setClickupTasks(((data || []) as unknown) as ClickUpTask[]);
    } catch (err: any) {
      console.error('Error fetching ClickUp tasks:', err);
      setClickupTasks([]);
    } finally {
      setClickupLoading(false);
    }
  };

  const fetchTenantInfo = async () => {
    const pkgId = urlPackageId ? parseInt(urlPackageId) : null;
    // Fetch tenant name
    const { data: tenantData } = await supabase.from("tenants").select("name").eq("id", parsedTenantId).single();
    if (tenantData) setTenantName(tenantData.name);
    
    if (pkgId) {
      const { data: pkgData } = await supabase.from("packages").select("name").eq("id", pkgId).single();
      if (pkgData) setPackageAbbr(pkgData.name);
    } else {
      // Fetch active package via package_instances (source of truth)
      const { data: instanceData } = await supabase
        .from('package_instances')
        .select('package_id')
        .eq('tenant_id', parsedTenantId)
        .eq('is_complete', false)
        .limit(1)
        .maybeSingle();
      
      if (instanceData?.package_id) {
        const { data: pkgData } = await supabase.from("packages").select("name").eq("id", instanceData.package_id).single();
        if (pkgData) setPackageAbbr(pkgData.name);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) setUploadedFiles(prev => [...prev, ...Array.from(files)]);
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddNote = async () => {
    if (!noteText.trim() || !parsedTenantId || saving) return;
    setSaving(true);
    try {
      const fileUrls: string[] = [];
      const fileNames: string[] = [];
      if (uploadedFiles.length > 0) {
        for (const file of uploadedFiles) {
          const fileName = `${Date.now()}-${file.name}`;
          const { data: uploadData, error: uploadError } = await supabase.storage.from('tenant-note-files').upload(fileName, file);
          if (uploadError) throw uploadError;
          fileUrls.push(uploadData.path);
          fileNames.push(file.name);
        }
      }

      const convert12To24 = (time: { hour: string; minute: string; period: string }) => {
        let hour = parseInt(time.hour);
        if (time.period === "PM" && hour !== 12) hour += 12;
        if (time.period === "AM" && hour === 12) hour = 0;
        return `${hour.toString().padStart(2, "0")}:${time.minute}`;
      };

      let startedDateTime = startedDate ? `${format(startedDate, "yyyy-MM-dd")}T${convert12To24(startedTime)}:00` : undefined;
      let completedDateTime = completedDate ? `${format(completedDate, "yyyy-MM-dd")}T${convert12To24(completedTime)}:00` : undefined;

      const remainingExistingFiles = existingFiles.filter(f => !filesToRemove.includes(f.path));
      const allFilePaths = [...remainingExistingFiles.map(f => f.path), ...fileUrls];
      const allFileNames = [...remainingExistingFiles.map(f => f.name), ...fileNames];

      const noteData = {
        note_details: noteText.trim(),
        note_type: noteType || undefined,
        priority: priority || undefined,
        started_date: startedDateTime,
        completed_date: completedDateTime,
        uploaded_files: allFilePaths.length > 0 ? allFilePaths : undefined,
        file_names: allFileNames.length > 0 ? allFileNames : undefined,
        assignees: assignees.length > 0 ? assignees : undefined,
        package_id: parsedPackageId
      };

      if (selectedNote) {
        await updateNote(selectedNote.id, noteData);
      } else {
        await createNote(noteData);
      }
      resetForm();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setNoteText("");
    setNoteType("");
    setPriority("");
    setStartedDate(undefined);
    setStartedTime({ hour: "12", minute: "00", period: "AM" });
    setCompletedDate(undefined);
    setCompletedTime({ hour: "12", minute: "00", period: "AM" });
    setUploadedFiles([]);
    setExistingFiles([]);
    setFilesToRemove([]);
    setAssignees(currentUserId ? [currentUserId] : []);
    setSelectedNote(null);
    setIsTimerRunning(false);
    setTimerStartTime(null);
    setElapsedTime(0);
    setAccumulatedTime(0);
    setIsAddDialogOpen(false);
  };

  const handleDeleteNote = async () => {
    if (!selectedNote) return;
    try {
      await deleteNote(selectedNote.id);
      setSelectedNote(null);
      setIsDeleteDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const openEditDialog = (note: Note) => {
    setSelectedNote(note);
    setNoteText(note.note_details);
    setNoteType(note.note_type || "");
    setPriority(note.priority || "");
    if (note.started_date) {
      const startDate = new Date(note.started_date);
      setStartedDate(startDate);
      const hours = startDate.getHours();
      const minutes = startDate.getMinutes();
      const period = hours >= 12 ? "PM" : "AM";
      const hour12 = hours % 12 || 12;
      setStartedTime({ hour: hour12.toString().padStart(2, "0"), minute: minutes.toString().padStart(2, "0"), period });
    }
    if (note.completed_date) {
      const completeDate = new Date(note.completed_date);
      setCompletedDate(completeDate);
      const hours = completeDate.getHours();
      const minutes = completeDate.getMinutes();
      const period = hours >= 12 ? "PM" : "AM";
      const hour12 = hours % 12 || 12;
      setCompletedTime({ hour: hour12.toString().padStart(2, "0"), minute: minutes.toString().padStart(2, "0"), period });
    }
    if (note.assignees && note.assignees.length > 0) setAssignees(note.assignees);
    if (note.uploaded_files && note.file_names) {
      setExistingFiles(note.uploaded_files.map((path, idx) => ({ path, name: note.file_names?.[idx] || path })));
    } else {
      setExistingFiles([]);
    }
    setFilesToRemove([]);
    setIsAddDialogOpen(true);
  };

  const toggleAssignee = (userId: string) => {
    setAssignees(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const getPriorityBadge = (priority: string | null) => {
    switch (priority) {
      case 'urgent': return <Badge className="bg-red-100 text-red-700 border-red-200"><Flag className="h-3 w-3 mr-1 fill-red-500" />Urgent</Badge>;
      case 'high': return <Badge className="bg-orange-100 text-orange-700 border-orange-200"><Flag className="h-3 w-3 mr-1 fill-orange-500" />High</Badge>;
      case 'normal': return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="h-3 w-3 mr-1" />Normal</Badge>;
      case 'low': return <Badge className="bg-blue-100 text-blue-700 border-blue-200"><Clock className="h-3 w-3 mr-1" />Low</Badge>;
      default: return <span className="text-sm text-muted-foreground">Not set</span>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        {/* Back Button */}
        <Button variant="ghost" onClick={() => navigate(`/tenant/${tenantId}`)} className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{ boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)", border: "1px solid #00000052" }}>
          <ArrowLeft className="h-4 w-4" />Back
        </Button>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground pb-2.5">{packageAbbr ? `${packageAbbr} Notes` : "Notes"}</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Building2 className="h-4 w-4" />{tenantName}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {noteSource === 'notes' && (
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[0.8rem] py-1.5 px-3 rounded-full font-medium gap-2">
                <Timer className="h-4 w-4" />
                <span>Package used: {formatDuration(totalDuration)}</span>
              </Badge>
            )}
            {noteSource === 'notes' && (
              <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2"><Plus className="h-4 w-4" />Add Note</Button>
            )}
          </div>
        </div>

        {/* Source + Search + Sort bar */}
        <div className="flex flex-col md:flex-row gap-4">
          {/* Source selector */}
          <Select value={noteSource} onValueChange={(v) => setNoteSource(v as 'notes' | 'clickup')}>
            <SelectTrigger className="w-full md:w-[200px] h-[48px]">
              <div className="flex items-center gap-2">
                {noteSource === 'notes' ? <StickyNote className="h-4 w-4 text-muted-foreground" /> : <ListTodo className="h-4 w-4 text-muted-foreground" />}
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="notes">All Notes</SelectItem>
              <SelectItem value="clickup">ClickUp Tasks</SelectItem>
            </SelectContent>
          </Select>

          {noteSource === 'notes' && (
            <>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search keyword or by name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 h-[48px]" />
              </div>
              <Select value={sortPriority} onValueChange={setSortPriority}>
                <SelectTrigger className="w-full md:w-[220px] h-[48px]">
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder="All Priorities" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-background">
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectSeparator />
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          {noteSource === 'clickup' && (
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search tasks..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 h-[48px]" />
            </div>
          )}
        </div>

        {/* Notes Table */}
        {noteSource === 'notes' && (
        <Card className="border shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              </div>
            ) : filteredNotes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <StickyNote className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-1">{notes.length === 0 ? "No notes yet" : "No matching notes"}</h3>
                <p className="text-sm text-muted-foreground mb-4">{notes.length === 0 ? "Add your first note to get started" : "Try adjusting your search or filter"}</p>
                {notes.length === 0 && <Button onClick={() => setIsAddDialogOpen(true)} variant="outline" className="gap-2"><Plus className="h-4 w-4" />Add Note</Button>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Created By</TableHead>
                      <TableHead className="font-semibold">Note Type</TableHead>
                      <TableHead className="font-semibold">Note Details</TableHead>
                      <TableHead className="font-semibold">Priority</TableHead>
                      <TableHead className="font-semibold">Started</TableHead>
                      <TableHead className="font-semibold">Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNotes.map((note) => (
                      <TableRow key={note.id} onClick={() => openEditDialog(note)} className="hover:bg-muted/30 cursor-pointer">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              {note.creator?.avatar_url && <AvatarImage src={note.creator.avatar_url} />}
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {note.creator ? `${note.creator.first_name?.[0] || ''}${note.creator.last_name?.[0] || ''}`.toUpperCase() : 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium">{note.creator ? `${note.creator.first_name || ''} ${note.creator.last_name || ''}`.trim() || 'Unknown' : 'Unknown User'}</p>
                              <p className="text-xs text-muted-foreground">{note.creator?.email || ''}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium capitalize">{note.note_type || 'Not specified'}</span>
                            <span className="text-xs text-muted-foreground">Created {format(new Date(note.created_at), "dd/MM/yyyy")}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md"><p className="text-sm text-muted-foreground truncate">{note.note_details}</p></TableCell>
                        <TableCell>{getPriorityBadge(note.priority)}</TableCell>
                        <TableCell>
                          {note.started_date ? (
                            <div className="flex flex-col gap-1 text-xs">
                              <span>{format(new Date(note.started_date), "dd MMM yyyy")}</span>
                              <span className="text-muted-foreground">{format(new Date(note.started_date), "h:mm a")}</span>
                            </div>
                          ) : 'Not started'}
                        </TableCell>
                        <TableCell>
                          {note.completed_date ? (
                            <div className="flex flex-col gap-1 text-xs">
                              <span>{format(new Date(note.completed_date), "dd MMM yyyy")}</span>
                              <span className="text-muted-foreground">{format(new Date(note.completed_date), "h:mm a")}</span>
                            </div>
                          ) : 'Not completed'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* ClickUp Tasks Table */}
        {noteSource === 'clickup' && (
        <Card className="border shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {clickupLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              </div>
            ) : clickupTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ListTodo className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-1">No ClickUp tasks found</h3>
                <p className="text-sm text-muted-foreground">No tasks are linked to this tenant in ClickUp.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Task Name</TableHead>
                      <TableHead className="font-semibold">Content</TableHead>
                      <TableHead className="font-semibold">Date Created</TableHead>
                      <TableHead className="font-semibold">Comments</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">List</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clickupTasks
                      .filter(t => !searchQuery || (t.task_name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (t.task_content || '').toLowerCase().includes(searchQuery.toLowerCase()))
                      .map((task) => {
                        const commentList = Array.isArray(task.comments) ? task.comments as Array<{comment_text?: string; date?: string; user?: {username?: string}}> : [];
                        const isExpanded = expandedTaskId === task.id;
                        return (
                          <>
                            <TableRow
                              key={task.id}
                              className="hover:bg-muted/30 cursor-pointer"
                              onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                            >
                              <TableCell className="font-medium max-w-[200px]">
                                <p className="truncate text-sm font-medium">
                                  {[task.task_custom_id, task.task_name].filter(Boolean).join(' - ') || '—'}
                                </p>
                              </TableCell>
                              <TableCell className="max-w-[280px]">
                                <p className="text-sm text-muted-foreground line-clamp-2">{task.task_content || '—'}</p>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                {task.date_created
                                  ? format(new Date(Number(task.date_created) > 1e12 ? Number(task.date_created) : task.date_created), 'dd MMM yyyy')
                                  : '—'}
                              </TableCell>
                              <TableCell>
                                {commentList.length > 0 ? (
                                  <Badge variant="outline" className="gap-1 text-xs">
                                    <MessageSquare className="h-3 w-3" />
                                    {commentList.length}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs">None</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {task.status && (
                                  <Badge variant="outline" className="text-xs capitalize">{task.status}</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{task.list_name || '—'}</TableCell>
                            </TableRow>
                            {isExpanded && (task.task_content || commentList.length > 0) && (
                              <TableRow key={`${task.id}-expanded`} className="bg-muted/20">
                                <TableCell colSpan={6} className="p-4">
                                  {task.task_content && (
                                    <div className="mb-3">
                                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Task Content</p>
                                      <p className="text-sm whitespace-pre-wrap">{task.task_content}</p>
                                    </div>
                                  )}
                                  {commentList.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Comments ({commentList.length})</p>
                                      <div className="space-y-2">
                                        {commentList.map((c, idx) => (
                                          <div key={idx} className="flex gap-3 p-2 bg-background rounded border text-sm">
                                            <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              {c.user?.username && <p className="text-xs font-medium text-muted-foreground mb-0.5">{c.user.username}</p>}
                                              <p className="text-sm">{c.comment_text || '—'}</p>
                                              {c.date && (
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                  {format(new Date(Number(c.date)), 'dd MMM yyyy, h:mm a')}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            )}
                          </>
                        );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {/* Add/Edit Note Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsAddDialogOpen(open); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{selectedNote ? 'Edit Note' : 'Add Note'}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Note Details *</Label>
                <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Enter note details..." rows={4} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Note Type</Label>
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
                <div className="space-y-2">
                  <Label>Priority</Label>
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Started Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startedDate && "text-muted-foreground")}>
                        <CalendarComponent className="mr-2 h-4 w-4" />{startedDate ? format(startedDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={startedDate} onSelect={setStartedDate} /></PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Completed Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !completedDate && "text-muted-foreground")}>
                        <CalendarComponent className="mr-2 h-4 w-4" />{completedDate ? format(completedDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={completedDate} onSelect={setCompletedDate} /></PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Timer</Label>
                <div className="flex items-center gap-4">
                  {!isTimerRunning ? (
                    <Button type="button" variant="outline" onClick={handlePlayTimer} className="gap-2"><Play className="h-4 w-4" />Start Timer</Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={handleStopTimer} className="gap-2"><Square className="h-4 w-4" />Stop Timer</Button>
                  )}
                  <span className="text-sm text-muted-foreground">Duration: {calculateDuration()}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Files</Label>
                <div className="border rounded-lg p-4">
                  <input type="file" multiple onChange={handleFileUpload} className="hidden" id="file-upload-tn" />
                  <label htmlFor="file-upload-tn" className="flex items-center justify-center gap-2 cursor-pointer p-4 border-2 border-dashed rounded-lg hover:bg-muted/50">
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
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveFile(index)}><X className="h-4 w-4" /></Button>
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
                    <Button key={user.user_uuid} type="button" variant={assignees.includes(user.user_uuid) ? "default" : "outline"} size="sm" onClick={() => toggleAssignee(user.user_uuid)} className="gap-2">
                      <Avatar className="h-5 w-5">{user.avatar_url && <AvatarImage src={user.avatar_url} />}<AvatarFallback className="text-[10px]">{user.first_name?.[0]}{user.last_name?.[0]}</AvatarFallback></Avatar>
                      {user.first_name} {user.last_name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { resetForm(); setIsAddDialogOpen(false); }}>Cancel</Button>
              <Button onClick={handleAddNote} disabled={!noteText.trim() || saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {selectedNote ? 'Update Note' : 'Add Note'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Note</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to delete this note? This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteNote} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

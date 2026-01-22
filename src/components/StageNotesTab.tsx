import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle, DialogFooter, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectSeparator } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Plus, Pencil, Trash2, Calendar as CalendarIcon, Flag, Clock, StickyNote, FileText, Users, RefreshCw, AlertCircle, Phone, MoreHorizontal, Play, Square, Timer, CheckCircle2, Upload, X, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { useNotes, Note, formatDuration, formatElapsedTime } from "@/hooks/useNotes";

interface StageNotesTabProps {
  stageId: number;
  tenantId: number;
  packageId: number;
}

export function StageNotesTab({ stageId, tenantId, packageId }: StageNotesTabProps) {
  const { toast } = useToast();
  
  // Use the unified notes hook with parent_type='stage'
  const { notes, loading, createNote, updateNote, deleteNote, refresh } = useNotes({
    parentType: 'stage',
    parentId: stageId,
    tenantId,
    packageId
  });

  // Local UI state
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
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    fetchVivacityTeam();
    getCurrentUser();
  }, [stageId, tenantId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning && timerStartTime) {
      interval = setInterval(() => {
        setElapsedTime(accumulatedTime + (Date.now() - timerStartTime));
      }, 100);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isTimerRunning, timerStartTime, accumulatedTime]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      setAssignees([user.id]);
    }
  };

  const fetchVivacityTeam = async () => {
    try {
      const { data, error } = await supabase.from("users").select("user_uuid, first_name, last_name, avatar_url").in("unicorn_role", ["Super Admin", "Team Leader", "Team Member"]).order("first_name");
      if (error) throw error;
      setVivacityTeam(data || []);
    } catch (error: any) {
      console.error("Error fetching team:", error);
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
    setSelectedNote(null);
    setUploadedFiles([]);
    setExistingFiles([]);
    setFilesToRemove([]);
    setAssignees(currentUserId ? [currentUserId] : []);
    setIsTimerRunning(false);
    setTimerStartTime(null);
    setElapsedTime(0);
    setAccumulatedTime(0);
  };

  const handleOpenDialog = (note?: Note) => {
    if (note) {
      setSelectedNote(note);
      setNoteText(note.note_details);
      setNoteType(note.note_type || "");
      setPriority(note.priority || "");
      if (note.started_date) {
        const startDate = new Date(note.started_date);
        setStartedDate(startDate);
        const hours = startDate.getHours();
        const mins = startDate.getMinutes();
        setStartedTime({ hour: (hours % 12 || 12).toString().padStart(2, "0"), minute: mins.toString().padStart(2, "0"), period: hours >= 12 ? "PM" : "AM" });
      }
      if (note.completed_date) {
        const endDate = new Date(note.completed_date);
        setCompletedDate(endDate);
        const hours = endDate.getHours();
        const mins = endDate.getMinutes();
        setCompletedTime({ hour: (hours % 12 || 12).toString().padStart(2, "0"), minute: mins.toString().padStart(2, "0"), period: hours >= 12 ? "PM" : "AM" });
      }
      setAssignees(note.assignees || []);
      if (note.uploaded_files && note.file_names) {
        setExistingFiles(note.uploaded_files.map((path, i) => ({ path, name: note.file_names?.[i] || path })));
      }
    } else {
      resetForm();
    }
    setIsAddDialogOpen(true);
  };

  const handlePlayTimer = () => {
    const now = Date.now();
    setTimerStartTime(now);
    setIsTimerRunning(true);
    if (!startedDate) {
      const currentDate = new Date();
      setStartedDate(currentDate);
      const hours = currentDate.getHours();
      const minutes = currentDate.getMinutes();
      setStartedTime({ hour: (hours % 12 || 12).toString().padStart(2, "0"), minute: minutes.toString().padStart(2, "0"), period: hours >= 12 ? "PM" : "AM" });
    }
  };

  const handleStopTimer = () => {
    setIsTimerRunning(false);
    setAccumulatedTime(elapsedTime);
    const currentDate = new Date();
    setCompletedDate(currentDate);
    const hours = currentDate.getHours();
    const minutes = currentDate.getMinutes();
    setCompletedTime({ hour: (hours % 12 || 12).toString().padStart(2, "0"), minute: minutes.toString().padStart(2, "0"), period: hours >= 12 ? "PM" : "AM" });
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
    if (isTimerRunning || elapsedTime > 0) return formatElapsedTime(elapsedTime);
    return "No duration";
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) setUploadedFiles(prev => [...prev, ...Array.from(files)]);
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveExistingFile = (path: string) => {
    setFilesToRemove(prev => [...prev, path]);
    setExistingFiles(prev => prev.filter(f => f.path !== path));
  };

  const handleSaveNote = async () => {
    if (!noteText.trim() || saving) return;
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
        package_id: packageId
      };

      if (selectedNote) {
        await updateNote(selectedNote.id, noteData);
      } else {
        await createNote(noteData);
      }
      setIsAddDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error("Error saving note:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async () => {
    if (!selectedNote) return;
    try {
      await deleteNote(selectedNote.id);
      setIsDeleteDialogOpen(false);
      setSelectedNote(null);
    } catch (error: any) {
      console.error("Error deleting note:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const toggleAssignee = async (userId: string) => {
    const isAdding = !assignees.includes(userId);
    setAssignees(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
    
    if (isAdding && userId !== currentUserId) {
      try {
        const currentUserData = vivacityTeam.find(u => u.user_uuid === currentUserId);
        await supabase.from("user_notifications").insert({
          user_id: userId,
          tenant_id: tenantId,
          type: "follower",
          title: "You've been added as a follower",
          message: `${currentUserData?.first_name || 'Someone'} ${currentUserData?.last_name || ''} added you as a follower on a stage note.`,
          created_by: currentUserId
        });
      } catch (error) {
        console.error("Error sending notification:", error);
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="gap-2" onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4" />Add Note
        </Button>
      </div>

      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-b-2 hover:bg-transparent">
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-12">#</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">Note</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-28">Type</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-28">Priority</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-44">Started</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-44">Completed</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-28">Files</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-28">Assignees</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-24">Duration</TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : notes.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">No notes have been added yet.</TableCell></TableRow>
              ) : notes.map((note, index) => (
                <TableRow key={note.id} className="hover:bg-muted/50 cursor-pointer transition-colors">
                  <TableCell className="font-medium text-muted-foreground border-r">{index + 1}</TableCell>
                  <TableCell className="border-r max-w-xs"><p className="truncate">{note.note_details}</p></TableCell>
                  <TableCell className="border-r">
                    {note.note_type ? (
                      <div className="flex items-center gap-1.5">
                        {note.note_type === "general" && <FileText className="h-3.5 w-3.5 text-blue-500" />}
                        {note.note_type === "meeting" && <Users className="h-3.5 w-3.5 text-purple-500" />}
                        {note.note_type === "follow-up" && <RefreshCw className="h-3.5 w-3.5 text-orange-500" />}
                        {note.note_type === "action" && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                        {note.note_type === "phone-call" && <Phone className="h-3.5 w-3.5 text-green-500" />}
                        <span className="text-sm capitalize">{note.note_type.replace("-", " ")}</span>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="border-r">
                    {note.priority ? (
                      <Badge variant="outline" className={cn("text-xs py-0.5 px-2 rounded-full",
                        note.priority === 'urgent' && "bg-red-50 text-red-700 border-red-200",
                        note.priority === 'high' && "bg-orange-50 text-orange-700 border-orange-200",
                        note.priority === 'normal' && "bg-blue-50 text-blue-700 border-blue-200",
                        note.priority === 'low' && "bg-gray-50 text-gray-700 border-gray-200"
                      )}>
                        <span className="capitalize">{note.priority}</span>
                      </Badge>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="border-r whitespace-nowrap">
                    {note.started_date ? (
                      <div className="flex items-center gap-2 text-sm">
                        <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{format(new Date(note.started_date), "dd MMM yyyy h:mm a")}</span>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="border-r whitespace-nowrap">
                    {note.completed_date ? (
                      <div className="flex items-center gap-2 text-sm">
                        <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{format(new Date(note.completed_date), "dd MMM yyyy h:mm a")}</span>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="border-r">
                    {note.uploaded_files && note.uploaded_files.length > 0 ? (
                      <Badge variant="outline" className="gap-1"><Paperclip className="h-3 w-3" />{note.uploaded_files.length}</Badge>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="border-r">
                    {note.assignees && note.assignees.length > 0 ? (
                      <div className="flex items-center -space-x-2">
                        {note.assignees.slice(0, 3).map(assigneeId => {
                          const user = vivacityTeam.find(u => u.user_uuid === assigneeId);
                          return (
                            <Avatar key={assigneeId} className="h-7 w-7 border-2 border-background">
                              {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
                              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                {user ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}` : 'U'}
                              </AvatarFallback>
                            </Avatar>
                          );
                        })}
                        {note.assignees.length > 3 && <Avatar className="h-7 w-7 border-2 border-background"><AvatarFallback className="text-xs bg-muted">+{note.assignees.length - 3}</AvatarFallback></Avatar>}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="border-r whitespace-nowrap">
                    {note.started_date && note.completed_date ? (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{formatDuration(Math.floor((new Date(note.completed_date).getTime() - new Date(note.started_date).getTime()) / 60000))}</span>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenDialog(note)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setSelectedNote(note); setIsDeleteDialogOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Note Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={open => { setIsAddDialogOpen(open); if (!open) resetForm(); }}>
        <DialogPortal>
          <DialogOverlay className="z-[70] bg-black/70" />
          <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[70] flex flex-col w-full max-h-[85vh] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden border bg-background p-6 shadow-lg sm:rounded-lg" style={{ width: '650px', maxWidth: '90vw' }}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><StickyNote className="h-5 w-5" />{selectedNote ? "Edit Note" : "Add New Note"}</DialogTitle>
            </DialogHeader>
            <Separator />
            <div className="overflow-y-auto flex-1 space-y-5 py-4 px-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Note Type</Label>
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="phone-call">Phone Call</SelectItem>
                      <SelectItem value="follow-up">Follow-up</SelectItem>
                      <SelectItem value="action">Action</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger><SelectValue placeholder="Select priority..." /></SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Note Details *</Label>
                <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Enter note details..." rows={4} />
              </div>
              <div className="space-y-2">
                <Label>Timer</Label>
                <div className="flex items-center gap-4">
                  {!isTimerRunning ? (
                    <Button type="button" variant="outline" onClick={handlePlayTimer} className="gap-2"><Play className="h-4 w-4" />Start</Button>
                  ) : (
                    <Button type="button" variant="outline" onClick={handleStopTimer} className="gap-2"><Square className="h-4 w-4" />Stop</Button>
                  )}
                  <span className="text-sm text-muted-foreground">Duration: {calculateDuration()}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Assignees</Label>
                <div className="flex flex-wrap gap-2">
                  {vivacityTeam.map(user => (
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
              <Button onClick={handleSaveNote} disabled={!noteText.trim() || saving}>{selectedNote ? 'Update Note' : 'Add Note'}</Button>
            </DialogFooter>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Note</AlertDialogTitle>
            <AlertDialogDescription>Are you sure? This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteNote} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

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
import { Plus, Pencil, Trash2, Calendar as CalendarIcon, Flag, Clock, User, StickyNote, FileText, Users, RefreshCw, AlertCircle, Phone, MoreHorizontal, Play, Square, Timer, CheckCircle2, Upload, X, Paperclip } from "lucide-react";
import { format } from "date-fns";
interface StageNote {
  id: string;
  stage_id: number;
  tenant_id: number;
  package_id: number | null;
  note_details: string;
  note_type: string | null;
  priority: string | null;
  started_date: string | null;
  completed_date: string | null;
  uploaded_files: string[] | null;
  file_names: string[] | null;
  assignees: string[] | null;
  duration: number | null;
  created_by: string;
  created_at: string;
  user?: {
    first_name: string;
    last_name: string;
    email: string;
    avatar_url: string | null;
  };
}
interface StageNotesTabProps {
  stageId: number;
  tenantId: number;
  packageId: number;
}
export function StageNotesTab({
  stageId,
  tenantId,
  packageId
}: StageNotesTabProps) {
  const {
    toast
  } = useToast();
  const [notes, setNotes] = useState<StageNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<StageNote | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("");
  const [priority, setPriority] = useState("");
  const [startedDate, setStartedDate] = useState<Date>();
  const [startedTime, setStartedTime] = useState({
    hour: "12",
    minute: "00",
    period: "AM"
  });
  const [completedDate, setCompletedDate] = useState<Date>();
  const [completedTime, setCompletedTime] = useState({
    hour: "12",
    minute: "00",
    period: "AM"
  });
  const [saving, setSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<{
    path: string;
    name: string;
  }[]>([]);
  const [filesToRemove, setFilesToRemove] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [vivacityTeam, setVivacityTeam] = useState<Array<{
    user_uuid: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  }>>([]);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerStartTime, setTimerStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [accumulatedTime, setAccumulatedTime] = useState(0);
  useEffect(() => {
    fetchNotes();
    fetchVivacityTeam();
    getCurrentUser();
  }, [stageId, tenantId]);

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning && timerStartTime) {
      interval = setInterval(() => {
        setElapsedTime(accumulatedTime + (Date.now() - timerStartTime));
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timerStartTime, accumulatedTime]);
  const getCurrentUser = async () => {
    const {
      data: {
        user
      }
    } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      setAssignees([user.id]);
    }
  };
  const fetchVivacityTeam = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("users").select("user_uuid, first_name, last_name, avatar_url").in("unicorn_role", ["Super Admin", "Team Leader", "Team Member"]).order("first_name");
      if (error) throw error;
      setVivacityTeam(data || []);
    } catch (error: any) {
      console.error("Error fetching team:", error);
    }
  };
  const fetchNotes = async () => {
    setLoading(true);
    try {
      const {
        data,
        error
      } = await (supabase.from("documents_notes" as any).select("*").eq("stage_id", stageId).eq("tenant_id", tenantId).order("created_at", {
        ascending: false
      }) as any);
      if (error) throw error;
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((n: any) => n.created_by))] as string[];
        const {
          data: usersData
        } = await supabase.from("users").select("user_uuid, first_name, last_name, email, avatar_url").in("user_uuid", userIds);
        const usersMap = new Map(usersData?.map(u => [u.user_uuid, u]) || []);
        const notesWithUsers = data.map((note: any) => ({
          ...note,
          user: usersMap.get(note.created_by) || undefined
        }));
        setNotes(notesWithUsers);
      } else {
        setNotes([]);
      }
    } catch (error: any) {
      console.error("Error fetching notes:", error);
      toast({
        title: "Error",
        description: "Failed to load notes",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const resetForm = () => {
    setNoteText("");
    setNoteType("");
    setPriority("");
    setStartedDate(undefined);
    setStartedTime({
      hour: "12",
      minute: "00",
      period: "AM"
    });
    setCompletedDate(undefined);
    setCompletedTime({
      hour: "12",
      minute: "00",
      period: "AM"
    });
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
  const handleOpenDialog = (note?: StageNote) => {
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
        setStartedTime({
          hour: (hours % 12 || 12).toString().padStart(2, "0"),
          minute: mins.toString().padStart(2, "0"),
          period: hours >= 12 ? "PM" : "AM"
        });
      } else {
        setStartedDate(undefined);
        setStartedTime({
          hour: "12",
          minute: "00",
          period: "AM"
        });
      }
      if (note.completed_date) {
        const endDate = new Date(note.completed_date);
        setCompletedDate(endDate);
        const hours = endDate.getHours();
        const mins = endDate.getMinutes();
        setCompletedTime({
          hour: (hours % 12 || 12).toString().padStart(2, "0"),
          minute: mins.toString().padStart(2, "0"),
          period: hours >= 12 ? "PM" : "AM"
        });
      } else {
        setCompletedDate(undefined);
        setCompletedTime({
          hour: "12",
          minute: "00",
          period: "AM"
        });
      }
      setAssignees(note.assignees || []);
      if (note.uploaded_files && note.file_names) {
        setExistingFiles(note.uploaded_files.map((path, i) => ({
          path,
          name: note.file_names?.[i] || path
        })));
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
      setStartedTime({
        hour: (hours % 12 || 12).toString().padStart(2, "0"),
        minute: minutes.toString().padStart(2, "0"),
        period: hours >= 12 ? "PM" : "AM"
      });
    }
  };
  const handleStopTimer = () => {
    setIsTimerRunning(false);
    setAccumulatedTime(elapsedTime);
    const currentDate = new Date();
    setCompletedDate(currentDate);
    const hours = currentDate.getHours();
    const minutes = currentDate.getMinutes();
    setCompletedTime({
      hour: (hours % 12 || 12).toString().padStart(2, "0"),
      minute: minutes.toString().padStart(2, "0"),
      period: hours >= 12 ? "PM" : "AM"
    });
  };
  const formatElapsedTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor(totalSeconds % 86400 / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(' ');
  };
  const calculateDuration = () => {
    if (startedDate && completedDate) {
      const convert12To24 = (time: {
        hour: string;
        minute: string;
        period: string;
      }) => {
        let hour = parseInt(time.hour);
        if (time.period === "PM" && hour !== 12) hour += 12;
        if (time.period === "AM" && hour === 12) hour = 0;
        return {
          hour,
          minute: parseInt(time.minute)
        };
      };
      const startTime = convert12To24(startedTime);
      const endTime = convert12To24(completedTime);
      const startDateTime = new Date(startedDate);
      startDateTime.setHours(startTime.hour, startTime.minute, 0, 0);
      const endDateTime = new Date(completedDate);
      endDateTime.setHours(endTime.hour, endTime.minute, 0, 0);
      const diffMs = endDateTime.getTime() - startDateTime.getTime();
      if (diffMs < 0) return "Invalid duration";
      const diffMins = Math.floor(diffMs / 60000);
      const days = Math.floor(diffMins / 1440);
      const hours = Math.floor(diffMins % 1440 / 60);
      const mins = diffMins % 60;
      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (mins > 0) parts.push(`${mins}m`);
      return parts.length > 0 ? parts.join(' ') : '0m';
    }
    if (isTimerRunning || elapsedTime > 0) {
      return formatElapsedTime(elapsedTime);
    }
    return "No duration";
  };
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setUploadedFiles(prev => [...prev, ...Array.from(files)]);
    }
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
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in",
          variant: "destructive"
        });
        return;
      }

      // Upload files
      const fileUrls: string[] = [];
      const fileNames: string[] = [];
      if (uploadedFiles.length > 0) {
        for (const file of uploadedFiles) {
          const fileName = `${Date.now()}-${file.name}`;
          const {
            data: uploadData,
            error: uploadError
          } = await supabase.storage.from('tenant-note-files').upload(fileName, file);
          if (uploadError) throw uploadError;
          fileUrls.push(uploadData.path);
          fileNames.push(file.name);
        }
      }
      const convert12To24 = (time: {
        hour: string;
        minute: string;
        period: string;
      }) => {
        let hour = parseInt(time.hour);
        if (time.period === "PM" && hour !== 12) hour += 12;
        if (time.period === "AM" && hour === 12) hour = 0;
        return `${hour.toString().padStart(2, "0")}:${time.minute}`;
      };
      let startedDateTime = null;
      if (startedDate) {
        const time24 = convert12To24(startedTime);
        startedDateTime = `${format(startedDate, "yyyy-MM-dd")}T${time24}:00`;
      }
      let completedDateTime = null;
      if (completedDate) {
        const time24 = convert12To24(completedTime);
        completedDateTime = `${format(completedDate, "yyyy-MM-dd")}T${time24}:00`;
      }
      const remainingExistingFiles = existingFiles.filter(f => !filesToRemove.includes(f.path));
      const allFilePaths = [...remainingExistingFiles.map(f => f.path), ...fileUrls];
      const allFileNames = [...remainingExistingFiles.map(f => f.name), ...fileNames];
      const noteData = {
        note_details: noteText.trim(),
        note_type: noteType || null,
        priority: priority || null,
        started_date: startedDateTime,
        completed_date: completedDateTime,
        uploaded_files: allFilePaths.length > 0 ? allFilePaths : null,
        file_names: allFileNames.length > 0 ? allFileNames : null,
        assignees: assignees.length > 0 ? assignees : null
      };
      if (selectedNote) {
        const {
          error
        } = await (supabase.from("documents_notes" as any).update(noteData).eq("id", selectedNote.id) as any);
        if (error) throw error;
        toast({
          title: "Success",
          description: "Note updated successfully"
        });
      } else {
        const {
          error
        } = await (supabase.from("documents_notes" as any).insert({
          stage_id: stageId,
          tenant_id: tenantId,
          package_id: packageId,
          ...noteData,
          created_by: user.id
        }) as any);
        if (error) throw error;
        toast({
          title: "Success",
          description: "Note added successfully"
        });
      }
      setIsAddDialogOpen(false);
      resetForm();
      fetchNotes();
    } catch (error: any) {
      console.error("Error saving note:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
  const handleDeleteNote = async () => {
    if (!selectedNote) return;
    try {
      const {
        error
      } = await (supabase.from("documents_notes" as any).delete().eq("id", selectedNote.id) as any);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Note deleted successfully"
      });
      setIsDeleteDialogOpen(false);
      setSelectedNote(null);
      fetchNotes();
    } catch (error: any) {
      console.error("Error deleting note:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const toggleAssignee = (userId: string) => {
    setAssignees(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };
  return <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="gap-2" onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4" />
          Add Note
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
              {loading ? <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">Loading...</TableCell>
                </TableRow> : notes.length === 0 ? <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">No notes have been added yet.</TableCell>
                </TableRow> : notes.map((note, index) => <TableRow key={note.id}>
                    <TableCell className="font-medium text-muted-foreground border-r">{index + 1}</TableCell>
                    <TableCell className="border-r max-w-xs">
                      <p className="truncate">{note.note_details}</p>
                    </TableCell>
                    <TableCell className="border-r">
                      {note.note_type ? <div className="flex items-center gap-1.5">
                          {note.note_type === "general" && <FileText className="h-3.5 w-3.5 text-blue-500" />}
                          {note.note_type === "meeting" && <Users className="h-3.5 w-3.5 text-purple-500" />}
                          {note.note_type === "follow-up" && <RefreshCw className="h-3.5 w-3.5 text-orange-500" />}
                          {note.note_type === "action" && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                          {note.note_type === "phone-call" && <Phone className="h-3.5 w-3.5 text-green-500" />}
                          {note.note_type === "others" && <MoreHorizontal className="h-3.5 w-3.5 text-gray-500" />}
                          <span className="text-sm capitalize">{note.note_type.replace("-", " ")}</span>
                        </div> : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="border-r">
                      {note.priority ? <div className="flex items-center gap-2">
                          {note.priority === 'urgent' && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs py-0.5 px-2 rounded-full">
                              <AlertCircle className="h-3 w-3 mr-1" />Urgent
                            </Badge>}
                          {note.priority === 'high' && <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs py-0.5 px-2 rounded-full">
                              <Flag className="h-3 w-3 mr-1" />High
                            </Badge>}
                          {note.priority === 'normal' && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs py-0.5 px-2 rounded-full">
                              <CheckCircle2 className="h-3 w-3 mr-1" />Normal
                            </Badge>}
                          {note.priority === 'low' && <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 text-xs py-0.5 px-2 rounded-full">
                              <Timer className="h-3 w-3 mr-1" />Low
                            </Badge>}
                        </div> : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="border-r whitespace-nowrap">
                      {note.started_date ? <div className="flex items-center gap-2 text-sm">
                          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span>{format(new Date(note.started_date), "dd MMM yyyy h:mm a")}</span>
                        </div> : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="border-r whitespace-nowrap">
                      {note.completed_date ? <div className="flex items-center gap-2 text-sm">
                          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span>{format(new Date(note.completed_date), "dd MMM yyyy h:mm a")}</span>
                        </div> : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="border-r">
                      {note.uploaded_files && note.uploaded_files.length > 0 ? <Badge variant="outline" className="gap-1">
                          <Paperclip className="h-3 w-3" />
                          {note.uploaded_files.length}
                        </Badge> : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="border-r">
                      {note.assignees && note.assignees.length > 0 ? <div className="flex items-center -space-x-2">
                          {note.assignees.slice(0, 3).map(assigneeId => {
                    const user = vivacityTeam.find(u => u.user_uuid === assigneeId);
                    return <Avatar key={assigneeId} className="h-7 w-7 border-2 border-background">
                                {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                  {user ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}` : 'U'}
                                </AvatarFallback>
                              </Avatar>;
                  })}
                          {note.assignees.length > 3 && <Avatar className="h-7 w-7 border-2 border-background">
                              <AvatarFallback className="text-xs bg-muted">+{note.assignees.length - 3}</AvatarFallback>
                            </Avatar>}
                        </div> : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="border-r whitespace-nowrap">
                      {note.started_date && note.completed_date ? <div className="flex items-center gap-1.5 text-sm">
                          <Timer className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span>
                            {(() => {
                      const start = new Date(note.started_date);
                      const end = new Date(note.completed_date);
                      const diffMs = end.getTime() - start.getTime();
                      const diffMins = Math.floor(diffMs / 60000);
                      const days = Math.floor(diffMins / 1440);
                      const hours = Math.floor(diffMins % 1440 / 60);
                      const mins = diffMins % 60;
                      if (days > 0) return `${days}d ${hours}h`;
                      return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                    })()}
                          </span>
                        </div> : <span className="text-xs text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenDialog(note)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => {
                    setSelectedNote(note);
                    setIsDeleteDialogOpen(true);
                  }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Note Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={open => {
      setIsAddDialogOpen(open);
      if (!open) resetForm();
    }}>
        <DialogPortal>
          <DialogOverlay className="z-[70] bg-black/70" />
          <DialogPrimitive.Content onPointerDownOutside={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()} className="fixed left-[50%] top-[50%] z-[70] flex flex-col w-full max-h-[85vh] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg" style={{
          width: '650px',
          maxWidth: '90vw'
        }}>
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <DialogTitle className="flex items-center gap-2">
                    <StickyNote className="h-5 w-5" />
                    {selectedNote ? "Edit Note" : "Add New Note"}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    {selectedNote ? "Update the note details below" : "Create a new note for this stage."}
                  </p>
                </div>
                
              </div>
            </DialogHeader>

            <Separator />

            <div className="overflow-y-auto flex-1 space-y-5 py-4 px-1">
              {/* Note Type and Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Note Type</Label>
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select type...">
                        {noteType && <div className="flex items-center gap-2">
                            {noteType === "general" && <FileText className="h-4 w-4 text-blue-500" />}
                            {noteType === "meeting" && <Users className="h-4 w-4 text-purple-500" />}
                            {noteType === "follow-up" && <RefreshCw className="h-4 w-4 text-orange-500" />}
                            {noteType === "action" && <AlertCircle className="h-4 w-4 text-red-500" />}
                            {noteType === "phone-call" && <Phone className="h-4 w-4 text-green-500" />}
                            {noteType === "others" && <MoreHorizontal className="h-4 w-4 text-gray-500" />}
                            <span className="capitalize">{noteType.replace("-", " ")}</span>
                          </div>}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="general"><div className="flex items-center gap-2"><FileText className="h-4 w-4 text-blue-500" /><span>General</span></div></SelectItem>
                      <SelectSeparator />
                      <SelectItem value="meeting"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-purple-500" /><span>Meeting</span></div></SelectItem>
                      <SelectSeparator />
                      <SelectItem value="phone-call"><div className="flex items-center gap-2"><Phone className="h-4 w-4 text-green-500" /><span>Phone Call</span></div></SelectItem>
                      <SelectSeparator />
                      <SelectItem value="follow-up"><div className="flex items-center gap-2"><RefreshCw className="h-4 w-4 text-orange-500" /><span>Follow-up</span></div></SelectItem>
                      <SelectSeparator />
                      <SelectItem value="action"><div className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-red-500" /><span>Action Required</span></div></SelectItem>
                      <SelectSeparator />
                      <SelectItem value="others"><div className="flex items-center gap-2"><MoreHorizontal className="h-4 w-4 text-gray-500" /><span>Others</span></div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select priority...">
                        {priority && <div className="flex items-center gap-2">
                            <Flag className={cn("h-4 w-4", priority === "urgent" && "fill-red-500 text-red-500", priority === "high" && "fill-orange-500 text-orange-500", priority === "normal" && "fill-yellow-500 text-yellow-500", priority === "low" && "fill-blue-500 text-blue-500")} />
                            <span className="capitalize">{priority}</span>
                          </div>}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-background">
                      <SelectItem value="urgent"><div className="flex items-center gap-2"><Flag className="h-4 w-4 fill-red-500 text-red-500" /><span>Urgent</span></div></SelectItem>
                      <SelectSeparator />
                      <SelectItem value="high"><div className="flex items-center gap-2"><Flag className="h-4 w-4 fill-orange-500 text-orange-500" /><span>High</span></div></SelectItem>
                      <SelectSeparator />
                      <SelectItem value="normal"><div className="flex items-center gap-2"><Flag className="h-4 w-4 fill-yellow-500 text-yellow-500" /><span>Normal</span></div></SelectItem>
                      <SelectSeparator />
                      <SelectItem value="low"><div className="flex items-center gap-2"><Flag className="h-4 w-4 fill-blue-500 text-blue-500" /><span>Low</span></div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Note Details */}
              <div className="space-y-2">
                <Label>Note Details *</Label>
                <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Enter note details..." rows={4} />
              </div>

              {/* Started Date/Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Started Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startedDate ? format(startedDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[80]">
                      <Calendar mode="single" selected={startedDate} onSelect={setStartedDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Started Time</Label>
                  <div className="flex items-center gap-2">
                    <Input type="text" value={startedTime.hour} onChange={e => setStartedTime(prev => ({
                    ...prev,
                    hour: e.target.value
                  }))} className="w-14 text-center" maxLength={2} placeholder="HH" />
                    <span>:</span>
                    <Input type="text" value={startedTime.minute} onChange={e => setStartedTime(prev => ({
                    ...prev,
                    minute: e.target.value
                  }))} className="w-14 text-center" maxLength={2} placeholder="MM" />
                    <Select value={startedTime.period} onValueChange={v => setStartedTime(prev => ({
                    ...prev,
                    period: v
                  }))}>
                      <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                      <SelectContent className="z-[80]"><SelectItem value="AM">AM</SelectItem><SelectItem value="PM">PM</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Completed Date/Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Completed Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {completedDate ? format(completedDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[80]">
                      <Calendar mode="single" selected={completedDate} onSelect={setCompletedDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Completed Time</Label>
                  <div className="flex items-center gap-2">
                    <Input type="text" value={completedTime.hour} onChange={e => setCompletedTime(prev => ({
                    ...prev,
                    hour: e.target.value
                  }))} className="w-14 text-center" maxLength={2} placeholder="HH" />
                    <span>:</span>
                    <Input type="text" value={completedTime.minute} onChange={e => setCompletedTime(prev => ({
                    ...prev,
                    minute: e.target.value
                  }))} className="w-14 text-center" maxLength={2} placeholder="MM" />
                    <Select value={completedTime.period} onValueChange={v => setCompletedTime(prev => ({
                    ...prev,
                    period: v
                  }))}>
                      <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                      <SelectContent className="z-[80]"><SelectItem value="AM">AM</SelectItem><SelectItem value="PM">PM</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Duration Display */}
              <div className="p-3 rounded-lg bg-muted/50 flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Duration: {calculateDuration()}</span>
              </div>

              {/* File Upload */}
              <div className="space-y-2">
                <Label>Attachments</Label>
                <div className="border-2 border-dashed rounded-lg p-4">
                  <Input type="file" multiple onChange={handleFileUpload} className="hidden" id="file-upload" />
                  <label htmlFor="file-upload" className="flex flex-col items-center gap-2 cursor-pointer">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Click to upload files</span>
                  </label>
                </div>
                {(existingFiles.length > 0 || uploadedFiles.length > 0) && <div className="flex flex-wrap gap-2 mt-2">
                    {existingFiles.map(file => <Badge key={file.path} variant="secondary" className="gap-1 pr-1">
                        <Paperclip className="h-3 w-3" />
                        {file.name}
                        <Button variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={() => handleRemoveExistingFile(file.path)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>)}
                    {uploadedFiles.map((file, index) => <Badge key={index} variant="secondary" className="gap-1 pr-1">
                        <Paperclip className="h-3 w-3" />
                        {file.name}
                        <Button variant="ghost" size="icon" className="h-4 w-4 ml-1" onClick={() => handleRemoveFile(index)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>)}
                  </div>}
              </div>

              {/* Followers */}
              <div className="space-y-2">
                <Label className="text-primary font-semibold">Followers</Label>
                <div className="flex items-center gap-2">
                  {/* Selected assignees avatars */}
                  {assignees.map(userId => {
                    const user = vivacityTeam.find(u => u.user_uuid === userId);
                    if (!user) return null;
                    return (
                      <div key={userId} className="relative group">
                        <Avatar className="h-10 w-10 border-2 border-background shadow-sm cursor-pointer" onClick={() => toggleAssignee(userId)}>
                          {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {user.first_name?.[0]}{user.last_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <button 
                          onClick={() => toggleAssignee(userId)}
                          className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    );
                  })}
                  
                  {/* Add button with dropdown */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="h-10 w-10 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer">
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2 z-[80]" align="start">
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {vivacityTeam.filter(user => !assignees.includes(user.user_uuid)).map(user => (
                          <div
                            key={user.user_uuid}
                            onClick={() => toggleAssignee(user.user_uuid)}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-muted transition-colors"
                          >
                            <Avatar className="h-7 w-7">
                              {user.avatar_url && <AvatarImage src={user.avatar_url} />}
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {user.first_name?.[0]}{user.last_name?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{user.first_name} {user.last_name}</span>
                          </div>
                        ))}
                        {vivacityTeam.filter(user => !assignees.includes(user.user_uuid)).length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-2">All team members added</p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveNote} disabled={!noteText.trim() || saving}>
                {saving ? "Saving..." : selectedNote ? "Update" : "Add Note"}
              </Button>
            </DialogFooter>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      {/* Delete Confirmation Dialog */}
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
            <AlertDialogAction onClick={handleDeleteNote} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
}
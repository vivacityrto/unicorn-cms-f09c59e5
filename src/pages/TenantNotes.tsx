import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Pencil, Trash2, Plus, StickyNote, Calendar as CalendarComponent, CalendarClock, X, Upload, User, Flag, FileText, Users, RefreshCw, AlertCircle, Phone, MoreHorizontal, Play, Square, CheckSquare, Paperclip, Timer, CheckCircle2, Clock, Building2, Eye, Search, ArrowUpDown, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import * as DialogPrimitive from "@radix-ui/react-dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
interface TenantNote {
  id: string;
  tenant_id: number;
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
  updated_at: string;
  user?: {
    first_name: string;
    last_name: string;
    email: string;
    avatar_url: string | null;
  };
}
export default function TenantNotes() {
  const {
    tenantId
  } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    toast
  } = useToast();
  const [notes, setNotes] = useState<TenantNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantName, setTenantName] = useState("");
  const [packageAbbr, setPackageAbbr] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<TenantNote | null>(null);
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<{ path: string; name: string }[]>([]);
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
  const [totalDurationUsed, setTotalDurationUsed] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortPriority, setSortPriority] = useState<string>("all");
  const [activePackageId, setActivePackageId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Get packageId from URL params
  const urlPackageId = searchParams.get('packageId');

  // Filter and sort notes
  const filteredNotes = notes.filter(note => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      note.note_details.toLowerCase().includes(query) ||
      note.note_type?.toLowerCase().includes(query) ||
      note.user?.first_name?.toLowerCase().includes(query) ||
      note.user?.last_name?.toLowerCase().includes(query) ||
      note.user?.email?.toLowerCase().includes(query)
    );
  }).filter(note => {
    if (sortPriority === "all") return true;
    return note.priority === sortPriority;
  }).sort((a, b) => {
    if (sortPriority !== "all") {
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 4;
      const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 4;
      return aPriority - bPriority;
    }
    return 0;
  });

  // Timer effect for real-time duration tracking
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning && timerStartTime) {
      interval = setInterval(() => {
        setElapsedTime(accumulatedTime + (Date.now() - timerStartTime));
      }, 100); // Update every 100ms for smooth display
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timerStartTime, accumulatedTime]);
  const handlePlayTimer = () => {
    const now = Date.now();
    setTimerStartTime(now);
    setIsTimerRunning(true);

    // Only set started date and time on first play
    if (!startedDate) {
      const currentDate = new Date();
      setStartedDate(currentDate);
      const hours = currentDate.getHours();
      const minutes = currentDate.getMinutes();
      const period = hours >= 12 ? "PM" : "AM";
      const hour12 = hours % 12 || 12;
      setStartedTime({
        hour: hour12.toString().padStart(2, "0"),
        minute: minutes.toString().padStart(2, "0"),
        period
      });
    }
  };
  const handleStopTimer = () => {
    setIsTimerRunning(false);
    // Save accumulated time
    setAccumulatedTime(elapsedTime);

    // Set completed date and time to now
    const currentDate = new Date();
    setCompletedDate(currentDate);
    const hours = currentDate.getHours();
    const minutes = currentDate.getMinutes();
    const period = hours >= 12 ? "PM" : "AM";
    const hour12 = hours % 12 || 12;
    setCompletedTime({
      hour: hour12.toString().padStart(2, "0"),
      minute: minutes.toString().padStart(2, "0"),
      period
    });
  };
  const formatElapsedTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor(totalSeconds % 86400 / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} min${minutes > 1 ? 's' : ''}`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds} sec${seconds > 1 ? 's' : ''}`);
    return parts.join(' ');
  };

  // Calculate duration between started and completed dates
  const calculateDuration = () => {
    // If both dates are manually set, prioritize calculated duration over timer
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
      const minutes = diffMins % 60;
      const parts = [];
      if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
      if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
      if (minutes > 0) parts.push(`${minutes} min${minutes > 1 ? 's' : ''}`);
      return parts.length > 0 ? parts.join(' ') : '0 mins';
    }

    // If timer is running, show real-time elapsed time
    if (isTimerRunning) {
      return formatElapsedTime(elapsedTime);
    }

    // If timer has been stopped but we have elapsed time, show it
    if (elapsedTime > 0) {
      return formatElapsedTime(elapsedTime);
    }
    return "No duration";
  };
  useEffect(() => {
    if (tenantId) {
      // Set activePackageId from URL or fetch tenant's default
      if (urlPackageId) {
        setActivePackageId(parseInt(urlPackageId));
      }
      fetchNotes();
      fetchTenantInfo();
      getCurrentUser();
      fetchVivacityTeam();
    }
  }, [tenantId, urlPackageId]);
  const getCurrentUser = async () => {
    const {
      data: {
        user
      }
    } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      setAssignees([user.id]); // Add current user as default assignee
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
  const fetchTenantInfo = async () => {
    // Use URL packageId if provided
    const pkgId = urlPackageId ? parseInt(urlPackageId) : null;
    
    if (pkgId) {
      // Fetch tenant name and specific package name
      const { data: tenantData } = await supabase.from("tenants").select("name").eq("id", parseInt(tenantId!)).single();
      const { data: pkgData } = await supabase.from("packages").select("name").eq("id", pkgId).single();
      
      if (tenantData) setTenantName(tenantData.name);
      if (pkgData) setPackageAbbr(pkgData.name);
    } else {
      // Fallback to tenant's default package
      const { data } = await supabase.from("tenants").select("name, packages(name)").eq("id", parseInt(tenantId!)).single();
      if (data) {
        setTenantName(data.name);
        const pkg = data.packages as { name: string } | null;
        setPackageAbbr(pkg?.name || "");
      }
    }
  };
  const fetchNotes = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      // Build query - filter by package_id if provided
      let query = supabase.from("tenant_notes").select("*").eq("tenant_id", parseInt(tenantId));
      
      if (urlPackageId) {
        query = query.eq("package_id", parseInt(urlPackageId));
      }
      
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch user details for each note
      if (data && data.length > 0) {
        // Calculate total duration used from started_date and completed_date
        const totalMinutes = data.reduce((sum, note) => {
          if (note.started_date && note.completed_date) {
            const start = new Date(note.started_date);
            const end = new Date(note.completed_date);
            const diffMs = end.getTime() - start.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            return sum + (diffMins > 0 ? diffMins : 0);
          }
          return sum;
        }, 0);
        setTotalDurationUsed(totalMinutes);
        
        const userIds = [...new Set(data.map(n => n.created_by))];
        const {
          data: usersData
        } = await supabase.from("users").select("user_uuid, first_name, last_name, email, avatar_url").in("user_uuid", userIds);
        const usersMap = new Map(usersData?.map(u => [u.user_uuid, u]) || []);
        const notesWithUsers = data.map(note => ({
          ...note,
          user: usersMap.get(note.created_by) || undefined
        }));
        setNotes(notesWithUsers);
      } else {
        setNotes([]);
        setTotalDurationUsed(0);
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
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setUploadedFiles(prev => [...prev, ...Array.from(files)]);
    }
  };
  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };
  const handleAddNote = async () => {
    if (!noteText.trim() || !tenantId || saving) return;
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

      // Upload files to storage if any
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

      // Convert 12-hour to 24-hour format
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

      // Combine date and time for started_date
      let startedDateTime = null;
      if (startedDate) {
        const time24 = convert12To24(startedTime);
        startedDateTime = `${format(startedDate, "yyyy-MM-dd")}T${time24}:00`;
      }

      // Combine date and time for completed_date
      let completedDateTime = null;
      if (completedDate) {
        const time24 = convert12To24(completedTime);
        completedDateTime = `${format(completedDate, "yyyy-MM-dd")}T${time24}:00`;
      }

      // Handle existing files - filter out removed ones
      const remainingExistingFiles = existingFiles.filter(f => !filesToRemove.includes(f.path));
      const existingFilePaths = remainingExistingFiles.map(f => f.path);
      const existingFileNames = remainingExistingFiles.map(f => f.name);

      // Merge existing files with new uploads
      const allFilePaths = [...existingFilePaths, ...fileUrls];
      const allFileNames = [...existingFileNames, ...fileNames];

      const noteData = {
        note_details: noteText.trim(),
        note_type: noteType || null,
        priority: priority || null,
        started_date: startedDateTime,
        completed_date: completedDateTime,
        uploaded_files: allFilePaths.length > 0 ? allFilePaths : null,
        file_names: allFileNames.length > 0 ? allFileNames : null,
        assignees: assignees.length > 0 ? assignees : null,
        package_id: activePackageId || (urlPackageId ? parseInt(urlPackageId) : null)
      };
      if (selectedNote) {
        // Update existing note
        const {
          error
        } = await supabase.from("tenant_notes").update(noteData).eq("id", selectedNote.id);
        if (error) throw error;
        toast({
          title: "Success",
          description: "Note updated successfully"
        });
      } else {
        // Insert new note
        const {
          error
        } = await supabase.from("tenant_notes").insert({
          tenant_id: parseInt(tenantId),
          ...noteData,
          created_by: user.id
        });
        if (error) throw error;
        toast({
          title: "Success",
          description: "Note added successfully"
        });
      }
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
      setUploadedFiles([]);
      setExistingFiles([]);
      setFilesToRemove([]);
      setAssignees(user.id ? [user.id] : []);
      setSelectedNote(null);
      setIsTimerRunning(false);
      setTimerStartTime(null);
      setElapsedTime(0);
      setAccumulatedTime(0);
      setIsAddDialogOpen(false);
      fetchNotes();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
  const handleEditNote = async () => {
    if (!noteText.trim() || !selectedNote) return;
    try {
      const {
        error
      } = await supabase.from("tenant_notes").update({
        note_details: noteText.trim()
      }).eq("id", selectedNote.id);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Note updated successfully"
      });
      setNoteText("");
      setSelectedNote(null);
      setIsEditDialogOpen(false);
      fetchNotes();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const handleDeleteNote = async () => {
    if (!selectedNote) return;
    try {
      const {
        error
      } = await supabase.from("tenant_notes").delete().eq("id", selectedNote.id);
      if (error) throw error;
      toast({
        title: "Success",
        description: "Note deleted successfully"
      });
      setSelectedNote(null);
      setIsDeleteDialogOpen(false);
      fetchNotes();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };
  const openEditDialog = (note: TenantNote) => {
    setSelectedNote(note);
    setNoteText(note.note_details);
    setNoteType(note.note_type || "");
    setPriority(note.priority || "");

    // Parse started date and time
    if (note.started_date) {
      const startDate = new Date(note.started_date);
      setStartedDate(startDate);
      const hours = startDate.getHours();
      const minutes = startDate.getMinutes();
      const period = hours >= 12 ? "PM" : "AM";
      const hour12 = hours % 12 || 12;
      setStartedTime({
        hour: hour12.toString().padStart(2, "0"),
        minute: minutes.toString().padStart(2, "0"),
        period
      });
    }

    // Parse completed date and time
    if (note.completed_date) {
      const completeDate = new Date(note.completed_date);
      setCompletedDate(completeDate);
      const hours = completeDate.getHours();
      const minutes = completeDate.getMinutes();
      const period = hours >= 12 ? "PM" : "AM";
      const hour12 = hours % 12 || 12;
      setCompletedTime({
        hour: hour12.toString().padStart(2, "0"),
        minute: minutes.toString().padStart(2, "0"),
        period
      });
    }

    // Set assignees
    if (note.assignees && note.assignees.length > 0) {
      setAssignees(note.assignees);
    }

    // Load existing files
    if (note.uploaded_files && note.file_names) {
      const files = note.uploaded_files.map((path, idx) => ({
        path,
        name: note.file_names?.[idx] || path
      }));
      setExistingFiles(files);
    } else {
      setExistingFiles([]);
    }
    setFilesToRemove([]);
    
    setIsAddDialogOpen(true);
  };
  const openDeleteDialog = (note: TenantNote) => {
    setSelectedNote(note);
    setIsDeleteDialogOpen(true);
  };
  return <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        {/* Back Button */}
        <Button variant="ghost" onClick={() => navigate(`/clients/${tenantId}`)} className="gap-2 hover:bg-[hsl(196deg_100%_93.53%)] hover:text-black" style={{
          boxShadow: "var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)",
          border: "1px solid #00000052"
        }}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            
            <div>
              <h1 className="text-2xl font-bold text-foreground pb-2.5">{packageAbbr ? `${packageAbbr} Notes` : "Notes"}</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />
                {tenantName}
              </p>
            </div>
          </div>
        <div className="flex items-center gap-4">
            <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[0.8rem] py-1.5 px-3 rounded-full font-medium gap-2">
              <Timer className="h-4 w-4" />
              <span>Package used: {(() => {
                const days = Math.floor(totalDurationUsed / 1440);
                const hours = Math.floor((totalDurationUsed % 1440) / 60);
                const mins = totalDurationUsed % 60;
                if (days > 0) return `${days}d ${hours}h ${mins}m`;
                return `${hours}h ${mins}m`;
              })()}</span>
            </Badge>
            <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Note
            </Button>
          </div>
        </div>

        {/* Search and Sort */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search keyword or by name..." 
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
              className="pl-10 h-[48px]" 
            />
          </div>
          
          <Select value={sortPriority} onValueChange={setSortPriority}>
            <SelectTrigger className="w-full md:w-[220px] h-[48px]">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Sort by priority...">
                  {sortPriority === "all" && "All Priorities"}
                  {sortPriority === "urgent" && (
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 fill-red-500 text-red-500" />
                      <span>Urgent</span>
                    </div>
                  )}
                  {sortPriority === "high" && (
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 fill-orange-500 text-orange-500" />
                      <span>High</span>
                    </div>
                  )}
                  {sortPriority === "normal" && (
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                      <span>Normal</span>
                    </div>
                  )}
                  {sortPriority === "low" && (
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 fill-blue-500 text-blue-500" />
                      <span>Low</span>
                    </div>
                  )}
                </SelectValue>
              </div>
            </SelectTrigger>
            <SelectContent className="bg-background">
              <SelectItem value="all" className="cursor-pointer data-[state=checked]:bg-[hsl(196deg_100%_93.53%)] data-[state=checked]:text-black">
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground data-[state=checked]:text-black" />
                  <span>All Priorities</span>
                </div>
              </SelectItem>
              <SelectSeparator />
              <SelectItem value="urgent" className="cursor-pointer data-[state=checked]:bg-[hsl(196deg_100%_93.53%)] data-[state=checked]:text-black">
                <div className="flex items-center gap-2">
                  <Flag className={`h-4 w-4 ${sortPriority === "urgent" ? "fill-black text-black" : "fill-red-500 text-red-500"}`} />
                  <span>Urgent</span>
                </div>
              </SelectItem>
              <SelectSeparator />
              <SelectItem value="high" className="cursor-pointer data-[state=checked]:bg-[hsl(196deg_100%_93.53%)] data-[state=checked]:text-black">
                <div className="flex items-center gap-2">
                  <Flag className={`h-4 w-4 ${sortPriority === "high" ? "fill-black text-black" : "fill-orange-500 text-orange-500"}`} />
                  <span>High</span>
                </div>
              </SelectItem>
              <SelectSeparator />
              <SelectItem value="normal" className="cursor-pointer data-[state=checked]:bg-[hsl(196deg_100%_93.53%)] data-[state=checked]:text-black">
                <div className="flex items-center gap-2">
                  <Flag className={`h-4 w-4 ${sortPriority === "normal" ? "fill-black text-black" : "fill-yellow-500 text-yellow-500"}`} />
                  <span>Normal</span>
                </div>
              </SelectItem>
              <SelectSeparator />
              <SelectItem value="low" className="cursor-pointer data-[state=checked]:bg-[hsl(196deg_100%_93.53%)] data-[state=checked]:text-black">
                <div className="flex items-center gap-2">
                  <Flag className={`h-4 w-4 ${sortPriority === "low" ? "fill-black text-black" : "fill-blue-500 text-blue-500"}`} />
                  <span>Low</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Notes Table */}
        <Card className="border-0 shadow-lg overflow-hidden">
          
          <CardContent className="p-0">
            {loading ? <div className="flex items-center justify-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              </div> : filteredNotes.length === 0 ? <div className="flex flex-col items-center justify-center py-12 text-center">
                <StickyNote className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-1">{notes.length === 0 ? "No notes yet" : "No matching notes"}</h3>
                <p className="text-sm text-muted-foreground mb-4">{notes.length === 0 ? "Add your first note to get started" : "Try adjusting your search or filter"}</p>
                {notes.length === 0 && (
                  <Button onClick={() => setIsAddDialogOpen(true)} variant="outline" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Add Note
                  </Button>
                )}
              </div> : <div className="border border-border rounded-lg overflow-hidden">
                  <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 border-b border-border">
                      <TableHead className="w-[260px] border-r border-border font-semibold text-foreground whitespace-nowrap px-6">Created By</TableHead>
                      <TableHead className="w-[200px] border-r border-border font-semibold text-foreground whitespace-nowrap px-6">Note Type</TableHead>
                      <TableHead className="border-r border-border font-semibold text-foreground whitespace-nowrap px-6">Note Details</TableHead>
                      <TableHead className="w-[180px] border-r border-border font-semibold text-foreground whitespace-nowrap px-6">Priority</TableHead>
                      <TableHead className="w-[200px] border-r border-border font-semibold text-foreground whitespace-nowrap px-6">Started</TableHead>
                      <TableHead className="w-[200px] border-r border-border font-semibold text-foreground whitespace-nowrap px-6">Completed</TableHead>
                      <TableHead className="w-[140px] border-r border-border font-semibold text-foreground whitespace-nowrap px-6">Files</TableHead>
                      <TableHead className="w-[180px] border-r border-border font-semibold text-foreground whitespace-nowrap px-6">Followers</TableHead>
                      <TableHead className="w-[160px] border-r border-border font-semibold text-foreground whitespace-nowrap px-6">Duration</TableHead>
                      <TableHead className="w-[120px] text-right font-semibold text-foreground whitespace-nowrap px-6">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                     {filteredNotes.map((note, index) => <TableRow key={note.id} onClick={() => openEditDialog(note)} className={`hover:bg-muted/30 transition-colors cursor-pointer ${index !== filteredNotes.length - 1 ? 'border-b border-border' : ''}`}>
                        <TableCell className="border-r border-border px-6 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              {note.user?.avatar_url ? <AvatarImage src={note.user.avatar_url} alt={`${note.user.first_name} ${note.user.last_name}`} /> : null}
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {note.user ? `${note.user.first_name?.[0] || ''}${note.user.last_name?.[0] || ''}`.toUpperCase() : 'U'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {note.user ? `${note.user.first_name || ''} ${note.user.last_name || ''}`.trim() || 'Unknown' : 'Unknown User'}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {note.user?.email || ''}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="border-r border-border px-6 whitespace-nowrap">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              {note.note_type === 'Document' && <FileText className="h-4 w-4 text-muted-foreground" />}
                              {note.note_type === 'Tasks' && <CheckSquare className="h-4 w-4 text-muted-foreground" />}
                              {note.note_type === 'Phone Call' && <Phone className="h-4 w-4 text-muted-foreground" />}
                              {note.note_type === 'Others' && <MoreHorizontal className="h-4 w-4 text-muted-foreground" />}
                              <span className="text-sm font-medium text-foreground capitalize">
                                {note.note_type || 'Not specified'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                              <CalendarComponent className="h-3 w-3" />
                              <span>Created {format(new Date(note.created_at), "dd/MM/yyyy")}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="border-r border-border max-w-md px-6 whitespace-nowrap">
                          <p className="text-sm text-muted-foreground truncate">
                            {note.note_details}
                          </p>
                        </TableCell>
                        <TableCell className="border-r border-border px-6 whitespace-nowrap">
                          {note.priority ? <div className="flex items-center gap-2">
                              {note.priority === 'urgent' && <>
                                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-red-100">
                                    <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                                  </div>
                                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[0.75rem] py-1 px-3 rounded-full font-medium">
                                    Urgent
                                  </Badge>
                                </>}
                              {note.priority === 'high' && <>
                                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-orange-100">
                                    <Flag className="h-3.5 w-3.5 text-orange-600" />
                                  </div>
                                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-[0.75rem] py-1 px-3 rounded-full font-medium">
                                    High
                                  </Badge>
                                </>}
                              {note.priority === 'normal' && <>
                                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-100">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                                  </div>
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[0.75rem] py-1 px-3 rounded-full font-medium">
                                    Normal
                                  </Badge>
                                </>}
                              {note.priority === 'low' && <>
                                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100">
                                  <Timer className="h-3.5 w-3.5 text-gray-600" />
                                </div>
                                  <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 text-[0.75rem] py-1 px-3 rounded-full font-medium">
                                    Low
                                  </Badge>
                                </>}
                            </div> : <span className="text-xs text-muted-foreground">Not set</span>}
                        </TableCell>
                        <TableCell className="border-r border-border px-6 whitespace-nowrap">
                          {note.started_date ? <div className="flex items-center gap-3 text-[14px]">
                              <div className="flex items-center gap-1.5">
                                <CalendarComponent className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  {format(new Date(note.started_date), "dd MMM yyyy")}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  {format(new Date(note.started_date), "h:mm a")}
                                </span>
                              </div>
                            </div> : <span className="text-xs text-muted-foreground">Not started</span>}
                        </TableCell>
                        <TableCell className="border-r border-border px-6 whitespace-nowrap">
                          {note.completed_date ? <div className="flex items-center gap-3 text-[14px]">
                              <div className="flex items-center gap-1.5">
                                <CalendarComponent className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  {format(new Date(note.completed_date), "dd MMM yyyy")}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  {format(new Date(note.completed_date), "h:mm a")}
                                </span>
                              </div>
                            </div> : <span className="text-xs text-muted-foreground">Not completed</span>}
                        </TableCell>
                        <TableCell className="border-r border-border px-6 whitespace-nowrap">
                          {note.uploaded_files && note.uploaded_files.length > 0 ? (
                            <Badge 
                              variant="outline" 
                              className="bg-background text-foreground border-muted-foreground/30 text-[0.75rem] py-1 px-3 rounded-full font-medium gap-1.5"
                            >
                              <FileText className="h-3.5 w-3.5 text-foreground" />
                              View Files ({note.uploaded_files.length})
                            </Badge>
                          ) : <span className="text-xs text-muted-foreground">No files</span>}
                        </TableCell>
                        <TableCell className="border-r border-border px-6 whitespace-nowrap">
                          {note.assignees && note.assignees.length > 0 ? <div className="flex items-center -space-x-2">
                              {note.assignees.slice(0, 3).map((assigneeId, idx) => {
                                const user = vivacityTeam.find(u => u.user_uuid === assigneeId);
                                return (
                                  <Avatar key={assigneeId} className="h-8 w-8 border-2 border-background">
                                    {user?.avatar_url ? <AvatarImage src={user.avatar_url} alt={`${user.first_name} ${user.last_name}`} /> : null}
                                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                      {user ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() : 'U'}
                                    </AvatarFallback>
                                  </Avatar>
                                );
                              })}
                              {note.assignees.length > 3 && (
                                <Avatar className="h-8 w-8 border-2 border-background">
                                  <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                                    +{note.assignees.length - 3}
                                  </AvatarFallback>
                                </Avatar>
                              )}
                            </div> : <span className="text-xs text-muted-foreground">No followers</span>}
                        </TableCell>
                        <TableCell className="border-r border-border px-6 whitespace-nowrap">
                          {note.started_date && note.completed_date ? <div className="flex items-center gap-2">
                              <Timer className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm text-foreground">
                                {(() => {
                          const start = new Date(note.started_date);
                          const end = new Date(note.completed_date);
                          const diffMs = end.getTime() - start.getTime();
                          const diffMins = Math.floor(diffMs / 60000);
                          const days = Math.floor(diffMins / 1440);
                          const hours = Math.floor((diffMins % 1440) / 60);
                          const mins = diffMins % 60;
                          if (days > 0) return `${days}d ${hours}h ${mins}m`;
                          return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                        })()}
                              </span>
                            </div> : <span className="text-xs text-muted-foreground">No duration</span>}
                        </TableCell>
                        <TableCell className="text-right px-6 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={(e) => { e.stopPropagation(); openEditDialog(note); }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/15" onClick={(e) => { e.stopPropagation(); openDeleteDialog(note); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>)}
                  </TableBody>
                </Table>
              </div>}
          </CardContent>
        </Card>
      </div>

      {/* Add Note Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={open => {
      setIsAddDialogOpen(open);
      if (!open) {
        // Reset form when closing
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
        setUploadedFiles([]);
        setExistingFiles([]);
        setFilesToRemove([]);
        setAssignees(currentUserId ? [currentUserId] : []);
        setSelectedNote(null);
        setIsTimerRunning(false);
        setTimerStartTime(null);
        setElapsedTime(0);
        setAccumulatedTime(0);
      }
    }}>
        <DialogPortal>
          <DialogOverlay className="z-[70] bg-black/70" />
          <DialogPrimitive.Content onPointerDownOutside={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()} className="fixed left-[50%] top-[50%] z-[70] flex flex-col w-full max-h-[85vh] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden border-[3px] border-[#dfdfdf] bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg" style={{
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
                    {selectedNote ? "Update the note details below" : "Create a new note to track important information, meetings, or action items for this tenant."}
                  </p>
                </div>
                
                {/* Timer Controls */}
                <div className="flex gap-2 shrink-0">
                  {!isTimerRunning ? <Button type="button" size="sm" variant="outline" onClick={handlePlayTimer} className="gap-2" style={{
                  background: 'rgb(6 255 94 / 14%)',
                  color: 'rgb(85 147 107)',
                  borderColor: 'rgb(85 147 107)'
                }} title="Start timer">
                      <Play className="h-4 w-4" />
                      Play
                    </Button> : <Button type="button" size="sm" variant="outline" onClick={handleStopTimer} className="gap-2" style={{
                  background: 'rgb(255 104 104 / 21%)',
                  borderColor: 'rgb(220 38 38)',
                  color: 'rgb(220 38 38 / var(--tw-text-opacity, 1))'
                }} title="Stop timer">
                      <Square className="h-4 w-4" />
                      Stop
                    </Button>}
                </div>
              </div>
            </DialogHeader>

            <Separator />

            <div className="overflow-y-auto scrollbar-hide flex-1 space-y-6 py-4 px-1">
              {/* Note Type and Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="note-type">Note Type</Label>
                  <Select value={noteType} onValueChange={setNoteType}>
                    <SelectTrigger id="note-type" className="w-full">
                      <SelectValue placeholder="Select type...">
                        {noteType && <div className="flex items-center gap-2">
                            {noteType === "general" && <FileText className="h-4 w-4 text-blue-500" />}
                            {noteType === "meeting" && <Users className="h-4 w-4 text-purple-500" />}
                            {noteType === "follow-up" && <RefreshCw className="h-4 w-4 text-orange-500" />}
                            {noteType === "action" && <AlertCircle className="h-4 w-4 text-red-500" />}
                            {noteType === "phone-call" && <Phone className="h-4 w-4 text-green-500" />}
                            {noteType === "others" && <MoreHorizontal className="h-4 w-4 text-gray-500" />}
                            <span className="capitalize">{noteType === "action" ? "Action Required" : noteType === "phone-call" ? "Phone Call" : noteType.replace("-", " ")}</span>
                          </div>}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-background w-[var(--radix-select-trigger-width)]">
                      <SelectItem value="general" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500" />
                          <span>General</span>
                        </div>
                      </SelectItem>
                      <SelectSeparator />
                      <SelectItem value="meeting" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-purple-500" />
                          <span>Meeting</span>
                        </div>
                      </SelectItem>
                      <SelectSeparator />
                      <SelectItem value="phone-call" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-green-500" />
                          <span>Phone Call</span>
                        </div>
                      </SelectItem>
                      <SelectSeparator />
                      <SelectItem value="follow-up" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4 text-orange-500" />
                          <span>Follow-up</span>
                        </div>
                      </SelectItem>
                      <SelectSeparator />
                      <SelectItem value="action" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-500" />
                          <span>Action Required</span>
                        </div>
                      </SelectItem>
                      <SelectSeparator />
                      <SelectItem value="others" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <MoreHorizontal className="h-4 w-4 text-gray-500" />
                          <span>Others</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger id="priority" className="w-full">
                      <SelectValue placeholder="Select priority...">
                        {priority && <div className="flex items-center gap-2">
                            <Flag className={cn("h-4 w-4", priority === "urgent" && "fill-red-500 text-red-500", priority === "high" && "fill-orange-500 text-orange-500", priority === "normal" && "fill-yellow-500 text-yellow-500", priority === "low" && "fill-blue-500 text-blue-500")} />
                            <span className="capitalize">{priority}</span>
                          </div>}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-background w-[var(--radix-select-trigger-width)]">
                      <SelectItem value="urgent" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Flag className="h-4 w-4 fill-red-500 text-red-500" />
                          <span>Urgent</span>
                        </div>
                      </SelectItem>
                      <SelectSeparator />
                      <SelectItem value="high" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Flag className="h-4 w-4 fill-orange-500 text-orange-500" />
                          <span>High</span>
                        </div>
                      </SelectItem>
                      <SelectSeparator />
                      <SelectItem value="normal" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Flag className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                          <span>Normal</span>
                        </div>
                      </SelectItem>
                      <SelectSeparator />
                      <SelectItem value="low" className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <Flag className="h-4 w-4 fill-blue-500 text-blue-500" />
                          <span>Low</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Started Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="started-date">Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal hover:bg-[#349fff1c] hover:text-black", !startedDate && "text-muted-foreground")}>
                        <CalendarClock className="mr-2 h-4 w-4" />
                        {startedDate ? format(startedDate, "PP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[80]" align="start">
                      <Calendar mode="single" selected={startedDate} onSelect={setStartedDate} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="started-time">Start Time</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal hover:bg-[#349fff1c] hover:text-black", !startedDate && "text-muted-foreground")}>
                        <CalendarClock className="mr-2 h-4 w-4" />
                        {startedDate ? `${startedTime.hour}:${startedTime.minute} ${startedTime.period}` : <span>Pick a time</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-4 z-[80]" align="start">
                      <div className="flex items-center gap-2 pointer-events-auto">
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs text-muted-foreground">Hour</Label>
                          <Select value={startedTime.hour} onValueChange={value => setStartedTime({
                          ...startedTime,
                          hour: value
                        })}>
                            <SelectTrigger className="w-[70px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({
                              length: 12
                            }, (_, i) => i + 1).map(h => <SelectItem key={h} value={h.toString().padStart(2, "0")}>
                                  {h.toString().padStart(2, "0")}
                                </SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <span className="text-2xl font-bold mt-5">:</span>
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs text-muted-foreground">Minute</Label>
                          <Select value={startedTime.minute} onValueChange={value => setStartedTime({
                          ...startedTime,
                          minute: value
                        })}>
                            <SelectTrigger className="w-[70px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({
                              length: 60
                            }, (_, i) => i).map(m => <SelectItem key={m} value={m.toString().padStart(2, "0")}>
                                  {m.toString().padStart(2, "0")}
                                </SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs text-muted-foreground">Period</Label>
                          <Select value={startedTime.period} onValueChange={value => setStartedTime({
                          ...startedTime,
                          period: value
                        })}>
                            <SelectTrigger className="w-[70px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AM">AM</SelectItem>
                              <SelectItem value="PM">PM</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Completed Date and Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="completed-date">Completed Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal hover:bg-[#349fff1c] hover:text-black", !completedDate && "text-muted-foreground")}>
                        <CalendarClock className="mr-2 h-4 w-4" />
                        {completedDate ? format(completedDate, "PP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[80]" align="start">
                      <Calendar mode="single" selected={completedDate} onSelect={setCompletedDate} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="completed-time">Completed Time</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal hover:bg-[#349fff1c] hover:text-black", !completedDate && "text-muted-foreground")}>
                        <CalendarClock className="mr-2 h-4 w-4" />
                        {completedDate ? `${completedTime.hour}:${completedTime.minute} ${completedTime.period}` : <span>Pick a time</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-4 z-[80]" align="start">
                      <div className="flex items-center gap-2 pointer-events-auto">
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs text-muted-foreground">Hour</Label>
                          <Select value={completedTime.hour} onValueChange={value => setCompletedTime({
                          ...completedTime,
                          hour: value
                        })}>
                            <SelectTrigger className="w-[70px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({
                              length: 12
                            }, (_, i) => i + 1).map(h => <SelectItem key={h} value={h.toString().padStart(2, "0")}>
                                  {h.toString().padStart(2, "0")}
                                </SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <span className="text-2xl font-bold mt-5">:</span>
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs text-muted-foreground">Minute</Label>
                          <Select value={completedTime.minute} onValueChange={value => setCompletedTime({
                          ...completedTime,
                          minute: value
                        })}>
                            <SelectTrigger className="w-[70px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({
                              length: 60
                            }, (_, i) => i).map(m => <SelectItem key={m} value={m.toString().padStart(2, "0")}>
                                  {m.toString().padStart(2, "0")}
                                </SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label className="text-xs text-muted-foreground">Period</Label>
                          <Select value={completedTime.period} onValueChange={value => setCompletedTime({
                          ...completedTime,
                          period: value
                        })}>
                            <SelectTrigger className="w-[70px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AM">AM</SelectItem>
                              <SelectItem value="PM">PM</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Note Details */}
              <div className="space-y-2">
                <Label htmlFor="note-details">Note Details *</Label>
                <Textarea id="note-details" placeholder="Enter note details..." value={noteText} onChange={e => setNoteText(e.target.value)} rows={6} className="min-h-[150px]" />
              </div>

              {/* File Upload */}
              <div className="space-y-3">
                <Label htmlFor="note-files">Attach Files</Label>
                <div className="flex items-center gap-2">
                  <label 
                    htmlFor="note-files" 
                    className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    <span className="text-sm">Choose File</span>
                  </label>
                  <Input 
                    id="note-files" 
                    type="file" 
                    multiple 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                  {uploadedFiles.length > 0 && (
                    <span className="text-sm text-muted-foreground">{uploadedFiles.length} file(s) selected</span>
                  )}
                </div>
                
                {/* Existing Files */}
                {existingFiles.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <Label className="text-xs text-muted-foreground">Existing Files</Label>
                    <div className="space-y-2">
                      {existingFiles.map((file) => (
                        <div 
                          key={file.path} 
                          className={cn(
                            "flex items-center justify-between px-4 border border-border rounded-lg transition-all",
                            filesToRemove.includes(file.path) 
                              ? "opacity-40 bg-muted line-through" 
                              : "hover:border-primary/30"
                          )}
                          style={{ 
                            paddingTop: '5px', 
                            paddingBottom: '5px',
                            backgroundColor: filesToRemove.includes(file.path) ? undefined : 'rgb(222 246 255 / 24%)'
                          }}
                        >
                          <span className="text-sm truncate flex-1 pr-4">{file.name}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              className="p-1.5 rounded-md hover:bg-muted transition-colors"
                              onClick={() => {
                                const url = `https://yxkgdalkbrriasiyyrwk.supabase.co/storage/v1/object/public/tenant-note-files/${file.path}`;
                                window.open(url, '_blank');
                              }}
                              title="View file"
                            >
                              <Eye className="h-5 w-5 text-muted-foreground hover:text-foreground" />
                            </button>
                            <button
                              type="button"
                              className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                              onClick={() => {
                                if (filesToRemove.includes(file.path)) {
                                  setFilesToRemove(prev => prev.filter(p => p !== file.path));
                                } else {
                                  setFilesToRemove(prev => [...prev, file.path]);
                                }
                              }}
                              title={filesToRemove.includes(file.path) ? "Restore file" : "Remove file"}
                            >
                              <X className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* New Files to Upload */}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">New Files</Label>
                    <div className="space-y-2">
                      {uploadedFiles.map((file, index) => (
                        <div 
                          key={index} 
                          className="flex items-center justify-between px-4 py-3 border border-primary/30 rounded-lg bg-primary/5"
                        >
                          <span className="text-sm truncate flex-1 pr-4">{file.name}</span>
                          <button
                            type="button"
                            className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                            onClick={() => handleRemoveFile(index)}
                            title="Remove file"
                          >
                            <X className="h-5 w-5 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Followers */}
              <div className="space-y-2">
                <Label>Followers</Label>
                <div className="flex items-center gap-2">
                  {assignees.slice(0, 4).map(assigneeId => {
                  const user = vivacityTeam.find(u => u.user_uuid === assigneeId);
                  return <Avatar key={assigneeId} className="h-9 w-9 border-2 border-background">
                        {user?.avatar_url ? <AvatarImage src={user.avatar_url} alt={`${user.first_name} ${user.last_name}`} /> : null}
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {user ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() : <User className="h-4 w-4" />}
                        </AvatarFallback>
                      </Avatar>;
                })}
                  {assignees.length > 4 && <Avatar className="h-9 w-9 border-2 border-background">
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                        +{assignees.length - 4}
                      </AvatarFallback>
                    </Avatar>}
                  
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="h-9 w-9 rounded-full border-2 border-dashed border-muted-foreground/30 hover:border-primary hover:bg-primary/5 flex items-center justify-center transition-colors">
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0 z-[100]" align="start">
                      <div className="px-4 pb-4 pt-0 border-b">
                        <h3 className="font-semibold text-foreground">Manage Followers</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Select team members to follow this note
                        </p>
                      </div>
                      <ScrollArea className="h-[350px] overflow-y-auto">
                        <div className="p-4">
                          <div className="space-y-2">
                            {vivacityTeam.map(user => {
                            const isAssigned = assignees.includes(user.user_uuid);
                            return <div key={user.user_uuid} onClick={() => {
                              if (isAssigned) {
                                setAssignees(assignees.filter(id => id !== user.user_uuid));
                              } else {
                                setAssignees([...assignees, user.user_uuid]);
                              }
                            }} className={cn("flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all", isAssigned ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50")}>
                                  <Avatar className="h-10 w-10">
                                    {user.avatar_url ? <AvatarImage src={user.avatar_url} alt={`${user.first_name} ${user.last_name}`} /> : null}
                                    <AvatarFallback className="bg-primary/10 text-primary">
                                      {`${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">
                                      {`${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown'}
                                    </p>
                                  </div>
                                  {isAssigned && <div className="h-5 w-5 rounded-full flex items-center justify-center" style={{
                                background: 'hsl(0deg 96.5% 59.22% / 51%)'
                              }}>
                                      <X className="h-3 w-3 text-white" />
                                    </div>}
                                </div>;
                          })}
                          </div>
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </div>
                </div>
              </div>

            <Separator className="my-1" />

            <DialogFooter className="gap-2 flex-row justify-between items-center relative">
              <div className={cn("flex items-center gap-2 absolute left-0 pl-[5px] transition-colors", isTimerRunning || elapsedTime > 0 ? "text-primary font-medium" : "text-muted-foreground")} style={{
              fontSize: '14px'
            }}>
                <CalendarComponent className="h-4 w-4" />
                <span>Duration: {calculateDuration()}</span>
              </div>
              
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" onClick={() => {
                setIsAddDialogOpen(false);
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
                setUploadedFiles([]);
                setExistingFiles([]);
                setFilesToRemove([]);
                setAssignees(currentUserId ? [currentUserId] : []);
                setIsTimerRunning(false);
                setTimerStartTime(null);
                setElapsedTime(0);
                setAccumulatedTime(0);
              }} className="hover:bg-[#40c6e524] hover:text-black">
                  Cancel
                </Button>
                <Button onClick={() => {
                  if (selectedNote) {
                    setIsSaveConfirmOpen(true);
                  } else {
                    handleAddNote();
                  }
                }} disabled={!noteText.trim() || saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <StickyNote className="mr-2 h-4 w-4" />
                  )}
                  {saving ? "Saving..." : (selectedNote ? "Save Changes" : "Add Note")}
                </Button>
              </div>
            </DialogFooter>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      {/* Edit Note Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea placeholder="Write your note here..." value={noteText} onChange={e => setNoteText(e.target.value)} className="min-h-[150px]" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
            setIsEditDialogOpen(false);
            setNoteText("");
            setSelectedNote(null);
          }}>
              Cancel
            </Button>
            <Button onClick={handleEditNote} disabled={!noteText.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Confirmation Dialog */}
      <AlertDialog open={isSaveConfirmOpen} onOpenChange={setIsSaveConfirmOpen}>
        <AlertDialogContent hideOverlay className="z-[100]" style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Changes</AlertDialogTitle>
            <AlertDialogDescription>
              Do you wish to save changes to this note?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setIsSaveConfirmOpen(false);
              handleAddNote();
            }}>
              Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogCancel onClick={() => setSelectedNote(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteNote} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
}
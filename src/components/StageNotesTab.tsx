import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Calendar as CalendarIcon, Flag, Clock, User } from "lucide-react";
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

const priorityColors: Record<string, string> = {
  urgent: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  normal: "bg-blue-100 text-blue-800 border-blue-200",
  low: "bg-gray-100 text-gray-800 border-gray-200",
};

export function StageNotesTab({ stageId, tenantId, packageId }: StageNotesTabProps) {
  const { toast } = useToast();
  const [notes, setNotes] = useState<StageNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<StageNote | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("");
  const [priority, setPriority] = useState("");
  const [startedDate, setStartedDate] = useState<Date>();
  const [completedDate, setCompletedDate] = useState<Date>();
  const [saving, setSaving] = useState(false);
  const [vivacityTeam, setVivacityTeam] = useState<Array<{
    user_uuid: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  }>>([]);

  useEffect(() => {
    fetchNotes();
    fetchVivacityTeam();
  }, [stageId, tenantId]);

  const fetchVivacityTeam = async () => {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("user_uuid, first_name, last_name, avatar_url")
        .in("unicorn_role", ["Super Admin", "Team Leader", "Team Member"])
        .order("first_name");
      if (error) throw error;
      setVivacityTeam(data || []);
    } catch (error: any) {
      console.error("Error fetching team:", error);
    }
  };

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase
        .from("documents_notes" as any)
        .select("*")
        .eq("stage_id", stageId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }) as any);

      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((n: any) => n.created_by))] as string[];
        const { data: usersData } = await supabase
          .from("users")
          .select("user_uuid, first_name, last_name, email, avatar_url")
          .in("user_uuid", userIds);

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
    setCompletedDate(undefined);
    setSelectedNote(null);
  };

  const handleOpenDialog = (note?: StageNote) => {
    if (note) {
      setSelectedNote(note);
      setNoteText(note.note_details);
      setNoteType(note.note_type || "");
      setPriority(note.priority || "");
      setStartedDate(note.started_date ? new Date(note.started_date) : undefined);
      setCompletedDate(note.completed_date ? new Date(note.completed_date) : undefined);
    } else {
      resetForm();
    }
    setIsAddDialogOpen(true);
  };

  const handleSaveNote = async () => {
    if (!noteText.trim() || saving) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Error", description: "You must be logged in", variant: "destructive" });
        return;
      }

      const noteData = {
        note_details: noteText.trim(),
        note_type: noteType || null,
        priority: priority || null,
        started_date: startedDate ? format(startedDate, "yyyy-MM-dd'T'HH:mm:ss") : null,
        completed_date: completedDate ? format(completedDate, "yyyy-MM-dd'T'HH:mm:ss") : null,
      };

      if (selectedNote) {
        const { error } = await (supabase
          .from("documents_notes" as any)
          .update(noteData)
          .eq("id", selectedNote.id) as any);
        if (error) throw error;
        toast({ title: "Success", description: "Note updated successfully" });
      } else {
        const { error } = await (supabase
          .from("documents_notes" as any)
          .insert({
            stage_id: stageId,
            tenant_id: tenantId,
            package_id: packageId,
            ...noteData,
            created_by: user.id
          }) as any);
        if (error) throw error;
        toast({ title: "Success", description: "Note added successfully" });
      }

      setIsAddDialogOpen(false);
      resetForm();
      fetchNotes();
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
      const { error } = await (supabase
        .from("documents_notes" as any)
        .delete()
        .eq("id", selectedNote.id) as any);
      if (error) throw error;
      toast({ title: "Success", description: "Note deleted successfully" });
      setIsDeleteDialogOpen(false);
      setSelectedNote(null);
      fetchNotes();
    } catch (error: any) {
      console.error("Error deleting note:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
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
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-20">
                  #
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r">
                  Note
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-28">
                  Type
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-28">
                  Priority
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-36">
                  Created By
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap border-r w-32">
                  Created At
                </TableHead>
                <TableHead className="bg-muted/30 font-semibold text-foreground h-14 whitespace-nowrap w-24">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : notes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    No notes have been added yet.
                  </TableCell>
                </TableRow>
              ) : (
                notes.map((note, index) => (
                  <TableRow key={note.id}>
                    <TableCell className="font-medium text-muted-foreground border-r">
                      {index + 1}
                    </TableCell>
                    <TableCell className="border-r max-w-md">
                      <p className="truncate">{note.note_details}</p>
                    </TableCell>
                    <TableCell className="border-r">
                      {note.note_type ? (
                        <Badge variant="outline">{note.note_type}</Badge>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="border-r">
                      {note.priority ? (
                        <Badge className={priorityColors[note.priority] || "bg-gray-100"}>
                          {note.priority}
                        </Badge>
                      ) : "-"}
                    </TableCell>
                    <TableCell className="border-r">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={note.user?.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {note.user?.first_name?.[0]}{note.user?.last_name?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate">
                          {note.user ? `${note.user.first_name} ${note.user.last_name}` : "Unknown"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="border-r text-sm text-muted-foreground">
                      {format(new Date(note.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenDialog(note)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => {
                            setSelectedNote(note);
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add/Edit Note Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{selectedNote ? "Edit Note" : "Add Note"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Note Details *</Label>
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Enter note details..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Note Type</Label>
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="follow-up">Follow-up</SelectItem>
                    <SelectItem value="reminder">Reminder</SelectItem>
                    <SelectItem value="issue">Issue</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
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
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startedDate ? format(startedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startedDate}
                      onSelect={setStartedDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Completed Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {completedDate ? format(completedDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={completedDate}
                      onSelect={setCompletedDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveNote} disabled={!noteText.trim() || saving}>
              {saving ? "Saving..." : selectedNote ? "Update" : "Add Note"}
            </Button>
          </DialogFooter>
        </DialogContent>
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
    </div>
  );
}

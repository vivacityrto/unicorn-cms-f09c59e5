import { useState } from "react";
import { format } from "date-fns";
import { X, MoreHorizontal, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

interface TaskNotesSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

interface DailyNote {
  id: string;
  user_id: string;
  note_date: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export default function TaskNotesSidebar({ isOpen, onClose, userId }: TaskNotesSidebarProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isAdding, setIsAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const queryClient = useQueryClient();

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const queryKey = ["user_daily_notes", userId, dateStr];

  const { data: notes = [], isLoading } = useQuery({
    queryKey,
    enabled: isOpen && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_daily_notes" as any)
        .select("*")
        .eq("user_id", userId)
        .eq("note_date", dateStr)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as DailyNote[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (content: string) => {
      const { error } = await supabase.from("user_daily_notes" as any).insert({
        user_id: userId,
        note_date: dateStr,
        content,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setNewContent("");
      setIsAdding(false);
      toast.success("Note added");
    },
    onError: (e: any) => toast.error(e.message || "Failed to add note"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from("user_daily_notes" as any)
        .update({ content } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setEditingId(null);
      setEditingContent("");
      toast.success("Note updated");
    },
    onError: (e: any) => toast.error(e.message || "Failed to update note"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_daily_notes" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Note deleted");
    },
    onError: (e: any) => toast.error(e.message || "Failed to delete note"),
  });

  if (!isOpen) return null;

  return (
    <aside className="w-[360px] shrink-0 border-l border-border bg-muted/30 flex flex-col h-[calc(100vh-0px)] sticky top-0 self-start max-h-screen overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <h2 className="text-sm font-semibold">Daily Notes</h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="border-b bg-background p-2 flex justify-center">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(d) => d && setSelectedDate(d)}
          initialFocus
          className="pointer-events-auto"
        />
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div className="text-sm font-medium">
          Notes for {format(selectedDate, "EEEE, dd MMMM yyyy")}
        </div>
        <Button
          size="sm"
          onClick={() => {
            setIsAdding(true);
            setNewContent("");
          }}
          style={{ backgroundColor: "#7130A0", color: "white" }}
          className="hover:opacity-90 h-8"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Note
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : notes.length === 0 && !isAdding ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No notes for this date.
          </div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="bg-background border rounded-md p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {format(new Date(note.created_at), "hh:mm a")}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => {
                        setEditingId(note.id);
                        setEditingContent(note.content);
                      }}
                    >
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => deleteMutation.mutate(note.id)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {editingId === note.id ? (
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setEditingContent("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        updateMutation.mutate({ id: note.id, content: editingContent.trim() })
                      }
                      disabled={!editingContent.trim() || updateMutation.isPending}
                      style={{ backgroundColor: "#7130A0", color: "white" }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 text-sm whitespace-pre-wrap break-words">
                  {note.content}
                </div>
              )}
            </div>
          ))
        )}

        {isAdding && (
          <div className="bg-background border rounded-md p-3 space-y-2">
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
              placeholder="Write a note…"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsAdding(false);
                  setNewContent("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => addMutation.mutate(newContent.trim())}
                disabled={!newContent.trim() || addMutation.isPending}
                style={{ backgroundColor: "#7130A0", color: "white" }}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

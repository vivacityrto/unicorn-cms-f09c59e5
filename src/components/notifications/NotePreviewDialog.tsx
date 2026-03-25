import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { Notification } from "@/hooks/useNotifications";

interface NoteData {
  id: string;
  title: string | null;
  content: string | null;
  note_type: string | null;
  created_at: string;
  created_by_name: string | null;
  tags: string[] | null;
}

interface NotePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notification: Notification | null;
}

export function NotePreviewDialog({ open, onOpenChange, notification }: NotePreviewDialogProps) {
  const navigate = useNavigate();
  const [note, setNote] = useState<NoteData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !notification?.source_id) {
      setNote(null);
      return;
    }

    const fetchNote = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("client_notes")
          .select("id, title, content, note_type, created_at, created_by, tags")
          .eq("id", notification.source_id!)
          .single();

        if (data) {
          let createdByName: string | null = null;
          if (data.created_by) {
            const { data: user } = await supabase
              .from("users")
              .select("first_name, last_name")
              .eq("user_uuid", data.created_by)
              .single();
            if (user) {
              createdByName = `${user.first_name || ""} ${user.last_name || ""}`.trim();
            }
          }
          setNote({
            id: data.id,
            title: data.title,
            content: data.content,
            note_type: data.note_type,
            created_at: data.created_at,
            created_by_name: createdByName,
            tags: data.tags,
          });
        }
      } catch (err) {
        console.error("Failed to fetch note:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchNote();
  }, [open, notification?.source_id]);

  const handleOpenClient = () => {
    onOpenChange(false);
    if (notification?.link) {
      navigate(`${notification.link}?tab=notes`);
    }
  };

  // Strip HTML tags for display
  const cleanContent = (text: string | null) => {
    if (!text) return "";
    return text.replace(/<[^>]*>/g, "").trim();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {notification?.tenant_name && (
              <Badge variant="outline" className="text-xs font-normal">
                {notification.tenant_name}
              </Badge>
            )}
            <span className="truncate">{notification?.title || "Notification"}</span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : note ? (
          <div className="space-y-3">
            {/* Note metadata */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {note.note_type && (
                <Badge variant="secondary" className="text-xs capitalize">
                  {note.note_type.replace(/_/g, " ")}
                </Badge>
              )}
              {note.created_by_name && <span>by {note.created_by_name}</span>}
              <span>{format(new Date(note.created_at), "MMM d, yyyy h:mm a")}</span>
            </div>

            {/* Note title */}
            {note.title && (
              <h3 className="text-sm font-semibold text-foreground">{note.title}</h3>
            )}

            {/* Note content */}
            {note.content && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground whitespace-pre-wrap max-h-64 overflow-y-auto">
                {cleanContent(note.content)}
              </div>
            )}

            {/* Tags */}
            {note.tags && note.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {note.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Fallback: show notification message when no note found */
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {notification?.message?.replace(/<[^>]*>/g, "").trim()}
            </p>
            <p className="text-xs text-muted-foreground/70">
              {notification?.created_at && format(new Date(notification.created_at), "MMM d, yyyy h:mm a")}
            </p>
          </div>
        )}

        {/* Open client button */}
        {notification?.link && (
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={handleOpenClient}>
              <ExternalLink className="h-4 w-4 mr-1" />
              Open Client
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useNotes } from "@/hooks/useNotes";
import { LinkedEmail } from "@/hooks/useLinkedEmails";
import { toast } from "sonner";

interface ConvertEmailToNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: LinkedEmail;
  tenantId: number;
  onSuccess?: () => void;
}

const NOTE_TYPE_OPTIONS = [
  { value: "general", label: "General" },
  { value: "email", label: "Email" },
  { value: "follow-up", label: "Follow-up" },
  { value: "phone-call", label: "Phone Call" },
  { value: "meeting", label: "Meeting" },
  { value: "action", label: "Action" },
];

const PRIORITY_OPTIONS = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

export function ConvertEmailToNoteDialog({
  open,
  onOpenChange,
  email,
  tenantId,
  onSuccess,
}: ConvertEmailToNoteDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteType, setNoteType] = useState("email");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);

  const { createNote } = useNotes({
    parentType: "tenant",
    parentId: tenantId,
    tenantId,
  });

  useEffect(() => {
    if (!open) {
      setTitle("");
      setNoteContent("");
      setNoteType("email");
      setPriority("normal");
      setError(null);
      setLoading(false);
      setSaving(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("generate-email-note", {
          body: { email_id: email.id },
        });
        if (cancelled) return;
        if (invokeError) throw invokeError;
        if (data?.error) throw new Error(data.error);
        setTitle(data?.title ?? "");
        setNoteContent(data?.note_content ?? "");
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Failed to generate note");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, email.id]);

  const handleSave = async () => {
    if (!noteContent.trim()) {
      toast.error("Note content is required");
      return;
    }
    setSaving(true);
    try {
      const result = await createNote({
        title: title.trim() || undefined,
        note_details: noteContent,
        note_type: noteType,
        priority,
        parent_type_override: "tenant",
        parent_id_override: tenantId,
        source_email_id: email.id,
      });
      if (result) {
        toast.success("Note created");
        onSuccess?.();
        onOpenChange(false);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to save note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Convert Email to Note</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="note-title">Title</Label>
              <Input
                id="note-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note-content">Note</Label>
              <Textarea
                id="note-content"
                rows={10}
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                placeholder="Note details"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Note type</Label>
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTE_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || saving || !noteContent.trim()}>
            {saving ? "Saving..." : "Save Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalBody,
  AppModalFooter,
} from "@/components/ui/modals";
import { Send, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  validateAttachment,
  uploadMessageAttachment,
  MAX_FILES_PER_MESSAGE,
  formatBytes,
} from "@/lib/messageAttachments";

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    subject?: string;
    type: string;
    firstMessage: string;
  }) => Promise<string>;
  isSubmitting?: boolean;
  tenantId: number | null;
}

const CONVERSATION_TYPES = [
  { value: "general", label: "General" },
  { value: "package", label: "Package" },
  { value: "task", label: "Task" },
  { value: "rock", label: "Rock" },
];

export function NewConversationDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
  tenantId,
}: NewConversationDialogProps) {
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("general");
  const [message, setMessage] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!picked.length) return;
    const accepted: File[] = [];
    for (const f of picked) {
      if (queuedFiles.length + accepted.length >= MAX_FILES_PER_MESSAGE) {
        toast.error(`You can attach up to ${MAX_FILES_PER_MESSAGE} files per message.`);
        break;
      }
      try {
        validateAttachment(f);
        accepted.push(f);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Invalid file");
      }
    }
    if (accepted.length) setQueuedFiles((prev) => [...prev, ...accepted]);
  };

  const removeQueued = (idx: number) => {
    setQueuedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!message.trim()) return;
    const filesToUpload = queuedFiles;
    const conversationId = await onSubmit({
      subject: subject.trim() || undefined,
      type,
      firstMessage: message.trim(),
    });

    if (conversationId && tenantId != null && filesToUpload.length > 0) {
      try {
        const { data: firstMsg } = await supabase
          .from("tenant_messages")
          .select("id")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (firstMsg?.id) {
          for (const f of filesToUpload) {
            try {
              await uploadMessageAttachment(supabase, f, tenantId, conversationId, firstMsg.id);
            } catch (err) {
              toast.warning(`Attachment "${f.name}" failed to upload: ${err instanceof Error ? err.message : "unknown error"}`);
            }
          }
        } else {
          for (const f of filesToUpload) {
            toast.warning(`Attachment "${f.name}" failed to upload`);
          }
        }
      } catch {
        for (const f of filesToUpload) {
          toast.warning(`Attachment "${f.name}" failed to upload`);
        }
      }
    }

    setSubject("");
    setType("general");
    setMessage("");
    setQueuedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onOpenChange(false);
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="md">
        <AppModalHeader>
          <AppModalTitle>New Message</AppModalTitle>
        </AppModalHeader>
        <AppModalBody className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Subject (optional)
            </label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What is this about?"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Category
            </label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONVERSATION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Message
            </label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message…"
              rows={4}
            />
          </div>
          {queuedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {queuedFiles.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs"
                >
                  <span className="truncate max-w-[200px]">{f.name}</span>
                  <span className="text-muted-foreground">({formatBytes(f.size)})</span>
                  <button
                    type="button"
                    onClick={() => removeQueued(i)}
                    className="text-destructive hover:text-destructive/80"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </AppModalBody>
        <AppModalFooter>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={onFilesPicked}
          />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={queuedFiles.length >= MAX_FILES_PER_MESSAGE}
            aria-label="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!message.trim() || isSubmitting}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

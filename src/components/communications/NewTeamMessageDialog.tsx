import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import {
  uploadMessageAttachment,
  validateAttachment,
  MAX_FILES_PER_MESSAGE,
  formatBytes,
} from "@/lib/messageAttachments";

/** Start a conversation with a client (moved out of the Team Communications page unchanged so the page can be rebuilt). */
export function NewTeamMessageDialog({
  open,
  onOpenChange,
  currentUserId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentUserId?: string;
  onCreated: (id: string) => void;
}) {
  const [tenantId, setTenantId] = useState("");
  const [subject, setSubject] = useState("");
  const [type, setType] = useState("general");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch tenants for picker
  const { data: tenants = [] } = useQuery({
    queryKey: ["team-tenants-list"],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("id, name").order("name");
      return data || [];
    },
  });

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
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
        toast.error(err instanceof Error ? err.message : `"${f.name}" was rejected.`);
      }
    }
    if (accepted.length) setQueuedFiles(prev => [...prev, ...accepted]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeQueued = (idx: number) => {
    setQueuedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!tenantId || !message.trim() || !currentUserId) return;
    setSubmitting(true);
    try {
      const tid = parseInt(tenantId);
      // Create conversation
      const { data: conv, error } = await supabase
        .from("tenant_conversations")
        .insert({
          tenant_id: tid,
          topic: "general",
          type,
          subject: subject.trim() || null,
          created_by_user_uuid: currentUserId,
          status: "open",
        })
        .select("id")
        .single();
      if (error) throw error;

      // Add staff as participant (must exist before message INSERT for RLS).
      const { error: staffPartError } = await supabase
        .from("conversation_participants")
        .upsert({
          conversation_id: conv.id,
          user_id: currentUserId,
          role: "staff",
          last_read_at: new Date().toISOString(),
        }, { onConflict: "conversation_id,user_id" });
      if (staffPartError) throw staffPartError;

      // Add all tenant users as participants so every client user can read/write.
      const { data: tenantUsers, error: tenantUsersError } = await supabase
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tid);
      if (tenantUsersError) throw tenantUsersError;

      // Recipients whose participant upsert was skipped below (a stale
      // tenant_users row with no matching auth.users account) -- surfaced
      // to the staff member via a toast, not just console.error'd, so a
      // partial failure isn't invisible (Phase 4 P6-4).
      let skippedParticipantCount = 0;
      if (tenantUsers?.length) {
        const clientRows = tenantUsers.map((u) => ({
          conversation_id: conv.id,
          user_id: u.user_id,
          role: "client",
        }));
        const { error: clientPartError } = await supabase
          .from("conversation_participants")
          .upsert(clientRows, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });
        if (clientPartError) {
          // conversation_participants.user_id FKs to auth.users, not public.users — a
          // stale public.users row with no matching auth account (seeded/fixture
          // profiles) fails the WHOLE batch upsert, which would otherwise block
          // starting a conversation with that tenant at all. Retry row-by-row so one
          // bad participant only costs that one participant, not the whole tenant.
          console.error(`Batch client-participant upsert failed (${clientPartError.message}), retrying row-by-row`);
          for (const row of clientRows) {
            const { error: rowErr } = await supabase
              .from("conversation_participants")
              .upsert(row, { onConflict: "conversation_id,user_id", ignoreDuplicates: true });
            if (rowErr) {
              console.error(`Skipping participant ${row.user_id} — ${rowErr.message}`);
              skippedParticipantCount += 1;
            }
          }
        }
      }

      // Send first message
      const { data: newMsg, error: msgErr } = await supabase
        .from("tenant_messages")
        .insert({
          conversation_id: conv.id,
          sender_user_uuid: currentUserId,
          sender_type: "staff",
          body: message.trim(),
          tenant_id: tid,
        })
        .select("id")
        .single();
      if (msgErr) throw msgErr;

      // Upload queued attachments (best-effort, per-file)
      for (const file of queuedFiles) {
        try {
          await uploadMessageAttachment(supabase, file, tid, conv.id, newMsg.id);
        } catch {
          toast.warning(`Attachment '${file.name}' failed to upload`);
        }
      }

      if (skippedParticipantCount > 0) {
        toast.warning(
          `Conversation started, but ${skippedParticipantCount} client user${skippedParticipantCount > 1 ? "s" : ""} could not be added (no matching account). Check the console/logs for details.`,
        );
      }
      onCreated(conv.id);
      setTenantId("");
      setSubject("");
      setType("general");
      setMessage("");
      setQueuedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="lg">
        <AppModalHeader>
          <AppModalTitle>New Message to Client</AppModalTitle>
        </AppModalHeader>
        <AppModalBody className="space-y-5">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Client</label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger><SelectValue placeholder="Select a client…" /></SelectTrigger>
              <SelectContent>
                {tenants.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Subject</label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="What is this about? (optional)" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Category</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="package">Package</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                  <SelectItem value="rock">Rock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Message</label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Type your message…" rows={5} />
            <p className="text-xs text-muted-foreground mt-1">Your client will be notified when this message is sent.</p>
          </div>
          {queuedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {queuedFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs">
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!tenantId || !message.trim() || submitting} className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            Send
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

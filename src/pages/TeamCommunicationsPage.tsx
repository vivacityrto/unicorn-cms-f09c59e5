import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalBody,
  AppModalFooter,
} from "@/components/ui/modals";
import { MessageSquare, Plus, Send, Paperclip, Megaphone, MailQuestion, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { format, isToday, isYesterday } from "date-fns";
import { useVivacityTeamUsers } from "@/hooks/useVivacityTeamUsers";
import { toast } from "sonner";
import {
  uploadMessageAttachment,
  validateAttachment,
  MAX_FILES_PER_MESSAGE,
  formatBytes,
  type MessageAttachmentRow,
} from "@/lib/messageAttachments";
import { MessageAttachments } from "@/components/messaging/MessageAttachments";
import { AttachmentChips } from "@/components/messaging/AttachmentChips";
import { ClientsRail, type ClientRailItem } from "@/components/messaging/ClientsRail";
import { ThreadList } from "@/components/messaging/ThreadList";
import { ConversationPanel } from "@/components/messaging/ConversationPanel";
import { topicToBadge } from "@/components/messaging/topicBadge";
import { clientAvatarColor, clientInitials } from "@/lib/clientAvatarColor";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BulkMessageDialog } from "@/components/communications/BulkMessageDialog";
import { BulkMessageHistory } from "@/components/communications/BulkMessageHistory";

interface Conversation {
  id: string;
  tenant_id: number;
  topic: string;
  type: string;
  subject: string | null;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  tenant_name?: string;
  isUnread?: boolean;
  isMine?: boolean;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_user_uuid: string;
  sender_type?: string | null;
  body: string;
  created_at: string;
  sender_name?: string;
  sender_avatar_url: string | null;
  attachments?: MessageAttachmentRow[];
}

const TYPE_COLORS: Record<string, string> = {
  general: "bg-muted text-muted-foreground",
  package: "bg-primary/10 text-primary",
  task: "bg-accent/60 text-accent-foreground",
  rock: "bg-secondary text-secondary-foreground",
  broadcast: "bg-accent text-accent-foreground",
};

export default function TeamCommunicationsPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filterTenant, setFilterTenant] = useState<string>("all");
  const [filterStaff, setFilterStaff] = useState<string>("all");
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"conversations" | "history">("conversations");
  const [threadSearch, setThreadSearch] = useState("");
  const canSendBulk =
    profile?.is_team === true ||
    profile?.unicorn_role === "Super Admin" ||
    profile?.unicorn_role === "Team Leader";
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: staffUsers = [] } = useVivacityTeamUsers();
  const staffOptions = staffUsers.map(u => ({
    id: u.user_uuid,
    name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email,
  }));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUserId = profile?.user_uuid;

  // Fetch all conversations staff can see
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ["team-conversations"],
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await (supabase
        .from("tenant_conversations" as any)
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false })) as any;
      if (error) throw error;
      if (!data?.length) return [];

      // Fetch tenant names
      const tenantIds = [...new Set((data as any[]).map((c: any) => c.tenant_id))];
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, name")
        .in("id", tenantIds as number[]);

      const tenantMap = new Map<number, string>();
      (tenants || []).forEach((t: any) => tenantMap.set(t.id, t.name));

      const convoIds = (data as any[]).map((c: any) => c.id);
      const readMap = new Map<string, string | null>();
      const mineSet = new Set<string>();
      if (currentUserId && convoIds.length > 0) {
        const { data: participants } = await (supabase
          .from("conversation_participants" as any)
          .select("conversation_id, last_read_at")
          .eq("user_id", currentUserId)
          .in("conversation_id", convoIds)) as any;
        (participants || []).forEach((p: any) => {
          readMap.set(p.conversation_id, p.last_read_at);
          mineSet.add(p.conversation_id);
        });
      }

      return (data as any[]).map((c: any) => ({
        ...c,
        tenant_name: tenantMap.get(c.tenant_id) || `Tenant ${c.tenant_id}`,
        isUnread: c.last_message_at
          ? !readMap.has(c.id) || !readMap.get(c.id) ||
            new Date(c.last_message_at) > new Date(readMap.get(c.id)!)
          : false,
        isMine: mineSet.has(c.id),
      }));
    },
    enabled: !!currentUserId,
  });

  const lastAutoSelectedRef = useRef<string | null>(null);



  // Get unique tenants for filter
  const tenantOptions = [...new Map(conversations.map(c => [c.tenant_id, c.tenant_name || ""])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Staff filter: fetch conversation IDs the selected staff member participates in
  const { data: staffConvIds } = useQuery({
    queryKey: ["team-comms-staff-conv-ids", filterStaff],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await (supabase
        .from("conversation_participants" as any)
        .select("conversation_id")
        .eq("user_id", filterStaff)) as any;
      if (error) throw error;
      return new Set<string>((data || []).map((p: any) => p.conversation_id));
    },
    enabled: filterStaff !== "all",
  });

  const filteredByTenant = filterTenant === "all"
    ? conversations
    : conversations.filter(c => String(c.tenant_id) === filterTenant);

  const filtered = filterStaff === "all" || !staffConvIds
    ? filteredByTenant
    : filteredByTenant.filter(c => staffConvIds.has(c.id));

  // Clients rail aggregation — derived from all visible conversations.
  // Unread scope: current staff member only (matches useTeamUnreadCount).
  const railItems: ClientRailItem[] = useMemo(() => {
    const map = new Map<number, ClientRailItem>();
    for (const c of conversations) {
      const unreadDelta = c.isMine && c.isUnread ? 1 : 0;
      const existing = map.get(c.tenant_id);
      if (!existing) {
        map.set(c.tenant_id, {
          tenantId: c.tenant_id,
          tenantName: c.tenant_name || `Tenant ${c.tenant_id}`,
          threadCount: 1,
          unreadCount: unreadDelta,
          lastActivity: c.last_message_at,
        });
      } else {
        existing.threadCount += 1;
        existing.unreadCount += unreadDelta;
        if (
          c.last_message_at &&
          (!existing.lastActivity || new Date(c.last_message_at) > new Date(existing.lastActivity))
        ) {
          existing.lastActivity = c.last_message_at;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const at = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const bt = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      return bt - at;
    });
  }, [conversations]);

  const totalUnread = useMemo(
    () => conversations.reduce((n, c) => n + (c.isMine && c.isUnread ? 1 : 0), 0),
    [conversations],
  );

  // Enrich threads with last message sender_type so preview can prefix "You:".
  const convoIdList = useMemo(() => conversations.map(c => c.id), [conversations]);
  const { data: lastSenderMap = {} } = useQuery({
    queryKey: ["team-conversations-last-sender", convoIdList.length, convoIdList[0] ?? null],
    queryFn: async (): Promise<Record<string, string | null>> => {
      if (convoIdList.length === 0) return {};
      const { data, error } = await (supabase
        .from("tenant_messages" as any)
        .select("conversation_id, sender_type, created_at")
        .in("conversation_id", convoIdList)
        .order("created_at", { ascending: false })
        .limit(2000)) as any;
      if (error) return {};
      const seen: Record<string, string | null> = {};
      for (const row of (data ?? []) as any[]) {
        if (!(row.conversation_id in seen)) seen[row.conversation_id] = row.sender_type ?? null;
      }
      return seen;
    },
    enabled: convoIdList.length > 0,
    staleTime: 30_000,
  });


  const selected = conversations.find(c => c.id === selectedId);

  // Fetch messages for selected conversation
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["team-conversation-messages", selectedId],
    queryFn: async (): Promise<Message[]> => {
      if (!selectedId) return [];
      const { data, error } = await (supabase
        .from("tenant_messages" as any)
        .select("id, conversation_id, sender_user_uuid, sender_type, body, created_at")
        .eq("conversation_id", selectedId)
        .order("created_at", { ascending: true })) as any;
      if (error) throw error;
      if (!data?.length) return [];

      const senderIds = Array.from(new Set<string>((data as any[]).map((m: any) => m.sender_user_uuid)));

      const { data: users } = await (supabase
        .from("users")
        .select("user_uuid, first_name, last_name, avatar_url")
        .in("user_uuid", senderIds)) as any;

      const nameMap = new Map<string, string>();
      const avatarMap = new Map<string, string | null>();
      (users || []).forEach((u: any) => {
        nameMap.set(u.user_uuid, [u.first_name, u.last_name].filter(Boolean).join(" "));
        avatarMap.set(u.user_uuid, u.avatar_url ?? null);
      });

      const messageIds = (data as any[]).map((m: any) => m.id);
      const attMap = new Map<string, MessageAttachmentRow[]>();
      if (messageIds.length > 0) {
        const { data: attRows } = await (supabase
          .from("tenant_message_attachments" as any)
          .select("*")
          .in("message_id", messageIds)) as any;
        (attRows || []).forEach((a: any) => {
          const arr = attMap.get(a.message_id) || [];
          arr.push(a as MessageAttachmentRow);
          attMap.set(a.message_id, arr);
        });
      }

      const mapped = (data as any[]).map((m: any) => {
        const resolved = nameMap.get(m.sender_user_uuid) || "";
        const fallback = m.sender_type === "staff" ? "Vivacity Team" : "Unknown";
        return {
          id: m.id,
          conversation_id: m.conversation_id,
          sender_user_uuid: m.sender_user_uuid,
          sender_type: m.sender_type ?? null,
          body: m.body,
          created_at: m.created_at,
          sender_name: resolved || fallback,
          sender_avatar_url: avatarMap.get(m.sender_user_uuid) ?? null,
          attachments: attMap.get(m.id) || [],
        };
      }) as Message[];

      // Fire-and-forget read audit.
      if (mapped.length > 0 && currentUserId) {
        const conv = conversations.find(c => c.id === selectedId);
        void (supabase
          .from("audit_events")
          .insert({
            entity: "tenant_message_read",
            entity_id: selectedId,
            action: "messages_read",
            user_id: currentUserId,
            details: {
              conversation_id: selectedId,
              tenant_id: conv?.tenant_id ?? null,
              message_count: mapped.length,
            },
          } as any) as any).then(() => {}, () => {});
      }

      return mapped;
    },
    enabled: !!selectedId,
  });

  // Realtime: invalidate on new messages for the open thread.
  useEffect(() => {
    if (!selectedId) return;
    const channel = supabase
      .channel(`team-tm:${selectedId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "tenant_messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["team-conversation-messages", selectedId] });
          qc.invalidateQueries({ queryKey: ["team-conversations"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId, qc]);

  // Always-on: keep conversation list fresh on any new message in any thread
  useEffect(() => {
    const channel = supabase
      .channel("team-conversations-live")
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "tenant_conversations",
        },
        (payload: any) => {
          qc.invalidateQueries({ queryKey: ["team-conversations"] });
          if (selectedId && payload.new?.id === selectedId) {
            qc.invalidateQueries({ queryKey: ["team-conversation-messages", selectedId] });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, selectedId]);

  const handleSelectConversation = useCallback(async (convId: string) => {
    setSelectedId(convId);
    setSearchParams({ thread: convId }, { replace: true });
    if (!currentUserId) return;
    // Stamp last_read_at without touching the existing role
    await (supabase
      .from("conversation_participants" as any)
      .update({ last_read_at: new Date().toISOString() } as any)
      .eq("conversation_id", convId)
      .eq("user_id", currentUserId)) as any;

    // Mark any message notifications for this conversation as read (fire-and-forget)
    void (supabase
      .from("user_notifications" as any)
      .update({ is_read: true } as any)
      .eq("user_id", currentUserId)
      .eq("source_id", convId)
      .eq("is_read", false) as any).then(() => {}, () => {});

    qc.invalidateQueries({ queryKey: ["team-unread-count"] });
  }, [currentUserId, qc, setSearchParams]);

  const handleMarkUnread = useCallback(async () => {
    if (!currentUserId || !selectedId) return;
    const { error } = await (supabase
      .from("conversation_participants" as any)
      .update({ last_read_at: null } as any)
      .eq("conversation_id", selectedId)
      .eq("user_id", currentUserId)) as any;
    if (error) {
      toast.error("Could not mark as unread");
      return;
    }
    toast.success("Marked as unread");
    qc.invalidateQueries({ queryKey: ["team-conversations"] });
    qc.invalidateQueries({ queryKey: ["team-unread-count"] });
  }, [currentUserId, selectedId, qc]);

  useEffect(() => {
    const threadId = searchParams.get('thread');
    if (threadId && conversations.length > 0 && threadId !== lastAutoSelectedRef.current) {
      lastAutoSelectedRef.current = threadId;
      handleSelectConversation(threadId);
    }
  }, [conversations, searchParams, handleSelectConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Send message
  const sendMessage = useMutation({
    mutationFn: async ({ conversationId, body }: { conversationId: string; body: string }) => {
      if (!currentUserId) throw new Error("Not authenticated");
      const conv = conversations.find(c => c.id === conversationId);

      // Step 1: Insert participant row only if not already present (never overwrite role)
      const { error: partError } = await (supabase
        .from("conversation_participants" as any)
        .upsert(
          {
            conversation_id: conversationId,
            user_id: currentUserId,
            role: "staff",
            last_read_at: new Date().toISOString(),
          } as any,
          { onConflict: "conversation_id,user_id", ignoreDuplicates: true }
        )) as any;
      if (partError) throw partError;

      // Step 2: Stamp last_read_at on the existing row regardless of its role
      await (supabase
        .from("conversation_participants" as any)
        .update({ last_read_at: new Date().toISOString() } as any)
        .eq("conversation_id", conversationId)
        .eq("user_id", currentUserId)) as any;

      const { data: newMsg, error } = await (supabase
        .from("tenant_messages" as any)
        .insert({
          conversation_id: conversationId,
          sender_user_uuid: currentUserId,
          sender_type: "staff",
          body,
          tenant_id: conv?.tenant_id,
        } as any)
        .select("id")
        .single()) as any;
      if (error) throw error;
      return { messageId: newMsg.id as string, tenantId: conv?.tenant_id };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["team-conversation-messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["team-conversations"] });
    },
  });

  const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!picked.length) return;
    const accepted: File[] = [];
    for (const f of picked) {
      try {
        validateAttachment(f);
        accepted.push(f);
      } catch (err: any) {
        toast.error(err?.message ?? "Invalid file");
      }
    }
    setQueuedFiles(prev => {
      const room = MAX_FILES_PER_MESSAGE - prev.length;
      if (room <= 0) {
        toast.error(`You can attach up to ${MAX_FILES_PER_MESSAGE} files per message.`);
        return prev;
      }
      if (accepted.length > room) {
        toast.error(`Only the first ${room} file(s) were attached (max ${MAX_FILES_PER_MESSAGE} per message).`);
      }
      return [...prev, ...accepted.slice(0, room)];
    });
  };

  const removeQueued = (idx: number) => {
    setQueuedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSend = async () => {
    if ((!composerText.trim() && queuedFiles.length === 0) || !selectedId) return;
    const text = composerText.trim();
    const filesToUpload = queuedFiles;
    setComposerText("");
    setQueuedFiles([]);
    const result = await sendMessage.mutateAsync({ conversationId: selectedId, body: text });
    if (result?.messageId && result?.tenantId != null && filesToUpload.length > 0) {
      for (const f of filesToUpload) {
        try {
          await uploadMessageAttachment(supabase, f, result.tenantId, selectedId, result.messageId);
        } catch (err: any) {
          toast.warning(`Attachment "${f.name}" failed to upload: ${err?.message ?? "unknown error"}`);
        }
      }
      qc.invalidateQueries({ queryKey: ["team-conversation-messages", selectedId] });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const composerRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const maxHeight = lineHeight * 6;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [composerText]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const images: File[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (!file) continue;
        try {
          validateAttachment(file);
          images.push(file);
        } catch (err: any) {
          toast.error(err?.message ?? "Invalid file");
        }
      }
    }
    if (images.length === 0) return;
    e.preventDefault();
    setQueuedFiles(prev => {
      const room = MAX_FILES_PER_MESSAGE - prev.length;
      if (room <= 0) {
        toast.error(`You can attach up to ${MAX_FILES_PER_MESSAGE} files per message.`);
        return prev;
      }
      if (images.length > room) {
        toast.error(`Only the first ${room} file(s) were attached (max ${MAX_FILES_PER_MESSAGE} per message).`);
      }
      return [...prev, ...images.slice(0, room)];
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Team Communications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All client conversations across your portfolio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canSendBulk && (
            <Button
              variant="outline"
              onClick={() => setBulkDialogOpen(true)}
              className="gap-1.5"
            >
              <Megaphone className="h-4 w-4" />
              Bulk Message
            </Button>
          )}
          <Button onClick={() => setNewDialogOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Message
          </Button>
        </div>
      </div>

      {canSendBulk && (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "conversations" | "history")}>
          <TabsList>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="history">Bulk Message History</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {canSendBulk && activeTab === "history" ? (
        <BulkMessageHistory />
      ) : (
        <>


      {/* Optional staff filter (kept from previous UI) */}
      <div className="flex gap-2 items-center flex-wrap">
        <Select value={filterStaff} onValueChange={setFilterStaff}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Team Members" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Team Members</SelectItem>
            {staffOptions.map(s => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div
          className="grid min-w-0 gap-3 grid-cols-1 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:grid-cols-[minmax(15rem,17rem)_minmax(0,22rem)_minmax(0,1fr)] h-[calc(100vh-13rem)] min-h-[32rem]"
        >
          {/* Clients rail (lg+ only) */}
          <ClientsRail
            className="hidden lg:flex min-h-0 min-w-0"
            items={railItems}
            totalThreads={conversations.length}
            totalUnread={totalUnread}
            selected={filterTenant}
            onSelect={setFilterTenant}
          />

          {/* Thread list */}
          <ThreadList
            className="min-h-0 min-w-0"
            items={(() => {
              const q = threadSearch.trim().toLowerCase();
              const list = q
                ? filtered.filter(c =>
                    (c.subject ?? "").toLowerCase().includes(q) ||
                    (c.last_message_preview ?? "").toLowerCase().includes(q) ||
                    (c.tenant_name ?? "").toLowerCase().includes(q)
                  )
                : filtered;
              return list.map(c => ({
                id: c.id,
                tenant_id: c.tenant_id,
                tenant_name: c.tenant_name,
                topic: c.topic,
                subject: c.subject,
                last_message_at: c.last_message_at,
                last_message_preview: c.last_message_preview,
                last_sender_type: lastSenderMap[c.id] ?? null,
                isUnread: c.isUnread,
              }));
            })()}
            selectedId={selectedId}
            onSelect={handleSelectConversation}
            scopeLabel={(() => {
              const count = filtered.length;
              if (filterTenant === "all") {
                const clientCount = railItems.length;
                return `${count} ${count === 1 ? "thread" : "threads"} across ${clientCount} ${clientCount === 1 ? "client" : "clients"}`;
              }
              return `${count} ${count === 1 ? "thread" : "threads"}`;
            })()}
            search={threadSearch}
            onSearchChange={setThreadSearch}
          />

          {/* Conversation panel */}
          <div className="border rounded-lg border-border bg-card flex flex-col min-h-0 min-w-0 overflow-hidden">
            {selected ? (
              <ConversationPanel
                conversation={selected}
                messages={messages}
                messagesLoading={messagesLoading}
                currentUserId={currentUserId}
                messagesEndRef={messagesEndRef}
                onMarkUnread={handleMarkUnread}
                composer={
                  <div className="p-3 border-t border-border flex-shrink-0 min-w-0">
                    <AttachmentChips files={queuedFiles} onRemove={removeQueued} />
                    <div className="flex min-w-0 gap-2">
                      <Textarea
                        ref={composerRef}
                        value={composerText}
                        onChange={e => setComposerText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                        className="min-h-[40px] max-h-28 min-w-0 flex-1 resize-none overflow-y-auto"
                        rows={1}
                      />
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        hidden
                        accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx"
                        onChange={handleFilesPicked}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={queuedFiles.length >= MAX_FILES_PER_MESSAGE}
                        aria-label="Attach files"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        onClick={handleSend}
                        disabled={(!composerText.trim() && queuedFiles.length === 0) || sendMessage.isPending}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                    {composerText.length === 0 && queuedFiles.length === 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Tip: paste a screenshot directly into the message box
                      </p>
                    )}
                  </div>
                }
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a conversation to view messages.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
        </>
      )}


      {/* New Message to Tenant dialog */}
      <NewTeamMessageDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        currentUserId={currentUserId}
        onCreated={(id) => {
          setSelectedId(id);
          setSearchParams({ thread: id }, { replace: true });
          qc.invalidateQueries({ queryKey: ["team-conversations"] });
        }}
      />

      {/* Bulk Message dialog */}
      <BulkMessageDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        currentUserId={currentUserId}
        onSent={() => {
          setActiveTab("history");
        }}
      />

    </div>
  );
}

function NewTeamMessageDialog({
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
      } catch (err: any) {
        toast.error(err?.message || `"${f.name}" was rejected.`);
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
      const { data: conv, error } = await (supabase
        .from("tenant_conversations" as any)
        .insert({
          tenant_id: tid,
          topic: "general",
          type,
          subject: subject.trim() || null,
          created_by_user_uuid: currentUserId,
          status: "open",
        } as any)
        .select("id")
        .single()) as any;
      if (error) throw error;

      // Add staff as participant (must exist before message INSERT for RLS).
      const { error: staffPartError } = await (supabase
        .from("conversation_participants" as any)
        .upsert({
          conversation_id: conv.id,
          user_id: currentUserId,
          role: "staff",
          last_read_at: new Date().toISOString(),
        } as any, { onConflict: "conversation_id,user_id" })) as any;
      if (staffPartError) throw staffPartError;

      // Add all tenant users as participants so every client user can read/write.
      const { data: tenantUsers } = await supabase
        .from("tenant_users")
        .select("user_id")
        .eq("tenant_id", tid);

      if (tenantUsers?.length) {
        await (supabase
          .from("conversation_participants" as any)
          .upsert(
            tenantUsers.map((u: any) => ({
              conversation_id: conv.id,
              user_id: u.user_id,
              role: "client",
            })),
            { onConflict: "conversation_id,user_id", ignoreDuplicates: true }
          )) as any;
      }

      // Send first message
      const { data: newMsg, error: msgErr } = await (supabase
        .from("tenant_messages" as any)
        .insert({
          conversation_id: conv.id,
          sender_user_uuid: currentUserId,
          sender_type: "staff",
          body: message.trim(),
          tenant_id: tid,
        } as any)
        .select("id")
        .single()) as any;
      if (msgErr) throw msgErr;

      // Upload queued attachments (best-effort, per-file)
      for (const file of queuedFiles) {
        try {
          await uploadMessageAttachment(supabase, file, tid, conv.id, newMsg.id);
        } catch {
          toast.warning(`Attachment '${file.name}' failed to upload`);
        }
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
                {tenants.map((t: any) => (
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

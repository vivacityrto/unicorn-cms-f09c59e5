import { useState, useRef, useEffect, useCallback } from "react";
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
import { MessageSquare, Plus, Send, Mail, MailOpen, Building2 } from "lucide-react";
import { format } from "date-fns";
import { useVivacityTeamUsers } from "@/hooks/useVivacityTeamUsers";

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
  const [filterTenant, setFilterTenant] = useState<string>("all");
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
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
      if (currentUserId && convoIds.length > 0) {
        const { data: participants } = await (supabase
          .from("conversation_participants" as any)
          .select("conversation_id, last_read_at")
          .eq("user_id", currentUserId)
          .in("conversation_id", convoIds)) as any;
        (participants || []).forEach((p: any) =>
          readMap.set(p.conversation_id, p.last_read_at)
        );
      }

      return (data as any[]).map((c: any) => ({
        ...c,
        tenant_name: tenantMap.get(c.tenant_id) || `Tenant ${c.tenant_id}`,
        isUnread: c.last_message_at
          ? !readMap.has(c.id) || !readMap.get(c.id) ||
            new Date(c.last_message_at) > new Date(readMap.get(c.id)!)
          : false,
      }));
    },
    enabled: !!currentUserId,
  });

  const lastAutoSelectedRef = useRef<string | null>(null);



  // Get unique tenants for filter
  const tenantOptions = [...new Map(conversations.map(c => [c.tenant_id, c.tenant_name || ""])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const filtered = filterTenant === "all"
    ? conversations
    : conversations.filter(c => String(c.tenant_id) === filterTenant);

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
        .select("user_uuid, first_name, last_name")
        .in("user_uuid", senderIds)) as any;

      const nameMap = new Map<string, string>();
      (users || []).forEach((u: any) => {
        nameMap.set(u.user_uuid, [u.first_name, u.last_name].filter(Boolean).join(" ") || "Unknown");
      });

      const mapped = (data as any[]).map((m: any) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        sender_user_uuid: m.sender_user_uuid,
        sender_type: m.sender_type ?? null,
        body: m.body,
        created_at: m.created_at,
        sender_name: nameMap.get(m.sender_user_uuid) || "Unknown",
      })) as Message[];

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

      const { error } = await (supabase
        .from("tenant_messages" as any)
        .insert({
          conversation_id: conversationId,
          sender_user_uuid: currentUserId,
          sender_type: "staff",
          body,
          tenant_id: conv?.tenant_id,
        } as any)) as any;
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["team-conversation-messages", vars.conversationId] });
      qc.invalidateQueries({ queryKey: ["team-conversations"] });
    },
  });

  const handleSend = async () => {
    if (!composerText.trim() || !selectedId) return;
    const text = composerText.trim();
    setComposerText("");
    await sendMessage.mutateAsync({ conversationId: selectedId, body: text });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
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
        <Button onClick={() => setNewDialogOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Message
        </Button>
      </div>

      {/* Filter by tenant */}
      <div className="flex gap-2 items-center">
        <Select value={filterTenant} onValueChange={setFilterTenant}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {tenantOptions.map(t => (
              <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: "60vh" }}>
          {/* Thread list */}
          <div className="lg:col-span-1 border rounded-lg overflow-hidden border-border">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No conversations found.</p>
              </div>
            ) : (
              <ScrollArea className="h-[60vh]">
                <div className="divide-y divide-border">
                  {filtered.map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                        selectedId === conv.id ? "bg-muted/70" : ""
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">{conv.tenant_name}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 capitalize ml-auto ${TYPE_COLORS[conv.type] || ""}`}
                        >
                          {conv.type}
                        </Badge>
                        {conv.isUnread && (
                          <span className="h-2 w-2 rounded-full bg-[#23C0DD] flex-shrink-0" />
                        )}
                      </div>
                      <p className={`text-sm truncate text-foreground ${conv.isUnread ? "font-semibold" : "font-medium"}`}>
                        {conv.subject || conv.topic || "General"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {conv.last_message_preview || "No messages yet"}
                      </p>
                      {conv.last_message_at && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {format(new Date(conv.last_message_at), "d MMM yyyy, HH:mm")}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Message detail + composer */}
          <div className="lg:col-span-2 border rounded-lg border-border flex flex-col">
            {selected ? (
              <>
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <h2 className="font-semibold text-foreground truncate">
                    {selected.subject || selected.topic || "General"}
                  </h2>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 capitalize ${TYPE_COLORS[selected.type] || ""}`}>
                    {selected.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{selected.tenant_name}</span>
                </div>

                <ScrollArea className="flex-1 min-h-0" style={{ maxHeight: "calc(60vh - 140px)" }}>
                  <div className="p-4 space-y-3">
                    {messagesLoading ? (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-14 w-3/4 rounded-lg" />
                        ))}
                      </div>
                    ) : messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
                    ) : (
                      messages.map(msg => {
                        const isOwn = msg.sender_user_uuid === currentUserId;
                        return (
                          <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                            <div className={`rounded-lg px-3 py-2 max-w-[75%] ${isOwn ? "bg-primary/10 text-foreground" : "bg-muted text-foreground"}`}>
                              {!isOwn && <p className="text-xs font-medium text-muted-foreground mb-0.5">{msg.sender_name}</p>}
                              <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                              <p className="text-[11px] text-muted-foreground mt-1">{format(new Date(msg.created_at), "d MMM, HH:mm")}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                <div className="p-3 border-t border-border flex gap-2">
                  <Textarea
                    value={composerText}
                    onChange={e => setComposerText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message… (Enter to send)"
                    className="min-h-[40px] max-h-[120px] resize-none"
                    rows={1}
                  />
                  <Button size="icon" onClick={handleSend} disabled={!composerText.trim() || sendMessage.isPending}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
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

  // Fetch tenants for picker
  const { data: tenants = [] } = useQuery({
    queryKey: ["team-tenants-list"],
    queryFn: async () => {
      const { data } = await supabase.from("tenants").select("id, name").order("name");
      return data || [];
    },
  });

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
      await (supabase
        .from("tenant_messages" as any)
        .insert({
          conversation_id: conv.id,
          sender_user_uuid: currentUserId,
          sender_type: "staff",
          body: message.trim(),
          tenant_id: tid,
        } as any)) as any;

      onCreated(conv.id);
      setTenantId("");
      setSubject("");
      setType("general");
      setMessage("");
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="md">
        <AppModalHeader>
          <AppModalTitle>New Message to Client</AppModalTitle>
        </AppModalHeader>
        <AppModalBody className="space-y-4">
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
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Subject (optional)</label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="What is this about?" />
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
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Message</label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Type your message…" rows={4} />
          </div>
        </AppModalBody>
        <AppModalFooter>
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

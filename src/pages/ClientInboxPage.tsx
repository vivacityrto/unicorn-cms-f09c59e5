import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, isToday, isThisWeek } from "date-fns";
import {
  Inbox,
  MessageSquare,
  Mail,
  MailOpen,
  Send,
  Plus,
  Bell,
  CheckCheck,
  ExternalLink,
  Info,
  Paperclip,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadMessageAttachment,
  validateAttachment,
  MAX_FILES_PER_MESSAGE,
} from "@/lib/messageAttachments";
import { MessageAttachments } from "@/components/messaging/MessageAttachments";
import { AttachmentChips } from "@/components/messaging/AttachmentChips";

import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientInbox } from "@/hooks/useClientInbox";
import {
  useClientCommunications,
  type ConversationThread,
} from "@/hooks/useClientCommunications";
import {
  useClientNotifications,
  type ClientNotification,
} from "@/hooks/useClientNotifications";
import { useNotificationPrefs, type CategoryPrefs } from "@/hooks/useNotificationPrefs";

import { InboxItemRow } from "@/components/inbox/InboxItemRow";
import { NewConversationDialog } from "@/components/client/NewConversationDialog";
import type { InboxItem } from "@/types/inbox";

type TabValue = "all" | "messages" | "notifications";

const VALID_TABS: TabValue[] = ["all", "messages", "notifications"];

/** Map any incoming legacy ?type= or ?tab= search param into a valid tab. */
function resolveTabFromParams(search: URLSearchParams): TabValue {
  const tab = search.get("tab");
  if (tab && (VALID_TABS as string[]).includes(tab)) return tab as TabValue;

  const legacyType = search.get("type");
  if (legacyType === "message") return "messages";
  // announcement / task / anything else collapses to "all"
  return "all";
}

export default function ClientInboxPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveTabFromParams(searchParams);

  const setTab = (next: TabValue) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    params.delete("type");
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setTab(v as TabValue)}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold text-foreground">Inbox</h1>
          </div>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="mt-4">
          <AllTab />
        </TabsContent>
        <TabsContent value="messages" className="mt-4">
          <MessagesTab />
        </TabsContent>
        <TabsContent value="notifications" className="mt-4">
          <NotificationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ALL tab — merged messages + notifications                                  */
/* -------------------------------------------------------------------------- */

function AllTab() {
  const { items, isLoading } = useClientInbox();
  const navigate = useNavigate();

  const handleClick = (item: InboxItem) => {
    if (item.item_type === "message") {
      navigate(`/client/inbox?tab=messages&thread=${item.source_id}`);
    } else {
      navigate(`/client/inbox?tab=notifications`);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">Loading inbox…</div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm">
          You're all caught up!
        </div>
      ) : (
        items.map((item) => {
          // Adapt the unified item to the InboxItem shape InboxItemRow expects.
          const adapted: InboxItem = {
            inbox_id: `${item.item_type}-${item.id}`,
            tenant_id: 0,
            user_id: null,
            item_type: item.item_type,
            item_source: item.item_type,
            source_id: item.id,
            title: item.title,
            preview: item.body,
            status: null,
            due_at: null,
            priority: null,
            unread: !item.is_read,
            action_required: false,
            related_entity: null,
            related_entity_id: null,
            created_at: item.created_at,
            updated_at: item.created_at,
          };
          return (
            <InboxItemRow key={adapted.inbox_id} item={adapted} onClick={handleClick} />
          );
        })
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  MESSAGES tab — two-pane conversation view                                  */
/* -------------------------------------------------------------------------- */

const TYPE_COLORS: Record<string, string> = {
  general: "bg-muted text-muted-foreground",
  package: "bg-primary/10 text-primary",
  task: "bg-accent/60 text-accent-foreground",
  rock: "bg-secondary text-secondary-foreground",
  broadcast: "bg-accent text-accent-foreground",
};

function MessagesTab() {
  const {
    conversations,
    totalUnread,
    isLoading,
    useConversationMessages,
    sendMessage,
    createConversation,
    markRead,
    currentUserId,
  } = useClientCommunications();

  const { isReadOnly, activeTenantId } = useClientTenant();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadParam = searchParams.get("thread") ?? searchParams.get("conversation");
  const [selectedId, setSelectedId] = useState<string | null>(threadParam);
  const [filterUnread, setFilterUnread] = useState(false);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync ?thread= URL param into selection
  useEffect(() => {
    if (threadParam && threadParam !== selectedId) setSelectedId(threadParam);
  }, [threadParam, selectedId]);

  // Auto mark-as-read whenever a conversation becomes selected (click or deep link)
  const mutateMarkRead = markRead.mutate;
  useEffect(() => {
    if (!selectedId || !conversations.length) return;
    const conv = conversations.find((c) => c.id === selectedId);
    if (conv?.isUnread) {
      mutateMarkRead(selectedId);
    }
  }, [selectedId, conversations, mutateMarkRead]);

  const filtered = filterUnread ? conversations.filter((c) => c.isUnread) : conversations;
  const selected = conversations.find((c) => c.id === selectedId);

  const { data: messages = [], isLoading: messagesLoading } =
    useConversationMessages(selectedId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSelect = (conv: ConversationThread) => {
    setSelectedId(conv.id);
    const params = new URLSearchParams(searchParams);
    params.set("tab", "messages");
    params.set("thread", conv.id);
    setSearchParams(params, { replace: true });
    if (conv.isUnread) markRead.mutate(conv.id);
  };

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
    const result: any = await sendMessage.mutateAsync({ conversationId: selectedId, body: text });
    if (result?.messageId && activeTenantId != null && filesToUpload.length > 0) {
      for (const f of filesToUpload) {
        try {
          await uploadMessageAttachment(supabase, f, activeTenantId, selectedId, result.messageId);
        } catch (err: any) {
          toast.warning(`Attachment "${f.name}" failed to upload: ${err?.message ?? "unknown error"}`);
        }
      }
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

  const handleNewConversation = async (data: {
    subject?: string;
    type: string;
    firstMessage: string;
  }): Promise<string> => {
    const newId = await createConversation.mutateAsync({
      subject: data.subject,
      type: data.type,
      firstMessage: data.firstMessage,
    });
    setSelectedId(newId);
    return newId;
  };


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <Button
            variant={!filterUnread ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterUnread(false)}
          >
            All
          </Button>
          <Button
            variant={filterUnread ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterUnread(true)}
            className="gap-1.5"
          >
            <Mail className="h-3.5 w-3.5" />
            Unread
            {totalUnread > 0 && (
              <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0">
                {totalUnread}
              </Badge>
            )}
          </Button>
        </div>
        {!isReadOnly && (
          <Button onClick={() => setNewDialogOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Message
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div
          className="grid grid-cols-1 xl:grid-cols-3 gap-4"
          style={{ minHeight: "60vh" }}
        >
          {/* Thread list */}
          <div className="xl:col-span-1 min-w-0 max-w-full border rounded-lg overflow-x-hidden border-border">
            {filtered.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No conversations yet.</p>
              </div>
            ) : (
              <div className="h-[60vh] overflow-x-hidden overflow-y-auto">
                <div className="divide-y divide-border">
                  {filtered.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => handleSelect(conv)}
                      className={`w-full max-w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-center gap-3 ${
                        selectedId === conv.id
                          ? "bg-muted/70"
                          : conv.isUnread
                            ? "bg-primary/5"
                            : ""
                      }`}
                    >
                      {conv.isUnread ? (
                        <Mail className="h-4 w-4 flex-shrink-0 text-destructive" />
                      ) : (
                        <MailOpen className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5 mb-0.5">
                          <p className={`text-sm truncate ${conv.isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground"}`}>
                            {conv.subject || conv.topic || "General"}
                          </p>
                          <Badge
                            variant="outline"
                            className={`shrink-0 text-[10px] px-1.5 py-0 capitalize ${
                              TYPE_COLORS[conv.type] || ""
                            }`}
                          >
                            {conv.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {conv.last_message_preview || "No messages yet"}
                        </p>
                        {conv.last_message_at && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {format(new Date(conv.last_message_at), "d MMM yyyy, HH:mm")}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Message detail + composer */}
          <div className="xl:col-span-2 min-w-0 border rounded-lg border-border flex flex-col">
            {selected ? (
              <>
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <h2 className="font-semibold text-foreground truncate">
                    {selected.subject || selected.topic || "General"}
                  </h2>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 capitalize ${
                      TYPE_COLORS[selected.type] || ""
                    }`}
                  >
                    {selected.type}
                  </Badge>
                </div>

                <ScrollArea
                  className="flex-1 min-h-0"
                  style={{ maxHeight: "calc(60vh - 140px)" }}
                >
                  <div className="p-4 space-y-3">
                    {messagesLoading ? (
                      <div className="space-y-2">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-14 w-3/4 rounded-lg" />
                        ))}
                      </div>
                    ) : messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">
                        No messages in this conversation yet.
                      </p>
                    ) : (
                      messages.map((msg) => {
                        const isOwn = msg.sender_id === currentUserId;
                        return (
                          <div
                            key={msg.id}
                            className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`rounded-lg px-3 py-2 max-w-[75%] ${
                                isOwn
                                  ? "bg-primary/10 text-foreground"
                                  : "bg-muted text-foreground"
                              }`}
                            >
                              {!isOwn && (
                                <p className="text-xs font-medium text-muted-foreground mb-0.5">
                                  {msg.sender_name}
                                </p>
                              )}
                              <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                              {msg.attachments && msg.attachments.length > 0 && (
                                <MessageAttachments attachments={msg.attachments} />
                              )}
                              <p className="text-[11px] text-muted-foreground mt-1">
                                {format(new Date(msg.created_at), "d MMM, HH:mm")}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {!isReadOnly && (
                  <div className="p-3 border-t border-border">
                    <AttachmentChips files={queuedFiles} onRemove={removeQueued} />
                    <div className="flex gap-2">
                      <Textarea
                        ref={composerRef}
                        value={composerText}
                        onChange={(e) => setComposerText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                        className="min-h-[40px] resize-none overflow-y-auto"
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
                )}
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

      <NewConversationDialog
        open={newDialogOpen}
        onOpenChange={setNewDialogOpen}
        onSubmit={handleNewConversation}
        isSubmitting={createConversation.isPending}
        tenantId={activeTenantId ?? null}
      />

    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  NOTIFICATIONS tab — grouped notification feed                              */
/* -------------------------------------------------------------------------- */

type NotifFilter = "all" | "events" | "tasks" | "meetings" | "obligations";

const TYPE_TO_CATEGORY: Record<string, keyof CategoryPrefs> = {
  task_due: "tasks",
  meeting_upcoming: "meetings",
  obligation_due: "obligations",
  events: "events",
  event: "events",
};

function resolveNotificationLink(n: ClientNotification): string {
  if (n.type === 'message' && n.link) {
    try {
      const url = new URL(n.link, window.location.origin);
      const convId = url.searchParams.get('conversation');
      if (convId) return `/client/inbox?tab=messages&thread=${convId}`;
    } catch {}
  }
  return n.link || '/client/inbox?tab=notifications';
}

function groupNotifications(notifications: ClientNotification[]) {
  const today: ClientNotification[] = [];
  const thisWeek: ClientNotification[] = [];
  const older: ClientNotification[] = [];
  for (const n of notifications) {
    const d = new Date(n.created_at);
    if (isToday(d)) today.push(n);
    else if (isThisWeek(d, { weekStartsOn: 1 })) thisWeek.push(n);
    else older.push(n);
  }
  return { today, thisWeek, older };
}

function NotificationsTab() {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } =
    useClientNotifications();
  const { categories: prefs } = useNotificationPrefs();
  const [filter, setFilter] = useState<NotifFilter>("all");
  const navigate = useNavigate();

  const hasHiddenCategories = Object.values(prefs).some((v) => !v);

  const filtered = useMemo(() => {
    let items = notifications.filter((n) => {
      const cat = TYPE_TO_CATEGORY[n.type || ""];
      if (cat && !prefs[cat]) return false;
      return true;
    });
    if (filter !== "all") {
      items = items.filter((n) => n.type === filter || n.type?.toLowerCase() === filter);
    }
    return items;
  }, [notifications, filter, prefs]);

  const groups = useMemo(() => groupNotifications(filtered), [filtered]);

  const handleClick = (n: ClientNotification) => {
    if (!n.is_read) markAsRead(n.id);
    navigate(resolveNotificationLink(n));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  const renderGroup = (title: string, items: ClientNotification[]) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
        {items.map((n) => (
          <button
            key={n.id}
            onClick={() => handleClick(n)}
            className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors hover:bg-accent ${
              !n.is_read ? "bg-primary/5 border-primary/20" : ""
            }`}
          >
            <Bell className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p
                  className={`text-sm ${
                    !n.is_read ? "font-semibold" : "font-medium"
                  } truncate`}
                >
                  {n.title}
                </p>
                {!n.is_read && (
                  <Badge variant="default" className="text-[10px] px-1.5 py-0">
                    New
                  </Badge>
                )}
              </div>
              {n.message && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {n.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {format(new Date(n.created_at), "d MMM yyyy, h:mm a")}
              </p>
            </div>
            {n.link && (
              <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
            )}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          {unreadCount > 0
            ? `You have ${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`
            : "You're all caught up"}
        </p>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllAsRead()}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all as read
          </Button>
        )}
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as NotifFilter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="obligations">Obligations</TabsTrigger>
        </TabsList>
      </Tabs>

      {hasHiddenCategories && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          Some notification types are hidden based on your preferences.
        </div>
      )}

      <div className="space-y-6">
        {renderGroup("Today", groups.today)}
        {renderGroup("This Week", groups.thisWeek)}
        {renderGroup("Older", groups.older)}

        {filtered.length === 0 && (
          <Card className="p-8 text-center">
            <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">No notifications to show</p>
          </Card>
        )}
      </div>
    </div>
  );
}

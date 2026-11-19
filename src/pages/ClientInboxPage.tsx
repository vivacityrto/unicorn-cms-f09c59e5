import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bell, CheckCheck, Info, Inbox, MessageSquare, Paperclip, Plus, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadMessageAttachment,
  validateAttachment,
  MAX_FILES_PER_MESSAGE,
} from "@/lib/messageAttachments";
import { AttachmentChips } from "@/components/messaging/AttachmentChips";

import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientInbox, type UnifiedInboxItem } from "@/hooks/useClientInbox";
import {
  useClientCommunications,
  type ConversationThread,
} from "@/hooks/useClientCommunications";
import {
  useClientNotifications,
  type ClientNotification,
} from "@/hooks/useClientNotifications";
import { useNotificationPrefs, type CategoryPrefs } from "@/hooks/useNotificationPrefs";

import { NewConversationDialog } from "@/components/client/NewConversationDialog";
import { InboxErrorBoundary } from "@/components/client/inbox/InboxErrorBoundary";
import {
  AllFeed,
  ConversationRow,
  EmptyState,
  FilterPills,
  InboxHeader,
  InboxTabCards,
  MessageBubbles,
  NotificationFeed,
  SearchBox,
  ThreadHeader,
} from "@/components/client/inbox/InboxParts";
import {
  THREAD_LABEL,
  inboxStats,
  matchesSearch,
  notificationKind,
  threadKind,
  type NotificationKind,
  type ThreadKind,
} from "@/components/client/inbox/inboxFormat";

type TabValue = "all" | "messages" | "notifications";
type ThreadFilter = "all" | "unread" | ThreadKind;
type FeedFilter = "all" | "unread" | "messages" | "notifications";
type NotifFilter = "all" | "unread" | NotificationKind;

const VALID_TABS: TabValue[] = ["all", "messages", "notifications"];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid file";
}

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
  const { totalUnread, conversations } = useClientCommunications();
  const { unreadCount, notifications } = useClientNotifications();
  const { isReadOnly } = useClientTenant();
  const stats = useMemo(() => inboxStats(conversations, notifications), [conversations, notifications]);
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  const setTab = (next: TabValue) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    params.delete("type");
    setSearchParams(params, { replace: true });
  };

  const startMessage = () => {
    if (activeTab !== "messages") setTab("messages");
    setNewDialogOpen(true);
  };

  return (
    <div className="w-full min-w-0 space-y-4">
      <InboxHeader
        unreadMessages={totalUnread}
        unreadNotifications={unreadCount}
        action={
          !isReadOnly ? (
            <Button onClick={startMessage} className="keep-light gap-1.5 bg-white font-semibold text-[#44235F] hover:bg-white/90">
              <Plus className="h-4 w-4" aria-hidden />
              New message
            </Button>
          ) : undefined
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => setTab(v as TabValue)}>
        <InboxTabCards stats={stats} />

        <InboxErrorBoundary resetKey={`${activeTab}:${searchParams.get("thread") ?? ""}`}>
          <TabsContent value="all" className="mt-4">
            <AllTab />
          </TabsContent>
          <TabsContent value="messages" className="mt-4">
            <MessagesTab newDialogOpen={newDialogOpen} onNewDialogOpenChange={setNewDialogOpen} />
          </TabsContent>
          <TabsContent value="notifications" className="mt-4">
            <NotificationsTab />
          </TabsContent>
        </InboxErrorBoundary>
      </Tabs>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ALL tab: messages and notifications together                               */
/* -------------------------------------------------------------------------- */

function AllTab() {
  const { items, isLoading, unreadCount } = useClientInbox();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FeedFilter>("all");

  const shown = useMemo(
    () =>
      items.filter((i) => {
        if (filter === "unread") return !i.is_read;
        if (filter === "messages") return i.item_type === "message";
        if (filter === "notifications") return i.item_type === "notification";
        return true;
      }),
    [items, filter],
  );

  const handleOpen = (item: UnifiedInboxItem) => {
    if (item.item_type === "message") {
      navigate(`/client/inbox?tab=messages&thread=${item.id}`);
    } else {
      navigate(`/client/inbox?tab=notifications`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <FilterPills<FeedFilter>
        label="Filter the inbox"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Everything" },
          { value: "unread", label: "Unread", count: unreadCount },
          { value: "messages", label: "Messages" },
          { value: "notifications", label: "Notifications" },
        ]}
      />
      {shown.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={Inbox} title={filter === "unread" ? "Nothing unread" : "You are all caught up"} hint="New messages and notifications will appear here." />
        </div>
      ) : (
        <AllFeed items={shown} onOpen={handleOpen} />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  MESSAGES tab: conversation list beside the open conversation               */
/* -------------------------------------------------------------------------- */

function MessagesTab({ newDialogOpen, onNewDialogOpenChange }: { newDialogOpen: boolean; onNewDialogOpenChange: (open: boolean) => void }) {
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
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const [search, setSearch] = useState("");
  const [composerText, setComposerText] = useState("");
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync ?thread= URL param into selection. Only when the param itself changes: closing a conversation clears the
  // selection first and the URL a moment later, and that gap must not re-open it.
  useEffect(() => {
    if (threadParam) setSelectedId(threadParam);
  }, [threadParam]);

  // Auto mark-as-read whenever a conversation becomes selected (click or deep link)
  const mutateMarkRead = markRead.mutate;
  useEffect(() => {
    if (!selectedId || !conversations.length) return;
    const conv = conversations.find((c) => c.id === selectedId);
    if (conv?.isUnread) {
      mutateMarkRead(selectedId);
    }
  }, [selectedId, conversations, mutateMarkRead]);

  const filtered = conversations.filter((c) => {
    if (filter === "unread" && !c.isUnread) return false;
    if (filter !== "all" && filter !== "unread" && threadKind(c.type) !== filter) return false;
    return matchesSearch(c, search);
  });
  const kindsPresent = Array.from(new Set(conversations.map((c) => threadKind(c.type))));
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
      } catch (err: unknown) {
        toast.error(errorMessage(err));
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
    if (result?.messageId && activeTenantId != null && filesToUpload.length > 0) {
      for (const f of filesToUpload) {
        try {
          await uploadMessageAttachment(supabase, f, activeTenantId, selectedId, result.messageId);
        } catch (err: unknown) {
          toast.warning(`Attachment "${f.name}" failed to upload: ${errorMessage(err)}`);
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
        } catch (err: unknown) {
          toast.error(errorMessage(err));
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


  const handleBack = () => {
    setSelectedId(null);
    const params = new URLSearchParams(searchParams);
    params.delete("thread");
    params.delete("conversation");
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid h-[72vh] min-h-[30rem] grid-cols-1 gap-4 xl:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
          {/* Conversation list. On narrow screens it is replaced by the open conversation. */}
          <section aria-label="Conversations" className={`min-h-0 flex-col overflow-hidden rounded-xl border bg-card ${selected ? "hidden xl:flex" : "flex"}`}>
            <div className="space-y-2 border-b p-3">
              <SearchBox value={search} onChange={setSearch} placeholder="Search messages" />
              <FilterPills<ThreadFilter>
                label="Filter conversations"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "unread", label: "Unread", count: totalUnread },
                  ...kindsPresent.map((k) => ({ value: k as ThreadFilter, label: THREAD_LABEL[k] })),
                ]}
              />
            </div>
            {filtered.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title={conversations.length === 0 ? "No conversations yet" : "No conversations match"}
                hint={conversations.length === 0 ? "Start one with New message and your consultant will reply here." : "Try a different search or filter."}
              />
            ) : (
              <div className="min-h-0 flex-1 divide-y overflow-y-auto">
                {filtered.map((conv) => (
                  <ConversationRow key={conv.id} conv={conv} selected={selectedId === conv.id} onSelect={handleSelect} />
                ))}
              </div>
            )}
          </section>

          {/* Open conversation and composer */}
          <section aria-label="Conversation" className={`min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-card ${selected ? "flex" : "hidden xl:flex"}`}>
            {selected ? (
              <>
                <ThreadHeader conv={selected} onBack={handleBack} />
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {messagesLoading ? (
                    <div className="space-y-2 p-4">
                      {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-14 w-3/4 rounded-2xl" />
                      ))}
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">No messages in this conversation yet.</p>
                  ) : (
                    <MessageBubbles messages={messages} currentUserId={currentUserId} />
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {!isReadOnly && (
                  <div className="border-t p-3">
                    <AttachmentChips files={queuedFiles} onRemove={removeQueued} />
                    <div className="flex items-end gap-2">
                      <Textarea
                        ref={composerRef}
                        value={composerText}
                        onChange={(e) => setComposerText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder="Type a message. Enter sends, Shift+Enter adds a line."
                        aria-label="Message"
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
                        aria-label="Send message"
                        disabled={(!composerText.trim() && queuedFiles.length === 0) || sendMessage.isPending}
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                    {composerText.length === 0 && queuedFiles.length === 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">Tip: paste a screenshot straight into the message box.</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <EmptyState icon={MessageSquare} title="Select a conversation" hint="Pick one from the list to read it and reply." />
            )}
          </section>
        </div>
      )}

      <NewConversationDialog
        open={newDialogOpen}
        onOpenChange={onNewDialogOpenChange}
        onSubmit={handleNewConversation}
        isSubmitting={createConversation.isPending}
        tenantId={activeTenantId ?? null}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  NOTIFICATIONS tab: feed by day with filters                                */
/* -------------------------------------------------------------------------- */

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
    } catch { /* malformed link; fall through to the default below */ }
  }
  return n.link || '/client/inbox?tab=notifications';
}

const NOTIFICATION_PILL: Record<NotificationKind, string> = {
  tasks: "Tasks",
  meetings: "Meetings",
  obligations: "Obligations",
  events: "Events",
  other: "Updates",
};

function NotificationsTab() {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } =
    useClientNotifications();
  const { categories: prefs } = useNotificationPrefs();
  const [filter, setFilter] = useState<NotifFilter>("all");
  const navigate = useNavigate();

  const hasHiddenCategories = Object.values(prefs).some((v) => !v);

  const visible = useMemo(
    () =>
      notifications.filter((n) => {
        const cat = TYPE_TO_CATEGORY[n.type || ""];
        return !(cat && !prefs[cat]);
      }),
    [notifications, prefs],
  );

  const kindsPresent = useMemo(() => Array.from(new Set(visible.map((n) => notificationKind(n.type)))), [visible]);

  const filtered = useMemo(() => {
    if (filter === "all") return visible;
    if (filter === "unread") return visible.filter((n) => !n.is_read);
    return visible.filter((n) => notificationKind(n.type) === filter);
  }, [visible, filter]);

  const handleClick = (n: ClientNotification) => {
    if (!n.is_read) markAsRead(n.id);
    navigate(resolveNotificationLink(n));
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterPills<NotifFilter>
          label="Filter notifications"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread", count: unreadCount },
            ...kindsPresent.map((k) => ({ value: k as NotifFilter, label: NOTIFICATION_PILL[k] })),
          ]}
        />
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllAsRead()}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark all as read
          </Button>
        )}
      </div>

      {hasHiddenCategories && (
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          Some notification types are hidden based on your preferences.
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={Bell} title={filter === "unread" ? "Nothing unread" : "No notifications to show"} hint="Reminders about tasks, meetings and obligations will appear here." />
        </div>
      ) : (
        <NotificationFeed items={filtered} onOpen={handleClick} />
      )}
    </div>
  );
}

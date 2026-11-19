import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bell, CheckCheck, Info, Inbox, MessageSquare, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  uploadMessageAttachment,
  validateAttachment,
  MAX_FILES_PER_MESSAGE,
} from "@/lib/messageAttachments";
import { MessageAttachments } from "@/components/messaging/MessageAttachments";
import { Messenger, type MessengerMessage } from "@/components/messenger";
import { pendingMessage, toMessengerMessage, toMessengerThread } from "@/components/messenger/adapters/tenantConversations";
import { useConversationParticipants } from "@/hooks/useConversationParticipants";

import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientInbox, type UnifiedInboxItem } from "@/hooks/useClientInbox";
import { useClientCommunications } from "@/hooks/useClientCommunications";
import {
  useClientNotifications,
  type ClientNotification,
} from "@/hooks/useClientNotifications";
import { useNotificationPrefs, type CategoryPrefs } from "@/hooks/useNotificationPrefs";

import { NewConversationDialog } from "@/components/client/NewConversationDialog";
import { InboxErrorBoundary } from "@/components/client/inbox/InboxErrorBoundary";
import {
  AllFeed,
  EmptyState,
  FilterPills,
  InboxHeader,
  InboxTabCards,
  NotificationFeed,
} from "@/components/client/inbox/InboxParts";
import {
  inboxStats,
  notificationKind,
  type NotificationKind,
} from "@/components/client/inbox/inboxFormat";

type TabValue = "all" | "messages" | "notifications";
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
/*  MESSAGES tab: the shared messenger, fed by this organisation's conversations */
/* -------------------------------------------------------------------------- */

const ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx";

function validateFile(file: File): string | null {
  try {
    validateAttachment(file);
    return null;
  } catch (err: unknown) {
    return errorMessage(err);
  }
}

function MessagesTab({ newDialogOpen, onNewDialogOpenChange }: { newDialogOpen: boolean; onNewDialogOpenChange: (open: boolean) => void }) {
  const {
    conversations,
    isLoading,
    useConversationMessages,
    sendMessage,
    createConversation,
    markRead,
    currentUserId,
  } = useClientCommunications();

  const { isReadOnly, activeTenantId } = useClientTenant();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadParam = searchParams.get("thread") ?? searchParams.get("conversation");
  const [selectedId, setSelectedId] = useState<string | null>(threadParam);
  // Messages being sent, drawn straight away as "Sending…" until the saved copy arrives.
  const [pending, setPending] = useState<MessengerMessage[]>([]);
  const counter = useRef(0);

  // Sync ?thread= URL param into selection. Only when the param itself changes: closing a conversation clears the
  // selection first and the URL a moment later, and that gap must not re-open it.
  useEffect(() => {
    if (threadParam) setSelectedId(threadParam);
  }, [threadParam]);

  const threads = useMemo(() => conversations.map(toMessengerThread), [conversations]);
  const selectedThread = threads.find((t) => t.id === selectedId) ?? null;
  const openId = selectedThread ? selectedThread.id : null;

  const { data: rawMessages = [], isLoading: messagesLoading } = useConversationMessages(openId);
  const { data: people } = useConversationParticipants(openId);

  const messages = useMemo(() => {
    const saved = rawMessages.map((m) => toMessengerMessage(m, currentUserId));
    const mine = pending.filter((p) => p.id.startsWith(`pending-${openId}-`));
    return [...saved, ...mine];
  }, [rawMessages, pending, currentUserId, openId]);

  const attachmentsById = useMemo(() => new Map(rawMessages.map((m) => [m.id, m.attachments ?? []])), [rawMessages]);

  const handleSelect = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      const params = new URLSearchParams(searchParams);
      if (id) {
        params.set("tab", "messages");
        params.set("thread", id);
      } else {
        params.delete("thread");
        params.delete("conversation");
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleSend = useCallback(
    async ({ body, files }: { body: string; files: File[] }) => {
      if (!openId || !currentUserId) return;
      const pendingId = `pending-${openId}-${(counter.current += 1)}`;
      setPending((prev) => [...prev, pendingMessage(pendingId, body, currentUserId, files)]);
      try {
        const result = await sendMessage.mutateAsync({ conversationId: openId, body });
        if (result?.messageId && activeTenantId != null && files.length > 0) {
          for (const f of files) {
            try {
              await uploadMessageAttachment(supabase, f, activeTenantId, openId, result.messageId);
            } catch (err: unknown) {
              toast.warning(`Attachment "${f.name}" failed to upload: ${errorMessage(err)}`);
            }
          }
        }
        // Show the saved message (and its attachments) before the "Sending…" copy goes, so nothing flickers.
        await qc.refetchQueries({ queryKey: ["conversation-messages", openId] });
      } finally {
        setPending((prev) => prev.filter((p) => p.id !== pendingId));
      }
    },
    [openId, currentUserId, sendMessage, activeTenantId, qc],
  );

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
    <div className="space-y-3">
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="h-[72vh] min-h-[30rem]">
          <Messenger
            className="h-full"
            threads={threads}
            selectedId={openId}
            onSelect={handleSelect}
            emptyThreads={
              <EmptyState
                icon={MessageSquare}
                title="No conversations yet"
                hint="Start one with New message and your consultant will reply here."
              />
            }
            conversation={{
              messages,
              people,
              isLoading: messagesLoading,
              draftScope: "client-inbox",
              capabilities: { canSend: !isReadOnly },
              onSend: handleSend,
              onMarkRead: () => {
                if (openId) markRead.mutate(openId);
              },
              validateFile,
              accept: ATTACHMENT_ACCEPT,
              maxFiles: MAX_FILES_PER_MESSAGE,
              renderAttachments: (m) => {
                const list = attachmentsById.get(m.id);
                return list && list.length > 0 ? <MessageAttachments attachments={list} /> : null;
              },
              empty: <p className="py-10 text-center text-sm text-muted-foreground">No messages in this conversation yet.</p>,
            }}
          />
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

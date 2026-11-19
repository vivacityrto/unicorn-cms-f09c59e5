import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bell, CheckCheck, Info, Inbox, MessageSquare, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Messenger, NEW_MESSAGE_THREAD_ID, useMessengerDock } from "@/components/messenger";
import { toMessengerThread } from "@/components/messenger/adapters/tenantConversations";
import { useClientConversationPane } from "@/hooks/useClientConversationPane";

import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useClientInbox, type UnifiedInboxItem } from "@/hooks/useClientInbox";
import { useClientCommunications } from "@/hooks/useClientCommunications";
import {
  useClientNotifications,
  type ClientNotification,
} from "@/hooks/useClientNotifications";
import { useNotificationPrefs, type CategoryPrefs } from "@/hooks/useNotificationPrefs";

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
  const { openDock } = useMessengerDock();

  const setTab = (next: TabValue) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    params.delete("type");
    setSearchParams(params, { replace: true });
  };

  const startMessage = () => {
    // Writing a new message happens in the bubble, the same place as everywhere else.
    openDock(NEW_MESSAGE_THREAD_ID);
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
            <MessagesTab />
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

function MessagesTab() {
  const { conversations, isLoading } = useClientCommunications();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadParam = searchParams.get("thread") ?? searchParams.get("conversation");
  const [selectedId, setSelectedId] = useState<string | null>(threadParam);

  // Sync ?thread= URL param into selection. Only when the param itself changes: closing a conversation clears the
  // selection first and the URL a moment later, and that gap must not re-open it.
  useEffect(() => {
    if (threadParam) setSelectedId(threadParam);
  }, [threadParam]);

  const threads = useMemo(() => conversations.map(toMessengerThread), [conversations]);
  const selectedThread = threads.find((t) => t.id === selectedId) ?? null;
  const openId = selectedThread ? selectedThread.id : null;
  // Messages, who has read them, sending, attachments and marking read are shared with the messenger bubble.
  const pane = useClientConversationPane(openId);

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
            conversation={pane}
          />
        </div>
      )}
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

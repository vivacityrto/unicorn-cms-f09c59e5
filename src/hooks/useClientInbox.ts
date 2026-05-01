import { useMemo } from "react";
import { useClientCommunications } from "./useClientCommunications";
import { useClientNotifications } from "./useClientNotifications";

/**
 * Unified shape for the client Inbox "All" tab.
 * Built client-side by merging conversations + notifications.
 * No server RPC is involved (a server-side aggregator is logged
 * as a post-launch enhancement).
 */
export interface UnifiedInboxItem {
  item_type: "message" | "notification";
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  is_read: boolean;
}

export function useClientInbox() {
  const comms = useClientCommunications();
  const notif = useClientNotifications();

  const items: UnifiedInboxItem[] = useMemo(() => {
    const messageItems: UnifiedInboxItem[] = (comms.conversations || []).map((c) => ({
      item_type: "message",
      id: c.id,
      title: c.subject || c.topic || "General",
      body: c.last_message_preview ?? null,
      link: `/client/inbox?tab=messages&thread=${c.id}`,
      created_at: c.last_message_at ?? c.created_at,
      is_read: !c.isUnread,
    }));

    const notificationItems: UnifiedInboxItem[] = (notif.notifications || []).map((n) => ({
      item_type: "notification",
      id: n.id,
      title: n.title,
      body: n.message ?? null,
      link: n.link ?? "/client/inbox?tab=notifications",
      created_at: n.created_at,
      is_read: n.is_read,
    }));

    return [...messageItems, ...notificationItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [comms.conversations, notif.notifications]);

  const unreadCount = items.filter((i) => !i.is_read).length;

  return {
    items,
    isLoading: comms.isLoading || notif.isLoading,
    unreadCount,
  };
}

import { useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/hooks/useNotifications';
import type { Notification } from '@/hooks/useNotifications';
import { NotePreviewDialog } from '@/components/notifications/NotePreviewDialog';
import { NotificationPreferenceMatrix } from '@/components/notifications/NotificationPreferenceMatrix';
import { NotificationsDrawer } from '@/components/notifications/NotificationsDrawer';
import type { DrawerItem } from '@/components/notifications/drawerModel';
import { useNavigate } from 'react-router-dom';

const NOTE_TYPES = new Set(['note_shared', 'note_added']);

/** The staff bell. It opens the notifications drawer on the right (the name is kept so the top bars need no change). */
export const NotificationDropdown = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, loading } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [previewNotif, setPreviewNotif] = useState<Notification | null>(null);

  const items = useMemo<DrawerItem[]>(
    () => notifications.map((n) => ({ id: n.id, type: n.type, title: n.title, message: n.message, isRead: n.is_read, createdAt: n.created_at, tenantName: n.tenant_name })),
    [notifications],
  );

  const handleOpenItem = (id: string) => {
    const notification = notifications.find((n) => n.id === id);
    if (!notification) return;
    if (!notification.is_read && notification.type !== 'message') markAsRead(notification.id);

    if (NOTE_TYPES.has(notification.type)) {
      setPreviewNotif(notification);
    } else if (notification.type === 'message') {
      const convId = notification.source_id
        ?? new URLSearchParams(notification.link?.split('?')[1] ?? '').get('conversation');
      navigate(convId ? `/communications?thread=${convId}` : '/communications');
    } else if (notification.type === 'support_ticket') {
      // Legacy Client Messages notifications: source_id is a help thread id that is now also the ticket id.
      navigate(notification.source_id ? `/support-tickets/${notification.source_id}` : '/support-tickets');
    } else if (notification.link) {
      // ticket_submitted, ticket_reply, ticket_assigned and ticket_resolved carry their own link.
      navigate(notification.link);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="relative h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      <NotificationsDrawer
        open={open}
        onOpenChange={setOpen}
        items={items}
        loading={loading}
        onOpenItem={handleOpenItem}
        onMarkRead={markAsRead}
        onMarkAllRead={markAllAsRead}
        onViewAll={() => navigate('/inbox')}
        preferences={<NotificationPreferenceMatrix compact />}
        onAllSettings={() => {
          setOpen(false);
          navigate('/settings/notifications');
        }}
      />

      <NotePreviewDialog
        open={!!previewNotif}
        onOpenChange={(o) => { if (!o) setPreviewNotif(null); }}
        notification={previewNotif}
      />
    </>
  );
};

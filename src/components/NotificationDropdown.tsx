import { useState } from 'react';
import { Bell, EyeOff, Eye, MailOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useNotifications } from '@/hooks/useNotifications';
import type { Notification } from '@/hooks/useNotifications';
import { NotePreviewDialog } from '@/components/notifications/NotePreviewDialog';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

/** Strip HTML tags from a string for clean display */
function stripHtml(text: string): string {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').trim();
}

/** Format type keys for display: note_shared → Note shared */
function formatType(type: string): string {
  return type.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}

const NOTE_TYPES = new Set(['note_shared', 'note_added']);

export const NotificationDropdown = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, loading } = useNotifications();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [previewNotif, setPreviewNotif] = useState<Notification | null>(null);
  const [hideRead, setHideRead] = useState(false);

  // Count by type
  const typeCounts: Record<string, number> = {};
  notifications.forEach(n => {
    typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
  });

  let filteredNotifications = activeFilter
    ? notifications.filter(n => n.type === activeFilter)
    : notifications;

  if (hideRead) {
    filteredNotifications = filteredNotifications.filter(n => !n.is_read);
  }

  const handleNotifClick = (notification: Notification) => {
    if (!notification.is_read) markAsRead(notification.id);

    if (NOTE_TYPES.has(notification.type)) {
      setPreviewNotif(notification);
    } else if (notification.link) {
      navigate(notification.link);
    }
  };

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative bg-white transition-all duration-200 hover:bg-white hover:scale-105 hover:shadow-md"
            style={{ boxShadow: 'rgba(0, 0, 0, 0.02) 0px 1px 3px 0px, rgba(27, 31, 35, 0.15) 0px 0px 0px 1px' }}
          >
            <Bell className="w-5 h-5 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-destructive rounded-full flex items-center justify-center text-destructive-foreground text-xs font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[480px] p-0" align="end">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold text-base">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    markAllAsRead();
                  }}
                  className="text-xs h-7"
                >
                  Mark all read
                </Button>
              )}
              <Button
                variant="link"
                size="sm"
                className="text-xs h-7 px-1"
                onClick={() => navigate('/inbox')}
              >
                Show All
              </Button>
            </div>
          </div>

          {/* Unread toggle */}
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <Switch id="hide-read-dropdown" checked={hideRead} onCheckedChange={setHideRead} className="scale-75" />
              <Label htmlFor="hide-read-dropdown" className="text-xs cursor-pointer">
                {hideRead ? <><EyeOff className="h-3 w-3 inline mr-1" />Unread only</> : <><Eye className="h-3 w-3 inline mr-1" />Show all</>}
              </Label>
            </div>
            {unreadCount > 0 && (
              <span className="text-xs text-muted-foreground">{unreadCount} unread</span>
            )}
          </div>

          {/* Type filter badges */}
          {Object.keys(typeCounts).length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b bg-muted/30">
              {Object.entries(typeCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <Badge
                    key={type}
                    variant={activeFilter === type ? 'default' : 'outline'}
                    className="cursor-pointer text-xs select-none"
                    onClick={() => setActiveFilter(activeFilter === type ? null : type)}
                  >
                    {formatType(type)}: {count}
                  </Badge>
                ))}
              {activeFilter && (
                <Badge
                  variant="secondary"
                  className="cursor-pointer text-xs select-none"
                  onClick={() => setActiveFilter(null)}
                >
                  Clear
                </Badge>
              )}
            </div>
          )}

          {/* Notification list */}
          <ScrollArea className="h-[520px]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4">
                <Bell className="h-12 w-12 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground text-center">
                  {activeFilter ? 'No notifications of this type' : 'No notifications yet'}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-3 px-4 hover:bg-accent/50 transition-colors cursor-pointer ${
                      !notification.is_read ? 'bg-accent/20' : ''
                    }`}
                    onClick={() => handleNotifClick(notification)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-0.5 min-w-0">
                        {notification.tenant_name && (
                          <p className="text-xs font-medium text-primary truncate">
                            {notification.tenant_name}
                          </p>
                        )}
                        <p className="text-sm font-medium leading-tight">
                          {notification.title || formatType(notification.type)}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {stripHtml(notification.message)}
                        </p>
                        <p className="text-xs text-muted-foreground/70">
                          {format(new Date(notification.created_at), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!notification.is_read && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notification.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                            title="Mark as read"
                          >
                            <MailOpen className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                        {!notification.is_read && (
                          <span className="mt-0.5 h-2.5 w-2.5 rounded-full bg-destructive flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      <NotePreviewDialog
        open={!!previewNotif}
        onOpenChange={(open) => { if (!open) setPreviewNotif(null); }}
        notification={previewNotif}
      />
    </>
  );
};

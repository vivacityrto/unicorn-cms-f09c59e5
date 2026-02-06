import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell, CheckCircle, XCircle, Clock, MinusCircle, Loader2 } from 'lucide-react';
import { useRecentNotifications, EVENT_TYPE_LABELS } from '@/hooks/useTeamsNotifications';
import { formatDistanceToNow } from 'date-fns';

const STATUS_CONFIG = {
  queued: {
    icon: Clock,
    label: 'Queued',
    variant: 'secondary' as const,
  },
  sent: {
    icon: CheckCircle,
    label: 'Sent',
    variant: 'default' as const,
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    variant: 'destructive' as const,
  },
  skipped: {
    icon: MinusCircle,
    label: 'Skipped',
    variant: 'outline' as const,
  },
};

export function RecentNotificationsCard() {
  const { data: notifications, isLoading } = useRecentNotifications(10);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">Recent Notifications</CardTitle>
            <CardDescription>
              Your latest notification activity
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!notifications || notifications.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No notifications yet</p>
          </div>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-3">
              {notifications.map((notification) => {
                const statusConfig = STATUS_CONFIG[notification.status];
                const StatusIcon = statusConfig.icon;
                const eventLabel = EVENT_TYPE_LABELS[notification.event_type]?.label || notification.event_type;
                const payload = notification.payload as Record<string, unknown>;
                
                return (
                  <div 
                    key={notification.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                  >
                    <StatusIcon className={`h-4 w-4 mt-0.5 ${
                      notification.status === 'sent' ? 'text-green-500' :
                      notification.status === 'failed' ? 'text-destructive' :
                      'text-muted-foreground'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">
                          {eventLabel}
                        </span>
                        <Badge variant={statusConfig.variant} className="text-xs">
                          {statusConfig.label}
                        </Badge>
                      </div>
                      {payload.title && (
                        <p className="text-xs text-muted-foreground truncate">
                          {String(payload.title)}
                        </p>
                      )}
                      {payload.client_name && (
                        <p className="text-xs text-muted-foreground truncate">
                          {String(payload.client_name)}
                        </p>
                      )}
                      {notification.last_error && notification.status === 'failed' && (
                        <p className="text-xs text-destructive mt-1 truncate">
                          {notification.last_error}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

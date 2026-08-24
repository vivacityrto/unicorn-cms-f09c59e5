import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";

function stripHtml(text: string) {
  return (text || "").replace(/<[^>]*>/g, "").trim();
}

export function StaffLiveNotificationBanner() {
  const { notifications, loading, markAsRead } = useNotifications();
  const navigate = useNavigate();
  const knownIds = useRef<Set<string> | null>(null);
  const [notification, setNotification] = useState<Notification | null>(null);

  useEffect(() => {
    if (loading) return;
    const currentIds = new Set(notifications.map((item) => item.id));
    if (!knownIds.current) {
      knownIds.current = currentIds;
      return;
    }
    const newest = notifications.find((item) => !knownIds.current?.has(item.id) && !item.is_read);
    knownIds.current = currentIds;
    if (newest) setNotification(newest);
  }, [loading, notifications]);

  if (!notification) return null;

  const viewNotification = () => {
    markAsRead(notification.id);
    setNotification(null);
    navigate(notification.link || "/inbox");
  };

  return (
    <div className="mx-4 mb-3 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/[0.07] px-4 py-3 shadow-sm md:mx-6" role="status">
      <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary"><Bell className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">New staff notification</p><p className="truncate text-sm text-muted-foreground">{notification.title || stripHtml(notification.message) || "You have a new update."}</p></div>
      <Button variant="outline" size="sm" onClick={viewNotification} className="shrink-0">View</Button>
      <Button variant="ghost" size="icon" onClick={() => setNotification(null)} aria-label="Dismiss notification" className="-mr-2 -mt-1 shrink-0"><X className="h-4 w-4" /></Button>
    </div>
  );
}

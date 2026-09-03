import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronRight, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useClientNotifications, type ClientNotification } from "@/hooks/useClientNotifications";
import { useClientTenant } from "@/contexts/ClientTenantContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function stripHtml(text: string | null) {
  return (text || "").replace(/<[^>]*>/g, "").trim();
}

function visitKey(userId: string | null, tenantId: number | null) {
  return `client-portal-last-visit:${userId || "anonymous"}:${tenantId || "none"}`;
}

export function ClientNotificationReview({ isPreview }: { isPreview: boolean }) {
  const { profile } = useAuth();
  const { activeTenantId } = useClientTenant();
  const { notifications, isLoading, markAsRead } = useClientNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [queue, setQueue] = useState<ClientNotification[]>([]);
  const reviewStarted = useRef(false);

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.is_read),
    [notifications],
  );

  useEffect(() => {
    if (reviewStarted.current || isPreview || isLoading || !activeTenantId || !profile?.user_uuid) return;
    reviewStarted.current = true;

    const key = visitKey(profile.user_uuid, activeTenantId);
    localStorage.setItem(key, String(Date.now()));

    // Unread state is persisted in Supabase, so this also covers returning to
    // the app after a long absence, even when the auth session was retained.
    // Snapshot the queue at open time — unreadNotifications re-derives live
    // from the query and shrinks as markAsRead invalidates it, which would
    // shift indices under an in-progress review.
    if (unreadNotifications.length > 0) {
      setQueue(unreadNotifications);
      setCurrentIndex(0);
      setOpen(true);
    }
  }, [activeTenantId, isLoading, isPreview, profile?.user_uuid, unreadNotifications]);

  const notification = queue[currentIndex];

  const continueReview = () => {
    if (!notification) return;
    markAsRead(notification.id);
    if (currentIndex >= queue.length - 1) {
      setOpen(false);
      return;
    }
    setCurrentIndex((index) => index + 1);
  };

  const openNotification = () => {
    if (!notification) return;
    markAsRead(notification.id);
    setOpen(false);
    if (notification.link) navigate(notification.link);
  };

  if (!notification) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        size="lg"
        className="gap-0 overflow-hidden border-primary/15 p-0"
      >
        <div className="bg-primary/[0.06] px-6 pb-5 pt-7 sm:px-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <Bell className="h-4 w-4" />
              Portal update
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {currentIndex + 1} of {queue.length}
            </span>
          </div>
          <div className="flex gap-1.5" aria-hidden="true">
            {queue.map((item, index) => (
              <span key={item.id} className={cn("h-1.5 flex-1 rounded-full bg-primary/15", index <= currentIndex && "bg-primary")} />
            ))}
          </div>
        </div>

        <div className="px-6 py-7 sm:px-8 sm:py-8">
          <DialogHeader className="text-left">
            <DialogTitle className="pr-8 text-2xl leading-tight text-foreground">
              {notification.title || "You have a new notification"}
            </DialogTitle>
            <DialogDescription className="pt-2 text-left text-sm text-muted-foreground">
              {format(new Date(notification.created_at), "d MMMM yyyy, h:mm a")}
            </DialogDescription>
          </DialogHeader>
          <p className="mt-6 whitespace-pre-wrap text-[15px] leading-7 text-foreground">
            {stripHtml(notification.message) || "There is a new update available in your portal."}
          </p>
        </div>

        <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:px-8">
          {notification.link && (
            <Button variant="ghost" onClick={openNotification} className="gap-2 sm:mr-auto">
              <ExternalLink className="h-4 w-4" />
              Open details
            </Button>
          )}
          <Button onClick={continueReview} className="gap-2">
            {currentIndex === queue.length - 1 ? "Done" : "Continue"}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

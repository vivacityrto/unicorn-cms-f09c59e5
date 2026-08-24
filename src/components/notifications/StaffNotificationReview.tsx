import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronRight, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function stripHtml(text: string) {
  return (text || "").replace(/<[^>]*>/g, "").trim();
}

export function StaffNotificationReview() {
  const { user } = useAuth();
  const { notifications, loading, markAsRead } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const reviewStarted = useRef(false);

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.is_read),
    [notifications],
  );

  useEffect(() => {
    if (reviewStarted.current || loading || !user?.id) return;
    reviewStarted.current = true;
    localStorage.setItem(`staff-portal-last-visit:${user.id}`, String(Date.now()));
    if (unreadNotifications.length > 0) {
      setCurrentIndex(0);
      setOpen(true);
    }
  }, [loading, unreadNotifications.length, user?.id]);

  const notification = unreadNotifications[currentIndex];

  const continueReview = () => {
    if (!notification) return;
    markAsRead(notification.id);
    if (currentIndex >= unreadNotifications.length - 1) {
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
    <Dialog open={open} onOpenChange={(nextOpen) => nextOpen && setOpen(true)}>
      <DialogContent
        size="lg"
        className="gap-0 overflow-hidden border-primary/15 p-0"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <div className="bg-primary/[0.06] px-6 pb-5 pt-7 sm:px-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <Bell className="h-4 w-4" />
              Staff update
            </div>
            <span className="text-xs font-medium text-muted-foreground">{currentIndex + 1} of {unreadNotifications.length}</span>
          </div>
          <div className="flex gap-1.5" aria-hidden="true">
            {unreadNotifications.map((item, index) => (
              <span key={item.id} className={cn("h-1.5 flex-1 rounded-full bg-primary/15", index <= currentIndex && "bg-primary")} />
            ))}
          </div>
        </div>
        <div className="px-6 py-7 sm:px-8 sm:py-8">
          <DialogHeader className="text-left">
            <DialogTitle className="pr-8 text-2xl leading-tight text-foreground">{notification.title || "You have a new notification"}</DialogTitle>
            <DialogDescription className="pt-2 text-left text-sm text-muted-foreground">{notification.tenant_name ? `${notification.tenant_name} · ` : ""}{format(new Date(notification.created_at), "d MMMM yyyy, h:mm a")}</DialogDescription>
          </DialogHeader>
          <p className="mt-6 whitespace-pre-wrap text-[15px] leading-7 text-foreground">{stripHtml(notification.message) || "There is a new update available."}</p>
        </div>
        <DialogFooter className="border-t bg-muted/20 px-6 py-4 sm:px-8">
          {notification.link && <Button variant="ghost" onClick={openNotification} className="gap-2 sm:mr-auto"><ExternalLink className="h-4 w-4" />Open details</Button>}
          <Button onClick={continueReview} className="gap-2">{currentIndex === unreadNotifications.length - 1 ? "Done" : "Continue"}<ChevronRight className="h-4 w-4" /></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

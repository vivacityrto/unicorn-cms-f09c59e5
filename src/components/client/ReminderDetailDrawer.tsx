import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, CheckSquare, Bell, ExternalLink, MapPin, Video } from "lucide-react";
import { format } from "date-fns";
import type { ClientReminder } from "@/hooks/useClientReminders";

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Calendar; className: string }> = {
  task: { label: "Task", icon: CheckSquare, className: "bg-blue-500/10 text-blue-700 border-blue-200" },
  meeting: { label: "Meeting", icon: Video, className: "bg-purple-500/10 text-purple-700 border-purple-200" },
  reminder: { label: "Reminder", icon: Bell, className: "bg-amber-500/10 text-amber-700 border-amber-200" },
};

interface Props {
  reminder: ClientReminder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReminderDetailDrawer({ reminder, open, onOpenChange }: Props) {
  if (!reminder) return null;

  const config = TYPE_CONFIG[reminder.item_type] || TYPE_CONFIG.reminder;
  const Icon = config.icon;
  const meta = reminder.meta || {};

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-left">
            <Icon className="h-5 w-5 flex-shrink-0" />
            {reminder.title}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Type badge */}
          <div>
            <Badge variant="outline" className={config.className}>
              {config.label}
            </Badge>
            {meta.role === "attendee" && (
              <Badge variant="outline" className="ml-2">Attendee</Badge>
            )}
          </div>

          {/* Date/time */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Date & Time</p>
            <p className="text-sm">
              {format(new Date(reminder.starts_at), "EEEE, d MMMM yyyy 'at' h:mm a")}
            </p>
            {reminder.ends_at && (
              <p className="text-sm text-muted-foreground">
                Until {format(new Date(reminder.ends_at), "h:mm a")}
              </p>
            )}
          </div>

          {/* Meeting-specific fields */}
          {reminder.item_type === "meeting" && (
            <>
              {meta.location && (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> Location
                  </p>
                  <p className="text-sm">{meta.location}</p>
                </div>
              )}
              {meta.meeting_url && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => window.open(meta.meeting_url, "_blank")}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Join Meeting
                </Button>
              )}
            </>
          )}

          {/* Task-specific fields */}
          {reminder.item_type === "task" && (
            <div className="space-y-2">
              {meta.status && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Status</span>
                  <Badge variant="secondary">{meta.status}</Badge>
                </div>
              )}
              {meta.completed !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Completed</span>
                  <span className="text-sm">{meta.completed ? "Yes" : "No"}</span>
                </div>
              )}
            </div>
          )}

          {/* Reminder-specific fields */}
          {reminder.item_type === "reminder" && meta.description && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Description</p>
              <p className="text-sm whitespace-pre-wrap">{meta.description}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

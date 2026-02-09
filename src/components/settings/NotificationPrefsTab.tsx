import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useNotificationPrefs, type CategoryPrefs } from "@/hooks/useNotificationPrefs";

const CATEGORIES: { key: keyof CategoryPrefs; label: string; description: string }[] = [
  { key: "tasks", label: "Task reminders", description: "Receive reminders for upcoming and overdue tasks" },
  { key: "meetings", label: "Meeting reminders", description: "Receive reminders before meetings start" },
  { key: "obligations", label: "Obligation reminders", description: "Receive reminders for compliance obligations" },
  { key: "events", label: "Event notifications", description: "Receive notifications for calendar events" },
];

export function NotificationPrefsTab() {
  const { categories, isLoading, updateCategory, isUpdating } = useNotificationPrefs();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>Controls in-app reminders and alerts. Changes save automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {CATEGORIES.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor={`pref-${key}`} className="text-sm font-medium">
                {label}
              </Label>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <Switch
              id={`pref-${key}`}
              checked={categories[key]}
              onCheckedChange={(checked) => updateCategory(key, checked)}
              disabled={isUpdating}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

import { Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { OutlookIntegration } from '@/components/profile/OutlookIntegration';

export function CalendarTab() {
  return (
    <div className="space-y-6 max-w-3xl">
      {/* Microsoft Outlook Integration */}
      <OutlookIntegration />

      {/* Privacy Notice */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h3 className="font-semibold mb-1">Your calendar connection is private</h3>
              <p className="text-sm text-muted-foreground">
                Only you can see and manage this connection. Your calendar data is never shared with other users or administrators.
                Calendar events are only used to create time entry drafts for your personal time tracking.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-3">How it works</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary font-medium">1.</span>
              <span>Connect your Microsoft Outlook calendar using your work or personal account.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-medium">2.</span>
              <span>Your calendar events will be synced automatically to create time entry drafts.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary font-medium">3.</span>
              <span>Review and post drafts from your Time Inbox to track billable hours.</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

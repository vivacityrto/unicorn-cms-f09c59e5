import { Link } from 'react-router-dom';
import { ArrowLeft, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { OutlookIntegration } from '@/components/profile/OutlookIntegration';
import { useAuth } from '@/hooks/useAuth';

/**
 * Calendar Integration page for managing calendar connections.
 * This is a dedicated page under Profile Settings for connecting
 * and managing external calendar providers like Microsoft Outlook.
 */
export default function CalendarIntegration() {
  const { profile } = useAuth();

  return (
    <div className="min-h-screen bg-background animate-fade-in">
      {/* Header Card */}
      <div className="px-6 pt-6">
        <Card className="border-0 shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-white/20" style={{
            backgroundImage: 'linear-gradient(135deg, rgb(98 33 145) 0%, rgb(213 28 73 / 72%) 100%)'
          }}>
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                asChild
                className="text-white hover:bg-white/20"
              >
                <Link to="/settings">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div className="flex items-center gap-3 flex-1">
                <Calendar className="h-8 w-8 text-white" />
                <div>
                  <h1 className="text-xl font-semibold text-white">
                    Calendar Integration
                  </h1>
                  <p className="text-sm text-white/70">
                    Connect your calendar to capture time from meetings
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="px-6 py-6 max-w-3xl space-y-6">
        {/* Microsoft Outlook Integration */}
        <OutlookIntegration />

        {/* Info Card */}
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-2">How it works</h3>
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
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                <strong>Privacy:</strong> Your calendar connection is personal and private. 
                Only you can see your calendar events and sync status.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Link to Time Capture Settings */}
        <Card className="border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Time Capture Settings</h3>
                <p className="text-sm text-muted-foreground">
                  Configure how calendar meetings are converted to time drafts
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link to="/settings">Configure</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, Clock, Mail, Smartphone } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function NotificationSettings() {
  return (
    <DashboardLayout>
      <NotificationSettingsContent />
    </DashboardLayout>
  );
}

function NotificationSettingsContent() {
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [inappEnabled, setInappEnabled] = useState(true);
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('07:00');
  const [timezone, setTimezone] = useState('Australia/Sydney');

  const handleSave = () => {
    // This will be implemented with the notification preferences RPC
    toast({ title: 'Notification preferences updated' });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification Settings"
        description="Manage how you receive notifications and reminders"
        icon={Bell}
      />

      <div className="grid gap-6 max-w-2xl">
        {/* Channels */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Notification Channels
            </CardTitle>
            <CardDescription>
              Choose how you want to receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-notifications" className="text-base">
                  Email Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receive notifications via email
                </p>
              </div>
              <Switch
                id="email-notifications"
                checked={emailEnabled}
                onCheckedChange={setEmailEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="inapp-notifications" className="text-base">
                  In-App Notifications
                </Label>
                <p className="text-sm text-muted-foreground">
                  Show notifications in the application
                </p>
              </div>
              <Switch
                id="inapp-notifications"
                checked={inappEnabled}
                onCheckedChange={setInappEnabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="digest-notifications" className="text-base">
                  Daily Digest
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get a daily summary instead of individual notifications
                </p>
              </div>
              <Switch
                id="digest-notifications"
                checked={digestEnabled}
                onCheckedChange={setDigestEnabled}
              />
            </div>
          </CardContent>
        </Card>

        {/* Quiet Hours */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Quiet Hours
            </CardTitle>
            <CardDescription>
              Set times when you don't want to receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quiet-start">Start Time</Label>
                <Input
                  id="quiet-start"
                  type="time"
                  value={quietStart}
                  onChange={(e) => setQuietStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiet-end">End Time</Label>
                <Input
                  id="quiet-end"
                  type="time"
                  value={quietEnd}
                  onChange={(e) => setQuietEnd(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Australia/Sydney">Sydney (AEDT)</SelectItem>
                  <SelectItem value="Australia/Melbourne">Melbourne (AEDT)</SelectItem>
                  <SelectItem value="Australia/Brisbane">Brisbane (AEST)</SelectItem>
                  <SelectItem value="Australia/Perth">Perth (AWST)</SelectItem>
                  <SelectItem value="Australia/Adelaide">Adelaide (ACDT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Event Types */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Notification Events
            </CardTitle>
            <CardDescription>
              Types of notifications you'll receive
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Meeting</Badge>
                <span>24h before meeting & 10min reminder</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Rock</Badge>
                <span>Weekly check if rock is off-track</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">To-Do</Badge>
                <span>Day after due date if incomplete</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Metric</Badge>
                <span>1 day before meeting if not entered</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Issue</Badge>
                <span>When assigned an issue</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button 
          onClick={handleSave} 
          className="w-full"
        >
          Save Preferences
        </Button>
      </div>
    </div>
  );
}

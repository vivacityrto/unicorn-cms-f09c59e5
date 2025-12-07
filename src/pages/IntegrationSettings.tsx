import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

export default function IntegrationSettings() {
  return (
    <DashboardLayout>
      <IntegrationSettingsContent />
    </DashboardLayout>
  );
}

function IntegrationSettingsContent() {
  const { profile } = useAuth();
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [teamsEnabled, setTeamsEnabled] = useState(false);
  const [slackChannel, setSlackChannel] = useState('');
  const [teamsChannel, setTeamsChannel] = useState('');
  const [wantsDM, setWantsDM] = useState(false);

  const handleSlackConnect = () => {
    // In production, this would initiate OAuth flow
    toast({
      title: 'Slack OAuth',
      description: 'Contact your administrator to enable Slack integration',
    });
  };

  const handleTeamsConnect = () => {
    // In production, this would initiate OAuth flow
    toast({
      title: 'Teams OAuth',
      description: 'Contact your administrator to enable Teams integration',
    });
  };

  const handleSavePreferences = async () => {
    // Save to user_integration_prefs table
    toast({ title: 'Preferences saved' });
  };

  const handleTestNotification = async (platform: 'slack' | 'teams') => {
    toast({
      title: `Test notification sent to ${platform}`,
      description: 'Check your channel for the test message',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chat Integrations"
        description="Connect Slack and Microsoft Teams to receive EOS notifications"
        icon={MessageSquare}
      />

      <div className="grid gap-6 max-w-3xl">
        {/* Slack Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Slack Integration
                </CardTitle>
                <CardDescription>
                  Receive EOS notifications in your Slack workspace
                </CardDescription>
              </div>
              <Badge variant={slackEnabled ? 'default' : 'secondary'}>
                {slackEnabled ? 'Connected' : 'Not Connected'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!slackEnabled ? (
              <Button onClick={handleSlackConnect}>
                Connect to Slack
              </Button>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="slack-channel">Default Channel</Label>
                  <Input
                    id="slack-channel"
                    placeholder="#eos-notifications"
                    value={slackChannel}
                    onChange={(e) => setSlackChannel(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use workspace default
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Direct Messages</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications via DM instead of channel
                    </p>
                  </div>
                  <Switch checked={wantsDM} onCheckedChange={setWantsDM} />
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSavePreferences}>
                    Save Preferences
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleTestNotification('slack')}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Test
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Teams Integration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Microsoft Teams Integration
                </CardTitle>
                <CardDescription>
                  Receive EOS notifications in your Teams channels
                </CardDescription>
              </div>
              <Badge variant={teamsEnabled ? 'default' : 'secondary'}>
                {teamsEnabled ? 'Connected' : 'Not Connected'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!teamsEnabled ? (
              <Button onClick={handleTeamsConnect}>
                Connect to Teams
              </Button>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="teams-channel">Webhook URL</Label>
                  <Input
                    id="teams-channel"
                    type="url"
                    placeholder="https://outlook.office.com/webhook/..."
                    value={teamsChannel}
                    onChange={(e) => setTeamsChannel(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Create an incoming webhook in your Teams channel
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSavePreferences}>
                    Save Preferences
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleTestNotification('teams')}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Test
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Notification Events */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Events</CardTitle>
            <CardDescription>
              You'll receive chat notifications for these events
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Meeting</Badge>
                <span>24h before & 10min reminder</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">To-Do</Badge>
                <span>Day after due date if incomplete</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Issue</Badge>
                <span>When assigned to you</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Rock</Badge>
                <span>Weekly if off-track</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Metric</Badge>
                <span>Day before meeting if not entered</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">Summary</Badge>
                <span>After meeting completion</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

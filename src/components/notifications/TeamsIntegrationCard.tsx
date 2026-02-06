import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Link2, Unlink, ExternalLink, Loader2 } from 'lucide-react';
import { 
  useTeamsIntegration, 
  useConnectTeams, 
  useDisconnectTeams 
} from '@/hooks/useTeamsNotifications';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function TeamsIntegrationCard() {
  const { data: integration, isLoading } = useTeamsIntegration();
  const connectTeams = useConnectTeams();
  const disconnectTeams = useDisconnectTeams();
  
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const isConnected = integration?.status === 'connected';

  const handleConnect = async () => {
    if (!webhookUrl.trim()) return;
    
    await connectTeams.mutateAsync(webhookUrl);
    setWebhookUrl('');
    setIsDialogOpen(false);
  };

  const handleDisconnect = async () => {
    await disconnectTeams.mutateAsync();
  };

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Microsoft Teams</CardTitle>
              <CardDescription>
                Receive notifications in Teams
              </CardDescription>
            </div>
          </div>
          <Badge variant={isConnected ? 'default' : 'secondary'}>
            {isConnected ? 'Connected' : 'Not Connected'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isConnected ? (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Notifications will be sent to your configured Teams channel via webhook.
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnectTeams.isPending}
              >
                {disconnectTeams.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Unlink className="h-4 w-4 mr-2" />
                )}
                Disconnect
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Link2 className="h-4 w-4 mr-2" />
                    Update Webhook
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update Teams Webhook</DialogTitle>
                    <DialogDescription>
                      Enter a new webhook URL for your Teams channel.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="webhook-url">Webhook URL</Label>
                      <Input
                        id="webhook-url"
                        placeholder="https://outlook.office.com/webhook/..."
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleConnect}
                      disabled={!webhookUrl.trim() || connectTeams.isPending}
                    >
                      {connectTeams.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      Update
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Connect Teams to receive Unicorn notifications in your channel.
            </div>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Link2 className="h-4 w-4 mr-2" />
                  Connect Teams
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Connect Microsoft Teams</DialogTitle>
                  <DialogDescription>
                    Set up a webhook to receive Unicorn notifications in Teams.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="text-sm space-y-2">
                    <p className="font-medium">How to get a webhook URL:</p>
                    <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                      <li>Open your Teams channel</li>
                      <li>Click the three dots (...) next to the channel name</li>
                      <li>Select "Connectors" or "Workflows"</li>
                      <li>Find "Incoming Webhook" and configure it</li>
                      <li>Copy the webhook URL</li>
                    </ol>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="new-webhook-url">Webhook URL</Label>
                    <Input
                      id="new-webhook-url"
                      placeholder="https://outlook.office.com/webhook/..."
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                    />
                  </div>
                  
                  <a
                    href="https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Learn more about Teams webhooks
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleConnect}
                    disabled={!webhookUrl.trim() || connectTeams.isPending}
                  >
                    {connectTeams.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Connect
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

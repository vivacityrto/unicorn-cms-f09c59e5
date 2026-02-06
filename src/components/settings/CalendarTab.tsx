import { useState } from 'react';
import { Calendar, Share2, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { OutlookIntegration } from '@/components/profile/OutlookIntegration';
import { useCalendarShares } from '@/hooks/useCalendarShares';
import { useAuth } from '@/hooks/useAuth';

export function CalendarTab() {
  const { profile } = useAuth();
  
  // Check if user is Vivacity Team member
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || ''
  );
  const {
    myShares,
    availableTeamMembers,
    isLoadingShares,
    isLoadingTeam,
    createShare,
    revokeShare,
    isCreatingShare,
    isRevokingShare,
  } = useCalendarShares();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedScope, setSelectedScope] = useState<'busy_only' | 'details'>('busy_only');

  const handleAddShare = () => {
    if (selectedUserId) {
      createShare({ viewerUserId: selectedUserId, scope: selectedScope });
      setShowAddDialog(false);
      setSelectedUserId('');
      setSelectedScope('busy_only');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Microsoft Outlook Integration */}
      <OutlookIntegration />

      {/* Calendar Sharing - Only for Vivacity Team */}
      {isVivacityTeam && (
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Share2 className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg">Calendar Sharing</CardTitle>
                  <CardDescription>
                    Share your calendar with Vivacity team members
                  </CardDescription>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => setShowAddDialog(true)}
                disabled={availableTeamMembers.length === 0}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Share
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingShares ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : myShares.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Share2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>You haven't shared your calendar with anyone yet.</p>
                <p className="text-sm mt-1">
                  Add a share to let team members view your calendar.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {myShares.map((share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {share.viewer_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{share.viewer_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Shared {new Date(share.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={share.scope === 'details' ? 'default' : 'secondary'}>
                        {share.scope === 'details' ? 'Full Details' : 'Busy Only'}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => revokeShare(share.id)}
                        disabled={isRevokingShare}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

      {/* Add Share Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share your calendar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Team member</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a team member" />
                </SelectTrigger>
                <SelectContent>
                  {availableTeamMembers.map((member) => (
                    <SelectItem key={member.user_uuid} value={member.user_uuid}>
                      {member.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Access level</Label>
              <Select value={selectedScope} onValueChange={(v) => setSelectedScope(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="busy_only">
                    <div>
                      <p className="font-medium">Busy Only</p>
                      <p className="text-xs text-muted-foreground">Shows time slots as busy without event details</p>
                    </div>
                  </SelectItem>
                  <SelectItem value="details">
                    <div>
                      <p className="font-medium">Full Details</p>
                      <p className="text-xs text-muted-foreground">Shows event titles, locations, and attendees</p>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddShare} disabled={!selectedUserId || isCreatingShare}>
              Share Calendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

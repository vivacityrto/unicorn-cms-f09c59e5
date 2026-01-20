import { useState } from 'react';
import { format } from 'date-fns';
import { History, Eye, RotateCcw, FileText, Lock, Unlock, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useMeetingMinutes } from '@/hooks/useMeetingMinutes';
import { useRBAC } from '@/hooks/useRBAC';
import type { EosMeetingMinutesVersion, MinutesStatus } from '@/types/eos';

interface MinutesHistoryPanelProps {
  meetingId: string;
  minutesStatus?: MinutesStatus;
  onViewVersion?: (version: EosMeetingMinutesVersion) => void;
}

export function MinutesHistoryPanel({ 
  meetingId, 
  minutesStatus = 'Draft',
  onViewVersion 
}: MinutesHistoryPanelProps) {
  const { versions, isLoading, restoreVersion, lockMinutes, unlockMinutes } = useMeetingMinutes(meetingId);
  const { isSuperAdmin, canAccessAdmin } = useRBAC();
  const [restoreDialog, setRestoreDialog] = useState<{ open: boolean; version?: EosMeetingMinutesVersion }>({ open: false });
  const [lockDialog, setLockDialog] = useState<{ open: boolean; action: 'lock' | 'unlock' }>({ open: false, action: 'lock' });
  const [reason, setReason] = useState('');

  const handleRestore = async () => {
    if (!restoreDialog.version || !reason.trim()) return;
    
    await restoreVersion.mutateAsync({
      versionId: restoreDialog.version.id,
      reason: reason.trim(),
    });
    
    setRestoreDialog({ open: false });
    setReason('');
  };

  const handleLockToggle = async () => {
    if (lockDialog.action === 'lock') {
      await lockMinutes.mutateAsync(reason || undefined);
    } else {
      if (!reason.trim()) return;
      await unlockMinutes.mutateAsync(reason.trim());
    }
    
    setLockDialog({ open: false, action: 'lock' });
    setReason('');
  };

  const getStatusBadge = (version: EosMeetingMinutesVersion) => {
    if (version.is_locked) {
      return <Badge variant="destructive" className="gap-1"><Lock className="h-3 w-3" /> Locked</Badge>;
    }
    if (version.is_final) {
      return <Badge className="gap-1 bg-primary text-primary-foreground"><CheckCircle className="h-3 w-3" /> Final</Badge>;
    }
    return <Badge variant="secondary">Draft</Badge>;
  };

  return (
    <>
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <History className="h-4 w-4" />
            Version History
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Minutes Version History
            </SheetTitle>
            <SheetDescription>
              View and manage previous versions of meeting minutes.
            </SheetDescription>
          </SheetHeader>

          {/* Lock/Unlock Actions for SuperAdmin */}
          {isSuperAdmin && (
            <div className="mt-4 flex gap-2">
              {minutesStatus === 'Locked' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLockDialog({ open: true, action: 'unlock' });
                    setReason('');
                  }}
                  className="gap-2"
                >
                  <Unlock className="h-4 w-4" />
                  Unlock Minutes
                </Button>
              ) : minutesStatus === 'Final' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLockDialog({ open: true, action: 'lock' });
                    setReason('');
                  }}
                  className="gap-2"
                >
                  <Lock className="h-4 w-4" />
                  Lock Minutes
                </Button>
              ) : null}
            </div>
          )}

          <ScrollArea className="h-[calc(100vh-200px)] mt-4 pr-4">
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading versions...</div>
            ) : versions.length === 0 ? (
              <div className="text-sm text-muted-foreground">No versions yet. Save the minutes to create the first version.</div>
            ) : (
              <div className="space-y-3">
                {versions.map((version, index) => (
                  <div
                    key={version.id}
                    className="border rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Version {version.version_number}</span>
                        {index === 0 && <Badge variant="outline" className="text-xs">Current</Badge>}
                        {getStatusBadge(version)}
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      {format(new Date(version.created_at), 'MMM d, yyyy h:mm a')}
                    </div>

                    {version.change_summary && (
                      <p className="text-sm">{version.change_summary}</p>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewVersion?.(version)}
                        className="gap-1 h-7 px-2"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </Button>

                      {index > 0 && (canAccessAdmin() || isSuperAdmin) && minutesStatus !== 'Locked' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRestoreDialog({ open: true, version });
                            setReason('');
                          }}
                          className="gap-1 h-7 px-2"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restore
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const json = JSON.stringify(version.minutes_snapshot, null, 2);
                          const blob = new Blob([json], { type: 'application/json' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `minutes-v${version.version_number}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="gap-1 h-7 px-2"
                      >
                        <FileText className="h-3 w-3" />
                        Export
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Restore Dialog */}
      <Dialog open={restoreDialog.open} onOpenChange={(open) => setRestoreDialog({ open, version: restoreDialog.version })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Version {restoreDialog.version?.version_number}</DialogTitle>
            <DialogDescription>
              This will create a new version with the content from version {restoreDialog.version?.version_number}. 
              The current version will be preserved in history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="restore-reason">Reason for restoration *</Label>
            <Textarea
              id="restore-reason"
              placeholder="e.g., Reverting incorrect changes from previous update"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialog({ open: false })}>
              Cancel
            </Button>
            <Button 
              onClick={handleRestore} 
              disabled={!reason.trim() || restoreVersion.isPending}
            >
              {restoreVersion.isPending ? 'Restoring...' : 'Restore Version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock/Unlock Dialog */}
      <Dialog open={lockDialog.open} onOpenChange={(open) => setLockDialog({ open, action: lockDialog.action })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {lockDialog.action === 'lock' ? 'Lock Minutes' : 'Unlock Minutes'}
            </DialogTitle>
            <DialogDescription>
              {lockDialog.action === 'lock' 
                ? 'Locked minutes cannot be edited. Only SuperAdmins can unlock them.'
                : 'Unlocking will allow the minutes to be edited again.'
              }
            </DialogDescription>
          </DialogHeader>

          {lockDialog.action === 'unlock' && (
            <div className="space-y-2">
              <Label htmlFor="lock-reason">Reason for unlocking *</Label>
              <Textarea
                id="lock-reason"
                placeholder="e.g., Need to add missing action item"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLockDialog({ open: false, action: 'lock' })}>
              Cancel
            </Button>
            <Button 
              onClick={handleLockToggle}
              disabled={(lockDialog.action === 'unlock' && !reason.trim()) || lockMinutes.isPending || unlockMinutes.isPending}
              variant={lockDialog.action === 'lock' ? 'destructive' : 'default'}
            >
              {lockDialog.action === 'lock' 
                ? (lockMinutes.isPending ? 'Locking...' : 'Lock Minutes')
                : (unlockMinutes.isPending ? 'Unlocking...' : 'Unlock Minutes')
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

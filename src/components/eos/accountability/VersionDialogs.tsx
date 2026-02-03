import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow, format } from 'date-fns';
import { History, RotateCcw, Eye } from 'lucide-react';
import type { ChartVersion } from '@/types/accountabilityChart';

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: ChartVersion[];
  onViewVersion: (version: ChartVersion) => void;
  onRestoreVersion: (version: ChartVersion) => void;
}

export function VersionHistoryDialog({
  open,
  onOpenChange,
  versions,
  onViewVersion,
  onRestoreVersion,
}: VersionHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Version History
          </DialogTitle>
          <DialogDescription>
            View and restore previous versions of your Accountability Chart.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[400px] pr-4">
          {versions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No versions saved yet.
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((version, index) => (
                <div
                  key={version.id}
                  className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          Version {version.version_number}
                        </span>
                        {index === 0 && (
                          <Badge variant="secondary">Current</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {version.change_summary}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        {format(new Date(version.created_at), 'MMM d, yyyy h:mm a')} ·{' '}
                        {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onViewVersion(version)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      {index !== 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onRestoreVersion(version)}
                        >
                          <RotateCcw className="h-4 w-4 mr-1" />
                          Restore
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SaveVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (changeSummary: string) => void;
  isPending: boolean;
}

export function SaveVersionDialog({
  open,
  onOpenChange,
  onSave,
  isPending,
}: SaveVersionDialogProps) {
  const [changeSummary, setChangeSummary] = useState('');

  const handleSave = () => {
    if (changeSummary.trim()) {
      onSave(changeSummary.trim());
      setChangeSummary('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Version</DialogTitle>
          <DialogDescription>
            Create a snapshot of the current Accountability Chart. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Label htmlFor="summary">Change Summary *</Label>
          <Textarea
            id="summary"
            placeholder="Describe what changed in this version..."
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            className="mt-2"
            rows={3}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Be specific about what changed to help with future audits.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!changeSummary.trim() || isPending}
          >
            {isPending ? 'Saving...' : 'Save Version'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

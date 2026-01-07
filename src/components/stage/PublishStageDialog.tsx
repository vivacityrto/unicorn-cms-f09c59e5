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
import { Badge } from '@/components/ui/badge';
import { Loader2, Rocket, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useStageQualityCheck } from '@/hooks/useStageQualityCheck';

interface PublishStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageId: number;
  stageName: string;
  isCertified: boolean;
  currentVersion: number | null;
  onPublish: (notes: string) => void;
  isPublishing: boolean;
}

export function PublishStageDialog({
  open,
  onOpenChange,
  stageId,
  stageName,
  isCertified,
  currentVersion,
  onPublish,
  isPublishing,
}: PublishStageDialogProps) {
  const [notes, setNotes] = useState('');
  const { result: qualityResult, isLoading: isCheckingQuality } = useStageQualityCheck({
    stageId,
    enabled: open,
  });

  const nextVersion = (currentVersion || 0) + 1;
  const hasBlockingIssues = qualityResult?.checks.some(c => c.status === 'fail');

  const handlePublish = () => {
    onPublish(notes);
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Publish Stage Version
          </DialogTitle>
          <DialogDescription>
            Create version {nextVersion} of "{stageName}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Version Info */}
          <div className="flex items-center gap-2">
            <Badge variant="outline">v{nextVersion}</Badge>
            {isCertified && (
              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                Certified Release
              </Badge>
            )}
          </div>

          {/* Quality Check Summary */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm font-medium">Quality Check</div>
            {isCheckingQuality ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking quality...
              </div>
            ) : qualityResult ? (
              <div className="space-y-1">
                {qualityResult.checks.map((check, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    {check.status === 'pass' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : check.status === 'fail' ? (
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    <span className={check.status === 'pass' ? 'text-muted-foreground' : ''}>
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Release Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Release Notes</Label>
            <Textarea
              id="notes"
              placeholder="Describe what changed in this version..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {hasBlockingIssues && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              Fix blocking issues before publishing.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePublish}
            disabled={isPublishing || hasBlockingIssues || isCheckingQuality}
          >
            {isPublishing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <Rocket className="mr-2 h-4 w-4" />
                Publish v{nextVersion}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

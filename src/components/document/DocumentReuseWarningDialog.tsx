import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Copy, Edit2 } from 'lucide-react';

interface DocumentReuseWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentTitle: string;
  stageCount: number;
  stageNames: string[];
  onEditAnyway: () => void;
  onDuplicate: () => void;
}

export function DocumentReuseWarningDialog({
  open,
  onOpenChange,
  documentTitle,
  stageCount,
  stageNames,
  onEditAnyway,
  onDuplicate
}: DocumentReuseWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Document Used in Multiple Stages
          </DialogTitle>
          <DialogDescription>
            This document is linked to {stageCount} stage{stageCount !== 1 ? 's' : ''}. 
            Changes will affect all linked stages.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm font-medium mb-2">{documentTitle}</p>
          <div className="flex flex-wrap gap-1">
            {stageNames.slice(0, 5).map((name, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {name}
              </Badge>
            ))}
            {stageNames.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{stageNames.length - 5} more
              </Badge>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button 
            variant="outline" 
            onClick={onDuplicate}
            className="w-full sm:w-auto"
          >
            <Copy className="h-4 w-4 mr-2" />
            Duplicate & Relink
          </Button>
          <Button 
            variant="default"
            onClick={onEditAnyway}
            className="w-full sm:w-auto"
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Edit Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

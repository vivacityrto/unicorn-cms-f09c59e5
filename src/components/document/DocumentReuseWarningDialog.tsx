import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Edit2 } from 'lucide-react';
import {
  AppModal,
  AppModalContent,
  AppModalHeader,
  AppModalTitle,
  AppModalDescription,
  AppModalBody,
  AppModalFooter,
} from '@/components/ui/app-modal';

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
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="sm">
        <AppModalHeader>
          <AppModalTitle className="text-amber-600">
            Document Used in Multiple Stages
          </AppModalTitle>
          <AppModalDescription>
            This document is linked to {stageCount} stage{stageCount !== 1 ? 's' : ''}. 
            Changes will affect all linked stages.
          </AppModalDescription>
        </AppModalHeader>

        <AppModalBody>
          <p className="text-sm font-medium">{documentTitle}</p>
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
        </AppModalBody>

        <AppModalFooter className="flex-col sm:flex-row gap-2">
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
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

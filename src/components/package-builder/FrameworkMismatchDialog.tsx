import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { StageFrameworkBadges } from '@/components/stage/StageFrameworkSelector';

interface FrameworkMismatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageName: string;
  stageFrameworks: string[] | null;
  packageFramework: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function FrameworkMismatchDialog({
  open,
  onOpenChange,
  stageName,
  stageFrameworks,
  packageFramework,
  onConfirm,
  onCancel
}: FrameworkMismatchDialogProps) {
  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  // Map package_type to display name
  const packageFrameworkDisplay = (() => {
    const map: Record<string, string> = {
      'rto': 'RTO',
      'cricos': 'CRICOS',
      'gto': 'GTO',
      'membership': 'Membership',
      'project': 'RTO',
      'regulatory_submission': 'RTO'
    };
    return map[packageFramework.toLowerCase()] || packageFramework.toUpperCase();
  })();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Framework Mismatch
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p>
                This phase is not marked for the selected package framework.
              </p>
              
              <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Phase:</span>
                  <span className="text-sm">{stageName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Phase Frameworks:</span>
                  <StageFrameworkBadges frameworks={stageFrameworks} size="sm" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Package Framework:</span>
                  <Badge variant="outline" className="text-xs">
                    {packageFrameworkDisplay}
                  </Badge>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Adding this phase may cause compliance issues. Do you want to proceed anyway?
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            Add Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

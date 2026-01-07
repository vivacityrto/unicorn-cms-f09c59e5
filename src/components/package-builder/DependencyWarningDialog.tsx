import { AlertTriangle, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface MissingDependency {
  stage_key: string;
  title: string;
  is_certified: boolean;
  version_label: string | null;
}

interface DependencyWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageName: string;
  missingDependencies: MissingDependency[];
  onProceed: () => void;
  onCancel: () => void;
}

export function DependencyWarningDialog({
  open,
  onOpenChange,
  stageName,
  missingDependencies,
  onProceed,
  onCancel
}: DependencyWarningDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Missing Stage Dependencies
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                <strong>{stageName}</strong> depends on other stages that are not yet in this package:
              </p>
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                {missingDependencies.map((dep) => (
                  <div key={dep.stage_key} className="flex items-center gap-2 text-sm">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium">{dep.title}</span>
                    {dep.version_label && (
                      <span className="text-muted-foreground">({dep.version_label})</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-sm">
                You can still add this stage, but consider adding the required stages to ensure a complete package structure.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onProceed}>
            Add Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

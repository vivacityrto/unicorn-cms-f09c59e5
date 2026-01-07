import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, XCircle, FileCheck, AlertTriangle } from 'lucide-react';
import { StandardReference } from '@/hooks/useStageStandards';

interface PackageStandardsCoverageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  framework: string;
  totalStandards: number;
  coveredCount: number;
  coveredStandards: StandardReference[];
  uncoveredStandards: StandardReference[];
}

export function PackageStandardsCoverageDialog({
  open,
  onOpenChange,
  framework,
  totalStandards,
  coveredCount,
  coveredStandards,
  uncoveredStandards
}: PackageStandardsCoverageDialogProps) {
  const coveragePercent = totalStandards > 0 ? Math.round((coveredCount / totalStandards) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Standards Coverage
          </DialogTitle>
          <DialogDescription>
            Review which {framework} standards are covered by stages in this package.
          </DialogDescription>
        </DialogHeader>

        {/* Coverage Summary */}
        <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
          <div className="flex items-center justify-between">
            <span className="font-medium">{framework} Standards</span>
            <Badge variant={coveragePercent >= 80 ? 'default' : coveragePercent >= 50 ? 'secondary' : 'outline'}>
              {coveredCount} / {totalStandards} covered
            </Badge>
          </div>
          <Progress value={coveragePercent} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {coveragePercent}% of {framework} standards are mapped to stages in this package.
          </p>
        </div>

        {totalStandards === 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm text-amber-800">
              No standards defined for the {framework} framework yet.
            </p>
          </div>
        )}

        <ScrollArea className="max-h-[400px]">
          <div className="space-y-4">
            {/* Covered Standards */}
            {coveredStandards.length > 0 && (
              <div>
                <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Covered Standards ({coveredStandards.length})
                </h4>
                <div className="space-y-1">
                  {coveredStandards.map(s => (
                    <div key={s.code} className="flex items-start gap-2 p-2 rounded bg-emerald-500/5 border border-emerald-500/20">
                      <Badge variant="outline" className="text-xs shrink-0 bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
                        {s.code}
                      </Badge>
                      <span className="text-sm">{s.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {coveredStandards.length > 0 && uncoveredStandards.length > 0 && (
              <Separator />
            )}

            {/* Uncovered Standards */}
            {uncoveredStandards.length > 0 && (
              <div>
                <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                  Potential Gaps ({uncoveredStandards.length})
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  These standards are not explicitly mapped to any stage in this package.
                </p>
                <div className="space-y-1">
                  {uncoveredStandards.map(s => (
                    <div key={s.code} className="flex items-start gap-2 p-2 rounded bg-muted/50 border">
                      <Badge variant="outline" className="text-xs shrink-0">
                        {s.code}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{s.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {coveredStandards.length === 0 && uncoveredStandards.length === 0 && totalStandards > 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No standards coverage data available.
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

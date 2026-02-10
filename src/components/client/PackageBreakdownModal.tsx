import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Package2 } from 'lucide-react';
import { useClientPackagesQuery, usePackageUsageDataQuery, formatHours } from '@/hooks/usePackageUsageQuery';

interface PackageBreakdownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: number;
}

function PackageUsageRow({ tenantId, pkg }: { tenantId: number; pkg: { id: number; package_name: string; included_minutes: number } }) {
  const { data: usage } = usePackageUsageDataQuery(tenantId, pkg.id);

  const usedPercent = usage?.used_percent || 0;
  const isOver = usedPercent >= 100;
  const isNear = usedPercent >= 80;

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{pkg.package_name}</span>
        <Badge variant={isOver ? 'destructive' : isNear ? 'secondary' : 'outline'} className="text-xs">
          {usedPercent.toFixed(0)}%
        </Badge>
      </div>
      <Progress
        value={Math.min(usedPercent, 100)}
        className={`h-2 ${isOver ? '[&>div]:bg-destructive' : isNear ? '[&>div]:bg-yellow-500' : ''}`}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Used: {formatHours(usage?.used_minutes || 0)}</span>
        <span>Included: {formatHours(pkg.included_minutes)}</span>
        <span>Remaining: {formatHours(usage?.remaining_minutes || 0)}</span>
      </div>
    </div>
  );
}

export function PackageBreakdownModal({ open, onOpenChange, tenantId }: PackageBreakdownModalProps) {
  const { data: packages = [] } = useClientPackagesQuery(tenantId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package2 className="h-5 w-5" />
            Package Breakdown
          </DialogTitle>
          <DialogDescription>
            Time usage per active package
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {packages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No active packages</p>
          ) : (
            packages.map(pkg => (
              <PackageUsageRow key={pkg.id} tenantId={tenantId} pkg={pkg} />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

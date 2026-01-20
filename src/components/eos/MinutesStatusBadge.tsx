import { Badge } from '@/components/ui/badge';
import { Lock, CheckCircle, FileEdit } from 'lucide-react';
import type { MinutesStatus } from '@/types/eos';

interface MinutesStatusBadgeProps {
  status: MinutesStatus;
  className?: string;
}

export function MinutesStatusBadge({ status, className }: MinutesStatusBadgeProps) {
  switch (status) {
    case 'Locked':
      return (
        <Badge variant="destructive" className={`gap-1 ${className}`}>
          <Lock className="h-3 w-3" />
          Locked
        </Badge>
      );
    case 'Final':
      return (
        <Badge className={`gap-1 bg-green-600 hover:bg-green-700 ${className}`}>
          <CheckCircle className="h-3 w-3" />
          Final
        </Badge>
      );
    case 'Draft':
    default:
      return (
        <Badge variant="secondary" className={`gap-1 ${className}`}>
          <FileEdit className="h-3 w-3" />
          Draft
        </Badge>
      );
  }
}

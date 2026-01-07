import { Badge } from '@/components/ui/badge';
import { CheckCircle2, FileEdit, Archive } from 'lucide-react';

interface DocumentVersionBadgeProps {
  status: 'draft' | 'published' | 'archived';
  versionNumber?: number;
  showVersion?: boolean;
  size?: 'sm' | 'default';
}

export function DocumentVersionBadge({ 
  status, 
  versionNumber, 
  showVersion = true,
  size = 'default' 
}: DocumentVersionBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'published':
        return {
          label: 'Published',
          icon: CheckCircle2,
          className: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
        };
      case 'archived':
        return {
          label: 'Archived',
          icon: Archive,
          className: 'bg-muted text-muted-foreground border-border'
        };
      default:
        return {
          label: 'Draft',
          icon: FileEdit,
          className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;
  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0' : '';

  return (
    <Badge variant="outline" className={`${config.className} ${sizeClasses} gap-1`}>
      <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
      {config.label}
      {showVersion && versionNumber && (
        <span className="font-mono">v{versionNumber}</span>
      )}
    </Badge>
  );
}

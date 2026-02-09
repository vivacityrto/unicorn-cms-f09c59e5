import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
}

/**
 * PageHeader - Responsive page header with title, description, and actions
 * 
 * Typography scale:
 * - Title: text-xl md:text-2xl
 * - Description: text-sm md:text-base
 */
export function PageHeader({ title, description, icon: Icon, actions, breadcrumbs, className }: PageHeaderProps) {
  return (
    <div className={cn("space-y-3 md:space-y-4", className)}>
      {breadcrumbs && (
        <div className="text-sm text-muted-foreground">
          {breadcrumbs}
        </div>
      )}
      
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1 min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight md:text-2xl flex items-center gap-2 md:gap-3 flex-wrap">
            {Icon && <Icon className="h-6 w-6 md:h-8 md:w-8 text-primary flex-shrink-0" />}
            <span className="break-words">{title}</span>
          </h1>
          {description && (
            <p className="text-sm text-muted-foreground md:text-base max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

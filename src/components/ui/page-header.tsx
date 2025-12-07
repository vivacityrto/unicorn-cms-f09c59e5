import { ReactNode } from 'react';
import { Button } from './button';
import { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
}

export function PageHeader({ title, description, icon: Icon, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <div className="space-y-4">
      {breadcrumbs && (
        <div className="text-sm text-muted-foreground">
          {breadcrumbs}
        </div>
      )}
      
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            {Icon && <Icon className="h-8 w-8 text-primary" />}
            {title}
          </h1>
          {description && (
            <p className="text-muted-foreground max-w-2xl">
              {description}
            </p>
          )}
        </div>
        
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

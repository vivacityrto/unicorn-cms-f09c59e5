import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent } from './card';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  children?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action, children }: EmptyStateProps) {
  const ActionIcon = action?.icon;
  
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center p-12 text-center">
        {Icon && (
          <div className="mb-4 rounded-full bg-muted p-3">
            <Icon className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
        
        <h3 className="mb-2 text-lg font-semibold">
          {title}
        </h3>
        
        {description && (
          <p className="mb-6 text-sm text-muted-foreground max-w-md">
            {description}
          </p>
        )}
        
        {action && (
          <Button onClick={action.onClick}>
            {ActionIcon && <ActionIcon className="mr-2 h-4 w-4" />}
            {action.label}
          </Button>
        )}
        
        {children}
      </CardContent>
    </Card>
  );
}

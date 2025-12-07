import { ReactNode } from 'react';
import { Card, CardContent } from './card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: {
    value: number;
    positive: boolean;
  };
  intent?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  onClick?: () => void;
  className?: string;
}

const intentColors = {
  default: 'text-muted-foreground',
  success: 'text-green-600',
  warning: 'text-yellow-600',
  danger: 'text-red-600',
  info: 'text-blue-600',
};

const intentBgColors = {
  default: 'bg-muted/50',
  success: 'bg-green-50',
  warning: 'bg-yellow-50',
  danger: 'bg-red-50',
  info: 'bg-blue-50',
};

const intentHoverColors = {
  default: 'group-hover:text-muted-foreground',
  success: 'group-hover:text-green-600',
  warning: 'group-hover:text-yellow-600',
  danger: 'group-hover:text-red-600',
  info: 'group-hover:text-blue-600',
};

const intentHoverBgColors = {
  default: 'group-hover:bg-muted/50',
  success: 'group-hover:bg-green-50',
  warning: 'group-hover:bg-yellow-50',
  danger: 'group-hover:bg-red-50',
  info: 'group-hover:bg-blue-50',
};

export function StatCard({ 
  label, 
  value, 
  icon: Icon, 
  trend, 
  intent = 'default',
  onClick,
  className 
}: StatCardProps) {
  const isClickable = !!onClick;
  
  return (
    <Card 
      className={cn(
        'transition-all duration-200 group',
        isClickable && 'cursor-pointer hover:shadow-card-hover hover:scale-[1.02]',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">
              {label}
            </p>
            <p className={cn(
              'text-2xl font-bold tracking-tight transition-colors duration-200',
              'text-foreground',
              isClickable && intentHoverColors[intent]
            )}>
              {value}
            </p>
            {trend && (
              <p className={cn(
                'text-xs font-medium',
                trend.positive ? 'text-green-600' : 'text-red-600'
              )}>
                {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </p>
            )}
          </div>
          
          {Icon && (
            <div className={cn(
              'p-3 rounded-lg transition-colors duration-200',
              'bg-muted/30',
              isClickable && intentHoverBgColors[intent]
            )}>
              <Icon className={cn(
                'h-6 w-6 transition-colors duration-200',
                'text-foreground',
                isClickable && intentHoverColors[intent]
              )} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

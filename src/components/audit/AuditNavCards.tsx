import { Card } from '@/components/ui/card';
import { FileText, ClipboardCheck, Calendar, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuditNavCardsProps {
  activeTab: 'templates' | 'inspections' | 'schedules' | 'analytics';
  onTabChange: (tab: 'templates' | 'inspections' | 'schedules' | 'analytics') => void;
  counts?: {
    templates: number;
    inspections: number;
    schedules: number;
    analytics: number;
  };
}

const navItems = [
  {
    id: 'templates' as const,
    label: 'Templates',
    description: 'Audit question banks',
    icon: FileText,
    accentColor: 'bg-slate-500',
    lightBg: 'bg-slate-50 dark:bg-slate-900/50',
    textColor: 'text-slate-600 dark:text-slate-400',
    borderColor: 'border-slate-200 dark:border-slate-800',
    activeBorder: 'border-slate-500',
  },
  {
    id: 'inspections' as const,
    label: 'Inspections',
    description: 'Active & completed',
    icon: ClipboardCheck,
    accentColor: 'bg-blue-500',
    lightBg: 'bg-blue-50 dark:bg-blue-900/50',
    textColor: 'text-blue-600 dark:text-blue-400',
    borderColor: 'border-blue-200 dark:border-blue-800',
    activeBorder: 'border-blue-500',
  },
  {
    id: 'schedules' as const,
    label: 'Schedules',
    description: 'Upcoming audits',
    icon: Calendar,
    accentColor: 'bg-emerald-500',
    lightBg: 'bg-emerald-50 dark:bg-emerald-900/50',
    textColor: 'text-emerald-600 dark:text-emerald-400',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    activeBorder: 'border-emerald-500',
  },
  {
    id: 'analytics' as const,
    label: 'Analytics',
    description: 'Reports & insights',
    icon: BarChart3,
    accentColor: 'bg-violet-500',
    lightBg: 'bg-violet-50 dark:bg-violet-900/50',
    textColor: 'text-violet-600 dark:text-violet-400',
    borderColor: 'border-violet-200 dark:border-violet-800',
    activeBorder: 'border-violet-500',
  },
];

export function AuditNavCards({ activeTab, onTabChange, counts }: AuditNavCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {navItems.map((item, index) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        const count = counts?.[item.id] ?? 0;

        return (
          <Card
            key={item.id}
            className={cn(
              'group relative cursor-pointer overflow-hidden',
              'animate-fade-in transition-all duration-200 ease-out',
              'border-2 hover:border-opacity-60',
              isActive 
                ? `${item.activeBorder} shadow-sm` 
                : `${item.borderColor} hover:shadow-md`
            )}
            style={{ animationDelay: `${index * 50}ms` }}
            onClick={() => onTabChange(item.id)}
          >
            {/* Left accent strip */}
            <div 
              className={cn(
                'absolute left-0 top-0 bottom-0 w-1 transition-all duration-200',
                item.accentColor,
                isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'
              )}
            />

            <div className="p-4 pl-5">
              <div className="flex items-center gap-3">
                {/* Icon */}
                <div 
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200',
                    item.lightBg,
                    isActive && 'scale-105'
                  )}
                >
                  <Icon className={cn('h-5 w-5', item.textColor)} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className={cn(
                      'text-2xl font-bold tabular-nums',
                      isActive ? 'text-foreground' : 'text-foreground/80'
                    )}>
                      {count}
                    </span>
                    <span className={cn(
                      'text-sm font-medium truncate',
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {item.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

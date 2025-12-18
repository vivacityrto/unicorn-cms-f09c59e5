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
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    hoverBgColor: 'group-hover:bg-blue-500/20',
  },
  {
    id: 'inspections' as const,
    label: 'Inspections',
    description: 'Active & completed',
    icon: ClipboardCheck,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    hoverBgColor: 'group-hover:bg-green-500/20',
  },
  {
    id: 'schedules' as const,
    label: 'Schedules',
    description: 'Upcoming audits',
    icon: Calendar,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    hoverBgColor: 'group-hover:bg-amber-500/20',
  },
  {
    id: 'analytics' as const,
    label: 'Actions',
    description: 'Reports & insights',
    icon: BarChart3,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    hoverBgColor: 'group-hover:bg-red-500/20',
  },
];

export function AuditNavCards({ activeTab, onTabChange, counts }: AuditNavCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {navItems.map((item, index) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        const count = counts?.[item.id] ?? 0;

        return (
          <div
            key={item.id}
            className={cn(
              'p-4 rounded-lg border bg-card hover:shadow-md transition-all cursor-pointer group animate-scale-in',
              isActive && 'shadow-md'
            )}
            style={{ animationDelay: `${index * 50}ms` }}
            onClick={() => onTabChange(item.id)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-muted-foreground">{item.label}</span>
              <div className={cn('p-2 rounded-lg transition-colors', item.bgColor, item.hoverBgColor)}>
                <Icon className={cn('h-5 w-5', item.color)} />
              </div>
            </div>
            <p className="text-2xl font-bold mb-1">{count}</p>
            <p className="text-xs text-muted-foreground">{item.description}</p>
          </div>
        );
      })}
    </div>
  );
}

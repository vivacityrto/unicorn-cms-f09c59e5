import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    colorClass: 'text-muted-foreground',
    delay: '0ms',
  },
  {
    id: 'inspections' as const,
    label: 'Inspections',
    description: 'Active & completed',
    icon: ClipboardCheck,
    colorClass: 'text-blue-500',
    delay: '100ms',
  },
  {
    id: 'schedules' as const,
    label: 'Schedules',
    description: 'Upcoming audits',
    icon: Calendar,
    colorClass: 'text-green-500',
    delay: '200ms',
  },
  {
    id: 'analytics' as const,
    label: 'Analytics',
    description: 'Reports & insights',
    icon: BarChart3,
    colorClass: 'text-purple-500',
    delay: '300ms',
  },
];

export function AuditNavCards({ activeTab, onTabChange, counts }: AuditNavCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        const count = counts?.[item.id] ?? 0;

        return (
          <Card
            key={item.id}
            className={cn(
              'animate-fade-in cursor-pointer hover:shadow-lg transition-all',
              isActive && 'ring-2 ring-primary shadow-lg'
            )}
            style={{ animationDelay: item.delay }}
            onClick={() => onTabChange(item.id)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
              <Icon className={cn('h-[22px] w-[22px]', item.colorClass)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{count}</div>
              <p className="text-xs text-muted-foreground mt-1 cursor-pointer hover:text-primary">
                {item.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

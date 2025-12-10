import { FileText, ClipboardCheck, Calendar, BarChart3 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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
    color: 'text-primary',
  },
  {
    id: 'inspections' as const,
    label: 'Inspections',
    description: 'Active & completed',
    icon: ClipboardCheck,
    color: 'text-green-500',
  },
  {
    id: 'schedules' as const,
    label: 'Schedules',
    description: 'Upcoming audits',
    icon: Calendar,
    color: 'text-yellow-500',
  },
  {
    id: 'analytics' as const,
    label: 'Analytics',
    description: 'Reports & insights',
    icon: BarChart3,
    color: 'text-red-500',
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
          <Card
            key={item.id}
            className={cn(
              'animate-scale-in cursor-pointer transition-all',
              isActive 
                ? 'ring-2 ring-primary shadow-lg' 
                : 'hover:shadow-lg'
            )}
            style={{ animationDelay: `${index * 50}ms` }}
            onClick={() => onTabChange(item.id)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
              <Icon className={cn('h-[22px] w-[22px]', item.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{count}</div>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

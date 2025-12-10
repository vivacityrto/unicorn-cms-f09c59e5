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
  },
  {
    id: 'inspections' as const,
    label: 'Inspections',
    description: 'Active & completed',
    icon: ClipboardCheck,
  },
  {
    id: 'schedules' as const,
    label: 'Schedules',
    description: 'Upcoming audits',
    icon: Calendar,
  },
  {
    id: 'analytics' as const,
    label: 'Analytics',
    description: 'Reports & insights',
    icon: BarChart3,
  },
];

const cardStyle = {
  circleColor: 'bg-gray-400/15',
  iconBg: 'bg-gradient-to-br from-gray-600 to-gray-800',
  shadowColor: 'shadow-gray-200/50',
  activeBorder: 'ring-gray-400',
};

export function AuditNavCards({ activeTab, onTabChange, counts }: AuditNavCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {navItems.map((item, index) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        const count = counts?.[item.id] ?? 0;

        return (
          <button
            key={item.id}
            className={cn(
              'group relative text-left rounded-2xl p-5 overflow-hidden',
              'animate-scale-in transition-all duration-300',
              'bg-card border border-border',
              'shadow-md',
              cardStyle.shadowColor,
              isActive 
                ? `scale-[1.02] shadow-lg ring-2 ${cardStyle.activeBorder}` 
                : 'hover:scale-[1.02] hover:shadow-lg'
            )}
            style={{ animationDelay: `${index * 75}ms` }}
            onClick={() => onTabChange(item.id)}
          >
            {/* Decorative circles with color */}
            <div className={cn('absolute top-0 right-0 w-24 h-24 rounded-full -translate-y-8 translate-x-8', cardStyle.circleColor)} />
            <div className={cn('absolute bottom-0 left-0 w-16 h-16 rounded-full translate-y-6 -translate-x-6', cardStyle.circleColor)} />
            
            {/* Content */}
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className={cn('p-2 rounded-xl text-white', cardStyle.iconBg)}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-4xl font-bold tracking-tight text-foreground">
                  {count}
                </span>
              </div>
              
              <h3 className="text-base font-semibold mb-0.5 text-foreground">
                {item.label}
              </h3>
              <p className="text-sm text-muted-foreground">
                {item.description}
              </p>
            </div>

            {/* Active indicator dot */}
            {isActive && (
              <div className={cn('absolute top-3 right-3 w-2 h-2 rounded-full animate-pulse', cardStyle.iconBg)} />
            )}
          </button>
        );
      })}
    </div>
  );
}

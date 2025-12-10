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
    gradient: 'from-gray-600 to-gray-800',
    shadowColor: 'shadow-gray-500/25',
  },
  {
    id: 'inspections' as const,
    label: 'Inspections',
    description: 'Active & completed',
    icon: ClipboardCheck,
    gradient: 'from-sky-500 to-blue-600',
    shadowColor: 'shadow-blue-500/25',
  },
  {
    id: 'schedules' as const,
    label: 'Schedules',
    description: 'Upcoming audits',
    icon: Calendar,
    gradient: 'from-emerald-500 to-teal-600',
    shadowColor: 'shadow-emerald-500/25',
  },
  {
    id: 'analytics' as const,
    label: 'Analytics',
    description: 'Reports & insights',
    icon: BarChart3,
    gradient: 'from-purple-500 to-indigo-600',
    shadowColor: 'shadow-purple-500/25',
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
          <button
            key={item.id}
            className={cn(
              'group relative text-left rounded-2xl p-5',
              'animate-scale-in transition-all duration-300',
              'bg-gradient-to-br',
              item.gradient,
              'text-white shadow-lg',
              item.shadowColor,
              isActive 
                ? 'scale-[1.02] shadow-xl ring-2 ring-white/30' 
                : 'hover:scale-[1.02] hover:shadow-xl'
            )}
            style={{ animationDelay: `${index * 75}ms` }}
            onClick={() => onTabChange(item.id)}
          >
            {/* Decorative circles */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-8 translate-x-8" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
            
            {/* Content */}
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-4xl font-bold tracking-tight">
                  {count}
                </span>
              </div>
              
              <h3 className="text-base font-semibold mb-0.5">
                {item.label}
              </h3>
              <p className="text-sm text-white/70">
                {item.description}
              </p>
            </div>

            {/* Active indicator dot */}
            {isActive && (
              <div className="absolute top-3 right-3 w-2 h-2 bg-white rounded-full animate-pulse" />
            )}
          </button>
        );
      })}
    </div>
  );
}

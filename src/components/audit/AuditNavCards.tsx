import { Card, CardContent } from '@/components/ui/card';
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
    gradient: 'from-slate-500 to-slate-600',
    bgGlow: 'bg-slate-500/10',
    iconBg: 'bg-slate-500/20',
    activeRing: 'ring-slate-500',
    delay: '0ms',
  },
  {
    id: 'inspections' as const,
    label: 'Inspections',
    description: 'Active & completed',
    icon: ClipboardCheck,
    gradient: 'from-blue-500 to-blue-600',
    bgGlow: 'bg-blue-500/10',
    iconBg: 'bg-blue-500/20',
    activeRing: 'ring-blue-500',
    delay: '50ms',
  },
  {
    id: 'schedules' as const,
    label: 'Schedules',
    description: 'Upcoming audits',
    icon: Calendar,
    gradient: 'from-emerald-500 to-emerald-600',
    bgGlow: 'bg-emerald-500/10',
    iconBg: 'bg-emerald-500/20',
    activeRing: 'ring-emerald-500',
    delay: '100ms',
  },
  {
    id: 'analytics' as const,
    label: 'Analytics',
    description: 'Reports & insights',
    icon: BarChart3,
    gradient: 'from-purple-500 to-purple-600',
    bgGlow: 'bg-purple-500/10',
    iconBg: 'bg-purple-500/20',
    activeRing: 'ring-purple-500',
    delay: '150ms',
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
              'group relative overflow-hidden cursor-pointer border-0',
              'animate-scale-in transition-all duration-300 ease-out',
              'hover:shadow-xl hover:-translate-y-1',
              isActive 
                ? `ring-2 ${item.activeRing} shadow-xl -translate-y-1` 
                : 'shadow-md hover:shadow-lg'
            )}
            style={{ animationDelay: item.delay }}
            onClick={() => onTabChange(item.id)}
          >
            {/* Background gradient glow effect */}
            <div 
              className={cn(
                'absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500',
                item.bgGlow
              )}
            />
            
            {/* Active indicator bar */}
            <div 
              className={cn(
                'absolute top-0 left-0 right-0 h-1 bg-gradient-to-r transition-transform duration-300 origin-left',
                item.gradient,
                isActive ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
              )}
            />

            <CardContent className="relative p-5">
              <div className="flex items-start justify-between mb-4">
                {/* Icon container with gradient background */}
                <div 
                  className={cn(
                    'p-3 rounded-xl transition-all duration-300',
                    'group-hover:scale-110 group-hover:shadow-lg',
                    item.iconBg,
                    isActive && 'scale-110 shadow-lg'
                  )}
                >
                  <Icon 
                    className={cn(
                      'h-5 w-5 transition-colors duration-300',
                      `bg-gradient-to-br ${item.gradient} bg-clip-text`,
                      isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
                    )} 
                  />
                </div>
                
                {/* Count on opposite side */}
                <span 
                  className={cn(
                    'text-3xl font-bold tracking-tight transition-all duration-300',
                    'group-hover:scale-105',
                    isActive ? 'text-foreground' : 'text-foreground/80'
                  )}
                >
                  {count}
                </span>
              </div>

              {/* Label and description */}
              <div className="space-y-0.5">
                <h3 className={cn(
                  'text-sm font-semibold transition-colors duration-300',
                  isActive ? 'text-foreground' : 'text-foreground/90'
                )}>
                  {item.label}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {item.description}
                </p>
              </div>

              {/* Subtle bottom accent */}
              <div 
                className={cn(
                  'absolute bottom-0 left-0 right-0 h-16 pointer-events-none',
                  'bg-gradient-to-t from-muted/30 to-transparent',
                  'opacity-0 group-hover:opacity-100 transition-opacity duration-500'
                )}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

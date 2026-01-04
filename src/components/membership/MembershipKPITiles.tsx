import { AlertTriangle, Clock, Calendar, Activity, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KPIStats, SavedView } from '@/types/membership';

interface MembershipKPITilesProps {
  stats: KPIStats;
  activeView: SavedView;
  onViewChange: (view: SavedView) => void;
}

export function MembershipKPITiles({ stats, activeView, onViewChange }: MembershipKPITilesProps) {
  const tiles = [
    {
      id: 'overdue_actions' as SavedView,
      label: 'Overdue Actions',
      value: stats.overdueActions,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-50 hover:bg-red-100',
      borderColor: 'border-red-200',
      activeColor: 'ring-red-500',
    },
    {
      id: 'hours_at_risk' as SavedView,
      label: 'Hours at Risk',
      value: stats.hoursAtRisk,
      icon: Clock,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50 hover:bg-amber-100',
      borderColor: 'border-amber-200',
      activeColor: 'ring-amber-500',
      subtitle: '>70% used',
    },
    {
      id: 'obligations_due' as SavedView,
      label: 'Obligations Due',
      value: stats.obligationsDue,
      icon: Calendar,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 hover:bg-blue-100',
      borderColor: 'border-blue-200',
      activeColor: 'ring-blue-500',
    },
    {
      id: 'all' as SavedView,
      label: 'No Activity 21+ Days',
      value: stats.noActivity21Days,
      icon: Activity,
      color: 'text-slate-600',
      bgColor: 'bg-slate-50 hover:bg-slate-100',
      borderColor: 'border-slate-200',
      activeColor: 'ring-slate-500',
    },
    {
      id: 'all' as SavedView,
      label: 'At Risk',
      value: stats.atRiskMemberships,
      icon: ShieldAlert,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 hover:bg-purple-100',
      borderColor: 'border-purple-200',
      activeColor: 'ring-purple-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {tiles.map((tile, idx) => {
        const Icon = tile.icon;
        const isActive = activeView === tile.id && tile.id !== 'all';
        
        return (
          <button
            key={idx}
            onClick={() => onViewChange(tile.id)}
            className={cn(
              'flex items-center gap-3 p-4 rounded-lg border transition-all duration-200',
              tile.bgColor,
              tile.borderColor,
              isActive && `ring-2 ${tile.activeColor}`,
              'text-left'
            )}
          >
            <div className={cn('p-2 rounded-lg bg-white/80', tile.color)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold text-foreground">{tile.value}</p>
              <p className="text-xs font-medium text-muted-foreground truncate">{tile.label}</p>
              {tile.subtitle && (
                <p className="text-[10px] text-muted-foreground">{tile.subtitle}</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Activity, FileWarning, Flame, ShieldAlert, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPIs {
  totalTenants: number;
  highRisk: number;
  criticalStages: number;
  mandatoryGaps: number;
  burnCritical: number;
  retentionHighRisk: number;
}

interface Props {
  kpis: KPIs;
  isExec: boolean;
  onTileClick: (filter: string) => void;
}

const tiles = [
  { key: 'totalTenants', label: 'Total Tenants', icon: Users, color: 'text-foreground', filter: '' },
  { key: 'highRisk', label: 'High Risk', icon: AlertTriangle, color: 'text-destructive', filter: 'risk_high' },
  { key: 'criticalStages', label: 'Critical Stages', icon: Activity, color: 'text-destructive', filter: 'stage_critical' },
  { key: 'mandatoryGaps', label: 'Mandatory Gaps', icon: FileWarning, color: 'text-amber-500', filter: 'gaps' },
  { key: 'burnCritical', label: 'Burn Critical', icon: Flame, color: 'text-orange-500', filter: 'burn' },
  { key: 'retentionHighRisk', label: 'Retention Risk', icon: ShieldAlert, color: 'text-destructive', filter: 'retention', execOnly: true },
] as const;

export function PortfolioSummaryTiles({ kpis, isExec, onTileClick }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {tiles.map(tile => {
        if ('execOnly' in tile && tile.execOnly && !isExec) return null;
        const Icon = tile.icon;
        const value = kpis[tile.key as keyof KPIs];
        return (
          <Card
            key={tile.key}
            className={cn(
              'cursor-pointer hover:shadow-md transition-shadow border',
              value > 0 && tile.key !== 'totalTenants' && 'border-destructive/30'
            )}
            onClick={() => onTileClick(tile.filter)}
          >
            <CardContent className="p-3 flex items-center gap-3">
              <Icon className={cn('h-5 w-5 shrink-0', tile.color)} />
              <div className="min-w-0">
                <p className="text-2xl font-bold leading-none">{value}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{tile.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

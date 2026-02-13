/**
 * StrategicExposureTable – Unicorn 2.0
 *
 * Simplified, scannable exposure view. Top 10 max.
 * 4px left severity bar per row. Owner shows CSC first name + avatar.
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { DeltaChip } from './DeltaChip';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { ExecutiveHealthRow } from '@/hooks/useExecutiveHealth';
import { useOwnerProfiles } from '@/hooks/useOwnerProfiles';

interface StrategicExposureTableProps {
  data: ExecutiveHealthRow[];
  onRowClick: (row: ExecutiveHealthRow) => void;
  weeklyMode: boolean;
}

const bandOrder: Record<string, number> = { immediate_attention: 0, at_risk: 1, watch: 2, stable: 3 };

const bandVariant: Record<string, string> = {
  stable: 'bg-brand-purple-100 text-brand-purple-700 dark:bg-brand-purple-900 dark:text-brand-purple-200',
  watch: 'bg-brand-aqua-100 text-brand-aqua-700 dark:bg-brand-aqua-900 dark:text-brand-aqua-200',
  at_risk: 'bg-brand-macaron-100 text-brand-macaron-700 dark:bg-brand-macaron-900 dark:text-brand-macaron-200',
  immediate_attention: 'bg-brand-fuchsia-100 text-brand-fuchsia-700 dark:bg-brand-fuchsia-900 dark:text-brand-fuchsia-200',
};

const rowBorderColor: Record<string, string> = {
  stable: 'border-l-[hsl(275,55%,41%)]',
  watch: 'border-l-[hsl(190,74%,50%)]',
  at_risk: 'border-l-[hsl(48,96%,52%)]',
  immediate_attention: 'border-l-[hsl(333,86%,51%)]',
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-[hsl(275,55%,41%)]';
  if (score >= 60) return 'text-foreground';
  if (score >= 40) return 'text-[hsl(48,96%,52%)]';
  return 'text-[hsl(333,86%,51%)]';
}

function TrendIcon({ value }: { value: number }) {
  if (value > 0) return <ArrowUp className="w-3 h-3 text-[hsl(275,55%,41%)]" />;
  if (value < 0) return <ArrowDown className="w-3 h-3 text-[hsl(333,86%,51%)]" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

export function StrategicExposureTable({ data, onRowClick, weeklyMode }: StrategicExposureTableProps) {
  const sorted = useMemo(() => {
    const filtered = weeklyMode
      ? data.filter(r => r.risk_band !== 'stable')
      : data;

    return [...filtered].sort((a, b) => {
      const bandDiff = (bandOrder[a.risk_band] ?? 3) - (bandOrder[b.risk_band] ?? 3);
      if (bandDiff !== 0) return bandDiff;
      if (a.risk_band_change_7d === 'changed' && b.risk_band_change_7d !== 'changed') return -1;
      if (b.risk_band_change_7d === 'changed' && a.risk_band_change_7d !== 'changed') return 1;
      if (b.delta_operational_risk_7d !== a.delta_operational_risk_7d) return b.delta_operational_risk_7d - a.delta_operational_risk_7d;
      return b.days_stale - a.days_stale;
    }).slice(0, 10);
  }, [data, weeklyMode]);

  const ownerUuids = useMemo(() => sorted.map(r => r.owner_user_uuid).filter(Boolean) as string[], [sorted]);
  const { data: owners } = useOwnerProfiles(ownerUuids);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Where We Are Exposed</CardTitle>
        <p className="text-xs text-muted-foreground">
          {weeklyMode ? 'Movement only — stable clients hidden' : `Top ${sorted.length} by exposure`}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Client</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Band</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">7d Trend</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Actions</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Critical</th>
                <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Hours</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Owner</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => {
                const owner = row.owner_user_uuid && owners ? owners[row.owner_user_uuid] : null;
                const initials = owner?.first_name ? owner.first_name.charAt(0).toUpperCase() : '';
                return (
                  <tr
                    key={`${row.tenant_id}-${row.package_instance_id}`}
                    className={cn(
                      'border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors border-l-4',
                      rowBorderColor[row.risk_band] ?? rowBorderColor.stable
                    )}
                    onClick={() => onRowClick(row)}
                  >
                    <td className="px-4 py-3">
                      <p className={cn('font-medium truncate max-w-[200px]', scoreColor(row.overall_score))}>
                        {row.client_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{row.package_name}</p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Badge className={cn('text-xs capitalize', bandVariant[row.risk_band] || bandVariant.stable)}>
                        {row.risk_band.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <TrendIcon value={row.delta_overall_score_7d} />
                        <DeltaChip value={row.delta_overall_score_7d} type="compliance" />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums">{row.total_actions_remaining}</td>
                    <td className="px-3 py-3 text-center">
                      {row.has_active_critical && (
                        <span className="inline-block w-2 h-2 rounded-full bg-[hsl(333,86%,51%)]" title="Has critical risk" />
                      )}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-muted-foreground">
                      {row.hours_included > 0 ? `${row.hours_remaining}h` : '—'}
                    </td>
                    <td className="px-3 py-3">
                      {owner ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={owner.avatar_url ?? undefined} alt={owner.first_name ?? ''} />
                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-medium">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-foreground truncate max-w-[80px]">
                            {owner.first_name ?? '—'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    {weeklyMode ? 'No significant movement this week.' : 'No active packages match filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

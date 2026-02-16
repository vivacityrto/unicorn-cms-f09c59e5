import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import type { PortfolioTenant } from '@/hooks/usePortfolioCockpit';
import { cn } from '@/lib/utils';

interface Props {
  tenants: PortfolioTenant[];
  cscNameMap: Record<string, string>;
  onRowClick: (tenant: PortfolioTenant) => void;
}

const healthBadge: Record<string, { class: string; label: string }> = {
  critical: { class: 'bg-destructive text-destructive-foreground', label: 'Critical' },
  at_risk: { class: 'bg-orange-500 text-white', label: 'At Risk' },
  monitoring: { class: 'bg-amber-500 text-white', label: 'Monitoring' },
  healthy: { class: 'bg-emerald-500 text-white', label: 'Healthy' },
};

const riskBadge: Record<string, { class: string; label: string }> = {
  high: { class: 'bg-destructive text-destructive-foreground', label: 'High' },
  elevated: { class: 'bg-orange-500 text-white', label: 'Elevated' },
  emerging: { class: 'bg-amber-500 text-white', label: 'Emerging' },
  stable: { class: 'bg-emerald-500 text-white', label: 'Stable' },
};

export function PortfolioTable({ tenants, cscNameMap, onRowClick }: Props) {
  if (tenants.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No tenants match your filters.</p>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="min-w-[180px]">Tenant</TableHead>
              <TableHead>Packages</TableHead>
              <TableHead>CSC</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Stage Health</TableHead>
              <TableHead className="text-right">Tasks</TableHead>
              <TableHead className="text-right">Gaps</TableHead>
              <TableHead className="text-right">Consult 30d</TableHead>
              <TableHead>Burn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map(t => {
              const risk = riskBadge[t.risk_status] || riskBadge.stable;
              const health = healthBadge[t.worst_stage_health_status] || healthBadge.healthy;
              const delta = t.risk_index_delta_14d;
              return (
                <TableRow
                  key={t.tenant_id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => onRowClick(t)}
                >
                  <TableCell className="font-medium">{t.tenant_name}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(t.packages_json) ? t.packages_json : []).slice(0, 2).map((p: any, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{p.name}</Badge>
                      ))}
                      {(Array.isArray(t.packages_json) ? t.packages_json : []).length > 2 && (
                        <Badge variant="outline" className="text-[10px]">+{t.packages_json.length - 2}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.assigned_csc_user_id ? cscNameMap[t.assigned_csc_user_id] || '—' : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge className={cn('text-[10px]', risk.class)}>{risk.label}</Badge>
                      {delta !== 0 && (
                        <span className={cn('flex items-center text-[10px]', delta > 0 ? 'text-destructive' : 'text-emerald-500')}>
                          {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {Math.abs(delta)}%
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('text-[10px]', health.class)}>{health.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span>{t.open_tasks_count}</span>
                    {t.overdue_tasks_count > 0 && (
                      <span className="text-destructive ml-1">({t.overdue_tasks_count})</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {t.mandatory_gaps_count > 0 ? (
                      <span className="text-destructive font-medium">{t.mandatory_gaps_count}</span>
                    ) : '0'}
                  </TableCell>
                  <TableCell className="text-right text-sm">{Number(t.consult_hours_30d).toFixed(1)}h</TableCell>
                  <TableCell>
                    {t.burn_risk_status === 'critical' ? (
                      <Badge className="bg-orange-500 text-white text-[10px]">Critical</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Normal</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

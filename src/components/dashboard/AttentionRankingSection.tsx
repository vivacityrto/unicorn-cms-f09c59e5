import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Target, ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react';
import type { AttentionTenant } from '@/hooks/useDashboardTriage';
import { cn } from '@/lib/utils';

interface Props {
  tenants: AttentionTenant[];
  cscNameMap: Record<string, string>;
  onRowClick: (tenant: AttentionTenant) => void;
  onViewFullPortfolio: () => void;
}

const healthBadge: Record<string, { class: string; label: string }> = {
  critical: { class: 'bg-destructive text-destructive-foreground', label: 'Critical' },
  at_risk: { class: 'bg-orange-500 text-white', label: 'At Risk' },
  monitoring: { class: 'bg-amber-500 text-white', label: 'Monitor' },
  healthy: { class: 'bg-emerald-500 text-white', label: 'Healthy' },
};

function AttentionScorePill({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-destructive text-destructive-foreground'
    : score >= 40 ? 'bg-orange-500 text-white'
    : score >= 20 ? 'bg-amber-500 text-white'
    : 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold min-w-[32px]', color)}>
      {score}
    </span>
  );
}

export function AttentionRankingSection({ tenants, cscNameMap, onRowClick, onViewFullPortfolio }: Props) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Target className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Attention Ranking</h2>
            <p className="text-xs text-muted-foreground">Top 5 tenants by composite score</p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[40px]">#</TableHead>
                  <TableHead className="min-w-[160px]">Tenant</TableHead>
                  <TableHead className="text-center w-[70px]">Score</TableHead>
                  <TableHead>Stage Health</TableHead>
                  <TableHead className="text-right">Gaps</TableHead>
                  <TableHead>Renewal</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((t, i) => {
                  const health = healthBadge[t.worst_stage_health_status] || healthBadge.healthy;
                  return (
                    <TableRow
                      key={t.tenant_id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => onRowClick(t)}
                    >
                      <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                      <TableCell>
                        <p className="font-medium text-sm">{t.tenant_name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t.assigned_csc_user_id ? cscNameMap[t.assigned_csc_user_id] || '' : ''}
                        </p>
                      </TableCell>
                      <TableCell className="text-center">
                        <AttentionScorePill score={t.attention_score} />
                      </TableCell>
                      <TableCell>
                        <Badge className={cn('text-[10px]', health.class)}>{health.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {t.mandatory_gaps_count > 0 ? (
                          <span className="text-destructive font-medium">{t.mandatory_gaps_count}</span>
                        ) : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.retention_status === 'high_risk' ? (
                          <Badge variant="destructive" className="text-[10px]">High Risk</Badge>
                        ) : t.retention_status === 'vulnerable' ? (
                          <Badge className="bg-amber-500 text-white text-[10px]">Vulnerable</Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-center mt-2">
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={onViewFullPortfolio}>
          View Full Portfolio <ChevronRight className="h-3 w-3" />
        </Button>
      </div>
    </section>
  );
}

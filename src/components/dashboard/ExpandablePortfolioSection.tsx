import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Layers } from 'lucide-react';
import type { AttentionTenant } from '@/hooks/useDashboardTriage';
import { cn } from '@/lib/utils';

interface Props {
  activeTenants: AttentionTenant[];
  lowAttentionTenants: AttentionTenant[];
  cscNameMap: Record<string, string>;
  onRowClick: (tenant: AttentionTenant) => void;
}

const healthBadge: Record<string, { class: string; label: string }> = {
  critical: { class: 'bg-destructive text-destructive-foreground', label: 'Critical' },
  at_risk: { class: 'bg-orange-500 text-white', label: 'At Risk' },
  monitoring: { class: 'bg-amber-500 text-white', label: 'Monitor' },
  healthy: { class: 'bg-emerald-500 text-white', label: 'Healthy' },
};

function ScorePill({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-destructive text-destructive-foreground'
    : score >= 40 ? 'bg-orange-500 text-white'
    : score >= 20 ? 'bg-amber-500 text-white'
    : 'bg-muted text-muted-foreground';
  return <span className={cn('inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold min-w-[32px]', color)}>{score}</span>;
}

function TenantRow({ t, cscNameMap, onClick }: { t: AttentionTenant; cscNameMap: Record<string, string>; onClick: () => void }) {
  const health = healthBadge[t.worst_stage_health_status] || healthBadge.healthy;
  return (
    <TableRow className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={onClick}>
      <TableCell className="font-medium text-sm">{t.tenant_name}</TableCell>
      <TableCell className="text-center"><ScorePill score={t.attention_score} /></TableCell>
      <TableCell><Badge className={cn('text-[10px]', health.class)}>{health.label}</Badge></TableCell>
      <TableCell className="text-right text-sm">
        {t.overdue_tasks_count > 0 ? <span className="text-destructive">{t.overdue_tasks_count}</span> : '0'}
        <span className="text-muted-foreground">/{t.open_tasks_count}</span>
      </TableCell>
      <TableCell className="text-right text-sm">
        {t.mandatory_gaps_count > 0 ? <span className="text-destructive font-medium">{t.mandatory_gaps_count}</span> : '0'}
      </TableCell>
      <TableCell className="text-right text-sm">{Number(t.consult_hours_30d).toFixed(1)}h</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {t.assigned_csc_user_id ? cscNameMap[t.assigned_csc_user_id] || '—' : '—'}
      </TableCell>
    </TableRow>
  );
}

export function ExpandablePortfolioSection({ activeTenants, lowAttentionTenants, cscNameMap, onRowClick }: Props) {
  const [lowOpen, setLowOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const displayActive = showAll ? activeTenants : activeTenants.slice(0, 15);

  return (
    <section id="full-portfolio">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
          <Layers className="h-4 w-4 text-foreground" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">Full Portfolio</h2>
          <p className="text-xs text-muted-foreground">
            {activeTenants.length} active · {lowAttentionTenants.length} low attention
          </p>
        </div>
      </div>

      {activeTenants.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No tenants match current filters.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="min-w-[160px]">Tenant</TableHead>
                    <TableHead className="text-center w-[70px]">Score</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead className="text-right">Tasks</TableHead>
                    <TableHead className="text-right">Gaps</TableHead>
                    <TableHead className="text-right">Consult</TableHead>
                    <TableHead>CSC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayActive.map(t => (
                    <TenantRow key={t.tenant_id} t={t} cscNameMap={cscNameMap} onClick={() => onRowClick(t)} />
                  ))}
                </TableBody>
              </Table>
            </div>
            {!showAll && activeTenants.length > 15 && (
              <div className="flex justify-center py-2 border-t">
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowAll(true)}>
                  Show all {activeTenants.length} tenants
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lowAttentionTenants.length > 0 && (
        <Collapsible open={lowOpen} onOpenChange={setLowOpen} className="mt-3">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1 w-full justify-start">
              {lowOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Low Attention ({lowAttentionTenants.length} tenants) — stable, healthy, no gaps
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-1">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableBody>
                      {lowAttentionTenants.map(t => (
                        <TenantRow key={t.tenant_id} t={t} cscNameMap={cscNameMap} onClick={() => onRowClick(t)} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  );
}

/**
 * MomentumPanel – Unicorn 2.0
 *
 * Progress Command Center: ranked list of consultant's active clients
 * sorted by closest to completion. Internal only.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { ComplianceScoreRing } from '@/components/compliance/ComplianceScoreRing';
import { ChevronDown, ChevronRight, Clock, AlertTriangle, Info, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMomentumPanel, type MomentumClient } from '@/hooks/useMomentumPanel';

interface MomentumPanelProps {
  userUuid: string | null;
  className?: string;
}

function riskChip(state: string) {
  switch (state) {
    case 'critical':
      return <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" />Critical</Badge>;
    case 'at_risk':
      return <Badge className="text-xs bg-brand-macaron text-brand-acai gap-1"><AlertTriangle className="h-3 w-3" />At Risk</Badge>;
    default:
      return <Badge variant="outline" className="text-xs text-primary gap-1">On Track</Badge>;
  }
}

// Group clients by tenant for multi-package handling
function groupByTenant(clients: MomentumClient[]) {
  const map = new Map<number, MomentumClient[]>();
  for (const c of clients) {
    const list = map.get(c.tenant_id) || [];
    list.push(c);
    map.set(c.tenant_id, list);
  }
  return Array.from(map.entries()).map(([tenantId, items]) => ({
    tenantId,
    clientName: items[0].client_name,
    primary: items[0], // highest score package (already sorted by view)
    packages: items,
    isMultiPackage: items.length > 1,
  }));
}

export function MomentumPanel({ userUuid, className }: MomentumPanelProps) {
  const { data: clients, isLoading } = useMomentumPanel(userUuid);
  const [expandedTenants, setExpandedTenants] = useState<Set<number>>(new Set());

  const groups = clients ? groupByTenant(clients) : [];

  const toggleExpand = (tenantId: number) => {
    setExpandedTenants((prev) => {
      const next = new Set(prev);
      if (next.has(tenantId)) next.delete(tenantId);
      else next.add(tenantId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Momentum</CardTitle>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Ranked by closest to completion. Critical risks pinned to top. Sorted by score, then phase completion, then remaining hours.
            </TooltipContent>
          </Tooltip>
          <Badge variant="outline" className="ml-auto text-xs">{groups.length} clients</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">No active client packages assigned.</p>
        ) : (
          <div className="divide-y">
            {groups.map((group) => (
              <div key={group.tenantId}>
                <Link
                  to={`/manage-tenants/${group.tenantId}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group"
                >
                  <ComplianceScoreRing score={group.primary.overall_score} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{group.clientName}</span>
                      {group.isMultiPackage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1"
                          onClick={(e) => { e.preventDefault(); toggleExpand(group.tenantId); }}
                        >
                          {expandedTenants.has(group.tenantId)
                            ? <ChevronDown className="h-3.5 w-3.5" />
                            : <ChevronRight className="h-3.5 w-3.5" />}
                          <span className="text-xs">{group.packages.length} pkgs</span>
                        </Button>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground truncate block">
                      {group.isMultiPackage ? 'Multiple packages' : group.primary.package_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {riskChip(group.primary.risk_state)}
                    {group.primary.is_stale && (
                      <Badge variant="outline" className="text-xs gap-1 text-brand-aqua">
                        <Clock className="h-3 w-3" />Stale
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {Number(group.primary.hours_remaining).toFixed(0)}h left
                    </span>
                  </div>
                </Link>
                {/* Expanded multi-package rows */}
                {group.isMultiPackage && expandedTenants.has(group.tenantId) && (
                  <div className="bg-muted/30 border-t">
                    {group.packages.map((pkg) => (
                      <div key={pkg.package_instance_id} className="flex items-center gap-3 px-6 py-2">
                        <ComplianceScoreRing score={pkg.overall_score} size="sm" />
                        <span className="text-xs text-foreground flex-1 truncate">{pkg.package_name}</span>
                        <span className="text-xs text-muted-foreground">{pkg.phase_completion}% phase</span>
                        <span className="text-xs text-muted-foreground">{Number(pkg.hours_remaining).toFixed(0)}h</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

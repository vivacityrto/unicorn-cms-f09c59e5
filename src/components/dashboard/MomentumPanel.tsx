/**
 * MomentumPanel – Unicorn 2.0
 *
 * Progress Command Center: ranked list of consultant's active clients
 * sorted by closest to completion. Internal only.
 * Includes momentum state chips and "Show paused only" filter.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { ComplianceScoreRing } from '@/components/compliance/ComplianceScoreRing';
import { MomentumBanner } from './MomentumBanner';
import { ChevronDown, ChevronRight, Clock, AlertTriangle, Info, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMomentumPanel, type MomentumClient } from '@/hooks/useMomentumPanel';
import { useConsultantMomentumStates, type MomentumState, type MomentumStateValue } from '@/hooks/useMomentumState';
import { usePredictiveRisk, type PredictiveRiskSnapshot } from '@/hooks/usePredictiveRisk';
import { OperationalRiskChip } from './OperationalRiskChip';

interface MomentumPanelProps {
  userUuid: string | null;
  className?: string;
}

function momentumChip(state: MomentumStateValue) {
  switch (state) {
    case 'at_risk':
      return <Badge className="text-[10px] px-1.5 py-0 bg-brand-fuchsia text-white">At Risk</Badge>;
    case 'paused':
      return <Badge className="text-[10px] px-1.5 py-0 bg-brand-macaron text-brand-acai">Paused</Badge>;
    case 'recovered':
      return <Badge className="text-[10px] px-1.5 py-0 bg-brand-aqua text-white">Recovered</Badge>;
    default:
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-primary">Active</Badge>;
  }
}

function riskChip(state: string) {
  switch (state) {
    case 'critical':
      return <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" />Critical</Badge>;
    case 'at_risk':
      return <Badge className="text-xs bg-brand-macaron text-brand-acai gap-1"><AlertTriangle className="h-3 w-3" />At Risk</Badge>;
    default:
      return null; // Don't show "On Track" chip to reduce clutter with momentum chip
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
    primary: items[0],
    packages: items,
    isMultiPackage: items.length > 1,
  }));
}

export function MomentumPanel({ userUuid, className }: MomentumPanelProps) {
  const { data: clients, isLoading } = useMomentumPanel(userUuid);
  const { data: momentumStates } = useConsultantMomentumStates(userUuid);
  const [expandedTenants, setExpandedTenants] = useState<Set<number>>(new Set());
  const [showPausedOnly, setShowPausedOnly] = useState(false);

  // Build momentum state lookup
  const stateMap = new Map<string, MomentumState>();
  momentumStates?.forEach((ms) => {
    stateMap.set(`${ms.tenant_id}:${ms.package_instance_id}`, ms);
  });

  // Fetch predictive risk snapshots for all tenants the consultant manages
  const tenantIds = clients ? [...new Set(clients.map(c => c.tenant_id))] : [];
  const { data: allRiskSnapshots } = usePredictiveRisk(tenantIds[0] ?? null);
  const riskMap = new Map<string, PredictiveRiskSnapshot>();
  allRiskSnapshots?.forEach((rs) => {
    riskMap.set(`${rs.tenant_id}:${rs.package_instance_id}`, rs);
  });

  const groups = clients ? groupByTenant(clients) : [];

  // Filter groups if showPausedOnly
  const filteredGroups = showPausedOnly
    ? groups.filter((g) => {
        const ms = stateMap.get(`${g.tenantId}:${g.primary.package_instance_id}`);
        return ms?.momentum_state === 'paused' || ms?.momentum_state === 'at_risk';
      })
    : groups;

  const pausedCount = groups.filter((g) => {
    const ms = stateMap.get(`${g.tenantId}:${g.primary.package_instance_id}`);
    return ms?.momentum_state === 'paused' || ms?.momentum_state === 'at_risk';
  }).length;

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
              Ranked by closest to completion. Critical risks pinned to top.
            </TooltipContent>
          </Tooltip>
          <div className="ml-auto flex items-center gap-3">
            {pausedCount > 0 && (
              <div className="flex items-center gap-1.5">
                <Switch
                  id="paused-filter"
                  checked={showPausedOnly}
                  onCheckedChange={setShowPausedOnly}
                  className="scale-75"
                />
                <Label htmlFor="paused-filter" className="text-xs text-muted-foreground cursor-pointer">
                  Paused ({pausedCount})
                </Label>
              </div>
            )}
            <Badge variant="outline" className="text-xs">{filteredGroups.length} clients</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filteredGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">
            {showPausedOnly ? 'No paused clients.' : 'No active client packages assigned.'}
          </p>
        ) : (
          <div className="divide-y">
            {filteredGroups.map((group) => {
              const ms = stateMap.get(`${group.tenantId}:${group.primary.package_instance_id}`);
              const risk = riskMap.get(`${group.tenantId}:${group.primary.package_instance_id}`);
              return (
                <div key={group.tenantId}>
                  {/* Momentum banner for paused/at_risk */}
                  {ms && (ms.momentum_state === 'paused' || ms.momentum_state === 'at_risk') && (
                    <MomentumBanner state={ms} variant="internal" className="mx-4 mt-2 mb-1" />
                  )}
                  <Link
                    to={`/manage-tenants/${group.tenantId}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group"
                  >
                    <ComplianceScoreRing score={group.primary.overall_score} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground truncate">{group.clientName}</span>
                        {ms && momentumChip(ms.momentum_state)}
                        {risk && risk.risk_band !== 'stable' && <OperationalRiskChip snapshot={risk} />}
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
                      {group.packages.map((pkg) => {
                        const pkgMs = stateMap.get(`${group.tenantId}:${pkg.package_instance_id}`);
                        return (
                          <div key={pkg.package_instance_id} className="flex items-center gap-3 px-6 py-2">
                            <ComplianceScoreRing score={pkg.overall_score} size="sm" />
                            <span className="text-xs text-foreground flex-1 truncate">{pkg.package_name}</span>
                            {pkgMs && momentumChip(pkgMs.momentum_state)}
                            <span className="text-xs text-muted-foreground">{pkg.phase_completion}% phase</span>
                            <span className="text-xs text-muted-foreground">{Number(pkg.hours_remaining).toFixed(0)}h</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

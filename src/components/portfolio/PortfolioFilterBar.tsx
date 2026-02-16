import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import type { PortfolioFilters, SavedView } from '@/hooks/usePortfolioCockpit';

interface Props {
  filters: PortfolioFilters;
  onFiltersChange: (f: PortfolioFilters) => void;
  savedView: SavedView;
  onSavedViewChange: (v: SavedView) => void;
  canSeeAll: boolean;
}

export function PortfolioFilterBar({ filters, onFiltersChange, savedView, onSavedViewChange, canSeeAll }: Props) {
  const update = (patch: Partial<PortfolioFilters>) => onFiltersChange({ ...filters, ...patch });
  const hasFilters = filters.search || filters.riskStatus || filters.stageHealth || filters.mandatoryGapsOnly || filters.burnRiskOnly;

  return (
    <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm border-b px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Saved view toggle */}
        {canSeeAll && (
          <Select value={savedView} onValueChange={(v) => onSavedViewChange(v as SavedView)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="my_tenants">My Tenants</SelectItem>
              <SelectItem value="all_tenants">All Tenants</SelectItem>
            </SelectContent>
          </Select>
        )}

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tenant, ABN, RTO, CRICOS…"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            className="pl-9"
          />
        </div>

        {/* Risk status */}
        <Select value={filters.riskStatus || '_all'} onValueChange={(v) => update({ riskStatus: v === '_all' ? null : v })}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Risk Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Risk</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="elevated">Elevated</SelectItem>
            <SelectItem value="emerging">Emerging</SelectItem>
            <SelectItem value="stable">Stable</SelectItem>
          </SelectContent>
        </Select>

        {/* Stage health */}
        <Select value={filters.stageHealth || '_all'} onValueChange={(v) => update({ stageHealth: v === '_all' ? null : v })}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Stage Health" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All Health</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="at_risk">At Risk</SelectItem>
            <SelectItem value="monitoring">Monitoring</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
          </SelectContent>
        </Select>

        {/* Toggles */}
        <div className="flex items-center gap-2">
          <Switch
            id="gaps-only"
            checked={filters.mandatoryGapsOnly}
            onCheckedChange={(c) => update({ mandatoryGapsOnly: c })}
          />
          <Label htmlFor="gaps-only" className="text-xs">Gaps Only</Label>
        </div>

        <div className="flex items-center gap-2">
          <Switch
            id="burn-only"
            checked={filters.burnRiskOnly}
            onCheckedChange={(c) => update({ burnRiskOnly: c })}
          />
          <Label htmlFor="burn-only" className="text-xs">Burn Critical</Label>
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onFiltersChange({ search: '', riskStatus: null, stageHealth: null, mandatoryGapsOnly: false, burnRiskOnly: false, renewalDays: null })}
            className="gap-1"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}

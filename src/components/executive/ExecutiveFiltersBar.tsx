/**
 * ExecutiveFiltersBar – Unicorn 2.0
 *
 * Filters for the Executive Dashboard.
 */

import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Search, X } from 'lucide-react';
import type { ExecutiveFilters } from '@/hooks/useExecutiveHealth';
import type { RiskBand } from '@/hooks/usePredictiveRisk';

interface ExecutiveFiltersBarProps {
  filters: ExecutiveFilters;
  onFilterChange: <K extends keyof ExecutiveFilters>(key: K, value: ExecutiveFilters[K]) => void;
  onReset: () => void;
  packageTypes: string[];
}

const RISK_BANDS: { value: RiskBand; label: string }[] = [
  { value: 'immediate_attention', label: 'Immediate Attention' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'watch', label: 'Watch' },
  { value: 'stable', label: 'Stable' },
];

export function ExecutiveFiltersBar({ filters, onFilterChange, onReset, packageTypes }: ExecutiveFiltersBarProps) {
  const hasFilters = filters.search || filters.riskBands.length > 0 || filters.packageType ||
    filters.staleOnly || filters.criticalOnly || filters.ownerUuid;

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card border border-border rounded-lg">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search client..."
          value={filters.search}
          onChange={e => onFilterChange('search', e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Risk Band */}
      <Select
        value={filters.riskBands[0] || 'all'}
        onValueChange={v => onFilterChange('riskBands', v === 'all' ? [] : [v as RiskBand])}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Risk Band" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Bands</SelectItem>
          {RISK_BANDS.map(b => (
            <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Package Type */}
      {packageTypes.length > 0 && (
        <Select
          value={filters.packageType || 'all'}
          onValueChange={v => onFilterChange('packageType', v === 'all' ? '' : v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Package Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {packageTypes.map(pt => (
              <SelectItem key={pt} value={pt}>{pt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Toggles */}
      <div className="flex items-center gap-2">
        <Switch
          id="stale-only"
          checked={filters.staleOnly}
          onCheckedChange={v => onFilterChange('staleOnly', v)}
        />
        <Label htmlFor="stale-only" className="text-xs cursor-pointer">Stale only</Label>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="critical-only"
          checked={filters.criticalOnly}
          onCheckedChange={v => onFilterChange('criticalOnly', v)}
        />
        <Label htmlFor="critical-only" className="text-xs cursor-pointer">Critical only</Label>
      </div>

      {/* Reset */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onReset} className="text-xs gap-1">
          <X className="w-3 h-3" /> Clear
        </Button>
      )}
    </div>
  );
}

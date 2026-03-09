import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MetricRow } from './MetricRow';
import type { ScorecardMetric } from '@/types/scorecard';

const CATEGORY_ORDER = ['Sales', 'Marketing', 'Delivery', 'Product', 'Finance', 'Team', 'Compliance'];

interface CategorySectionProps {
  category: string;
  metrics: ScorecardMetric[];
  onEdit: (m: ScorecardMetric) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRecord: (metric: ScorecardMetric, value: number, notes?: string, weekEnding?: string) => void;
  onViewHistory: (m: ScorecardMetric) => void;
  isArchiving?: boolean;
  isDeleting?: boolean;
}

function CategorySection({
  category,
  metrics,
  onEdit,
  onArchive,
  onDelete,
  onRecord,
  onViewHistory,
  isArchiving,
  isDeleting,
}: CategorySectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const redCount = metrics.filter((m) => m.latestStatus === 'red').length;
  const greenCount = metrics.filter((m) => m.latestStatus === 'green').length;

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">{category}</span>
          <Badge variant="secondary" className="text-xs">{metrics.length}</Badge>
          {redCount > 0 && (
            <Badge className="text-xs bg-destructive/10 text-destructive border-destructive/20">
              {redCount} off track
            </Badge>
          )}
          {greenCount === metrics.length && metrics.length > 0 && (
            <Badge className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
              All on track
            </Badge>
          )}
        </div>
        {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <div className="divide-y divide-border/50">
          {/* Column headers */}
          <div className="grid gap-2 px-3 py-1.5 bg-muted/20 text-xs font-medium text-muted-foreground grid-cols-[minmax(180px,2fr)_100px_90px_80px_80px_100px_120px_70px_44px]">
            <span>Metric</span>
            <span>Owner</span>
            <span>Category</span>
            <span>Target</span>
            <span>Latest</span>
            <span>Status</span>
            <span>13-Week Trend</span>
            <span>Source</span>
            <span />
          </div>
          {metrics.map((m) => (
            <MetricRow
              key={m.id}
              metric={m}
              onEdit={onEdit}
              onArchive={onArchive}
              onDelete={onDelete}
              onRecord={onRecord}
              onViewHistory={onViewHistory}
              isArchiving={isArchiving}
              isDeleting={isDeleting}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CompanyScorecardTableProps {
  metrics: ScorecardMetric[];
  onEdit: (m: ScorecardMetric) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRecord: (metric: ScorecardMetric, value: number, notes?: string, weekEnding?: string) => void;
  onViewHistory: (m: ScorecardMetric) => void;
  isArchiving?: boolean;
  isDeleting?: boolean;
}

export function CompanyScorecardTable({
  metrics,
  onEdit,
  onArchive,
  onDelete,
  onRecord,
  onViewHistory,
  isArchiving,
  isDeleting,
}: CompanyScorecardTableProps) {
  // Group by category in defined order, then alphabetical for any uncategorised
  const grouped = new Map<string, ScorecardMetric[]>();
  for (const cat of CATEGORY_ORDER) grouped.set(cat, []);

  for (const m of metrics) {
    const cat = CATEGORY_ORDER.includes(m.category) ? m.category : 'Delivery';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(m);
  }

  const populated = CATEGORY_ORDER.filter((c) => (grouped.get(c) || []).length > 0);

  if (populated.length === 0) return null;

  return (
    <div className="space-y-3">
      {populated.map((cat) => (
        <CategorySection
          key={cat}
          category={cat}
          metrics={grouped.get(cat) || []}
          onEdit={onEdit}
          onArchive={onArchive}
          onDelete={onDelete}
          onRecord={onRecord}
          onViewHistory={onViewHistory}
          isArchiving={isArchiving}
          isDeleting={isDeleting}
        />
      ))}
    </div>
  );
}

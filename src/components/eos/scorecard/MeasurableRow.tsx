import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MoreVertical, Edit2, Trash2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MeasurableWithEntries, ComparisonType } from '@/types/seatScorecard';
import { COMPARISON_SYMBOLS, COMPARISON_LABELS } from '@/types/seatScorecard';

interface MeasurableRowProps {
  measurable: MeasurableWithEntries;
  canEdit: boolean;
  onUpdate: (id: string, updates: Partial<MeasurableWithEntries>) => void;
  onDelete: (id: string) => void;
}

export function MeasurableRow({
  measurable,
  canEdit,
  onUpdate,
  onDelete,
}: MeasurableRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(measurable.name);
  const [editTarget, setEditTarget] = useState(measurable.target_value.toString());
  const [editComparison, setEditComparison] = useState<ComparisonType>(measurable.comparison_type);
  const [editUnit, setEditUnit] = useState(measurable.unit || '');

  const handleSave = () => {
    onUpdate(measurable.id, {
      name: editName.trim(),
      target_value: parseFloat(editTarget),
      comparison_type: editComparison,
      unit: editUnit.trim() || undefined,
    });
    setIsEditing(false);
  };

  const latestEntry = measurable.latestEntry;
  const isOnTrack = latestEntry?.status === 'On Track';
  const trend = measurable.weeklyTrend;
  
  // Calculate trend direction (comparing last 4 weeks)
  const recentOnTrack = trend.slice(0, 4).filter(s => s === 'On Track').length;
  const trendDirection = recentOnTrack >= 3 ? 'up' : recentOnTrack <= 1 ? 'down' : 'stable';

  return (
    <>
      <div className={cn(
        "flex items-center gap-4 p-3 rounded-lg border",
        !measurable.is_active && "opacity-50 bg-muted/30"
      )}>
        {/* Name and target */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{measurable.name}</span>
            {!measurable.is_active && (
              <Badge variant="outline" className="text-xs">Inactive</Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            Target: {COMPARISON_SYMBOLS[measurable.comparison_type]} {measurable.target_value}
            {measurable.unit && ` ${measurable.unit}`}
          </div>
        </div>

        {/* Latest value */}
        <div className="text-right min-w-[100px]">
          {latestEntry ? (
            <>
              <div className={cn(
                "text-lg font-bold",
                isOnTrack ? "text-primary" : "text-destructive"
              )}>
                {latestEntry.actual_value}
                {measurable.unit && <span className="text-sm ml-1">{measurable.unit}</span>}
              </div>
              <Badge variant={isOnTrack ? "default" : "destructive"} className="text-xs">
                {latestEntry.status}
              </Badge>
            </>
          ) : (
            <span className="text-muted-foreground text-sm">No data</span>
          )}
        </div>

        {/* Trend indicator */}
        <div className="flex items-center gap-1 min-w-[60px]">
          {trend.length > 0 && (
            <>
              {trendDirection === 'up' && (
                <TrendingUp className="h-5 w-5 text-primary" />
              )}
              {trendDirection === 'down' && (
                <TrendingDown className="h-5 w-5 text-destructive" />
              )}
              {trendDirection === 'stable' && (
                <Minus className="h-5 w-5 text-muted-foreground" />
              )}
            </>
          )}
        </div>

        {/* Mini trend dots */}
        <div className="flex gap-0.5">
          {trend.slice(0, 8).map((status, i) => (
            <div
              key={i}
              className={cn(
                "w-2 h-2 rounded-full",
                status === 'On Track' 
                  ? "bg-primary" 
                  : "bg-destructive"
              )}
              title={`Week -${i}: ${status}`}
            />
          ))}
          {trend.length === 0 && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </div>

        {/* Actions */}
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onUpdate(measurable.id, { is_active: !measurable.is_active })}
              >
                {measurable.is_active ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => onDelete(measurable.id)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Measurable</DialogTitle>
            <DialogDescription>
              Update the measurable definition.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g., Weekly sales calls completed"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Comparison</Label>
                <Select value={editComparison} onValueChange={(v) => setEditComparison(v as ComparisonType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=">=">{COMPARISON_LABELS['>=']}</SelectItem>
                    <SelectItem value="<=">{COMPARISON_LABELS['<=']}</SelectItem>
                    <SelectItem value="=">{COMPARISON_LABELS['=']}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Target</Label>
                <Input
                  type="number"
                  value={editTarget}
                  onChange={(e) => setEditTarget(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Unit (optional)</Label>
                <Input
                  value={editUnit}
                  onChange={(e) => setEditUnit(e.target.value)}
                  placeholder="e.g., %, calls"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!editName.trim() || !editTarget}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

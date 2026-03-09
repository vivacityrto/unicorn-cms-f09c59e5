import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { useVivacityTeamUsers } from '@/hooks/useVivacityTeamUsers';
import { useTenantUsers } from '@/hooks/useTenantUsers';
import { useAuth } from '@/hooks/useAuth';
import {
  METRIC_CATEGORIES,
  METRIC_UNITS,
  METRIC_TEMPLATES,
  DIRECTION_LABELS,
  DIRECTION_PREVIEW,
} from '@/types/scorecard';
import type { ScorecardMetric, MetricDirection, MetricSource, MetricCategory } from '@/types/scorecard';

interface MetricEditorDialogV2Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metric?: ScorecardMetric | null;
  onSave: (payload: Partial<ScorecardMetric> & { id?: string }) => void;
  isSaving?: boolean;
  existingNames?: string[];
}

const DIRECTION_OPTIONS: { value: MetricDirection; label: string }[] = [
  { value: 'higher_is_better', label: 'Higher is better' },
  { value: 'lower_is_better', label: 'Lower is better' },
  { value: 'equals_target', label: 'Must equal target' },
];

const SOURCE_OPTIONS: { value: MetricSource; label: string; desc: string }[] = [
  { value: 'manual', label: 'Manual', desc: 'You enter results each week' },
  { value: 'automatic', label: 'Automatic', desc: 'System calculates from Unicorn data' },
  { value: 'hybrid', label: 'Hybrid', desc: 'System prefills, you can override' },
];

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-2">
      <Separator className="mb-3" />
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{children}</p>
    </div>
  );
}

export function MetricEditorDialogV2({
  open,
  onOpenChange,
  metric,
  onSave,
  isSaving,
  existingNames = [],
}: MetricEditorDialogV2Props) {
  const { profile } = useAuth();
  const isEditing = !!metric;

  // Determine which user list to show
  const isVivacityTeam = ['Super Admin', 'Team Leader', 'Team Member'].includes(
    profile?.unicorn_role || '',
  );
  const { data: vivacityUsers = [] } = useVivacityTeamUsers();
  const { users: tenantUsers = [] } = useTenantUsers();
  const users = isVivacityTeam ? vivacityUsers : tenantUsers;

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MetricCategory>('Delivery');
  const [ownerId, setOwnerId] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('Count');
  const [direction, setDirection] = useState<MetricDirection>('higher_is_better');
  const [exampleResult, setExampleResult] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [metricSource, setMetricSource] = useState<MetricSource>('manual');
  const [metricKey, setMetricKey] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isArchived, setIsArchived] = useState(false);
  const [dupWarning, setDupWarning] = useState('');

  const reset = useCallback(() => {
    setName('');
    setDescription('');
    setCategory('Delivery');
    setOwnerId('');
    setTargetValue('');
    setUnit('Count');
    setDirection('higher_is_better');
    setExampleResult('');
    setFrequency('weekly');
    setMetricSource('manual');
    setMetricKey('');
    setIsActive(true);
    setIsArchived(false);
    setDupWarning('');
  }, []);

  useEffect(() => {
    if (!open) return;
    if (metric) {
      setName(metric.name || '');
      setDescription(metric.description || '');
      setCategory((metric.category as MetricCategory) || 'Delivery');
      setOwnerId(metric.owner_id || '');
      setTargetValue(String(metric.target_value ?? ''));
      setUnit(metric.unit || 'Count');
      setDirection(metric.direction || 'higher_is_better');
      setExampleResult(metric.example_result || '');
      setFrequency(metric.frequency || 'weekly');
      setMetricSource(metric.metric_source || 'manual');
      setMetricKey(metric.metric_key || '');
      setIsActive(metric.is_active);
      setIsArchived(metric.is_archived);
      setDupWarning('');
    } else {
      reset();
    }
  }, [metric, open, reset]);

  // Duplicate check
  useEffect(() => {
    if (!name.trim()) { setDupWarning(''); return; }
    const lower = name.toLowerCase().trim();
    const dups = existingNames.filter(
      (n) => n.toLowerCase().trim() === lower && (!metric || n !== metric.name),
    );
    setDupWarning(dups.length > 0 ? `A metric named "${name}" already exists.` : '');
  }, [name, existingNames, metric]);

  const applyTemplate = (tplName: string) => {
    const tpl = METRIC_TEMPLATES.find((t) => t.name === tplName);
    if (!tpl) return;
    setName(tpl.name);
    setDescription(tpl.description);
    setCategory(tpl.category);
    setUnit(tpl.unit);
    setDirection(tpl.direction);
    setMetricSource(tpl.metric_source);
    setMetricKey(tpl.metric_key || '');
    setExampleResult(tpl.example_result || '');
    if (tpl.defaultTarget) setTargetValue(String(tpl.defaultTarget));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && isValid) handleSubmit();
    if (e.key === 'Escape') onOpenChange(false);
  };

  const isValid = !!name.trim() && !!targetValue && !dupWarning;

  const handleSubmit = () => {
    if (!isValid) return;
    onSave({
      id: metric?.id,
      name: name.trim(),
      description: description.trim() || undefined,
      category,
      owner_id: ownerId || undefined,
      target_value: parseFloat(targetValue),
      unit,
      direction,
      example_result: exampleResult.trim() || undefined,
      frequency,
      metric_source: metricSource,
      metric_key: metricKey.trim() || undefined,
      is_active: isActive,
      is_archived: isArchived,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Metric' : 'Add New Metric'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update this scorecard metric definition.' : 'Define a new EOS scorecard metric.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pb-2">
          {/* ─── Metric Definition ─── */}
          <SectionHeading>Metric Definition</SectionHeading>

          {!isEditing && (
            <div>
              <Label>Use a template</Label>
              <Select onValueChange={applyTemplate}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="— Select a template to pre-fill —" />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_TEMPLATES.map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.name}
                      <span className="text-xs text-muted-foreground ml-2">({t.category})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="metric-name">Metric Name *</Label>
            <Input
              id="metric-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Qualified Leads"
              className="mt-1"
              autoFocus
            />
            {dupWarning && (
              <p className="text-xs text-destructive mt-1">{dupWarning}</p>
            )}
          </div>

          <div>
            <Label htmlFor="metric-description">Description</Label>
            <Textarea
              id="metric-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this metric measure?"
              rows={2}
              className="mt-1 resize-none"
            />
          </div>

          {/* ─── Ownership ─── */}
          <SectionHeading>Ownership</SectionHeading>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Owner</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users.map((u: { user_uuid: string; first_name?: string; last_name?: string; email?: string }) => (
                    <SelectItem key={u.user_uuid} value={u.user_uuid}>
                      {u.first_name || u.last_name
                        ? `${u.first_name || ''} ${u.last_name || ''}`.trim()
                        : u.email || u.user_uuid}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as MetricCategory)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ─── Target Settings ─── */}
          <SectionHeading>Target Settings</SectionHeading>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="target-value">Weekly Target *</Label>
              <Input
                id="target-value"
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="0"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Success Condition</Label>
            <p className="text-xs text-muted-foreground mb-1.5">Determines red / green status automatically</p>
            <Select value={direction} onValueChange={(v) => setDirection(v as MetricDirection)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIRECTION_OPTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-primary mt-1.5">{DIRECTION_PREVIEW[direction]}</p>
          </div>

          <div>
            <Label htmlFor="example-result">Example Result</Label>
            <Input
              id="example-result"
              value={exampleResult}
              onChange={(e) => setExampleResult(e.target.value)}
              placeholder="e.g., 12 leads, $8,500, 85%"
              className="mt-1"
            />
          </div>

          {/* ─── Reporting ─── */}
          <SectionHeading>Reporting</SectionHeading>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Metric Source</Label>
              <Select value={metricSource} onValueChange={(v) => setMetricSource(v as MetricSource)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      <div>
                        <span>{s.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">{s.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(metricSource === 'automatic' || metricSource === 'hybrid') && (
            <div>
              <Label htmlFor="metric-key">Metric Key</Label>
              <Input
                id="metric-key"
                value={metricKey}
                onChange={(e) => setMetricKey(e.target.value)}
                placeholder="e.g., qualified_leads_count"
                className="mt-1 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Identifies the automation logic for this metric.
              </p>
            </div>
          )}

          {/* ─── Lifecycle ─── */}
          {isEditing && (
            <>
              <SectionHeading>Lifecycle</SectionHeading>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Active</Label>
                    <p className="text-xs text-muted-foreground">Inactive metrics are hidden from dashboards</p>
                  </div>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Archived</Label>
                    <p className="text-xs text-muted-foreground">
                      Archived metrics keep history but do not appear on active scorecards
                    </p>
                  </div>
                  <Switch checked={isArchived} onCheckedChange={setIsArchived} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSaving}>
            {isSaving ? (isEditing ? 'Saving…' : 'Creating…') : (isEditing ? 'Save Changes' : 'Create Metric')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

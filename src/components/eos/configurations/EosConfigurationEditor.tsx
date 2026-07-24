import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useEosConfigurations,
  useEosConfigurationSegments,
  useEosSeatOptions,
} from '@/hooks/useEosConfigurations';
import { usePermission } from '@/hooks/usePermission';
import { CustomPermissionTooltip } from '@/components/eos/PermissionTooltip';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, GripVertical, Plus, Trash2, AlertTriangle, Eye } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EosConfigSegmentType, EosConfigurationSegment, EosConfiguration } from '@/types/eos';

const SEGMENT_TYPE_OPTIONS: { value: EosConfigSegmentType; label: string }[] = [
  { value: 'segue', label: 'Segue' },
  { value: 'scorecard', label: 'Scorecard' },
  { value: 'rocks', label: 'Rocks' },
  { value: 'headlines', label: 'Headlines' },
  { value: 'todos', label: 'To-Dos' },
  { value: 'ids', label: 'IDS' },
  { value: 'conclude', label: 'Conclude' },
  { value: 'general', label: 'General' },
];

const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
  { value: 'on_demand', label: 'On demand' },
];

const ROCKS_SCOPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'company', label: 'Company' },
  { value: 'team', label: 'Team' },
  { value: 'individual', label: 'Individual' },
];

const MEETING_TYPE_LABEL: Record<string, string> = {
  L10: 'Level 10',
  Quarterly: 'Quarterly',
  Annual: 'Annual',
  Same_Page: 'Same Page',
};

interface SortableSegmentRowProps {
  segment: EosConfigurationSegment;
  isSelected: boolean;
  canManage: boolean;
  onClick: () => void;
  onRemove: () => void;
}

function SortableSegmentRow({ segment, isSelected, canManage, onClick, onRemove }: SortableSegmentRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: segment.id,
    disabled: !canManage,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`flex items-center gap-2 p-3 rounded-lg border transition-colors cursor-pointer group ${
        isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50 border-border'
      }`}
    >
      {canManage && (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-medium shrink-0">
        {segment.sequence_order}
      </div>
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm truncate block">{segment.label}</span>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className="text-xs capitalize">{segment.segment_type}</Badge>
          <span className="text-xs text-muted-foreground">{segment.duration_minutes} min</span>
        </div>
      </div>
      {canManage && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </Button>
      )}
    </div>
  );
}

export function EosConfigurationEditor() {
  const { id } = useParams<{ id: string }>();
  const configId = id ? parseInt(id) : undefined;
  const navigate = useNavigate();
  const canManage = usePermission('eos.configurations.manage', 'full');

  const { configurations, isLoading: configLoading, updateConfiguration } = useEosConfigurations();
  const config = configurations?.find((c) => c.id === configId);

  const { segments, isLoading: segmentsLoading, updateSegment, addSegment, removeSegment, reorderSegments } =
    useEosConfigurationSegments(configId);
  const { seats } = useEosSeatOptions();

  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);
  const [segmentToRemove, setSegmentToRemove] = useState<number | null>(null);
  const [newSegmentLabel, setNewSegmentLabel] = useState('');
  const [newSegmentType, setNewSegmentType] = useState<EosConfigSegmentType>('general');
  const [newSegmentDuration, setNewSegmentDuration] = useState(10);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const selectedSegment = segments?.find((s) => s.id === selectedSegmentId);

  useEffect(() => {
    if (segmentToRemove !== null) {
      removeSegment.mutate(segmentToRemove);
      if (selectedSegmentId === segmentToRemove) setSelectedSegmentId(null);
      setSegmentToRemove(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentToRemove]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !segments) return;

    const oldIndex = segments.findIndex((s) => s.id === active.id);
    const newIndex = segments.findIndex((s) => s.id === over.id);
    const newOrder = arrayMove(segments, oldIndex, newIndex);
    reorderSegments.mutate(newOrder.map((s) => s.id));
  };

  const handleAddSegment = () => {
    if (!newSegmentLabel.trim()) return;
    addSegment.mutate(
      { label: newSegmentLabel.trim(), segment_type: newSegmentType, duration_minutes: newSegmentDuration },
      { onSuccess: () => setNewSegmentLabel('') },
    );
  };

  if (configLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="flex gap-4">
          <Skeleton className="w-80 h-96" />
          <Skeleton className="flex-1 h-96" />
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-center">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Configuration Not Found</h2>
        <Button onClick={() => navigate('/eos/configurations')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Configurations
        </Button>
      </div>
    );
  }

  const totalDuration = segments?.reduce((sum, s) => sum + s.duration_minutes, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/eos/configurations')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">{MEETING_TYPE_LABEL[config.meeting_type] ?? config.meeting_type} Configuration</h1>
            <p className="text-sm text-muted-foreground">
              {segments?.length ?? 0} segments, {totalDuration} min total
            </p>
          </div>
        </div>
        {!canManage && (
          <Badge variant="outline" className="text-xs">
            Read-only — Super Admin or Integrator can edit
          </Badge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        {/* Segment list */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Agenda Segments</CardTitle>
            </div>
            <CardDescription className="text-xs">Drag to reorder. Click to edit.</CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <ScrollArea className="h-[420px]">
              {segmentsLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={(segments ?? []).map((s) => s.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {(segments ?? []).map((segment) => (
                        <SortableSegmentRow
                          key={segment.id}
                          segment={segment}
                          isSelected={selectedSegmentId === segment.id}
                          canManage={canManage}
                          onClick={() => setSelectedSegmentId(segment.id)}
                          onRemove={() => setSegmentToRemove(segment.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </ScrollArea>

            {canManage && (
              <div className="mt-3 pt-3 border-t space-y-2">
                <Input
                  placeholder="New segment label"
                  value={newSegmentLabel}
                  onChange={(e) => setNewSegmentLabel(e.target.value)}
                />
                <div className="flex gap-2">
                  <Select value={newSegmentType} onValueChange={(v) => setNewSegmentType(v as EosConfigSegmentType)}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEGMENT_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={1}
                    className="w-20"
                    value={newSegmentDuration}
                    onChange={(e) => setNewSegmentDuration(parseInt(e.target.value) || 1)}
                  />
                </div>
                <Button size="sm" className="w-full" onClick={handleAddSegment} disabled={!newSegmentLabel.trim()}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Segment
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right panel */}
        <div className="space-y-4">
          <Tabs defaultValue={selectedSegment ? 'segment' : 'settings'} key={selectedSegment?.id ?? 'settings'}>
            <TabsList>
              <TabsTrigger value="settings">Configuration Settings</TabsTrigger>
              {selectedSegment && <TabsTrigger value="segment">{selectedSegment.label}</TabsTrigger>}
              <TabsTrigger value="preview">
                <Eye className="h-3.5 w-3.5 mr-1" />
                Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="settings" className="mt-4">
              <ConfigurationSettingsPanel
                config={config}
                seats={seats ?? []}
                canManage={canManage}
                onSave={(updates) => updateConfiguration.mutate({ id: config.id, ...updates })}
              />
            </TabsContent>

            {selectedSegment && (
              <TabsContent value="segment" className="mt-4">
                <SegmentDetailPanel
                  segment={selectedSegment}
                  canManage={canManage}
                  onSave={(updates) => updateSegment.mutate({ id: selectedSegment.id, ...updates })}
                />
              </TabsContent>
            )}

            <TabsContent value="preview" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Agenda Preview</CardTitle>
                  <CardDescription>What this Configuration will render as, in segment order.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(segments ?? []).map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">{s.segment_type}</Badge>
                        <span>{s.label}</span>
                      </div>
                      <span className="text-muted-foreground text-xs">{s.duration_minutes} min</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function ConfigurationSettingsPanel({
  config,
  seats,
  canManage,
  onSave,
}: {
  config: EosConfiguration;
  seats: { id: string; seat_name: string; holder_name: string | null }[];
  canManage: boolean;
  onSave: (updates: Partial<EosConfiguration>) => void;
}) {
  const [frequency, setFrequency] = useState(config.frequency);
  const [participantModel, setParticipantModel] = useState(config.participant_model);
  const [facilitatorSeatId, setFacilitatorSeatId] = useState(config.facilitator_seat_id ?? '');
  const [requiredSeatIds, setRequiredSeatIds] = useState<string[]>(config.required_seat_ids ?? []);
  const [scorecardCap, setScorecardCap] = useState(config.scorecard_metric_cap);
  const [rocksScope, setRocksScope] = useState<string[]>(config.rocks_scope ?? []);

  useEffect(() => {
    setFrequency(config.frequency);
    setParticipantModel(config.participant_model);
    setFacilitatorSeatId(config.facilitator_seat_id ?? '');
    setRequiredSeatIds(config.required_seat_ids ?? []);
    setScorecardCap(config.scorecard_metric_cap);
    setRocksScope(config.rocks_scope ?? []);
  }, [config]);

  const dirty =
    frequency !== config.frequency ||
    participantModel !== config.participant_model ||
    facilitatorSeatId !== (config.facilitator_seat_id ?? '') ||
    JSON.stringify(requiredSeatIds) !== JSON.stringify(config.required_seat_ids ?? []) ||
    scorecardCap !== config.scorecard_metric_cap ||
    JSON.stringify(rocksScope) !== JSON.stringify(config.rocks_scope ?? []);

  const content = (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Configuration Settings</CardTitle>
        <CardDescription>Frequency, facilitator, participants, and per-widget limits.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Frequency</Label>
          <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)} disabled={!canManage}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Facilitator Seat</Label>
          <Select value={facilitatorSeatId} onValueChange={setFacilitatorSeatId} disabled={!canManage}>
            <SelectTrigger><SelectValue placeholder="No seat selected" /></SelectTrigger>
            <SelectContent>
              {seats.map((seat) => (
                <SelectItem key={seat.id} value={seat.id}>
                  {seat.seat_name}{seat.holder_name ? ` — ${seat.holder_name}` : ' (vacant)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Auto-fills as Leader on each generated occurrence, resolved live from whoever holds this seat.
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>Participant Model</Label>
          <RadioGroup value={participantModel} onValueChange={(v) => setParticipantModel(v as typeof participantModel)} disabled={!canManage}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="whole_roster" id="whole_roster" />
              <Label htmlFor="whole_roster" className="font-normal">Whole roster (all active Vivacity staff)</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="required_seats" id="required_seats" />
              <Label htmlFor="required_seats" className="font-normal">Required seats only</Label>
            </div>
          </RadioGroup>
        </div>

        {participantModel === 'required_seats' && (
          <div className="space-y-2 pl-6">
            <Label className="text-xs text-muted-foreground">Required seats</Label>
            {seats.map((seat) => (
              <div key={seat.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`seat-${seat.id}`}
                  checked={requiredSeatIds.includes(seat.id)}
                  disabled={!canManage}
                  onCheckedChange={(checked) =>
                    setRequiredSeatIds((prev) =>
                      checked ? [...prev, seat.id] : prev.filter((id) => id !== seat.id),
                    )
                  }
                />
                <Label htmlFor={`seat-${seat.id}`} className="font-normal text-sm">
                  {seat.seat_name}{seat.holder_name ? ` — ${seat.holder_name}` : ' (vacant)'}
                </Label>
              </div>
            ))}
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <Label>Scorecard metric cap</Label>
          <Input
            type="number"
            min={1}
            className="w-24"
            value={scorecardCap}
            disabled={!canManage}
            onChange={(e) => setScorecardCap(parseInt(e.target.value) || 1)}
          />
          <p className="text-xs text-muted-foreground">
            Maximum number of scorecard metrics shown during this meeting type.
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <Label>Rocks scope</Label>
          {ROCKS_SCOPE_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-center space-x-2">
              <Checkbox
                id={`rocks-scope-${opt.value}`}
                checked={rocksScope.includes(opt.value)}
                disabled={!canManage}
                onCheckedChange={(checked) =>
                  setRocksScope((prev) =>
                    checked ? [...prev, opt.value] : prev.filter((v) => v !== opt.value),
                  )
                }
              />
              <Label htmlFor={`rocks-scope-${opt.value}`} className="font-normal text-sm">
                {opt.label}
              </Label>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Rock levels shown during this meeting type's Rocks segment. None selected shows all levels.
          </p>
        </div>

        {canManage && (
          <Button
            disabled={!dirty}
            onClick={() =>
              onSave({
                frequency,
                participant_model: participantModel,
                facilitator_seat_id: facilitatorSeatId || null,
                required_seat_ids: requiredSeatIds,
                scorecard_metric_cap: scorecardCap,
                rocks_scope: rocksScope,
              } as any)
            }
          >
            Save Settings
          </Button>
        )}
      </CardContent>
    </Card>
  );

  if (canManage) return content;

  return (
    <CustomPermissionTooltip hasAccess={false} message="Editing Configurations requires Super Admin or Integrator access.">
      <div className="opacity-70 pointer-events-none">{content}</div>
    </CustomPermissionTooltip>
  );
}

function SegmentDetailPanel({
  segment,
  canManage,
  onSave,
}: {
  segment: EosConfigurationSegment;
  canManage: boolean;
  onSave: (updates: Partial<EosConfigurationSegment>) => void;
}) {
  const [label, setLabel] = useState(segment.label);
  const [segmentType, setSegmentType] = useState(segment.segment_type);
  const [duration, setDuration] = useState(segment.duration_minutes);

  useEffect(() => {
    setLabel(segment.label);
    setSegmentType(segment.segment_type);
    setDuration(segment.duration_minutes);
  }, [segment]);

  const dirty = label !== segment.label || segmentType !== segment.segment_type || duration !== segment.duration_minutes;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Segment Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} disabled={!canManage} />
        </div>
        <div className="space-y-2">
          <Label>Segment Type</Label>
          <Select value={segmentType} onValueChange={(v) => setSegmentType(v as EosConfigSegmentType)} disabled={!canManage}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEGMENT_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Determines which live-meeting widget this segment renders (Scorecard, Rocks, etc.) — a structural
            binding, not a name match.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Duration (minutes)</Label>
          <Input
            type="number"
            min={1}
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value) || 1)}
            disabled={!canManage}
          />
        </div>
        {canManage && (
          <Button disabled={!dirty} onClick={() => onSave({ label, segment_type: segmentType, duration_minutes: duration })}>
            Save Segment
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

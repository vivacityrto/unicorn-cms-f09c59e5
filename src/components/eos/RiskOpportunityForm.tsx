import { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Lightbulb } from 'lucide-react';
import { useEosRocks } from '@/hooks/useEos';
import { 
  useEosStatusOptions, 
  useEosCategoryOptions, 
  useEosImpactOptions,
  useEosTypeOptions,
  useEosQuarterOptions,
  useEosYearOptions,
  useEosStatusTransitions,
  getAllowedStatusTransitions,
} from '@/hooks/useEosOptions';
import { formatQuarterLabel, formatTypeLabel } from '@/lib/eosOptionLabels';
import type { 
  RiskOpportunityType, 
  RiskOpportunityCategory, 
  RiskOpportunityImpact,
  RiskOpportunityStatus,
} from '@/types/risksOpportunities';

export type FormContext = 'ro_page' | 'meeting_ids';

export interface RiskOpportunityFormData {
  item_type: RiskOpportunityType;
  title: string;
  description: string;
  why_it_matters?: string;
  category: RiskOpportunityCategory | '' | null;
  impact: RiskOpportunityImpact | '' | null;
  status?: RiskOpportunityStatus;
  quarter_number?: number;
  quarter_year?: number;
  linked_rock_id: string | null;
  meeting_id?: string;
  meeting_segment_id?: string;
  source?: string;
}

interface RiskOpportunityFormProps {
  /** Initial values for the form */
  initialValues?: Partial<RiskOpportunityFormData>;
  /** Called when form is submitted with valid data */
  onSubmit: (data: RiskOpportunityFormData) => Promise<void>;
  /** Called when form is cancelled */
  onCancel: () => void;
  /** Whether the form is currently submitting */
  isSubmitting?: boolean;
  /** Hide the type selector (useful for IDS where it's always 'risk') */
  hideTypeSelector?: boolean;
  /** Submit button text */
  submitLabel?: string;
  /** Context determines which fields are shown and behavior */
  context?: FormContext;
  /** Show status selector (for edit mode) */
  showStatusSelector?: boolean;
  /** Current status of the item (for transition validation) */
  currentStatus?: RiskOpportunityStatus;
}

export function RiskOpportunityForm({
  initialValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
  hideTypeSelector = false,
  submitLabel = 'Create',
  context = 'ro_page',
  showStatusSelector = false,
  currentStatus,
}: RiskOpportunityFormProps) {
  const { rocks } = useEosRocks();
  
  // Fetch all options from database
  const { data: statusOptions = [] } = useEosStatusOptions();
  const { data: categoryOptions = [] } = useEosCategoryOptions();
  const { data: impactOptions = [] } = useEosImpactOptions();
  const { data: typeOptions = [] } = useEosTypeOptions();
  const { data: quarterOptions = [] } = useEosQuarterOptions();
  const { data: yearOptions = [] } = useEosYearOptions();
  const { data: statusTransitions } = useEosStatusTransitions();
  
  const [formData, setFormData] = useState<RiskOpportunityFormData>({
    item_type: initialValues?.item_type || 'risk',
    title: initialValues?.title || '',
    description: initialValues?.description || '',
    why_it_matters: initialValues?.why_it_matters || '',
    category: initialValues?.category || '',
    impact: initialValues?.impact || '',
    status: initialValues?.status,
    quarter_number: initialValues?.quarter_number,
    quarter_year: initialValues?.quarter_year,
    linked_rock_id: initialValues?.linked_rock_id || '',
    meeting_id: initialValues?.meeting_id,
    meeting_segment_id: initialValues?.meeting_segment_id,
    source: initialValues?.source || (context === 'meeting_ids' ? 'meeting_ids' : 'ro_page'),
  });

  // Calculate allowed status options based on current status
  const allowedStatusOptions = useMemo(() => {
    // If no current status, show all options (for new items)
    if (!currentStatus) {
      return statusOptions;
    }
    
    // Get allowed transitions from current status
    const allowedTargets = getAllowedStatusTransitions(statusTransitions, currentStatus);
    
    // Include current status (no-op transition) and all allowed targets
    const allowed = new Set([currentStatus, ...allowedTargets]);
    
    return statusOptions.filter(status => allowed.has(status));
  }, [statusOptions, statusTransitions, currentStatus]);

  // Update form when initial values change
  useEffect(() => {
    if (initialValues) {
      setFormData(prev => ({
        ...prev,
        item_type: initialValues.item_type || prev.item_type,
        title: initialValues.title ?? prev.title,
        description: initialValues.description ?? prev.description,
        why_it_matters: initialValues.why_it_matters ?? prev.why_it_matters,
        category: initialValues.category ?? prev.category,
        impact: initialValues.impact ?? prev.impact,
        status: initialValues.status ?? prev.status,
        quarter_number: initialValues.quarter_number ?? prev.quarter_number,
        quarter_year: initialValues.quarter_year ?? prev.quarter_year,
        linked_rock_id: initialValues.linked_rock_id ?? prev.linked_rock_id,
        meeting_id: initialValues.meeting_id ?? prev.meeting_id,
        meeting_segment_id: initialValues.meeting_segment_id ?? prev.meeting_segment_id,
        source: initialValues.source ?? prev.source,
      }));
    }
  }, [initialValues]);

  const handleSubmit = async () => {
    if (!formData.title.trim()) return;
    await onSubmit(formData);
  };

  const isValid = formData.title.trim().length > 0;
  
  // In meeting context, hide quarter/year fields as they're less relevant for IDS
  const showQuarterYear = context !== 'meeting_ids';

  return (
    <div className="space-y-4">
      {/* Type Selector */}
      {!hideTypeSelector && (
        <div className="space-y-2">
          <Label>Type *</Label>
          <Select 
            value={formData.item_type} 
            onValueChange={(v) => setFormData({ ...formData, item_type: v as RiskOpportunityType })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map(type => (
                <SelectItem key={type} value={type}>
                  <div className="flex items-center gap-2">
                    {type === 'risk' ? (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Lightbulb className="w-4 h-4 text-emerald-500" />
                    )}
                    {formatTypeLabel(type)}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Title */}
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input 
          placeholder="Short, specific statement..."
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />
      </div>

      {/* Detail/Description */}
      <div className="space-y-2">
        <Label>Detail</Label>
        <Textarea 
          placeholder="What is happening. Any relevant context or background."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      {/* Why It Matters */}
      <div className="space-y-2">
        <Label>Why It Matters</Label>
        <Textarea 
          placeholder="What is the potential impact if this is ignored? Why should we address this?"
          value={formData.why_it_matters || ''}
          onChange={(e) => setFormData({ ...formData, why_it_matters: e.target.value })}
          rows={2}
        />
      </div>

      {/* Status (only shown in edit mode) - filtered by allowed transitions */}
      {showStatusSelector && (
        <div className="space-y-2">
          <Label>Status</Label>
          <Select 
            value={formData.status || '__none__'} 
            onValueChange={(v) => setFormData({ ...formData, status: v === '__none__' ? undefined : v as RiskOpportunityStatus })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {allowedStatusOptions.map(status => (
                <SelectItem key={status} value={status}>{status}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currentStatus && allowedStatusOptions.length <= 1 && (
            <p className="text-xs text-muted-foreground">
              No status transitions available from "{currentStatus}"
            </p>
          )}
        </div>
      )}

      {/* Category & Impact */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select 
            value={formData.category || '__none__'} 
            onValueChange={(v) => setFormData({ ...formData, category: v === '__none__' ? '' : v as RiskOpportunityCategory })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select...</SelectItem>
              {categoryOptions.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Impact</Label>
          <Select 
            value={formData.impact || '__none__'} 
            onValueChange={(v) => setFormData({ ...formData, impact: v === '__none__' ? '' : v as RiskOpportunityImpact })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select...</SelectItem>
              {impactOptions.map(imp => (
                <SelectItem key={imp} value={imp}>{imp}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quarter & Year - Hidden in meeting context */}
      {showQuarterYear && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Quarter</Label>
            <Select 
              value={formData.quarter_number?.toString() || '__none__'} 
              onValueChange={(v) => setFormData({ ...formData, quarter_number: v === '__none__' ? undefined : parseInt(v) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select...</SelectItem>
                {quarterOptions.map(q => (
                  <SelectItem key={q} value={q.toString()}>{formatQuarterLabel(q)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Year</Label>
            <Select 
              value={formData.quarter_year?.toString() || '__none__'} 
              onValueChange={(v) => setFormData({ ...formData, quarter_year: v === '__none__' ? undefined : parseInt(v) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select...</SelectItem>
                {yearOptions.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Linked Rock */}
      <div className="space-y-2">
        <Label>Linked Rock</Label>
        <Select 
          value={formData.linked_rock_id || '__none__'} 
          onValueChange={(v) => setFormData({ ...formData, linked_rock_id: v === '__none__' ? '' : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {rocks?.map(rock => (
              <SelectItem key={rock.id} value={rock.id}>{rock.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          disabled={!isValid || isSubmitting}
        >
          {isSubmitting ? 'Creating...' : submitLabel}
        </Button>
      </div>
    </div>
  );
}

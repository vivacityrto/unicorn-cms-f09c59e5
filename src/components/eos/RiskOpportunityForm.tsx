import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Lightbulb } from 'lucide-react';
import { useEosRocks } from '@/hooks/useEos';
import { 
  CATEGORIES, 
  IMPACTS, 
  type RiskOpportunityType, 
  type RiskOpportunityCategory, 
  type RiskOpportunityImpact 
} from '@/types/risksOpportunities';

export interface RiskOpportunityFormData {
  item_type: RiskOpportunityType;
  title: string;
  description: string;
  category: RiskOpportunityCategory | '';
  impact: RiskOpportunityImpact | '';
  quarter_number?: number;
  quarter_year?: number;
  linked_rock_id: string;
  meeting_id?: string;
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
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];

export function RiskOpportunityForm({
  initialValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
  hideTypeSelector = false,
  submitLabel = 'Create',
}: RiskOpportunityFormProps) {
  const { rocks } = useEosRocks();
  
  const [formData, setFormData] = useState<RiskOpportunityFormData>({
    item_type: initialValues?.item_type || 'risk',
    title: initialValues?.title || '',
    description: initialValues?.description || '',
    category: initialValues?.category || '',
    impact: initialValues?.impact || '',
    quarter_number: initialValues?.quarter_number,
    quarter_year: initialValues?.quarter_year,
    linked_rock_id: initialValues?.linked_rock_id || '',
    meeting_id: initialValues?.meeting_id,
  });

  // Update form when initial values change
  useEffect(() => {
    if (initialValues) {
      setFormData(prev => ({
        ...prev,
        item_type: initialValues.item_type || prev.item_type,
        title: initialValues.title ?? prev.title,
        description: initialValues.description ?? prev.description,
        category: initialValues.category ?? prev.category,
        impact: initialValues.impact ?? prev.impact,
        quarter_number: initialValues.quarter_number ?? prev.quarter_number,
        quarter_year: initialValues.quarter_year ?? prev.quarter_year,
        linked_rock_id: initialValues.linked_rock_id ?? prev.linked_rock_id,
        meeting_id: initialValues.meeting_id ?? prev.meeting_id,
      }));
    }
  }, [initialValues]);

  const handleSubmit = async () => {
    if (!formData.title.trim()) return;
    await onSubmit(formData);
  };

  const isValid = formData.title.trim().length > 0;

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
              <SelectItem value="risk">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  Risk
                </div>
              </SelectItem>
              <SelectItem value="opportunity">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-success" />
                  Opportunity
                </div>
              </SelectItem>
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
          placeholder="What is happening. Why it matters. Impact if ignored."
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

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
              {CATEGORIES.map(cat => (
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
              {IMPACTS.map(imp => (
                <SelectItem key={imp} value={imp}>{imp}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quarter & Year */}
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
              <SelectItem value="1">Q1</SelectItem>
              <SelectItem value="2">Q2</SelectItem>
              <SelectItem value="3">Q3</SelectItem>
              <SelectItem value="4">Q4</SelectItem>
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
              {YEARS.map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
